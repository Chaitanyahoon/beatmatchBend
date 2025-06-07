// Simple test script to verify the server is working
const { io } = require("socket.io-client")

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3001"

console.log(`🧪 Testing BeatMatch Backend at ${SERVER_URL}`)

const socket = io(SERVER_URL, {
  transports: ["websocket", "polling"],
  timeout: 10000,
})

let testsPassed = 0
let testsTotal = 0

function runTest(name, testFn) {
  testsTotal++
  console.log(`\n🔍 Running test: ${name}`)

  try {
    testFn()
  } catch (error) {
    console.log(`❌ Test failed: ${error.message}`)
  }
}

function passTest(message) {
  testsPassed++
  console.log(`✅ ${message}`)
}

function failTest(message) {
  console.log(`❌ ${message}`)
}

// Test 1: Connection
socket.on("connect", () => {
  passTest(`Connected to server with ID: ${socket.id}`)

  // Test 2: Ping-Pong
  runTest("Ping-Pong", () => {
    socket.emit("ping")
  })
})

socket.on("pong", () => {
  passTest("Ping-pong test successful")

  // Test 3: Room Creation
  runTest("Room Creation", () => {
    socket.emit("join-room", {
      roomId: "TEST01",
      playerName: "TestPlayer",
      isHost: true,
    })
  })
})

socket.on("room-updated", (data) => {
  passTest(`Room creation successful - ${data.players.length} player(s) in room ${data.roomId}`)

  // Test 4: Game Start (should fail with not enough players)
  runTest("Game Start Validation", () => {
    socket.emit("start-game", { roomId: "TEST01" })
  })
})

socket.on("room-error", (error) => {
  if (error.message.includes("Need at least 2 players")) {
    passTest("Game start validation working correctly")
  } else {
    failTest(`Unexpected room error: ${error.message}`)
  }

  // Finish tests
  setTimeout(() => {
    console.log(`\n📊 Test Results: ${testsPassed}/${testsTotal} tests passed`)

    if (testsPassed === testsTotal) {
      console.log("🎉 All tests passed! Backend is working correctly.")
    } else {
      console.log("⚠️  Some tests failed. Check the logs above.")
    }

    socket.disconnect()
    process.exit(testsPassed === testsTotal ? 0 : 1)
  }, 1000)
})

socket.on("connect_error", (error) => {
  failTest(`Connection failed: ${error.message}`)
  console.log("\n💡 Make sure the server is running and accessible")
  process.exit(1)
})

socket.on("disconnect", () => {
  console.log("🔌 Disconnected from server")
})

// Timeout after 15 seconds
setTimeout(() => {
  failTest("Tests timed out")
  console.log("⏰ Tests took too long - check server connectivity")
  process.exit(1)
}, 15000)
