// Always show game section if in passing or playing phase
function ensureGameSectionVisible() {
    if (lobbyState && (lobbyState.state === 'passing' || lobbyState.state === 'playing')) {
        showGameSection();
    }
}
// hearts-game.js - extracted from index.html

let socket;
let currentUser = null;
let mySeat = null;
let isReady = false;
let lobbyState = null;
let hasPassed = false;

// Initialize socket connection
function initializeSocket() {
    console.log('🚀 Initializing Socket.IO connection...');
    console.log('🌍 Connecting to:', window.location.origin);
    console.log('🍪 Document.cookie:', document.cookie);
    // Connect using the current path context (within /hearts/)
    socket = io({
        withCredentials: true,
        transports: ['websocket', 'polling'],
        path: '/hearts/socket.io/'
    });
    socket.on('connect', () => {
        console.log('✅ Connected to server successfully');
        console.log('🆔 Socket ID:', socket.id);
        updateConnectionStatus(true);
        socket.emit('join-lobby');
    });
    socket.on('disconnect', (reason) => {
        console.log('❌ Disconnected from server. Reason:', reason);
        updateConnectionStatus(false);
    });
    socket.on('lobby-updated', (data) => {
        console.log('🏠 Lobby updated:', data);
        updateLobbyDisplay(data);
    });
    socket.on('game-started', (data) => {
        console.log('🎮 Game started:', data);
        showGameSection();
    });
    // cards-dealt event is no longer needed; hand is always included in game-state
    // Listen for game state updates (after passing, etc)
    socket.on('game-state', (data) => {
        ensureGameSectionVisible();
        console.log('🎲 Game state update:', data);
        lobbyState = data;
        // Only update hand and UI if in 'playing' state, or if in 'passing' state and I haven't passed yet
        let myHand = null;
        // let hasPassed = false;
        if (typeof mySeat === 'number' && data.players && data.players[mySeat]) {
            myHand = data.players[mySeat].hand;
            // If hand is missing but handSize is 10, assume passed
            // if (!myHand && typeof data.players[mySeat].handSize === 'number' && data.players[mySeat].handSize < 13) {
            //     hasPassed = true;
            // }
        }
        if (data.state === 'playing' || data.state === 'passing') {
            // Always show the diamond layout for both passing and playing
            // Use myHand if available, otherwise empty array
            let handToShow = myHand || [];
            window.currentHand = handToShow;

            const passBtn = document.getElementById('pass-cards-btn');
            const trickArea = document.getElementById('trick-area');
            if (data.state === 'passing') {
                hasPassed = false;
                if (passBtn) {
                    passBtn.classList.remove('hidden');
                }
                if (trickArea) {
                    trickArea.classList.add('hidden');
                }
            } else {
                console.log('game stat playing. Clearing selected cards');
                // no selected cards if in playing
                window.selectedCards = [];
                if (passBtn) {
                    passBtn.classList.add('hidden');
                }
                if (trickArea) {
                    trickArea.classList.remove('hidden');
                }
            }
            console.log('showHand():, ', handToShow);
            showHand(handToShow);
            if (data.state === 'playing') {
                console.log('showTrick()');
                showTrick(data.currentTrickCards || []);
            } else {
                showTrick([]);
            }
            // updateGameStateLabel();
        } else {
            // Hide trick area in other phases
            showTrick([]);
            // updateGameStateLabel();
        }
    }); // End socket.on('game-state')
    // Listen for trick-completed event
    socket.on('trick-completed', (data) => {
        // Show the completed trick and highlight the winner
        showTrick(data.trickCards || [], data.winner);
        // Optionally, clear the trick area after a short delay
        setTimeout(() => showTrick([]), 2000);
    });
    // Debug transport events
    socket.on('disconnect', (reason, details) => {
        console.log('🔌 Disconnect reason:', reason);
        console.log('🔍 Disconnect details:', details);
    });
    socket.io.on('error', (error) => {
        console.error('🚨 Socket.IO error:', error);
    });
}

