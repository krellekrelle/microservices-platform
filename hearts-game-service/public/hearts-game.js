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
let endGameShown = false; // Track if end-game animation has been shown for current game
let countdownTimer = null; // Timer for disconnect countdown
let countdownEndTime = null; // When the countdown ends

// Sound effects system
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

// Initialize sound manager
const soundManager = new SoundManager();

// Video Manager for WebRTC peer-to-peer video streaming
class VideoManager {
    constructor(socket) {
        this.socket = socket;
        this.localStream = null;
        this.peerConnections = new Map(); // seat -> RTCPeerConnection
        this.remoteStreams = new Map(); // seat -> MediaStream
        this.activeVideoSeats = new Set(); // Track which seats have active video
        this.isVideoEnabled = false;
        this.socketIdToSeat = new Map(); // socketId -> seat mapping
        
        // WebRTC configuration with STUN servers
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        this.setupSocketListeners();
    }
    
    setupSocketListeners() {
        // Listen for other players enabling/disabling video
        this.socket.on('peer-video-enabled', (data) => {
            console.log('Peer enabled video:', data);
            this.socketIdToSeat.set(data.socketId, data.seat);
            // Always create peer connection when someone enables video
            // If we have video enabled, we'll be the initiator
            // If we don't have video yet, we'll still be ready to receive their stream
            this.createPeerConnection(data.seat, data.socketId, this.isVideoEnabled);
            
            // If we're not the initiator, let the other peer know we're ready for their offer
            if (!this.isVideoEnabled) {
                console.log(`Notifying seat ${data.seat} that we're ready for offer`);
                this.socket.emit('ready-for-offer', { 
                    toSocketId: data.socketId, 
                    fromSeat: mySeat 
                });
            }
        });
        
        this.socket.on('peer-video-disabled', (data) => {
            console.log('Peer disabled video:', data);
            this.closePeerConnection(data.seat);
            this.hideVideoForSeat(data.seat);
        });
        
        this.socket.on('peer-ready-for-offer', async (data) => {
            console.log('Peer ready for offer from seat:', data.fromSeat);
            // If we have video enabled, send them an offer
            if (this.isVideoEnabled) {
                const pc = this.peerConnections.get(data.fromSeat);
                if (pc) {
                    try {
                        console.log(`Sending offer to seat ${data.fromSeat}`);
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        
                        // Find the socket ID for this seat
                        let targetSocketId = null;
                        for (let [socketId, seat] of this.socketIdToSeat.entries()) {
                            if (seat === data.fromSeat) {
                                targetSocketId = socketId;
                                break;
                            }
                        }
                        
                        if (targetSocketId) {
                            this.socket.emit('webrtc-offer', {
                                offer: offer,
                                toSocketId: targetSocketId,
                                fromSeat: mySeat
                            });
                        }
                    } catch (error) {
                        console.error('Error creating offer for ready peer:', error);
                    }
                }
            }
        });
        
        // WebRTC signaling events
        this.socket.on('webrtc-offer', async (data) => {
            console.log('Received WebRTC offer from seat:', data.fromSeat);
            await this.handleWebRTCOffer(data);
        });
        
        this.socket.on('webrtc-answer', async (data) => {
            console.log('Received WebRTC answer from seat:', data.fromSeat);
            await this.handleWebRTCAnswer(data);
        });
        
        this.socket.on('webrtc-ice-candidate', async (data) => {
            console.log('Received ICE candidate from seat:', data.fromSeat);
            await this.handleICECandidate(data);
        });
    }
    
