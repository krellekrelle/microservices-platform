const Groq = require('groq-sdk');
const fs = require('fs').promises;
const path = require('path');

/**
 * Intelligent Workout Parser using Groq AI to convert Danish training descriptions
 * into Garmin Connect workout JSON format using few-shot learning examples
 */
class IntelligentWorkoutParser {
    constructor() {
        this.groq = new Groq({
            apiKey: process.env.GROQ_API_KEY
        });
        this.contextPath = path.join(__dirname, '../llm-context');
        this.examples = null;
        this.types = null;
        this.resultsPath = '/app/data'; // Use same pattern as calendar HTML saving
    }

    /**
     * Save AI response to data directory
     */
    async saveAIResponse(description, workoutDate, prompt, rawResponse, parsedWorkout, success = true, error = null) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `/app/data/ai-response-${timestamp}.json`;
            const promptFilename = `/app/data/ai-prompt-${timestamp}.txt`;
            
            const testResult = {
                timestamp: new Date().toISOString(),
                success: success,
                input: {
                    description: description,
                    workoutDate: workoutDate,
                    promptLength: prompt?.length || 0
                },
                response: {
                    rawResponse: rawResponse,
                    parsedWorkout: success ? parsedWorkout : null,
                    error: error
                },
                metadata: {
                    // model: 'llama-3.1-8b-instant',
                    model: 'llama-3.3-70b-versatile', // Updated model
                    promptType: 'danish-direct',
                    responseLength: rawResponse?.length || 0
                }
            };
            
            // Save the response JSON
            await fs.writeFile(filename, JSON.stringify(testResult, null, 2), 'utf-8');
            console.log(`💾 [DEBUG] AI Response saved to: ${filename}`);
            
