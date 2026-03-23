const db = require('../config/db');

exports.generateReport = async (req, res) => {
    try {
        const { dateRange, userType, status } = req.query;
        
        let query = `
            SELECT 
                l.id, 
                l.issue_date as date, 
                u.name as user, 
                u.role as type, 
                l.amount, 
                l.status 
            FROM loans l
            JOIN users u ON l.lender_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (userType && userType !== 'all') {
            query += ' AND u.role = ?';
            params.push(userType);
        }

        if (status && status !== 'all') {
            query += ' AND l.status = ?';
            params.push(status);
        }

        // Simulating date filters for now
        if (dateRange && dateRange !== 'all-time') {
            const now = new Date();
            let startDate;
            if (dateRange === 'today') startDate = new Date(now.setHours(0,0,0,0));
            else if (dateRange === 'this-week') startDate = new Date(now.setDate(now.getDate() - 7));
            else if (dateRange === 'this-month') startDate = new Date(now.setMonth(now.getMonth() - 1));
            
            if (startDate) {
                query += ' AND l.issue_date >= ?';
                params.push(startDate.toISOString().split('T')[0]);
            }
        }

        const [rows] = await db.query(query, params);
        
        // Map to match frontend expectations if needed
        const reportData = rows.map(r => ({
            id: `L00${r.id}`,
            date: r.date,
            user: r.user,
            type: r.type === 'lender' ? 'Lender' : 'Borrower',
            amount: parseFloat(r.amount),
            status: r.status.charAt(0).toUpperCase() + r.status.slice(1)
        }));

        res.json(reportData);
    } catch (err) {
        console.error('Error generating report:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getStats = async (req, res) => {
    try {
        const [[{ totalCapital }]] = await db.query('SELECT SUM(amount) as totalCapital FROM loans');
        const [[{ totalUsers }]] = await db.query('SELECT COUNT(*) as totalUsers FROM users');
        const [[{ avgLoan }]] = await db.query('SELECT AVG(amount) as avgLoan FROM loans');
        
        res.json({
            totalCapital: totalCapital || 0,
            totalUsers: totalUsers || 0,
            avgLoan: avgLoan || 0,
            successRate: '92%' // Mock for now
        });
    } catch (err) {
        console.error('Error fetching report stats:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