    async enableVideo() {
        try {
            console.log('🎥 Enabling video...');
            
            // Check if getUserMedia is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('getUserMedia is not supported in this browser');
            }
            
            console.log('🎬 Requesting camera access...');
            
            // Request video stream with specific constraints
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 100, max: 200 },
                    height: { ideal: 100, max: 200 },
                    frameRate: { ideal: 15, max: 30 },
                    facingMode: 'user' // Front camera on mobile
                },
                audio: false // Video only for this iteration
            });
            
            console.log('✅ Camera access granted!');
            console.log('🎬 Stream obtained:', this.localStream);
            console.log('🎬 Stream ID:', this.localStream.id);
            console.log('🎬 Stream active:', this.localStream.active);
            console.log('🎬 Stream tracks:', this.localStream.getTracks().length);
            
            this.isVideoEnabled = true;
            
            // Show local video
            this.showLocalVideo();
            
            // Add our stream to any existing peer connections
            this.peerConnections.forEach((pc, seat) => {
                console.log(`Adding local stream to existing peer connection for seat ${seat}`);
                this.localStream.getTracks().forEach(track => {
                    pc.addTrack(track, this.localStream);
                });
            });
            
            // Notify other players
            this.socket.emit('video-enabled', { seat: mySeat });
            
            // Update UI button
            this.updateVideoButton();
            
            // Show success message
            this.showToast('Camera enabled successfully!', 'success');
            
            console.log('✅ Video enabled successfully');
            
        } catch (error) {
            console.error('❌ Failed to enable video:', error);
            console.error('❌ Error name:', error.name);
            console.error('❌ Error message:', error.message);
            
            let errorMessage = 'Camera access denied or not available';
            if (error.name === 'NotAllowedError') {
                errorMessage = 'Camera permission denied. Please allow camera access and try again.';
            } else if (error.name === 'NotFoundError') {
                errorMessage = 'No camera found on this device.';
            } else if (error.name === 'NotSupportedError') {
                errorMessage = 'Camera not supported in this browser.';
            }
            
            this.showToast(errorMessage, 'error');
        }
    }
    
    disableVideo() {
        console.log('🎥 Disabling video...');
        
        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        // Close all peer connections
        this.peerConnections.forEach((pc, seat) => {
            pc.close();
        });
        this.peerConnections.clear();
        this.remoteStreams.clear();
        
        this.isVideoEnabled = false;
        
        // Hide only local video (not remote videos from other players)
        this.hideLocalVideo();
        // Don't call hideAllRemoteVideos() - other players' videos should remain visible
        
        // Notify other players
        this.socket.emit('video-disabled', { seat: mySeat });
        
        // Update UI button
        this.updateVideoButton();
        
        console.log('✅ Video disabled');
    }
    
    async createPeerConnection(remoteSeat, remoteSocketId, isInitiator) {
        console.log(`Creating peer connection for seat ${remoteSeat}, initiator: ${isInitiator}`);
        
        const pc = new RTCPeerConnection(this.rtcConfig);
        this.peerConnections.set(remoteSeat, pc);
        
        // Add local stream to peer connection
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }
        
        // Handle remote stream
        pc.ontrack = (event) => {
            console.log('Received remote stream from seat:', remoteSeat);
            const remoteStream = event.streams[0];
            this.remoteStreams.set(remoteSeat, remoteStream);
            this.showVideoForSeat(remoteSeat, remoteStream);
        };
        
        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('webrtc-ice-candidate', {
                    candidate: event.candidate,
                    toSocketId: remoteSocketId,
                    fromSeat: mySeat
                });
            }
        };
        
        // If we're the initiator, create and send offer
        if (isInitiator) {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                
                this.socket.emit('webrtc-offer', {
                    offer: offer,
                    toSocketId: remoteSocketId,
                    fromSeat: mySeat
                });
            } catch (error) {
                console.error('Error creating offer:', error);
            }
        }
    }
    
    async handleWebRTCOffer(data) {
        const { offer, fromSeat, fromSocketId } = data;
        
        // Create peer connection (we are not the initiator)
        const pc = new RTCPeerConnection(this.rtcConfig);
        this.peerConnections.set(fromSeat, pc);
        
        // Add local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }
        
        // Handle remote stream
        pc.ontrack = (event) => {
            console.log('Received remote stream from seat:', fromSeat);
            const remoteStream = event.streams[0];
            this.remoteStreams.set(fromSeat, remoteStream);
            this.showVideoForSeat(fromSeat, remoteStream);
        };
        
        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('webrtc-ice-candidate', {
                    candidate: event.candidate,
                    toSocketId: fromSocketId,
                    fromSeat: mySeat
                });
            }
        };
        
        try {
            await pc.setRemoteDescription(offer);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            this.socket.emit('webrtc-answer', {
                answer: answer,
                toSocketId: fromSocketId,
                fromSeat: mySeat
            });
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }
    
    async handleWebRTCAnswer(data) {
        const { answer, fromSeat } = data;
        const pc = this.peerConnections.get(fromSeat);
        
        if (pc) {
            try {
                await pc.setRemoteDescription(answer);
            } catch (error) {
                console.error('Error setting remote description:', error);
            }
        }
    }
    
    async handleICECandidate(data) {
        const { candidate, fromSeat } = data;
        const pc = this.peerConnections.get(fromSeat);
        
        if (pc) {
            try {
                await pc.addIceCandidate(candidate);
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
            }
        }
    }
    
    closePeerConnection(seat) {
        const pc = this.peerConnections.get(seat);
        if (pc) {
            pc.close();
            this.peerConnections.delete(seat);
        }
        this.remoteStreams.delete(seat);
    }
    
    showLocalVideo() {
        console.log(`🎬 Trying to show local video for seat ${mySeat}`);
        if (mySeat !== null && this.localStream) {
            // Find the video element in a visible container instead of using getElementById
            // which returns the first match (often in a collapsed container)
            let videoElement = null;
            const allVideoElements = document.querySelectorAll(`#video-${mySeat}`);
            
            for (const video of allVideoElements) {
                const parentAvatar = video.closest('.player-avatar');
                const parentContainer = video.closest('.player-avatar-container');
                if (parentAvatar && parentContainer) {
                    const containerRect = parentContainer.getBoundingClientRect();
                    const avatarRect = parentAvatar.getBoundingClientRect();
                    // Choose the video in a visible container (width > 0)
                    if (containerRect.width > 0 && avatarRect.width > 0) {
                        videoElement = video;
                        console.log(`🎬 Found video in visible container:`, containerRect.width, 'x', containerRect.height);
                        break;
                    }
                }
            }
            
            // Fallback to first element if no visible container found
            if (!videoElement && allVideoElements.length > 0) {
                videoElement = allVideoElements[0];
                console.log(`🎬 Using fallback video element (no visible container found)`);
            }
            
            // console.log(`🎬 Local video element found:`, videoElement);
            
            if (videoElement) {
                // Force re-attach the stream even if it's already attached
                // console.log(`🎬 Force re-attaching stream to video element`);
                
                // Set display to block IMMEDIATELY before any other operations
                videoElement.style.display = 'block';
                videoElement.style.visibility = 'visible';
                videoElement.style.opacity = '1';
                
                videoElement.srcObject = null; // Clear first
                setTimeout(() => {
                    videoElement.srcObject = this.localStream;
                    
                    // Force display again after stream attachment
                    videoElement.style.display = 'block';
                    videoElement.style.visibility = 'visible';
                    videoElement.style.opacity = '1';
                    
                    // Remove debug styling and add stream debugging
                    videoElement.style.border = 'none';
                    videoElement.style.background = 'transparent';
                    
                    // Debug stream attachment
                    console.log(`🎬 Attaching stream to video element:`, this.localStream);
                    console.log(`🎬 Stream tracks:`, this.localStream.getTracks());
                    console.log(`🎬 Video tracks:`, this.localStream.getVideoTracks());
                    console.log(`🎬 Video element srcObject:`, videoElement.srcObject);
                }, 50);
                
                // Track local video as active
                this.activeVideoSeats.add(mySeat);
                
                // Debug video element styles
                const videoStyles = window.getComputedStyle(videoElement);
                console.log(`🎬 Video element computed styles:`, {
                    display: videoStyles.display,
                    visibility: videoStyles.visibility,
                    opacity: videoStyles.opacity,
                    position: videoStyles.position,
                    top: videoStyles.top,
                    left: videoStyles.left,
                    width: videoStyles.width,
                    height: videoStyles.height,
                    zIndex: videoStyles.zIndex
                });
                
                // Add video event listeners
                videoElement.onloadedmetadata = () => {
                    console.log(`🎬 Local video loaded - ${videoElement.videoWidth}x${videoElement.videoHeight}`);
                    console.log(`🎬 Video ready state:`, videoElement.readyState);
                    console.log(`🎬 Video paused:`, videoElement.paused);
                    
                    // Force display one more time after video loads
                    videoElement.style.display = 'block';
                    videoElement.style.visibility = 'visible';
                    videoElement.style.opacity = '1';
                    console.log(`🎬 Forced video display after load: ${videoElement.style.display}`);
                    
                    // Force play the video
                    videoElement.play().then(() => {
                        console.log(`✅ Local video play succeeded`);
                    }).catch(error => {
                        console.error(`❌ Local video play failed:`, error);
                        // Try to play again after a delay
                        setTimeout(() => {
                            videoElement.play().catch(e => console.error(`❌ Retry play failed:`, e));
                        }, 100);
                    });
                };
                
                videoElement.onplay = () => {
                    console.log(`▶️ Local video playing`);
                };
                
                videoElement.onerror = (error) => {
                    console.error(`❌ Video element error:`, error);
                };
                
                // Force initial play attempt
                setTimeout(() => {
                    if (videoElement.paused) {
                        console.log(`🔄 Forcing video play after timeout`);
                        videoElement.play().catch(e => console.error(`❌ Timeout play failed:`, e));
                    }
                }, 200);
                
                // Hide avatar image and fallback, but keep container visible
                const avatarContainer = document.querySelector(`[data-seat="${mySeat}"] .player-avatar-container`);
                console.log(`🎬 Local avatar container found for seat ${mySeat}:`, avatarContainer);
                if (avatarContainer) {
                    let playerAvatar = avatarContainer.querySelector('.player-avatar');
                    
                    // Add video-enabled class for enhanced styling
                    if (playerAvatar) {
                        playerAvatar.classList.add('video-enabled');
                        console.log(`🎬 Added video-enabled class to avatar for seat ${mySeat}`);
                    }
                    
                    const avatarImage = avatarContainer.querySelector('.avatar-image');
                    const avatarFallback = avatarContainer.querySelector('.avatar-fallback');
                    console.log(`🎬 Avatar image:`, avatarImage, avatarImage?.style.display);
                    console.log(`🎬 Avatar fallback:`, avatarFallback, avatarFallback?.style.display);
                    
                    if (avatarImage) {
                        avatarImage.style.display = 'none';
                        console.log(`🎬 Avatar image hidden, new display:`, avatarImage.style.display);
                    }
                    if (avatarFallback) {
                        avatarFallback.style.display = 'none';
                        console.log(`🎬 Avatar fallback hidden, new display:`, avatarFallback.style.display);
                    }
                    
                    // Check if container itself has any problematic styles
                    const containerStyles = window.getComputedStyle(avatarContainer);
                    console.log(`🎬 Container computed styles:`, {
                        display: containerStyles.display,
                        visibility: containerStyles.visibility,
                        opacity: containerStyles.opacity,
                        position: containerStyles.position
                    });
                    
                    // Check the player-avatar div specifically (reuse the playerAvatar variable)
                    if (playerAvatar) {
                        const avatarStyles = window.getComputedStyle(playerAvatar);
                        console.log(`🎬 Player avatar computed styles:`, {
                            display: avatarStyles.display,
                            visibility: avatarStyles.visibility,
                            opacity: avatarStyles.opacity,
                            position: avatarStyles.position,
                            overflow: avatarStyles.overflow,
                            width: avatarStyles.width,
                            height: avatarStyles.height,
                            minWidth: avatarStyles.minWidth,
                            minHeight: avatarStyles.minHeight,
                            maxWidth: avatarStyles.maxWidth,
                            maxHeight: avatarStyles.maxHeight
                        });
                        
                        // Force set dimensions if they're too small or if video is enabled
                        if (parseInt(avatarStyles.width) < 50 || parseInt(avatarStyles.height) < 50) {
                            console.log(`🔧 Avatar container too small, forcing dimensions...`);
                            // Check if video is enabled for this player to use larger size
                            if (playerAvatar.classList.contains('video-enabled')) {
                                playerAvatar.style.width = '200px';
                                playerAvatar.style.height = '200px';
                                playerAvatar.style.minWidth = '200px';
                                playerAvatar.style.minHeight = '200px';
                                console.log(`🔧 Forced video-enabled container to 200x200px`);
                            } else {
                                playerAvatar.style.width = '120px';
                                playerAvatar.style.height = '120px';
                                playerAvatar.style.minWidth = '120px';
                                playerAvatar.style.minHeight = '120px';
                            }
                        }
                        
                        // Force video element dimensions to match container
                        setTimeout(() => {
                            const containerRect = playerAvatar.getBoundingClientRect();
                            if (containerRect.width > 0 && containerRect.height > 0) {
                                videoElement.style.width = containerRect.width + 'px';
                                videoElement.style.height = containerRect.height + 'px';
                                videoElement.style.minWidth = containerRect.width + 'px';
                                videoElement.style.minHeight = containerRect.height + 'px';
                                console.log(`🔧 Video element forced to ${containerRect.width}x${containerRect.height}px`);
                            } else {
                                // Fallback if container has no dimensions - force absolute size for 192x192 video
                                videoElement.style.width = '192px';
                                videoElement.style.height = '192px';
                                videoElement.style.minWidth = '192px';
                                videoElement.style.minHeight = '192px';
                                videoElement.style.top = '4px';
                                videoElement.style.left = '4px';
                                console.log(`🔧 Video element forced to fallback 192x192px with 4px offset`);
                            }
                            
                            // Force the video element to be visible with proper positioning for 8px gap
                            videoElement.style.display = 'block !important';
                            videoElement.style.position = 'absolute !important';
                            videoElement.style.top = '4px !important';
                            videoElement.style.left = '4px !important';
                            videoElement.style.zIndex = '100 !important';
                            videoElement.style.borderRadius = '50% !important';
                            videoElement.style.objectFit = 'cover !important';
                        }, 100);
                    }
                    
                    // Debug all children
                    console.log(`🎬 Avatar container children:`, avatarContainer.innerHTML);
                }
            } else {
                console.warn(`❌ Local video element not found for seat ${mySeat}`);
            }
        }
    }
    
    hideLocalVideo() {
        if (mySeat !== null) {
            // Find the video element in a visible container instead of using getElementById
            let videoElement = null;
            const allVideoElements = document.querySelectorAll(`#video-${mySeat}`);
            
            for (const video of allVideoElements) {
                const parentAvatar = video.closest('.player-avatar');
                const parentContainer = video.closest('.player-avatar-container');
                if (parentAvatar && parentContainer) {
                    const containerRect = parentContainer.getBoundingClientRect();
                    const avatarRect = parentAvatar.getBoundingClientRect();
                    // Choose the video in a visible container (width > 0)
                    if (containerRect.width > 0 && avatarRect.width > 0) {
                        videoElement = video;
                        break;
                    }
                }
            }
            
            // Fallback to first element if no visible container found
            if (!videoElement && allVideoElements.length > 0) {
                videoElement = allVideoElements[0];
            }
            
            if (videoElement) {
                videoElement.style.display = 'none';
                videoElement.srcObject = null;

                // Remove local video from active seats
                this.activeVideoSeats.delete(mySeat);

                // Restore avatar image and fallback with proper logic
                const avatarContainer = document.querySelector(`[data-seat="${mySeat}"] .player-avatar-container`);
                if (avatarContainer) {
                    const playerAvatar = avatarContainer.querySelector('.player-avatar');
                    
                    // Remove video-enabled class
                    if (playerAvatar) {
                        playerAvatar.classList.remove('video-enabled');
                        console.log(`🎬 Removed video-enabled class from local avatar for seat ${mySeat}`);
                    }
                    
                    const avatarImage = avatarContainer.querySelector('.avatar-image');
                    const avatarFallback = avatarContainer.querySelector('.avatar-fallback');

                    if (avatarImage && avatarFallback) {
                        // Try to show the image first
                        avatarImage.style.display = 'block';
                        avatarFallback.style.display = 'none';

                        // If image fails to load or has no src, show fallback instead
                        if (!avatarImage.src || avatarImage.src === '' || avatarImage.complete && avatarImage.naturalWidth === 0) {
                            avatarImage.style.display = 'none';
                            avatarFallback.style.display = 'flex';
                        }
                    }
                }
            }
        }
    }    showVideoForSeat(seat, stream) {
        console.log(`🎬 Trying to show video for seat ${seat}`);
        
        // Find the video element in a visible container instead of using getElementById
        let videoElement = null;
        const allVideoElements = document.querySelectorAll(`#video-${seat}`);
        
        for (const video of allVideoElements) {
            const parentAvatar = video.closest('.player-avatar');
            const parentContainer = video.closest('.player-avatar-container');
            if (parentAvatar && parentContainer) {
                const containerRect = parentContainer.getBoundingClientRect();
                const avatarRect = parentAvatar.getBoundingClientRect();
                // Choose the video in a visible container (width > 0)
                if (containerRect.width > 0 && avatarRect.width > 0) {
                    videoElement = video;
                    console.log(`🎬 Found video for seat ${seat} in visible container:`, containerRect.width, 'x', containerRect.height);
                    break;
                }
            }
        }
        
        // Fallback to first element if no visible container found
        if (!videoElement && allVideoElements.length > 0) {
            videoElement = allVideoElements[0];
            // console.log(`🎬 Using fallback video element for seat ${seat} (no visible container found)`);
        }
        
        // console.log(`🎬 Video element found:`, videoElement);
        
        if (videoElement) {
            videoElement.srcObject = stream;
            videoElement.style.display = 'block';
            
            // Track this seat as having active video
            this.activeVideoSeats.add(seat);
            
            // Add video event listeners
            videoElement.onloadedmetadata = () => {
                // console.log(`🎬 Remote video loaded for seat ${seat} - ${videoElement.videoWidth}x${videoElement.videoHeight}`);
                videoElement.play().catch(error => {
                    console.error(`❌ Remote video play failed for seat ${seat}:`, error);
                });
            };
            
            videoElement.onplay = () => {
                // console.log(`▶️ Remote video playing for seat ${seat}`);
            };
            
            // Hide avatar image and fallback for this seat, but keep container visible
            const avatarContainer = document.querySelector(`[data-seat="${seat}"] .player-avatar-container`);
            console.log(`🎬 Avatar container found for seat ${seat}:`, avatarContainer);
            if (avatarContainer) {
                const playerAvatar = avatarContainer.querySelector('.player-avatar');
                
                // Add video-enabled class for enhanced styling
                if (playerAvatar) {
                    playerAvatar.classList.add('video-enabled');
                    console.log(`🎬 Added video-enabled class to avatar for seat ${seat}`);
                }
                
                const avatarImage = avatarContainer.querySelector('.avatar-image');
                const avatarFallback = avatarContainer.querySelector('.avatar-fallback');
                console.log(`🎬 Remote avatar image:`, avatarImage, avatarImage?.style.display);
                console.log(`🎬 Remote avatar fallback:`, avatarFallback, avatarFallback?.style.display);
                
                if (avatarImage) {
                    avatarImage.style.display = 'none';
                    console.log(`🎬 Remote avatar image hidden, new display:`, avatarImage.style.display);
                }
                if (avatarFallback) {
                    avatarFallback.style.display = 'none';
                    console.log(`🎬 Remote avatar fallback hidden, new display:`, avatarFallback.style.display);
                }
                
                // Debug all children
                console.log(`🎬 Remote avatar container children:`, avatarContainer.innerHTML);
            }
        } else {
            console.warn(`❌ Video element not found for seat ${seat}`);
        }
    }
    
    hideVideoForSeat(seat) {
        // Find the video element in a visible container instead of using getElementById
        let videoElement = null;
        const allVideoElements = document.querySelectorAll(`#video-${seat}`);
        
        for (const video of allVideoElements) {
            const parentAvatar = video.closest('.player-avatar');
            const parentContainer = video.closest('.player-avatar-container');
            if (parentAvatar && parentContainer) {
                const containerRect = parentContainer.getBoundingClientRect();
                const avatarRect = parentAvatar.getBoundingClientRect();
                // Choose the video in a visible container (width > 0)
                if (containerRect.width > 0 && avatarRect.width > 0) {
                    videoElement = video;
                    break;
                }
            }
        }
        
        // Fallback to first element if no visible container found
        if (!videoElement && allVideoElements.length > 0) {
            videoElement = allVideoElements[0];
        }
        
        if (videoElement) {
            videoElement.style.display = 'none';
            videoElement.srcObject = null;

            // Remove from active video seats
            this.activeVideoSeats.delete(seat);

            // Remove video-enabled class and show avatar image and fallback again
            const avatarContainer = document.querySelector(`[data-seat="${seat}"] .player-avatar-container`);
            if (avatarContainer) {
                const playerAvatar = avatarContainer.querySelector('.player-avatar');
                
                // Remove video-enabled class
                if (playerAvatar) {
                    playerAvatar.classList.remove('video-enabled');
                    console.log(`🎬 Removed video-enabled class from avatar for seat ${seat}`);
                }
                
                const avatarImage = avatarContainer.querySelector('.avatar-image');
                const avatarFallback = avatarContainer.querySelector('.avatar-fallback');
                if (avatarImage) avatarImage.style.display = '';
                if (avatarFallback) avatarFallback.style.display = '';
            }
        }
    }    // Method to restore all video streams after DOM updates
    restoreVideoStreams() {
        console.log('🔄 Restoring video streams after DOM update...');
        console.log('🔄 Active video seats:', Array.from(this.activeVideoSeats));
        console.log('🔄 Remote streams:', Array.from(this.remoteStreams.keys()));
        console.log('🔄 Local video enabled:', this.isVideoEnabled, 'mySeat:', mySeat);
        
        // Restore local video if enabled
        if (this.isVideoEnabled && this.localStream && mySeat !== null) {
            console.log('🔄 Restoring local video for seat', mySeat);
            this.showLocalVideo();
        }
        
        // Restore remote videos
        this.remoteStreams.forEach((stream, seat) => {
            if (this.activeVideoSeats.has(seat)) {
                console.log(`🔄 Restoring remote video for seat ${seat}`);
                this.showVideoForSeat(seat, stream);
            }
        });
    }
    
    hideAllRemoteVideos() {
        for (let seat = 0; seat < 4; seat++) {
            if (seat !== mySeat) {
                this.hideVideoForSeat(seat);
            }
        }
    }
    
    updateVideoButton() {
        const toggleBtn = document.getElementById('toggle-video-btn');
        if (toggleBtn) {
            if (this.isVideoEnabled) {
                toggleBtn.textContent = '🎥 Disable Camera';
                toggleBtn.classList.remove('btn-primary');
                toggleBtn.classList.add('btn-danger');
            } else {
                toggleBtn.textContent = '📹 Enable Camera';
                toggleBtn.classList.remove('btn-danger');
                toggleBtn.classList.add('btn-primary');
            }
        }
    }
    
    showToast(message, type = 'info') {
        // Use existing toast system if available
        if (window.showToast) {
            window.showToast(message, type);
        } else {
            console.log(`Toast (${type}): ${message}`);
        }
    }
}

