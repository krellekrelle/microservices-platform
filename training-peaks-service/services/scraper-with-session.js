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

    async scrapeWeeklySchedule(startDate) {
        try {
            console.log(`📅 Scraping training schedule starting from ${startDate}`);
            
            // Navigate to calendar view for the specific week
            const calendarUrl = `https://home.trainingpeaks.com/athlete/calendar?view=week&start=${startDate}`;
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
                    '.training-item',
                    '[data-testid*="workout"]',
                    '.session',
                    '.activity'
                ];
                
                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        elements.forEach(element => {
                            const title = element.querySelector('.title, .workout-title, h3, h4')?.textContent?.trim();
                            const description = element.querySelector('.description, .workout-description, .notes')?.textContent?.trim();
                            const dateAttr = element.getAttribute('data-date') || 
                                           element.closest('[data-date]')?.getAttribute('data-date');
                            
                            if (title || description) {
                                sessions.push({
                                    date: dateAttr || new Date().toISOString().split('T')[0],
                                    title: title || 'Training Session',
                                    description: description || '',
                                    duration: null,
                                    type: 'workout'
                                });
                            }
                        });
                        break; // If we found sessions with one selector, stop trying others
                    }
                }
                
                return sessions;
            });
            
            console.log(`✅ Scraped ${trainingSessions.length} training sessions`);
            return trainingSessions;
            
        } catch (error) {
            console.error(`❌ Failed to scrape training schedule:`, error.message);
            throw error;
        }
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
