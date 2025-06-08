// This file serves as the entry point for Render.com
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { GameSession, GAME_CONSTANTS } = require('./src/game/gameLogic');
const { GameStore, logger } = require('./src/config/redis');

// Express App Setup
const app = express();
const httpServer = createServer(app);

// Trust proxy - required for Railway deployment
app.set('trust proxy', 1);

// Get the frontend URL from environment variable or use default
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://beatmatch-delta.vercel.app';
const PORT = process.env.PORT || 8080;
console.log('Frontend URL:', FRONTEND_URL);
console.log('Server Port:', PORT);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false
});

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
app.use(limiter);

// Add headers to allow WebSocket upgrade
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

// Basic root route for simple health checks
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'BeatMatch Game Server is running'
  });
});

// Health check endpoint
app.get(['/health', '/healh'], async (req, res) => {
  try {
    // Check Redis connection
    const redisConnected = await GameStore.isRedisConnected();
    
    // Get active games only if Redis is connected
    const games = redisConnected ? await GameStore.getActiveGames() : [];
    
    res.status(200).json({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      frontendUrl: FRONTEND_URL,
      redis: {
        connected: redisConnected,
        activeGames: games.length
      },
      connectedClients: io.engine.clientsCount
    });
  } catch (error) {
    logger.error('Health check error:', error);
    // Still return 200 for the health check, but include error details
    res.status(200).json({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      redis: {
        connected: false,
        error: error.message
      }
    });
  }
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

app.post('/api/games', async (req, res) => {
  try {
    const { roomId, hostName } = req.body;
    if (!roomId || !hostName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existingGame = await GameStore.getGame(roomId);
    if (existingGame) {
      return res.status(400).json({ error: 'Room ID already exists' });
    }

    const game = new GameSession(roomId, hostName);
    await GameStore.saveGame(roomId, game);
    
    res.status(201).json(game);
  } catch (error) {
    logger.error('Error creating game:', error);
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
io.on('connection', async (socket) => {
  logger.info('New client connected:', socket.id);

  socket.on('join-game', async (data) => {
    try {
      const game = await GameStore.getGame(data.roomId);
      
      if (!game || !game.isActive) {
        socket.emit('error', { message: 'Game not found or inactive' });
        return;
      }

      game.addPlayer(socket.id, data.playerName);
      await GameStore.saveGame(data.roomId, game);
      
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
      logger.error('Error joining game:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  socket.on('start-game', async (data) => {
    try {
      const game = await GameStore.getGame(data.roomId);
      if (!game || !game.isActive) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      if (game.players.length < 2) {
        socket.emit('error', { message: 'Not enough players to start' });
        return;
      }

      const roundData = await game.startNewRound();
      await GameStore.saveGame(data.roomId, game);
      
      io.to(data.roomId).emit('round-started', roundData);
    } catch (error) {
      logger.error('Error starting game:', error);
      socket.emit('error', { message: 'Failed to start game' });
    }
  });

  socket.on('submit-answer', async (data) => {
    try {
      const game = await GameStore.getGame(data.roomId);
      if (!game || !game.isActive) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const result = game.submitAnswer(socket.id, data.answer);
      if (!result) {
        socket.emit('error', { message: 'Invalid answer submission' });
        return;
      }

      io.to(data.roomId).emit('answer-submitted', result);

      if (game.isRoundComplete()) {
        const roundSummary = game.getRoundSummary();
        io.to(data.roomId).emit('round-ended', roundSummary);

        // Start next round or end game
        if (game.currentRound >= game.totalRounds) {
          const gameResults = game.endGame();
          io.to(data.roomId).emit('game-ended', gameResults);
          
          // Clean up the game after 1 hour
          setTimeout(async () => {
            await GameStore.deleteGame(data.roomId);
            logger.info(`Cleaned up finished game: ${data.roomId}`);
          }, 3600000);
        } else {
          const nextRoundData = await game.startNewRound();
          io.to(data.roomId).emit('round-started', nextRoundData);
        }
      }

      await GameStore.saveGame(data.roomId, game);
    } catch (error) {
      logger.error('Error submitting answer:', error);
      socket.emit('error', { message: 'Failed to submit answer' });
    }
  });

  socket.on('disconnect', async () => {
    try {
      logger.info('Client disconnected:', socket.id);
      
      // Find and update any games this player was in
      const games = await GameStore.getAllGames();
      for (const game of games) {
        if (game.removePlayer(socket.id)) {
          // If no players left, clean up the game
          await GameStore.deleteGame(game.roomId);
          logger.info(`Game ended due to all players leaving: ${game.roomId}`);
        } else {
          // Update the game with the player removed
          await GameStore.saveGame(game.roomId, game);
          io.to(game.roomId).emit('player-left', {
            players: game.players,
            gameStatus: game.isActive ? 'active' : 'ended'
          });
        }
      }
    } catch (error) {
      logger.error('Error handling disconnect:', error);
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Server error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    query: req.query
  });
  
  // Don't expose error details in production
  const response = process.env.NODE_ENV === 'production' 
    ? { error: 'Internal server error' }
    : { error: err.message, stack: err.stack };
    
  res.status(500).json(response);
});

// Start server
httpServer.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Frontend URL: ${FRONTEND_URL}`);
  
  // Log important environment variables (without sensitive values)
  logger.info('Environment Configuration:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    REDIS_URL: process.env.REDIS_URL ? 'Set' : 'Not Set',
    REDIS_HOST: process.env.REDIS_HOST ? 'Set' : 'Not Set',
    FRONTEND_URL: process.env.FRONTEND_URL
  });
}); 