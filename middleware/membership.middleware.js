const db = require('../config/db');

module.exports = async (req, res, next) => {
    try {
        const userId = req.user.id;
        
        // Admin always has access
        if (req.user.role === 'admin') return next();

        // Check for active subscription
        const [subs] = await db.execute(
            'SELECT * FROM subscriptions WHERE user_id = ? AND status = "active" AND end_date > CURRENT_TIMESTAMP',
            [userId]
        );

        req.isPaid = subs.length > 0;
        next();
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error checking membership' });
    }
};
