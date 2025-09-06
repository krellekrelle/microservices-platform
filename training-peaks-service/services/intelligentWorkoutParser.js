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
    }

    /**
     * Load training examples and type definitions for few-shot learning
     */
    async loadContext() {
        if (this.examples && this.types) {
            console.log('🔄 [DEBUG] loadContext - Already loaded, skipping');
            return; // Already loaded
        }

        console.log('📂 [DEBUG] loadContext - Loading context from:', this.contextPath);
        
        try {
            // Load all training examples
            const examples = [];
            for (let i = 1; i <= 4; i++) {
                console.log(`📄 [DEBUG] loadContext - Loading example ${i}`);
                const description = await fs.readFile(
                    path.join(this.contextPath, `description${i}.txt`), 
                    'utf-8'
                );
                const example = await fs.readFile(
                    path.join(this.contextPath, `example${i}.json`), 
                    'utf-8'
                );
                
                examples.push({
                    description: description.trim(),
                    workout: JSON.parse(example)
                });
            }

            // Load Garmin types
            console.log('🏷️ [DEBUG] loadContext - Loading types.json');
            const typesData = await fs.readFile(
                path.join(this.contextPath, 'types.json'), 
                'utf-8'
            );

            this.examples = examples;
            this.types = JSON.parse(typesData);
            
            console.log(`✅ Loaded ${examples.length} training examples for LLM context`);
            console.log('🔍 [DEBUG] loadContext - Types keys:', Object.keys(this.types));
        } catch (error) {
            console.error('❌ Failed to load LLM context:', error);
            console.error('❌ Context path:', this.contextPath);
            throw new Error('Unable to load training examples for workout parsing');
        }
    }

    /**
     * Convert a Danish training description into Garmin workout JSON
     * @param {string} description - Danish training description
     * @param {string} workoutName - Optional workout name
     * @returns {Object} Garmin workout JSON
     */
    async parseTrainingDescription(description, workoutName = null) {
        console.log('🤖 [DEBUG] AI Parser - Starting parseTrainingDescription');
        console.log(`📝 [DEBUG] AI Parser - Description: "${description}"`);
        console.log(`🏷️ [DEBUG] AI Parser - Workout Name: "${workoutName || 'Auto-generated'}"`);
        
        await this.loadContext();

        const prompt = this.createFewShotPrompt(description, workoutName);
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
            
            console.log(`🎉 [DEBUG] AI Parser - Successfully parsed into workout: "${parsedWorkout.workoutName}"`);
            return parsedWorkout;
            
        } catch (error) {
            console.error('❌ [DEBUG] AI Parser - Parsing failed:', error.message);
            console.error('❌ [DEBUG] AI Parser - Full error:', error);
            
            // Fallback to a simple workout structure
            console.log('🔄 [DEBUG] AI Parser - Using fallback workout');
            return this.createFallbackWorkout(description, workoutName);
        }
    }

    /**
     * Create an optimized few-shot learning prompt with minimal examples
     */
    createFewShotPrompt(description, workoutName) {
        // Debug logging
        console.log('🔍 [DEBUG] createFewShotPrompt - this.examples:', !!this.examples);
        console.log('🔍 [DEBUG] createFewShotPrompt - this.types:', !!this.types);
        console.log('🔍 [DEBUG] createFewShotPrompt - this.types keys:', this.types ? Object.keys(this.types) : 'undefined');
        
        if (!this.types) {
            throw new Error('Types not loaded - loadContext() may have failed');
        }
        
        // Use only the most relevant examples (reduced from 4 to 2)
        const selectedExamples = this.examples.slice(2, 4);
        
        const examplePrompts = selectedExamples.map((ex, index) => 
            `EXAMPLE ${index + 1}:
Danish: "${ex.description}"
JSON: ${JSON.stringify(ex.workout)}`
        ).join('\n\n');

        // Minimal types - only the essential ones
        const essentialTypes = {
            stepTypes: this.types.stepTypes ? this.types.stepTypes.filter(t => ['warmup', 'cooldown', 'interval', 'recovery', 'rest'].includes(t.stepTypeName)) : [],
            workoutTargetTypes: this.types.workoutTargetTypes ? this.types.workoutTargetTypes.filter(t => ['no.target', 'pace.zone', 'heart.rate.zone'].includes(t.workoutTargetTypeName)) : [],
            conditionTypes: this.types.conditionTypes ? this.types.conditionTypes.filter(t => ['time', 'distance'].includes(t.conditionTypeName)) : []
        };

        return `Convert Danish running description to Garmin workout JSON.

TYPES: ${JSON.stringify(essentialTypes)}

EXAMPLES:
${examplePrompts}

RULES:
1. Danish pace "4.05" = 4:05 min/km = 245 sec/km = convert to m/s for targetValue
2. "jog" = no.target (workoutTargetTypeId: 1)
3. Specific paces = pace.zone (workoutTargetTypeId: 6)
4. Always sportType: running (sportTypeId: 1)
5. stepOrder increments for each step
6. Use distance (conditionTypeId: 3) or time (conditionTypeId: 2)

TARGET: "${description}"
${workoutName ? `NAME: "${workoutName}"` : 'NAME: Generate Danish name'}

Return ONLY valid JSON, no formatting.`;
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
     * Create a fallback workout if LLM parsing fails
     */
    createFallbackWorkout(description, workoutName) {
        console.log('🔄 Creating fallback workout structure');
        
        return {
            workoutName: workoutName || 'Træning fra TrainingPeaks',
            description: description,
            sportType: {
                sportTypeId: 1,
                sportTypeKey: 'running',
                displayOrder: 1
            },
            estimatedDurationInSecs: 3600, // 1 hour default
            estimatedDistanceInMeters: 10000, // 10km default
            avgTrainingSpeed: 3.33, // ~5:00 min/km pace
            estimateType: 'TIME_ESTIMATED',
            workoutSegments: [{
                segmentOrder: 1,
                sportType: {
                    sportTypeId: 1,
                    sportTypeKey: 'running',
                    displayOrder: 1
                },
                workoutSteps: [{
                    type: 'ExecutableStepDTO',
                    stepOrder: 1,
                    stepType: {
                        stepTypeId: 3,
                        stepTypeKey: 'interval',
                        displayOrder: 3
                    },
                    endCondition: {
                        conditionTypeId: 3,
                        conditionTypeKey: 'distance',
                        displayOrder: 3,
                        displayable: true
                    },
                    endConditionValue: 10000,
                    targetType: {
                        workoutTargetTypeId: 1,
                        workoutTargetTypeKey: 'no.target',
                        displayOrder: 1
                    },
                    targetValueOne: null,
                    targetValueTwo: null,
                    description: description
                }]
            }],
            estimatedDistanceUnit: {
                unitId: 2,
                unitKey: 'kilometer',
                factor: 100000.0
            }
        };
    }

    /**
     * Test the parser with the provided examples
     */
    async testWithExamples() {
        await this.loadContext();
        
        console.log('🧪 Testing workout parser with provided examples...');
        
        for (let i = 0; i < this.examples.length; i++) {
            const example = this.examples[i];
            console.log(`\n--- Testing Example ${i + 1} ---`);
            console.log(`Description: "${example.description}"`);
            
            try {
                const parsed = await this.parseTrainingDescription(
                    example.description, 
                    `Test Workout ${i + 1}`
                );
                console.log(`✅ Successfully parsed example ${i + 1}`);
                console.log(`Generated workout: ${parsed.workoutName}`);
                console.log(`Steps: ${parsed.workoutSegments[0].workoutSteps.length}`);
            } catch (error) {
                console.error(`❌ Failed to parse example ${i + 1}:`, error.message);
            }
        }
    }
}

module.exports = IntelligentWorkoutParser;
