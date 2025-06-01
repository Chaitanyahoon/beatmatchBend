import { Server, Socket } from 'socket.io';
import { GameModel } from '../models/Game';

interface JoinGameData {
  roomId: string;
  playerName: string;
}

interface SubmitAnswerData {
  roomId: string;
  answer: {
    isCorrect: boolean;
  };
}

interface StartGameData {
  roomId: string;
}

export const setupSocketHandlers = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id);

    // Join game room
    socket.on('join-game', async (data: JoinGameData) => {
      try {
        const game = await GameModel.findOne({ roomId: data.roomId, isActive: true });
        if (!game) {
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        // Add player to game
        game.players.push({
          id: socket.id,
          name: data.playerName,
          score: 0,
          correctAnswers: 0
        });
        await game.save();

        // Join socket room
        socket.join(data.roomId);
        io.to(data.roomId).emit('player-joined', { players: game.players });
      } catch (error) {
        socket.emit('error', { message: 'Failed to join game' });
      }
    });

    // Submit answer
    socket.on('submit-answer', async (data: SubmitAnswerData) => {
      try {
        const game = await GameModel.findOne({ roomId: data.roomId, isActive: true });
        if (!game) return;

        // Update player score
        const player = game.players.find(p => p.id === socket.id);
        if (player) {
          player.score += data.answer.isCorrect ? 100 : 0;
          player.correctAnswers += data.answer.isCorrect ? 1 : 0;
          await game.save();
        }

        io.to(data.roomId).emit('answer-submitted', {
          playerId: socket.id,
          players: game.players
        });
      } catch (error) {
        socket.emit('error', { message: 'Failed to submit answer' });
      }
    });

    // Start game
    socket.on('start-game', async (data: StartGameData) => {
      try {
        const game = await GameModel.findOne({ roomId: data.roomId, isActive: true });
        if (!game) return;

        game.currentRound = 1;
        await game.save();

        io.to(data.roomId).emit('game-started', { currentRound: 1 });
      } catch (error) {
        socket.emit('error', { message: 'Failed to start game' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      console.log('Client disconnected:', socket.id);
      try {
        const game = await GameModel.findOne({
          'players.id': socket.id,
          isActive: true
        });
        
        if (game) {
          game.players = game.players.filter(p => p.id !== socket.id);
          if (game.players.length === 0) {
            game.isActive = false;
          }
          await game.save();
          io.to(game.roomId).emit('player-left', { players: game.players });
        }
      } catch (error) {
        console.error('Error handling disconnection:', error);
      }
    });
  });
}; 