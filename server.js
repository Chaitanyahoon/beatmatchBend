// This file serves as the entry point for Render.com
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

// In-memory game storage
const games = new Map();

// Game Configuration
const GAME_CONFIG = {
  TOTAL_ROUNDS: 10,
  SCORING: {
    BASE_POINTS: 100,
    TIME_BONUS_MAX: 50,
    STREAK_BONUS: 25,
    ROUND_COMPLETION_BONUS: 50
  }
};

// Express App Setup
const app = express();
const httpServer = createServer(app);

// Get the frontend URL from environment variable or use default
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://beatmatch-delta.vercel.app';
console.log('Frontend URL:', FRONTEND_URL);

// Socket.IO Setup with CORS
const io = new Server(httpServer, {
  cors: {
    origin: '*', // More permissive for testing
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  allowEIO3: true,
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e8,
  path: '/socket.io/',
  serveClient: false,
  cookie: false
});

// Middleware
app.use(cors({
  origin: '*', // More permissive for testing
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 200,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Add headers to allow WebSocket upgrade
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

// Routes
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>BeatMatch Game Server</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            background: #f5f5f5;
          }
          .container {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          h1 { color: #2c3e50; }
          .status { 
            padding: 10px;
            border-radius: 4px;
            background: #e8f5e9;
            margin: 10px 0;
          }
          .endpoints {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
          }
          .endpoint {
            margin: 10px 0;
            font-family: monospace;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎮 BeatMatch Game Server</h1>
          <div class="status">
            ✅ Server is running!
          </div>
          <div class="endpoints">
            <h3>Available Endpoints:</h3>
            <div class="endpoint">GET /health - Check server health</div>
            <div class="endpoint">GET /api/games - List active games</div>
            <div class="endpoint">POST /api/games - Create a new game</div>
            <div class="endpoint">GET /api/games/:roomId - Get game details</div>
          </div>
          <p>Frontend URL: ${FRONTEND_URL}</p>
          <p>Environment: ${process.env.NODE_ENV || 'development'}</p>
        </div>
      </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    environment: process.env.NODE_ENV,
    frontendUrl: FRONTEND_URL
  });
});

app.get('/api/games', (req, res) => {
  const activeGames = Array.from(games.values())
    .filter(game => game.isActive);
  res.json(activeGames);
});

app.post('/api/games', (req, res) => {
  try {
    const { roomId, hostName } = req.body;
    if (games.has(roomId)) {
      return res.status(400).json({ error: 'Room ID already exists' });
    }

    const game = {
      roomId,
      players: [{
        id: 'host',
        name: hostName,
        score: 0,
        correctAnswers: 0,
        streak: 0,
        lastAnswerTime: null
      }],
      currentRound: 0,
      totalRounds: GAME_CONFIG.TOTAL_ROUNDS,
      isActive: true,
      startedAt: new Date(),
      endedAt: null,
      roundStartTime: null
    };

    games.set(roomId, game);
    res.status(201).json(game);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create game' });
  }
});

app.get('/api/games/:roomId', (req, res) => {
  const game = games.get(req.params.roomId);
  if (!game || !game.isActive) {
    return res.status(404).json({ error: 'Game not found' });
  }
  res.json(game);
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🟢 New client connected:', socket.id);
  console.log(`📊 Total connected clients: ${io.engine.clientsCount}`);
  console.log('🔌 Transport used:', socket.conn.transport.name);

  // Handle transport change
  socket.conn.on('upgrade', (transport) => {
    console.log('🔄 Connection upgraded to:', transport.name);
  });

  // Handle ping
  socket.conn.on('ping', () => {
    console.log('📍 Ping received from client:', socket.id);
  });

  // Handle packet
  socket.conn.on('packet', (packet) => {
    if (packet.type === 'error') {
      console.error('❌ Socket packet error:', packet.data);
    }
  });

  // Handle error
  socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`🔴 Client disconnected (${reason}):`, socket.id);
    try {
      for (const [roomId, game] of games.entries()) {
        const playerIndex = game.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          const player = game.players[playerIndex];
          console.log(`👋 Player left game - Room: ${roomId}, Player: ${player.name}`);
          game.players = game.players.filter(p => p.id !== socket.id);
          if (game.players.length === 0) {
            game.isActive = false;
            console.log(`🏁 Game ended - Room: ${roomId} (no players remaining)`);
          }
          io.to(roomId).emit('player-left', { players: game.players });
          break;
        }
      }
    } catch (error) {
      console.error('❌ Disconnect handling error:', error);
    }
  });

  socket.on('join-game', async (data) => {
    try {
      console.log(`🎮 Player joining game - Room: ${data.roomId}, Player: ${data.playerName}, SocketID: ${socket.id}`);
      const game = games.get(data.roomId);
      if (!game || !game.isActive) {
        console.log(`❌ Failed join attempt - Room ${data.roomId} not found or inactive`);
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      game.players.push({
        id: socket.id,
        name: data.playerName,
        score: 0,
        correctAnswers: 0,
        streak: 0,
        lastAnswerTime: null
      });

      socket.join(data.roomId);
      console.log(`✅ Player joined successfully - Room: ${data.roomId}, Players: ${game.players.length}`);
      io.to(data.roomId).emit('player-joined', { players: game.players });
    } catch (error) {
      console.error('❌ Join game error:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  socket.on('submit-answer', async (data) => {
    try {
      console.log(`📝 Answer submitted - Room: ${data.roomId}, Player: ${socket.id}`);
      const game = games.get(data.roomId);
      if (!game || !game.isActive) {
        console.log(`❌ Answer submission failed - Game not found or inactive`);
        return;
      }

      const player = game.players.find(p => p.id === socket.id);
      if (player) {
        const now = Date.now();
        let pointsEarned = 0;

        if (data.answer.isCorrect) {
          // Base points
          pointsEarned += GAME_CONFIG.SCORING.BASE_POINTS;

          // Time bonus (faster answers get more points)
          if (game.roundStartTime) {
            const timeElapsed = now - game.roundStartTime;
            const timeBonus = Math.max(0, GAME_CONFIG.SCORING.TIME_BONUS_MAX - Math.floor(timeElapsed / 1000));
            pointsEarned += timeBonus;
          }

          // Streak bonus
          player.streak++;
          if (player.streak > 1) {
            pointsEarned += GAME_CONFIG.SCORING.STREAK_BONUS * (player.streak - 1);
          }

          // Round completion bonus
          if (game.currentRound === game.totalRounds) {
            pointsEarned += GAME_CONFIG.SCORING.ROUND_COMPLETION_BONUS;
          }

          player.correctAnswers++;
        } else {
          player.streak = 0;
        }

        player.score += pointsEarned;
        player.lastAnswerTime = now;

        console.log(`✅ Score updated - Player: ${player.name}, Points Earned: ${pointsEarned}, New Score: ${player.score}`);
      }

      io.to(data.roomId).emit('answer-submitted', {
        playerId: socket.id,
        players: game.players,
        currentRound: game.currentRound,
        totalRounds: game.totalRounds
      });

      // Check if this was the last round
      if (game.currentRound === game.totalRounds) {
        game.isActive = false;
        game.endedAt = new Date();
        io.to(data.roomId).emit('game-ended', {
          players: game.players.sort((a, b) => b.score - a.score), // Sort by score
          winner: game.players.reduce((prev, current) => (prev.score > current.score) ? prev : current)
        });
      }
    } catch (error) {
      console.error('❌ Submit answer error:', error);
      socket.emit('error', { message: 'Failed to submit answer' });
    }
  });

  socket.on('start-game', async (data) => {
    try {
      console.log(`🎲 Starting game - Room: ${data.roomId}`);
      const game = games.get(data.roomId);
      if (!game || !game.isActive) {
        console.log(`❌ Start game failed - Game not found or inactive`);
        return;
      }

      game.currentRound++;
      game.roundStartTime = Date.now();

      if (game.currentRound > game.totalRounds) {
        game.isActive = false;
        game.endedAt = new Date();
        io.to(data.roomId).emit('game-ended', {
          players: game.players.sort((a, b) => b.score - a.score), // Sort by score
          winner: game.players.reduce((prev, current) => (prev.score > current.score) ? prev : current)
        });
        return;
      }

      console.log(`✅ Game started successfully - Room: ${data.roomId}, Round: ${game.currentRound}/${game.totalRounds}`);
      io.to(data.roomId).emit('game-started', { 
        currentRound: game.currentRound,
        totalRounds: game.totalRounds
      });
    } catch (error) {
      console.error('❌ Start game error:', error);
      socket.emit('error', { message: 'Failed to start game' });
    }
  });
});

// Production-specific configurations
if (process.env.NODE_ENV === 'production') {
  // Enable trust proxy if behind a reverse proxy (like on Render.com)
  app.set('trust proxy', 1);
  
  // Force secure WebSocket connections in production
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      // Remember original protocol
      req.socket.encrypted = true;
    }
    next();
  });
}

