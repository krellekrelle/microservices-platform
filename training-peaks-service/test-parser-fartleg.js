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
  
  try {
    const result = await parser.parseTrainingDescription(workoutDescription, new Date('2026-05-09T22:00:00.000Z'));
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Error:", err);
  }
}
test();
