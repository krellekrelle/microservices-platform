const { GoogleGenAI } = require('@google/genai');
const fs = require('fs').promises;
const path = require('path');
const metricsService = require('./metrics');

/**
 * Intelligent Workout Parser using Gemini AI to convert Danish training descriptions
 * into Garmin Connect workout JSON format using a two-step approach:
 * 1. AI -> simplified intermediate JSON
 * 2. Deterministic code -> Garmin DTO
 */
class IntelligentWorkoutParser {
    constructor() {
        this.ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY
        });
        this.resultsPath = '/app/data';
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
                    promptLength: typeof prompt === 'string' ? prompt.length : JSON.stringify(prompt).length
                },
                response: {
                    rawResponse: rawResponse,
                    parsedWorkout: success ? parsedWorkout : null,
                    error: error
                },
                metadata: {
                    model: 'gemini-1.5-flash',
                    promptType: 'two-step-simplified',
                    responseLength: rawResponse?.length || 0
                }
            };
            
            // Save the response JSON
            await fs.writeFile(filename, JSON.stringify(testResult, null, 2), 'utf-8').catch(e => { /* ignore */ });
            console.log(`💾 [DEBUG] AI Response saved to: ${filename}`);
            
            // Save the prompt text
            if (prompt) {
                const promptText = typeof prompt === 'string' ? prompt : JSON.stringify(prompt, null, 2);
                await fs.writeFile(promptFilename, promptText, 'utf-8').catch(e => { /* ignore */ });
                console.log(`📝 [DEBUG] AI Prompt saved to: ${promptFilename}`);
            }
        } catch (saveError) {
            console.error('❌ Failed to save AI response:', saveError);
        }
    }

    /**
     * Helper: Convert pace string to m/s
     */
    paceToMs(paceStr) {
        if (!paceStr) return 0.0;
        try {
            const parts = paceStr.split(':').map(Number);
            const totalSecondsPerKm = (parts[0] * 60) + parts[1];
            if (isNaN(totalSecondsPerKm) || totalSecondsPerKm === 0) return 0.0;
            return Number((1000 / totalSecondsPerKm).toFixed(3));
        } catch (e) {
            return 0.0;
        }
    }

    /**
     * Helper: Convert time string to total seconds
     */
    timeToSeconds(timeStr) {
        if (!timeStr) return 0;
        const parts = timeStr.split(':').map(Number);
        if (parts.length === 2) {
            return parts[0] * 60 + parts[1];
        }
        if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        return 0;
    }

    /**
     * Helper: Create single executable step based on intermediate JSON
     */
    createExecutableStep(step, order) {
        const typeMap = {
            "run": { key: "interval", id: 3 }, 
            "warmup": { key: "warmup", id: 1 }, 
            "recover": { key: "recovery", id: 4 }, 
            "rest": { key: "rest", id: 5 }, 
            "cool_down": { key: "cool.down", id: 2 }, 
            "interval": { key: "interval", id: 3 }
        };
        
        // Read from step_type first, fallback to type
        const stepTypeInput = step.step_type || step.type || "interval";
        const stepTypeObj = typeMap[stepTypeInput] || typeMap["interval"];
        
        const isDistance = step.type === 'distance' || typeof step.duration === 'number';
        const targetTypeInput = (step.target && step.target.type) ? step.target.type : (typeof step.target === 'string' ? step.target : "no_target");
        
        // Map target
        const targetTypeKey = targetTypeInput === "pace" ? "pace.zone" : "no.target";
        const targetTypeId = targetTypeKey === "pace.zone" ? 6 : 1;
        
        let targetValueOne = 0.0;
        let targetValueTwo = 0.0;
        
        // The new schema uses pace_range
        if (targetTypeKey === "pace.zone") {
            const range = step.pace_range || step.target || {};
            const highMs = this.paceToMs(range.high); // faster pace -> higher m/s
            const lowMs = this.paceToMs(range.low);   // slower pace -> lower m/s
            
            // Ensure proper ordering of m/s for Garmin API (targetValueOne is slower, targetValueTwo is faster)
            targetValueOne = highMs;
            targetValueTwo = lowMs;
        }
        
        let durationValue = 0;
        if (isDistance) {
            durationValue = typeof step.duration === 'number' ? Math.round(step.duration * 1000) : 0;
            // Fallback for strings representing distance
            if (!durationValue && typeof step.duration === 'string') {
                durationValue = Math.round(parseFloat(step.duration) * 1000);
            }
        } else {
            durationValue = this.timeToSeconds(step.duration);
        }
        
        return {
            type: "ExecutableStepDTO",
            stepOrder: order,
            stepType: { 
                stepTypeKey: stepTypeObj.key,
                stepTypeId: stepTypeObj.id 
            },
            endCondition: { 
                conditionTypeKey: isDistance ? "distance" : "time",
                conditionTypeId: isDistance ? 3 : 2
            },
            endConditionValue: durationValue || 0,
            ...(isDistance && { preferredEndConditionUnit: { unitKey: "kilometer" } }),
            targetType: { 
                workoutTargetTypeKey: targetTypeKey,
                workoutTargetTypeId: targetTypeId
            },
            targetValueOne: targetValueOne,
            targetValueTwo: targetValueTwo
        };
    }

    /**
     * Convert intermediate simplified AI JSON to full Garmin DTO structure.
     */
    convertAIToGarmin(aiWorkout, workoutDate, requestedName, rawDescription = null) {
        // Build an elegant name if none was supplied
        let defaultName = aiWorkout.workout_name || "Træning";
        if (workoutDate) {
            // JS parses "YYYY-MM-DD" as UTC midnight. If queried in a timezone behind UTC (or if dates 
            // arrived slightly offset), .getDate() can shift back to 23:00 on the previous day. 
            // Appending T12:00:00 anchors the parsed Date to local noon, ensuring it stays on the target day.
            const dateStr = workoutDate.includes('T') ? workoutDate : `${workoutDate}T12:00:00`;
            const dateObj = new Date(dateStr);
            const ddmm = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
            const dayNames = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
            const dayName = dayNames[dateObj.getDay()];
            defaultName = `[${aiWorkout.workout_name || 'Løb'}] ${dayName} ${ddmm}`;
        }
        
        const finalName = requestedName || aiWorkout.workout_name || defaultName;

        const currentDate = new Date().toISOString();

        const garminDto = {
            workoutName: finalName,
            description: rawDescription || "Parsed via Gemini AI",
            updateDate: currentDate,
            createdDate: currentDate,
            sportType: { sportTypeId: 1, sportTypeKey: "running" },
            workoutSegments: [{
                segmentOrder: 1,
                sportType: { sportTypeId: 1, sportTypeKey: "running" },
                workoutSteps: []
            }]
        };
        
        const targetSteps = garminDto.workoutSegments[0].workoutSteps;
        
        (aiWorkout.steps || []).forEach((step, index) => {
            const stepOrder = index + 1;
            
            // Check for new schema: { repetition: { count, steps: [] } }
            if (step.repetition) {
                const childSteps = (step.repetition.steps || []).map((s, j) => this.createExecutableStep(s, j + 1));
                targetSteps.push({
                    type: "RepeatGroupDTO",
                    stepOrder: stepOrder,
                    numberOfIterations: step.repetition.count || 1,
                    smartRepeat: false,
                    workoutSteps: childSteps
                });
            } 
            // Fallback for old schema: { type: "repetition", count, steps: [] }
            else if (step.type === "repetition" || step.step_type === "repetition") {
                const childSteps = (step.steps || []).map((s, j) => this.createExecutableStep(s, j + 1));
                targetSteps.push({
                    type: "RepeatGroupDTO",
                    stepOrder: stepOrder,
                    numberOfIterations: step.count || 1,
                    smartRepeat: false,
                    workoutSteps: childSteps
                });
            } else {
                targetSteps.push(this.createExecutableStep(step, stepOrder));
            }
        });
            
        return garminDto;
    }

    /**
     * Validate that the parsed workout has the required Garmin structure
     */
    validateWorkoutStructure(workout) {
        const required = ['workoutName', 'sportType', 'workoutSegments'];
        const missing = required.filter(field => !workout[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required fields in Garmin DTO: ${missing.join(', ')}`);
        }

        if (!workout.workoutSegments[0]?.workoutSteps?.length) {
            throw new Error('Workout must have at least one workout step');
        }
    }

    /**
     * Helper to compute estimated distance in meters and time in seconds from steps
     */
    calculateWorkoutTotals(garminWorkout) {
        let totalDistanceMeters = 0;
        let totalTimeSeconds = 0;
        const defaultPaceSecondsPerKm = 330; // 5:30/km fallback

        const processStep = (step) => {
            const type = step.endCondition?.conditionTypeKey;
            const value = step.endConditionValue || 0;
            
            let avgMs = 0;
            if (step.targetValueOne && step.targetValueTwo) {
                // targetValueOne and Two are in m/s
                avgMs = (step.targetValueOne + step.targetValueTwo) / 2;
            }
            
            let paceSecondsPerKm = defaultPaceSecondsPerKm;
            if (avgMs > 0) {
                paceSecondsPerKm = 1000 / avgMs;
            }

            if (type === 'distance') {
                const distMeters = value;
                totalDistanceMeters += distMeters;
                totalTimeSeconds += (distMeters / 1000) * paceSecondsPerKm;
            } else if (type === 'time') {
                const timeSecs = value;
                totalTimeSeconds += timeSecs;
                totalDistanceMeters += (timeSecs / paceSecondsPerKm) * 1000;
            }
        };

        const steps = garminWorkout.workoutSegments?.[0]?.workoutSteps || [];
        for (const step of steps) {
            if (step.type === 'RepeatGroupDTO' || step.type === 'RepeatGroup') {
                const iterations = step.numberOfIterations || 1;
                const preDist = totalDistanceMeters;
                const preTime = totalTimeSeconds;
                
                for (const child of (step.workoutSteps || [])) {
                    processStep(child);
                }
                
                const deltaDist = totalDistanceMeters - preDist;
                const deltaTime = totalTimeSeconds - preTime;
                
                // processStep already added one iteration, so add the rest
                totalDistanceMeters += deltaDist * (iterations - 1);
                totalTimeSeconds += deltaTime * (iterations - 1);
            } else {
                processStep(step);
            }
        }

        return {
            distanceKm: Number((totalDistanceMeters / 1000).toFixed(2)),
            durationMinutes: Math.round(totalTimeSeconds / 60)
        };
    }

    /**
     * Main entry point: Convert a Danish training description into Garmin workout JSON
     * @param {string} description - Danish training description
     * @param {string} workoutDate - Date for the workout (YYYY-MM-DD)
     * @param {string} workoutName - Optional workout name
     * @returns {Object} Garmin workout JSON
     */
    async parseTrainingDescription(description, workoutDate = null, workoutName = null) {
        console.log('🤖 [DEBUG] AI Parser - Starting parseTrainingDescription (Two-Step Approach)');
        console.log(`📝 [DEBUG] AI Parser - Description: "${description}"`);
        console.log(`📅 [DEBUG] AI Parser - Date: "${workoutDate || 'Current date'}"`);
        console.log(`🏷️ [DEBUG] AI Parser - Workout Name: "${workoutName || 'Auto-generated'}"`);
        
        const dateToUse = workoutDate || new Date().toISOString().split('T')[0];

        const systemInstruction = `### Role
Expert Running Coach & Data Engineer. Your task is to translate Danish workout descriptions into a strictly formatted Garmin JSON structure. 

### Target JSON Structure (Template)
{
  "workout_name": "String",
  "steps": [
    {
      "type": "warmup | run | recover | rest | cool_down",
      "duration": 5.0, // Float: km (distance) OR String: "hh:mm:ss" (time)
      "target": { 
        "type": "no_target | pace", 
        "low": "mm:ss", // Slower pace limit (optional)
        "high": "mm:ss" // Faster pace limit (optional)
      }
    },
    {
      "type": "repetition",
      "count": 3, // Integer only
      "steps": [
        {
          "type": "run | recover",
          "duration": "00:04:00", 
          "target": { 
            "type": "pace", 
            "low": "04:25", 
            "high": "04:05" 
          }
        }
      ]
    }
  ]
}

### CRITICAL LOGIC RULES
1. **Pace Range Math**: 
   - Single pace (e.g., 4:15) -> Low: 04:25 (+10s), High: 04:05 (-10s).
   - Range (4:20-4:30) -> Low: 04:30, High: 04:20.
   - 'High' MUST be the FASTEST pace (the lower time value).
2. **Step Type Alternation**: In any repetition (Kenyaløb, Intervaller), the steps MUST have different \`type\` values (e.g., \`run\` followed by \`recover\`). Never use \`run\` for both steps in a cycle.
3. **Recovery Placement**: 
   - If "jog imellem" or "pause" is mentioned either inside or outside parentheses or as part of a repeating set, place it INSIDE the \`repetition\` block. Be aware that the rest/recovery can be on the next line, but is still part of the \`repetition\` block.
4. **Sequence Expansion & Progressive**: 
   - If a sequence is unique and non-repeating (e.g., "1, 2, 3, 2, 1 min"), write every step individually. NEVER use the word "dynamic" for counts.
   - If "progressiv" has explicitly listed paces (e.g., "(4.00, 3.50, 3.40)"), create distinct 'run' steps for each pace explicitly.

### Danish Terminology Lookup
- "flowløb": Repetition: (Run 0.1km, no_target) + (Rest 00:00:40).
- "kenyaløb": Repetition of alternating Run/Recover steps. Calculate 'count' based on total duration provided (Total Time / Cycle Time). Always use 'no_target'.
- "dynamisk stræk": 5 min rest step (00:05:00).
- "jog", "rolig", "let løb": Step 'recover', no_target.
- "stående pause": Step 'rest', no_target.
- "nedløb" / "afjog": Step 'cool_down'.
- "fuld pedal": step 'run', no target.

### Technical Constraints
- **Strict Schema**: Use ONLY the keys provided in the template (\`type\`, \`duration\`, \`target\`, \`repetition\`, \`count\`).
- **Formatting**: Time must be \`hh:mm:ss\`. Distance must be a float with one decimal (e.g., 4.0).
- **Output**: Return ONLY the JSON object. No conversational text.`;

        const promptMessages = [{ role: 'user', content: description }];
        
        try {
            console.log('🚀 [DEBUG] AI Parser - Sending request to Gemini API...');

            const completion = await this.ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: description,
                config: {
                    systemInstruction: systemInstruction,
                    responseMimeType: "application/json",
                    temperature: 0,
                }
            });
            
            // Track AI prompt usage
            await metricsService.recordAIPrompt();
            
            console.log('✅ [DEBUG] AI Parser - Received response from Gemini API');
            
            const result = completion.text;
            if (!result) {
                throw new Error('No response from Gemini API');
            }

            console.log(`📄 [DEBUG] AI Parser - Intermediate response length: ${result.length} characters`);

            const intermediateWorkout = JSON.parse(result);
            console.log('🔍 [DEBUG] AI Parser - Intermediate JSON parsing successful');
            
            // Step 2: Convert to Garmin DTO
            const garminWorkout = this.convertAIToGarmin(intermediateWorkout, dateToUse, workoutName, description);
            console.log('🎯 [DEBUG] AI Parser - Converted to final Garmin DTO natively');
            
            this.validateWorkoutStructure(garminWorkout);
            console.log('✅ [DEBUG] AI Parser - Garmin workout structure validation passed');
            
            // Calculate totals
            const totals = this.calculateWorkoutTotals(garminWorkout);
            garminWorkout.estimatedDistanceInMeters = Math.round(totals.distanceKm * 1000);
            garminWorkout.estimatedDurationInSecs = totals.durationMinutes * 60;
            console.log(`⏱️ [DEBUG] AI Parser - Calculated totals: ${totals.distanceKm}km, ${totals.durationMinutes}min`);

            // Save successful AI response
            await this.saveAIResponse(description, dateToUse, promptMessages, result, garminWorkout, true);
            
            console.log(`🎉 [DEBUG] AI Parser - Successfully generated workout: "${garminWorkout.workoutName}"`);
            return {
                garminWorkout,
                promptMessages,
                rawResponse: result,
                distanceKm: totals.distanceKm,
                durationMinutes: totals.durationMinutes
            };
            
        } catch (error) {
            console.error('❌ [DEBUG] AI Parser - Parsing failed:', error.message);
            console.error('❌ [DEBUG] AI Parser - Full error:', error);
            
            const errorResult = null;
            await this.saveAIResponse(description, dateToUse, promptMessages, errorResult, null, false, error.message);
            
            let failurePoint = 'Unknown error';
            let detailedError = error.message;
            
            if (error.message.includes('Request too large')) {
                failurePoint = 'Prompt too large for model token limit';
            } else if (error.message.includes('Unexpected token') || error.name === 'SyntaxError') {
                failurePoint = 'Invalid JSON response from LLM';
                detailedError = 'The LLM returned malformed JSON. The model may need better prompting or different parameters.';
            } else if (error.message.includes('Missing required fields')) {
                failurePoint = 'Conversion generated incomplete workout structure';
                detailedError = `The structural conversion missed fields: ${error.message}`;
            } else if (error.message.includes('workout must have at least one workout step')) {
                failurePoint = 'Conversion generated workout without steps';
                detailedError = 'The intermediate JSON or parser created a workout with no valid steps.';
            } else if (error.message.includes('rate limit')) {
                failurePoint = 'API rate limit exceeded';
                detailedError = 'Too many requests to the LLM API. Please wait before trying again.';
            }
            
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
}

module.exports = IntelligentWorkoutParser;
