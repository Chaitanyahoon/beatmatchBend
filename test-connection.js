// Simple test script to verify your backend is working correctly
// Run this locally with: node test-connection.js

const { io } = require("socket.io-client")
const fetch = require("node-fetch")

// Replace with your actual backend URL
const BACKEND_URL = "https://beatmatch-jbss.onrender.com"

async function runTests() {
  console.log(`🔍 Testing backend at ${BACKEND_URL}...`)

  // Test 1: HTTP Health Check
  try {
    console.log("\n📡 Testing HTTP health endpoint...")
    const response = await fetch(`${BACKEND_URL}/health`)
    const data = await response.json()
    console.log("✅ Health endpoint response:", data)

    if (data.status === "OK" || data.status === "ok") {
      console.log("✅ Health check passed!")
    } else {
      console.log("❌ Health check failed - unexpected status:", data.status)
    }
  } catch (error) {
    console.error("❌ Health check failed:", error.message)
  }

  // Test 2: Socket.IO Connection
  console.log("\n🔌 Testing Socket.IO connection...")
  const socket = io(BACKEND_URL, {
    transports: ["websocket", "polling"],
    timeout: 10000,
  })

  socket.on("connect", () => {
    console.log(`✅ Socket connected with ID: ${socket.id}`)

    // Test 3: Ping-Pong
    console.log("\n🏓 Testing ping-pong...")
    socket.emit("ping")
  })

  socket.on("pong", () => {
    console.log("✅ Received pong response!")

    // Test 4: Room Creation
    console.log("\n🏠 Testing room creation...")
    const testRoomId =
      "TEST" +
      Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, "0")
    const testPlayerName = "Tester" + Math.floor(Math.random() * 1000)

    socket.emit("join-room", {
      roomId: testRoomId,
      playerName: testPlayerName,
      isHost: true,
    })
  })

  socket.on("room-updated", (data) => {
    console.log("✅ Room created successfully:", data)
    console.log("\n✨ All tests passed! Your backend is working correctly.")
    socket.disconnect()
  })

  socket.on("room-error", (error) => {
    console.error("❌ Room creation failed:", error)
    socket.disconnect()
  })

  socket.on("connect_error", (error) => {
    console.error("❌ Socket connection failed:", error.message)
  })

  socket.on("disconnect", () => {
    console.log("Socket disconnected")
  })

  // Set a timeout to exit if tests don't complete
  setTimeout(() => {
    console.log("⚠️ Tests timed out. The backend might be slow to respond or not working correctly.")
    process.exit(1)
  }, 15000)
}

runTests()