// Initialize video manager
let videoManager = null;

// Helper to extract a player's first name from several possible fields
function getPlayerFirstName(player, fallback) {
    if (!player) return fallback || '';
    const name = player.userName || player.name || (player.user && (player.user.userName || player.user.name)) || '';
    if (!name) return fallback || '';
    return String(name).split(' ')[0];
}

// Avatar utility functions
function getInitials(name) {
    if (!name) return '?';
    const words = name.trim().split(' ');
    if (words.length === 1) return words[0].charAt(0).toUpperCase();
    return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

function generateAvatarColor(userId) {
    // Generate a consistent color based on user ID
    const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
        '#F7DC6F', '#BB8FCE', '#85C1E9', '#F8C471', '#82E0AA'
    ];
    const hash = String(userId).split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
    }, 0);
    return colors[Math.abs(hash) % colors.length];
}

function renderPlayerAvatar(player, size = 'medium', seat = null) {
    console.log(`🎨 renderPlayerAvatar called for seat ${seat}, size ${size}`);
    const firstName = getPlayerFirstName(player);
    const initials = getInitials(player.userName || player.name || '');
    const avatarColor = generateAvatarColor(player.userId);
    const profilePicture = player.profilePicture || (currentUser && String(player.userId) === String(currentUser.id) ? currentUser.profilePicture : null);
    
    const sizeClass = size === 'large' ? 'avatar-large' : size === 'small' ? 'avatar-small' : 'avatar-medium';
    
    // Determine video element ID if seat is provided
    const videoId = seat !== null ? `video-${seat}` : '';
    
    console.log(`🎨 Creating avatar HTML for seat ${seat} with video element: ${videoId ? 'YES' : 'NO'}`);
    
    // Check if this seat has active video
    const hasActiveVideo = videoManager && videoManager.activeVideoSeats && videoManager.activeVideoSeats.has(seat);
    console.log(`🎨 Seat ${seat} has active video: ${hasActiveVideo}, videoManager exists: ${!!videoManager}, activeVideoSeats: ${videoManager?.activeVideoSeats ? Array.from(videoManager.activeVideoSeats) : 'none'}`);
    
    return `
        <div class="player-avatar-container">
            <div class="player-avatar ${sizeClass}">
                ${seat !== null ? `
                    <video id="${videoId}" 
                           class="player-video" 
                           autoplay muted playsinline
                           style="display: none; border-radius: 50%; object-fit: cover;">
                    </video>
                ` : ''}
                <img src="${profilePicture || ''}" 
                     alt="${firstName}" 
                     class="avatar-image"
                     style="display: block;"
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="avatar-fallback" style="background-color: ${avatarColor}; display: flex;">
                    ${firstName}
                </div>
            </div>
        </div>
    `;
}

