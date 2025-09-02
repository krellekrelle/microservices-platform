const { chromium } = require('playwright');

class TrainingPeaksScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isInitialized = false;
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
            this.browser = await chromium.launch({ 
                headless: true,
                executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-extensions',
                    '--disable-gpu',
                    '--no-first-run'
                ]
            });
            
            this.page = await this.browser.newPage();
            
            // Set a realistic user agent to avoid being blocked
            await this.page.setExtraHTTPHeaders({
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            });
            
            // Set viewport for consistency
            await this.page.setViewportSize({ width: 1280, height: 720 });
            
            this.isInitialized = true;
            console.log('🎭 Playwright browser initialized');
        } catch (error) {
            console.error('❌ Failed to initialize browser:', error);
            throw error;
        }
    }

    // Test credentials without full scraping
    async testCredentials(username, password) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            console.log(`🧪 Testing credentials for ${username}`);
            
            // Navigate to login page with more robust options
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
            
            await emailSelector.fill(username);
            await passwordSelector.fill(password);
            
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
            
            // Check if we're redirected away from login page
            if (currentUrl.includes('/login')) {
                throw new Error('Login failed - still on login page');
            }
            
            console.log(`✅ Credentials test successful for ${username}`);
            return true;
        } catch (error) {
            console.error(`❌ Credentials test failed for ${username}:`, error.message);
            throw new Error(`Login test failed: ${error.message}`);
        }
    }
    
    async loginToTrainingPeaks(username, password) {
        try {
            console.log(`🔐 Logging into TrainingPeaks for ${username}`);
            
            // Navigate to login page
            await this.page.goto('https://home.trainingpeaks.com/login', { 
                waitUntil: 'networkidle' 
            });
            
            // Wait for login form
            await this.page.waitForSelector('input[name="Username"]', { timeout: 10000 });
            
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
            
            // Submit form
            const submitButton = await this.page.$('button[type="submit"]') || 
                               await this.page.$('input[type="submit"]') ||
                               await this.page.$('button:has-text("Log In")') ||
                               await this.page.$('button:has-text("Sign In")');
            
            if (submitButton) {
                await submitButton.click();
            } else {
                throw new Error('Could not find submit button');
            }
            
            // Wait for redirect to dashboard/home
            await this.page.waitForURL(/dashboard|home|calendar/, { timeout: 15000 });
            
            console.log('✅ Successfully logged into TrainingPeaks');
            
        } catch (error) {
            console.error('❌ TrainingPeaks login failed:', error);
            throw new Error(`Login failed: ${error.message}`);
        }
    }
    
    async scrapeWeeklySchedule(startDate) {
        try {
            console.log(`📅 Scraping training schedule starting from ${startDate}`);
            
            // Navigate to calendar view for the specific week
            const calendarUrl = `https://www.trainingpeaks.com/app/calendar?view=week&start=${startDate}`;
            await this.page.goto(calendarUrl, { waitUntil: 'networkidle' });
            
            // Wait for calendar content to load
            await this.page.waitForTimeout(3000);
            
            // Extract training sessions
            const trainingSessions = await this.page.evaluate(() => {
                const sessions = [];
                
                // Try multiple possible selectors for training sessions
                const selectors = [
                    '.calendar-workout',
                    '.workout-item',
                    '.training-session',
                    '.calendar-event',
                    '[data-workout]',
                    '.workout',
                    '.session'
                ];
                
                let workoutElements = [];
                
                for (const selector of selectors) {
                    workoutElements = document.querySelectorAll(selector);
                    if (workoutElements.length > 0) {
                        console.log(`Found ${workoutElements.length} workouts with selector: ${selector}`);
                        break;
                    }
                }
                
                if (workoutElements.length === 0) {
                    // Fallback: look for any element that might contain training data
                    workoutElements = document.querySelectorAll('*[title*="km"], *[title*="min"], *[title*="hour"], *:contains("Training"), *:contains("Workout")');
                }
                
                workoutElements.forEach((element, index) => {
                    try {
                        // Extract date - try multiple methods
                        let date = element.getAttribute('data-date') || 
                                  element.getAttribute('data-day') ||
                                  element.closest('[data-date]')?.getAttribute('data-date');
                        
                        if (!date) {
                            // Try to extract from parent elements or context
                            const dateElement = element.closest('.calendar-day, .day, [data-day]');
                            if (dateElement) {
                                date = dateElement.getAttribute('data-date') || 
                                      dateElement.getAttribute('data-day');
                            }
                        }
                        
                        // Extract title and description
                        const title = element.querySelector('.workout-title, .title, .name')?.textContent?.trim() ||
                                     element.getAttribute('title') ||
                                     element.textContent?.trim()?.split('\\n')[0] ||
                                     `Training Session ${index + 1}`;
                        
                        const description = element.querySelector('.workout-description, .description, .details')?.textContent?.trim() ||
                                          element.querySelector('.workout-notes, .notes')?.textContent?.trim() ||
                                          element.textContent?.trim() ||
                                          '';
                        
                        const duration = element.querySelector('.workout-duration, .duration, .time')?.textContent?.trim() ||
                                       element.getAttribute('data-duration') ||
                                       null;
                        
                        // Only add if we have meaningful content
                        if ((title && title.length > 3) || (description && description.length > 10)) {
                            sessions.push({
                                date: date || new Date().toISOString().split('T')[0],
                                title: title,
                                description: description,
                                duration: duration,
                                scraped_at: new Date().toISOString()
                            });
                        }
                    } catch (error) {
                        console.log('Error processing workout element:', error);
                    }
                });
                
                return sessions;
            });
            
            console.log(`📊 Found ${trainingSessions.length} training sessions`);
            
            return trainingSessions;
            
        } catch (error) {
            console.error('❌ Failed to scrape training schedule:', error);
            throw new Error(`Scraping failed: ${error.message}`);
        }
    }
    
    async takeScreenshot(filename = 'debug-screenshot.png') {
        if (this.page) {
            try {
                await this.page.screenshot({ path: filename, fullPage: true });
                console.log(`📸 Screenshot saved: ${filename}`);
            } catch (error) {
                console.error('Failed to take screenshot:', error);
            }
        }
    }
    
    async dispose() {
        try {
            if (this.browser) {
                await this.browser.close();
                this.isInitialized = false;
                console.log('🎭 Browser disposed');
            }
        } catch (error) {
            console.error('Error disposing browser:', error);
        }
    }
}

module.exports = TrainingPeaksScraper;
