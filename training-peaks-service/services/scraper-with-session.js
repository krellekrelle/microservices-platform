const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

class TrainingPeaksScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.context = null;
        this.isInitialized = false;
        this.sessionDataPath = '/app/data/browser-session';
    }
    
    async initialize() {
        try {
            this.browser = await chromium.launch({
                headless: true,
                executablePath: '/usr/bin/chromium-browser',
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-extensions',
                    '--disable-gpu',
                    '--no-first-run',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--ignore-certificate-errors'
                ]
            });
            
            // Create a persistent context to save session data
            this.context = await this.browser.newContext({
                storageState: await this.loadSessionData()
            });
            
            this.page = await this.context.newPage();
            
            // Set a realistic user agent to avoid being blocked
            await this.page.setExtraHTTPHeaders({
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            });
            
            // Set viewport for consistency
            await this.page.setViewportSize({ width: 1280, height: 720 });
            
            this.isInitialized = true;
            console.log('🎭 Playwright browser initialized with session persistence');
        } catch (error) {
            console.error('❌ Failed to initialize browser:', error);
            throw error;
        }
    }
    
    async loadSessionData() {
        try {
            // Ensure directory exists
            await fs.mkdir(path.dirname(this.sessionDataPath), { recursive: true });
            
            // Try to load existing session data
            const sessionFile = `${this.sessionDataPath}/state.json`;
            const data = await fs.readFile(sessionFile, 'utf8');
            console.log('📂 Loaded existing session data');
            return JSON.parse(data);
        } catch (error) {
            console.log('📝 No existing session data found, starting fresh');
            return undefined;
        }
    }
    
    async saveSessionData() {
        try {
            if (this.context) {
                const sessionData = await this.context.storageState();
                await fs.mkdir(path.dirname(this.sessionDataPath), { recursive: true });
                const sessionFile = `${this.sessionDataPath}/state.json`;
                await fs.writeFile(sessionFile, JSON.stringify(sessionData, null, 2));
                console.log('💾 Session data saved');
            }
        } catch (error) {
            console.error('❌ Failed to save session data:', error);
        }
    }
    
    async handleCookieConsent() {
        try {
            // Wait a bit for popup to appear
            await this.page.waitForTimeout(1000);
            
            // Try to find and dismiss cookie consent popup
            const cookieSelectors = [
                '#onetrust-accept-btn-handler',
                '.onetrust-close-btn-handler',
                '[id*="accept"]',
                '[class*="accept"]',
                '.cookie-accept',
                '.accept-cookies',
                'button:has-text("Accept")',
                'button:has-text("OK")',
                'button:has-text("Continue")',
                '[data-cy*="accept"]'
            ];
            
            for (const selector of cookieSelectors) {
                try {
                    const element = await this.page.$(selector);
                    if (element) {
                        const isVisible = await element.isVisible();
                        if (isVisible) {
                            await element.click();
                            console.log(`✅ Dismissed cookie consent with selector: ${selector}`);
                            await this.page.waitForTimeout(1000);
                            return;
                        }
                    }
                } catch (e) {
                    // Continue trying other selectors
                }
            }
            
            // Try to hide the overlay directly if no accept button found
            await this.page.evaluate(() => {
                const overlays = document.querySelectorAll('[class*="onetrust"], [id*="onetrust"], [class*="cookie"], [class*="consent"]');
                overlays.forEach(overlay => {
                    if (overlay.style) {
                        overlay.style.display = 'none';
                        overlay.style.visibility = 'hidden';
                        overlay.style.opacity = '0';
                        overlay.style.zIndex = '-1';
                    }
                });
            });
            
        } catch (error) {
            console.log('📝 No cookie consent popup found or already handled');
        }
    }

    async isLoggedIn() {
        try {
            // Navigate to a protected page to check if we're still logged in
            await this.page.goto('https://home.trainingpeaks.com/athlete', { 
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });
            
            // Wait a bit for redirects
            await this.page.waitForTimeout(2000);
            
            // Check if we're redirected to login page
            const currentUrl = this.page.url();
            if (currentUrl.includes('/login')) {
                console.log('🔓 Session expired, need to login again');
                return false;
            }
            
            console.log('✅ Still logged in from previous session');
            return true;
        } catch (error) {
            console.log('🔓 Could not verify login status, assuming need to login');
            return false;
        }
    }

    // Test credentials with session persistence
    async testCredentials(username, password) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            console.log(`🧪 Testing credentials for ${username}`);
            
            // First check if we're already logged in
            const alreadyLoggedIn = await this.isLoggedIn();
            if (alreadyLoggedIn) {
                console.log('✅ Already logged in, no need to re-authenticate');
                return { success: true, message: 'Already authenticated from previous session' };
            }
            
            // If not logged in, proceed with login
            console.log('📡 Navigating to TrainingPeaks login page...');
            await this.page.goto('https://home.trainingpeaks.com/login', { 
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            console.log('✅ Navigation completed');
            
            // Wait for and fill login form - use exact TrainingPeaks selectors
            console.log('🔍 Looking for TrainingPeaks login form...');
            
            // Wait for the specific form fields to load
            await this.page.waitForSelector('input[name="Username"]', { timeout: 10000 });
            
            const emailSelector = await this.page.$('input[name="Username"]');
            const passwordSelector = await this.page.$('input[name="Password"]');
            
            console.log('✅ Found TrainingPeaks login form fields');
            
            if (!emailSelector || !passwordSelector) {
                throw new Error('Could not find login form elements');
            }
            
            // Handle cookie consent popup if present
            await this.handleCookieConsent();
            
            await emailSelector.fill(username);
            await passwordSelector.fill(password);
            
            // Handle cookie consent again in case it appeared after filling
            await this.handleCookieConsent();
            
            // Submit login
            await this.page.click('button[type="submit"], input[type="submit"], .btn-primary');
            
            // Wait for navigation and check if login was successful
            await this.page.waitForTimeout(3000);
            
            const currentUrl = this.page.url();
            
            // Check for login failure indicators
            const errorElements = await this.page.$$('.error, .alert-danger, .login-error, [class*="error"]');
            if (errorElements.length > 0) {
                throw new Error('Invalid credentials');
            }
            
            // If URL changed away from login page, assume success
            if (!currentUrl.includes('/login')) {
                console.log('✅ Login successful');
                
                // Save session data for future use
                await this.saveSessionData();
                
                return { success: true, message: 'Login successful' };
            } else {
                throw new Error('Login failed - still on login page');
            }
            
        } catch (error) {
            console.error(`❌ Credentials test failed for ${username}:`, error.message);
            return { success: false, message: error.message };
        }
    }

    async loginToTrainingPeaks(username, password) {
        try {
            console.log(`🔐 Logging into TrainingPeaks for ${username}`);
            
            // Check if already logged in first
            const alreadyLoggedIn = await this.isLoggedIn();
            if (alreadyLoggedIn) {
                console.log('✅ Already logged in, skipping login process');
                return;
            }
            
            // Navigate to login page
            await this.page.goto('https://home.trainingpeaks.com/login', { 
                waitUntil: 'networkidle' 
            });
            
            // Wait for login form
            await this.page.waitForSelector('input[name="Username"]', { timeout: 10000 });
            
            // Handle cookie consent popup
            await this.handleCookieConsent();
            
            // Fill login form - use exact TrainingPeaks selectors
            const emailSelector = await this.page.$('input[name="Username"]');
            
            if (emailSelector) {
                await emailSelector.fill(username);
            } else {
                throw new Error('Could not find username input field');
            }
            
            const passwordSelector = await this.page.$('input[name="Password"]');
            
            if (passwordSelector) {
                await passwordSelector.fill(password);
            } else {
                throw new Error('Could not find password input field');
            }
            
            // Handle cookie consent again before submitting
            await this.handleCookieConsent();
            
            // Submit form
            await this.page.click('button[type="submit"], input[type="submit"]');
            
            // Wait for login to complete
            await this.page.waitForTimeout(3000);
            
            // Save session after successful login
            await this.saveSessionData();
            
            console.log('✅ Login completed and session saved');
            
        } catch (error) {
            console.error(`❌ Login failed for ${username}:`, error.message);
            throw error;
        }
    }

    async scrapeWithCredentials(username, password) {
        try {
            console.log(`🔐 Starting complete scraping flow with credentials...`);
            
            // Initialize browser if not already done
            if (!this.browser) {
                await this.initialize();
            }
            
            // Login first
            await this.loginToTrainingPeaks(username, password);
            
            // Then scrape the weekly schedule
            const weekData = await this.scrapeWeeklySchedule('2025-09-01');
            
            return weekData;
            
        } catch (error) {
            console.error(`❌ Failed to scrape with credentials:`, error.message);
            throw error;
        }
    }

    async scrapeWeeklySchedule(startDate) {
        try {
            console.log(`📅 Scraping training schedule for September 1-7, 2025`);
            
            // Navigate to calendar
            await this.page.goto('https://app.trainingpeaks.com/#calendar', { 
                waitUntil: 'networkidle0',
                timeout: 30000 
            });
            
            // Wait for calendar to load
            await this.page.waitForTimeout(3000);
            
            // Get September 1-7, 2025 week data
            const weekData = await this.extractWeekData();
            
            return weekData;
            
        } catch (error) {
            console.error(`❌ Failed to scrape training schedule:`, error.message);
            throw error;
        }
    }

        // Extract workout data for September 1-7, 2025
    async extractWeekData() {
        console.log('📅 Extracting September 1-7, 2025 workout data...');
        
        try {
            // First, save the HTML content to a file for debugging
            await this.saveHtmlToFile();
            
            const weekData = [];
            
            // Look for the specific week container for September 1-7, 2025
            const weekContainer = await this.page.$('div.calendarWeekContainer[data-date="2025-09-01"]');
            
            if (!weekContainer) {
                console.log('❌ Could not find week container for September 1-7, 2025');
                // Try to find any week container to debug
                const anyWeekContainer = await this.page.$('div.calendarWeekContainer');
                if (anyWeekContainer) {
                    const dataDate = await anyWeekContainer.getAttribute('data-date');
                    console.log(`🔍 Found week container with data-date: ${dataDate}`);
                } else {
                    console.log('❌ Could not find any week container at all');
                }
                return weekData;
            }
            
            console.log('✅ Found week container for September 1-7, 2025');
            
            // Extract workouts for each day in the week
            const targetDates = ['2025-09-01', '2025-09-02', '2025-09-03', '2025-09-04', '2025-09-05', '2025-09-06', '2025-09-07'];
            
            for (const date of targetDates) {
                console.log(`🗓️ Processing ${date}...`);
                
                const dayWorkouts = await this.extractDayWorkouts(date);
                
                weekData.push({
                    date: date,
                    workouts: dayWorkouts
                });
                
                console.log(`✅ Found ${dayWorkouts.length} workouts for ${date}`);
            }
            
            return weekData;
            
        } catch (error) {
            console.error('❌ Error extracting week data:', error);
            throw error;
        }
    }

    // Save HTML content to file for debugging
    async saveHtmlToFile() {
        try {
            const htmlContent = await this.page.content();
            const fs = require('fs').promises;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `/app/debug_calendar_${timestamp}.html`;
            
            await fs.writeFile(filename, htmlContent, 'utf8');
            console.log(`� Saved HTML content to: ${filename}`);
            
            // Also log some basic info about what's on the page
            const title = await this.page.title();
            const url = this.page.url();
            console.log(`📄 Page title: ${title}`);
            console.log(`🔗 Page URL: ${url}`);
            
            // Check for common selectors
            const weekContainers = await this.page.$$('div.calendarWeekContainer');
            console.log(`📅 Found ${weekContainers.length} week containers`);
            
            const dayContainers = await this.page.$$('div.dayContainer');
            console.log(`📊 Found ${dayContainers.length} day containers`);
            
            const workoutCards = await this.page.$$('div.activity.workout');
            console.log(`🏃 Found ${workoutCards.length} workout cards`);
            
        } catch (error) {
            console.error('❌ Error saving HTML to file:', error);
        }
    }

    // Extract workouts for a specific day
    async extractDayWorkouts(weekContainer, date) {
        const workouts = [];
        
        try {
            // Find the day container for this specific date
            const dayContainer = await weekContainer.$(`[data-date="${date}"]`);
            
            if (!dayContainer) {
                console.log(`❌ Could not find day container for ${date}`);
                return workouts;
            }
            
            // Find all workout cards within this day
            const workoutCards = await dayContainer.$$('.MuiCard-root.activity.workout');
            
            console.log(`🔍 Found ${workoutCards.length} workout cards for ${date}`);
            
            for (const card of workoutCards) {
                try {
                    const workoutData = await this.extractWorkoutFromCard(card);
                    
                    if (workoutData) {
                        workouts.push(workoutData);
                        console.log(`✅ Extracted workout: ${workoutData.title} - ${workoutData.description?.substring(0, 50) || 'No description'}...`);
                    }
                    
                } catch (elementError) {
                    console.log('⚠️ Could not extract data from workout card:', elementError.message);
                    continue;
                }
            }
            
        } catch (error) {
            console.error(`❌ Error extracting workouts for ${date}:`, error);
        }
        
        return workouts;
    }

    // Extract data from a single workout card
    async extractWorkoutFromCard(card) {
        try {
            const workoutData = {};
            
            // Extract workout ID
            const workoutId = await card.evaluate(el => el.getAttribute('data-workoutid'));
            if (workoutId) {
                workoutData.workoutId = workoutId;
            }
            
            // Extract title from h6.newActivityUItitle
            const titleElement = await card.$('h6.newActivityUItitle');
            if (titleElement) {
                workoutData.title = await this.page.evaluate(el => el.textContent?.trim(), titleElement);
            }
            
            // Extract duration, distance, TSS from keyStats
            const keyStats = await card.$('.keyStats');
            if (keyStats) {
                // Duration
                const durationElement = await keyStats.$('.duration .value');
                if (durationElement) {
                    workoutData.duration = await this.page.evaluate(el => el.textContent?.trim(), durationElement);
                }
                
                // Distance
                const distanceValue = await keyStats.$('.distance .value');
                const distanceUnits = await keyStats.$('.distance .units');
                if (distanceValue && distanceUnits) {
                    const value = await this.page.evaluate(el => el.textContent?.trim(), distanceValue);
                    const units = await this.page.evaluate(el => el.textContent?.trim(), distanceUnits);
                    workoutData.distance = `${value}${units}`;
                }
                
                // TSS
                const tssValue = await keyStats.$('.tss .value');
                const tssUnits = await keyStats.$('.tss .units');
                if (tssValue && tssUnits) {
                    const value = await this.page.evaluate(el => el.textContent?.trim(), tssValue);
                    const units = await this.page.evaluate(el => el.textContent?.trim(), tssUnits);
                    workoutData.tss = `${value}${units}`;
                }
            }
            
            // Extract description from .description element
            const descriptionElement = await card.$('.description');
            if (descriptionElement) {
                workoutData.description = await this.page.evaluate(el => el.textContent?.trim(), descriptionElement);
            }
            
            // Extract planned info if available
            const plannedElement = await card.$('.totalTimePlanned');
            if (plannedElement) {
                workoutData.planned = await this.page.evaluate(el => el.textContent?.trim(), plannedElement);
            }
            
            // Determine workout type from title or sport type
            const sportTypeElement = await card.$('.printOnly.sportType');
            if (sportTypeElement) {
                workoutData.sportType = await this.page.evaluate(el => el.textContent?.trim(), sportTypeElement);
            }
            
            // Set workout type
            if (workoutData.title) {
                workoutData.type = this.determineWorkoutType(workoutData.title);
            } else if (workoutData.sportType) {
                workoutData.type = workoutData.sportType;
            }
            
            // Only return if we have meaningful data
            if (workoutData.title || workoutData.description) {
                return workoutData;
            }
            
        } catch (error) {
            console.error('❌ Error extracting workout data from card:', error);
        }
        
        return null;
    }

    // Extract workouts for a specific day
    async extractDayWorkouts(targetDate) {
        const workouts = [];
        
        try {
            console.log(`🔍 Looking for workout elements on ${targetDate.date}...`);
            
            // Try multiple selectors to find workout elements
            const selectorAttempts = [
                'generic[cursor="pointer"]',  // Accessibility selector
                '[role="button"]',           // Button role
                '.workout',                   // Common class name
                '.session',                   // Session class
                '.activity',                  // Activity class
                '[data-testid*="workout"]',   // Test ID
                'div[onclick]',              // Clickable divs
                'a[href*="workout"]'         // Workout links
            ];
            
            let workoutElements = [];
            
            for (const selector of selectorAttempts) {
                workoutElements = await this.page.$$(selector);
                console.log(`🔍 Selector "${selector}" found ${workoutElements.length} elements`);
                
                if (workoutElements.length > 0) {
                    // Test if these elements contain workout data
                    for (let i = 0; i < Math.min(3, workoutElements.length); i++) {
                        const testText = await this.page.evaluate(el => el.textContent?.trim(), workoutElements[i]);
                        console.log(`📝 Element ${i} text sample:`, testText?.substring(0, 100) + '...');
                    }
                    break; // Use the first selector that finds elements
                }
            }
            
            if (workoutElements.length === 0) {
                console.log('❌ No workout elements found with any selector');
                return workouts;
            }
            
            console.log(`✅ Processing ${workoutElements.length} workout elements...`);
            
            for (let i = 0; i < workoutElements.length; i++) {
                try {
                    console.log(`🔍 Processing element ${i + 1}/${workoutElements.length}...`);
                    
                    // Extract workout data
                    const workoutData = await this.extractWorkoutData(workoutElements[i]);
                    
                    if (workoutData) {
                        workouts.push(workoutData);
                        console.log(`✅ Extracted workout:`, workoutData);
                    }
                    
                } catch (elementError) {
                    console.error(`❌ Error processing element ${i}:`, elementError);
                    continue;
                }
            }
            
        } catch (error) {
            console.error(`❌ Error extracting workouts for ${targetDate.date}:`, error);
        }
        
        console.log(`📊 Found ${workouts.length} workouts for ${targetDate.date}`);
        return workouts;
    }

    // Extract data from individual workout element
    async extractWorkoutData(workoutElement) {
        try {
            const workoutData = {};
            
            // Debug: Log the element HTML to understand structure
            const elementHTML = await this.page.evaluate(el => el.outerHTML, workoutElement);
            console.log('🔍 Workout element HTML:', elementHTML.substring(0, 500) + '...');
            
            // Extract title
            const headingElement = await workoutElement.$('heading[level="6"]');
            if (headingElement) {
                workoutData.title = await this.page.evaluate(el => el.textContent?.trim(), headingElement);
                console.log('📝 Found title:', workoutData.title);
            } else {
                console.log('❌ No heading element found');
            }
            
            // Try alternative selectors for title
            if (!workoutData.title) {
                const altSelectors = ['h6', '.workout-title', '.title', '[data-testid*="title"]'];
                for (const selector of altSelectors) {
                    const titleEl = await workoutElement.$(selector);
                    if (titleEl) {
                        workoutData.title = await this.page.evaluate(el => el.textContent?.trim(), titleEl);
                        console.log(`📝 Found title with ${selector}:`, workoutData.title);
                        break;
                    }
                }
            }
            
            // Extract all text content for debugging
            const allText = await this.page.evaluate(el => el.textContent?.trim(), workoutElement);
            console.log('📄 All element text:', allText);
            
            // Set description to all text for now (debugging)
            if (allText && allText.length > 10) {
                workoutData.description = allText;
            }
            
            // Always return something for debugging, even if just description
            if (workoutData.description || workoutData.title) {
                return workoutData;
            }
            
        } catch (error) {
            console.error('❌ Error extracting workout data:', error);
        }
        
        return null;
    }

    // Determine workout type from title
    determineWorkoutType(title) {
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

    async cleanup() {
        try {
            if (this.page) {
                await this.page.close();
            }
            if (this.context) {
                await this.context.close();
            }
            if (this.browser) {
                await this.browser.close();
            }
            console.log('🧹 Browser cleanup completed');
        } catch (error) {
            console.error('❌ Error during cleanup:', error);
        }
    }
}

module.exports = TrainingPeaksScraper;
