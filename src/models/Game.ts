import { Schema, model } from 'mongoose';

interface Player {
  id: string;
  name: string;
  score: number;
  correctAnswers: number;
}

interface Game {
  roomId: string;
  players: Player[];
  currentRound: number;
  totalRounds: number;
  isActive: boolean;
  startedAt: Date;
  endedAt?: Date;
}

const playerSchema = new Schema<Player>({
  id: { type: String, required: true },
  name: { type: String, required: true },
  score: { type: Number, default: 0 },
  correctAnswers: { type: Number, default: 0 }
});

const gameSchema = new Schema<Game>({
  roomId: { type: String, required: true, unique: true },
  players: [playerSchema],
  currentRound: { type: Number, default: 0 },
  totalRounds: { type: Number, default: 5 },
  isActive: { type: Boolean, default: true },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date }
});

export const GameModel = model<Game>('Game', gameSchema); 