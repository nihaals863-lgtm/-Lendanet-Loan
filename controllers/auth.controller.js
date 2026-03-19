const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Register Lender
exports.register = async (req, res) => {
    try {
        console.log('Registration Request Body:', req.body);
        console.log('Registration Files:', req.files);
        let { name, phone, email, password, businessName, referralCode, role } = req.body;
        
        // Default role to lender if not provided
        role = role === 'borrower' ? 'borrower' : 'lender';
        
        // Fallback for admin-created users without password
        if (!password) {
            password = 'LendaNet@' + Math.floor(100+Math.random()*900);
            console.log('Generating fallback password for admin user:', password);
        }

        let licenseUrl = null;
        if (req.files && req.files.length > 0) {
            const licenseFile = req.files.find(f => f.fieldname === 'license');
            if (licenseFile) {
                licenseUrl = `/uploads/${licenseFile.filename}`;
            }
        }

        if (!name || !phone || !password) {
            return res.status(400).json({ message: 'Missing required fields: name, phone, or password' });
        }

        // Check if user exists
        const [existing] = await db.execute('SELECT * FROM users WHERE phone = ? OR email = ?', [phone, email]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'User with this phone or email already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate a referral code for the new user if they don't have one
        const userReferralCode = name.substring(0, 3).toUpperCase() + Math.floor(1000 + Math.random() * 9000);

        const initialStatus = role === 'borrower' ? 'active' : 'pending';

        // Insert user
        const [result] = await db.execute(
            'INSERT INTO users (name, phone, email, password, business_name, license_url, referral_code, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, phone, email, hashedPassword, businessName, licenseUrl, userReferralCode, role, initialStatus]
        );

        // If it is a borrower, we should also create a borrower profile
        if (role === 'borrower') {
            await db.execute(
                'INSERT INTO borrowers (name, nrc, phone) VALUES (?, ?, ?)',
                [name, 'PENDING_' + result.insertId, phone] 
            );
        }

        // Handle referral link if provided
        if (referralCode) {
            const [referrer] = await db.execute('SELECT id FROM users WHERE referral_code = ?', [referralCode]);
            if (referrer.length > 0) {
                await db.execute('INSERT INTO referrals (referrer_id, referred_user_id, status) VALUES (?, ?, ?)', 
                    [referrer[0].id, result.insertId, 'pending']);
            }
        }

        res.status(201).json({ 
            message: 'Registration successful. Please verify OTP.',
            userId: result.insertId
        });
    } catch (error) {
        console.error('Registration Error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ 
                message: 'Duplicate entry detected. Phone, email, or NRC might already be in use.',
                error: error.sqlMessage 
            });
        }
        res.status(500).json({ message: 'Server error during registration', error: error.message });
    }
};

// Login
exports.login = async (req, res) => {
    try {
        const { identifier, password } = req.body; // identifier can be email or phone

        const [users] = await db.execute(
            'SELECT * FROM users WHERE email = ? OR phone = ?',
            [identifier, identifier]
        );

        if (users.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const user = users[0];

        // Check status
        if (user.status === 'pending') {
            return res.status(403).json({ message: 'Your account is pending admin approval' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Sign JWT
        const token = jwt.sign(
            { id: user.id, role: user.role, name: user.name },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Generate a referral code if missing (for legacy users or borrowers)
        if (!user.referral_code) {
            const newCode = user.name.substring(0, 3).toUpperCase() + Math.floor(1000 + Math.random() * 9000);
            await db.execute('UPDATE users SET referral_code = ? WHERE id = ?', [newCode, user.id]);
            user.referral_code = newCode;
        }

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                nrc: user.nrc,
                referral_code: user.referral_code,
                referralCode: user.referral_code, 
                role: user.role,
                status: user.status
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error during login' });
    }
};

// Update Profile
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, phone, email, newPassword } = req.body;

        const updates = [];
        const params = [];

        if (name) { updates.push('name = ?'); params.push(name); }
        if (phone) { updates.push('phone = ?'); params.push(phone); }
        if (email) { updates.push('email = ?'); params.push(email); }
        
        if (newPassword) {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            updates.push('password = ?');
            params.push(hashedPassword);
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }

        params.push(userId);
        await db.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error updating profile' });
    }
};

// Verify OTP (Mock for now)
exports.verifyOtp = async (req, res) => {
    const { userId, otp } = req.body;
    
    // In a real app, verify against stored OTP
    if (otp === '123456') {
        // Update status for demo purposes, although normally admin approves lender
        // For borrowers, this might make them active.
        return res.json({ success: true, message: 'OTP verified successfully' });
    } else {
        return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }
};
