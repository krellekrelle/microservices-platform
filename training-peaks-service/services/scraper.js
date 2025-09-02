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
            
            // Set realistic user agent
            await this.page.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            );
            
            this.isInitialized = true;
            console.log('🎭 Playwright browser initialized');
        } catch (error) {
            console.error('❌ Failed to initialize browser:', error);
            throw error;
        }
    }

    // Test credentials without full scraping
    async testCredentials(email, password) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            console.log(`🧪 Testing credentials for ${email}`);
            
            // Navigate to login page
            await this.page.goto('https://www.trainingpeaks.com/login', { 
                waitUntil: 'networkidle' 
            });
            
            // Wait for and fill login form
            await this.page.waitForSelector('input[name="email"], input[type="email"], #email', { timeout: 10000 });
            
            const emailSelector = await this.page.$('input[name="email"]') || 
                                 await this.page.$('input[type="email"]') || 
                                 await this.page.$('#email');
            
            const passwordSelector = await this.page.$('input[name="password"], input[type="password"], #password');
            
            if (!emailSelector || !passwordSelector) {
                throw new Error('Could not find login form elements');
            }
            
            await emailSelector.fill(email);
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
            
            console.log(`✅ Credentials test successful for ${email}`);
            return true;
        } catch (error) {
            console.error(`❌ Credentials test failed for ${email}:`, error.message);
            throw new Error(`Login test failed: ${error.message}`);
        }
    }
    
    async loginToTrainingPeaks(email, password) {
        try {
            console.log(`🔐 Logging into TrainingPeaks for ${email}`);
            
            // Navigate to login page
            await this.page.goto('https://www.trainingpeaks.com/login', { 
                waitUntil: 'networkidle' 
            });
            
            // Wait for login form
            await this.page.waitForSelector('input[name="email"], input[type="email"], #email', { timeout: 10000 });
            
            // Fill login form - try multiple possible selectors
            const emailSelector = await this.page.$('input[name="email"]') || 
                                 await this.page.$('input[type="email"]') || 
                                 await this.page.$('#email');
            
            if (emailSelector) {
                await emailSelector.fill(email);
            } else {
                throw new Error('Could not find email input field');
            }
            
            const passwordSelector = await this.page.$('input[name="password"]') || 
                                   await this.page.$('input[type="password"]') || 
                                   await this.page.$('#password');
            
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
