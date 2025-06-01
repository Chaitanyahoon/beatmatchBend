import { Server } from 'socket.io';
import {
  GameRoom,
  Player,
  GameState,
  PlayerAnswer,
  GameSettings,
  SongQuestion
} from '../types';
import { generateSongQuestion } from '../utils/songUtils';
import { logger } from '../utils/logger';

export class GameManager {
  private rooms: Map<string, GameRoom>;
  private io: Server;
  private readonly defaultSettings: GameSettings = {
    maxPlayers: 4,
    roundDuration: 30000, // 30 seconds
    totalRounds: 5,
    questionTimeLimit: 15000 // 15 seconds to answer
  };

  constructor(io: Server) {
    this.rooms = new Map();
    this.io = io;
    this.startInactivityCheck();
  }

  createRoom(roomId: string, hostId: string, settings?: Partial<GameSettings>): GameRoom {
    const room: GameRoom = {
      id: roomId,
      hostId,
      players: [],
      currentRound: 0,
      totalRounds: settings?.totalRounds || this.defaultSettings.totalRounds,
      state: GameState.WAITING,
      roundAnswers: new Map(),
      settings: { ...this.defaultSettings, ...settings }
    };
    this.rooms.set(roomId, room);
    return room;
  }

  addPlayer(roomId: string, player: Player): GameRoom | null {
    const room = this.rooms.get(roomId);
    if (!room) {
      logger.error(`Room ${roomId} not found`);
      return null;
    }

    if (room.state !== GameState.WAITING) {
      logger.error(`Cannot join room ${roomId} - game already in progress`);
      return null;
    }

    if (room.players.length >= room.settings.maxPlayers) {
      logger.error(`Room ${roomId} is full`);
      return null;
    }

    room.players.push(player);
    return room;
  }

  startGame(roomId: string): GameRoom | null {
    const room = this.rooms.get(roomId);
    if (!room || room.players.length < 2) {
      return null;
    }

    room.state = GameState.PLAYING;
    room.currentRound = 1;
    room.startTime = Date.now();
    room.currentSong = generateSongQuestion();
    
    return room;
  }

  submitAnswer(roomId: string, answer: PlayerAnswer): GameRoom | null {
    const room = this.rooms.get(roomId);
    if (!room || room.state !== GameState.PLAYING) {
      return null;
    }

    room.roundAnswers.set(answer.playerId, answer);
    this.updatePlayerScore(room, answer);

    if (room.roundAnswers.size === room.players.length) {
      this.handleRoundEnd(room);
    }

    return room;
  }

  private updatePlayerScore(room: GameRoom, answer: PlayerAnswer): void {
    const player = room.players.find(p => p.id === answer.playerId);
    if (!player) return;

    if (answer.isCorrect) {
      const timeBonus = Math.max(0, 1000 - answer.answerTime) / 100;
      player.score += Math.round(100 + timeBonus);
      player.streak++;
      player.correctAnswers++;
    } else {
      player.streak = 0;
    }
  }

  private handleRoundEnd(room: GameRoom): void {
    if (room.currentRound >= room.totalRounds) {
      this.endGame(room);
    } else {
      room.currentRound++;
      room.roundAnswers.clear();
      room.currentSong = generateSongQuestion();
      
      this.io.to(room.id).emit('round-ended', {
        results: Array.from(room.roundAnswers.values()),
        nextRound: room.currentRound
      });
    }
  }

  private endGame(room: GameRoom): void {
    room.state = GameState.FINISHED;
    const winner = room.players.reduce((prev, current) => 
      (prev.score > current.score) ? prev : current
    );

    this.io.to(room.id).emit('game-ended', {
      players: room.players,
      winner
    });

    // Cleanup after a delay
    setTimeout(() => this.rooms.delete(room.id), 5000);
  }

  private startInactivityCheck(): void {
    setInterval(() => {
      const now = Date.now();
      this.rooms.forEach((room, roomId) => {
        // Remove rooms that are waiting and inactive for more than 30 minutes
        if (room.state === GameState.WAITING && 
            room.players.length === 0 && 
            now - room.players[0]?.lastActivity > 1800000) {
          this.rooms.delete(roomId);
          logger.info(`Removed inactive room ${roomId}`);
        }
      });
    }, 300000); // Check every 5 minutes
  }

  removePlayer(roomId: string, playerId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.players = room.players.filter(p => p.id !== playerId);
    
    if (room.players.length === 0) {
      this.rooms.delete(roomId);
    } else if (playerId === room.hostId && room.players.length > 0) {
      // Assign new host
      room.hostId = room.players[0].id;
      room.players[0].isHost = true;
    }
  }

  getRoomById(roomId: string): GameRoom | null {
    return this.rooms.get(roomId) || null;
  }
} 