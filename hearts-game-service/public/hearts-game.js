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

// Helper to extract a player's first name from several possible fields
function getPlayerFirstName(player, fallback) {
    if (!player) return fallback || '';
    const name = player.userName || player.name || (player.user && (player.user.userName || player.user.name)) || '';
    if (!name) return fallback || '';
    return String(name).split(' ')[0];
}

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
    // Update scoreboard after each round
    function updateScoreboard() {
        const rowsDiv = document.getElementById('scoreboard-rows');
        if (!rowsDiv || !data.players) return;
        let html = '';
        for (let i = 0; i < 4; i++) {
            const player = data.players[i];
            let name = getPlayerFirstName(player, `Player ${i+1}`);
            let score = player && typeof player.totalScore === 'number' ? player.totalScore : 0;
            html += `<div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span>${name}</span>
                <span style="font-weight:bold;">${score}</span>
            </div>`;
        }
        rowsDiv.innerHTML = html;
    }
    updateScoreboard();
        ensureGameSectionVisible();
        console.log('🎲 Game state update:', data);
        lobbyState = data;
        
        // Determine mySeat from game state data (important for reconnecting players)
        if (currentUser && data.players) {
            let mySeatLocal = null;
            for (let s = 0; s < 4; s++) {
                const p = data.players[s];
                if (p && String(p.userId) === String(currentUser.id)) {
                    mySeatLocal = s;
                    break;
                }
            }
            mySeat = (typeof mySeatLocal === 'number') ? mySeatLocal : null;
        }
        
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

            const passArrowContainer = document.getElementById('pass-arrow-container');
            const trickArea = document.getElementById('trick-area');
            if (data.state === 'passing') {
                hasPassed = false;
                if (passArrowContainer) {
                    // Determine direction: left, right, up
                    let direction = 'left';
                    console.log("[DEBUG] Passing direction:", data.passDirection);
                    if (data.passDirection === 'right') direction = 'right';
                    if (data.passDirection === 'across') direction = 'up';
                    let arrowSrc = `/hearts/icons/${direction}-arrow.svg`;
                    let disabled = !(window.selectedCards && window.selectedCards.length === 3);
                    passArrowContainer.innerHTML = `<img id="pass-arrow-img" src="${arrowSrc}" alt="Pass ${direction}" style="width:64px;height:64px;cursor:pointer;opacity:${disabled?0.5:1};">`;
                    passArrowContainer.classList.remove('hidden');
                    const arrowImg = document.getElementById('pass-arrow-img');
                    if (arrowImg) {
                        arrowImg.onclick = function() {
                            let disabled2 = !(window.selectedCards && window.selectedCards.length === 3);
                            console.log("[DEBUG] Pass arrow clicked. Selected cards:", window.selectedCards, "length:", window.selectedCards.length);
                            console.log("[DEBUG] Has passed:", hasPassed, 'disabled:', disabled2);
                            if (!disabled2 && !hasPassed) passSelectedCards();
                        };
                    }
            }
            if (trickArea) trickArea.classList.add('hidden');
            } else if (data.state === 'playing') {
                console.log('game stat playing. Clearing selected cards');
                window.selectedCards = [];
                if (passArrowContainer) passArrowContainer.classList.add('hidden');
                if (trickArea) trickArea.classList.remove('hidden');
            }
            showHand(handToShow);
            if (data.state === 'playing') {
                // Always render the trick from the authoritative server state
                const serverTrick = data.currentTrickCards || [];
                // Show live trick (winner may be undefined until trick completes)
                showTrick(serverTrick, data.currentTrickWinner);
            } else {
                // In non-playing phases, clear trick
                showTrick([]);
            }
        // updateGameStateLabel();
    } else {
        // Hide trick area in other phases
        showTrick([]);
        // updateGameStateLabel();
    }
}); // End socket.on('game-state')
    // Listen for trick-completed event (log only; UI is driven by 'game-state')
    socket.on('trick-completed', (data) => {
        // Display completed trick for a short TTL so users reliably see it.
        console.log('[DEBUG] trick-completed received:', data);
        if (!data || !data.trickCards) return;
        // Render the trick from payload immediately (won't conflict with subsequent game-state which
        // will be delayed by the server). This is a lightweight visual aid.
        try {
            showTrick(data.trickCards, data.winner)
            // showTrick(data.trickCards.map((c, i) => ({ card: c, seat: data.trickOrder ? data.trickOrder[i] : undefined })), data.winner);
        } catch (e) {
            console.error('Error showing trick-completed payload:', e);
        }
        // // Clear the transient trick after the same delay used server-side
        // setTimeout(() => {
        //     // Only clear if the server hasn't already provided a newer game-state that includes currentTrickCards
        //     if (!lobbyState || !lobbyState.currentTrickCards || lobbyState.currentTrickCards.length === 0) {
        //         showTrick([]);
        //     }
        // }, 1500);
    });
    // Game pause/resume events
    socket.on('game-paused', (data) => {
        console.log('🛑 Game paused:', data);
        showPausedBanner(true, data && data.message ? data.message : 'Game paused');
    });
    socket.on('game-resumed', (data) => {
        console.log('▶️ Game resumed:', data);
        showPausedBanner(false);
        // Server should emit a fresh game-state; ensure we request it if not received
        if (socket && socket.connected) socket.emit('get-game-state', { gameId: lobbyState && lobbyState.gameId });
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
    // Offset each card in the direction of the seat that played it, rotated for player POV
    if (typeof mySeat !== 'number') {
        trickArea.innerHTML = '';
        return;
    }
    // seatOrder: [bottom, left, top, right] from current player's POV
    const seatOrder = [mySeat, (mySeat+3)%4, (mySeat+2)%4, (mySeat+1)%4];
    const offsets = [
        {left: 0, top: 36},   // bottom: offset down
        {left: 36, top: 0},   // left: offset right (swapped)
        {left: 0, top: -36},  // top: offset up
        {left: -36, top: 0}   // right: offset left (swapped)
    ];
    // Map seat to offset index for current POV
    const seatToOffsetIdx = {};
    seatOrder.forEach((seat, idx) => { seatToOffsetIdx[seat] = idx; });
    let stackedCards = trickCards.map((play, i) => {
        const offsetIdx = seatToOffsetIdx[play.seat];
        if (typeof offsetIdx === 'undefined') return '';
        const offset = offsets[offsetIdx];
        const highlight = (typeof winnerSeat !== 'undefined' && play.seat === winnerSeat) ? 'box-shadow:0 0 12px 4px #ffeb3b;' : '';
        return `<img src="${getCardImageUrl(play.card)}" alt="${play.card}" title="${play.card}" style="width:60px;height:90px;position:absolute;left:${30+offset.left}px;top:${30+offset.top}px;z-index:${i+1};border-radius:7px;background:#fff;${highlight}">`;
    }).join('');
    trickArea.innerHTML = `<div style="position:relative;width:120px;height:120px;margin:auto;">${stackedCards}</div>`;
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
    // Always use diamond layout for both passing and playing phases
    if (lobbyState && (lobbyState.state === 'playing' || lobbyState.state === 'passing') && gameSeatsContainer) {
        // Clear only the player seat cells, NOT the center cell
        const seatClassesToClear = ['game-seat-hand','game-seat-right','game-seat-upper','game-seat-left'];
        seatClassesToClear.forEach(cls => {
            const cell = gameSeatsContainer.querySelector('.' + cls);
            if (cell) cell.innerHTML = '';
        });
        // Map logical seat numbers to visual positions so that the order is consistent with the lobby
        // areaMap: [bottom, right, top, left]
        const areaMap = ['game-seat-hand','game-seat-left','game-seat-upper','game-seat-right'];
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
            const isTurn = lobbyState.currentTurnSeat === seatIdx;
            if (i === 0) {
                // My seat (bottom): show hand
                if (!hand || !Array.isArray(hand) || hand.length === 0) {
                    cell.innerHTML = '<em>No cards dealt.</em>';
                } else {
                    const name = getPlayerFirstName(player, 'You');
                    const highlightClass = isTurn ? 'player-name current-turn' : 'player-name';
                    cell.innerHTML = `<div class="${highlightClass}" style="text-align:center;margin-bottom:6px;">${name}</div><div id="hand-cards" style="display:flex;justify-content:center;align-items:center;"></div>`;
                    const handCardsDiv = cell.querySelector('#hand-cards');
                    handCardsDiv.innerHTML = hand.map(card => {
                        const isSelected = window.selectedCards && window.selectedCards.includes(card);
                        const selectedClass = isSelected ? ' selected' : '';
                        const outline = isSelected ? 'outline:3px solid #ffeb3b;' : 'outline:none;';
                        const safeId = 'card-' + String(card).replace(/[^a-zA-Z0-9]/g, '');
                        return `<img id="${safeId}" src="${getCardImageUrl(card)}" alt="${card}" title="${card}" data-card="${card}" class="card-img${selectedClass}" onerror="this.style.visibility='hidden';this.dataset.broken='1'" onload="this.style.visibility='visible';this.dataset.broken='0'" style="width:50px;height:72px;margin:0 1px;vertical-align:middle;box-shadow:0 2px 8px #0003;border-radius:8px;background:#fff;${outline}cursor:pointer;">`;
                    }).join('');
                }
            } else {
                // Other players: show only the player's name (first name or Player N)
                const name = getPlayerFirstName(player, player ? `Player ${seatIdx+1}` : 'Empty');
                const highlightClass = isTurn ? 'opponent-name current-turn' : 'opponent-name';
                cell.innerHTML = `
                    <div class="opponent-info${isTurn?' current-turn':''}">
                        <div class="${highlightClass}">${name}</div>
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
    const hand = window.currentHand || [];
    const handCardsDiv = document.getElementById('hand-cards');
    if (!handCardsDiv) return;
    // Match images by their data-card attribute (stable) instead of relying on index positions.
    Array.from(handCardsDiv.children).forEach((img) => {
        const card = img.getAttribute('data-card');
        if (window.selectedCards && window.selectedCards.includes(card)) {
            img.classList.add('selected');
            img.style.outline = '3px solid #ffeb3b';
        } else {
            img.classList.remove('selected');
            img.style.outline = 'none';
        }
        // If the image previously failed to load, keep it hidden instead of showing a broken box
        if (img.dataset && img.dataset.broken === '1') {
            img.style.visibility = 'hidden';
        }
    });
    updatePassButton();
}

// Make toggleCard globally accessible for inline onclick
function toggleCard(card) {
    // console.log('[DEBUG] toggleCard called:', card, 'selectedCards:', window.selectedCards);
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
    const passArrowContainer = document.getElementById('pass-arrow-container');
    let disabled = !(window.selectedCards && window.selectedCards.length === 3);
    if (passArrowContainer && !passArrowContainer.classList.contains('hidden')) {
        const arrowImg = document.getElementById('pass-arrow-img');
        if (arrowImg) arrowImg.style.opacity = disabled ? 0.5 : 1;
        if (arrowImg) arrowImg.style.pointerEvents = disabled ? 'none' : 'auto';
    }
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

    // Disable arrow after passing
    const passArrowContainer = document.getElementById('pass-arrow-container');
    if (passArrowContainer) {
        const arrowImg = document.getElementById('pass-arrow-img');
        if (arrowImg) {
            arrowImg.style.opacity = '0.5';
            arrowImg.style.pointerEvents = 'none';
        }
    }
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
    // Determine which seat (if any) is mine and whether I'm the lobby leader
    let mySeatLocal = null;
    if (currentUser && state.players) {
        for (let s = 0; s < 4; s++) {
            const p = state.players[s];
            if (p && String(p.userId) === String(currentUser.id)) {
                mySeatLocal = s;
                break;
            }
        }
    }
    // Set global mySeat early so updateControls can rely on it (clear when not found)
    mySeat = (typeof mySeatLocal === 'number') ? mySeatLocal : null;
    if (mySeat === null) isReady = false;
    const amLeader = (state.lobbyLeader !== null && (
        // either mySeat equals the leader seat, or the stored player at leader seat matches our user id
        (typeof mySeat === 'number' && mySeat === state.lobbyLeader) ||
        (state.players[state.lobbyLeader] && String(state.players[state.lobbyLeader].userId) === String(currentUser?.id))
    ));
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
    // Map: 0=upper, 1=right, 2=lower, 3=left
    const seatClassMap = ['seat-upper', 'seat-right', 'seat-lower', 'seat-left'];
    const seatNumberMap = [1, 2, 3, 4];
    for (let seat = 0; seat < 4; seat++) {
        const seatEl = document.querySelector(`[data-seat="${seat}"]`);
        let player = state.players[seat];
        seatEl.className = `seat ${seatClassMap[seat]}`;
        if (player) {
            seatEl.classList.add('occupied');
            const isMySeat = String(player.userId) === String(currentUser?.id);
            if (isMySeat) {
                seatEl.classList.add('my-seat');
                mySeat = seat;
                isReady = player.isReady;
            }
            const firstName = player.userName ? player.userName.split(' ')[0] : `Player ${seatNumberMap[seat]}`;
            // Show Remove Bot button for lobby leader if this is a bot (icon-only, round)
            const removeBotBtn = (player.isBot && amLeader) ? `<button class="btn small danger remove-bot-btn" data-remove-bot-seat="${seat}" aria-label="Remove bot">✖</button>` : '';
            seatEl.innerHTML = `
                <div class="seat-number">Seat ${seatNumberMap[seat]}</div>
                <div class="seat-content">
                    <div class="seat-player">${firstName}</div>
                    <div class="seat-status ${player.isReady ? 'ready' : 'not-ready'}">
                        ${player.isReady ? 'Ready' : 'Not Ready'}
                    </div>
                    ${removeBotBtn}
                </div>
            `;
        } else {
                seatEl.innerHTML = `
                <div class="seat-number">Seat ${seatNumberMap[seat]}</div>
                <div class="seat-content">
                    <div class="empty-seat">Click to sit</div>
                    <button class="add-bot-seat-btn btn small info hidden" data-add-bot-seat="${seat}" aria-label="Add bot">＋</button>
                </div>
            `;
        }
    }
    updateControls();

    // Wire Remove Bot button handlers (delegated)
    document.querySelectorAll('.remove-bot-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const seat = parseInt(btn.getAttribute('data-remove-bot-seat'));
            // Remove bot immediately without confirmation
            socket.emit('remove-bot', { seat });
        });
    });
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
    // Determine whether current user is lobby leader (by seat or by leader's userId)
    const leaderSeat = lobbyState?.lobbyLeader;
    const leaderUserId = (leaderSeat !== null && lobbyState?.players && lobbyState.players[leaderSeat]) ? lobbyState.players[leaderSeat].userId : null;
    const amLeader = (leaderSeat !== null && ((typeof mySeat === 'number' && mySeat === leaderSeat) || (leaderUserId && String(leaderUserId) === String(currentUser?.id))));

    if (lobbyState?.canStartGame && amLeader) {
        startGameBtn.classList.remove('invisible');
        startGameBtn.classList.remove('hidden');
    } else {
        // Keep space reserved but hide visually to avoid layout shift
        startGameBtn.classList.add('invisible');
        startGameBtn.classList.remove('hidden');
    }

    // Show Add Bot button for lobby leader on each empty seat
    const addBotSeatBtns = document.querySelectorAll('.add-bot-seat-btn');
    // console.log('Updating Add Bot buttons:', addBotSeatBtns.length, 'amLeader:', amLeader, 'mySeat:', mySeat, 'leaderSeat:', leaderSeat);
    for (let btn of addBotSeatBtns) {
        const seat = parseInt(btn.getAttribute('data-add-bot-seat'));
        if (lobbyState && amLeader && !lobbyState.players[seat]) {
            btn.classList.remove('hidden');
            btn.onclick = function(e) {
                e.stopPropagation();
                socket.emit('add-bot', { seat: seat });
                console.log('add-bot emitted for seat:', seat);
            };
        } else {
            btn.classList.add('hidden');
            btn.onclick = null;
        }
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
    createToast(message, 'error');
}

function showSuccessMessage(message) {
    createToast(message, 'success');
}

// create a non-blocking toast in the toast container
function createToast(message, type='error', ttl=4500) {
    const container = document.getElementById('toast-container');
    if (!container) {
        console.warn('No toast container found, falling back to inline message');
        const inline = document.getElementById(type === 'success' ? 'success-container' : 'error-container');
        if (inline) {
            inline.innerHTML = `<div class="${type === 'success' ? 'success-message' : 'error-message'}">${message}</div>`;
            setTimeout(() => { inline.innerHTML = ''; }, ttl);
        }
        return;
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<div class="toast-icon">${type === 'success' ? '✓' : '!'}</div><div class="toast-body">${message}</div>`;
    container.appendChild(toast);
    // allow css transition
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => { toast.remove(); }, 220);
    }, ttl);
}

