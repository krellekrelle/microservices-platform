// Test script to manually trigger the scheduler
const scheduler = require('./services/scheduler');

console.log('🔧 Triggering scheduler manually...');

scheduler.triggerNow()
    .then(() => {
        console.log('✅ Scheduler completed successfully');
        process.exit(0);
    })
    .catch((err) => {
        console.error('❌ Scheduler failed:', err);
        process.exit(1);
    });
