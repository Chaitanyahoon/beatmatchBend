import express, { Request, Response } from "express"
import { createServer } from "http"
import { Server } from "socket.io"
import cors from "cors"
import dotenv from "dotenv"
import { Room, Player, Question } from "./types"

dotenv.config()

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
})

const PORT = process.env.PORT || 3001

// In-memory storage
const rooms = new Map<string, Room>()

// Mock questions - Replace with your actual questions
const questions: Question[] = [
  {
    id: "1",
    audioUrl: "https://your-audio-storage/song1.mp3",
    options: ["Song 1", "Song 2", "Song 3", "Song 4"],
    correctAnswer: 0,
    artist: "Artist 1",
    title: "Song 1",
  },
  // Add more questions...
]

function getRandomQuestion(): Question {
  return questions[Math.floor(Math.random() * questions.length)]
}

function createRoom(roomId: string): Room {
  return {
    id: roomId,
    players: [],
    currentRound: 0,
    totalRounds: 5,
    currentQuestion: null,
    answers: {},
    isGameStarted: false,
    timer: null,
  }
}

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id)

  socket.on("join-room", ({ roomId, playerName, isHost }) => {
    let room = rooms.get(roomId)
    if (!room) {
      room = createRoom(roomId)
      rooms.set(roomId, room)
    }

    const player: Player = {
      id: socket.id,
      name: playerName,
      score: 0,
      correctAnswers: 0,
      isHost,
    }

    room.players.push(player)
    socket.join(roomId)

    io.to(roomId).emit("player-joined", { players: room.players })
  })

  socket.on("start-game", (roomId) => {
    const room = rooms.get(roomId)
    if (!room) return

    room.isGameStarted = true
    room.currentRound = 1
    startNewRound(room)
  })

  socket.on("submit-answer", ({ roomId, answer }) => {
    const room = rooms.get(roomId)
    if (!room || !room.currentQuestion) return

    room.answers[socket.id] = answer

    if (Object.keys(room.answers).length === room.players.length) {
      endRound(room)
    }
  })

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id)
    // Handle player disconnection
    rooms.forEach((room) => {
      const playerIndex = room.players.findIndex((p) => p.id === socket.id)
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1)
        io.to(room.id).emit("player-left", { players: room.players })
      }
    })
  })
})

function startNewRound(room: Room) {
  room.currentQuestion = getRandomQuestion()
  room.answers = {}

  io.to(room.id).emit("new-question", {
    question: room.currentQuestion,
    round: room.currentRound,
  })

  // Start round timer
  if (room.timer) clearTimeout(room.timer)
  room.timer = setTimeout(() => endRound(room), 30000) // 30 seconds per round
}

function endRound(room: Room) {
  if (!room.currentQuestion) return

  // Calculate scores
  Object.entries(room.answers).forEach(([playerId, answer]) => {
    const player = room.players.find((p) => p.id === playerId)
    if (player && answer === room.currentQuestion?.correctAnswer) {
      player.score += 100 // Base score
      player.correctAnswers++
    }
  })

  io.to(room.id).emit("round-results", {
    correctAnswer: room.currentQuestion.correctAnswer,
    players: room.players,
  })

  // Start next round or end game
  if (room.currentRound < room.totalRounds) {
    room.currentRound++
    setTimeout(() => startNewRound(room), 5000) // 5 seconds between rounds
  } else {
    io.to(room.id).emit("game-ended", {
      players: room.players,
    })
    rooms.delete(room.id)
  }
}

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "healthy" })
})

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
}) 