const { redisClient, logger } = require('../config/redis');

class RedisGameService {
  constructor() {
    this.keyPrefix = 'game:';
    this.expireTime = 3600; // 1 hour in seconds
  }

  // Key generation helpers
  getGameKey(roomId) {
    return `${this.keyPrefix}${roomId}`;
  }

  getPlayerKey(roomId, playerId) {
    return `${this.keyPrefix}${roomId}:player:${playerId}`;
  }

  getRoundKey(roomId, roundNumber) {
    return `${this.keyPrefix}${roomId}:round:${roundNumber}`;
  }

  // Game operations
  async createGame(roomId, gameData) {
    try {
      const key = this.getGameKey(roomId);
      await redisClient.setex(
        key,
        this.expireTime,
        JSON.stringify({
          ...gameData,
          createdAt: Date.now()
        })
      );
      logger.info(`Game created: ${roomId}`);
      return true;
    } catch (error) {
      logger.error(`Error creating game: ${error.message}`);
      throw error;
    }
  }

  async getGame(roomId) {
    try {
      const key = this.getGameKey(roomId);
      const game = await redisClient.get(key);
      return game ? JSON.parse(game) : null;
    } catch (error) {
      logger.error(`Error getting game: ${error.message}`);
      throw error;
    }
  }

  async updateGame(roomId, gameData) {
    try {
      const key = this.getGameKey(roomId);
      const existingGame = await this.getGame(roomId);
      
      if (!existingGame) {
        throw new Error('Game not found');
      }

      const updatedGame = {
        ...existingGame,
        ...gameData,
        updatedAt: Date.now()
      };

      await redisClient.setex(
        key,
        this.expireTime,
        JSON.stringify(updatedGame)
      );

      return updatedGame;
    } catch (error) {
      logger.error(`Error updating game: ${error.message}`);
      throw error;
    }
  }

  async deleteGame(roomId) {
    try {
      const key = this.getGameKey(roomId);
      await redisClient.del(key);
      logger.info(`Game deleted: ${roomId}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting game: ${error.message}`);
      throw error;
    }
  }

  // Player operations
  async addPlayer(roomId, player) {
    try {
      const game = await this.getGame(roomId);
      if (!game) {
        throw new Error('Game not found');
      }

      game.players = game.players || [];
      game.players.push(player);

      await this.updateGame(roomId, game);
      return game;
    } catch (error) {
      logger.error(`Error adding player: ${error.message}`);
      throw error;
    }
  }

  async removePlayer(roomId, playerId) {
    try {
      const game = await this.getGame(roomId);
      if (!game) {
        throw new Error('Game not found');
      }

      game.players = game.players.filter(p => p.id !== playerId);
      await this.updateGame(roomId, game);
      return game;
    } catch (error) {
      logger.error(`Error removing player: ${error.message}`);
      throw error;
    }
  }

  // Round operations
  async saveRound(roomId, roundNumber, roundData) {
    try {
      const key = this.getRoundKey(roomId, roundNumber);
      await redisClient.setex(
        key,
        this.expireTime,
        JSON.stringify({
          ...roundData,
          timestamp: Date.now()
        })
      );
      return true;
    } catch (error) {
      logger.error(`Error saving round: ${error.message}`);
      throw error;
    }
  }

  async getRound(roomId, roundNumber) {
    try {
      const key = this.getRoundKey(roomId, roundNumber);
      const round = await redisClient.get(key);
      return round ? JSON.parse(round) : null;
    } catch (error) {
      logger.error(`Error getting round: ${error.message}`);
      throw error;
    }
  }

  // Score operations
  async updatePlayerScore(roomId, playerId, score) {
    try {
      const game = await this.getGame(roomId);
      if (!game) {
        throw new Error('Game not found');
      }

      const player = game.players.find(p => p.id === playerId);
      if (!player) {
        throw new Error('Player not found');
      }

      player.score = score;
      await this.updateGame(roomId, game);
      return game;
    } catch (error) {
      logger.error(`Error updating player score: ${error.message}`);
      throw error;
    }
  }

  // Utility functions
  async getAllActiveGames() {
    try {
      const keys = await redisClient.keys(`${this.keyPrefix}*`);
      const games = await Promise.all(
        keys
          .filter(key => !key.includes(':player:') && !key.includes(':round:'))
          .map(async key => {
            const game = await redisClient.get(key);
            return game ? JSON.parse(game) : null;
          })
      );
      return games.filter(game => game && game.isActive);
    } catch (error) {
      logger.error(`Error getting active games: ${error.message}`);
      throw error;
    }
  }

  async cleanupInactiveGames() {
    try {
      const games = await this.getAllActiveGames();
      const now = Date.now();
      const inactiveGames = games.filter(
        game => now - game.updatedAt > this.expireTime * 1000
      );

      await Promise.all(
        inactiveGames.map(game => this.deleteGame(game.roomId))
      );

      logger.info(`Cleaned up ${inactiveGames.length} inactive games`);
      return inactiveGames.length;
    } catch (error) {
      logger.error(`Error cleaning up inactive games: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new RedisGameService(); 