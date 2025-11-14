# Automated Pipeline Scheduler

The TrainingPeaks service now includes an **automated pipeline scheduler** that intelligently runs the scraping and Garmin sync process for all users with configured credentials.

## How It Works

The scheduler uses **intelligent week detection** to avoid unnecessary scraping:

### 🗓️ Week Selection Logic

- **Sunday (8 PM)**: Scrapes **NEXT WEEK** (upcoming week's workouts that were just posted)
- **Monday-Saturday (6 AM)**: Scrapes **CURRENT WEEK** (this week's workouts)

### 🧠 Smart Skip Logic

Before scraping, the scheduler checks if the target week already has workouts in the database:

```
Is it Sunday?
├─ Yes → Check NEXT week
│   └─ Workouts exist? → Skip scraping, only sync unsynced
│   └─ No workouts? → Scrape NEXT week
│
└─ No (Mon-Sat) → Check CURRENT week
    └─ Workouts exist? → Skip scraping, only sync unsynced
    └─ No workouts? → Scrape CURRENT week
```

### Example Timeline

**Sunday 8 PM**: 
- ✅ Scrapes **NEXT WEEK** (Nov 18-24)
- 📅 Schedules 4 workouts to Garmin calendar

**Monday 6 AM**:
- 🔍 Checks **CURRENT WEEK** (Nov 18-24) - finds 4 workouts already in DB
- ✅ **SKIPS SCRAPING** (already have the data from Sunday!)
- Checks if all synced → Nothing to do

**Tuesday-Sunday 6 AM**:
- 🔍 Checks **CURRENT WEEK** - finds workouts
- ✅ **SKIPS SCRAPING**
- Only syncs if any unsynced workouts exist

This means:
- ✅ **1 scrape per week** instead of 7+ scrapes
- ✅ **No duplicate work**
- ✅ **Efficient resource usage**
- ✅ **Still catches updates** if workouts are added mid-week

## Current Schedule

The pipeline runs automatically at:
1. **Every day at 06:00** (6 AM) - Morning sync to catch any new workouts
2. **Every Sunday at 20:00** (8 PM) - Evening sync after typical workout planning time

Both times are in **Europe/Copenhagen** timezone.

## How It Works

1. **Automatic Detection**: The scheduler finds all users who have both TrainingPeaks and Garmin credentials configured
2. **Sequential Processing**: Runs the pipeline for each user one at a time
3. **Current Week**: Always scrapes and syncs the current week's workouts
4. **Calendar Scheduling**: Schedules workouts to Garmin calendar (not pushing to devices)
5. **Duplicate Prevention**: Only syncs workouts that haven't been synced before

## What Happens During Each Run

```
⏰ Scheduled trigger activates
↓
�️ Determine which week to check (Sunday = next, other days = current)
↓
�🔍 Find all users with credentials
↓
For each user:
  � Check if target week has workouts in database
  ↓
  ├─ Workouts exist?
  │   └─ ✅ SKIP SCRAPING
  │       └─ Only sync unsynced workouts (if any)
  │
  └─ No workouts?
      └─ �📅 Scrape TrainingPeaks for target week
          ↓
          💾 Store sessions in database
          ↓
          🔍 Find unsynced sessions
          ↓
          📤 Create workouts in Garmin Connect
          ↓
          📅 Schedule to calendar for planned date
          ↓
          ✅ Mark as synced
```

## Customizing the Schedule

You can customize when the pipeline runs by editing the `PIPELINE_SCHEDULE` environment variable in `docker-compose.yml`.

### Schedule Format

The schedule uses **cron expression** format. Multiple schedules can be separated by semicolons (`;`).

**Current configuration:**
```yaml
PIPELINE_SCHEDULE=0 6 * * *;0 20 * * 0
```

### Cron Expression Format

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
│ │ │ │ │
* * * * *
```

### Example Schedules

**Multiple times per day:**
```yaml
PIPELINE_SCHEDULE=0 6,18 * * *
# Runs at 06:00 and 18:00 every day
```

**Weekdays only:**
```yaml
PIPELINE_SCHEDULE=0 6 * * 1-5
# Runs at 06:00 Monday through Friday
```

**Multiple specific times:**
```yaml
PIPELINE_SCHEDULE=0 6 * * *;0 12 * * *;0 20 * * 0
# Runs at 06:00 daily, 12:00 daily, and 20:00 on Sundays
```

**Every 6 hours:**
```yaml
PIPELINE_SCHEDULE=0 */6 * * *
# Runs at 00:00, 06:00, 12:00, 18:00
```

**Only Sundays and Wednesdays:**
```yaml
PIPELINE_SCHEDULE=0 6 * * 0,3
# Runs at 06:00 on Sundays and Wednesdays
```

## Applying Schedule Changes

1. Edit `docker-compose.yml` and change the `PIPELINE_SCHEDULE` value
2. Restart the service:
   ```bash
   docker compose up training-peaks-service -d
   ```
3. Check the logs to verify new schedule:
   ```bash
   docker compose logs training-peaks-service --tail=20
   ```

You should see output like:
```
📅 Pipeline scheduler configured with 2 schedule(s):
   1. 0 6 * * *
   2. 0 20 * * 0
✅ Scheduled job #1: 0 6 * * * (Europe/Copenhagen)
✅ Scheduled job #2: 0 20 * * 0 (Europe/Copenhagen)
```

## Manual Trigger

Users can still manually trigger the pipeline via the web interface by clicking "Sync Now" if they want immediate synchronization.

## Monitoring

**Check upcoming scheduled runs:**
```bash
docker compose logs training-peaks-service -f
```

**Look for scheduler messages:**
- `📅 [SCHEDULER] Today is Thursday` - Day detection
- `📅 [SCHEDULER] Will scrape CURRENT week` - Week selection
- `✅ [SCHEDULER] Week 2025-11-10 already has 4 workout(s) - SKIPPING SCRAPE` - Smart skip
- `🔍 [SCHEDULER] No workouts found for week - proceeding with scrape` - Will scrape
- `⏰ [SCHEDULER] Triggered by schedule` - Automatic run started
- `👥 [SCHEDULER] Found X user(s) with credentials` - Users being processed
- `✅ [SCHEDULER] Completed pipeline run` - All users processed

## Troubleshooting

**Pipeline not running:**
1. Check service is running: `docker compose ps training-peaks-service`
2. Check logs for errors: `docker compose logs training-peaks-service --tail=100`
3. Verify cron expression is valid: Use [crontab.guru](https://crontab.guru/)

**Pipeline runs but no workouts synced:**
- Verify users have both TrainingPeaks and Garmin credentials configured
- Check if workouts already exist (pipeline skips duplicates)
- Look for error messages in logs

**Want to test immediately:**
Go to the web interface and click "Sync Now" to trigger a manual run.
