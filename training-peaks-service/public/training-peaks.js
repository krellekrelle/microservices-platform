// Training Peaks Service JavaScript
class TrainingPeaksApp {
    constructor() {
        this.baseUrl = '/training/api';
        this.currentUser = null;
        this.currentStatus = null;
        this.calendarListenersSetup = false; // Prevent duplicate event listeners
        this.init();
    }

    async init() {
        try {
            await this.loadUserData();
            await this.loadServiceStatus();
            this.setupEventListeners();
            this.hideLoading();
        } catch (error) {
            console.error('App initialization failed:', error);
            this.showError('Failed to initialize application');
            this.hideLoading();
        }
    }

    async loadUserData() {
        // Get user info from JWT token or make API call
        // For now, we'll extract from the token or make an API call
        try {
            const response = await fetch('/training/api/status');
            if (response.ok) {
                const data = await response.json();
                this.currentStatus = data;
                this.displayUserName();
                this.displayCredentialsStatus(data.hasCredentials, data.credentials);
                this.displayServiceStatus(data);
                this.displayStatistics(data.statistics);
                
                if (data.hasCredentials) {
                    await this.loadTrainingSchedules();
                    await this.loadScrapingHistory();
                }
            }
        } catch (error) {
            console.error('Failed to load user data:', error);
        }
    }

    async loadServiceStatus() {
        try {
            const response = await fetch('/training/api/status');
            if (response.ok) {
                const data = await response.json();
                this.displayServiceStatus(data);
            }
        } catch (error) {
            console.error('Failed to load service status:', error);
        }
    }

    displayUserName() {
        // Try to get user name from a global variable or make an API call
        const userNameElement = document.getElementById('user-name');
        if (userNameElement) {
            userNameElement.textContent = 'User'; // We'll get this from JWT or API
        }
    }

    displayCredentialsStatus(hasCredentials, credentials) {
        const statusElement = document.getElementById('credentials-status');
        const formElement = document.getElementById('credentials-form');
        
        if (hasCredentials && credentials) {
            statusElement.innerHTML = `
                <div class="credentials-configured">
                    <h3>✅ TrainingPeaks Connected</h3>
                    <p><strong>Email:</strong> ${credentials.email}</p>
                    <p><strong>Status:</strong> ${credentials.isActive ? 'Active' : 'Inactive'}</p>
                    <p><strong>Last Updated:</strong> ${new Date(credentials.lastUpdated).toLocaleDateString()}</p>
                    <div style="margin-top: 15px;">
                        <button id="edit-credentials" class="action-btn">Edit Credentials</button>
                        <button id="delete-credentials" class="danger" style="margin-left: 10px;">Delete Credentials</button>
                    </div>
                </div>
            `;
        } else {
            statusElement.innerHTML = `
                <div class="credentials-not-configured">
                    <h3>⚠️ TrainingPeaks Not Connected</h3>
                    <p>You need to configure your TrainingPeaks credentials to start scraping training schedules.</p>
                    <button id="add-credentials" class="action-btn">Add TrainingPeaks Credentials</button>
                </div>
            `;
        }
    }

    displayServiceStatus(data) {
        if (!data.scheduler) return;

        const lastScrapingElement = document.getElementById('last-scraping');
        const nextCheckElement = document.getElementById('next-check');
        const scrapingStatusElement = document.getElementById('scraping-status');

        if (data.statistics && data.statistics.last_scraping) {
            lastScrapingElement.textContent = new Date(data.statistics.last_scraping).toLocaleString();
        } else {
            lastScrapingElement.textContent = 'Never';
        }

        if (data.scheduler.nextSunday) {
            const nextSunday = new Date(data.scheduler.nextSunday + 'T12:00:00');
            nextCheckElement.textContent = nextSunday.toLocaleDateString() + ' 12:00 PM';
        }

        scrapingStatusElement.textContent = data.scheduler.isRunning ? '✅ Active' : '❌ Stopped';
        scrapingStatusElement.className = `status-value ${data.scheduler.isRunning ? 'status-success' : 'status-error'}`;
    }

    displayStatistics(stats) {
        if (!stats) return;

        document.getElementById('current-week-total').textContent = `${stats.current_week_sessions || 0} sessions`;
        document.getElementById('next-week-total').textContent = `${stats.next_week_sessions || 0} sessions`;
        document.getElementById('training-types').textContent = `${stats.training_types || 0} types`;
        document.getElementById('total-sessions').textContent = `${stats.total_sessions || 0} sessions`;
    }