// Show the current trick in the trick area
function showTrick(trickCards, winnerSeat) {
    const trickArea = document.getElementById('trick-area');
    if (!trickArea) return;
    if (!trickCards || trickCards.length === 0) {
        trickArea.innerHTML = '';
        return;
    }
    // Render each card in the trick with player info
    trickArea.innerHTML = '<div style="font-size:1.1rem;margin-bottom:0.5rem;">Current Trick:</div>' +
        '<div style="display:flex;justify-content:center;gap:24px;">' +
        trickCards.map(play => {
            const highlight = (typeof winnerSeat !== 'undefined' && play.seat === winnerSeat) ? 'box-shadow:0 0 12px 4px #ffeb3b;' : '';
            return `<div style="text-align:center;">
                <img src="${getCardImageUrl(play.card)}" alt="${play.card}" title="${play.card}" style="width:60px;height:90px;margin-bottom:6px;border-radius:7px;background:#fff;${highlight}">
                <div style="font-size:0.95rem;margin-top:2px;">${play.player || 'Player ' + (play.seat+1)}</div>
            </div>`;
        }).join('') +
        '</div>';
}

// // Update the game state label in its own element
// function updateGameStateLabel() {
//     const labelDiv = document.getElementById('game-state-label');
//     const handArea = document.getElementById('hand-area');
//     const gameSeatsContainer = document.querySelector('.game-seats-container');
//     if (!labelDiv || !handArea) return;
//     if (lobbyState && lobbyState.state) {
//         let stateLabel = '';
//         let turnLabel = '';
//         switch (lobbyState.state) {
//             case 'passing':
//                 stateLabel = 'Passing Round';
//                 let hasPassed = false;
//                 if (typeof mySeat === 'number' && lobbyState.players && lobbyState.players[mySeat]) {
//                     const myPlayer = lobbyState.players[mySeat];
//                     if (myPlayer.readyToPass) {
//                         hasPassed = true;
//                     }
//                 }
//                 // Enable/disable button
//                 updatePassButton();
//                 break;
//             case 'playing':
//                 stateLabel = 'Trick Play';
//                 window.selectedCards = [];
//                 // Re-render hand to clear selection highlights
//                 let myHand = null;
//                 if (typeof mySeat === 'number' && lobbyState.players && lobbyState.players[mySeat]) {
//                     myHand = lobbyState.players[mySeat].hand;
//                 }
//                 showHand(myHand || []);
//                 // Show whose turn it is
//                 // if (typeof lobbyState.currentTurnSeat === 'number' && lobbyState.players) {
//                 //     if (mySeat === lobbyState.currentTurnSeat) {
//                 //         turnLabel = '<span style="color:#4caf50;font-weight:bold;">Your turn!</span>';
//                 //     } else {
//                 //         const turnPlayer = lobbyState.players[lobbyState.currentTurnSeat];
//                 //         if (turnPlayer && turnPlayer.userName) {
//                 //             turnLabel = `${turnPlayer.userName}'s turn`;
//                 //         } else {
//                 //             turnLabel = `Player ${lobbyState.currentTurnSeat + 1}'s turn`;
//                 //         }
//                 //     }
//                 // }
//                 break;
//             case 'scoring':
//                 stateLabel = 'Scoring';
//                 // const passBtnScore = document.getElementById('pass-cards-btn');
//                 // if (passBtnScore && passBtnScore.parentElement) passBtnScore.parentElement.remove();
//                 // const waitMsgScore = document.getElementById('waiting-pass-msg');
//                 // if (waitMsgScore) waitMsgScore.remove();
//                 break;
//             default:
//                 stateLabel = lobbyState.state.charAt(0).toUpperCase() + lobbyState.state.slice(1);
//                 // const passBtnDefault = document.getElementById('pass-cards-btn');
//                 // if (passBtnDefault && passBtnDefault.parentElement) passBtnDefault.parentElement.remove();
//                 // const waitMsgDefault = document.getElementById('waiting-pass-msg');
//                 // if (waitMsgDefault) waitMsgDefault.remove();
//         }
//         labelDiv.innerHTML = `Game State: <span style="color:#ffeb3b;">${stateLabel}</span>` + (turnLabel ? ` &mdash; <span style="color:#fff;">${turnLabel}</span>` : '');
//     } else {
//         labelDiv.innerHTML = '';
//         // const passBtn = document.getElementById('pass-cards-btn');
//         // if (passBtn && passBtn.parentElement) passBtn.parentElement.remove();
//         // const waitMsg = document.getElementById('waiting-pass-msg');
//         // if (waitMsg) waitMsg.remove();
//     }
// }

