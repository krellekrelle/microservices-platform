const Groq = require('groq-sdk');
const fs = require('fs').promises;
const path = require('path');
const metricsService = require('./metrics');

/**
 * Intelligent Workout Parser using Groq AI to convert Danish training descriptions
 * into Garmin Connect workout JSON format using a two-step approach:
 * 1. AI -> simplified intermediate JSON
 * 2. Deterministic code -> Garmin DTO
 */
class IntelligentWorkoutParser {
    constructor() {
        this.groq = new Groq({
            apiKey: process.env.GROQ_API_KEY
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
                    model: 'openai/gpt-oss-120b',
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
            "run": "interval", 
            "warmup": "warmup", 
            "recover": "recovery", 
            "rest": "rest", 
            "cool_down": "cool.down", 
            "interval": "interval"
        };
        
        // Read from step_type first, fallback to type
        const stepTypeInput = step.step_type || step.type || "interval";
        const isDistance = step.type === 'distance' || typeof step.duration === 'number';
        const targetTypeInput = step.target || "no_target";
        
        // Map target
        const targetType = targetTypeInput === "pace" ? "pace.zone" : "no.target";
        
        let targetValueOne = 0.0;
        let targetValueTwo = 0.0;
        
        // The new schema uses pace_range
        if (targetType === "pace.zone") {
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
            stepType: { stepTypeKey: typeMap[stepTypeInput] || "interval" },
            endCondition: { conditionTypeKey: isDistance ? "distance" : "time" },
            endConditionValue: durationValue || 0,
            targetType: { workoutTargetTypeKey: targetType },
            targetValueOne: targetValueOne,
            targetValueTwo: targetValueTwo,
            strokeType: { strokeTypeId: 0 },
            equipmentType: { equipmentTypeId: 0 }
        };
    }

    /**
     * Convert intermediate simplified AI JSON to full Garmin DTO structure.
     */
    convertAIToGarmin(aiWorkout, workoutDate, requestedName) {
        // Build an elegant name if none was supplied
        let defaultName = aiWorkout.workout_name || "Træning";
        if (workoutDate) {
            const dateObj = new Date(workoutDate);
            const ddmm = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
            const dayNames = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
            const dayName = dayNames[dateObj.getDay()];
            defaultName = `[${aiWorkout.workout_name || 'Løb'}] ${dayName} ${ddmm}`;
        }
        
        const finalName = requestedName || aiWorkout.workout_name || defaultName;

        const currentDate = new Date().toISOString();

        const garminDto = {
            workoutName: finalName,
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

        const promptMessages = [
            {
                role: "system",
                content: "### Role\nExpert Running Coach & Data Parser. Convert Danish text to Garmin JSON.\n\n### Special Movement Logic\n- \"flowløb\": Repetition (Run 0.1km, no_target) + (Rest 00:00:40).\n- \"kenyaløb\": Detect the alternating time pattern (e.g., 1+1 or 2+2). Create a 'repetition' block. Count = Total Time / (Sum of one cycle). Target is always 'no_target'.\n- \"dynamisk stræk\": Step 'rest', 00:05:00.\n- \"jog/rolig/let\": Step 'recover', no_target.\n- \"fartleg\": Step 'run', no_target.\n\n### Technical Constraints\n1. **Pace Calculation**: \n   - Single pace (4:30) -> Range: Low 04:40, High 04:20.\n   - Range given (4:20-4:30) -> Use as is.\n   - No pace given -> target: \"no_target\".\n2. **Implied Math**: \n   - If \"12km total\" is \"1km fast/1km slow\", create repetition count: 6.\n   - If \"14 min total\" is \"1min/1min\", create repetition count: 7.\n3. **Format**: JSON only. No links, no conversational filler.\n\n### Schema\n{\n  \"workout_name\": \"string\",\n  \"steps\": [\n    {\n      \"step_type\": \"warmup|run|recover|rest|cool_down\",\n      \"type\": \"time|distance|lap_button\",\n      \"duration\": \"hh:mm:ss OR float(km)\",\n      \"target\": \"no_target|pace\",\n      \"pace_range\": { \"low\": \"mm:ss\", \"high\": \"mm:ss\" }\n    },\n    { \"repetition\": { \"count\": int, \"steps\": [ ... ] } }\n  ]\n}\n\n\"3 km opvarmning\n4x 100 meter flowløb\n2 km 4.20- 4.30\n2 min stående pause\n14 min kenyaløb ( skiftevis 1 min hurtigt, 1 min jog osv..)\n2 km 4.20- 4.30\n3 km nedløb\"\n\n\n"
            },
            {
                role: "user",
                content: description
            }
        ];
        
        try {
            console.log('🚀 [DEBUG] AI Parser - Sending request to Groq API...');

            const completion = await this.groq.chat.completions.create({
                model: "openai/gpt-oss-120b",
                messages: promptMessages,
                temperature: 0,
                max_completion_tokens: 8192/2,
                top_p: 1,
                reasoning_effort: "medium",
                stream: false,
                response_format: { type: 'json_object' },
                stop: null
            });
            
            // Track AI prompt usage
            await metricsService.recordAIPrompt();
            
            console.log('✅ [DEBUG] AI Parser - Received response from Groq API');
            
            const result = completion.choices[0]?.message?.content;
            if (!result) {
                throw new Error('No response from Groq API');
            }

            console.log(`📄 [DEBUG] AI Parser - Intermediate response length: ${result.length} characters`);

            const intermediateWorkout = JSON.parse(result);
            console.log('🔍 [DEBUG] AI Parser - Intermediate JSON parsing successful');
            
            // Step 2: Convert to Garmin DTO
            const garminWorkout = this.convertAIToGarmin(intermediateWorkout, dateToUse, workoutName);
            console.log('🎯 [DEBUG] AI Parser - Converted to final Garmin DTO natively');
            
            this.validateWorkoutStructure(garminWorkout);
            console.log('✅ [DEBUG] AI Parser - Garmin workout structure validation passed');
            
            // Save successful AI response
            await this.saveAIResponse(description, dateToUse, promptMessages, result, garminWorkout, true);
            
            console.log(`🎉 [DEBUG] AI Parser - Successfully generated workout: "${garminWorkout.workoutName}"`);
            return garminWorkout;
            
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
