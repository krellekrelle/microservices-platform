# Hearts Game End-to-End Test Suite

This test suite automates the complete user story for the Hearts Game application, from login to playing a full round.

## User Story Covered

**As a user, I want to:**
1. **Prerequisite**: Login using Google OAuth
2. **Step 1**: Go to Hearts Game server from dashboard  
3. **Step 2**: Start lobby with three bots
4. **Step 3**: Start the game
5. **Step 4**: Play one complete round of Hearts

## Test Structure

### Main Test: `Complete Hearts Game Flow`
- **Duration**: ~3-5 minutes per run
- **Scope**: Full end-to-end user journey
- **Validation**: Login, game setup, card play, scoring

### Helper Tests:
- **Google OAuth Login Flow Only**: Tests just the authentication
- **Hearts Game Setup**: Tests lobby setup (requires manual login)

## Prerequisites

1. **Playwright Installation**:
   ```bash
   cd tests
   npm install
   npx playwright install
   ```

2. **Running Server**: Your Hearts game server should be running at `https://kl-pi.tail9f5728.ts.net`

3. **Test Credentials**: For OAuth testing, you'll need valid Google test credentials

## Running the Tests

### Run All Tests
```bash
npm run test
```

### Run with Browser Visible (for debugging)
```bash
npm run test:headed
```

### Run Hearts Game Test Only
```bash
npm run test:hearts
```

### Debug Mode (step through test)
```bash
npm run test:debug
```

### View Test Report
```bash
npm run test:report
```

## Test Flow Details

### 1. Authentication Phase
- Navigate to login page
- Click "Sign in with Google" 
- Handle OAuth redirect flow
- Verify dashboard access

### 2. Navigation Phase  
- Access Hearts Game from dashboard
- Verify game page loads correctly
- Check UI elements are present

### 3. Lobby Setup Phase
- Add 3 bots to create 4-player game
- Verify player count and bot names
- Ensure "Start Game" button is available

### 4. Game Initialization Phase
- Start the game
- Wait for card dealing animation
- Verify 13 cards in hand
- Check scoreboard visibility

### 5. Card Passing Phase
- Select 3 cards to pass
- Submit card passing
- Wait for game to continue to trick-taking

### 6. Trick-Taking Phase
- Play 13 tricks automatically
- Make legal card plays each turn
- Wait for trick completion animations
- Handle game state updates

### 7. Scoring Verification Phase
- Verify round completion
- Check scoreboard updates
- Validate penalty point calculation
- Confirm game state is valid

## Test Configuration

### Timeouts
- **Global Test Timeout**: 3 minutes (Hearts games take time)
- **Action Timeout**: 30 seconds (for individual clicks/interactions)  
- **Navigation Timeout**: 45 seconds (for page loads)
- **Assertion Timeout**: 10 seconds (for element checks)

### Browsers Tested
- Desktop Chrome (primary)
- Desktop Firefox  
- Desktop Safari
- Mobile Chrome (Pixel 5)
- Mobile Safari (iPhone 12)

## Debugging Failed Tests

### Common Issues and Solutions

1. **OAuth Timeout**: 
   - Check if Google OAuth service is accessible
   - Verify test credentials are valid

2. **Card Play Failures**:
   - Game state might be out of sync
   - Try increasing wait times between actions

3. **Bot Addition Failures**:
   - Server might be slow to respond
   - Check network connectivity

### Debug Commands
```bash
# Run with screenshots on every step
npx playwright test --headed --screenshot=on

# Run single test with full trace
npx playwright test hearts-game-e2e.spec.js --trace=on

# Run with video recording
npx playwright test --headed --video=on
```

## Extending the Tests

### Adding More Game Scenarios
```javascript
test('Play Multiple Rounds', async ({ page }) => {
  // Complete setup as in main test
  // Then add:
  
  for (let round = 1; round <= 3; round++) {
    await test.step(`Play Round ${round}`, async () => {
      // Play round logic
    });
  }
});
```

### Testing Different Bot Counts
```javascript
test('Hearts Game with 2 Bots', async ({ page }) => {
  // Add only 2 bots instead of 3
  // Test 3-player game variant
});
```

### Testing Error Scenarios
```javascript
test('Handle Network Disconnection', async ({ page }) => {
  // Start game normally
  // Simulate network issues
  // Verify graceful degradation
});
```

## Test Data and Results

### Expected Outcomes
- ✅ Successful login via Google OAuth
- ✅ 4-player game setup (1 human + 3 bots)
- ✅ Complete 13-trick round
- ✅ Valid penalty point scoring
- ✅ Game state consistency

### Performance Benchmarks
- **Login Flow**: < 10 seconds
- **Game Setup**: < 5 seconds  
- **Full Round**: 2-4 minutes
- **Total Test**: < 5 minutes

## Maintenance Notes

### When to Update Tests
- Hearts game rule changes
- UI/UX modifications  
- Authentication flow changes
- New browser compatibility requirements

### Test Environment
- Should run against staging environment first
- Production testing requires careful coordination
- Consider using test-specific OAuth app for isolation

---

**Created**: September 1, 2025  
**Purpose**: Automated verification of complete Hearts Game user journey  
**Maintainer**: Development Team
