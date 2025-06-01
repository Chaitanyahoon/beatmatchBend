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

// Game state storage
const gameRooms = new Map();
const playerSockets = new Map();

// Enhanced music questions with Deezer preview URLs
const musicQuestions = [
  {
    id: "1",
    audioUrl: "https://cdns-preview-d.dzcdn.net/stream/c-deda7fa9316d9e9e880d2c6207e92260-8.mp3", // Bohemian Rhapsody
    options: ["Bohemian Rhapsody - Queen", "Imagine - John Lennon", "Hotel California - Eagles", "Stairway to Heaven - Led Zeppelin"],
    correctAnswer: 0,
    artist: "Queen",
    title: "Bohemian Rhapsody"
  },
  {
    id: "2",
    audioUrl: "https://cdns-preview-e.dzcdn.net/stream/c-e77d23ebe0c6d2b5e6eb7b9e8a7e8c8e-8.mp3", // Sweet Child O' Mine
    options: ["Sweet Child O' Mine - Guns N' Roses", "November Rain - Guns N' Roses", "Paradise City - Guns N' Roses", "Welcome to the Jungle - Guns N' Roses"],
    correctAnswer: 0,
    artist: "Guns N' Roses",
    title: "Sweet Child O' Mine"
  },
  {
    id: "3",
    audioUrl: "https://cdns-preview-c.dzcdn.net/stream/c-c2ca2a1e8d7f9e8e880d2c6207e92260-8.mp3", // Billie Jean
    options: ["Billie Jean - Michael Jackson", "Beat It - Michael Jackson", "Thriller - Michael Jackson", "Smooth Criminal - Michael Jackson"],
    correctAnswer: 0,
    artist: "Michael Jackson",
    title: "Billie Jean"
  },
  {
    id: "4",
    audioUrl: "https://cdns-preview-a.dzcdn.net/stream/c-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6-8.mp3", // Like a Rolling Stone
    options: ["Like a Rolling Stone - Bob Dylan", "Blowin' in the Wind - Bob Dylan", "The Times They Are a-Changin' - Bob Dylan", "Mr. Tambourine Man - Bob Dylan"],
    correctAnswer: 0,
    artist: "Bob Dylan",
    title: "Like a Rolling Stone"
  },
  {
    id: "5",
    audioUrl: "https://cdns-preview-b.dzcdn.net/stream/c-b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7-8.mp3", // Purple Haze
    options: ["Purple Haze - Jimi Hendrix", "Hey Joe - Jimi Hendrix", "All Along the Watchtower - Jimi Hendrix", "Foxy Lady - Jimi Hendrix"],
    correctAnswer: 0,
    artist: "Jimi Hendrix",
    title: "Purple Haze"
  },
  {
    id: "6",
    audioUrl: "https://cdns-preview-f.dzcdn.net/stream/c-f3g4h5i6j7k8l9m0n1o2p3q4r5s6t7u8-8.mp3", // Hey Jude
    options: ["Yesterday - The Beatles", "Hey Jude - The Beatles", "Let It Be - The Beatles", "Come Together - The Beatles"],
    correctAnswer: 1,
    artist: "The Beatles",
    title: "Hey Jude"
  },
  {
    id: "7",
    audioUrl: "https://cdns-preview-g.dzcdn.net/stream/c-g4h5i6j7k8l9m0n1o2p3q4r5s6t7u8v9-8.mp3", // Smells Like Teen Spirit
    options: ["Smells Like Teen Spirit - Nirvana", "Come As You Are - Nirvana", "Lithium - Nirvana", "In Bloom - Nirvana"],
    correctAnswer: 0,
    artist: "Nirvana",
    title: "Smells Like Teen Spirit"
  },
  {
    id: "8",
    audioUrl: "https://cdns-preview-h.dzcdn.net/stream/c-h5i6j7k8l9m0n1o2p3q4r5s6t7u8v9w0-8.mp3", // Dancing Queen
    options: ["Dancing Queen - ABBA", "Mamma Mia - ABBA", "Fernando - ABBA", "Waterloo - ABBA"],
    correctAnswer: 0,
    artist: "ABBA",
    title: "Dancing Queen"
  }
];

// Deezer API integration (optional - for dynamic music fetching)
const DEEZER_API_BASE = 'https://api.deezer.com';

async function fetchRandomTracks() {
  try {
    // Fetch popular tracks from different genres
    const genres = [113, 116, 132, 152]; // Rock, Pop, Hip Hop, Electronic
    const randomGenre = genres[Math.floor(Math.random() * genres.length)];
    
    const response = await axios.get(`${DEEZER_API_BASE}/genre/${randomGenre}/artists`);
    const artists = response.data.data.slice(0, 10);
    
    const tracks = [];
    for (const artist of artists) {
      try {
        const albumsResponse = await axios.get(`${DEEZER_API_BASE}/artist/${artist.id}/albums`);
        const albums = albumsResponse.data.data.slice(0, 2);
        
        for (const album of albums) {
          const tracksResponse = await axios.get(`${DEEZER_API_BASE}/album/${album.id}/tracks`);
          const albumTracks = tracksResponse.data.data.slice(0, 3);
          tracks.push(...albumTracks);
        }
      } catch (error) {
        console.log(`Error fetching tracks for artist ${artist.id}`);
      }
    }
    
    return tracks.filter(track => track.preview).slice(0, 20);
  } catch (error) {
    console.error('Error fetching tracks from Deezer:', error);
    return [];
  }
}

