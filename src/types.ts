export interface Player {
  id: string
  name: string
  score: number
  correctAnswers: number
  isHost: boolean
}

export interface Room {
  id: string
  players: Player[]
  currentRound: number
  totalRounds: number
  currentQuestion: Question | null
  answers: { [playerId: string]: number }
  isGameStarted: boolean
  timer: NodeJS.Timeout | null
}

export interface Question {
  id: string
  audioUrl: string
  options: string[]
  correctAnswer: number
  artist: string
  title: string
} 