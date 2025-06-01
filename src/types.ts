export interface Player {
  id: string;
  name: string;
  score: number;
  streak: number;
  correctAnswers: number;
  isHost: boolean;
  socketId: string;
  lastActivity: number;
}

export interface GameRoom {
  id: string;
  hostId: string;
  players: Player[];
  currentRound: number;
  totalRounds: number;
  state: GameState;
  currentSong?: SongQuestion;
  roundAnswers: Map<string, PlayerAnswer>;
  startTime?: number;
  settings: GameSettings;
}

export interface SongQuestion {
  id: string;
  correctAnswer: string;
  options: string[];
  startTime: number;
  endTime: number;
  timeLimit: number;
}

export interface PlayerAnswer {
  playerId: string;
  isCorrect: boolean;
  answerTime: number;
  round: number;
}

export interface GameSettings {
  maxPlayers: number;
  roundDuration: number;
  totalRounds: number;
  questionTimeLimit: number;
}

export enum GameState {
  WAITING = 'waiting',
  STARTING = 'starting',
  PLAYING = 'playing',
  ROUND_END = 'round_end',
  FINISHED = 'finished'
}

// Socket.IO Event Types
export interface ServerToClientEvents {
  'player-joined': (data: { players: Player[]; room: GameRoom }) => void;
  'game-started': (data: { currentRound: number; song: SongQuestion }) => void;
  'answer-submitted': (data: { players: Player[]; room: GameRoom }) => void;
  'round-ended': (data: { results: PlayerAnswer[]; nextRound: number }) => void;
  'game-ended': (data: { players: Player[]; winner: Player }) => void;
  'error': (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  'join-game': (data: { roomId: string; playerName: string }) => void;
  'start-game': (data: { roomId: string }) => void;
  'submit-answer': (data: { roomId: string; answer: PlayerAnswer }) => void;
  'leave-game': (data: { roomId: string }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  playerId: string;
  roomId?: string;
} 