// Map card code (e.g. 'QS') to local SVG in bridge3-box-qr-Large
function getCardImageUrl(cardCode) {
    if (!cardCode || cardCode.length < 2) return '';
    let rank = cardCode[0];
    let suit = cardCode[1];
    if (rank === '1' && cardCode[1] === '0') { rank = 'T'; suit = cardCode[2]; }
    const fileName = (rank + suit).toUpperCase() + '.svg';
    return `/hearts/bridge3-box-qr-Large/${fileName}`;
}

// Show the player's hand as card images
function showHand(hand) {
    // Diamond layout for game phase
    // const handArea = document.getElementById('hand-area');
    // console.log("handarea:", handArea);
    // if (!handArea) return;
    const gameSeatsContainer = document.querySelector('.game-seats-container');
    console.log('gameseatscontainer: ', gameSeatsContainer);
    // Always use diamond layout for both passing and playing phases
    if (lobbyState && (lobbyState.state === 'playing' || lobbyState.state === 'passing') && gameSeatsContainer) {
        console.log("Doing show hand seat selection!");
        // Clear only the player seat cells, NOT the center cell
        const seatClassesToClear = ['game-seat-hand','game-seat-right','game-seat-upper','game-seat-left'];
        seatClassesToClear.forEach(cls => {
            const cell = gameSeatsContainer.querySelector('.' + cls);
            if (cell) cell.innerHTML = '';
        });
        // Map logical seat numbers to visual positions so that the order is consistent with the lobby
        // areaMap: [bottom, right, top, left]
        const areaMap = ['game-seat-hand','game-seat-right','game-seat-upper','game-seat-left'];
        let seatOrder = [0,1,2,3];
        if (typeof mySeat === 'number') {
            // My seat is always at the bottom
            // The order is: me (bottom), (mySeat+1)%4 (right), (mySeat+2)%4 (top), (mySeat+3)%4 (left)
            seatOrder = [mySeat, (mySeat+1)%4, (mySeat+2)%4, (mySeat+3)%4];
        }
        for (let i=0; i<4; i++) {
            const seatIdx = seatOrder[i];
            const player = lobbyState.players[seatIdx];
            const cell = gameSeatsContainer.querySelector('.'+areaMap[i]);
            if (!cell) continue;
            if (i === 0) {
                // My seat (bottom): show hand
                if (!hand || !Array.isArray(hand) || hand.length === 0) {
                    cell.innerHTML = '<em>No cards dealt.</em>';
                } else {
                    console.log('updating hand!')
                    cell.innerHTML = '<div id="hand-cards"></div>';
                    const handCardsDiv = cell.querySelector('#hand-cards');
                    handCardsDiv.innerHTML = hand.map(card => {
                        // Is this card selected?
                        const isSelected = window.selectedCards && window.selectedCards.includes(card);
                        // Add selected class and outline if selected
                        const selectedClass = isSelected ? ' selected' : '';
                        const outline = isSelected ? 'outline:3px solid #ffeb3b;' : 'outline:none;';
                        // Do NOT add inline onclick; use only delegated event listener
                        return `<img src="${getCardImageUrl(card)}" alt="${card}" title="${card}" data-card="${card}" class="card-img${selectedClass}" style="width:50px;height:72px;margin:0 1px;vertical-align:middle;box-shadow:0 2px 8px #0003;border-radius:8px;background:#fff;${outline}cursor:pointer;">`;
                    }).join('');
                }
            } else {
                // Other players: show only the player's name (first name or Player N)
                cell.innerHTML = `
                    <div class="opponent-info${lobbyState.currentTurnSeat===seatIdx?' current-turn':''}">
                        <div class="opponent-name">${player ? (player.userName ? player.userName.split(' ')[0] : 'Player '+(seatIdx+1)) : 'Empty'}</div>
                    </div>
                `;
            }
            // Highlight current turn
            if (lobbyState.currentTurnSeat === seatIdx) {
                cell.classList.add('current-turn');
            } else {
                cell.classList.remove('current-turn');
            }
        }
        // Always hide the old hand area in passing/playing phase
        // handArea.style.display = 'none';
        updateCardSelectionUI();
        return;
    } 
    // else { // if not the playing or passing phase.
    //     // Only show hand in hand-area in the lobby phase
    //     handArea.style.display = '';
    //     if (!hand || !Array.isArray(hand)) {
    //         handArea.innerHTML = '<em>No cards dealt.</em>';
    //         return;
    //     }
    //     if (!window._lastPhase) window._lastPhase = null;
    //     const currentPhase = lobbyState ? lobbyState.state : null;
    //     if (!window.selectedCards) window.selectedCards = [];
    //     if (window._lastPhase !== currentPhase) {
    //         if (currentPhase === 'playing' || currentPhase === 'passing') {
    //             window.selectedCards = [];
    //         }
    //         window._lastPhase = currentPhase;
    //     }
    //     handArea.innerHTML = '<div id="hand-cards"></div>';
    //     const handCardsDiv = document.getElementById('hand-cards');
    //     handCardsDiv.innerHTML = hand.map(card =>
    //         `<img src="${getCardImageUrl(card)}" alt="${card}" title="${card}" data-card="${card}" class="card-img" style="width:56px;height:80px;margin:0 1px;vertical-align:middle;box-shadow:0 2px 8px #0003;border-radius:8px;background:#fff;outline:none;cursor:pointer;">`
    //     ).join('');
    //     updateCardSelectionUI();
    // }
}

