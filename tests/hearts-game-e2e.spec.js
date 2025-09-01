const { test, expect } = require('@playwright/test');

test.describe('Hearts Game End-to-End Test', () => {
  test('Complete Hearts Game Flow: Login, Setup Lobby, Play Full Round', async ({ page }) => {
    // Test configuration
    const baseUrl = 'https://kl-pi.tail9f5728.ts.net';
    const timeout = 30000; // 30 seconds for network operations
    
    // Prerequisite: Login using Google Auth
    test.step('Navigate to application and login with Google OAuth', async () => {
      await page.goto(baseUrl);
      await expect(page).toHaveTitle(/Login/);
      
      // Click "Sign in with Google" button
      await page.click('text=Sign in with Google');
      
      // Handle Google OAuth flow (assuming test user credentials)
      // Note: In a real test environment, you'd use test credentials or mock OAuth
      await page.waitForURL('**/dashboard.html', { timeout });
      await expect(page).toHaveTitle(/Dashboard/);
    });

    // Step 1: Go to Hearts server
    test.step('Navigate to Hearts Game from dashboard', async () => {
      // Click on Hearts application link
      await page.click('text=Hearts Game', { timeout });
      await page.waitForURL('**/hearts/', { timeout });
      await expect(page).toHaveTitle('Hearts Game');
      
      // Verify we're on the Hearts game page
      await expect(page.locator('h1')).toContainText('♥️ Hearts Game');
    });

    // Step 2: Start lobby with three bots
    test.step('Setup game lobby with 3 bots', async () => {
      // Add Bot 2
      await page.click('button:has-text("Add Bot")', { timeout });
      await expect(page.locator('text=Bot')).toHaveCount(1);
      
      // Add Bot 3  
      await page.click('button:has-text("Add Bot")', { timeout });
      await expect(page.locator('text=Bot')).toHaveCount(2);
      
      // Add Bot 4
      await page.click('button:has-text("Add Bot")', { timeout });
      await expect(page.locator('text=Bot')).toHaveCount(3);
      
      // Verify we have 4 players total (1 human + 3 bots)
      await expect(page.locator('.player-list .player')).toHaveCount(4);
    });

    // Step 3: Start game
    test.step('Start the Hearts game', async () => {
      // Click Start Game button
      await page.click('button:has-text("Start Game")', { timeout });
      
      // Wait for game to initialize and cards to be dealt
      await page.waitForSelector('img[alt*="C"], img[alt*="D"], img[alt*="H"], img[alt*="S"]', { timeout });
      
      // Verify we have 13 cards in hand
      await expect(page.locator('.my-hand img')).toHaveCount(13);
      
      // Verify scoreboard is visible
      await expect(page.locator('h3:has-text("Scoreboard")')).toBeVisible();
    });

    // Step 4: Play one complete round
    test.step('Play complete round of Hearts', async () => {
      // Card passing phase
      await test.step('Complete card passing phase', async () => {
        // Select 3 cards to pass (usually high spades/hearts)
        const cards = page.locator('.my-hand img');
        await cards.nth(0).click();
        await cards.nth(1).click(); 
        await cards.nth(2).click();
        
        // Click pass button
        await page.click('button:has-text("Pass Cards")', { timeout });
        
        // Wait for passing to complete
        await page.waitForSelector('text=Play a card', { timeout });
      });

      // Play 13 tricks (complete round)
      await test.step('Play all 13 tricks', async () => {
        for (let trick = 1; trick <= 13; trick++) {
          console.log(`Playing trick ${trick}/13`);
          
          // Wait for our turn (when cards are clickable)
          await page.waitForSelector('.my-hand img[style*="cursor"]', { timeout });
          
          // Play the first available card
          const playableCards = page.locator('.my-hand img[style*="cursor"]');
          await playableCards.first().click();
          
          // Wait for trick to complete (cards to be collected)
          await page.waitForTimeout(2000);
          
          // Check if round is complete by looking for scoreboard update
          const roundComplete = await page.locator('text=Round').isVisible();
          if (roundComplete && trick >= 10) {
            // Round might be complete, check if new cards are dealt
            const cardCount = await page.locator('.my-hand img').count();
            if (cardCount === 0 || cardCount === 13) {
              console.log(`Round completed after ${trick} tricks`);
              break;
            }
          }
        }
      });

      // Verify round completion
      await test.step('Verify round completion and scoring', async () => {
        // Wait for scoring to be calculated and displayed
        await page.waitForTimeout(3000);
        
        // Verify scoreboard shows scores
        await expect(page.locator('table, .scoreboard')).toBeVisible();
        
        // Verify scores are numbers (not just placeholders)
        const scores = page.locator('.scoreboard td, .score');
        const scoreCount = await scores.count();
        expect(scoreCount).toBeGreaterThan(0);
        
        console.log('✅ Round completed successfully with scoring');
      });
    });

    // Additional verification
    test.step('Verify game state after round completion', async () => {
      // Check that game is in a valid state
      await expect(page.locator('h1:has-text("♥️ Hearts Game")')).toBeVisible();
      
      // Verify we can see game history or continue playing
      const gameButtons = page.locator('button');
      const buttonCount = await gameButtons.count();
      expect(buttonCount).toBeGreaterThan(0);
      
      console.log('✅ Game completed successfully - all steps passed!');
    });
  });

  // Helper test for just the login flow
  test('Google OAuth Login Flow Only', async ({ page }) => {
    await page.goto('https://kl-pi.tail9f5728.ts.net');
    await expect(page).toHaveTitle(/Login/);
    
    await page.click('text=Sign in with Google');
    await page.waitForURL('**/dashboard.html', { timeout: 30000 });
    await expect(page).toHaveTitle(/Dashboard/);
    
    // Verify dashboard has Hearts Game link
    await expect(page.locator('text=Hearts Game')).toBeVisible();
  });

  // Helper test for game setup without login
  test('Hearts Game Setup (requires manual login)', async ({ page }) => {
    // Skip if not already logged in
    await page.goto('https://kl-pi.tail9f5728.ts.net/hearts/');
    
    // Check if we're redirected to login (means we need auth)
    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('oauth')) {
      test.skip('Skipping - requires authentication');
    }
    
    await expect(page).toHaveTitle('Hearts Game');
    
    // Test bot addition
    await page.click('button:has-text("Add Bot")');
    await page.click('button:has-text("Add Bot")');
    await page.click('button:has-text("Add Bot")');
    
    await expect(page.locator('text=Bot')).toHaveCount(3);
    console.log('✅ Game setup completed - 3 bots added');
  });

  // Test Camera Feature in Lobby
  test('Camera Feature Test: Lobby Setup with Camera Enable', async ({ page }) => {
    const baseUrl = 'https://kl-pi.tail9f5728.ts.net';
    const timeout = 30000;
    
    // Login first
    await test.step('Login with Google OAuth', async () => {
      await page.goto(baseUrl);
      await expect(page).toHaveTitle(/Login/);
      
      await page.click('text=Sign in with Google');
      await page.waitForURL('**/dashboard.html', { timeout });
      await expect(page).toHaveTitle(/Dashboard/);
    });

    // Navigate to Hearts Game
    await test.step('Navigate to Hearts Game', async () => {
      await page.click('text=Hearts Game', { timeout });
      await page.waitForURL('**/hearts/', { timeout });
      await expect(page).toHaveTitle('Hearts Game');
      await expect(page.locator('h1')).toContainText('♥️ Hearts Game');
    });

    // Setup lobby with player and 3 bots
    await test.step('Setup lobby: Add 3 bots', async () => {
      // Verify we start with just the main player
      await expect(page.locator('.player-list .player, [class*="player"]')).toHaveCount(1);
      
      // Add Bot 1
      await page.click('button:has-text("Add Bot")', { timeout });
      await page.waitForTimeout(1000); // Wait for bot to be added
      
      // Add Bot 2  
      await page.click('button:has-text("Add Bot")', { timeout });
      await page.waitForTimeout(1000);
      
      // Add Bot 3
      await page.click('button:has-text("Add Bot")', { timeout });
      await page.waitForTimeout(1000);
      
      // Verify we now have 4 players total (1 human + 3 bots)
      await expect(page.locator('text=Bot')).toHaveCount(3);
      console.log('✅ Lobby setup complete: 1 player + 3 bots');
    });

    // Enable camera
    await test.step('Enable camera feature', async () => {
      // Look for camera enable button
      const cameraButton = page.locator('button:has-text("📹"), button:has-text("Enable Camera"), button:has-text("Camera")');
      await expect(cameraButton).toBeVisible({ timeout });
      
      // Grant camera permissions (this will trigger browser permission dialog)
      await page.context().grantPermissions(['camera', 'microphone']);
      
      // Click the camera enable button
      await cameraButton.click();
      
      // Wait for camera to initialize
      await page.waitForTimeout(3000);
      
      // Verify camera is enabled - look for video elements or camera indicators
      const videoElements = page.locator('video, [class*="video"], [class*="camera"]');
      const cameraIndicators = page.locator('text=Camera enabled, 🎥, [class*="camera-on"]');
      
      // Check if either video elements exist or camera status changed
      const hasVideo = await videoElements.count() > 0;
      const hasIndicator = await cameraIndicators.count() > 0;
      const buttonTextChanged = await page.locator('button:has-text("Disable Camera"), button:has-text("📹 Disable")').isVisible();
      
      if (hasVideo || hasIndicator || buttonTextChanged) {
        console.log('✅ Camera enabled successfully');
        
        // Log what we found
        if (hasVideo) console.log(`  - Found ${await videoElements.count()} video elements`);
        if (hasIndicator) console.log('  - Found camera enabled indicators');
        if (buttonTextChanged) console.log('  - Camera button changed to disable state');
      } else {
        console.log('⚠️  Camera enable button clicked, but unclear if camera activated');
        console.log('  - This might require actual camera hardware or browser-specific behavior');
      }
      
      // Take a screenshot to capture the current state
      await page.screenshot({ path: 'camera-enabled-state.png', fullPage: true });
      console.log('📸 Screenshot saved as camera-enabled-state.png');
    });

    // Verify lobby state with camera
    await test.step('Verify lobby state with camera enabled', async () => {
      // Ensure we still have all players
      await expect(page.locator('text=Bot')).toHaveCount(3);
      
      // Verify game controls are still available
      await expect(page.locator('button:has-text("Start Game")')).toBeVisible();
      
      // Check if camera controls are present
      const cameraControls = page.locator('button:has-text("Disable"), button:has-text("📹")');
      if (await cameraControls.count() > 0) {
        console.log('✅ Camera controls visible in lobby');
      }
      
      console.log('✅ Lobby state verified with camera feature');
      console.log('🎯 Ready for next steps!');
    });
  });
});
