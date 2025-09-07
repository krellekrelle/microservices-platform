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
                    model: 'llama-3.1-8b-instant',
                    promptType: 'danish-direct',
                    responseLength: rawResponse?.length || 0
                }
            };
            
            await fs.writeFile(filename, JSON.stringify(testResult, null, 2), 'utf-8');
            console.log(`💾 [DEBUG] AI Response saved to: ${filename}`);
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
                model: 'llama-3.1-8b-instant', // Using the working model with 8K token limit
                temperature: 0.1, // Low temperature for consistent parsing
                max_tokens: 2000, // Reduced tokens for faster response
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
            
            // Validate the parsed workout has required structure
            this.validateWorkoutStructure(parsedWorkout);
            console.log('✅ [DEBUG] AI Parser - Workout structure validation passed');
            
            // Save successful AI response
            await this.saveAIResponse(description, dateToUse, prompt, result, parsedWorkout, true);
            
            console.log(`🎉 [DEBUG] AI Parser - Successfully parsed into workout: "${parsedWorkout.workoutName}"`);
            return parsedWorkout;
            
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
     * Create an optimized few-shot learning prompt with minimal examples
     */
    createDanishPrompt(description, workoutDate, workoutName) {
        // Include the full addWorkoutTypes TypeScript definitions for reference
        const typeReference = this.addWorkoutTypes 
            ? `\nTYPE DEFINITIONS:\n${this.addWorkoutTypes}\n`
            : '';

        return `Generér en Garmin workout i ren JSON (uden tekst, forklaring eller kodeblok-syntax) i formatet IWorkoutDetail.

DATO: ${workoutDate}
BESKRIVELSE: "${description}"
${workoutName ? `NAVN: "${workoutName}"` : 'NAVN: Generér dansk navn baseret på beskrivelsen'}

${typeReference}

Vigtige regler:
1. Returner kun gyldig JSON uden yderligere tekst eller formatering
2. Brug IWorkoutDetail strukturen med alle nødvendige felter
3. Konverter danske tider som "4.05" til korrekte målværdier
4. Brug dato: ${workoutDate} for både updateDate og createdDate
5. Standard sportType for løb: {sportTypeId: 1, sportTypeKey: "running"}
6. Inkludér workoutSegments med workoutSteps
7. Beregn estimatedDurationInSecs og estimatedDistanceInMeters baseret på beskrivelsen

Returner kun JSON uden yderligere tekst.`;
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
