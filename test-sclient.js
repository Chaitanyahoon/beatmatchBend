// Simple test client to verify Socket.IO functionality
// Run with: node test-client.js

const { io } = require("socket.io-client")

// Replace with your backend URL
const BACKEND_URL = "https://beatmatch-jbss.onrender.com"

console.log(`Connecting to ${BACKEND_URL}...`)
const socket = io(BACKEND_URL, {
  transports: ["websocket", "polling"],
  timeout: 10000,
})

socket.on("connect", () => {
  console.log("Connected to server with ID:", socket.id)

  // Test ping
  console.log("Sending ping...")
  socket.emit("ping")

  // Test join room
  const testRoomId = "TEST" + Math.random().toString(36).substring(2, 6).toUpperCase()
  const testPlayerName = "Tester" + Math.floor(Math.random() * 1000)

  console.log(`Joining room ${testRoomId} as ${testPlayerName}...`)
  socket.emit("join-room", {
    roomId: testRoomId,
    playerName: testPlayerName,
    isHost: true,
  })
})

socket.on("pong", () => {
  console.log("✅ Received pong from server")
})

socket.on("room-updated", (data) => {
  console.log("✅ Room updated:", data)

  // Test start game
  if (data.players.length > 0) {
    console.log(`Starting game in room ${data.roomId}...`)
    socket.emit("start-game", { roomId: data.roomId })
  }
})

socket.on("game-started", () => {
  console.log("✅ Game started successfully")
  console.log("All tests passed! Socket.IO is working correctly.")
  socket.disconnect()
})

socket.on("room-error", (error) => {
  console.error("❌ Room error:", error)
  socket.disconnect()
})

socket.on("connect_error", (error) => {
  console.error("❌ Connection error:", error)
})

socket.on("disconnect", () => {
  console.log("Disconnected from server")
})

// Listen for any event (for debugging)
socket.onAny((event, ...args) => {
  console.log(`Received event: ${event}`, args)
})
