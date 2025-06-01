import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  Player,
  GameState
} from './types';
import { GameManager } from './services/GameManager';
import { logger } from './utils/logger';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const gameManager = new GameManager(io);

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());

// API Routes
app.post('/api/games', (req, res) => {
  try {
    const { roomId, hostName } = req.body;
    const hostId = uuidv4();
    
    const room = gameManager.createRoom(roomId, hostId);
    if (!room) {
      return res.status(400).json({ error: 'Failed to create game room' });
    }

    res.status(201).json({ roomId: room.id, hostId });
  } catch (error) {
    logger.error('Error creating game room:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Socket.IO Connection Handling
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  socket.on('join-game', ({ roomId, playerName }) => {
    try {
      const playerId = uuidv4();
      const player: Player = {
        id: playerId,
        name: playerName,
        score: 0,
        streak: 0,
        correctAnswers: 0,
        isHost: false,
        socketId: socket.id,
        lastActivity: Date.now()
      };

      const room = gameManager.addPlayer(roomId, player);
      if (!room) {
        socket.emit('error', { message: 'Failed to join game room' });
        return;
      }

      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.playerId = playerId;

      io.to(roomId).emit('player-joined', {
        players: room.players,
        room
      });
    } catch (error) {
      logger.error('Error joining game:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  socket.on('start-game', ({ roomId }) => {
    try {
      const room = gameManager.startGame(roomId);
      if (!room || !room.currentSong) {
        socket.emit('error', { message: 'Failed to start game' });
        return;
      }

      io.to(roomId).emit('game-started', {
        currentRound: room.currentRound,
        song: room.currentSong
      });
    } catch (error) {
      logger.error('Error starting game:', error);
      socket.emit('error', { message: 'Failed to start game' });
    }
  });

  socket.on('submit-answer', ({ roomId, answer }) => {
    try {
      const room = gameManager.submitAnswer(roomId, answer);
      if (!room) {
        socket.emit('error', { message: 'Failed to submit answer' });
        return;
      }

      io.to(roomId).emit('answer-submitted', {
        players: room.players,
        room
      });
    } catch (error) {
      logger.error('Error submitting answer:', error);
      socket.emit('error', { message: 'Failed to submit answer' });
    }
  });

  socket.on('disconnect', () => {
    try {
      const { roomId, playerId } = socket.data;
      if (roomId && playerId) {
        gameManager.removePlayer(roomId, playerId);
        const room = gameManager.getRoomById(roomId);
        if (room) {
          io.to(roomId).emit('player-joined', {
            players: room.players,
            room
          });
        }
      }
      logger.info(`Socket disconnected: ${socket.id}`);
    } catch (error) {
      logger.error('Error handling disconnect:', error);
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
}); 