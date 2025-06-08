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

// Redis Configuration
const getRedisConfig = () => {
  // Check if we're in production (Railway)
  if (process.env.NODE_ENV === 'production') {
    // Log Redis configuration in production
    logger.info('Production Redis Config:', {
      REDIS_URL: process.env.REDIS_URL ? 'Set' : 'Not Set',
      NODE_ENV: process.env.NODE_ENV
    });

    return {
      url: process.env.REDIS_URL,
      maxRetriesPerRequest: null,
      retryStrategy(times) {
        const delay = Math.min(times * 100, 3000);
        logger.info(`Retrying Redis connection, attempt ${times}, delay: ${delay}ms`);
        return delay;
      },
      reconnectOnError(err) {
        logger.error('Redis reconnect on error:', err);
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
      enableOfflineQueue: true,
      connectTimeout: 20000,
      disconnectTimeout: 20000,
      commandTimeout: 10000,
      lazyConnect: true
    };
  }

  // For local development
  const config = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      const delay = Math.min(times * 100, 3000);
      logger.info(`Retrying Redis connection, attempt ${times}, delay: ${delay}ms`);
      return delay;
    },
    enableOfflineQueue: true,
    connectTimeout: 20000,
    lazyConnect: true
  };

  logger.info('Development Redis Config:', {
    host: config.host,
    port: config.port,
    password: config.password ? 'Set' : 'Not Set'
  });

  return config;
};

// Create Redis client
const redisConfig = getRedisConfig();
const redisClient = new Redis(redisConfig);

// Redis connection events
redisClient.on('connect', () => {
  logger.info('Redis Client Connected');
});

redisClient.on('error', (err) => {
  logger.error('Redis Client Error', {
    error: err.message,
    stack: err.stack,
    code: err.code
  });
});

redisClient.on('ready', () => {
  logger.info('Redis Client Ready');
});

redisClient.on('reconnecting', (delay) => {
  logger.info('Redis Client Reconnecting', { delay });
});

redisClient.on('end', () => {
  logger.error('Redis Client Connection Ended');
});

// Modified GameStore to handle Redis connection issues
const GameStore = {
  // Key prefixes
  keys: {
    game: (roomId) => `game:${roomId}`,
    activeGames: 'active_games'
  },

  async isRedisConnected() {
    try {
      await redisClient.ping();
      return true;
    } catch (error) {
      logger.error('Redis connection check failed:', error);
      return false;
    }
  },

  // Store a game session (expires in 3 hours)
  async saveGame(roomId, gameData) {
    try {
      if (!await this.isRedisConnected()) {
        logger.warn('Redis not connected, skipping save operation');
        return;
      }
      const key = this.keys.game(roomId);
      await redisClient.setex(key, 10800, JSON.stringify(gameData));
      await redisClient.sadd(this.keys.activeGames, roomId);
      logger.info(`Game saved: ${roomId}`);
    } catch (error) {
      logger.error('Error saving game:', error);
      // Don't throw error, return null instead
      return null;
    }
  },

  // Get a game session
  async getGame(roomId) {
    try {
      if (!await this.isRedisConnected()) {
        logger.warn('Redis not connected, returning null');
        return null;
      }
      const key = this.keys.game(roomId);
      const gameData = await redisClient.get(key);
      return gameData ? JSON.parse(gameData) : null;
    } catch (error) {
      logger.error('Error getting game:', error);
      return null;
    }
  },

  // Delete a game session
  async deleteGame(roomId) {
    try {
      const key = this.keys.game(roomId);
      await redisClient.del(key);
      await redisClient.srem(this.keys.activeGames, roomId);
      logger.info(`Game deleted: ${roomId}`);
    } catch (error) {
      logger.error('Error deleting game:', error);
      throw error;
    }
  },

  // Get all active games
  async getActiveGames() {
    try {
      if (!await this.isRedisConnected()) {
        logger.warn('Redis not connected, returning empty array');
        return [];
      }
      const roomIds = await redisClient.smembers(this.keys.activeGames);
      const games = await Promise.all(
        roomIds.map(async (roomId) => {
          const game = await this.getGame(roomId);
          return game;
        })
      );
      return games.filter(game => game !== null);
    } catch (error) {
      logger.error('Error getting active games:', error);
      return [];
    }
  },

  // Update player score
  async updatePlayerScore(roomId, playerId, score) {
    try {
      const game = await this.getGame(roomId);
      if (game) {
        const playerIndex = game.players.findIndex(p => p.id === playerId);
        if (playerIndex !== -1) {
          game.players[playerIndex].score = score;
          await this.saveGame(roomId, game);
          logger.info(`Score updated for player ${playerId} in game ${roomId}`);
        }
      }
    } catch (error) {
      logger.error('Error updating player score:', error);
      throw error;
    }
  },

  // Clean up expired games
  async cleanupExpiredGames() {
    try {
      const activeGames = await this.getActiveGames();
      for (const game of activeGames) {
        if (!game.isActive) {
          await this.deleteGame(game.roomId);
          logger.info(`Cleaned up expired game: ${game.roomId}`);
        }
      }
    } catch (error) {
      logger.error('Error cleaning up expired games:', error);
      throw error;
    }
  }
};

// Export the Redis client and game store
module.exports = {
  redisClient,
  GameStore,
  logger
}; 