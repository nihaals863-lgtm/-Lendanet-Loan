const db = require('../config/db');

// Search Borrower by NRC or Phone
exports.searchBorrower = async (req, res) => {
    try {
        const q = req.query.q?.trim();
        if (!q) return res.status(400).json({ message: 'Search query is required' });

        // 1. Search in borrowers table
        const [borrowers] = await db.execute(
            'SELECT * FROM borrowers WHERE nrc = ? OR phone = ?',
            [q, q]
        );

        if (borrowers.length === 0) {
            return res.status(404).json({ message: 'No borrower found' });
        }

        const borrower = borrowers[0];

        // 2. Base Info
        const response = {
            id: borrower.id,
            name: borrower.name,
            nrc: borrower.nrc,
            phone: borrower.phone,
            photo_url: borrower.photo_url
        };

        // 3. Risk Summary (Always available for this testing phase)
        const [stats] = await db.execute(
            `SELECT 
                COUNT(*) as totalLoans,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeLoans,
                SUM(CASE WHEN status = 'default' THEN 1 ELSE 0 END) as defaultCount
             FROM loans WHERE borrower_id = ?`,
            [borrower.id]
        );
        
        response.risk_status = stats[0].defaultCount > 0 ? 'RED' : (stats[0].activeLoans > 0 ? 'AMBER' : 'GREEN');
        response.activeLoans = stats[0].activeLoans;
        response.total_defaults = stats[0].defaultCount;

        // 4. Fetch Defaults for this borrower (Global Ledger)
        const [defaults] = await db.execute(
            'SELECT * FROM default_ledger WHERE nrc = ?',
            [borrower.nrc]
        );
        response.defaults = defaults;

        res.json(response);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};