function renderOpponentHand(handSize) {
    if (!handSize || handSize === 0) {
        return '<div class="opponent-hand"></div>';
    }
    
    const maxCards = Math.min(handSize, 13);
    const totalSpread = (maxCards - 1) * 9; // Total width of the spread
    const startOffset = -totalSpread / 2 - 22; // Start offset to center the group, adjusted left by ~2 cards
    
    const cards = Array.from({length: maxCards}, (_, i) => {
        const offsetX = startOffset + (i * 9); // Position relative to center
        const rotation = (Math.random() - 0.5) * 6; // Small random rotation
        return `<div class="card-back" style="transform: translateX(${offsetX}px) rotate(${rotation}deg)">
                    <img src="/hearts/bridge3-box-qr-Large/2B.svg" alt="Card back" class="card-back-image">
                </div>`;
    }).join('');
    
    return `
        <div class="opponent-hand">
            <div class="hand-cards-container">${cards}</div>
        </div>
    `;
}

function renderTricksWon(tricksWon) {
    if (!tricksWon || tricksWon === 0) {
        // return '<div class="tricks-won-container"></div>';
    }
    
    const maxTricks = Math.min(tricksWon, 13);
    const tricks = Array.from({length: maxTricks}, (_, i) => {
        const offsetX = i * 4; // Stack horizontally to the right with larger spacing
        const rotation = (Math.random() - 0.5) * 4; // Small random rotation
        return `<div class="trick-card" style="transform: translateX(${offsetX}px) rotate(${rotation}deg)">
                    <img src="/hearts/bridge3-box-qr-Large/2B.svg" alt="Trick" class="trick-card-image">
                </div>`;
    }).join('');
    
    return `
        <div class="tricks-won-container">
            <div class="trick-stack">${tricks}</div>
        </div>
    `;
}

// Card Animation System
class CardAnimationManager {
    constructor() {
        this.animationQueue = [];
        this.isProcessing = false;
    }

    async addAnimation(animationFunction) {
        this.animationQueue.push(animationFunction);
        if (!this.isProcessing) {
            this.isProcessing = true;
            while (this.animationQueue.length > 0) {
                const animation = this.animationQueue.shift();
                try {
                    await animation();
                } catch (error) {
                    console.error('Animation error:', error);
                }
            }
            this.isProcessing = false;
        }
    }

