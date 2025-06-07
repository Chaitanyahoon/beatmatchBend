// Simple test script to verify Socket.IO functionality
// Add this to your backend repository and run with: node socket-test.js

const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const cors = require("cors")

// Create Express app and HTTP server
const app = express()
const server = http.createServer(app)

// Configure CORS
app.use(
  cors({
    origin: "*", // In production, restrict this to your frontend URL
    methods: ["GET", "POST"],
    credentials: true,
  }),
)

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: "*", // In production, restrict this
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// Basic health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK", // Note: uppercase "OK" to match what frontend expects
    uptime: process.uptime(),
    timestamp: Date.now(),
    rooms: io.sockets.adapter.rooms.size,
    players: io.sockets.sockets.size,
  })
})

// Root endpoint for CORS testing
app.get("/", (req, res) => {
  res.json({ message: "BeatMatch API is running" })
})

// Game state
const rooms = new Map()

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`)

  // Simple ping-pong for connection testing
  socket.on("ping", () => {
    console.log(`Ping from ${socket.id}`)
    socket.emit("pong")
  })

  // Join room
  socket.on("join-room", ({ roomId, playerName, isHost }) => {
    console.log(`Join room request: ${roomId}, ${playerName}, host: ${isHost}`)

    if (!roomId || !playerName) {
      return socket.emit("room-error", { message: "Room ID and player name are required" })
    }

    // Create room if it doesn't exist and user is host
    if (!rooms.has(roomId)) {
      if (!isHost) {
        return socket.emit("room-error", { message: "Room does not exist" })
      }

      // Create new room
      rooms.set(roomId, {
        id: roomId,
        players: [],
        gameStarted: false,
        hostId: socket.id,
      })

      console.log(`Created new room: ${roomId}`)
    }

    const room = rooms.get(roomId)

    // Add player to room
    const player = {
      id: socket.id,
      name: playerName,
      score: 0,
      isHost: isHost,
      connected: true,
    }

    // Check if player name is taken
    if (room.players.some((p) => p.name === playerName && p.id !== socket.id)) {
      return socket.emit("room-error", { message: "Player name already taken" })
    }

    // Add player to room
    const existingPlayerIndex = room.players.findIndex((p) => p.name === playerName)
    if (existingPlayerIndex >= 0) {
      room.players[existingPlayerIndex] = player
    } else {
      room.players.push(player)
    }

    // Join socket room
    socket.join(roomId)

    // Store room info in socket for disconnect handling
    socket.data.roomId = roomId
    socket.data.playerName = playerName

    // Notify all clients in the room
    io.to(roomId).emit("room-updated", {
      roomId,
      players: room.players,
      gameStarted: room.gameStarted,
    })

    console.log(`Player ${playerName} joined room ${roomId}`)
  })

  // Start game
  socket.on("start-game", ({ roomId }) => {
    console.log(`Start game request for room ${roomId}`)

    if (!roomId || !rooms.has(roomId)) {
      return socket.emit("room-error", { message: "Room not found" })
    }

    const room = rooms.get(roomId)

    // Check if sender is host
    const player = room.players.find((p) => p.id === socket.id)
    if (!player || !player.isHost) {
      return socket.emit("room-error", { message: "Only the host can start the game" })
    }

    // Check minimum players
    if (room.players.length < 2) {
      return socket.emit("room-error", { message: "Need at least 2 players to start" })
    }

    // Set game as started
    room.gameStarted = true

    // Notify all clients that game is starting
    io.to(roomId).emit("game-started")
    console.log(`Game started in room ${roomId}`)
  })

  // Disconnect handling
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`)

    const roomId = socket.data?.roomId
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId)

      // Find player in room
      const playerIndex = room.players.findIndex((p) => p.id === socket.id)
      if (playerIndex !== -1) {
        const player = room.players[playerIndex]
        console.log(`Player ${player.name} disconnected from room ${roomId}`)

        // Remove player from room
        room.players.splice(playerIndex, 1)

        // If room is empty, remove it
        if (room.players.length === 0) {
          console.log(`Removing empty room: ${roomId}`)
          rooms.delete(roomId)
        } else {
          // Notify remaining players
          io.to(roomId).emit("room-updated", {
            roomId,
            players: room.players,
            gameStarted: room.gameStarted,
          })
        }
      }
    }
  })
})

// Start server
const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`)
})