// Play a card (only allowed if it's your turn and in playing state)
function playCard(card) {
    if (!lobbyState || lobbyState.state !== 'playing' || typeof mySeat !== 'number' || mySeat !== lobbyState.currentTurnSeat) {
        return;
    }
    const handCardsDiv = document.getElementById('hand-cards');
    if (handCardsDiv) {
        Array.from(handCardsDiv.children).forEach(img => {
            img.style.pointerEvents = 'none';
        });
    }
    fetch('/hearts/play-card', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ card })
    })
    .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            showErrorMessage(data.error || 'Invalid card or server error');
            const handCardsDiv = document.getElementById('hand-cards');
            if (handCardsDiv) {
                Array.from(handCardsDiv.children).forEach(img => {
                    img.style.pointerEvents = 'auto';
                });
            }
            return;
        }
    })
    .catch((err) => {
        showErrorMessage('Network/server error');
        const handCardsDiv = document.getElementById('hand-cards');
        if (handCardsDiv) {
            Array.from(handCardsDiv.children).forEach(img => {
                img.style.pointerEvents = 'auto';
            });
        }
    });
}

// Update card selection UI only (no re-render of SVGs)
function updateCardSelectionUI() {
    console.log("Updating card selectionUI")
    const hand = window.currentHand || [];
    const handCardsDiv = document.getElementById('hand-cards');
    if (!handCardsDiv) return;
    Array.from(handCardsDiv.children).forEach((img, idx) => {
        const card = hand[idx];
        if (window.selectedCards && window.selectedCards.includes(card)) {
            img.classList.add('selected');
            img.style.outline = '3px solid #ffeb3b';
        } else {
            img.classList.remove('selected');
            img.style.outline = 'none';
        }
    });
    updatePassButton();
}

// Make toggleCard globally accessible for inline onclick
function toggleCard(card) {
    console.log('[DEBUG] toggleCard called:', card, 'selectedCards:', window.selectedCards);
    if (!lobbyState || lobbyState.state !== 'passing') {
        console.log('[DEBUG] Not in passing phase, ignoring card click.');
        return;
    } else if (hasPassed) {
        console.log('[DEBUG] Already passed, ignoring card click.');
        return;
    }
    const idx = window.selectedCards.indexOf(card);
    if (idx === -1) {
        if (window.selectedCards.length < 3) {
            window.selectedCards.push(card);
            console.log('[DEBUG] Card selected:', card, 'selectedCards:', window.selectedCards);
        }
    } else {
        window.selectedCards.splice(idx, 1);
        console.log('[DEBUG] Card deselected:', card, 'selectedCards:', window.selectedCards);
    }
    updateCardSelectionUI();
}

