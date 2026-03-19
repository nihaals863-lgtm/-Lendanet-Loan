const db = require('./config/db');

async function migrate() {
    try {
        console.log("Starting manual migration...");

        // 1. Add guarantor fields to loans
        try {
            await db.query("ALTER TABLE loans ADD COLUMN guarantor_name VARCHAR(255)");
            console.log("Added guarantor_name to loans");
        } catch(e) { console.log("guarantor_name might exist:", e.message); }
        
        try {
            await db.query("ALTER TABLE loans ADD COLUMN guarantor_phone VARCHAR(20)");
            console.log("Added guarantor_phone to loans");
        } catch(e) { console.log("guarantor_phone might exist:", e.message); }

        try {
            await db.query("ALTER TABLE loans ADD COLUMN guarantor_nrc VARCHAR(50)");
            console.log("Added guarantor_nrc to loans");
        } catch(e) { console.log("guarantor_nrc might exist:", e.message); }

        // 2. Create system_settings table
        await db.query(`
            CREATE TABLE IF NOT EXISTS system_settings (
                setting_key VARCHAR(100) PRIMARY KEY,
                setting_value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log("Ensured system_settings table exists");

        // 3. Insert default settings
        await db.query(`
            INSERT IGNORE INTO system_settings (setting_key, setting_value) 
            VALUES ('borrower_self_registration', 'true')
        `);
        console.log("Inserted default settings");

        console.log("Migration complete!");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