    async loadTrainingSchedules() {
        try {
            // Load current week
            const currentWeekResponse = await fetch('/training/api/training-schedule?week=current');
            if (currentWeekResponse.ok) {
                const currentWeekData = await currentWeekResponse.json();
                this.displayTrainingSchedule('current', currentWeekData);
            }

            // Load next week
            const nextWeekResponse = await fetch('/training/api/training-schedule?week=next');
            if (nextWeekResponse.ok) {
                const nextWeekData = await nextWeekResponse.json();
                this.displayTrainingSchedule('next', nextWeekData);
            }
        } catch (error) {
            console.error('Failed to load training schedules:', error);
        }
    }

    displayTrainingSchedule(week, data) {
        const weekElement = document.getElementById(`${week}-week`);
        const datesElement = document.getElementById(`${week}-week-dates`);
        const sessionsElement = document.getElementById(`${week}-week-sessions`);
        const scheduleElement = document.getElementById(`${week}-week-schedule`);

        if (datesElement) {
            const startDate = new Date(data.startDate);
            const endDate = new Date(data.endDate);
            datesElement.textContent = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
        }

        if (sessionsElement) {
            sessionsElement.textContent = `${data.sessions.length} sessions`;
        }

        if (scheduleElement) {
            scheduleElement.innerHTML = this.generateTrainingScheduleHTML(data.sessions, data.startDate);
        }
    }

    generateTrainingScheduleHTML(sessions, startDateStr) {
        const startDate = new Date(startDateStr);
        const days = [];
        
        // Generate 7 days (Monday to Sunday)
        for (let i = 0; i < 7; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            days.push(date);
        }

        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        
        return days.map((date, index) => {
            const dateStr = date.toISOString().split('T')[0];
            const daySessions = sessions.filter(session => session.session_date === dateStr);
            
            return `
                <div class="training-day">
                    <div class="day-header">
                        ${dayNames[index]} ${date.getDate()}/${date.getMonth() + 1}
                    </div>
                    <div class="day-sessions">
                        ${daySessions.length > 0 
                            ? daySessions.map(session => this.generateSessionHTML(session)).join('')
                            : '<div class="no-sessions">No training scheduled</div>'
                        }
                    </div>
                </div>
            `;
        }).join('');
    }

    generateSessionHTML(session) {
        return `
            <div class="training-session">
                <div class="session-title">${session.title}</div>
                <div class="session-description">${session.description || 'No description'}</div>
                <div class="session-meta">
                    ${session.duration ? `<span>Duration: ${session.duration}</span>` : ''}
                    ${session.training_type ? `<span>Type: ${session.training_type}</span>` : ''}
                </div>
            </div>
        `;
    }

    async loadScrapingHistory() {
        try {
            const response = await fetch('/training/api/scraping-history?days=30');
            if (response.ok) {
                const data = await response.json();
                this.displayScrapingHistory(data.history);
            }
        } catch (error) {
            console.error('Failed to load scraping history:', error);
        }
    }

    displayScrapingHistory(history) {
        const tbody = document.getElementById('history-tbody');
        
        if (history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #666;">No scraping history found</td></tr>';
            return;
        }

        tbody.innerHTML = history.map(entry => `
            <tr>
                <td>${new Date(entry.scrape_date).toLocaleDateString()}</td>
                <td class="${entry.success ? 'status-success' : 'status-error'}">
                    ${entry.success ? '✅ Success' : '❌ Failed'}
                </td>
                <td>${entry.sessions_found}</td>
                <td>${entry.triggered_by}</td>
                <td>${entry.error_message || '-'}</td>
            </tr>
        `).join('');
    }

    setupEventListeners() {
        // Credentials management
        document.addEventListener('click', async (e) => {
            if (e.target.id === 'add-credentials' || e.target.id === 'edit-credentials') {
                this.showCredentialsForm();
            } else if (e.target.id === 'delete-credentials') {
                if (confirm('Are you sure you want to delete your TrainingPeaks credentials and all training data?')) {
                    await this.deleteCredentials();
                }
            } else if (e.target.id === 'cancel-credentials') {
                this.hideCredentialsForm();
            } else if (e.target.id === 'scrape-now-btn') {
                await this.triggerManualScraping();
            } else if (e.target.id === 'refresh-history') {
                await this.loadScrapingHistory();
            } else if (e.target.id === 'test-email-btn') {
                await this.sendTestEmail();
            }
        });

        // Credentials form submission
        document.getElementById('credentials-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveCredentials();
        });