// Show or hide a persistent paused banner in the UI and disable interactive controls visually
function showPausedBanner(show, message) {
    let banner = document.getElementById('paused-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'paused-banner';
        banner.style.position = 'fixed';
        banner.style.top = '72px';
        banner.style.left = '50%';
        banner.style.transform = 'translateX(-50%)';
        banner.style.zIndex = '1200';
        banner.style.background = 'rgba(0,0,0,0.8)';
        banner.style.color = '#fff';
        banner.style.padding = '8px 14px';
        banner.style.borderRadius = '8px';
        banner.style.boxShadow = '0 6px 18px #0008';
        banner.style.fontWeight = '600';
        document.body.appendChild(banner);
    }
    if (show) {
        banner.textContent = message || 'Game paused: waiting for player to reconnect';
        banner.classList.add('show');
        // Dim interactive areas to indicate disabled state
        document.body.classList.add('game-paused');
    } else {
        banner.classList.remove('show');
        banner.remove();
        document.body.classList.remove('game-paused');
    }
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
    // No pass-cards-btn anymore; passing is handled by arrow image click
    try {
        await getCurrentUser();
    } catch (error) {
        // Continue with fallback user
    }
    initializeSocket();
    window.selectedCards = [];

    // History modal wiring
    const toggleHistoryBtn = document.getElementById('toggle-history-btn');
    const historyModal = document.getElementById('history-modal');
    const historyBackdrop = document.getElementById('history-modal-backdrop');
    const closeHistoryBtn = document.getElementById('close-history-btn');
    if (toggleHistoryBtn && historyModal) {
        toggleHistoryBtn.addEventListener('click', async () => {
            historyModal.classList.remove('hidden');
            // ensure focus
            document.getElementById('history-modal-content').focus();
            await loadHistoryList();
        });
    }
    if (historyBackdrop) {
        historyBackdrop.addEventListener('click', () => {
            historyModal.classList.add('hidden');
        });
    }
    if (closeHistoryBtn) {
        closeHistoryBtn.addEventListener('click', () => {
            historyModal.classList.add('hidden');
        });
    }
    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (historyModal && !historyModal.classList.contains('hidden')) {
                historyModal.classList.add('hidden');
            }
        }
    });
});

