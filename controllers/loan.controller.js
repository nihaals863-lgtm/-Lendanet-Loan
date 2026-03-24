const db = require('../config/db');

// Create Loan and Generate Installments
exports.createLoan = async (req, res) => {
    try {
        const { borrowerId, amount, interestRate, issueDate, dueDate, type, installmentsCount, guarantorName, guarantorPhone, guarantorNrc } = req.body;
        const lenderId = req.user.id;

        // 1. Insert Loan
        const [loanResult] = await db.execute(
            'INSERT INTO loans (lender_id, borrower_id, amount, interest_rate, issue_date, due_date, type, guarantor_name, guarantor_phone, guarantor_nrc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [lenderId, borrowerId, amount, interestRate, issueDate, dueDate, type, guarantorName || null, guarantorPhone || null, guarantorNrc || null]
        );
        const loanId = loanResult.insertId;

        // 2. Generate Installments (Simple Monthly Breakdown)
        const totalAmount = parseFloat(amount) + (parseFloat(amount) * (parseFloat(interestRate) / 100));
        const installmentAmount = totalAmount / installmentsCount;
        
        for (let i = 1; i <= installmentsCount; i++) {
            const installmentDueDate = new Date(issueDate);
            installmentDueDate.setMonth(installmentDueDate.getMonth() + i);
            
            await db.execute(
                'INSERT INTO loan_installments (loan_id, due_date, amount) VALUES (?, ?, ?)',
                [loanId, installmentDueDate, installmentAmount]
            );
        }

        // 3. Add Audit Log
        await db.execute('INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)', 
            ['CREATE_LOAN', lenderId, 'loan', loanId, `Loan of K${amount} created for borrower ID: ${borrowerId}`]);

        res.status(201).json({ message: 'Loan created and installments generated', loanId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error creating loan' });
    }
};

// Add Payment
exports.addPayment = async (req, res) => {
    try {
        const { id } = req.params; // Loan ID
        const { amount, method, installmentId } = req.body;

        // 1. Add Payment Record
        await db.execute(
            'INSERT INTO payments (loan_id, installment_id, amount, method) VALUES (?, ?, ?, ?)',
            [id, installmentId || null, amount, method]
        );

        // 2. Update Installment Status if applicable
        if (installmentId) {
            await db.execute(
                'UPDATE loan_installments SET status = "paid", paid_amount = paid_amount + ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?',
                [amount, installmentId]
            );
        }

        // 3. Check if all paid → update loan status
        const [unpaid] = await db.execute('SELECT id FROM loan_installments WHERE loan_id = ? AND status = "pending"', [id]);
        if (unpaid.length === 0) {
            await db.execute('UPDATE loans SET status = "paid" WHERE id = ?', [id]);
        }

        // 4. Add Audit Log
        await db.execute('INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)', 
            ['ADD_PAYMENT', req.user.id, 'loan', id, `Payment of K${amount} added for loan ID: ${id}`]);

        res.json({ message: 'Payment added successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Undo Mark As Paid
exports.undoMarkAsPaid = async (req, res) => {
    try {
        const { id } = req.params; // Loan ID
        
        // 1. Update loan status back to active
        await db.execute('UPDATE loans SET status = "active" WHERE id = ?', [id]);

        // 2. Add Audit Log
        await db.execute('INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)', 
            ['UNDO_MARK_PAID', req.user.id, 'loan', id, `Undo 'paid' status for loan ID: ${id}`]);

        res.json({ message: 'Loan status reverted to active' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error reverting status' });
    }
};

// Mark Default (Logic: Based on configured system threshold)
exports.markDefault = async (req, res) => {
    try {
        const { id } = req.params; // Loan ID
        
        // 1. Mark as default
        await db.execute('UPDATE loans SET status = "default" WHERE id = ?', [id]);

        // 3. Add to shared ledger
        const [loanInfo] = await db.execute(
            'SELECT l.amount, b.nrc, l.lender_id FROM loans l JOIN borrowers b ON l.borrower_id = b.id WHERE l.id = ?', 
            [id]
        );
        
        await db.execute(
            'INSERT INTO default_ledger (nrc, loan_id, lender_id, amount) VALUES (?, ?, ?, ?)',
            [loanInfo[0].nrc, id, loanInfo[0].lender_id, loanInfo[0].amount]
        );

        // 4. Add Audit Log
        await db.execute('INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)', 
            ['MARK_DEFAULT', req.user.id, 'loan', id, `Loan ID: ${id} marked as default`]);

        res.json({ message: 'Loan marked as default and added to shared ledger' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get All Loans (for dashboard/filter)
exports.getLoans = async (req, res) => {
    try {
        const lenderId = req.user.id;
        const [loans] = await db.execute(
            `SELECT l.*, b.name as borrowerName, b.nrc as borrowerNRC 
             FROM loans l 
             JOIN borrowers b ON l.borrower_id = b.id 
             WHERE l.lender_id = ?`,
            [lenderId]
        );

        // Fetch installments for each loan
        for (let loan of loans) {
            const [installments] = await db.execute(
                'SELECT * FROM loan_installments WHERE loan_id = ? ORDER BY due_date ASC',
                [loan.id]
            );
            loan.instalmentSchedule = installments;
        }

        res.json(loans);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get Lender specific defaults
exports.getLenderDefaults = async (req, res) => {
    try {
        const lenderId = req.user.id;
        const [defaults] = await db.execute(
            `SELECT 
                d.id, 
                d.amount as defaultAmount, 
                d.default_date as defaultDate, 
                d.loan_id as loanId, 
                d.nrc as borrowerNRC,
                b.name as borrowerName, 
                u.name as lenderName,
                'active' as status
             FROM default_ledger d 
             JOIN borrowers b ON d.nrc = b.nrc 
             JOIN users u ON d.lender_id = u.id`
        );
        res.json(defaults);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error fetching defaults' });
    }
};

// Get My Loans (for borrower)
exports.getMyLoans = async (req, res) => {
    try {
        const userId = req.user.id;
        const [user] = await db.execute('SELECT nrc FROM users WHERE id = ?', [userId]);
        const [borrowerRecord] = await db.execute('SELECT id FROM borrowers WHERE nrc = ?', [user[0].nrc]);
        
        if (borrowerRecord.length === 0) return res.json([]);

        const [loans] = await db.execute(
            `SELECT l.*, u.name as lenderName 
             FROM loans l 
             JOIN users u ON l.lender_id = u.id 
             WHERE l.borrower_id = ?`,
            [borrowerRecord[0].id]
        );

        // Fetch installments for each loan
        for (let loan of loans) {
            const [installments] = await db.execute(
                'SELECT * FROM loan_installments WHERE loan_id = ? ORDER BY due_date ASC',
                [loan.id]
            );
            loan.instalmentSchedule = installments;
        }

        res.json(loans);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};
