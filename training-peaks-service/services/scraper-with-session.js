const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

class TrainingPeaksScraper {
    constructor(userId = 'default') {
        this.browser = null;
        this.page = null;
        this.context = null;
        this.isInitialized = false;
        this.userId = userId;
        this.sessionDataPath = `/app/data/browser-session-${userId}`;
    }
    
    async initialize() {
        try {
            console.log(`🎭 Initializing scraper for user: ${this.userId}`);
            console.log(`📁 Session data path: ${this.sessionDataPath}`);
            
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
                // Ensure the browser-session directory exists
                await fs.mkdir(this.sessionDataPath, { recursive: true });
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
            // Check current page first
            const currentUrl = this.page.url();
            
            console.log(`🔍 Checking login status - Current URL: ${currentUrl}`);
            
            // If we're already on the app pages, we're logged in
            if (currentUrl.includes('app.trainingpeaks.com') && !currentUrl.includes('/login')) {
                console.log('✅ Already on app page - logged in');
                return true;
            }
            
            // If we're on about:blank or another page, try navigating to calendar
            if (currentUrl === 'about:blank' || !currentUrl.includes('trainingpeaks.com')) {
                console.log('🔍 Navigating to calendar to check session...');
                await this.page.goto('https://app.trainingpeaks.com/#calendar', { 
                    waitUntil: 'domcontentloaded',
                    timeout: 15000
                });
                
                // Wait a bit for any redirects
                await this.page.waitForTimeout(2000);
                
                // Check final URL
                const finalUrl = this.page.url();
                console.log(`🔍 After navigation - URL: ${finalUrl}`);
                
                // Check if we're redirected to login page
                if (finalUrl.includes('/login')) {
                    console.log('🔓 Session expired, redirected to login');
                    return false;
                }
                
                // Check if we're on the calendar page (successful login)
                if (finalUrl.includes('app.trainingpeaks.com')) {
                    console.log('✅ Successfully on calendar page - logged in');
                    return true;
                }
            }
            
            // If we're on login page, we're not logged in
            if (currentUrl.includes('/login')) {
                console.log('🔓 Currently on login page');
                return false;
            }
            
            console.log('🔓 Not on expected page');
            return false;
        } catch (error) {
            console.log('🔓 Could not verify login status, assuming need to login:', error.message);
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
        let triedSessionClear = false;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                console.log(`🔐 Logging into TrainingPeaks for ${username} (attempt ${attempt + 1})`);
                
                // Check if already logged in first
                const alreadyLoggedIn = await this.isLoggedIn();
                if (alreadyLoggedIn) {
                    console.log('✅ Already logged in, skipping login process');
                    await this.saveSessionData();
                    return;
                }
                
                // Navigate to the app calendar which will redirect to login if needed
                console.log('🔍 Navigating to TrainingPeaks...');
                await this.page.goto('https://app.trainingpeaks.com/#calendar', {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
                
                // Wait a moment for any redirects
                await this.page.waitForTimeout(3000);
                
                // Check if we were redirected to the calendar (already logged in)
                const currentUrl = this.page.url();
                console.log(`📍 Current URL after navigation: ${currentUrl}`);
                
                if (currentUrl.includes('app.trainingpeaks.com') && !currentUrl.includes('/login')) {
                    console.log('✅ Already authenticated, on calendar page');
                    await this.saveSessionData();
                    return;
                }
                
                // We were redirected to login page, proceed with form fill
                console.log('📝 On login page, filling credentials...');
                
                // Handle cookie consent popup first
                await this.handleCookieConsent();
                
                // Wait for login form
                await this.page.waitForSelector('input[name="Username"]', { timeout: 10000 });
                
                // Fill login form - use exact TrainingPeaks selectors
                console.log('📝 Filling username...');
                await this.page.fill('input[name="Username"]', username);
                
                console.log('📝 Filling password...');
                await this.page.fill('input[name="Password"]', password);
                
                // Wait a moment after filling
                await this.page.waitForTimeout(1000);
                
                // Submit form using the button role selector (more reliable)
                console.log('🔑 Submitting login form...');
                await this.page.click('button[type="submit"]', { force: true });
                
                // Wait for navigation after login
                await this.page.waitForTimeout(5000);
                
                // Verify we're on the calendar page
                const finalUrl = this.page.url();
                console.log(`📍 Final URL after login: ${finalUrl}`);
                
                if (finalUrl.includes('app.trainingpeaks.com')) {
                    console.log('✅ Login successful!');
                    await this.saveSessionData();
                    return;
                } else {
                    throw new Error('Login appears to have failed - not on calendar page');
                }
                
            } catch (error) {
                console.error(`❌ Login failed for ${username} (attempt ${attempt + 1}):`, error.message);
                // If timeout or navigation error, clear session and retry once
                if (!triedSessionClear && (error.message.includes('Timeout') || error.message.includes('navigation') || error.message.includes('destroyed'))) {
                    triedSessionClear = true;
                    console.log('🧹 Clearing session data and retrying login...');
                    await this.clearSessionData();
                    // Re-initialize browser context and page
                    await this.initialize();
                    continue;
                }
                throw error;
            }
        }
    }
    
    async clearSessionData() {
        try {
            await fs.rm(this.sessionDataPath, { recursive: true, force: true });
            console.log('🧹 Session data cleared');
        } catch (error) {
            console.log('📝 No session data to clear');
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
            
            // Then scrape the weekly schedule (default to current week Monday)
            const currentMondayDate = this.getCurrentWeekMonday();
            const weekData = await this.scrapeWeeklySchedule(currentMondayDate);
            
            return weekData;
            
        } catch (error) {
            console.error(`❌ Failed to scrape with credentials:`, error.message);
            throw error;
        }
    }

    async scrapeWithCredentialsAndDate(username, password, startDate) {
        try {
            console.log(`🔐 Starting complete scraping flow with credentials for date ${startDate}...`);
            
            // Initialize browser if not already done
            if (!this.browser) {
                await this.initialize();
            }
            
            // Login first
            await this.loginToTrainingPeaks(username, password);
            
            // Then scrape the weekly schedule for the specified date
            const weekData = await this.scrapeWeeklySchedule(startDate);
            
            return weekData;
            
        } catch (error) {
            console.error(`❌ Failed to scrape with credentials and date:`, error.message);
            throw error;
        }
    }

    getCurrentWeekMonday() {
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
        
        // Calculate days to subtract to get to Monday
        const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days
        
        const monday = new Date(today);
        monday.setDate(today.getDate() - daysToSubtract);
        
        // Format as YYYY-MM-DD
        const year = monday.getFullYear();
        const month = String(monday.getMonth() + 1).padStart(2, '0');
        const day = String(monday.getDate()).padStart(2, '0');
        
        return `${year}-${month}-${day}`;
    }

    async scrapeWeeklySchedule(startDate) {
        try {
            console.log(`📅 Scraping training schedule for week starting ${startDate}`);
            
            // Navigate to calendar
            await this.page.goto('https://app.trainingpeaks.com/#calendar', { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });
            
            // Wait 5 seconds for calendar to fully load all dynamic content
            console.log('⏳ Waiting 5 seconds for calendar to fully load...');
            await this.page.waitForTimeout(5000);
            
            // Get week data for the specified date
            const weekData = await this.extractWeekData(startDate);
            
            return weekData;
            
        } catch (error) {
            console.error(`❌ Failed to scrape training schedule:`, error.message);
            throw error;
        }
    }

        // Extract workout data for the specified week
    async extractWeekData(startDate) {
        // Calculate the end date for the week (6 days later)
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(startDateObj);
        endDateObj.setDate(startDateObj.getDate() + 6);
        
        const startMonth = startDateObj.toLocaleDateString('en-US', { month: 'long' });
        const endMonth = endDateObj.toLocaleDateString('en-US', { month: 'long' });
        const startDay = startDateObj.getDate();
        const endDay = endDateObj.getDate();
        const year = startDateObj.getFullYear();
        
        const weekRange = startMonth === endMonth 
            ? `${startMonth} ${startDay}-${endDay}, ${year}`
            : `${startMonth} ${startDay}-${endMonth} ${endDay}, ${year}`;
            
        console.log(`📅 Extracting ${weekRange} workout data...`);
        
        try {
            // Wait an additional moment for any lazy-loaded content
            console.log('⏳ Waiting additional 2 seconds for any lazy-loaded content...');
            await this.page.waitForTimeout(2000);
            
            // First, save the HTML content to a file for debugging
            await this.saveHtmlToFile();
            
            const weekData = [];
            
            // Look for the specific week container for the start date
            const weekContainer = await this.page.$(`div.calendarWeekContainer[data-date="${startDate}"]`);
            
            if (!weekContainer) {
                console.log(`❌ Could not find week container for ${weekRange}`);
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
            
            console.log(`✅ Found week container for ${weekRange}`);
            
            // Generate target dates for the week (7 days starting from startDate)
            const targetDates = [];
            for (let i = 0; i < 7; i++) {
                const targetDate = new Date(startDateObj);
                targetDate.setDate(startDateObj.getDate() + i);
                const dateString = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD format
                targetDates.push(dateString);
            }
            
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
            const filename = `/app/data/debug_calendar_${timestamp}.html`;
            
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
            const titleElement = await card.$('h6.MuiTypography-subtitle2.newActivityUItitle');
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
            
            // Extract description from .printOnly.description (full content) or .userPreferredFields .description (truncated)
            let description = '';
            
            // Try the print-only description first (has full content)
            const printDescElement = await card.$('.printOnly.description');
            if (printDescElement) {
                description = await this.page.evaluate(el => el.textContent?.trim(), printDescElement);
            }
            
            // Only fallback to visible description if print-only is not available
            if (!description) {
                const visibleDescElement = await card.$('.userPreferredFields .description');
                if (visibleDescElement) {
                    description = await this.page.evaluate(el => el.textContent?.trim(), visibleDescElement);
                }
            }
            
            if (description) {
                workoutData.description = description;
            }
            
            // Extract planned time info if available
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
                workoutData.type = workoutData.sportType.toLowerCase();
            } else {
                workoutData.type = 'Other';
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
            console.log(`🔍 Looking for workout elements on ${targetDate}...`);
            
            // Find the specific day container for this date
            const dayContainer = await this.page.$(`div.dayContainer[data-date="${targetDate}"]`);
            
            if (!dayContainer) {
                console.log(`❌ Could not find day container for ${targetDate}`);
                return workouts;
            }
            
            // Find all workout cards within this day's activities section
            // Only look for planned activities (not completed metrics cards)
            const workoutCards = await dayContainer.$$('div.activities .MuiCard-root.activity.workout');
            
            console.log(`🔍 Found ${workoutCards.length} workout cards for ${targetDate}`);
            
            for (let i = 0; i < workoutCards.length; i++) {
                try {
                    console.log(`🔍 Processing workout card ${i + 1}/${workoutCards.length}...`);
                    
                    // Check if this is a planned activity (not completed)
                    const complianceStatus = await workoutCards[i].$('.workoutComplianceStatus');
                    const statusClasses = complianceStatus ? await this.page.evaluate(el => el.className, complianceStatus) : '';
                    
                    // Skip completed workouts, only extract planned/future workouts
                    if (statusClasses.includes('complete') && !statusClasses.includes('planned')) {
                        console.log(`⏭️ Skipping completed workout (not planned)`);
                        continue;
                    }
                    
                    // Extract workout data
                    const workoutData = await this.extractWorkoutFromCard(workoutCards[i]);
                    
                    if (workoutData) {
                        workouts.push(workoutData);
                        console.log(`✅ Extracted planned workout: ${workoutData.title} - ${workoutData.description?.substring(0, 50) || 'No description'}...`);
                    }
                    
                } catch (elementError) {
                    console.error(`❌ Error processing workout card ${i}:`, elementError);
                    continue;
                }
            }
            
        } catch (error) {
            console.error(`❌ Error extracting workouts for ${targetDate}:`, error);
        }
        
        console.log(`📊 Found ${workouts.length} planned workouts for ${targetDate}`);
        return workouts;
    }

    // Determine workout type from title
    determineWorkoutType(title) {
        const titleLower = title.toLowerCase();
        
        if (titleLower.includes('cycling') || titleLower.includes('bike')) return 'cycling';
        if (titleLower.includes('running') || titleLower.includes('jog') || titleLower.includes('løb')) return 'running';
        if (titleLower.includes('strength') || titleLower.includes('weight')) return 'strength';
        if (titleLower.includes('hiking') || titleLower.includes('walk')) return 'hiking';
        if (titleLower.includes('basketball')) return 'basketball';
        if (titleLower.includes('intervaller')) return 'running';
        if (titleLower.includes('tempo')) return 'running';
        if (titleLower.includes('tur')) return 'running';
        
        return 'other';
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
