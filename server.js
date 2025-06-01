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
const PORT = process.env.PORT || 3001;
console.log('Frontend URL:', FRONTEND_URL);
console.log('Server Port:', PORT);

// Socket.IO Setup with CORS
const io = new Server(httpServer, {
  cors: {
    origin: FRONTEND_URL,
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
  origin: FRONTEND_URL,
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 200,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Add headers to allow WebSocket upgrade
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    frontendUrl: FRONTEND_URL,
    activeGames: games.size,
    connectedClients: io.engine.clientsCount
  });
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
          .stats {
            margin: 20px 0;
            padding: 15px;
            background: #e3f2fd;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎮 BeatMatch Game Server</h1>
          <div class="status">
            ✅ Server is running!
          </div>
          <div class="stats">
            <h3>Server Stats:</h3>
            <p>Active Games: ${games.size}</p>
            <p>Connected Clients: ${io.engine.clientsCount}</p>
            <p>Environment: ${process.env.NODE_ENV || 'development'}</p>
            <p>Frontend URL: ${FRONTEND_URL}</p>
          </div>
          <div class="endpoints">
            <h3>Available Endpoints:</h3>
            <div class="endpoint">GET /health - Check server health</div>
            <div class="endpoint">GET /api/games - List active games</div>
            <div class="endpoint">POST /api/games - Create a new game</div>
            <div class="endpoint">GET /api/games/:roomId - Get game details</div>
          </div>
        </div>
      </body>
    </html>
  `);
});

// Game routes
app.get('/api/games', (req, res) => {
  try {
    const activeGames = Array.from(games.values())
      .filter(game => game.isActive)
      .map(game => ({
        roomId: game.roomId,
        playerCount: game.players.length,
        currentRound: game.currentRound,
        totalRounds: game.totalRounds,
        startedAt: game.startedAt
      }));
    res.json(activeGames);
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/games', (req, res) => {
  try {
    const { roomId, hostName } = req.body;
    if (!roomId || !hostName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

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
    console.error('Error creating game:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

app.get('/api/games/:roomId', (req, res) => {
  try {
    const game = games.get(req.params.roomId);
    if (!game || !game.isActive) {
      return res.status(404).json({ error: 'Game not found' });
    }
    res.json(game);
  } catch (error) {
    console.error('Error fetching game:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🟢 New client connected:', socket.id);
  console.log(`📊 Total connected clients: ${io.engine.clientsCount}`);

  // Handle transport change
  socket.conn.on('upgrade', (transport) => {
    console.log('🔄 Connection upgraded to:', transport.name);
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
            game.endedAt = new Date();
            console.log(`🏁 Game ended - Room: ${roomId} (no players remaining)`);
            // Clean up inactive games after 1 hour
            setTimeout(() => {
              if (!game.isActive) {
                games.delete(roomId);
                console.log(`🧹 Cleaned up inactive game: ${roomId}`);
              }
            }, 3600000);
          }
          
          io.to(roomId).emit('player-left', { 
            players: game.players,
            gameStatus: game.isActive ? 'active' : 'ended'
          });
          break;
        }
      }
    } catch (error) {
      console.error('❌ Disconnect handling error:', error);
    }
  });

  socket.on('join-game', async (data) => {
    try {
      console.log(`🎮 Player joining game - Room: ${data.roomId}, Player: ${data.playerName}`);
      const game = games.get(data.roomId);
      
      if (!game || !game.isActive) {
        socket.emit('error', { message: 'Game not found or inactive' });
        return;
      }

      if (game.players.length >= 4) {
        socket.emit('error', { message: 'Game room is full' });
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

      await socket.join(data.roomId);
      io.to(data.roomId).emit('player-joined', {
        players: game.players,
        gameState: {
          currentRound: game.currentRound,
          totalRounds: game.totalRounds,
          startedAt: game.startedAt
        }
      });
    } catch (error) {
      console.error('❌ Error joining game:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  socket.on('start-game', (data) => {
    try {
      const game = games.get(data.roomId);
      if (!game || !game.isActive) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      if (game.players.length < 2) {
        socket.emit('error', { message: 'Not enough players to start' });
        return;
      }

      game.currentRound = 1;
      game.roundStartTime = Date.now();
      
      io.to(data.roomId).emit('game-started', {
        currentRound: game.currentRound,
        players: game.players,
        startTime: game.roundStartTime
      });
    } catch (error) {
      console.error('❌ Error starting game:', error);
      socket.emit('error', { message: 'Failed to start game' });
    }
  });

  socket.on('submit-answer', (data) => {
    try {
      const game = games.get(data.roomId);
      if (!game || !game.isActive) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const player = game.players.find(p => p.id === socket.id);
      if (!player) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      const answerTime = Date.now() - game.roundStartTime;
      const isCorrect = data.answer.isCorrect;

      // Update player score
      if (isCorrect) {
        const timeBonus = Math.max(0, GAME_CONFIG.SCORING.TIME_BONUS_MAX - Math.floor(answerTime / 1000));
        const streakBonus = player.streak * GAME_CONFIG.SCORING.STREAK_BONUS;
        player.score += GAME_CONFIG.SCORING.BASE_POINTS + timeBonus + streakBonus;
        player.correctAnswers++;
        player.streak++;
      } else {
        player.streak = 0;
      }

      player.lastAnswerTime = Date.now();

      // Check if all players have answered
      const allAnswered = game.players.every(p => p.lastAnswerTime > game.roundStartTime);
      
      if (allAnswered) {
        game.currentRound++;
        game.roundStartTime = Date.now();
        
        if (game.currentRound > game.totalRounds) {
          const winner = game.players.reduce((prev, current) => 
            (prev.score > current.score) ? prev : current
          );
          
          game.isActive = false;
          game.endedAt = new Date();
          
          io.to(data.roomId).emit('game-ended', {
            winner,
            players: game.players,
            finalScores: game.players.map(p => ({
              name: p.name,
              score: p.score,
              correctAnswers: p.correctAnswers
            }))
          });
          
          // Clean up the game after 1 hour
          setTimeout(() => {
            games.delete(data.roomId);
            console.log(`🧹 Cleaned up finished game: ${data.roomId}`);
          }, 3600000);
        } else {
          io.to(data.roomId).emit('round-ended', {
            nextRound: game.currentRound,
            players: game.players,
            roundStartTime: game.roundStartTime
          });
        }
      } else {
        io.to(data.roomId).emit('answer-submitted', {
          playerId: socket.id,
          playerName: player.name,
          isCorrect,
          score: player.score
        });
      }
    } catch (error) {
      console.error('❌ Error submitting answer:', error);
      socket.emit('error', { message: 'Failed to submit answer' });
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Frontend URL: ${FRONTEND_URL}`);
}); 