    animateCardPlay(cardElement, fromSeat) {
        return new Promise((resolve) => {
            if (!cardElement) {
                console.log('No card element found for animation');
                resolve();
                return;
            }

            // Get positions
            const fromRect = cardElement.getBoundingClientRect();
            const trickArea = document.getElementById('trick-area');
            if (!trickArea) {
                console.log('No trick area found for animation');
                resolve();
                return;
            }
            const toRect = trickArea.getBoundingClientRect();

            // Calculate center positions
            const fromPosition = {
                x: fromRect.left + fromRect.width / 2,
                y: fromRect.top + fromRect.height / 2
            };
            const toPosition = {
                x: toRect.left + toRect.width / 2,
                y: toRect.top + toRect.height / 2
            };

            // Calculate relative movement
            const deltaX = toPosition.x - fromPosition.x;
            const deltaY = toPosition.y - fromPosition.y;

            console.log('Animating card from', fromPosition, 'to', toPosition);

            const animation = cardElement.animate([
                {
                    transform: `translate(0px, 0px) scale(1)`,
                    zIndex: 1,
                    opacity: 1
                },
                {
                    transform: `translate(${deltaX}px, ${deltaY}px) scale(0.9)`,
                    zIndex: 10,
                    opacity: 0.8
                }
            ], {
                duration: 600,
                easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                fill: 'forwards'
            });
            
            animation.onfinish = () => {
                console.log('Card animation completed');
                resolve();
            };
            animation.oncancel = () => {
                console.log('Card animation cancelled');
                resolve();
            };
        });
    }

    animateTrickCompletion(winnerSeat) {
        console.log('Animating trick completion for winner seat:', winnerSeat);
        // For now, just a simple flash effect on the trick area
        const trickArea = document.getElementById('trick-area');
        if (trickArea) {
            trickArea.style.transition = 'all 0.3s ease';
            trickArea.style.transform = 'scale(1.1)';
            trickArea.style.filter = 'brightness(1.2)';
            
            setTimeout(() => {
                trickArea.style.transform = 'scale(1)';
                trickArea.style.filter = 'brightness(1)';
            }, 300);
        }
    }
}

