// This file serves as the entry point for Render.com
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

// In-memory game storage
const games = new Map();

// Express App Setup
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'https://beatmatch-delta.vercel.app',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://beatmatch-delta.vercel.app',
  credentials: true
}));
app.use(express.json());

// Routes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
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
        correctAnswers: 0
      }],
      currentRound: 0,
      totalRounds: 5,
      isActive: true,
      startedAt: new Date(),
      endedAt: null
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
  console.log('Client connected:', socket.id);

  socket.on('join-game', async (data) => {
    try {
      const game = games.get(data.roomId);
      if (!game || !game.isActive) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      game.players.push({
        id: socket.id,
        name: data.playerName,
        score: 0,
        correctAnswers: 0
      });

      socket.join(data.roomId);
      io.to(data.roomId).emit('player-joined', { players: game.players });
    } catch (error) {
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  socket.on('submit-answer', async (data) => {
    try {
      const game = games.get(data.roomId);
      if (!game || !game.isActive) return;

      const player = game.players.find(p => p.id === socket.id);
      if (player) {
        player.score += data.answer.isCorrect ? 100 : 0;
        player.correctAnswers += data.answer.isCorrect ? 1 : 0;
      }

      io.to(data.roomId).emit('answer-submitted', {
        playerId: socket.id,
        players: game.players
      });
    } catch (error) {
      socket.emit('error', { message: 'Failed to submit answer' });
    }
  });

  socket.on('start-game', async (data) => {
    try {
      const game = games.get(data.roomId);
      if (!game || !game.isActive) return;

      game.currentRound = 1;
      io.to(data.roomId).emit('game-started', { currentRound: 1 });
    } catch (error) {
      socket.emit('error', { message: 'Failed to start game' });
    }
  });

  socket.on('disconnect', async () => {
    console.log('Client disconnected:', socket.id);
    try {
      // Find game where this socket is a player
      for (const [roomId, game] of games.entries()) {
        const playerIndex = game.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          game.players = game.players.filter(p => p.id !== socket.id);
          if (game.players.length === 0) {
            game.isActive = false;
          }
          io.to(roomId).emit('player-left', { players: game.players });
          break;
        }
      }
    } catch (error) {
      console.error('Error handling disconnection:', error);
    }
  });
});

// Start server
const PORT = process.env.PORT || 8000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Accepting requests from: ${process.env.FRONTEND_URL || 'https://beatmatch-delta.vercel.app'}`);
}); 