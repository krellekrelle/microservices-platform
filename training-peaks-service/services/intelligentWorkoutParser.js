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
     * Extract pace ranges from Danish text and calculate correct m/s values
     * @param {string} text - Text to search for pace patterns
     * @returns {Array} Array of {pattern, targetValueOne, targetValueTwo} objects
     */
    extractPaceRanges(text) {
        const paceRanges = [];
        
        // Pattern for pace ranges like "4.05-4.15" or "4.05- 4.15"
        const paceRangeRegex = /(\d)\.(\d{2})\s*-\s*(\d)\.(\d{2})/g;
        let match;
        
        while ((match = paceRangeRegex.exec(text)) !== null) {
            const [fullMatch, min1, sec1, min2, sec2] = match;
            
            // Convert to total seconds per km
            const pace1Seconds = parseInt(min1) * 60 + parseInt(sec1);
            const pace2Seconds = parseInt(min2) * 60 + parseInt(sec2);
            
            // Convert to m/s (1000 meters / seconds per km)
            const pace1Ms = 1000 / pace1Seconds;
            const pace2Ms = 1000 / pace2Seconds;
            
            // targetValueOne should be slower (higher min/km, lower m/s)
            // targetValueTwo should be faster (lower min/km, higher m/s)
            const targetValueOne = Math.min(pace1Ms, pace2Ms);
            const targetValueTwo = Math.max(pace1Ms, pace2Ms);
            
            paceRanges.push({
                pattern: fullMatch,
                targetValueOne: Math.round(targetValueOne * 100) / 100, // Round to 2 decimals
                targetValueTwo: Math.round(targetValueTwo * 100) / 100
            });
            
            console.log(`🎯 [DEBUG] Pace calc - "${fullMatch}" → ${targetValueOne} m/s to ${targetValueTwo} m/s`);
        }
        
        // Pattern for single pace like "4.05"
        const singlePaceRegex = /(\d)\.(\d{2})(?!\s*-)/g;
        while ((match = singlePaceRegex.exec(text)) !== null) {
            const [fullMatch, min1, sec1] = match;
            
            // Skip if this pace is part of a range we already found
            const isPartOfRange = paceRanges.some(range => range.pattern.includes(fullMatch));
            if (isPartOfRange) continue;
            
            const paceSeconds = parseInt(min1) * 60 + parseInt(sec1);
            const paceMs = Math.round((1000 / paceSeconds) * 100) / 100;
            
            paceRanges.push({
                pattern: fullMatch,
                targetValueOne: paceMs,
                targetValueTwo: paceMs
            });
            
            console.log(`🎯 [DEBUG] Pace calc - "${fullMatch}" → ${paceMs} m/s (single pace)`);
        }
        
        return paceRanges;
    }

    /**
     * Fix pace values in workout steps using programmatic calculation
     * @param {Object} workout - Parsed workout object
     * @param {string} description - Original description to extract paces from
     */
    fixPaceValues(workout, description) {
        const paceRanges = this.extractPaceRanges(description);
        if (paceRanges.length === 0) {
            console.log('📊 [DEBUG] No pace ranges found in description');
            return workout;
        }
        
        console.log(`📊 [DEBUG] Found ${paceRanges.length} pace ranges to fix`);
        
        let paceIndex = 0;
        
        // Recursive function to fix paces in workout steps
        const fixSteps = (steps) => {
            for (const step of steps) {
                if (step.targetType?.workoutTargetTypeKey === 'pace.zone') {
                    if (paceIndex < paceRanges.length) {
                        const pace = paceRanges[paceIndex];
                        console.log(`🔧 [DEBUG] Fixing step ${step.stepOrder}: ${step.targetValueOne}-${step.targetValueTwo} → ${pace.targetValueOne}-${pace.targetValueTwo}`);
                        step.targetValueOne = pace.targetValueOne;
                        step.targetValueTwo = pace.targetValueTwo;
                        paceIndex++;
                    }
                }
                
                // Handle RepeatGroupDTO nested steps
                if (step.type === 'RepeatGroupDTO' && step.workoutSteps) {
                    fixSteps(step.workoutSteps);
                }
            }
        };
        
        // Fix paces in all segments
        if (workout.workoutSegments) {
            for (const segment of workout.workoutSegments) {
                if (segment.workoutSteps) {
                    fixSteps(segment.workoutSteps);
                }
            }
        }
        
        console.log(`✅ [DEBUG] Fixed ${paceIndex} pace zones with correct calculations`);
        return workout;
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
            
            // Fix pace values using programmatic calculation
            const fixedWorkout = this.fixPaceValues(cleanedWorkout, description);
            console.log('🎯 [DEBUG] AI Parser - Applied programmatic pace fixes');
            
            // Validate the parsed workout has required structure
            this.validateWorkoutStructure(fixedWorkout);
            console.log('✅ [DEBUG] AI Parser - Workout structure validation passed');
            
            // Save successful AI response
            await this.saveAIResponse(description, dateToUse, prompt, result, fixedWorkout, true);
            
            console.log(`🎉 [DEBUG] AI Parser - Successfully parsed into workout: "${fixedWorkout.workoutName}"`);
            return fixedWorkout;
            
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

        // Convert workoutDate to proper format and get day name
        const dateObj = new Date(workoutDate);
        const ddmm = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
        const dayNames = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
        const dayName = dayNames[dateObj.getDay()];
        
        // Format date as YYYY-MM-DD for the prompt
        const cleanDate = dateObj.toISOString().split('T')[0];

        return `Analysér beskrivelsen og generér en Garmin workout i ren JSON til addWorkout().

TRÆNINGSDATO: ${cleanDate} (${dayName})
BESKRIVELSE: "${description}"
${workoutName ? `NAVN: "${workoutName}"` : `NAVN: "[treningstype] ${dayName} ${ddmm}"`}

${typeReference}

VIGTIG: STRUKTUR skal være template-baseret, INDHOLD skal være beskrivelse-baseret

NAVN EKSEMPLER:
- "60 min jog" → "jog ${dayName} ${ddmm}"
- "3x 1km 4.05" → "intervaller ${dayName} ${ddmm}" 
- "5km opvarmning + 4x 100m flowløb" → "flowløb ${dayName} ${ddmm}"
- "10km marathon pace" → "marathon pace ${dayName} ${ddmm}"
- "tempo løb 3x 2km" → "tempo ${dayName} ${ddmm}"

ANALYSE DANSKE TRÆNINGSKOMPONENTER:
- "X km opvarmning" = X km distance-based løb uden target (no.target)
- "X km jog" = X km distance-based løb uden target (no.target) - ALTID distance, ALDRIG time
- "X x 100m flowløb" = X gentagelser af (100m no.target + 40 sek pause)
- "X x Y km Z.ZZ" = X intervaller af Y km ved Z:ZZ min/km tempo (pace.zone target)
- "Ym jog imellem" = Y meter distance-based løb uden target mellem intervaller
- "X min pause" = X minutters pause/hvile (time-based recovery step)
- "X km nedløb" = X km distance-based løb uden target (no.target)

PACE HÅNDTERING:
- Pace ranges ("4.05-4.15") = targetType: "pace.zone"
- Enkelt pace ("4.05") = targetType: "pace.zone"
- "jog" eller "let" = targetType: "no.target" (ingen pace target)
- Sæt targetValueOne og targetValueTwo til 0.0 (de fixes programmatisk)

REPEAT GROUPS - BRUG RepeatGroupDTO FOR GENTAGELSER:
- "3x 1km" = 1 RepeatGroupDTO med numberOfIterations: 3, steps: [1km interval, recovery]
- "4x 100m flowløb" = 1 RepeatGroupDTO med numberOfIterations: 4, steps: [100m step, 40 sek rest]
- "1x" eller enkelt aktivitet = ExecutableStepDTO (IKKE RepeatGroupDTO)
- "jog imellem" = recovery step INDEN I repeat group
- "pause imellem" = rest step INDEN I repeat group

HVORNÅR BRUGE RepeatGroupDTO vs ExecutableStepDTO:
- RepeatGroupDTO: KUN når beskrivelsen har "2x", "3x", "4x" etc. (numberOfIterations > 1)
- ExecutableStepDTO: ALLE andre aktiviteter inklusiv:
  * "5 km jog" (enkelt jog)
  * "5 km 4.05-4.15" (enkelt interval med pace)
  * "1 km opvarmning" (enkelt opvarmning)
  * "200m jog imellem" (enkelt recovery)

EKSEMPLER PÅ HVORNÅR BRUGE RepeatGroupDTO:
- "3x 1 km 4.05" ✅ RepeatGroupDTO (numberOfIterations: 3)
- "4x 100m flowløb" ✅ RepeatGroupDTO (numberOfIterations: 4)
- "2x 2 km 4.10" ✅ RepeatGroupDTO (numberOfIterations: 2)

EKSEMPLER PÅ HVORNÅR BRUGE ExecutableStepDTO:
- "5 km jog" ✅ ExecutableStepDTO (ingen gentagelser)
- "5 km 4.05-4.15" ✅ ExecutableStepDTO (enkelt interval)
- "1 km opvarmning" ✅ ExecutableStepDTO (enkelt aktivitet)

STEP TYPES - BRUG KORREKTE ID'ER:
- Running/Intervals: stepType: {"stepTypeId": 3, "stepTypeKey": "interval"}
- Rest/Pause: stepType: {"stepTypeId": 5, "stepTypeKey": "rest"}
- ALDRIG brug stepTypeId: 1 (det er warmup)

HVORNÅR SKAL FORSKELLIGE STEP TYPES BRUGES:
- stepTypeId: 3 ("interval") = alle løb (opvarmning, intervals, nedløb, jog)
- stepTypeId: 5 ("rest") = kun pauser og hvile (40 sek pause, 3 min pause)

TARGET TYPE REGLER:
- Ingen pace nævnt ("10 km", "5 km løb") = targetType: "no.target"
- Pace range ("4.05-4.15") = targetType: "pace.zone" + targetValueOne: 0.0, targetValueTwo: 0.0
- Enkelt pace ("4.05") = targetType: "pace.zone" + targetValueOne: 0.0, targetValueTwo: 0.0
- "jog", "let", "opvarmning", "nedløb" = targetType: "no.target"
- "tempo", "threshold" uden pace = targetType: "no.target" (medmindre pace er specificeret)

BEREGN VARIGHED OG END CONDITION:
- "X km jog" = endCondition: time (2), endConditionValue: X * 360 sekunder (6 min/km)
- "X km opvarmning/nedløb" = endCondition: distance (3), endConditionValue: X * 1000 meter
- "X km i Y.ZZ" = endCondition: distance (3), endConditionValue: X * 1000 meter
- "X min pause" = endCondition: time (2), endConditionValue: X * 60 sekunder
- "100m flowløb" = endCondition: distance (3), endConditionValue: 100 meter

TEMPLATE STRUKTUR:
{
  "workoutName": "[treningstype] ${dayName} ${ddmm}",
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
- Opvarmning/nedløb: ExecutableStepDTO, endCondition=distance, targetType=no.target
- Jog (X km): ExecutableStepDTO, endCondition=time, targetType=no.target
- Enkelt interval (X km Y.ZZ): ExecutableStepDTO, endCondition=distance, targetType=pace.zone
- Gentagne intervaller (2x+): RepeatGroupDTO med numberOfIterations og nested steps
- Pauser: ExecutableStepDTO, endCondition=time, targetType=no.target

VIGTIGT: ALDRIG RepeatGroupDTO for enkelt aktiviteter!
- "5 km 4.05-4.15" = ExecutableStepDTO (ikke RepeatGroupDTO med numberOfIterations: 1)
- "1 km opvarmning" = ExecutableStepDTO (ikke RepeatGroupDTO)
- "3 min pause" = ExecutableStepDTO (ikke RepeatGroupDTO)

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
      "stepType": {"stepTypeId": 3, "stepTypeKey": "interval"},
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
      "stepType": {"stepTypeId": 5, "stepTypeKey": "rest"},
      "endCondition": {"conditionTypeId": [3=distance, 2=time], "conditionTypeKey": "[distance/time]"},
      "endConditionValue": [VÆRDI],
      "targetType": {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target"},
      "strokeType": {"strokeTypeId": 0}, "equipmentType": {"equipmentTypeId": 0}
    }
  ]
}

VIGTIGE RepeatGroupDTO REGLER:
- smartRepeat: ALTID false
- childStepId: ALTID 1
- Nested steps skal have stepOrder 1, 2, 3... inden i repeat group
  "targetValueOne": 0.0,
  "targetValueTwo": 0.0, 
  "strokeType": {"strokeTypeId": 0},
  "equipmentType": {"equipmentTypeId": 0}
}

DETALJERET EKSEMPEL ANALYSE:
Input: "5 km jog, 5 km 4.05-4.15, 5 km jog"

STEP 1: ExecutableStepDTO - 5 km jog (TIME-BASED)
- type: "ExecutableStepDTO", stepOrder: 1
- stepType: {"stepTypeId": 3, "stepTypeKey": "interval"}
- endCondition: {"conditionTypeId": 2, "conditionTypeKey": "time"}
- endConditionValue: 1800 (5 km * 6 min/km = 30 min = 1800 sek)
- targetType: {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target"}

STEP 2: ExecutableStepDTO - 5 km 4.05-4.15 (DISTANCE-BASED, ENKELT INTERVAL)
- type: "ExecutableStepDTO", stepOrder: 2
- stepType: {"stepTypeId": 3, "stepTypeKey": "interval"}
- endCondition: {"conditionTypeId": 3, "conditionTypeKey": "distance"}
- endConditionValue: 5000
- targetType: {"workoutTargetTypeId": 6, "workoutTargetTypeKey": "pace.zone"}
- targetValueOne: 0.0, targetValueTwo: 0.0 (fixes programmatisk)

STEP 3: ExecutableStepDTO - 5 km jog (TIME-BASED)
- type: "ExecutableStepDTO", stepOrder: 3
- stepType: {"stepTypeId": 3, "stepTypeKey": "interval"}
- endCondition: {"conditionTypeId": 2, "conditionTypeKey": "time"}
- endConditionValue: 1800
- targetType: {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target"}

VIGTIGE REGLER:
- "X km jog" = ALTID time-based (endCondition: time)
- "X km Y.ZZ-Y.ZZ" = ALTID distance-based (endCondition: distance) + ExecutableStepDTO
- "X km opvarmning/nedløb" = ALTID distance-based (endCondition: distance)
- Enkelt aktivitet (ingen "Xx") = ExecutableStepDTO
- Gentaget aktivitet ("2x", "3x" etc.) = RepeatGroupDTO

PACE RANGE EKSEMPEL "4.05-4.15":
- targetType: "pace.zone"
- targetValueOne: 0.0, targetValueTwo: 0.0 (beregnes programmatisk)

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
