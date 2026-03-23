const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
    const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || '',
        database: process.env.DB_NAME || 'lendanet_db',
    };

    console.log(`Testing connection to ${dbConfig.host}:${dbConfig.port} as ${dbConfig.user}...`);
    
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connection successful!');
        
        const [rows] = await connection.execute('SELECT 1 as result');
        console.log('✅ Query successful:', rows[0].result);
        
        await connection.end();
        process.exit(0);
    } catch (err) {
        console.error('❌ Connection failed:');
        console.error(`Error Code: ${err.code}`);
        console.error(`Message: ${err.message}`);
        process.exit(1);
    }
}

testConnection();