// Error handling for WebSocket upgrade
httpServer.on('upgrade', (req, socket, head) => {
  console.log('⚡ WebSocket upgrade requested');
  socket.on('error', (error) => {
    console.error('❌ WebSocket upgrade error:', error);
  });
});

// Error handling for undefined routes
app.use((req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>404 - Not Found</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            background: #f5f5f5;
            text-align: center;
          }
          .container {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          h1 { color: #e74c3c; }
          .back-link {
            color: #3498db;
            text-decoration: none;
            margin-top: 20px;
            display: inline-block;
          }
          .back-link:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>404 - Page Not Found</h1>
          <p>The requested URL ${req.url} was not found on this server.</p>
          <a href="/" class="back-link">← Go back to home</a>
        </div>
      </body>
    </html>
  `);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>500 - Server Error</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            background: #f5f5f5;
            text-align: center;
          }
          .container {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          h1 { color: #e74c3c; }
          .back-link {
            color: #3498db;
            text-decoration: none;
            margin-top: 20px;
            display: inline-block;
          }
          .back-link:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>500 - Server Error</h1>
          <p>Something went wrong on our end. Please try again later.</p>
          <a href="/" class="back-link">← Go back to home</a>
        </div>
      </body>
    </html>
  `);
});

// Start the server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🎮 Server running on port ${PORT}`);
  console.log(`🌐 Accepting connections from: ${FRONTEND_URL}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 WebSocket server enabled`);
}); 