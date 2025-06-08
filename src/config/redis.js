const Redis = require('ioredis');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Redis configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
};

// Create Redis client
const redisClient = new Redis(redisConfig);

redisClient.on('error', (err) => {
  logger.error('Redis Client Error', err);
});

redisClient.on('connect', () => {
  logger.info('Redis Client Connected');
});

// Game-related Redis operations
const GameStore = {
  async saveGame(roomId, gameData) {
    try {
      await redisClient.setex(`game:${roomId}`, 3600, JSON.stringify(gameData));
    } catch (error) {
      logger.error('Error saving game:', error);
      throw error;
    }
  },

  async getGame(roomId) {
    try {
      const gameData = await redisClient.get(`game:${roomId}`);
      return gameData ? JSON.parse(gameData) : null;
    } catch (error) {
      logger.error('Error getting game:', error);
      throw error;
    }
  },

  async deleteGame(roomId) {
    try {
      await redisClient.del(`game:${roomId}`);
    } catch (error) {
      logger.error('Error deleting game:', error);
      throw error;
    }
  },

  async updatePlayerScore(roomId, playerId, score) {
    try {
      const game = await this.getGame(roomId);
      if (game) {
        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex !== -1) {
          game.players[playerIndex].score = score;
          await this.saveGame(roomId, game);
        }
      }
    } catch (error) {
      logger.error('Error updating player score:', error);
      throw error;
    }
  }
};

module.exports = {
  redisClient,
  GameStore,
  logger
}; 