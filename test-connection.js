const io = require('socket.io-client');
const axios = require('axios');

// Backend URL
const BACKEND_URL = process.env.BACKEND_URL || 'https://beatmatch-jbss.onrender.com';

console.log('🔄 Starting connection test...');
console.log(`📡 Connecting to: ${BACKEND_URL}`);

// First create a game via REST API
async function createAndJoinGame() {
  try {
    // Create a new game
    const roomId = 'test-room-' + Date.now();
    const createGameResponse = await axios.post(`${BACKEND_URL}/api/games`, {
      roomId: roomId,
      hostName: 'TestHost'
    });
    
    console.log('✅ Game created successfully:', createGameResponse.data);
    
    // Now connect via Socket.IO
    const socket = io(BACKEND_URL, {
      withCredentials: true,
      transports: ['websocket']
    });

    // Connection events
    socket.on('connect', () => {
      console.log('✅ Connected successfully!');
      console.log(`🆔 Socket ID: ${socket.id}`);
      
      // Join the created game
      console.log(`🎮 Joining game room: ${roomId}`);
      socket.emit('join-game', {
        roomId: roomId,
        playerName: 'TestPlayer'
      });
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error.message);
      process.exit(1);
    });

    // Game events
    socket.on('player-joined', (data) => {
      console.log('✅ Player joined event received');
      console.log('📊 Players in game:', data.players.length);
      
      // Test starting the game
      console.log('🎲 Testing game start...');
      socket.emit('start-game', {
        roomId: roomId
      });
    });

    socket.on('game-started', (data) => {
      console.log('✅ Game started event received');
      console.log('🔄 Current round:', data.currentRound);
      
      // Test submitting an answer
      console.log('📝 Testing answer submission...');
      socket.emit('submit-answer', {
        roomId: roomId,
        answer: {
          isCorrect: true
        }
      });
    });

    socket.on('answer-submitted', (data) => {
      console.log('✅ Answer submitted event received');
      console.log('📊 Updated players:', data.players);
      
      // Test complete - disconnect
      console.log('🏁 Test complete - disconnecting...');
      socket.disconnect();
    });

    socket.on('error', (error) => {
      console.error('❌ Server error:', error.message);
    });

    socket.on('disconnect', () => {
      console.log('👋 Disconnected from server');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Error creating game:', error.response ? error.response.data : error.message);
    process.exit(1);
  }
}

// Run the test
createAndJoinGame(); 