class GameRoom {
  constructor(roomCode, hostId, hostName) {
    this.roomCode = roomCode;
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
    this.currentQuestion = availableQuestions[questionIndex];
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
      roomCode: this.roomCode,
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

  socket.on('join-room', ({ roomCode, playerName, isHost }) => {
    try {
      let room = gameRooms.get(roomCode);
      
      if (!room) {
        if (!isHost) {
          socket.emit('room-error', { message: 'Room not found' });
          return;
        }
        room = new GameRoom(roomCode, socket.id, playerName);
        gameRooms.set(roomCode, room);
        console.log(`🎮 Created new room: ${roomCode}`);
      } else {
        if (room.gameStarted && !room.gameEnded) {
          socket.emit('room-error', { message: 'Game already in progress' });
          return;
        }
        room.addPlayer(socket.id, playerName);
      }

      socket.join(roomCode);
      playerSockets.set(socket.id, { roomCode, playerName });
      
      io.to(roomCode).emit('room-updated', room.getGameState());
      
      console.log(`👤 Player ${playerName} joined room ${roomCode}`);
      
    } catch (error) {
      console.error('Join room error:', error.message);
      socket.emit('room-error', { message: error.message });
    }
  });

  socket.on('start-game', async (roomCode) => {
    try {
      const room = gameRooms.get(roomCode);
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
        io.to(roomCode).emit('game-started');
        console.log(`🚀 Game started in room ${roomCode}`);
        
        // Send first question after a short delay
        setTimeout(() => {
          io.to(roomCode).emit('new-question', {
            question: room.currentQuestion,
            round: room.currentRound
          });
          
          // Send timer updates
          const timerInterval = setInterval(() => {
            io.to(roomCode).emit('timer-update', room.timeLeft);
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

  socket.on('submit-answer', ({ roomCode, playerName, answer }) => {
    try {
      const room = gameRooms.get(roomCode);
      if (!room || room.gameEnded) return;

      if (room.submitAnswer(socket.id, answer)) {
        console.log(`✅ Player ${playerName} submitted answer ${answer} in room ${roomCode}`);
        
        // Check if round should end
        if (room.roundAnswers.size === room.players.size || room.timeLeft <= 0) {
          room.endRound();
          
          io.to(roomCode).emit('round-results', {
            correctAnswer: room.currentQuestion.correctAnswer,
            players: room.getPlayersArray(),
            question: room.currentQuestion
          });
          
          // Check if game should end
          if (room.currentRound > room.totalRounds) {
            setTimeout(() => {
              room.endGame();
              io.to(roomCode).emit('game-ended', {
                players: room.getPlayersArray()
              });
              console.log(`🏁 Game ended in room ${roomCode}`);
            }, 3000);
          } else {
            // Send next question after delay
            setTimeout(() => {
              if (!room.gameEnded) {
                io.to(roomCode).emit('new-question', {
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

  socket.on('get-final-scores', (roomCode) => {
    const room = gameRooms.get(roomCode);
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
      const room = gameRooms.get(playerData.roomCode);
      if (room) {
        const shouldDeleteRoom = room.removePlayer(socket.id);
        
        if (shouldDeleteRoom) {
          gameRooms.delete(playerData.roomCode);
          console.log(`🗑️ Deleted empty room: ${playerData.roomCode}`);
        } else {
          io.to(playerData.roomCode).emit('room-updated', room.getGameState());
          console.log(`👤 Player ${playerData.playerName} left room ${playerData.roomCode}`);
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'BeatMatch Backend',
    rooms: gameRooms.size,
    players: playerSockets.size,
    timestamp: new Date().toISOString()
  });
});

// Get room info endpoint
app.get('/room/:roomCode', (req, res) => {
  const room = gameRooms.get(req.params.roomCode);
  if (room) {
    res.json(room.getGameState());
  } else {
    res.status(404).json({ error: 'Room not found' });
  }
});

// Get available music tracks endpoint
app.get('/api/tracks', async (req, res) => {
  try {
    const tracks = await fetchRandomTracks();
    res.json({ tracks: tracks.slice(0, 10) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

// Cleanup inactive rooms every 30 minutes
setInterval(() => {
  const now = Date.now();
  const ROOM_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  
  gameRooms.forEach((room, roomCode) => {
    const roomAge = now - Math.min(...Array.from(room.players.values()).map(p => p.joinedAt));
    if (roomAge > ROOM_TIMEOUT && !room.gameStarted) {
      gameRooms.delete(roomCode);
      console.log(`🧹 Cleaned up inactive room: ${roomCode}`);
    }
  });
}, 30 * 60 * 1000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🎵 BeatMatch server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`🎮 Ready for multiplayer music battles!`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});