#!/usr/bin/env node

const fs = require('fs').promises;
const { JSDOM } = require('jsdom');

/**
 * Standalone HTML parser for TrainingPeaks calendar data
 * Usage: node html-parser.js [path-to-html-file]
 */

async function parseTrainingPeaksHtml(htmlFilePath) {
    try {
        console.log(`📁 Reading HTML file: ${htmlFilePath}`);
        const htmlContent = await fs.readFile(htmlFilePath, 'utf8');
        
        const dom = new JSDOM(htmlContent);
        const document = dom.window.document;
        
        console.log('🔍 Analyzing HTML structure...');
        
        // Debug: Find all week containers
        const weekContainers = document.querySelectorAll('div.calendarWeekContainer');
        console.log(`📅 Found ${weekContainers.length} week containers:`);
        weekContainers.forEach((container, index) => {
            const dataDate = container.getAttribute('data-date');
            console.log(`  ${index + 1}. data-date: ${dataDate}`);
        });
        
        // Debug: Find all day containers
        const dayContainers = document.querySelectorAll('div.dayContainer');
        console.log(`📊 Found ${dayContainers.length} day containers:`);
        dayContainers.forEach((container, index) => {
            const dataDate = container.getAttribute('data-date');
            const dayText = container.querySelector('.MuiTypography-caption')?.textContent?.trim();
            console.log(`  ${index + 1}. data-date: ${dataDate}, text: ${dayText}`);
        });
        
        // Debug: Find all workout cards
        const workoutCards = document.querySelectorAll('div.activity.workout');
        console.log(`🏃 Found ${workoutCards.length} workout cards:`);
        workoutCards.forEach((card, index) => {
            const workoutId = card.getAttribute('data-workoutid');
            const title = card.querySelector('h6.newActivityUItitle')?.textContent?.trim();
            const sportType = card.querySelector('.printOnly.sportType')?.textContent?.trim();
            console.log(`  ${index + 1}. ID: ${workoutId}, Title: ${title}, Sport: ${sportType}`);
        });
        
        // Now try to extract the actual workout data
        console.log('\n🎯 Extracting workout data for September 1-7, 2025...');
        
        const weekData = [];
        const targetDates = ['2025-09-01', '2025-09-02', '2025-09-03', '2025-09-04', '2025-09-05', '2025-09-06', '2025-09-07'];
        
        for (const date of targetDates) {
            console.log(`\n📅 Processing ${date}...`);
            
            const dayContainer = document.querySelector(`div.dayContainer[data-date="${date}"]`);
            if (!dayContainer) {
                console.log(`❌ No day container found for ${date}`);
                weekData.push({ date, workouts: [] });
                continue;
            }
            
            const dayWorkouts = [];
            const workoutCards = dayContainer.querySelectorAll('div.activity.workout');
            
            console.log(`  Found ${workoutCards.length} workout cards`);
            
            workoutCards.forEach((card, cardIndex) => {
                try {
                    const workout = extractWorkoutFromCard(card);
                    if (workout) {
                        dayWorkouts.push(workout);
                        console.log(`  ✅ Workout ${cardIndex + 1}: ${workout.title}`);
                        if (workout.description) {
                            console.log(`     📝 Description: ${workout.description.substring(0, 100)}...`);
                        }
                    }
                } catch (error) {
                    console.log(`  ❌ Error extracting workout ${cardIndex + 1}:`, error.message);
                }
            });
            
            weekData.push({ date, workouts: dayWorkouts });
        }
        
        // Output the final result
        console.log('\n📊 Final extracted data:');
        console.log(JSON.stringify(weekData, null, 2));
        
        // Save extracted data to JSON file
        const outputFile = htmlFilePath.replace('.html', '_extracted.json');
        await fs.writeFile(outputFile, JSON.stringify(weekData, null, 2), 'utf8');
        console.log(`\n💾 Saved extracted data to: ${outputFile}`);
        
        return weekData;
        
    } catch (error) {
        console.error('❌ Error parsing HTML:', error);
        throw error;
    }
}

function extractWorkoutFromCard(card) {
    const workout = {};
    
    // Extract workout ID
    workout.id = card.getAttribute('data-workoutid');
    
    // Extract sport type
    const sportTypeElement = card.querySelector('.printOnly.sportType');
    if (sportTypeElement) {
        workout.sport = sportTypeElement.textContent.trim();
    }
    
    // Extract title
    const titleElement = card.querySelector('h6.newActivityUItitle');
    if (titleElement) {
        workout.title = titleElement.textContent.trim();
    }
    
    // Extract key stats (duration, distance, TSS)
    const keyStats = card.querySelector('.keyStats');
    if (keyStats) {
        // Duration
        const durationElement = keyStats.querySelector('.duration .value');
        if (durationElement) {
            workout.duration = durationElement.textContent.trim();
        }
        
        // Distance
        const distanceValueElement = keyStats.querySelector('.distance .value');
        const distanceUnitsElement = keyStats.querySelector('.distance .units');
        if (distanceValueElement) {
            const value = distanceValueElement.textContent.trim();
            const units = distanceUnitsElement ? distanceUnitsElement.textContent.trim() : '';
            workout.distance = `${value}${units}`;
        }
        
        // TSS
        const tssValueElement = keyStats.querySelector('.tss .value');
        const tssUnitsElement = keyStats.querySelector('.tss .units');
        if (tssValueElement) {
            const value = tssValueElement.textContent.trim();
            const units = tssUnitsElement ? tssUnitsElement.textContent.trim() : '';
            workout.tss = `${value}${units}`;
        }
    }
    
    // Extract description (from .userPreferredFields or .printOnly.description)
    let descriptionElement = card.querySelector('.userPreferredFields .description');
    if (!descriptionElement) {
        descriptionElement = card.querySelector('.printOnly.description');
    }
    if (descriptionElement) {
        workout.description = descriptionElement.textContent.trim();
    }
    
    // Extract planned info
    const plannedElement = card.querySelector('.totalTimePlanned');
    if (plannedElement) {
        workout.planned = plannedElement.textContent.trim();
    }
    
    // Determine workout type
    if (workout.title) {
        workout.type = determineWorkoutType(workout.title);
    }
    
    return workout;
}

function determineWorkoutType(title) {
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('cycling') || titleLower.includes('bike')) return 'Cycling';
    if (titleLower.includes('running') || titleLower.includes('jog') || titleLower.includes('løb')) return 'Running';
    if (titleLower.includes('strength') || titleLower.includes('weight')) return 'Strength';
    if (titleLower.includes('hiking') || titleLower.includes('walk')) return 'Hiking';
    if (titleLower.includes('basketball')) return 'Basketball';
    if (titleLower.includes('intervaller')) return 'Intervals';
    if (titleLower.includes('tempo')) return 'Tempo';
    
    return 'Other';
}

// Main execution
if (require.main === module) {
    const htmlFilePath = process.argv[2];
    
    if (!htmlFilePath) {
        console.log('Usage: node html-parser.js [path-to-html-file]');
        process.exit(1);
    }
    
    parseTrainingPeaksHtml(htmlFilePath)
        .then(() => {
            console.log('✅ HTML parsing completed successfully');
        })
        .catch((error) => {
            console.error('❌ HTML parsing failed:', error);
            process.exit(1);
        });
}

module.exports = { parseTrainingPeaksHtml, extractWorkoutFromCard };
