const fs = require('fs');
const path = require('path');
const db = require('../db/database');

async function runMigrations() {
    try {
        console.log('Running Hearts database migrations...');
        
        const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
        const migrationFiles = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();

        for (const file of migrationFiles) {
            console.log(`Running migration: ${file}`);
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            await db.query(sql);
            console.log(`✅ Migration ${file} completed`);
        }

        console.log('✅ All Hearts migrations completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigrations();
