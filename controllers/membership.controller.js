const db = require('../config/db');

// Request Membership Upgrade
exports.requestUpgrade = async (req, res) => {
    try {
        const { planId, notes } = req.body;
        const userId = req.user.id;

        // Check if a pending request already exists
        const [existing] = await db.execute(
            'SELECT id FROM upgrade_requests WHERE user_id = ? AND status = "pending"',
            [userId]
        );

        if (existing.length > 0) {
            return res.status(400).json({ message: 'You already have a pending upgrade request' });
        }

        await db.execute(
            'INSERT INTO upgrade_requests (user_id, plan_id, notes) VALUES (?, ?, ?)',
            [userId, planId, notes || null]
        );

        // Add Audit Log
        await db.execute('INSERT INTO audit_logs (action, user_id, details) VALUES (?, ?, ?)', 
            ['UPGRADE_REQUEST', userId, `Requested upgrade to plan ID: ${planId}`]);

        res.status(201).json({ message: 'Upgrade request sent to admin for manual processing' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error sending upgrade request' });
    }
};

// Get All Upgrade Requests (Admin)
exports.getUpgradeRequests = async (req, res) => {
    try {
        const [requests] = await db.execute(`
            SELECT ur.*, u.name as userName, u.phone, u.email, mp.name as planName 
            FROM upgrade_requests ur
            JOIN users u ON ur.user_id = u.id
            JOIN membership_plans mp ON ur.plan_id = mp.id
            ORDER BY ur.created_at DESC
        `);
        res.json(requests);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error fetching requests' });
    }
};

// Handle Upgrade Request (Approve/Reject)
exports.handleUpgradeRequest = async (req, res) => {
    try {
        const { requestId, status } = req.body; // status: 'approved' or 'rejected'
        
        const [request] = await db.execute('SELECT * FROM upgrade_requests WHERE id = ?', [requestId]);
        if (request.length === 0) return res.status(404).json({ message: 'Request not found' });

        await db.execute('UPDATE upgrade_requests SET status = ? WHERE id = ?', [status, requestId]);

        if (status === 'approved') {
            const [plan] = await db.execute('SELECT name FROM membership_plans WHERE id = ?', [request[0].plan_id]);
            await db.execute('UPDATE users SET membership_tier = ?, isPaid = ? WHERE id = ?', 
                [plan[0].name.toLowerCase(), plan[0].name.toLowerCase() !== 'free', request[0].user_id]);
            
            await db.execute('INSERT INTO audit_logs (action, user_id, details) VALUES (?, ?, ?)', 
                ['UPGRADE_APPROVED', req.user.id, `Approved upgrade for user ID: ${request[0].user_id}`]);
        }

        res.json({ message: `Upgrade request ${status}` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error handling request' });
    }
};

// Get Membership Plans
exports.getPlans = async (req, res) => {
    try {
        const [plans] = await db.execute('SELECT * FROM membership_plans WHERE status = "active"');
        res.json(plans);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error fetching plans' });
    }
};
