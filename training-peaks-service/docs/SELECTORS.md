# TrainingPeaks CSS Selectors and Data Structure

Based on live inspection of the TrainingPeaks calendar interface, here are the CSS selectors and data extraction patterns for scraping the September 1-7, 2025 week.

## Calendar Navigation

### Week View URL Pattern
- Calendar URL: `https://app.trainingpeaks.com/#calendar`
- Date picker: `textbox[placeholder*="2025-09-01"]` or similar date input
- Today button: `button:contains("Today")`

## Calendar Structure

### Daily Containers
- Week container: Calendar uses a grid layout with daily cells
- Each day has a container structure with date number and workout list

### September 1-7, 2025 Specific Selectors

#### Day Containers (September 1-7, 2025)
```javascript
// September 1st container (ref=e3243)
'generic[ref="e3243"]'  // Contains "1 Sep" and all workouts for that day

// Individual workout containers within each day
'generic[cursor="pointer"]'  // Clickable workout elements
```

#### Workout Elements Structure
Each workout has this structure:
```html
<generic cursor="pointer">
  <generic>
    <img> <!-- Sport icon -->
    <button> <!-- Menu button -->
  </generic>
  <generic>
    <heading level="6">WORKOUT_TITLE</heading>
    <generic>
      <generic>DURATION</generic>
      <generic>
        <generic>DISTANCE_VALUE</generic>
        <generic>DISTANCE_UNIT</generic>
      </generic>
      <generic>
        <generic>TSS_VALUE</generic>
        <generic>TSS_UNIT</generic>
      </generic>
    </generic>
    <generic>WORKOUT_DESCRIPTION</generic> <!-- Optional -->
    <generic>PLANNED_INFO</generic> <!-- Optional, e.g., "P: 15.0 km" -->
  </generic>
</generic>
```

## Data Extraction Patterns

### September 1, 2025 Workouts (ref=e3265 and e3296)

#### Cycling Workout (ref=e3265)
- **Title**: `heading[level="6"]` → "Cycling"
- **Duration**: First generic child → "1:00:11"
- **Distance**: Distance value + unit → "21.8 km"
- **TSS**: TSS value + unit → "41 hrTSS"
- **Sport Icon**: `img` element within workout container

#### Running Workout (ref=e3296)  
- **Title**: `heading[level="6"]` → "Jog"
- **Duration**: First generic child → "1:00:15"
- **Distance**: Distance value + unit → "10.8 km"
- **TSS**: TSS value + unit → "262 TSS"
- **Description**: Long text element → "60 min jog. Handler om at komme så nemt igennem som muligt"
- **Planned Info**: Text starting with "P:" → "P: 1:00:00"

### Planned Workouts (September 3-7, 2025)

#### September 3rd - Intervaller (ref=e3359)
- **Title**: "Intervaller"
- **Distance**: "17.0 km"
- **Description**: "4 km opvarmning 4x 100 meter flowløb 3x 1 km 4.05- 4.15 200 meter jog imellem 2x 2 km 4.05- 4..."

#### September 4th - Tur med ryk (ref=e3384)
- **Title**: "Tur med ryk"
- **Distance**: "12.0 km"
- **Description**: "4 km 5.00- 5.15 4 km 4.25- 4.35 4 km 5.00- 5.15"

#### September 5th - Tur/stræk/flow (ref=e3409)
- **Title**: "Tur/stræk/flow"
- **Distance**: "12.0 km"
- **Description**: "10 km 4.50- 5.00 Dynamisk stræk Se følgende video https://www.youtube.com/watch?v=HLFv2P5_tLk ..."

#### September 7th - Tempo træning (ref=e3438)
- **Title**: "Tempo træning"
- **Distance**: "15.0 km"
- **Description**: "5 km jog 5 km 4.05- 4.15 5 km jog"

## Weekly Summary Data (Right Column)

### Performance Metrics Container
Located in the weekly summary column:
```javascript
// Total Duration
'generic:contains("Total Duration")' // → "1:00 2:00"

// Run Duration
'generic:contains("Run Duration")' // → "1:00 1:00"

// Run Distance
'generic:contains("Run Distance")' // → "56.0 10.8 km"

// TSS
'generic:contains("TSS")' // → "303TSS"

// Bike distance
'generic:contains("Bike")' // → "21.8km"

// Elevation Gain
'generic:contains("El. Gain")' // → "232m"

// Work (kJ)
'generic:contains("Work")' // → "1284kJ"
```

## Sport Icon Mapping

Different sports have different icon images:
- **Cycling**: Bicycle icon
- **Running**: Running figure icon
- **Strength**: Weight/dumbbell icon
- **Other activities**: Various sport-specific icons

## Data Fields Available

### For Completed Workouts:
- Title/Sport type
- Duration (HH:MM:SS)
- Distance (with unit)
- TSS value (with unit type: TSS, hrTSS, rTSS)
- Calories (when available)
- Heart rate data (when available)
- Elevation gain (when available)

### For Planned Workouts:
- Title
- Planned distance
- Workout description/instructions
- Planned duration (in description)

## Implementation Notes

1. **Workout Detection**: Use `cursor="pointer"` elements within daily containers
2. **Data Extraction**: Parse the hierarchical generic elements to extract specific values
3. **Sport Type**: Can be determined from the heading text or sport icon
4. **Planned vs Completed**: Completed workouts have duration/TSS data, planned ones have descriptions
5. **Date Context**: Extract date from the daily container header (e.g., "1 Sep")

## Scraping Strategy

1. Navigate to calendar URL
2. Ensure September 2025 is displayed
3. Locate daily containers for Sept 1-7
4. For each day, find workout elements (`cursor="pointer"`)
5. Extract workout data using the hierarchical structure
6. Store with proper date association
7. Handle both completed and planned workout formats
