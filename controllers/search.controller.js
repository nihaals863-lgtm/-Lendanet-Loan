const db = require('../config/db');

// Search Borrower by NRC or Phone
exports.searchBorrower = async (req, res) => {
    try {
        const q = req.query.q?.trim();
        if (!q) return res.status(400).json({ message: 'Search query is required' });

        // 1. Search in borrowers table (partial match for NRC, phone, and name)
        const searchPattern = `%${q}%`;
        console.log('Search query:', q, '| Pattern:', searchPattern);
        const [borrowers] = await db.query(
            'SELECT * FROM borrowers WHERE nrc LIKE ? OR phone LIKE ? OR name LIKE ?',
            [searchPattern, searchPattern, searchPattern]
        );
        console.log('Search results count (borrowers):', borrowers.length);

        // 2. Search in users table for lenders
        const [lenders] = await db.query(
            'SELECT id, name, phone, email, nrc, business_name, lender_type, lender_id, plan_type, role FROM users WHERE role = "lender" AND (nrc LIKE ? OR phone LIKE ? OR name LIKE ? OR business_name LIKE ? OR lender_id LIKE ?)',
            [searchPattern, searchPattern, searchPattern, searchPattern, searchPattern]
        );
        console.log('Search results count (lenders):', lenders.length);

        if (borrowers.length === 0 && lenders.length === 0) {
            return res.status(404).json({ message: 'No borrower or lender found' });
        }

        // If lender found but no borrower, return lender results
        if (borrowers.length === 0 && lenders.length > 0) {
            const lenderResults = lenders.map(l => ({
                id: l.id,
                name: l.name,
                nrc: l.nrc,
                phone: l.phone,
                email: l.email,
                business_name: l.business_name,
                lender_type: l.lender_type,
                lender_id: l.lender_id,
                type: 'lender'
            }));
            return res.json({ type: 'lender', results: lenderResults });
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
