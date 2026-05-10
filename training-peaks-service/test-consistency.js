require('dotenv').config();
const IntelligentWorkoutParser = require('./services/intelligentWorkoutParser');

async function test() {
  const parser = new IntelligentWorkoutParser();
  const workoutDescription = `3 km opvarmning
4x 100 meter flowløb
3 km progressiv
( 4.00, 3.50, 3.40)
2 min stående pause
Fartleg ( 1,2,3,4,3,2,1 min hurtigt med 1 min jog imellem)
Løb efter fornemmelse, men prøv at holde tempoet på alle intervallerne
2 min stående pause
1 km 3.40
3 km nedløb`;
  
  let successes = 0;
  for (let i = 1; i <= 3; i++) {
      console.log(`\n--- RUN ${i} ---`);
      try {
        const result = await parser.parseTrainingDescription(workoutDescription, new Date('2026-05-09T22:00:00.000Z'));
        console.log(`✅ Run ${i} Success. Workout Steps generated:`, result.garminWorkout.workoutSegments[0].workoutSteps.length);
        successes++;
      } catch (err) {
        console.error(`❌ Run ${i} Error:`, err.message);
      }
  }
  console.log(`\nConsistency result: ${successes}/3 successful JSON parses.`);
}
test();