            // Save the prompt text
            if (prompt) {
                await fs.writeFile(promptFilename, prompt, 'utf-8');
                console.log(`📝 [DEBUG] AI Prompt saved to: ${promptFilename}`);
            }
        } catch (saveError) {
            console.error('❌ Failed to save AI response:', saveError);
        }
    }

    /**
     * Load context for LLM - only TypeScript definitions, no examples
     */
    async loadContext() {
        if (this.addWorkoutTypes) {
            console.log('✅ Context already loaded');
            return;
        }

        console.log('� Loading LLM context...');
        
        try {
            // Load Garmin types - only addWorkoutTypes.ts needed for the new approach
            console.log('🏷️ [DEBUG] loadContext - Loading addWorkoutTypes.ts');
            this.addWorkoutTypes = await fs.readFile(
                path.join(this.contextPath, 'addWorkoutTypes.ts'), 
                'utf-8'
            );
            
            console.log('✅ Loaded TypeScript type definitions for LLM context');
            console.log('📋 [DEBUG] loadContext - addWorkoutTypes loaded:', !!this.addWorkoutTypes);
        } catch (error) {
            console.error('❌ Failed to load LLM context:', error);
            console.error('❌ Context path:', this.contextPath);
            throw new Error('Unable to load TypeScript definitions for workout parsing');
        }
    }

    /**
     * Convert a Danish training description into Garmin workout JSON
     * @param {string} description - Danish training description
     * @param {string} workoutDate - Date for the workout (YYYY-MM-DD)
     * @param {string} workoutName - Optional workout name
     * @returns {Object} Garmin workout JSON
     */
    async parseTrainingDescription(description, workoutDate = null, workoutName = null) {
        console.log('🤖 [DEBUG] AI Parser - Starting parseTrainingDescription');
        console.log(`📝 [DEBUG] AI Parser - Description: "${description}"`);
        console.log(`📅 [DEBUG] AI Parser - Date: "${workoutDate || 'Current date'}"`);
        console.log(`🏷️ [DEBUG] AI Parser - Workout Name: "${workoutName || 'Auto-generated'}"`);
        
        await this.loadContext();

        // Use provided date or current date
        const dateToUse = workoutDate || new Date().toISOString().split('T')[0];

        const prompt = this.createDanishPrompt(description, dateToUse, workoutName);
        console.log(`📋 [DEBUG] AI Parser - Prompt length: ${prompt.length} characters`);
        
        try {
            console.log('🚀 [DEBUG] AI Parser - Sending request to Groq API...');
            
            const completion = await this.groq.chat.completions.create({
                messages: [{ 
                    role: 'user', 
                    content: prompt 
                }],
                model: 'llama-3.3-70b-versatile', // Updated to better model for complex reasoning
                temperature: 0.1, // Low temperature for consistent parsing
                max_tokens: 4000, // Increased for more complex workouts with repeats
                response_format: { type: 'json_object' }
            });
            
            console.log('✅ [DEBUG] AI Parser - Received response from Groq API');
            
            const result = completion.choices[0]?.message?.content;
            if (!result) {
                throw new Error('No response from Groq API');
            }

            console.log(`📄 [DEBUG] AI Parser - Response length: ${result.length} characters`);
            console.log(`📄 [DEBUG] AI Parser - Raw response: ${result.substring(0, 200)}...`);

            const parsedWorkout = JSON.parse(result);

            
            console.log('🔍 [DEBUG] AI Parser - JSON parsing successful');
            
            // Clean the parsed workout - remove response-only fields
            const cleanedWorkout = this.cleanWorkoutForCreation(parsedWorkout);
            console.log('🧹 [DEBUG] AI Parser - Cleaned workout for addWorkout()');
            
            // Validate the parsed workout has required structure
            this.validateWorkoutStructure(cleanedWorkout);
            console.log('✅ [DEBUG] AI Parser - Workout structure validation passed');
            
            // Save successful AI response
            await this.saveAIResponse(description, dateToUse, prompt, result, cleanedWorkout, true);
            
            console.log(`🎉 [DEBUG] AI Parser - Successfully parsed into workout: "${cleanedWorkout.workoutName}"`);
            return cleanedWorkout;
            
        } catch (error) {
            console.error('❌ [DEBUG] AI Parser - Parsing failed:', error.message);
            console.error('❌ [DEBUG] AI Parser - Full error:', error);
            
            // Save failed AI response
            const errorResult = completion?.choices?.[0]?.message?.content || null;
            await this.saveAIResponse(description, dateToUse, prompt, errorResult, null, false, error.message);
            
            // Determine the failure point for better error reporting
            let failurePoint = 'Unknown error';
            let detailedError = error.message;
            
            if (error.message.includes('Request too large')) {
                failurePoint = 'Prompt too large for model token limit';
                detailedError = `Prompt size exceeds model limits. Try reducing the number of examples or using a different model.`;
            } else if (error.message.includes('No response from Groq API')) {
                failurePoint = 'No response from LLM API';
                detailedError = 'The LLM API did not return any response. Check API key and service status.';
            } else if (error.message.includes('Unexpected token')) {
                failurePoint = 'Invalid JSON response from LLM';
                detailedError = 'The LLM returned malformed JSON. The model may need better prompting or different parameters.';
            } else if (error.message.includes('Missing required fields')) {
                failurePoint = 'LLM generated incomplete workout structure';
                detailedError = `The LLM generated JSON but it's missing required fields: ${error.message}`;
            } else if (error.message.includes('workout must have at least one workout step')) {
                failurePoint = 'LLM generated workout without steps';
                detailedError = 'The LLM generated a workout structure but with no workout steps.';
            } else if (error.message.includes('rate limit')) {
                failurePoint = 'API rate limit exceeded';
                detailedError = 'Too many requests to the LLM API. Please wait before trying again.';
            }
            
            // Create a detailed error for the user
            const parsingError = new Error(`AI Parsing Failed: ${failurePoint}`);
            parsingError.details = {
                failurePoint,
                originalError: error.message,
                detailedError,
                description,
                workoutName,
                timestamp: new Date().toISOString()
            };
            
            throw parsingError;
        }
    }

    /**
     * Clean workout JSON to remove response-only fields for addWorkout()
     */
    cleanWorkoutForCreation(workout) {
        // Fields that should NOT be included in addWorkout() calls
        const responseOnlyFields = [
            'workoutId', 'ownerId', 'stepId', 'trainingPlanId', 'author', 
            'estimateType', 'estimatedDistanceUnit', 'poolLength', 'poolLengthUnit',
            'workoutProvider', 'workoutSourceId', 'consumer', 'atpPlanId',
            'workoutNameI18nKey', 'descriptionI18nKey', 'shared', 'estimated'
        ];
        
        const cleaned = { ...workout };
        
        // Remove response-only fields from root level
        responseOnlyFields.forEach(field => {
            delete cleaned[field];
        });
        
        // Ensure dates are always current date (not future dates)
        const currentDate = new Date().toISOString();
        cleaned.updateDate = currentDate;
        cleaned.createdDate = currentDate;
        
        // Clean workout steps - remove stepId and other response fields
        if (cleaned.workoutSegments) {
            cleaned.workoutSegments = cleaned.workoutSegments.map(segment => ({
                ...segment,
                workoutSteps: segment.workoutSteps?.map(step => {
                    const cleanedStep = { ...step };
                    delete cleanedStep.stepId;
                    return cleanedStep;
                }) || []
            }));
        }
        
        console.log('🧹 [DEBUG] Removed response-only fields:', responseOnlyFields.filter(field => workout[field] !== undefined));
        console.log('📅 [DEBUG] Set dates to current time:', currentDate);
        return cleaned;
    }

    /**
     * Create an optimized few-shot learning prompt with minimal examples
     */
    createDanishPrompt(description, workoutDate, workoutName) {
        // Include the simplified TypeScript definitions for reference
        const typeReference = this.addWorkoutTypes 
            ? `\nSTRUKTUR REFERENCE:\n${this.addWorkoutTypes}\n`
            : '';

        // Convert workoutDate (YYYY-MM-DD) to dd/mm format
        const dateObj = new Date(workoutDate);
        const ddmm = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;

        return `Analysér beskrivelsen og generér en Garmin workout i ren JSON til addWorkout().

TRÆNINGSDATO: ${workoutDate}
BESKRIVELSE: "${description}"
${workoutName ? `NAVN: "${workoutName}"` : `NAVN: Generer dansk navn - ${ddmm}`}

${typeReference}

VIGTIG: STRUKTUR skal være template-baseret, INDHOLD skal være beskrivelse-baseret

ANALYSE DANSKE TRÆNINGSKOMPONENTER:
- "X km opvarmning" = X km løb uden target (no.target)
- "X x 100m flowløb" = X stykker af 100 meter løb uden target (no.target)
- "X x Y km Z.ZZ" = X intervaller af Y km ved Z:ZZ min/km tempo (pace.zone target)
- "Ym jog imellem" = Y meter løb uden target mellem intervaller (no.target)
- "X min pause" = X minutters pause/hvile (time-based recovery step)
- "X km nedløb" = X km løb uden target (no.target)

PACE KONVERTERING:
- "4.05-4.15" = pace range: targetValueOne = 3.92 m/s (4:15), targetValueTwo = 4.08 m/s (4:05)
- "4.05" = single pace: targetValueOne = 4.08 m/s, targetValueTwo = 4.08 m/s
- Beregning: "X.YZ" min/km → (X*60 + YZ) sekunder/km → 1000/(sek/km) = m/s
- "jog" eller "let" = ingen target (no.target)

REPEAT GROUPS - BRUG RepeatGroupDTO FOR GENTAGELSER:
- "3x 1km" = 1 RepeatGroupDTO med numberOfIterations: 3, steps: [1km interval, recovery]
- "4x 100m flowløb" = 1 RepeatGroupDTO med numberOfIterations: 4, steps: [100m step]
- "jog imellem" = recovery step INDEN I repeat group
- "pause imellem" = rest step INDEN I repeat group

BEREGN VARIGHED:
- 1 km uden target = ~360 sekunder (6 min/km standard tempo)
- 1 km ved 4:05 = 245 sekunder
- 100m flowløb = ~30 sekunder (standard tempo)
- 200m jog = ~72 sekunder (6 min/km)

TEMPLATE STRUKTUR:
{
  "workoutName": "[Dansk navn baseret på beskrivelse] - ${ddmm}",
  "description": "${description}",
  "updateDate": "[NUVÆRENDE DATO/TID]",
  "createdDate": "[NUVÆRENDE DATO/TID]", 
  "sportType": {"sportTypeId": 1, "sportTypeKey": "running"},
  "estimatedDurationInSecs": [TOTAL BEREGNET TID],
  "estimatedDistanceInMeters": [TOTAL BEREGNET DISTANCE],
  "workoutSegments": [{
    "segmentOrder": 1,
    "sportType": {"sportTypeId": 1, "sportTypeKey": "running"},
    "workoutSteps": [
      // MIX af ExecutableStepDTO og RepeatGroupDTO
      // Opvarmning: ExecutableStepDTO med distance
      // Gentagelser: RepeatGroupDTO for "3x 1km", "4x 100m" etc.
      // Nedløb: ExecutableStepDTO med distance
    ]
  }]
}

STEP/REPEAT TYPER:
- Enkelt løb: ExecutableStepDTO, endCondition=distance, targetType=no.target
- Interval gentagelser: RepeatGroupDTO med numberOfIterations og nested steps
- Pauser mellem sets: ExecutableStepDTO, endCondition=time, targetType=no.target

REPEAT GROUP STRUKTUR:
{
  "type": "RepeatGroupDTO",
  "stepOrder": [NUMMER],
  "numberOfIterations": [ANTAL GENTAGELSER],
  "smartRepeat": false,
  "childStepId": 1,
  "workoutSteps": [
    {
      "type": "ExecutableStepDTO",
      "stepOrder": 1,
      "stepType": {"stepTypeId": 1, "stepTypeKey": "interval"},
      "endCondition": {"conditionTypeId": 3, "conditionTypeKey": "distance"},
      "endConditionValue": [DISTANCE I METER],
      "targetType": {"workoutTargetTypeId": 6, "workoutTargetTypeKey": "pace.zone"},
      "targetValueOne": [LANGSOM M/S], "targetValueTwo": [HURTIG M/S],
      "strokeType": {"strokeTypeId": 0}, "equipmentType": {"equipmentTypeId": 0}
    },
    // Hvis "jog imellem" eller "pause imellem" - tilføj recovery step:
    {
      "type": "ExecutableStepDTO",
      "stepOrder": 2,
      "stepType": {"stepTypeId": 1, "stepTypeKey": "interval"},
      "endCondition": {"conditionTypeId": [3=distance, 2=time], "conditionTypeKey": "[distance/time]"},
      "endConditionValue": [VÆRDI],
      "targetType": {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target"},
      "strokeType": {"strokeTypeId": 0}, "equipmentType": {"equipmentTypeId": 0}
    }
  ]
}
  "targetValueOne": [LANGSOM M/S for pace.zone],
  "targetValueTwo": [HURTIG M/S for pace.zone], 
  "strokeType": {"strokeTypeId": 0},
  "equipmentType": {"equipmentTypeId": 0}
}

DETALJERET EKSEMPEL ANALYSE:
Input: "4 km opvarmning, 4x 100m flowløb, 3x 1 km 4.05-4.15, 200m jog imellem, 4 km nedløb"

STEP 1: ExecutableStepDTO - 4 km opvarmning
- type: "ExecutableStepDTO", stepOrder: 1
- endCondition: distance (3), endConditionValue: 4000
- targetType: no.target (1)

STEP 2: RepeatGroupDTO - 4x 100m flowløb
- type: "RepeatGroupDTO", stepOrder: 2, numberOfIterations: 4
- workoutSteps: [{ 100m ExecutableStepDTO, no.target }]

STEP 3: RepeatGroupDTO - 3x (1km + 200m recovery)
- type: "RepeatGroupDTO", stepOrder: 3, numberOfIterations: 3
- workoutSteps: [
  { 1000m ExecutableStepDTO, pace.zone, targetValueOne: 3.92, targetValueTwo: 4.08 },
  { 200m ExecutableStepDTO, no.target }
]

STEP 4: ExecutableStepDTO - 4 km nedløb
- type: "ExecutableStepDTO", stepOrder: 4
- endCondition: distance (3), endConditionValue: 4000
- targetType: no.target (1)

PACE RANGE EKSEMPEL "4.05-4.15":
- Langsom: 4:15 = 255 sek/km = 1000/255 = 3.92 m/s (targetValueOne)
- Hurtig: 4:05 = 245 sek/km = 1000/245 = 4.08 m/s (targetValueTwo)

KOPIER IKKE disse eksempel-værdier! Analysér den faktiske beskrivelse.

Returner kun JSON.`;
    }

    /**
     * Validate that the parsed workout has the required Garmin structure
     */
    validateWorkoutStructure(workout) {
        const required = ['workoutName', 'sportType', 'workoutSegments'];
        const missing = required.filter(field => !workout[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }

        if (!workout.workoutSegments[0]?.workoutSteps?.length) {
            throw new Error('Workout must have at least one workout step');
        }
    }

    /**
     * Test the parser with a simple Danish description
     */
    async testParser() {
        await this.loadContext();
        
        console.log('🧪 Testing workout parser with simple description...');
        
        const testDescription = "Løb 5 km i 4.05 tempo med 1 km opvarmning";
        const testDate = "2025-09-07";
        
        try {
            console.log(`\n--- Testing Description ---`);
            console.log(`Description: "${testDescription}"`);
            console.log(`Date: "${testDate}"`);
            
            const parsed = await this.parseTrainingDescription(testDescription, testDate, "Test Løb");
            console.log(`✅ Successfully parsed test description`);
            console.log('📋 Result structure:', {
                hasWorkoutName: !!parsed.workoutName,
                hasSegments: !!parsed.workoutSegments,
                segmentCount: parsed.workoutSegments?.length || 0,
                firstSegmentSteps: parsed.workoutSegments?.[0]?.workoutSteps?.length || 0
            });
            
            return { success: true, result: parsed };
        } catch (error) {
            console.error(`❌ Failed to parse test description:`, error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = IntelligentWorkoutParser;
