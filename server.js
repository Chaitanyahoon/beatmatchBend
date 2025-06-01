const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Spotify API configuration
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || 'your_spotify_client_id';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || 'your_spotify_client_secret';
let spotifyAccessToken = null;
let tokenExpiresAt = 0;

// Get Spotify access token using client credentials flow
async function getSpotifyAccessToken() {
  if (spotifyAccessToken && Date.now() < tokenExpiresAt) {
    return spotifyAccessToken;
  }

  try {
    const response = await axios.post('https://accounts.spotify.com/api/token', 
      'grant_type=client_credentials',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
        }
      }
    );

    spotifyAccessToken = response.data.access_token;
    tokenExpiresAt = Date.now() + (response.data.expires_in * 1000) - 60000; // Refresh 1 minute early
    
    console.log('✅ Spotify access token obtained');
    return spotifyAccessToken;
  } catch (error) {
    console.error('❌ Failed to get Spotify access token:', error.response?.data || error.message);
    return null;
  }
}

// Search for tracks on Spotify
async function searchSpotifyTracks(query, limit = 50) {
  try {
    const token = await getSpotifyAccessToken();
    if (!token) return [];

    const response = await axios.get('https://api.spotify.com/v1/search', {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        q: query,
        type: 'track',
        limit: limit,
        market: 'US'
      }
    });

    return response.data.tracks.items.filter(track => track.preview_url);
  } catch (error) {
    console.error('❌ Spotify search error:', error.response?.data || error.message);
    return [];
  }
}

// Generate random music questions using Spotify
async function generateMusicQuestions() {
  const genres = ['pop', 'rock', 'hip-hop', 'electronic', 'indie', 'alternative', 'classic rock', 'r&b'];
  const years = ['2020..2024', '2015..2019', '2010..2014', '2000..2009', '1990..1999', '1980..1989'];
  
  const questions = [];
  
  for (let i = 0; i < 10; i++) {
    try {
      const randomGenre = genres[Math.floor(Math.random() * genres.length)];
      const randomYear = years[Math.floor(Math.random() * years.length)];
      const query = `genre:${randomGenre} year:${randomYear}`;
      
      const tracks = await searchSpotifyTracks(query, 50);
      
      if (tracks.length >= 4) {
        const correctTrack = tracks[Math.floor(Math.random() * Math.min(tracks.length, 20))];
        const wrongTracks = tracks
          .filter(t => t.id !== correctTrack.id)
          .sort(() => 0.5 - Math.random())
          .slice(0, 3);
        
        if (wrongTracks.length === 3) {
          const options = [correctTrack, ...wrongTracks]
            .sort(() => 0.5 - Math.random())
            .map(track => `${track.name} - ${track.artists[0].name}`);
          
          const correctAnswer = options.findIndex(option => 
            option === `${correctTrack.name} - ${correctTrack.artists[0].name}`
          );
          
          questions.push({
            id: `spotify_${correctTrack.id}`,
            audioUrl: correctTrack.preview_url,
            options: options,
            correctAnswer: correctAnswer,
            artist: correctTrack.artists[0].name,
            title: correctTrack.name,
            genre: randomGenre,
            year: correctTrack.album.release_date.split('-')[0]
          });
        }
      }
    } catch (error) {
      console.error('Error generating question:', error.message);
    }
  }
  
  return questions;
}

// Fallback music questions (in case Spotify fails)
const fallbackQuestions = [
  {
    id: "fallback_1",
    audioUrl: "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav", // Replace with actual preview URLs
    options: ["Shape of You - Ed Sheeran", "Blinding Lights - The Weeknd", "Watermelon Sugar - Harry Styles", "Levitating - Dua Lipa"],
    correctAnswer: 0,
    artist: "Ed Sheeran",
    title: "Shape of You"
  },
  {
    id: "fallback_2",
    audioUrl: "https://www.soundjay.com/misc/sounds/bell-ringing-05.wav",
    options: ["Bad Guy - Billie Eilish", "Sunflower - Post Malone", "Old Town Road - Lil Nas X", "Someone You Loved - Lewis Capaldi"],
    correctAnswer: 0,
    artist: "Billie Eilish",
    title: "Bad Guy"
  }
];

