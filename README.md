# BeatMatch Backend

Backend server for the BeatMatch music guessing game. Built with Node.js, Express, Socket.IO, and MongoDB.

## Frontend

The frontend application is hosted at [https://beatmatch-delta.vercel.app](https://beatmatch-delta.vercel.app)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:
```
PORT=8000
MONGODB_URI=your_mongodb_uri
FRONTEND_URL=https://beatmatch-delta.vercel.app
```

3. Run the development server:
```bash
npm run dev
```

## Deployment on Render.com

1. Create a new Web Service on Render.com
2. Connect your GitHub repository
3. Use the following settings:
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Add the following environment variables:
   - `MONGODB_URI`: Your MongoDB connection string
   - `FRONTEND_URL`: https://beatmatch-delta.vercel.app
   - `NODE_ENV`: production

The server will automatically build and deploy when you push changes to your repository.

## Features

- Real-time multiplayer game sessions using Socket.IO
- Music guessing gameplay with Spotify integration
- Player score tracking and leaderboards
- Real-time game state synchronization
- Cross-origin resource sharing (CORS) enabled for Vercel frontend

## API Endpoints

- `GET /health`: Health check endpoint
- `GET /api/games`: List active games
- `POST /api/games`: Create new game
- `GET /api/games/:id`: Get game details
- Additional WebSocket events documentation coming soon...

## Development

- `npm run dev`: Start development server with hot reload
- `npm run build`: Build TypeScript code
- `npm test`: Run tests
- `npm start`: Start production server

## Tech Stack

- Node.js
- Express
- Socket.IO
- MongoDB with Mongoose
- TypeScript 