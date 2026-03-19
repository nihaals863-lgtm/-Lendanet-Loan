const db = require('../config/db');

// Add or Reuse Borrower
exports.addBorrower = async (req, res) => {
    try {
        const { name, nrc, phone, dob } = req.body;
        const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const lenderId = req.user.id; // From JWT

        // 1. Check if borrower exists by NRC
        let [existing] = await db.execute('SELECT * FROM borrowers WHERE nrc = ?', [nrc]);
        let borrowerId;

        if (existing.length > 0) {
            borrowerId = existing[0].id;
        } else {
            // 2. Create new borrower
            const [result] = await db.execute(
                'INSERT INTO borrowers (name, nrc, phone, dob, photo_url) VALUES (?, ?, ?, ?, ?)',
                [name, nrc, phone, dob, photoUrl]
            );
            borrowerId = result.insertId;
        }

        // 3. Link to lender (Ignore if already linked)
        await db.execute(
            'INSERT IGNORE INTO lender_borrowers (lender_id, borrower_id) VALUES (?, ?)',
            [lenderId, borrowerId]
        );

        res.status(201).json({
            message: existing.length > 0 ? 'Borrower linked successfully' : 'Borrower created and linked',
            borrowerId
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error adding borrower' });
    }
};

// Get All Borrowers for a Lender
exports.getLenderBorrowers = async (req, res) => {
    try {
        const lenderId = req.user.id;
        const [borrowers] = await db.execute(
            `SELECT b.* FROM borrowers b 
             JOIN lender_borrowers lb ON b.id = lb.borrower_id 
             WHERE lb.lender_id = ?`,
            [lenderId]
        );
        res.json(borrowers);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error fetching borrowers' });
    }
};

// Get Borrower Risk Summary (Restricted)
exports.getRiskSummary = async (req, res) => {
    try {
        const { id } = req.params;
        
        // 1. Get borrower info
        const [borrower] = await db.execute('SELECT * FROM borrowers WHERE id = ?', [id]);
        if (borrower.length === 0) return res.status(404).json({ message: 'Borrower not found' });

        // 2. Get loan stats
        const [stats] = await db.execute(
            `SELECT 
                COUNT(*) as totalLoans,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeLoans,
                SUM(CASE WHEN status = 'default' THEN 1 ELSE 0 END) as defaultCount
             FROM loans WHERE borrower_id = ?`,
            [id]
        );

        // 3. Simple Risk Engine Logic
        let riskLevel = 'Green';
        if (stats[0].defaultCount > 0) {
            riskLevel = 'Red';
        } else if (stats[0].totalLoans > 0) {
            // Check for missed installments (Amber logic)
            const [missed] = await db.execute(
                `SELECT COUNT(*) as missedCount FROM loan_installments li
                 JOIN loans l ON li.loan_id = l.id
                 WHERE l.borrower_id = ? AND li.status = 'pending' AND li.due_date < CURRENT_DATE`,
                [id]
            );
            if (missed[0].missedCount > 0) riskLevel = 'Amber';
        }

        res.json({
            borrower: borrower[0],
            riskLevel,
            ...stats[0]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};
const bcrypt = require('bcryptjs');

// Enable login for a borrower
exports.enableLogin = async (req, res) => {
    try {
        const { id } = req.params;
        
        // 1. Get borrower info
        const [borrower] = await db.execute('SELECT * FROM borrowers WHERE id = ?', [id]);
        if (borrower.length === 0) return res.status(404).json({ message: 'Borrower not found' });
        
        const b = borrower[0];

        // 2. Check if user already exists
        const [existing] = await db.execute('SELECT * FROM users WHERE phone = ? OR nrc = ?', [b.phone, b.nrc]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Login is already enabled for this borrower' });
        }

        // 3. Generate random password
        const plainPassword = 'LN@' + Math.floor(100000 + Math.random() * 899999);
        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        // 4. Generate referral code
        const referralCode = b.name.substring(0, 3).toUpperCase() + Math.floor(1000 + Math.random() * 9000);

        // 5. Create user record
        await db.execute(
            'INSERT INTO users (name, phone, nrc, password, role, status, verificationStatus, referral_code) VALUES (?, ?, ?, ?, "borrower", "active", "verified", ?)',
            [b.name, b.phone, b.nrc, hashedPassword, referralCode]
        );

        // In a real app, send SMS here. For now, we return it.
        res.json({
            message: 'Login enabled successfully',
            credentials: {
                phone: b.phone,
                password: plainPassword
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error enabling login' });
    }
};
// Update Borrower
exports.updateBorrower = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, phone, dob } = req.body;
        
        await db.execute(
            'UPDATE borrowers SET name = ?, phone = ?, dob = ? WHERE id = ?',
            [name, phone, dob, id]
        );

        res.json({ message: 'Borrower updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error updating borrower' });
    }
};

// Delete Borrower
exports.deleteBorrower = async (req, res) => {
    try {
        const { id } = req.params;
        const lenderId = req.user.id;

        // 1. Remove link from lender_borrowers
        await db.execute(
            'DELETE FROM lender_borrowers WHERE lender_id = ? AND borrower_id = ?',
            [lenderId, id]
        );

        res.json({ message: 'Borrower removed from your list' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error deleting borrower' });
    }
};
