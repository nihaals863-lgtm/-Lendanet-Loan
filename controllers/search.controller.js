const db = require('../config/db');

// Search Borrower by NRC or Phone
exports.searchBorrower = async (req, res) => {
    try {
        const q = req.query.q?.trim();
        if (!q) return res.status(400).json({ message: 'Search query is required' });

        // 1. Search in borrowers table (partial match for NRC, phone, and name)
        const searchPattern = `%${q}%`;
        const [borrowers] = await db.execute(
            'SELECT * FROM borrowers WHERE nrc LIKE ? OR phone LIKE ? OR name LIKE ?',
            [searchPattern, searchPattern, searchPattern]
        );

        if (borrowers.length === 0) {
            return res.status(404).json({ message: 'No borrower found' });
        }

        const borrower = borrowers[0];
        const lenderId = req.user.id;

        // 2. Check if lender has a relationship with this borrower
        const [relation] = await db.execute(
            'SELECT * FROM lender_borrowers WHERE lender_id = ? AND borrower_id = ?',
            [lenderId, borrower.id]
        );
        const hasRelation = relation.length > 0;

        // 3. Check membership status
        const [user] = await db.execute('SELECT membership_tier, isPaid FROM users WHERE id = ?', [lenderId]);
        const isFree = user[0].membership_tier === 'free';

        // 4. Base Info (Mask phone if no relation)
        const response = {
            id: borrower.id,
            name: borrower.name,
            nrc: borrower.nrc,
            phone: hasRelation ? borrower.phone : `${borrower.phone.substring(0, 4)}XXXX${borrower.phone.substring(8)}`,
            photo_url: borrower.photo_url,
            hasRelation
        };

        // 5. Risk Summary (Restricted for Free Tier)
        if (isFree && !hasRelation) {
            response.isRestricted = true;
            response.message = "Upgrade to Premium to view risk profile and default history for this borrower.";
        } else {
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

            // 6. Fetch Defaults for this borrower (Global Ledger)
            const [defaults] = await db.execute(
                'SELECT * FROM default_ledger WHERE nrc = ?',
                [borrower.nrc]
            );
            response.defaults = defaults;
        }

        res.json(response);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};