// Load history list from API
async function loadHistoryList() {
    const listDiv = document.getElementById('history-list');
    if (!listDiv) return;
    listDiv.innerHTML = 'Loading...';
    try {
        const res = await fetch('/hearts/api/history', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load history');
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) {
            listDiv.innerHTML = '<em>No games found.</em>';
            return;
        }
        // Render list
        listDiv.innerHTML = '';
    data.forEach(game => {
            const gameEl = document.createElement('div');
            gameEl.className = 'history-row';
            const date = new Date(game.createdAt).toLocaleString();
            // Build score summary
            const scores = (game.players || []).map(p => `${p.name.split(' ')[0]}: ${p.finalScore === null ? '-' : p.finalScore}`).join(' | ');
            gameEl.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid rgba(255,255,255,0.04);">
                    <div>
                        <strong>${date}</strong><br>
                        <small>${game.state}</small>
                    </div>
                    <div style="flex:1;text-align:center;color:#ddd;">${scores}</div>
                    <div style="width:220px;text-align:right;">
                        <button class="btn small" data-game-id="${game.gameId}">Details</button>
                        ${currentUser && currentUser.isAdmin ? `<button class="btn danger small" data-delete-game-id="${game.gameId}" style="margin-left:8px;">Delete</button>` : ''}
                    </div>
                </div>
                <div class="history-details hidden" id="details-${game.gameId}" style="padding:8px 12px;background:rgba(0,0,0,0.25);border-radius:6px;margin-bottom:8px;margin-top:6px;"></div>
            `;
            listDiv.appendChild(gameEl);
            const detailsBtn = gameEl.querySelector('button[data-game-id]');
            detailsBtn.addEventListener('click', async (e) => {
                const gid = e.target.getAttribute('data-game-id');
                const detailsDiv = document.getElementById('details-' + gid);
                if (!detailsDiv) return;
                if (!detailsDiv.classList.contains('hidden')) {
                    detailsDiv.classList.add('hidden');
                    return;
                }
                detailsDiv.innerHTML = 'Loading details...';
                try {
                    const dres = await fetch(`/hearts/api/history/${gid}`, { credentials: 'include' });
                    if (!dres.ok) throw new Error('Failed to load details');
                    const info = await dres.json();
                    renderGameDetails(info, detailsDiv);
                    detailsDiv.classList.remove('hidden');
                } catch (err) {
                    detailsDiv.innerHTML = '<em>Could not load details</em>';
                }
            });

            // Wire delete button for admins
            const deleteBtn = gameEl.querySelector('button[data-delete-game-id]');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const gid = deleteBtn.getAttribute('data-delete-game-id');
                    if (!confirm('Delete game ' + gid + '? This cannot be undone.')) return;
                    try {
                        const dres = await fetch(`/hearts/api/admin/games/${gid}`, { method: 'DELETE', credentials: 'include' });
                        if (!dres.ok) {
                            const err = await dres.json().catch(() => ({}));
                            alert('Delete failed: ' + (err.error || dres.statusText));
                            return;
                        }
                        showSuccessMessage('Game deleted');
                        // Refresh list
                        await loadHistoryList();
                    } catch (err) {
                        alert('Delete failed');
                    }
                });
            }
        });
    } catch (err) {
        listDiv.innerHTML = '<em>Error loading history</em>';
        console.error('History load error', err);
    }
}

function renderGameDetails(info, container) {
    if (!info) {
        container.innerHTML = '<em>No details available</em>';
        return;
    }
    const header = document.createElement('div');
    header.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;"><div><strong>Game: ${new Date(info.createdAt).toLocaleString()}</strong><br><small>State: ${info.state}</small></div><div><strong>Players</strong></div></div>`;
    // Badges: finished and bots
    const badgesDiv = document.createElement('div');
    badgesDiv.style.marginTop = '6px';
    const finishedBadge = document.createElement('span');
    finishedBadge.className = 'badge';
    finishedBadge.textContent = info.state === 'finished' ? 'Game finished' : 'Not finished';
    badgesDiv.appendChild(finishedBadge);
    const hasBots = (info.players || []).some(p => p.isBot);
    if (hasBots) {
        const botBadge = document.createElement('span');
        botBadge.className = 'badge danger';
        botBadge.style.marginLeft = '8px';
        botBadge.textContent = 'Contains bots';
        badgesDiv.appendChild(botBadge);
    }
    header.appendChild(badgesDiv);
    container.innerHTML = '';
    container.appendChild(header);
    const playersDiv = document.createElement('div');
    playersDiv.style.marginTop = '8px';
    playersDiv.innerHTML = (info.players || []).map(p => {
        const scoreLabel = (p.finalScore !== null && typeof p.finalScore !== 'undefined') ? p.finalScore : (p.currentScore !== null && typeof p.currentScore !== 'undefined' ? p.currentScore : '-');
        const roundLabel = (p.roundScore !== null && typeof p.roundScore !== 'undefined') ? ` (round: ${p.roundScore})` : '';
        return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed rgba(255,255,255,0.02);"><div>${p.name}</div><div>${scoreLabel}${roundLabel}</div></div>`;
    }).join('');
    container.appendChild(playersDiv);

    // Admin debug button
    if (currentUser && currentUser.isAdmin) {
        const debugBtn = document.createElement('button');
        debugBtn.className = 'btn small';
        debugBtn.style.marginTop = '8px';
        debugBtn.textContent = 'Debug (raw DB rows)';
        debugBtn.addEventListener('click', async () => {
            const dbgDiv = document.createElement('div');
            dbgDiv.style.marginTop = '8px';
            dbgDiv.textContent = 'Loading raw data...';
            container.appendChild(dbgDiv);
            try {
                const r = await fetch(`/hearts/api/admin/games/${info.gameId}/debug`, { credentials: 'include' });
                if (!r.ok) throw new Error('Failed');
                const data = await r.json();
                dbgDiv.innerHTML = `<pre style="white-space:pre-wrap;max-height:300px;overflow:auto;background:rgba(0,0,0,0.6);padding:8px;border-radius:6px;">${JSON.stringify(data,null,2)}</pre>`;
            } catch (e) {
                dbgDiv.textContent = 'Failed to load debug data';
            }
        });
        container.appendChild(debugBtn);
    }

    // Rounds
    const rounds = info.rounds || {};
    const roundsKeys = Object.keys(rounds).sort((a,b)=>parseInt(a)-parseInt(b));
    // If roundsPoints provided, render a grid: header row = players, rows = rounds, final row = Final Score
    const roundsPoints = info.roundsPoints || {};
    const finalScores = info.finalScores || {};
    if (Object.keys(roundsPoints).length > 0) {
        const grid = document.createElement('div');
        grid.style.marginTop = '12px';
        grid.style.overflowX = 'auto';
        grid.style.background = 'rgba(255,255,255,0.03)';
        grid.style.padding = '8px';
        grid.style.borderRadius = '6px';
        // Header
        const headerRow = document.createElement('div');
        headerRow.style.display = 'flex';
        headerRow.style.fontWeight = '700';
        headerRow.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
        headerRow.style.paddingBottom = '6px';
        headerRow.innerHTML = `<div style="width:160px;">Round</div>` + (info.players || []).map(p => `<div style="width:120px;text-align:right;padding-right:8px;">${p.name.split(' ')[0]}</div>`).join('');
        grid.appendChild(headerRow);

        const rks = Object.keys(roundsPoints).sort((a,b)=>parseInt(a)-parseInt(b));
        rks.forEach(rn => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.padding = '6px 0';
            const pts = roundsPoints[rn] || [0,0,0,0];
            row.innerHTML = `<div style="width:160px;">Round ${rn}</div>` + pts.map(v => `<div style="width:120px;text-align:right;padding-right:8px;">${v}</div>`).join('');
            grid.appendChild(row);
        });

        // Final score row
        const finalRow = document.createElement('div');
        finalRow.style.display = 'flex';
        finalRow.style.padding = '8px 0';
        finalRow.style.borderTop = '1px solid rgba(255,255,255,0.06)';
        finalRow.style.fontWeight = '700';
        finalRow.innerHTML = `<div style="width:160px;">Final Score</div>` + (info.players || []).map(p => {
            const seat = p.seat;
            const val = (finalScores && typeof finalScores[seat] !== 'undefined') ? finalScores[seat] : (p.finalScore === null ? '-' : p.finalScore);
            return `<div style="width:120px;text-align:right;padding-right:8px;">${val}</div>`;
        }).join('');
        grid.appendChild(finalRow);

        container.appendChild(grid);
    } else {
        // Fallback to previous per-trick rendering when roundsPoints not available
        roundsKeys.forEach(rn => {
            const roundContainer = document.createElement('div');
            roundContainer.style.marginTop = '10px';
            roundContainer.innerHTML = `<div style="font-weight:600;margin-bottom:6px;">Round ${rn}</div>`;
            const tricks = rounds[rn];
            const tricksList = document.createElement('div');
            tricksList.style.paddingLeft = '6px';
            tricks.forEach(t => {
                const trickEl = document.createElement('div');
                const cards = Array.isArray(t.cardsPlayed) ? t.cardsPlayed.map(c => (c.card || c)).join(', ') : JSON.stringify(t.cardsPlayed);
                trickEl.innerHTML = `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03);"><div>Trick ${t.trickNumber} - Winner: ${typeof t.winnerSeat !== 'undefined' ? 'Seat '+(t.winnerSeat+1) : 'Unknown'}</div><div>Points: ${t.points}</div></div><div style="font-size:0.9em;color:#ccc;padding:4px 0 8px 0;">Cards: ${cards}</div>`;
                tricksList.appendChild(trickEl);
            });
            roundContainer.appendChild(tricksList);
            container.appendChild(roundContainer);
        });
    }
}

// Preload card images to reduce flicker when hands update quickly.
function preloadCardImages() {
    const ranks = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
    const suits = ['C','D','H','S'];
    ranks.forEach(rank => {
        suits.forEach(suit => {
            const code = (rank + suit).toUpperCase();
            const img = new Image();
            img.src = getCardImageUrl(code);
            img.onload = () => {/* warmed */};
            img.onerror = () => {/* ignore */};
        });
    });
}

// Start preloading after a short idle so it doesn't block critical UI
setTimeout(preloadCardImages, 500);
