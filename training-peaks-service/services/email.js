const nodemailer = require('nodemailer');

class EmailNotificationService {
    constructor() {
        this.transporter = null;
        this.initialize();
    }

    initialize() {
        try {
            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_APP_PASSWORD
                }
            });
            
            console.log('✅ Email service initialized');
        } catch (error) {
            console.error('❌ Email service initialization failed:', error);
            throw error;
        }
    }

    async sendFailureNotification(userEmail, username) {
        try {
            if (!this.transporter) {
                console.warn('⚠️ Email transporter not initialized');
                return;
            }

            const mailOptions = {
                from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
                to: userEmail,
                subject: 'TrainingPeaks Scraping Failed - Manual Check Required',
                html: `
                    <h2>TrainingPeaks Scraping Alert</h2>
                    <p>Hello,</p>
                    <p>We've been unable to retrieve your weekly training schedule from TrainingPeaks for 3 consecutive attempts.</p>
                    
                    <h3>Account Details:</h3>
                    <ul>
                        <li><strong>Username:</strong> ${username}</li>
                        <li><strong>Failed Attempts:</strong> 3</li>
                        <li><strong>Time:</strong> ${new Date().toLocaleString()}</li>
                    </ul>
                    
                    <h3>Possible Reasons:</h3>
                    <ul>
                        <li>TrainingPeaks website structure has changed</li>
                        <li>Your account credentials need updating</li>
                        <li>Your TrainingPeaks account requires additional verification</li>
                        <li>Temporary website issues</li>
                    </ul>
                    
                    <h3>Next Steps:</h3>
                    <ol>
                        <li>Log into your TrainingPeaks account manually to verify it's working</li>
                        <li>Update your credentials in the platform if needed</li>
                        <li>Contact support if the issue persists</li>
                    </ol>
                    
                    <p>The system will continue to retry automatically, but manual intervention may be required.</p>
                    
                    <p>Best regards,<br>
                    The TrainingPeaks Integration Team</p>
                `
            };

            await this.transporter.sendMail(mailOptions);
            console.log(`📧 Failure notification sent to ${userEmail}`);
        } catch (error) {
            console.error('❌ Error sending failure notification:', error);
            throw error;
        }
    }

    async sendTestEmail(userEmail) {
        try {
            if (!this.transporter) {
                throw new Error('Email transporter not initialized');
            }

            const mailOptions = {
                from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
                to: userEmail,
                subject: 'TrainingPeaks Service - Test Email',
                html: `
                    <h2>Email Service Test</h2>
                    <p>This is a test email from the TrainingPeaks service.</p>
                    <p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
                    <p>If you received this email, the notification system is working correctly.</p>
                `
            };

            await this.transporter.sendMail(mailOptions);
            console.log(`📧 Test email sent to ${userEmail}`);
            return true;
        } catch (error) {
            console.error('❌ Error sending test email:', error);
            throw error;
        }
    }
}

module.exports = EmailNotificationService;