// Initialize socket connection
function initializeSocket() {
    // Connect using the current path context (within /hearts/)
    socket = io({
        withCredentials: true,
        transports: ['websocket', 'polling'],
        path: '/hearts/socket.io/'
    });
    socket.on('connect', () => {
        updateConnectionStatus(true);
        socket.emit('join-lobby');
        setupNewSocketEvents();
        
        // Initialize video manager
        if (!videoManager) {
            videoManager = new VideoManager(socket);
        }
    });
    socket.on('disconnect', (reason) => {
        console.log('❌ Disconnected from server. Reason:', reason);
        updateConnectionStatus(false);
    });
    socket.on('lobby-updated', (data) => {
        console.log('🏛️ Lobby updated:', data);
        // Reset end-game flag when returning to lobby state
        if (data.state === 'lobby') {
            endGameShown = false;
        }
        
        // Only update lobby display if we're actually in lobby state
        // Don't override game state with lobby state during active games
        if (data.state === 'lobby') {
            updateLobbyDisplay(data);
        }
    });
    socket.on('game-started', (data) => {
        endGameShown = false; // Reset end-game animation flag for new game
        showGameSection();
        
        // Restore video streams after transitioning to game view with longer delay
        if (videoManager) {
            // Multiple restoration attempts to ensure it works
            // setTimeout(() => {
            //     console.log('🎮 First video restoration attempt after game start');
            //     videoManager.restoreVideoStreams();
            // }, 100);
            
            // setTimeout(() => {
            //     console.log('🎮 Second video restoration attempt after game start');
            //     videoManager.restoreVideoStreams();
            // }, 300);
            
            setTimeout(() => {
                console.log('🎮 Final video restoration attempt after game start');
                videoManager.restoreVideoStreams();
            }, 500);
        }
    });
    // cards-dealt event is no longer needed; hand is always included in game-state
    // Listen for game state updates (after passing, etc)
    socket.on('game-state', (data) => {
    // Update scoreboard after each round
    function updateScoreboard() {
        const rowsDiv = document.getElementById('scoreboard-rows');
        if (!rowsDiv || !data.players) return;
        
        const historical = data.scores && data.scores.historical ? data.scores.historical : [];
        
        // Create header with player names
        let html = '<div class="scoreboard-header-row">';
        html += '<div class="round-label">Round</div>';
        for (let i = 0; i < 4; i++) {
            const player = data.players[i];
            let name = getPlayerFirstName(player, `Player ${i+1}`);
            html += `<div class="player-header">${name}</div>`;
        }
        html += '</div>';
        
        // Add historical rounds
        if (historical.length > 0) {
            historical.forEach((round) => {
                html += '<div class="scoreboard-round-row">';
                html += `<div class="round-label">R${round.round}</div>`;
                for (let i = 0; i < 4; i++) {
                    const roundPlayerScore = round.scores[i] || 0;
                    html += `<div class="round-score">${roundPlayerScore}</div>`;
                }
                html += '</div>';
            });
        }
        
        // Add total scores row
        html += '<div class="scoreboard-total-row">';
        html += '<div class="round-label">Total</div>';
        for (let i = 0; i < 4; i++) {
            const player = data.players[i];
            const totalScore = player && typeof player.totalScore === 'number' ? player.totalScore : 0;
            html += `<div class="total-score">${totalScore}</div>`;
        }
        html += '</div>';
        
        rowsDiv.innerHTML = html;
    }
    updateScoreboard();
    lobbyState = data;
    ensureGameSectionVisible();
        console.log('🎮 Received game-state update:', data);
        
        // Check for sound events (hearts broken, Queen of Spades played)
        soundManager.checkForSoundEvents(data);
        
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
                            if (!disabled2 && !hasPassed) passSelectedCards();
                        };
                    }
            }
            if (trickArea) trickArea.classList.add('hidden');
            } else if (data.state === 'playing') {
                window.selectedCards = [];
                if (passArrowContainer) passArrowContainer.classList.add('hidden');
                if (trickArea) trickArea.classList.remove('hidden');
            }
            showHand(handToShow);
            if (data.state === 'playing') {
                // Always render the trick from the authoritative server state
                const serverTrick = data.currentTrickCards || [];
                // Animate newly played cards before updating display
                animateNewlyPlayedCard(serverTrick);
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
    
    // Check for game end and show end-game animation (only once per game)
    if (data.state === 'finished' && !endGameShown) {
        endGameShown = true;
        showEndGameAnimation(data);
    }
    
    // Update controls (including lobby leader controls) based on current game state
    updateControls();
    
    // Restore video streams after game state update with delay
    if (videoManager) {
        // Immediate attempt
        videoManager.restoreVideoStreams();
        
        // Delayed backup attempt
        setTimeout(() => {
            console.log('🎮 Backup video restoration in game-state handler');
            videoManager.restoreVideoStreams();
        }, 200);
    }
}); // End socket.on('game-state')
    // Listen for trick-completed event (log only; UI is driven by 'game-state')
    socket.on('trick-completed', (data) => {
        // Display completed trick for a short TTL so users reliably see it.
        if (!data || !data.trickCards) return;
        
        // Trigger trick completion animation
        if (window.cardAnimationManager) {
            window.cardAnimationManager.animateTrickCompletion(data.winner);
        }
        
        // Render the trick from payload immediately (won't conflict with subsequent game-state which
        // will be delayed by the server). This is a lightweight visual aid.
        try {
            showTrick(data.trickCards, data.winner)
            // showTrick(data.trickCards.map((c, i) => ({ card: c, seat: data.trickOrder ? data.trickOrder[i] : undefined })), data.winner);
        } catch (e) {
            console.error('Error showing trick-completed payload:', e);
        }
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

// Track previous trick state for animation detection
let previousTrickCards = [];

// Animate newly played cards
function animateNewlyPlayedCard(newTrickCards) {
    if (!window.cardAnimationManager) return;
    
    // Find newly played cards by comparing with previous state
    const previousCardIds = previousTrickCards.map(card => `${card.seat}-${card.card}`);
    const newlyPlayed = newTrickCards.filter(card => {
        const cardId = `${card.seat}-${card.card}`;
        return !previousCardIds.includes(cardId);
    });
    
    // Animate each newly played card
    newlyPlayed.forEach(play => {
        // Create a temporary card element for animation
        const tempCard = document.createElement('img');
        tempCard.src = getCardImageUrl(play.card);
        tempCard.className = 'card-img playing temp-animation-card';
        tempCard.style.position = 'fixed';
        tempCard.style.width = '60px';
        tempCard.style.height = '90px';
        tempCard.style.zIndex = '9999';
        tempCard.style.pointerEvents = 'none';
        
        // Position the card based on the seat that played it
        let startPosition;
        if (play.seat === mySeat) {
            // From player's hand at bottom
            startPosition = { left: '50%', top: '85%' };
        } else {
            // From opponent positions - seatOrder: [bottom, left, top, right] matching UI layout
            // UI layout: [mySeat, (mySeat+1)%4, (mySeat+2)%4, (mySeat+3)%4] maps to [bottom, left, top, right]
            const seatOrder = [mySeat, (mySeat+1)%4, (mySeat+2)%4, (mySeat+3)%4];
            const seatIndex = seatOrder.indexOf(play.seat);
            switch(seatIndex) {
                case 1: startPosition = { left: '15%', top: '50%' }; break; // left opponent
                case 2: startPosition = { left: '50%', top: '15%' }; break; // top opponent  
                case 3: startPosition = { left: '85%', top: '50%' }; break; // right opponent
                default: startPosition = { left: '50%', top: '85%' }; break; // fallback to bottom
            }
        }
        
        tempCard.style.left = startPosition.left;
        tempCard.style.top = startPosition.top;
        tempCard.style.transform = 'translate(-50%, -50%)';
        
        document.body.appendChild(tempCard);
        
        // Trigger animation and remove after completion
        setTimeout(() => {
            tempCard.style.transition = 'all 0.4s ease-out';
            tempCard.style.left = '50%';
            tempCard.style.top = '50%';
            tempCard.style.transform = 'translate(-50%, -50%) scale(0.8)';
            tempCard.style.opacity = '0.8';
            
            setTimeout(() => {
                if (tempCard.parentNode) {
                    tempCard.parentNode.removeChild(tempCard);
                }
            }, 400);
        }, 50);
    });
    
    // Update previous state
    previousTrickCards = [...newTrickCards];
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
        // Clear only the player seat cells, NOT the center cell, but preserve video elements
        const seatClassesToClear = ['game-seat-hand','game-seat-right','game-seat-upper','game-seat-left'];
        seatClassesToClear.forEach(cls => {
            const cell = gameSeatsContainer.querySelector('.' + cls);
            if (cell) {
                // Check if this cell has a video element before clearing
                const existingVideo = cell.querySelector('.player-video');
                if (existingVideo && existingVideo.srcObject) {
                    console.log('🎥 Preserving video during cell clear for class:', cls);
                    // Store the video element temporarily
                    const tempVideoContainer = document.createElement('div');
                    tempVideoContainer.style.display = 'none';
                    tempVideoContainer.appendChild(existingVideo);
                    document.body.appendChild(tempVideoContainer);
                    
                    // Clear the cell
                    cell.innerHTML = '';
                    
                    // Store reference to restore later
                    cell._preservedVideo = existingVideo;
                } else {
                    cell.innerHTML = '';
                }
            }
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
            
            // Add data-seat attribute for video manager
            cell.setAttribute('data-seat', seatIdx);
            
            const isTurn = lobbyState.currentTurnSeat === seatIdx;
            if (i === 0) {
                // My seat (bottom): show avatar, hand, and tricks
                if (!hand || !Array.isArray(hand) || hand.length === 0) {
                    cell.innerHTML = '<em>No cards dealt.</em>';
                } else {
                    const name = getPlayerFirstName(player, 'You');
                    const highlightClass = isTurn ? 'player-name current-turn' : 'player-name';
                    const tricksWon = lobbyState.tricksWon ? (lobbyState.tricksWon[seatIdx] || 0) : 0;
                    
                    // Add lobby leader crown if this player is the leader
                    const isLeader = (lobbyState.lobbyLeader === seatIdx);
                    const leaderCrown = isLeader ? '<div class="lobby-leader-crown"></div>' : '';
                    
                    cell.innerHTML = `
                        <div class="my-player-info">
                            ${leaderCrown}
                            <div class="opponent-top-row">
                                ${renderPlayerAvatar(player, 'large', mySeat)}
                                ${renderTricksWon(tricksWon)}
                            </div>
                        </div>
                        <div id="hand-cards" style="display:flex;justify-content:center;align-items:center;margin-top:8px;"></div>
                    `;
                    
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
                // Other players: show avatar, hand visualization, and tricks won
                const name = getPlayerFirstName(player, player ? `Player ${seatIdx+1}` : 'Empty');
                const highlightClass = isTurn ? 'opponent-name current-turn' : 'opponent-name';
                const handSize = player && player.hand ? player.hand.length : (player && player.handSize ? player.handSize : 0);
                const tricksWon = lobbyState.tricksWon ? (lobbyState.tricksWon[seatIdx] || 0) : 0;
                
                // Add lobby leader crown if this player is the leader
                const isLeader = (lobbyState.lobbyLeader === seatIdx);
                const leaderCrown = isLeader ? '<div class="lobby-leader-crown"></div>' : '';
                
                cell.innerHTML = `
                    <div class="opponent-info${isTurn?' current-turn':''}">
                        ${leaderCrown}
                        <div class="opponent-top-row">
                            ${renderPlayerAvatar(player, 'large', seatIdx)}
                            ${renderTricksWon(tricksWon)}
                        </div>
                        ${renderOpponentHand(handSize)}
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
        
        // Restore any preserved videos after HTML rebuild
        seatClassesToClear.forEach(cls => {
            const cell = gameSeatsContainer.querySelector('.' + cls);
            if (cell && cell._preservedVideo) {
                const avatarContainer = cell.querySelector('.avatar-container');
                if (avatarContainer) {
                    const playerAvatar = avatarContainer.querySelector('.player-avatar');
                    if (playerAvatar) {
                        // Remove the preserved video from temp container
                        const tempContainer = cell._preservedVideo.parentElement;
                        if (tempContainer && tempContainer.parentElement === document.body) {
                            document.body.removeChild(tempContainer);
                        }
                        
                        // Add the preserved video to the player avatar
                        playerAvatar.appendChild(cell._preservedVideo);
                        console.log('🎥 Restored preserved video for class:', cls);
                    }
                }
                // Clean up the reference
                delete cell._preservedVideo;
            }
        });
        
        // Always hide the old hand area in passing/playing phase
        // handArea.style.display = 'none';
        updateCardSelectionUI();
        return;
    } 
    
    // Restore video streams after DOM update
    if (videoManager) {
        videoManager.restoreVideoStreams();
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
        
        // Trigger card play animation only after successful play
        const cardElement = document.querySelector(`#hand-cards img[data-card="${card}"]`);
        if (cardElement && window.cardAnimationManager) {
            console.log('Starting card animation for valid play:', card);
            window.cardAnimationManager.animateCardPlay(cardElement, mySeat).catch(error => {
                console.error('Animation error:', error);
            });
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

// Countdown timer functions
function startDisconnectCountdown(durationMinutes = 1) {
    console.log('Starting disconnect countdown for', durationMinutes, 'minutes');
    const countdownDiv = document.getElementById('disconnect-countdown');
    const timerSpan = document.getElementById('countdown-timer');
    
    console.log('Countdown elements found:', !!countdownDiv, !!timerSpan);
    if (!countdownDiv || !timerSpan) return;
    
    // Clear any existing timer
    if (countdownTimer) {
        clearInterval(countdownTimer);
    }
    
    // Set end time
    countdownEndTime = Date.now() + (durationMinutes * 60 * 1000);
    
    // Show countdown
    countdownDiv.classList.remove('hidden');
    
    // Update timer every second
    countdownTimer = setInterval(() => {
        const timeLeft = countdownEndTime - Date.now();
        
        if (timeLeft <= 0) {
            // Timer expired
            clearInterval(countdownTimer);
            countdownTimer = null;
            countdownDiv.classList.add('hidden');
            timerSpan.textContent = '--';
            return;
        }
        
        // Format time as MM:SS
        const minutes = Math.floor(timeLeft / 60000);
        const seconds = Math.floor((timeLeft % 60000) / 1000);
        timerSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
    
    // Initial update
    const timeLeft = countdownEndTime - Date.now();
    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);
    timerSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function stopDisconnectCountdown() {
    const countdownDiv = document.getElementById('disconnect-countdown');
    const timerSpan = document.getElementById('countdown-timer');
    
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
    
    countdownEndTime = null;
    
    if (countdownDiv) {
        countdownDiv.classList.add('hidden');
    }
    
    if (timerSpan) {
        timerSpan.textContent = '--';
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
            
            // Add ready state visual indicator
            if (player.isReady) {
                seatEl.classList.add('ready-player');
            }
            const firstName = player.userName ? player.userName.split(' ')[0] : `Player ${seatNumberMap[seat]}`;
            const isLeader = (state.lobbyLeader === seat);
            
            // Show Remove Bot button for lobby leader if this is a bot (icon-only, round)
            const removeBotBtn = (player.isBot && amLeader) ? `<button class="btn small danger remove-bot-btn" data-remove-bot-seat="${seat}" aria-label="Remove bot">✖</button>` : '';
            
            // Show kick player button for lobby leader if this is a human player and not themselves
            const kickPlayerBtn = (!player.isBot && amLeader && !isMySeat) ? 
                `<button class="kick-player-btn" data-kick-user="${player.userId}" title="Kick player">⚠</button>` : '';
            
            // Add lobby leader crown if this player is the leader
            const leaderCrown = isLeader ? '<div class="lobby-leader-crown"></div>' : '';
            
            seatEl.innerHTML = `
                ${leaderCrown}
                <div class="seat-number">Seat ${seatNumberMap[seat]}</div>
                <div class="seat-content">
                    ${renderPlayerAvatar(player, 'large', seat)}
                    ${removeBotBtn}${kickPlayerBtn}
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
    
    // Wire Kick Player button handlers
    document.querySelectorAll('.kick-player-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetUserId = btn.getAttribute('data-kick-user');
            const player = Object.values(state.players).find(p => String(p.userId) === String(targetUserId));
            const playerName = player ? (player.userName || 'Unknown') : 'Unknown';
            
            if (confirm(`Are you sure you want to kick ${playerName} from the game?`)) {
                socket.emit('kick-player', { 
                    targetUserId: targetUserId,
                    reason: 'Kicked by lobby leader'
                });
            }
        });
    });
}

function updateControls() {
    const leaveSeatBtn = document.getElementById('leave-seat-btn');
    const readyBtn = document.getElementById('ready-btn');
    const startGameBtn = document.getElementById('start-game-btn');
    const videoBtn = document.getElementById('toggle-video-btn');
    const lobbyLeaderControls = document.getElementById('lobby-leader-controls');
    
    if (mySeat !== null) {
        leaveSeatBtn.classList.remove('hidden');
        readyBtn.classList.remove('hidden');
        readyBtn.textContent = isReady ? 'Not Ready' : 'Ready';
        readyBtn.className = isReady ? 'btn danger' : 'btn primary';
    } else {
        leaveSeatBtn.classList.add('hidden');
        readyBtn.classList.add('hidden');
    }
    
    // Update video button state (always visible now)
    if (videoManager) {
        videoManager.updateVideoButton();
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
    
    // Show lobby leader controls if in-game and user is leader
    console.log('updateControls - amLeader:', amLeader, 'lobbyState:', lobbyState?.state, 'mySeat:', mySeat, 'leaderSeat:', leaderSeat);
    if (amLeader && lobbyState && (lobbyState.state === 'playing' || lobbyState.state === 'passing')) {
        console.log('Showing lobby leader controls');
        lobbyLeaderControls.classList.remove('hidden');
    } else {
        console.log('Hiding lobby leader controls');
        lobbyLeaderControls.classList.add('hidden');
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
    
    // Restore video streams after DOM update
    if (videoManager) {
        videoManager.restoreVideoStreams();
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

function showLobbySection() {
    document.getElementById('game-section').classList.add('hidden');
    document.getElementById('lobby-section').classList.remove('hidden');
    
    // Restore video streams after transitioning to lobby view
    if (videoManager) {
        // Small delay to ensure DOM is updated
        setTimeout(() => {
            videoManager.restoreVideoStreams();
        }, 100);
    }
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

// Global toast function for use by other components
window.showToast = createToast;

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

// End Game Animation Functions
function showEndGameAnimation(gameData) {
    console.log('🏆 Game finished! Showing end-game animation:', gameData);
    console.log('🔍 gameData.players type:', typeof gameData.players, 'value:', gameData.players);
    
    // Get the modal elements
    const endGameModal = document.getElementById('end-game-modal');
    const winnerNameEl = document.getElementById('winner-name');
    const rankingsListEl = document.getElementById('rankings-list');
    
    if (!endGameModal || !rankingsListEl) {
        console.error('End game modal elements not found');
        return;
    }
    
    // Handle different player data structures
    let players = [];
    if (Array.isArray(gameData.players)) {
        players = gameData.players;
    } else if (gameData.players && typeof gameData.players === 'object') {
        // If players is a Map or object, convert to array
        players = Object.values(gameData.players);
    } else {
        console.error('No valid players data found in gameData:', gameData);
        return;
    }
    
    console.log('🔍 Processed players array:', players);
    
    // Determine winner and create rankings
    const rankings = players
        .filter(p => p) // Remove null/undefined players
        .map(player => ({
            seat: player.seat,
            userId: player.userId,
            userName: player.userName || 'Unknown',
            totalScore: player.totalScore || 0,
            isBot: player.isBot || false,
            profilePicture: player.profilePicture
        }))
        .sort((a, b) => a.totalScore - b.totalScore); // Lowest score wins in Hearts
    
    console.log('🏆 Final rankings:', rankings);
    
    const winner = rankings[0];
    
    // Update winner display
    if (winnerNameEl && winner) {
        winnerNameEl.textContent = `${getPlayerFirstName({ userName: winner.userName })} Wins!`;
    }
    
    // Create rankings display
    let rankingsHtml = '';
    rankings.forEach((player, index) => {
        const position = index + 1;
        const isWinner = position === 1;
        const positionClass = position === 1 ? 'first' : position === 2 ? 'second' : position === 3 ? 'third' : '';
        
        rankingsHtml += `
            <div class="ranking-item ${isWinner ? 'winner' : ''}">
                <div class="ranking-position ${positionClass}">${position}</div>
                <div class="ranking-player-info">
                    <div class="ranking-avatar">
                        ${renderPlayerAvatar(player, 'small')}
                    </div>
                    <div class="ranking-name">${getPlayerFirstName({ userName: player.userName })}</div>
                </div>
                <div class="ranking-score">${player.totalScore}</div>
            </div>
        `;
    });
    
    rankingsListEl.innerHTML = rankingsHtml;
    
    // Create confetti animation
    createConfetti();
    
    // Show the modal
    endGameModal.classList.remove('hidden');
    
    // Focus the modal for accessibility
    const modalContent = document.getElementById('end-game-modal-content');
    if (modalContent) {
        modalContent.focus();
    }
}

function createConfetti() {
    const container = document.getElementById('confetti-container');
    if (!container) return;
    
    // Clear any existing confetti
    container.innerHTML = '';
    
    // Create 50 confetti pieces
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        
        // Random horizontal position
        confetti.style.left = Math.random() * 100 + '%';
        
        // Random animation delay and duration
        confetti.style.animationDelay = Math.random() * 3 + 's';
        confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
        
        container.appendChild(confetti);
    }
    
    // Remove confetti after animation completes
    setTimeout(() => {
        container.innerHTML = '';
    }, 6000);
}

function returnToLobby() {
    console.log('🏠 Returning to lobby...');
    
    // Hide the end-game modal
    const endGameModal = document.getElementById('end-game-modal');
    if (endGameModal) {
        endGameModal.classList.add('hidden');
    }
    
    // Mark end-game as shown to prevent re-triggering for this finished game
    endGameShown = true;
    
    // Reset other game state (but keep endGameShown = true for this finished game)
    lobbyState = null;
    mySeat = null;
    isReady = false;
    hasPassed = false;
    window.selectedCards = [];
    previousTrickCards = [];
    
    // Show lobby section and hide game section
    document.getElementById('lobby-section').classList.remove('hidden');
    document.getElementById('game-section').classList.add('hidden');
    
    // Clear scoreboard
    const scoreboardRows = document.getElementById('scoreboard-rows');
    if (scoreboardRows) {
        scoreboardRows.innerHTML = '';
    }
    
    // Emit join-lobby to get fresh lobby state
    if (socket && socket.connected) {
        socket.emit('join-lobby');
    }
    
    showSuccessMessage('Returned to lobby. Ready for a new game!');
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
    
    // Video toggle button handler
    document.getElementById('toggle-video-btn').addEventListener('click', function() {
        if (mySeat === null) {
            showErrorMessage('You must take a seat first to enable video');
            return;
        }
        
        if (videoManager) {
            if (videoManager.isVideoEnabled) {
                videoManager.disableVideo();
            } else {
                videoManager.enableVideo();
            }
        }
    });
    
    // Stop game button handler
    const stopGameBtn = document.getElementById('stop-game-btn');
    if (stopGameBtn) {
        stopGameBtn.addEventListener('click', function() {
            if (confirm('Are you sure you want to stop and save the current game? All players will return to the lobby.')) {
                socket.emit('stop-game', {
                    reason: 'Lobby leader stopped the game'
                });
            }
        });
    }

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

    // Initialize card animation manager
    window.cardAnimationManager = new CardAnimationManager();

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
    
    // End Game modal wiring
    const endGameModal = document.getElementById('end-game-modal');
    const endGameBackdrop = document.getElementById('end-game-modal-backdrop');
    const returnToLobbyBtn = document.getElementById('return-to-lobby-btn');
    
    if (returnToLobbyBtn) {
        returnToLobbyBtn.addEventListener('click', returnToLobby);
    }
    
    if (endGameBackdrop) {
        endGameBackdrop.addEventListener('click', returnToLobby);
    }
    
    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (endGameModal && !endGameModal.classList.contains('hidden')) {
                returnToLobby();
            } else if (historyModal && !historyModal.classList.contains('hidden')) {
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
            
            // Check if game can be resumed (saved or abandoned state)
            const canResume = game.state === 'saved' || game.state === 'abandoned';
            
            gameEl.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid rgba(255,255,255,0.04);">
                    <div>
                        <strong>${date}</strong><br>
                        <small>${game.state}</small>
                    </div>
                    <div style="flex:1;text-align:center;color:#ddd;">${scores}</div>
                    <div style="width:${currentUser && currentUser.isAdmin ? '320px' : '280px'};text-align:right;">
                        <button class="btn small" data-game-id="${game.gameId}">Details</button>
                        ${canResume ? `<button class="btn success small" data-resume-game-id="${game.gameId}" style="margin-left:8px;">Resume</button>` : ''}
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

            // Wire resume button
            const resumeBtn = gameEl.querySelector('button[data-resume-game-id]');
            if (resumeBtn) {
                resumeBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const gid = resumeBtn.getAttribute('data-resume-game-id');
                    await handleResumeGame(gid);
                });
            }

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

// Socket event handlers for new events
function setupNewSocketEvents() {
    // Handle lobby leader changes
    socket.on('lobby-leader-changed', function(data) {
        console.log('Lobby leader changed:', data);
        showSuccessMessage(`Lobby leader changed from seat ${data.oldLeader + 1} to seat ${data.newLeader + 1}: ${data.reason}`);
        // Update the display (this will be called when lobby state updates)
    });

    // Handle game stopped
    socket.on('game-stopped', function(data) {
        console.log('Game stopped:', data);
        showSuccessMessage(`Game stopped by ${data.stoppedBy}: ${data.reason}`);
        endGameShown = false; // Reset for next game
    });

    
    // Handle return to lobby
    socket.on('return-to-lobby', function(data) {
        console.log('Returning to lobby:', data);
        
        // Reset game state (similar to returnToLobby function)
        gameState = null;
        endGameShown = false;
        lobbyState = null;
        mySeat = null;
        isReady = false;
        hasPassed = false;
        window.selectedCards = [];
        previousTrickCards = [];
        
        // Show lobby section and hide game section
        document.getElementById('lobby-section').classList.remove('hidden');
        document.getElementById('game-section').classList.add('hidden');
        
        // Clear any game-specific UI elements
        const gameBoard = document.getElementById('game-board');
        if (gameBoard) {
            gameBoard.innerHTML = '';
        }
        
        // Clear scoreboard
        const scoreboardRows = document.getElementById('scoreboard-rows');
        if (scoreboardRows) {
            scoreboardRows.innerHTML = '';
        }
        
        // Emit join-lobby to get fresh lobby state (like normal game end)
        if (socket && socket.connected) {
            socket.emit('join-lobby');
        }
        
        showSuccessMessage(data.message);
    });

    // Handle game abandoned
    socket.on('game-abandoned', function(data) {
        console.log('Game abandoned:', data);
        showErrorMessage(`Game abandoned: ${data.reason}`);
        showLobbySection();
        endGameShown = false; // Reset for next game
    });

    // Handle player kicked
    socket.on('player-kicked', function(data) {
        console.log('Player kicked:', data);
        showSuccessMessage(`Player kicked by ${data.kickedBy}: ${data.reason}`);
    });

    // Handle being kicked
    socket.on('kicked-from-game', function(data) {
        console.log('You were kicked:', data);
        showErrorMessage(`You were kicked from the game by ${data.kickedBy}: ${data.reason}`);
        showLobbySection();
        mySeat = null;
        isReady = false;
    });

    // Handle game paused
    socket.on('game-paused', function(data) {
        console.log('Game paused:', data);
        showErrorMessage(`Game paused: ${data.reason}. ${data.will_abandon_in ? 'Will be abandoned in ' + data.will_abandon_in + '.' : ''}`);
    });

    // Handle game resumed
    socket.on('game-resumed', function(data) {
        console.log('Game resumed:', data);
        showSuccessMessage(`Game resumed: ${data.reason}`);
    });

    // Handle player disconnection with countdown
    socket.on('playerDisconnected', function(data) {
        console.log('Player disconnected:', data);
        if (lobbyState) {
            // Start countdown timer for 1 minute
            startDisconnectCountdown(1);
            
            showErrorMessage(`${data.playerId || 'A player'} disconnected. Game will end in 1 minute if they don't return.`);
        }
    });

    // Handle player reconnection
    socket.on('playerReconnected', function(data) {
        console.log('Player reconnected:', data);
        if (lobbyState) {
            // Stop countdown timer
            stopDisconnectCountdown();
            
            showSuccessMessage(`${data.playerId || 'A player'} reconnected!`);
        }
    });

    // Handle countdown updates from server
    socket.on('countdownUpdate', function(data) {
        console.log('Countdown update:', data);
        if (data.timeLeft > 0) {
            startDisconnectCountdown(data.timeLeft / 60000); // Convert ms to minutes
        } else {
            stopDisconnectCountdown();
        }
    });
}

// Handle resume game action
async function handleResumeGame(gameId) {
    try {
        const response = await fetch(`/hearts/api/resume-game/${gameId}`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        if (!response.ok || result.error) {
            // Show error message with details
            const errorMsg = result.details || result.error || 'Failed to resume game';
            showErrorMessage(errorMsg);
            return;
        }

        // Success - close history modal and show success message
        const historyModal = document.getElementById('history-modal');
        if (historyModal) {
            historyModal.classList.add('hidden');
        }

        showSuccessMessage('Game resumed successfully!');
        
        // Emit join-lobby to get the updated game state
        if (socket) {
            socket.emit('join-lobby');
        }

    } catch (error) {
        console.error('Resume game error:', error);
        showErrorMessage('Failed to resume game');
    }
}

// Call setup when socket connects
if (typeof socket !== 'undefined' && socket.connected) {
    setupNewSocketEvents();
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
