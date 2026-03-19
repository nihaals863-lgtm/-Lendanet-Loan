const db = require('../config/db');

exports.getSettings = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT setting_key, setting_value FROM system_settings');
        const settings = {};
        rows.forEach(row => {
            // parse booleans if applicable
            settings[row.setting_key] = row.setting_value === 'true' ? true : row.setting_value === 'false' ? false : row.setting_value;
        });
        res.json(settings);
    } catch (err) {
        console.error('Error fetching settings:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.updateSetting = async (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key) return res.status(400).json({ message: 'Setting key is required' });
        
        // Convert boolean to string for DB storage
        const strValue = typeof value === 'boolean' ? (value ? 'true' : 'false') : value;

        await db.query(
            'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
            [key, strValue, strValue]
        );
        res.json({ message: 'Setting updated successfully' });
    } catch (err) {
        console.error('Error updating setting:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
