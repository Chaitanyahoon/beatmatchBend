# BeatMatch Backend

A real-time multiplayer music guessing game backend built with Node.js, Socket.IO, and Redis.

## Features

- Real-time multiplayer gameplay
- Spotify integration for music tracks
- Redis-based game state management
- Score tracking and leaderboards
- Player session management
- Rate limiting and error handling

## Prerequisites

- Node.js >= 14.0.0
- Redis (for local development)
- Spotify Developer Account

## Environment Variables

```env
# Required in production (Railway will provide these)
REDIS_URL=your-redis-url
NODE_ENV=production

# Spotify API credentials
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret

# Frontend URL
FRONTEND_URL=your-frontend-url
```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/beatmatch-backend.git
cd beatmatch-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with your configuration.

## Development

Run the development server:
```bash
npm run dev
```

## Production

For production deployment on Railway:

1. Push code to GitHub
2. Create new project on Railway
3. Connect to GitHub repository
4. Add environment variables
5. Add Redis plugin

## API Endpoints

- `GET /health` - Health check endpoint
- `POST /api/games` - Create a new game
- `GET /api/games/:roomId` - Get game details
- `GET /api/games` - List active games

## WebSocket Events

### Client -> Server
- `join-game` - Join a game room
- `start-game` - Start the game
- `submit-answer` - Submit an answer

### Server -> Client
- `player-joined` - New player joined
- `game-started` - Game has started
- `round-started` - New round started
- `answer-submitted` - Player submitted an answer
- `round-ended` - Round has ended
- `game-ended` - Game has ended

## Game Flow

1. Players join a room (up to 4 players)
2. Host starts the game
3. Each round:
   - Random song is selected
   - Players guess the song
   - Points awarded based on:
     - Base points (100)
     - Time bonus (up to 50)
     - Streak bonus (25 per streak)
4. After 10 rounds, final scores displayed

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT 