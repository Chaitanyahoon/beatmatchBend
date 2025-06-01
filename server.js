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
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
    transports: ['websocket', 'polling']
  },
  allowEIO3: true // Allow Engine.IO version 3 for better compatibility
});

// Middleware
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
app.use(express.json());

// Routes
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

// Socket.IO handlers
io.on('connection', (socket) => {
  console.log('🟢 New client connected:', socket.id);
  console.log(`📊 Total connected clients: ${io.engine.clientsCount}`);

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

  socket.on('disconnect', async () => {
    console.log(`🔴 Client disconnected: ${socket.id}`);
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
});

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Accepting requests from: ${FRONTEND_URL}`);
}); 