        // History period change
        const historyPeriod = document.getElementById('history-period');
        if (historyPeriod) {
            historyPeriod.addEventListener('change', async (e) => {
                const days = e.target.value;
                const response = await fetch(`/training/api/scraping-history?days=${days}`);
                if (response.ok) {
                    const data = await response.json();
                    this.displayScrapingHistory(data.history);
                }
            });
        }

        // Setup calendar event listeners immediately
        this.setupCalendarEventListeners();
    }

    showCredentialsForm() {
        document.getElementById('credentials-form').style.display = 'block';
        document.getElementById('tp-email').focus();
    }

    hideCredentialsForm() {
        document.getElementById('credentials-form').style.display = 'none';
        document.getElementById('credentials-form').reset();
    }

    async saveCredentials() {
        const email = document.getElementById('tp-email').value;
        const password = document.getElementById('tp-password').value;

        if (!email || !password) {
            this.showError('Please fill in both email and password');
            return;
        }

        try {
            const response = await fetch('/training/api/credentials', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            if (response.ok) {
                this.showSuccess('Credentials saved successfully!');
                this.hideCredentialsForm();
                await this.loadUserData();
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to save credentials');
            }
        } catch (error) {
            console.error('Error saving credentials:', error);
            this.showError('Failed to save credentials');
        }
    }

    async deleteCredentials() {
        try {
            const response = await fetch('/training/api/credentials', {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showSuccess('Credentials deleted successfully!');
                await this.loadUserData();
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to delete credentials');
            }
        } catch (error) {
            console.error('Error deleting credentials:', error);
            this.showError('Failed to delete credentials');
        }
    }

    async triggerManualScraping() {
        const button = document.getElementById('scrape-now-btn');
        const originalText = button.textContent;
        
        button.textContent = 'Scraping...';
        button.disabled = true;

        try {
            const response = await fetch('/training/api/scrape-now', {
                method: 'POST'
            });

            if (response.ok) {
                this.showSuccess('Scraping started! Check back in a few moments for results.');
                
                // Refresh data after a delay
                setTimeout(async () => {
                    await this.loadUserData();
                }, 5000);
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to start scraping');
            }
        } catch (error) {
            console.error('Error triggering scraping:', error);
            this.showError('Failed to start scraping');
        } finally {
            button.textContent = originalText;
            button.disabled = false;
        }
    }

    async sendTestEmail() {
        const button = document.getElementById('test-email-btn');
        const originalText = button.textContent;
        
        button.textContent = 'Sending...';
        button.disabled = true;

        try {
            const response = await fetch('/training/api/test-email', {
                method: 'POST'
            });

            if (response.ok) {
                this.showSuccess('Test email sent! Check your inbox.');
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to send test email');
            }
        } catch (error) {
            console.error('Error sending test email:', error);
            this.showError('Failed to send test email');
        } finally {
            button.textContent = originalText;
            button.disabled = false;
        }
    }

    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    showMessage(message, type) {
        // Remove existing messages
        const existingMessages = document.querySelectorAll('.message');
        existingMessages.forEach(msg => msg.remove());

        // Create new message
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = message;

        // Insert at the top of container
        const container = document.querySelector('.container');
        if (container) {
            container.insertBefore(messageDiv, container.firstChild);
        } else {
            // Fallback to body if container not found
            document.body.insertBefore(messageDiv, document.body.firstChild);
        }

        // Auto-remove after 5 seconds
        setTimeout(() => {
            messageDiv.remove();
        }, 5000);
    }

    hideLoading() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = 'none';
        }
        
        // Show all sections
        const sections = [
            'setup-section',
            'service-status', 
            'current-week', 
            'next-week', 
            'training-stats', 
            'scraping-history', 
            'future-features'
        ];
        
        sections.forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.style.display = 'block';
            }
        });
    }

    // ====== Phase 2: Calendar Integration Methods ======

    async initializeCalendarIntegration() {
        try {
            await this.loadCalendarSettings();
            await this.loadCalendarStats();
            this.setupCalendarEventListeners();
            this.showCalendarSection();
        } catch (error) {
            console.error('Failed to initialize calendar integration:', error);
            this.showError('Failed to load calendar integration');
        }
    }

    setupCalendarEventListeners() {
        console.log('🔍 DEBUG: Setting up calendar event listeners');
        
        // Prevent duplicate event listeners
        if (this.calendarListenersSetup) {
            console.log('🔍 DEBUG: Calendar listeners already setup, skipping');
            return;
        }
        
        // Setup Calendar button
        const setupBtn = document.getElementById('setup-calendar');
        console.log('🔍 DEBUG: setup-calendar button:', setupBtn);
        if (setupBtn) {
            // Remove existing listeners first
            const newSetupBtn = setupBtn.cloneNode(true);
            setupBtn.parentNode.replaceChild(newSetupBtn, setupBtn);
            
            newSetupBtn.addEventListener('click', () => {
                console.log('🔍 DEBUG: Setup calendar button clicked');
                this.setupCalendarIntegration();
            });
        } else {
            console.error('❌ DEBUG: setup-calendar button not found!');
        }

        // Calendar settings form
        const settingsForm = document.getElementById('calendar-settings-form');
        console.log('🔍 DEBUG: calendar-settings-form:', settingsForm);
        if (settingsForm) {
            // Remove existing listeners first
            const newSettingsForm = settingsForm.cloneNode(true);
            settingsForm.parentNode.replaceChild(newSettingsForm, settingsForm);
            
            newSettingsForm.addEventListener('submit', (e) => {
                console.log('🔍 DEBUG: Calendar form submitted');
                this.saveCalendarSettings(e);
            });
        } else {
            console.error('❌ DEBUG: calendar-settings-form not found!');
        }

        // Sync calendar button
        const syncBtn = document.getElementById('sync-calendar');
        if (syncBtn) {
            // Remove existing listeners first
            const newSyncBtn = syncBtn.cloneNode(true);
            syncBtn.parentNode.replaceChild(newSyncBtn, syncBtn);
            
            newSyncBtn.addEventListener('click', () => this.syncToCalendar());
        }

        // Download ICS button
        const downloadBtn = document.getElementById('download-ics');
        if (downloadBtn) {
            // Remove existing listeners first
            const newDownloadBtn = downloadBtn.cloneNode(true);
            downloadBtn.parentNode.replaceChild(newDownloadBtn, downloadBtn);
            
            newDownloadBtn.addEventListener('click', () => this.downloadICSFile());
        }

        // View calendar events button
        const viewBtn = document.getElementById('view-calendar-events');
        if (viewBtn) {
            // Remove existing listeners first
            const newViewBtn = viewBtn.cloneNode(true);
            viewBtn.parentNode.replaceChild(newViewBtn, viewBtn);
            
            newViewBtn.addEventListener('click', () => this.viewCalendarEvents());
        }
        
        // Mark listeners as setup
        this.calendarListenersSetup = true;
    }

    showCalendarSection() {
        const section = document.getElementById('calendar-section');
        if (section) {
            section.classList.remove('hidden');
        }
    }

    async setupCalendarIntegration() {
        try {
            console.log('🔍 DEBUG: setupCalendarIntegration called');
            this.showCalendarProgress('Setting up calendar integration...');
            
            // Show calendar settings form
            const settingsDiv = document.getElementById('calendar-settings');
            console.log('🔍 DEBUG: calendar-settings element:', settingsDiv);
            if (settingsDiv) {
                console.log('🔍 DEBUG: Removing hidden class from calendar-settings');
                settingsDiv.classList.remove('hidden');
            } else {
                console.error('❌ DEBUG: calendar-settings element not found!');
            }

            // Update button states
            const setupBtn = document.getElementById('setup-calendar');
            if (setupBtn) {
                setupBtn.textContent = 'Update Settings';
            }
            this.enableCalendarButtons();

            this.hideCalendarProgress();
            this.showSuccess('Calendar integration setup completed!');

        } catch (error) {
            console.error('Setup calendar integration failed:', error);
            this.hideCalendarProgress();
            this.showError('Failed to setup calendar integration');
        }
    }

    async loadCalendarSettings() {
        try {
            const response = await fetch(`${this.baseUrl}/calendar/settings`);
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.settings) {
                    this.populateCalendarSettings(data.settings);
                }
            }
        } catch (error) {
            console.error('Failed to load calendar settings:', error);
        }
    }

    populateCalendarSettings(settings) {
        // Populate form fields with current settings
        const timeInput = document.getElementById('default-time');
        if (timeInput && settings.default_training_time) {
            timeInput.value = settings.default_training_time.substring(0, 5); // Remove seconds
        }

        const locationInput = document.getElementById('default-location');
        if (locationInput && settings.default_location) {
            locationInput.value = settings.default_location;
        }

        const timezoneSelect = document.getElementById('timezone');
        if (timezoneSelect && settings.timezone) {
            timezoneSelect.value = settings.timezone;
        }

        const autoSyncCheckbox = document.getElementById('auto-sync');
        if (autoSyncCheckbox) {
            autoSyncCheckbox.checked = settings.auto_sync_enabled;
        }

        // Show settings if they exist
        if (settings.user_id) {
            const settingsDiv = document.getElementById('calendar-settings');
            if (settingsDiv) {
                settingsDiv.classList.remove('hidden');
            }
            this.enableCalendarButtons();
        }
    }

    async saveCalendarSettings(event) {
        event.preventDefault();
        console.log('🔍 DEBUG: saveCalendarSettings called');
        
        try {
            this.showCalendarProgress('Saving calendar settings...');

            const formData = new FormData(event.target);
            const settings = {
                default_training_time: document.getElementById('default-time').value + ':00',
                default_location: document.getElementById('default-location').value,
                timezone: document.getElementById('timezone').value,
                auto_sync_enabled: document.getElementById('auto-sync').checked,
                reminder_settings: [
                    { minutes: 60, description: '1 hour before training' },
                    { minutes: 15, description: '15 minutes before training' }
                ]
            };

            console.log('🔍 DEBUG: Sending settings:', settings);

            const response = await fetch(`${this.baseUrl}/calendar/settings`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(settings)
            });

            console.log('🔍 DEBUG: Response status:', response.status);
            const data = await response.json();
            console.log('🔍 DEBUG: Response data:', data);

            if (data.success) {
                this.hideCalendarProgress();
                this.showSuccess('Calendar settings saved successfully!');
                this.enableCalendarButtons();
                await this.loadCalendarStats();
            } else {
                throw new Error(data.error || 'Failed to save settings');
            }

        } catch (error) {
            console.error('Failed to save calendar settings:', error);
            this.hideCalendarProgress();
            this.showError('Failed to save calendar settings: ' + error.message);
        }
    }

    async syncToCalendar() {
        try {
            // Disable button to prevent double-clicks
            const syncBtn = document.getElementById('sync-calendar');
            if (syncBtn) {
                syncBtn.disabled = true;
                syncBtn.textContent = 'Syncing...';
            }

            this.showCalendarProgress('Syncing training schedule to calendar...');

            const response = await fetch(`${this.baseUrl}/calendar/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    dateRange: {
                        start: '2025-09-01',
                        end: '2025-09-07'
                    }
                })
            });

            const data = await response.json();

            if (data.success) {
                this.hideCalendarProgress();
                this.showSuccess(`Successfully synced ${data.eventsCreated} training events to calendar!`);
                await this.loadCalendarStats();
                await this.loadCalendarEvents();
            } else {
                throw new Error(data.error || 'Failed to sync calendar');
            }

        } catch (error) {
            console.error('Failed to sync calendar:', error);
            this.hideCalendarProgress();
            this.showError('Failed to sync calendar: ' + error.message);
        } finally {
            // Re-enable button
            const syncBtn = document.getElementById('sync-calendar');
            if (syncBtn) {
                syncBtn.disabled = false;
                syncBtn.textContent = 'Sync to Calendar';
            }
        }
    }

    async downloadICSFile() {
        try {
            console.log('🔍 DEBUG: downloadICSFile called');
            // Disable button to prevent double-clicks
            const downloadBtn = document.getElementById('download-ics');
            if (downloadBtn) {
                downloadBtn.disabled = true;
                downloadBtn.textContent = 'Generating...';
            }

            this.showCalendarProgress('Generating ICS file...');

            const response = await fetch(`${this.baseUrl}/calendar/download-ics?startDate=2025-09-01&endDate=2025-09-07`);

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = 'training-schedule.ics';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                this.hideCalendarProgress();
                this.showSuccess('ICS file downloaded! Import it into your calendar app.');
            } else {
                throw new Error('Failed to generate ICS file');
            }

        } catch (error) {
            console.error('Failed to download ICS file:', error);
            this.hideCalendarProgress();
            this.showError('Failed to download ICS file: ' + error.message);
        } finally {
            // Re-enable button
            const downloadBtn = document.getElementById('download-ics');
            if (downloadBtn) {
                downloadBtn.disabled = false;
                downloadBtn.textContent = 'Download ICS File';
            }
        }
    }

    async loadCalendarStats() {
        try {
            const response = await fetch(`${this.baseUrl}/calendar/stats`);
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.displayCalendarStats(data.stats);
                }
            }
        } catch (error) {
            console.error('Failed to load calendar stats:', error);
        }
    }

    displayCalendarStats(stats) {
        const statsContainer = document.getElementById('calendar-stats');
        if (!statsContainer) return;

        const html = `
            <div class="calendar-stat-item">
                <span>Total Syncs:</span>
                <span class="calendar-stat-value">${stats.total_syncs || 0}</span>
            </div>
            <div class="calendar-stat-item">
                <span>Events Created:</span>
                <span class="calendar-stat-value">${stats.total_events || 0}</span>
            </div>
            <div class="calendar-stat-item">
                <span>Last Sync:</span>
                <span class="calendar-stat-value">${stats.last_sync ? new Date(stats.last_sync).toLocaleDateString() : 'Never'}</span>
            </div>
            <div class="calendar-stat-item">
                <span>Success Rate:</span>
                <span class="calendar-stat-value">${stats.avg_success_rate ? Math.round(stats.avg_success_rate * 100) + '%' : '0%'}</span>
            </div>
        `;

        statsContainer.innerHTML = html;
        
        // Show stats section
        const statusSection = document.getElementById('calendar-status');
        if (statusSection) {
            statusSection.classList.remove('hidden');
        }
    }

    async viewCalendarEvents() {
        try {
            await this.loadCalendarEvents();
            
            // Show events section
            const eventsSection = document.getElementById('calendar-events-section');
            if (eventsSection) {
                eventsSection.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Failed to view calendar events:', error);
            this.showError('Failed to load calendar events');
        }
    }

    async loadCalendarEvents() {
        try {
            const response = await fetch(`${this.baseUrl}/calendar/events?startDate=2025-09-01&endDate=2025-09-07`);
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.displayCalendarEvents(data.events);
                }
            }
        } catch (error) {
            console.error('Failed to load calendar events:', error);
        }
    }

    displayCalendarEvents(events) {
        const container = document.getElementById('calendar-events-list');
        if (!container) return;

        if (events.length === 0) {
            container.innerHTML = '<p>No calendar events found. Sync your training schedule first.</p>';
            return;
        }

        const html = events.map(event => `
            <div class="calendar-event-item">
                <div class="calendar-event-header">
                    <span class="calendar-event-title">${event.event_title}</span>
                    <span class="calendar-event-status ${event.sync_status}">${event.sync_status}</span>
                </div>
                <div class="calendar-event-time">
                    📅 ${new Date(event.date).toLocaleDateString()} 
                    ⏰ ${new Date(event.event_start).toLocaleTimeString()} - ${new Date(event.event_end).toLocaleTimeString()}
                </div>
                <div class="calendar-event-description">
                    ${event.session_description ? event.session_description.substring(0, 200) + (event.session_description.length > 200 ? '...' : '') : 'No description available'}
                </div>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    enableCalendarButtons() {
        const buttons = ['sync-calendar', 'download-ics', 'view-calendar-events'];
        buttons.forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.disabled = false;
                button.classList.remove('hidden');
            }
        });
    }

    showCalendarProgress(message) {
        const existingProgress = document.querySelector('.calendar-sync-progress');
        if (existingProgress) {
            existingProgress.remove();
        }

        const progressDiv = document.createElement('div');
        progressDiv.className = 'calendar-sync-progress';
        progressDiv.innerHTML = `
            <div class="loading"></div>
            ${message}
        `;

        const calendarSection = document.getElementById('calendar-section');
        if (calendarSection) {
            calendarSection.appendChild(progressDiv);
        }
    }

    hideCalendarProgress() {
        const progressDiv = document.querySelector('.calendar-sync-progress');
        if (progressDiv) {
            progressDiv.remove();
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new TrainingPeaksApp();
    
    // Initialize Phase 2 calendar integration if we have training data
    setTimeout(() => {
        if (app.currentStatus && app.currentStatus.hasCredentials) {
            app.initializeCalendarIntegration();
        }
    }, 1000);
});
