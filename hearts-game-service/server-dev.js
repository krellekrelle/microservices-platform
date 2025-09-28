const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cookieParser = require('cookie-parser');

// Mock database module for development
const mockDb = {
    query: async (text, params) => {
        console.log('🗄️ Mock DB query:', text, params || '');
        // Return empty results for all queries
        return { rows: [], rowCount: 0 };
    },
    pool: {
        query: async (text, params) => {
            console.log('🗄️ Mock DB pool query:', text, params || '');
            return { rows: [], rowCount: 0 };
        }
    }
};

// Replace the database module before importing socketHandler
require.cache[require.resolve('./db/database')] = {
    exports: mockDb,
    loaded: true,
    filename: require.resolve('./db/database')
};

console.log('🗄️ Development mode - Database mocked');

// Import game services AFTER mocking database
const socketHandler = require('./services/socketHandler');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    path: '/hearts/socket.io/',
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(express.json());
app.use(cookieParser());

// Mock user for development (no auth)
app.use((req, res, next) => {
    req.user = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        status: 'approved',
        isAdmin: true,
        profilePicture: 'https://via.placeholder.com/96'
    };
    next();
});

console.log('🚀 Development mode - Auth disabled, using mock user');

// Vue.js built assets (served without auth for loading)
app.use('/dist', express.static(path.join(__dirname, 'public/dist')));
app.use('/hearts/dist', express.static(path.join(__dirname, 'public/dist')));

// Handle /hearts prefixed routes (simulate Caddy path stripping)
app.use('/hearts/sounds', express.static(path.join(__dirname, 'public/sounds')));
app.use('/hearts/icons', express.static(path.join(__dirname, 'public/icons')));
app.use('/hearts/favicon.svg', express.static(path.join(__dirname, 'public/favicon.svg')));
app.use('/hearts/legacy-sound-manager.js', express.static(path.join(__dirname, 'public/legacy-sound-manager.js')));

// Main route - serve Vue.js app (no authentication in dev)
app.get('/', (req, res) => {
    console.log('📱 Serving Vue.js app from /dist/index.html');
    res.sendFile(path.join(__dirname, 'public/dist/index.html'));
});

// Legacy route (for fallback)
app.get('/legacy', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html.backup'));
});

// API routes first (before catch-all)
// Serve specific static assets (not index.html to avoid conflict)
app.use('/hearts-game.css', express.static(path.join(__dirname, 'public/hearts-game.css')));
app.use('/hearts-game.js', express.static(path.join(__dirname, 'public/hearts-game.js')));
app.use('/legacy-sound-manager.js', express.static(path.join(__dirname, 'public/legacy-sound-manager.js')));
app.use('/sounds', express.static(path.join(__dirname, 'public/sounds')));
app.use('/icons', express.static(path.join(__dirname, 'public/icons')));

// Mock Socket.IO authentication for development
const mockSocketAuth = (socket, next) => {
    // Mock user for development
    socket.user = {
        id: Math.floor(Math.random() * 1000), // Random user ID for testing
        name: `Test User ${Math.floor(Math.random() * 100)}`,
        email: 'test@example.com',
        status: 'approved',
        isAdmin: true,
        profilePicture: 'https://via.placeholder.com/96'
    };
    console.log('🎮 Mock authentication for socket:', socket.user.name);
    next();
};

// Apply mock authentication instead of real auth
io.use(mockSocketAuth);

// Initialize Socket.IO handler manually to skip its auth middleware
socketHandler.io = io;

io.on('connection', (socket) => {
    console.log('Socket.IO: New connection from:', socket.handshake.address);
    socketHandler.handleConnection(socket);
    // Handler sets up all event listeners and mock user
});

// Play card endpoint (HTTP, not socket)
app.post('/play-card', async (req, res) => {
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
        res.json({ success: true });
    } catch (error) {
        console.error('Error in play-card endpoint:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Catch-all route - serve Vue.js app for any unmatched routes (must be last!)
app.get('*', (req, res) => {
    console.log(`🔄 Catch-all route serving Vue.js app for: ${req.path}`);
    res.sendFile(path.join(__dirname, 'public/dist/index.html'));
});

const PORT = process.env.PORT || 3004;

server.listen(PORT, () => {
    console.log(`🎮 Hearts Game Service (DEV MODE) running on http://localhost:${PORT}`);
    console.log(`📱 Vue.js app available at: http://localhost:${PORT}`);
    console.log(`🕹️ Legacy version available at: http://localhost:${PORT}/legacy`);
    console.log('🚀 No authentication required - ready for testing!');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('Shutting down server...');
    server.close(() => {
        process.exit(0);
    });
});