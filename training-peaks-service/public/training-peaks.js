// Training Peaks Service JavaScript
class TrainingPeaksApp {
    constructor() {
        this.baseUrl = '/training/api';
        this.currentUser = null;
        this.currentStatus = null;
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
        document.getElementById('history-period').addEventListener('change', async (e) => {
            const days = e.target.value;
            const response = await fetch(`/training/api/scraping-history?days=${days}`);
            if (response.ok) {
                const data = await response.json();
                this.displayScrapingHistory(data.history);
            }
        });
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

        // Insert at the top of main
        const main = document.querySelector('main');
        main.insertBefore(messageDiv, main.firstChild);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            messageDiv.remove();
        }, 5000);
    }

    hideLoading() {
        document.getElementById('loading').style.display = 'none';
        
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
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TrainingPeaksApp();
});
