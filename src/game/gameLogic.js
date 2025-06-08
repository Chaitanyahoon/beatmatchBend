const SpotifyWebApi = require('spotify-web-api-node');

// Initialize Spotify API client
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET
});

// Game constants
const GAME_CONSTANTS = {
  MAX_PLAYERS: 4,
  ROUNDS: 10,
  ANSWER_TIME_LIMIT: 30, // seconds
  SCORING: {
    BASE_POINTS: 100,
    TIME_BONUS_MAX: 50,
    STREAK_BONUS: 25,
    ROUND_BONUS: 50
  },
  GENRES: [
    'pop', 'rock', 'hip-hop', 'r-n-b', 'jazz',
    'electronic', 'classical', 'country', 'latin'
  ]
};

class GameSession {
  constructor(roomId, hostName) {
    this.roomId = roomId;
    this.players = [{
      id: 'host',
      name: hostName,
      score: 0,
      correctAnswers: 0,
      streak: 0,
      lastAnswerTime: null
    }];
    this.currentRound = 0;
    this.totalRounds = GAME_CONSTANTS.ROUNDS;
    this.isActive = true;
    this.startedAt = new Date();
    this.endedAt = null;
    this.roundStartTime = null;
    this.currentSong = null;
    this.roundAnswers = new Map();
  }

  async startNewRound() {
    if (this.currentRound >= this.totalRounds) {
      return this.endGame();
    }

    this.currentRound++;
    this.roundStartTime = Date.now();
    this.roundAnswers.clear();

    // Get a random genre
    const randomGenre = GAME_CONSTANTS.GENRES[
      Math.floor(Math.random() * GAME_CONSTANTS.GENRES.length)
    ];

    try {
      // Get access token if needed
      if (!spotifyApi.getAccessToken()) {
        const data = await spotifyApi.clientCredentialsGrant();
        spotifyApi.setAccessToken(data.body['access_token']);
      }

      // Get random track from genre
      const data = await spotifyApi.searchTracks(`genre:${randomGenre}`, {
        limit: 50,
        offset: Math.floor(Math.random() * 1000)
      });

      if (data.body.tracks.items.length > 0) {
        const randomTrack = data.body.tracks.items[
          Math.floor(Math.random() * data.body.tracks.items.length)
        ];

        this.currentSong = {
          id: randomTrack.id,
          name: randomTrack.name,
          artist: randomTrack.artists[0].name,
          previewUrl: randomTrack.preview_url,
          genre: randomGenre
        };

        return {
          roundNumber: this.currentRound,
          previewUrl: this.currentSong.preview_url,
          options: await this.generateOptions()
        };
      }
    } catch (error) {
      console.error('Error starting new round:', error);
      throw error;
    }
  }

  async generateOptions() {
    // Generate 4 options including the correct answer
    const options = [this.currentSong.name];
    
    try {
      // Get similar tracks for wrong options
      const data = await spotifyApi.searchTracks(`genre:${this.currentSong.genre}`, {
        limit: 10
      });

      const wrongOptions = data.body.tracks.items
        .filter(track => track.id !== this.currentSong.id)
        .map(track => track.name)
        .slice(0, 3);

      options.push(...wrongOptions);

      // Shuffle options
      return options.sort(() => Math.random() - 0.5);
    } catch (error) {
      console.error('Error generating options:', error);
      throw error;
    }
  }

  submitAnswer(playerId, answer) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || this.roundAnswers.has(playerId)) {
      return null;
    }

    const answerTime = (Date.now() - this.roundStartTime) / 1000;
    const isCorrect = answer === this.currentSong.name;
    let points = 0;

    if (isCorrect) {
      // Base points
      points += GAME_CONSTANTS.SCORING.BASE_POINTS;

      // Time bonus (linear decrease from max to 0 over 30 seconds)
      const timeBonus = Math.max(0, 
        GAME_CONSTANTS.SCORING.TIME_BONUS_MAX * 
        (1 - answerTime / GAME_CONSTANTS.ANSWER_TIME_LIMIT)
      );
      points += Math.floor(timeBonus);

      // Streak bonus
      points += player.streak * GAME_CONSTANTS.SCORING.STREAK_BONUS;

      player.correctAnswers++;
      player.streak++;
    } else {
      player.streak = 0;
    }

    player.score += points;
    player.lastAnswerTime = Date.now();
    
    this.roundAnswers.set(playerId, {
      isCorrect,
      points,
      answerTime
    });

    return {
      playerId,
      isCorrect,
      points,
      newScore: player.score,
      streak: player.streak
    };
  }

  isRoundComplete() {
    return this.players.every(player => 
      this.roundAnswers.has(player.id)
    );
  }

  getRoundSummary() {
    return {
      roundNumber: this.currentRound,
      song: {
        name: this.currentSong.name,
        artist: this.currentSong.artist
      },
      playerResults: this.players.map(player => ({
        name: player.name,
        result: this.roundAnswers.get(player.id),
        totalScore: player.score,
        streak: player.streak
      }))
    };
  }

  endGame() {
    this.isActive = false;
    this.endedAt = new Date();

    // Add round completion bonus to all players
    this.players.forEach(player => {
      player.score += GAME_CONSTANTS.SCORING.ROUND_BONUS;
    });

    // Sort players by score
    const sortedPlayers = [...this.players].sort((a, b) => b.score - a.score);

    return {
      winner: sortedPlayers[0],
      leaderboard: sortedPlayers.map(player => ({
        name: player.name,
        score: player.score,
        correctAnswers: player.correctAnswers
      })),
      gameStats: {
        duration: this.endedAt - this.startedAt,
        totalRounds: this.totalRounds
      }
    };
  }

  addPlayer(playerId, playerName) {
    if (this.players.length >= GAME_CONSTANTS.MAX_PLAYERS) {
      throw new Error('Game room is full');
    }

    this.players.push({
      id: playerId,
      name: playerName,
      score: 0,
      correctAnswers: 0,
      streak: 0,
      lastAnswerTime: null
    });

    return this.players;
  }

  removePlayer(playerId) {
    this.players = this.players.filter(p => p.id !== playerId);
    return this.players.length === 0;
  }
}

module.exports = {
  GameSession,
  GAME_CONSTANTS
}; 