// Game state storage
const gameRooms = new Map();
const playerSockets = new Map();
let musicQuestions = [];

// Initialize music questions on startup
async function initializeMusicQuestions() {
  console.log('🎵 Initializing music questions...');
  try {
    musicQuestions = await generateMusicQuestions();
    if (musicQuestions.length === 0) {
      console.log('⚠️ Using fallback questions');
      musicQuestions = fallbackQuestions;
    } else {
      console.log(`✅ Generated ${musicQuestions.length} Spotify questions`);
    }
  } catch (error) {
    console.error('❌ Failed to initialize music questions:', error.message);
    musicQuestions = fallbackQuestions;
  }
}

class GameRoom {
  constructor(roomId, hostId, hostName) {
    this.roomId = roomId;
    this.players = new Map();
    this.currentRound = 0;
    this.totalRounds = 5;
    this.gameStarted = false;
    this.gameEnded = false;
    this.currentQuestion = null;
    this.roundAnswers = new Map();
    this.timer = null;
    this.timeLeft = 30;
    this.usedQuestions = new Set();
    this.roundStartTime = null;
    this.maxPlayers = 8;
    
    // Add host player
    this.addPlayer(hostId, hostName, true);
  }

  addPlayer(playerId, playerName, isHost = false) {
    if (this.players.size >= this.maxPlayers) {
      throw new Error('Room is full');
    }

    // Check if name is already taken
    const existingPlayer = Array.from(this.players.values()).find(p => p.name === playerName);
    if (existingPlayer) {
      throw new Error('Player name already taken');
    }

    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      score: 0,
      isHost,
      correctAnswers: 0,
      joinedAt: Date.now()
    });
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.roundAnswers.delete(playerId);
    
    if (this.players.size === 0) {
      this.cleanup();
      return true; // Room should be deleted
    }
    
    // If host left, make someone else host
    const hasHost = Array.from(this.players.values()).some(p => p.isHost);
    if (!hasHost && this.players.size > 0) {
      const firstPlayer = this.players.values().next().value;
      firstPlayer.isHost = true;
    }
    
    return false;
  }

  async startGame() {
    if (this.players.size < 2) {
      throw new Error('Need at least 2 players to start');
    }
    
    if (this.gameStarted) {
      throw new Error('Game already started');
    }
    
    this.gameStarted = true;
    this.currentRound = 1;
    this.usedQuestions.clear();
    
    // Reset all player scores
    this.players.forEach(player => {
      player.score = 0;
      player.correctAnswers = 0;
    });
    
    await this.startNewRound();
    return true;
  }

  async startNewRound() {
    if (this.currentRound > this.totalRounds) {
      this.endGame();
      return;
    }

    this.roundAnswers.clear();
    this.timeLeft = 30;
    this.roundStartTime = Date.now();
    
    // Get random unused question
    const availableQuestions = musicQuestions.filter(q => !this.usedQuestions.has(q.id));
    if (availableQuestions.length === 0) {
      // Reset if we've used all questions
      this.usedQuestions.clear();
    }
    
    const questionIndex = Math.floor(Math.random() * availableQuestions.length);
    this.currentQuestion = availableQuestions[questionIndex] || musicQuestions[0];
    this.usedQuestions.add(this.currentQuestion.id);
    
    // Start timer
    this.startTimer();
  }

  startTimer() {
    if (this.timer) clearInterval(this.timer);
    
    this.timer = setInterval(() => {
      this.timeLeft--;
      
      if (this.timeLeft <= 0) {
        this.endRound();
      }
    }, 1000);
  }

  submitAnswer(playerId, answer) {
    if (this.gameEnded || !this.currentQuestion) return false;
    
    if (!this.roundAnswers.has(playerId)) {
      const responseTime = Date.now() - this.roundStartTime;
      this.roundAnswers.set(playerId, {
        answer,
        responseTime,
        timestamp: Date.now()
      });
      
      // Check if all players answered
      if (this.roundAnswers.size === this.players.size) {
        this.endRound();
      }
      
      return true;
    }
    
    return false;
  }

  endRound() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Calculate scores with time bonus
    this.roundAnswers.forEach((answerData, playerId) => {
      const player = this.players.get(playerId);
      if (player && answerData.answer === this.currentQuestion.correctAnswer) {
        // Base points for correct answer
        let points = 100;
        
        // Time bonus (up to 50 points for quick answers)
        const timeBonus = Math.max(0, Math.min(50, Math.floor((30 - (answerData.responseTime / 1000)) * 2)));
        points += timeBonus;
        
        player.score += points;
        player.correctAnswers++;
      }
    });

    // Auto-advance to next round after delay
    setTimeout(async () => {
      this.currentRound++;
      await this.startNewRound();
    }, 5000);
  }

  endGame() {
    this.gameEnded = true;
    this.cleanup();
  }

  cleanup() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getPlayersArray() {
    return Array.from(this.players.values());
  }

  getGameState() {
    return {
      roomId: this.roomId,
      players: this.getPlayersArray(),
      currentRound: this.currentRound,
      totalRounds: this.totalRounds,
      gameStarted: this.gameStarted,
      gameEnded: this.gameEnded,
      timeLeft: this.timeLeft
    };
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🎵 User connected: ${socket.id}`);

  socket.on('join-room', ({ roomId, playerName, isHost }) => {
    try {
      let room = gameRooms.get(roomId);
      
      if (!room) {
        if (!isHost) {
          socket.emit('room-error', { message: 'Room not found' });
          return;
        }
        room = new GameRoom(roomId, socket.id, playerName);
        gameRooms.set(roomId, room);
        console.log(`🎮 Created new room: ${roomId}`);
      } else {
        if (room.gameStarted && !room.gameEnded) {
          socket.emit('room-error', { message: 'Game already in progress' });
          return;
        }
        room.addPlayer(socket.id, playerName);
      }

      socket.join(roomId);
      playerSockets.set(socket.id, { roomId, playerName });
      
      io.to(roomId).emit('room-updated', room.getGameState());
      
      console.log(`👤 Player ${playerName} joined room ${roomId}`);
      
    } catch (error) {
      console.error('Join room error:', error.message);
      socket.emit('room-error', { message: error.message });
    }
  });

  socket.on('start-game', async (roomId) => {
    try {
      const room = gameRooms.get(roomId);
      if (!room) {
        socket.emit('room-error', { message: 'Room not found' });
        return;
      }

      const player = room.players.get(socket.id);
      if (!player || !player.isHost) {
        socket.emit('room-error', { message: 'Only host can start the game' });
        return;
      }

      if (await room.startGame()) {
        io.to(roomId).emit('game-started');
        console.log(`🚀 Game started in room ${roomId}`);
        
        // Send first question after a short delay
        setTimeout(() => {
          io.to(roomId).emit('new-question', {
            question: room.currentQuestion,
            round: room.currentRound
          });
          
          // Send timer updates
          const timerInterval = setInterval(() => {
            io.to(roomId).emit('timer-update', room.timeLeft);
            if (room.timeLeft <= 0 || room.gameEnded) {
              clearInterval(timerInterval);
            }
          }, 1000);
          
        }, 2000);
      }
      
    } catch (error) {
      console.error('Start game error:', error.message);
      socket.emit('room-error', { message: error.message });
    }
  });

  socket.on('submit-answer', ({ roomId, playerName, answer }) => {
    try {
      const room = gameRooms.get(roomId);
      if (!room || room.gameEnded) return;

      if (room.submitAnswer(socket.id, answer)) {
        console.log(`✅ Player ${playerName} submitted answer ${answer} in room ${roomId}`);
        
        // Check if round should end
        if (room.roundAnswers.size === room.players.size || room.timeLeft <= 0) {
          room.endRound();
          
          io.to(roomId).emit('round-results', {
            correctAnswer: room.currentQuestion.correctAnswer,
            players: room.getPlayersArray(),
            question: room.currentQuestion
          });
          
          // Check if game should end
          if (room.currentRound > room.totalRounds) {
            setTimeout(() => {
              room.endGame();
              io.to(roomId).emit('game-ended', {
                players: room.getPlayersArray()
              });
              console.log(`🏁 Game ended in room ${roomId}`);
            }, 3000);
          } else {
            // Send next question after delay
            setTimeout(() => {
              if (!room.gameEnded) {
                io.to(roomId).emit('new-question', {
                  question: room.currentQuestion,
                  round: room.currentRound
                });
              }
            }, 5000);
          }
        }
      }
      
    } catch (error) {
      console.error('Submit answer error:', error.message);
    }
  });

  socket.on('get-final-scores', (roomId) => {
    const room = gameRooms.get(roomId);
    if (room) {
      socket.emit('final-scores', {
        players: room.getPlayersArray().sort((a, b) => b.score - a.score)
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`👋 User disconnected: ${socket.id}`);
    
    const playerData = playerSockets.get(socket.id);
    if (playerData) {
      const room = gameRooms.get(playerData.roomId);
      if (room) {
        const shouldDeleteRoom = room.removePlayer(socket.id);
        
        if (shouldDeleteRoom) {
          gameRooms.delete(playerData.roomId);
          console.log(`🗑️ Deleted empty room: ${playerData.roomId}`);
        } else {
          io.to(playerData.roomId).emit('room-updated', room.getGameState());
          console.log(`👤 Player ${playerData.playerName} left room ${playerData.roomId}`);
        }
      }
      playerSockets.delete(socket.id);
    }
  });

  // Heartbeat to keep connection alive
  socket.on('ping', () => {
    socket.emit('pong');
  });
});

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'BeatMatch Backend API',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'BeatMatch Backend',
    rooms: gameRooms.size,
    players: playerSockets.size,
    questions: musicQuestions.length,
    timestamp: new Date().toISOString()
  });
});

// Get room info endpoint
app.get('/room/:roomId', (req, res) => {
  const room = gameRooms.get(req.params.roomId);
  if (room) {
    res.json(room.getGameState());
  } else {
    res.status(404).json({ error: 'Room not found' });
  }
});

// Refresh music questions endpoint
app.post('/api/refresh-questions', async (req, res) => {
  try {
    await initializeMusicQuestions();
    res.json({ 
      message: 'Questions refreshed successfully',
      count: musicQuestions.length 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to refresh questions' });
  }
});

// Cleanup inactive rooms every 30 minutes
setInterval(() => {
  const now = Date.now();
  const ROOM_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  
  gameRooms.forEach((room, roomId) => {
    const roomAge = now - Math.min(...Array.from(room.players.values()).map(p => p.joinedAt));
    if (roomAge > ROOM_TIMEOUT && !room.gameStarted) {
      gameRooms.delete(roomId);
      console.log(`🧹 Cleaned up inactive room: ${roomId}`);
    }
  });
}, 30 * 60 * 1000);

// Refresh music questions every 6 hours
setInterval(async () => {
  console.log('🔄 Refreshing music questions...');
  await initializeMusicQuestions();
}, 6 * 60 * 60 * 1000);

const PORT = process.env.PORT || 3001;

// Initialize and start server
async function startServer() {
  await initializeMusicQuestions();
  
  server.listen(PORT, () => {
    console.log(`🎵 BeatMatch server running on port ${PORT}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    console.log(`🎮 Ready for multiplayer music battles!`);
    console.log(`🎧 Music questions loaded: ${musicQuestions.length}`);
  });
}

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