// Enable/disable Pass Cards button
function updatePassButton() {
    const btn = document.getElementById('pass-cards-btn');
    if (!btn) return;
    btn.disabled = !(window.selectedCards && window.selectedCards.length === 3);
}

// Pass selected cards to server
function passSelectedCards() {
    if (!window.selectedCards || window.selectedCards.length !== 3) {
        console.log('[DEBUG] passSelectedCards: Not exactly 3 cards selected:', window.selectedCards);
        return;
    }
    hasPassed = true;
    console.log('[DEBUG] Emitting pass-cards event:', window.selectedCards);
    socket.emit('pass-cards', {cards: window.selectedCards});

    const btn = document.getElementById('pass-cards-btn');
    if (!btn) return;
    btn.disabled = true;
}

function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connection-status');
    if (connected) {
        statusEl.textContent = 'Connected';
        statusEl.className = 'connection-status connected';
    } else {
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'connection-status disconnected';
    }
}

function updateLobbyDisplay(state) {
    lobbyState = state;
    let playerCount = 0;
    let readyCount = 0;
    let allReady = true;
    for (let seat = 0; seat < 4; seat++) {
        let player = state.players[seat];
        if (player) {
            playerCount++;
            if (player.isReady && player.isConnected) {
                readyCount++;
            } else {
                allReady = false;
            }
        } else {
            allReady = false;
        }
    }
    document.getElementById('player-count').textContent = playerCount;
    let leaderName = 'None';
    if (state.lobbyLeader !== null && state.players[state.lobbyLeader]) {
        const fullName = state.players[state.lobbyLeader].userName;
        leaderName = fullName ? fullName.split(' ')[0] : '';
    }
    document.getElementById('lobby-leader').textContent = leaderName;
    if (playerCount === 4 && readyCount === 4) {
        state.canStartGame = true;
    }
    const seatClassMap = ['seat-upper', 'seat-left', 'seat-right', 'seat-lower'];
    for (let seat = 0; seat < 4; seat++) {
        const seatEl = document.querySelector(`[data-seat="${seat}"]`);
        let player = state.players[seat];
        seatEl.className = `seat ${seatClassMap[seat]}`;
        if (player) {
            seatEl.classList.add('occupied');
            const isMySeat = player.userId === currentUser?.id;
            if (isMySeat) {
                seatEl.classList.add('my-seat');
                mySeat = seat;
                isReady = player.isReady;
            }
            const firstName = player.userName ? player.userName.split(' ')[0] : '';
            seatEl.innerHTML = `
                <div class="seat-number">Seat ${seat + 1}</div>
                <div class="seat-content">
                    <div class="seat-player">${firstName}</div>
                    <div class="seat-status ${player.isReady ? 'ready' : 'not-ready'}">
                        ${player.isReady ? 'Ready' : 'Not Ready'}
                    </div>
                </div>
            `;
        } else {
            seatEl.innerHTML = `
                <div class="seat-number">Seat ${seat + 1}</div>
                <div class="seat-content">
                    <div class="empty-seat">Click to sit</div>
                </div>
            `;
        }
    }
    updateControls();
}

function updateControls() {
    const leaveSeatBtn = document.getElementById('leave-seat-btn');
    const readyBtn = document.getElementById('ready-btn');
    const startGameBtn = document.getElementById('start-game-btn');
    if (mySeat !== null) {
        leaveSeatBtn.classList.remove('hidden');
        readyBtn.classList.remove('hidden');
        readyBtn.textContent = isReady ? 'Not Ready' : 'Ready';
        readyBtn.className = isReady ? 'btn danger' : 'btn primary';
    } else {
        leaveSeatBtn.classList.add('hidden');
        readyBtn.classList.add('hidden');
    }
    if (lobbyState?.canStartGame && mySeat === lobbyState?.lobbyLeader) {
        startGameBtn.classList.remove('hidden');
    } else {
        startGameBtn.classList.add('hidden');
    }
}

