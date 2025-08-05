const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    path: '/socket.io/', // Socket.IO will be served at /socket.io/ (after /hearts/ is stripped)
    cors: {
        origin: process.env.FRONTEND_URL || "https://kl-pi.tail9f5728.ts.net",
        methods: ["GET", "POST"],
        credentials: true
    },
    serveClient: true, // Ensure Socket.IO serves its client
    allowEIO3: true // Better compatibility
});

// Add debugging for all HTTP requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl} - User-Agent: ${req.get('User-Agent')?.substring(0, 50)}`);
    if (req.originalUrl.startsWith('/socket.io/')) {
        console.log('Socket.IO request detected:', req.originalUrl);
    }
    next();
});

// Import middleware and routes
const { requireAuth, requireApproved } = require('./middleware/auth');
const gameManager = require('./services/gameManager');
const socketHandler = require('./services/socketHandler');

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || "https://kl-pi.tail9f5728.ts.net",
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());

// Initialize Socket.IO handler
socketHandler.initialize(io);

// Add Socket.IO debugging
io.on('connection', (socket) => {
    console.log('Socket.IO: New connection attempt from:', socket.handshake.address);
    console.log('Socket.IO: Headers:', JSON.stringify(socket.handshake.headers, null, 2));
});

io.engine.on('connection_error', (err) => {
    console.log('Socket.IO Engine Error:', err.req);
    console.log('Socket.IO Engine Error Code:', err.code);
    console.log('Socket.IO Engine Error Message:', err.message);
    console.log('Socket.IO Engine Error Context:', err.context);
});

// Serve static files (Vue.js build)
app.use('/static', express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, path) => {
        // Block direct access to HTML files
        if (path.endsWith('.html')) {
            res.status(403).send('Access denied');
            return;
        }
    }
}));

// Routes
app.get('/', requireAuth, requireApproved, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Play card endpoint (HTTP, not socket)
app.post('/play-card', requireAuth, async (req, res) => {
    try {
        const user = req.user;
        const { card } = req.body;
        if (!user || !card) {
            return res.status(400).json({ success: false, error: 'Missing user or card' });
        }
        // Simulate a socket for the HTTP user
        const fakeSocket = {
            user,
            emit: (event, data) => {
                // Optionally, collect error for HTTP response
                if (event === 'error') {
                    fakeSocket._error = data;
                }
            }
        };
        // Call the socket handler's play card logic
        await socketHandler.handlePlayCard(fakeSocket, { card });
        if (fakeSocket._error) {
            return res.status(400).json({ success: false, error: fakeSocket._error.message });
        }
        // Respond with success (actual state will be sent via sockets)
        return res.json({ success: true });
    } catch (err) {
        console.error('Error in /hearts/play-card:', err);
        return res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Make io available in req.app for HTTP endpoints
app.set('io', io);

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'hearts-game-service',
        activeGames: gameManager.getActiveGameCount(),
        activePlayers: gameManager.getActivePlayerCount()
    });
});

// API Routes (with authentication)
app.use('/api', requireAuth, requireApproved, require('./routes/api'));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Hearts service error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler (exclude Socket.IO routes)
app.use('*', (req, res, next) => {
    console.log('Catch-all route hit:', req.originalUrl, req.method);
    if (req.originalUrl.startsWith('/socket.io/')) {
        console.log('Allowing Socket.IO request to pass through');
        return next();
    }
    console.log('Redirecting non-Socket.IO request to frontend');
    res.redirect(process.env.FRONTEND_URL || 'https://kl-pi.tail9f5728.ts.net');
});

const PORT = process.env.PORT || 3004;

server.listen(PORT, () => {
    console.log(`Hearts Game Service running on port ${PORT}`);
    console.log(`Frontend URL: ${process.env.FRONTEND_URL}`);
    console.log(`Auth Service: ${process.env.AUTH_SERVICE_URL}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    server.close(() => {
        console.log('Hearts Game Service shut down');
        process.exit(0);
    });
});
