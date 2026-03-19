const db = require('../config/db');

exports.getPendingLenders = async (req, res) => {
    try {
        const [lenders] = await db.execute('SELECT * FROM users WHERE role = "lender"');
        res.json(lenders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.approveLender = async (req, res) => {
    try {
        const { userId } = req.body;
        await db.execute('UPDATE users SET verificationStatus = "verified", status = "active" WHERE id = ?', [userId]);
        
        // Add audit log
        await db.execute('INSERT INTO audit_logs (action, user_id, details) VALUES (?, ?, ?)', 
            ['APPROVE_LENDER', req.user.id, `Approved lender ID: ${userId}`]);

        res.json({ message: 'Lender approved successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getAllBorrowers = async (req, res) => {
    try {
        const [borrowers] = await db.execute(`
            SELECT b.*, 
            (SELECT GROUP_CONCAT(u.name SEPARATOR ', ') FROM lender_borrowers lb JOIN users u ON lb.lender_id = u.id WHERE lb.borrower_id = b.id) as lenderName,
            (SELECT COUNT(*) FROM loans WHERE borrower_id = b.id) as totalLoans
            FROM borrowers b
        `);
        res.json(borrowers);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getAllLoans = async (req, res) => {
    try {
        const [loans] = await db.execute(`
            SELECT l.*, b.name as borrowerName, u.name as lenderName
            FROM loans l
            JOIN borrowers b ON l.borrower_id = b.id
            JOIN users u ON l.lender_id = u.id
            ORDER BY l.created_at DESC
        `);
        res.json(loans);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getDefaults = async (req, res) => {
    try {
        const [defaults] = await db.execute(`
            SELECT d.*, b.name as borrowerName, u.name as lenderName, l.amount as loanAmount
            FROM default_ledger d
            JOIN loans l ON d.loan_id = l.id
            JOIN borrowers b ON l.borrower_id = b.id
            JOIN users u ON d.lender_id = u.id
        `);
        res.json(defaults);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Admin - Remove Default
exports.removeDefault = async (req, res) => {
    try {
        const { id } = req.params; // Default Ledger ID
        const [ledger] = await db.execute('SELECT loan_id FROM default_ledger WHERE id = ?', [id]);
        if (ledger.length === 0) return res.status(404).json({ message: 'Default record not found' });

        await db.execute('UPDATE loans SET status = "active" WHERE id = ?', [ledger[0].loan_id]);
        await db.execute('DELETE FROM default_ledger WHERE id = ?', [id]);

        res.json({ message: 'Default removed and loan restored' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Admin - Get Audit Logs
exports.getAuditLogs = async (req, res) => {
    try {
        const [logs] = await db.execute(`
            SELECT a.*, u.name as userName 
            FROM audit_logs a 
            LEFT JOIN users u ON a.user_id = u.id 
            ORDER BY a.created_at DESC
        `);
        res.json(logs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Admin - Get All Referrals
exports.getReferrals = async (req, res) => {
    try {
        const [referrals] = await db.execute(`
            SELECT r.*, 
            u1.name as referrerName, 
            u2.name as referredName,
            rw.amount as bonus
            FROM referrals r
            JOIN users u1 ON r.referrer_id = u1.id
            JOIN users u2 ON r.referred_user_id = u2.id
            LEFT JOIN referral_rewards rw ON r.id = rw.referral_id
            ORDER BY r.created_at DESC
        `);
        res.json(referrals);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Admin - Get Membership Plans
exports.getMembershipPlans = async (req, res) => {
    try {
        const [plans] = await db.execute('SELECT * FROM membership_plans');
        res.json(plans);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Admin - Update Membership Plan
exports.updateMembershipPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { price, duration_days } = req.body;
        await db.execute('UPDATE membership_plans SET price = ?, duration_days = ? WHERE id = ?', 
            [price, duration_days, id]);
        res.json({ message: 'Membership plan updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Admin - Get Settings
exports.getSettings = async (req, res) => {
    try {
        const [settings] = await db.execute('SELECT * FROM settings');
        res.json(settings);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Admin - Update Setting
exports.updateSetting = async (req, res) => {
    try {
        const { key, value } = req.body;
        await db.execute('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [value, key]);
        res.json({ message: 'Setting updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};
