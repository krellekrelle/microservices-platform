const fs = require('fs').promises;
const path = require('path');

/**
 * Simple file-based metrics tracking service
 * Stores metrics in /app/data/metrics.json for easy removal later
 */
class MetricsService {
    constructor() {
        this.metricsFile = path.join(__dirname, '../data/metrics.json');
        this.metrics = null;
    }

    /**
     * Initialize metrics (load from file or create new)
     */
    async initialize() {
        try {
            const data = await fs.readFile(this.metricsFile, 'utf8');
            this.metrics = JSON.parse(data);
            console.log('📊 Metrics loaded from file');
        } catch (error) {
            // File doesn't exist or is corrupted, create new
            this.metrics = {
                totals: {
                    scrapes_performed: 0,
                    scrapes_skipped: 0,
                    workouts_created: 0,
                    workouts_scheduled: 0,
                    ai_prompts: 0,
                    errors: 0
                },
                weekly: {}
            };
            await this.save();
            console.log('📊 New metrics file created');
        }
    }

    /**
     * Save metrics to file
     */
    async save() {
        try {
            await fs.writeFile(this.metricsFile, JSON.stringify(this.metrics, null, 2));
        } catch (error) {
            console.error('❌ Failed to save metrics:', error);
        }
    }

    /**
     * Get ISO week string (e.g., "2025-W46")
     */
    getWeekString(date = new Date()) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 4 - (d.getDay() || 7));
        const yearStart = new Date(d.getFullYear(), 0, 1);
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    }

    /**
     * Ensure week entry exists
     */
    ensureWeek(weekString) {
        if (!this.metrics.weekly[weekString]) {
            this.metrics.weekly[weekString] = {
                scrapes_performed: 0,
                scrapes_skipped: 0,
                workouts_created: 0,
                workouts_scheduled: 0,
                ai_prompts: 0,
                errors: 0
            };
        }
    }

    /**
     * Increment a metric counter
     */
    async increment(metricName, count = 1) {
        if (!this.metrics) {
            await this.initialize();
        }

        const weekString = this.getWeekString();
        this.ensureWeek(weekString);

        // Update totals
        if (this.metrics.totals[metricName] !== undefined) {
            this.metrics.totals[metricName] += count;
        }

        // Update weekly
        if (this.metrics.weekly[weekString][metricName] !== undefined) {
            this.metrics.weekly[weekString][metricName] += count;
        }

        await this.save();
    }

    /**
     * Record a successful scrape
     */
    async recordScrape() {
        await this.increment('scrapes_performed');
        console.log('📊 Metric recorded: scrape performed');
    }

    /**
     * Record a skipped scrape
     */
    async recordSkippedScrape() {
        await this.increment('scrapes_skipped');
        console.log('📊 Metric recorded: scrape skipped');
    }

    /**
     * Record workout creation
     */
    async recordWorkoutCreated(count = 1) {
        await this.increment('workouts_created', count);
        console.log(`📊 Metric recorded: ${count} workout(s) created`);
    }

    /**
     * Record workout scheduling
     */
    async recordWorkoutScheduled(count = 1) {
        await this.increment('workouts_scheduled', count);
        console.log(`📊 Metric recorded: ${count} workout(s) scheduled`);
    }

    /**
     * Record AI prompt usage
     */
    async recordAIPrompt() {
        await this.increment('ai_prompts');
        console.log('📊 Metric recorded: AI prompt used');
    }

    /**
     * Record an error
     */
    async recordError() {
        await this.increment('errors');
        console.log('📊 Metric recorded: error');
    }

    /**
     * Get metrics for the last N weeks
     */
    async getLastWeeks(weeks = 4) {
        if (!this.metrics) {
            await this.initialize();
        }

        const result = [];
        const today = new Date();

        for (let i = weeks - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - (i * 7));
            const weekString = this.getWeekString(date);
            
            this.ensureWeek(weekString);
            
            result.push({
                week: weekString,
                ...this.metrics.weekly[weekString]
            });
        }

        return result;
    }

    /**
     * Get all metrics (totals + last 4 weeks)
     */
    async getMetrics() {
        if (!this.metrics) {
            await this.initialize();
        }

        const weekly = await this.getLastWeeks(4);

        return {
            totals: this.metrics.totals,
            weekly: weekly
        };
    }

    /**
     * Reset all metrics (for testing)
     */
    async reset() {
        this.metrics = {
            totals: {
                scrapes_performed: 0,
                scrapes_skipped: 0,
                workouts_created: 0,
                workouts_scheduled: 0,
                ai_prompts: 0,
                errors: 0
            },
            weekly: {}
        };
        await this.save();
        console.log('📊 Metrics reset');
    }
}

// Export singleton instance
module.exports = new MetricsService();
