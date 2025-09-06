#!/usr/bin/env node

// Simple test script to verify the AI workout parser functionality
const IntelligentWorkoutParser = require('./services/intelligentWorkoutParser');

async function testParser() {
    console.log('🧪 Testing AI Workout Parser...\n');
    
    try {
        const parser = new IntelligentWorkoutParser();
        
        // Test with a simple Danish training description
        const testDescription = "3 km jog\n4 km 4.05- 4.15\n2 km jog";
        console.log(`📝 Testing with description: "${testDescription}"`);
        
        const result = await parser.parseTrainingDescription(testDescription, "Test Workout");
        
        console.log('\n✅ Parsing successful!');
        console.log(`🏃 Workout Name: ${result.workoutName}`);
        console.log(`📏 Estimated Distance: ${Math.round(result.estimatedDistanceInMeters/1000)}km`);
        console.log(`⏱️ Estimated Duration: ${Math.round(result.estimatedDurationInSecs/60)}min`);
        console.log(`🔢 Steps: ${result.workoutSegments[0]?.workoutSteps?.length || 0}`);
        
        console.log('\n📊 Workout Structure:');
        result.workoutSegments[0]?.workoutSteps?.forEach((step, index) => {
            console.log(`  ${index + 1}. ${step.stepType.stepTypeKey}: ${step.description}`);
        });
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run the test
testParser().then(() => {
    console.log('\n🎉 AI Workout Parser test completed successfully!');
    process.exit(0);
}).catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});
