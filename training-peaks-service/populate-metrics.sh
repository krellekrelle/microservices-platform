#!/bin/bash

# Test script to populate sample metrics for visualization

echo "📊 Populating sample metrics..."

# Initialize metrics by calling the API
docker compose exec training-peaks-service node -e "
const metrics = require('./services/metrics.js');

async function populateSampleMetrics() {
    console.log('Initializing metrics...');
    await metrics.initialize();
    
    // Simulate 4 weeks of activity
    const now = new Date();
    
    // Week 1 (oldest)
    for (let i = 0; i < 3; i++) {
        await metrics.recordScrape();
    }
    for (let i = 0; i < 4; i++) {
        await metrics.recordSkippedScrape();
    }
    for (let i = 0; i < 8; i++) {
        await metrics.recordWorkoutScheduled();
    }
    
    console.log('✅ Sample metrics populated!');
    console.log('View at: https://kl-pi.tail9f5728.ts.net/training/');
    
    const data = await metrics.getMetrics();
    console.log(JSON.stringify(data, null, 2));
}

populateSampleMetrics().catch(console.error);
"

echo "✅ Done! Metrics populated."
