# BeatMatch Backend

A real-time multiplayer music guessing game backend built with JavaScript/TypeScript, Socket.IO, and Express.

## Features

- Real-time multiplayer game rooms
- Player session management
- Game state synchronization
- Score tracking with time bonuses
- Player streaks
- Automatic cleanup of inactive sessions
- Type-safe Socket.IO events (TypeScript version)
- Comprehensive error handling and logging

## Prerequisites

- Node.js >= 18.0.0
- npm

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd beatmatch-bend-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

## Development

The project supports both JavaScript and TypeScript development environments.

### JavaScript Development (Production Version)
```bash
npm run dev
# or
npm run dev:js
```

### TypeScript Development (Type-Safe Version)
```bash
npm run dev:ts
```

The server will be running at `http://localhost:3001`.

## Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
# Test game functionality
npm run test:js

# Test multiplayer features
npm run test:multi

# Test connection handling
npm run test:connection
```

## Project Structure

```
├── server.js                # Main JavaScript server file (Production)
├── quick-game-test.js       # Game testing utility
├── test-multiplayer.js      # Multiplayer testing utility
├── test-connection.js       # Connection testing utility
├── src/                     # TypeScript source files
│   ├── index.ts            # TypeScript server implementation
│   ├── types.ts            # Type definitions
│   ├── services/
│   │   └── GameManager.ts  # Game logic and state management
│   └── utils/
│       ├── logger.ts       # Winston logger configuration
│       └── songUtils.ts    # Song-related utilities
```

## Deployment

The project is configured for deployment on Render.com using the JavaScript version.

1. Make sure the following environment variables are set:
   - `PORT`: Server port (default: 3001)
   - `NODE_ENV`: Set to 'production' for deployment
   - `FRONTEND_URL`: Your frontend application URL

2. The `Procfile` and `server.js` are used for production deployment.

## API Endpoints

### POST /api/games
Creates a new game room.

Request body:
```json
{
  "roomId": "string",
  "hostName": "string"
}
```

Response:
```json
{
  "roomId": "string",
  "hostId": "string"
}
```

## Socket.IO Events

### Client to Server
- `join-game`: Join a game room
- `start-game`: Start the game (host only)
- `submit-answer`: Submit an answer for the current round
- `leave-game`: Leave the current game

### Server to Client
- `player-joined`: New player joined the room
- `game-started`: Game has started
- `answer-submitted`: Player submitted an answer
- `round-ended`: Current round has ended
- `game-ended`: Game has finished
- `error`: Error occurred

## Game Flow

1. Host creates a game room via REST API
2. Players join the room using Socket.IO
3. Host starts the game when ready
4. Each round:
   - Server sends song question
   - Players submit answers
   - Scores are calculated
   - Next round starts
5. Game ends after final round
6. Winner is announced
7. Room is cleaned up

## Error Handling

- Comprehensive error handling for all API endpoints
- Socket.IO error events for client notification
- Winston logger for error tracking
- Automatic cleanup of inactive sessions

## License

MIT 