function handleSeatClick(seat) {
    if (!socket || !socket.connected) {
        showErrorMessage('Not connected to server');
        return;
    }
    if (lobbyState?.players[seat]) {
        return;
    }
    if (mySeat !== null) {
        showErrorMessage('You already have a seat. Leave your current seat first.');
        return;
    }
    socket.emit('take-seat', { seat: seat });
}

function leaveSeat() {
    if (!socket || !socket.connected) {
        showErrorMessage('Not connected to server');
        return;
    }
    socket.emit('leave-seat');
    mySeat = null;
    isReady = false;
}

function toggleReady() {
    if (!socket || !socket.connected) {
        showErrorMessage('Not connected to server');
        return;
    }
    if (mySeat === null) {
        showErrorMessage('You must take a seat first');
        return;
    }
    socket.emit('ready-for-game');
}

function startGame() {
    if (!socket || !socket.connected) {
        showErrorMessage('Not connected to server');
        return;
    }
    if (!lobbyState?.canStartGame) {
        showErrorMessage('Not all players are ready');
        return;
    }
    socket.emit('start-game');
}

function showGameSection() {
    document.getElementById('lobby-section').classList.add('hidden');
    document.getElementById('game-section').classList.remove('hidden');
}

function showErrorMessage(message) {
    const container = document.getElementById('error-container');
    container.innerHTML = `<div class="error-message">${message}</div>`;
    setTimeout(() => {
        container.innerHTML = '';
    }, 5000);
}

function showSuccessMessage(message) {
    const container = document.getElementById('success-container');
    container.innerHTML = `<div class="success-message">${message}</div>`;
    setTimeout(() => {
        container.innerHTML = '';
    }, 3000);
}

// Get user info from server
async function getCurrentUser() {
    try {
        const response = await fetch('/api/user');
        const data = await response.json();
        if (data.authenticated && data.user) {
            currentUser = data.user;
            document.getElementById('user-name').textContent = data.user.name;
            return data.user;
        }
    } catch (error) {
        // Continue with fallback user
    }
    const fallbackUser = {
        id: 1,
        name: 'Unknown User'
    };
    currentUser = fallbackUser;
    document.getElementById('user-name').textContent = fallbackUser.name;
    return fallbackUser;
}

// DOMContentLoaded: wire up all event handlers and initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Add seat click handlers
    for (let seat = 0; seat < 4; seat++) {
        const seatEl = document.querySelector(`[data-seat="${seat}"]`);
        if (seatEl) {
            seatEl.addEventListener('click', () => handleSeatClick(seat));
        }
    }
    // Add lobby controls
    document.getElementById('leave-seat-btn').addEventListener('click', leaveSeat);
    document.getElementById('ready-btn').addEventListener('click', toggleReady);
    document.getElementById('start-game-btn').addEventListener('click', startGame);
    // Hand card click handlers (delegated) for lobby hand area
    document.getElementById('hand-area').addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('card-img')) {
            const card = e.target.getAttribute('data-card');
            if (lobbyState && lobbyState.state === 'passing') {
                toggleCard(card);
            } else if (lobbyState && lobbyState.state === 'playing' && typeof mySeat === 'number' && mySeat === lobbyState.currentTurnSeat) {
                playCard(card);
            }
        }
    });
    // Hand card click handlers (delegated) for diamond layout (game phase)
    const gameSeatsContainer = document.querySelector('.game-seats-container');
    if (gameSeatsContainer) {
        gameSeatsContainer.addEventListener('click', function(e) {
            if (e.target && e.target.classList.contains('card-img')) {
                const card = e.target.getAttribute('data-card');
                if (lobbyState && lobbyState.state === 'passing') {
                    toggleCard(card);
                } else if (lobbyState && lobbyState.state === 'playing' && typeof mySeat === 'number' && mySeat === lobbyState.currentTurnSeat) {
                    playCard(card);
                }
            }
        });
    }
    document.getElementById('pass-cards-btn').addEventListener('click', function() {
        passSelectedCards();
    });
    try {
        await getCurrentUser();
    } catch (error) {
        // Continue with fallback user
    }
    initializeSocket();
    window.selectedCards = [];
});
