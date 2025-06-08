require('dotenv').config();
const { redisClient, logger } = require('./src/config/redis');

async function testRedisConnection() {
  try {
    // Test basic set/get
    await redisClient.set('test_key', 'Hello from BeatMatch!');
    const value = await redisClient.get('test_key');
    logger.info('Test value from Redis:', value);

    // Test game session
    const testGame = {
      roomId: 'test-room',
      players: [
        {
          id: 'test-player',
          name: 'Test Player',
          score: 100
        }
      ],
      currentRound: 1,
      isActive: true
    };

    // Save game
    await redisClient.setex('game:test-room', 3600, JSON.stringify(testGame));
    
    // Retrieve game
    const savedGame = await redisClient.get('game:test-room');
    logger.info('Test game from Redis:', JSON.parse(savedGame));

    // Clean up
    await redisClient.del('test_key', 'game:test-room');
    
    logger.info('✅ Redis connection and operations test successful!');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Redis test failed:', error);
    process.exit(1);
  }
}

testRedisConnection(); 