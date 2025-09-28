// Legacy Sound Manager - extracted for Vue.js compatibility

class SoundManager {
    constructor() {
        this.sounds = {
            heartsBreak: new Audio('/hearts/sounds/glass-cinematic-hit-161212.mp3'), // Sound when hearts are broken
            queenOfSpades: new Audio('/hearts/sounds/girl-oh-no-150550.mp3') // Sound when Queen of Spades is played
        };
        
        // Set volume levels
        Object.values(this.sounds).forEach(audio => {
            audio.volume = 0.6;
            audio.preload = 'auto';
        });
        
        // Track game state to detect when events happen
        this.lastGameState = null;
        this.heartsBrokenThisRound = false;
        this.currentRound = 1;
    }
    
    playSound(soundName) {
        if (this.sounds[soundName]) {
            try {
                // Reset to beginning and play
                this.sounds[soundName].currentTime = 0;
                this.sounds[soundName].play().catch(e => {
                    console.log('Sound play prevented by browser policy:', e);
                });
            } catch (error) {
                console.log('Error playing sound:', error);
            }
        }
    }
    
    // Check for sound-triggering events in the game state
    checkForSoundEvents(gameState) {
        if (!gameState || gameState.state !== 'playing') {
            return;
        }
        
        // Reset heart break tracking when round changes
        if (gameState.currentRound !== this.currentRound) {
            this.currentRound = gameState.currentRound;
            this.heartsBrokenThisRound = false;
        }
        
        // Check if a heart card was just played (first heart played in the round)
        if (gameState.currentTrickCards && gameState.currentTrickCards.length > 0) {
            const lastPlayedCard = gameState.currentTrickCards[gameState.currentTrickCards.length - 1];
            
            // Check if this is a new card since last update
            const wasJustPlayed = !this.lastGameState || 
                !this.lastGameState.currentTrickCards || 
                this.lastGameState.currentTrickCards.length !== gameState.currentTrickCards.length;
            
            if (wasJustPlayed && lastPlayedCard) {
                // Check for Queen of Spades
                if (lastPlayedCard.card === 'QS') {
                    console.log('🔊 Queen of Spades played! Playing sound effect...');
                    this.playSound('queenOfSpades');
                }
                
                // Check for heart card (first heart played breaks hearts)
                if (lastPlayedCard.card && lastPlayedCard.card[1] === 'H' && !this.heartsBrokenThisRound) {
                    this.heartsBrokenThisRound = true;
                    console.log('🔊 Hearts broken! Playing sound effect...');
                    this.playSound('heartsBreak');
                }
            }
        }
        
        // Store current state for next comparison
        this.lastGameState = JSON.parse(JSON.stringify(gameState));
    }
}

// Make available globally
window.SoundManager = SoundManager;