import { Express } from 'express';
import { GameModel } from '../models/Game';

export const setupRoutes = (app: Express) => {
  // List active games
  app.get('/api/games', async (req, res) => {
    try {
      const games = await GameModel.find({ isActive: true });
      res.json(games);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch games' });
    }
  });

  // Create new game
  app.post('/api/games', async (req, res) => {
    try {
      const { roomId, hostName } = req.body;
      const game = new GameModel({
        roomId,
        players: [{
          id: 'host',
          name: hostName,
          score: 0,
          correctAnswers: 0
        }]
      });
      await game.save();
      res.status(201).json(game);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create game' });
    }
  });

  // Get specific game
  app.get('/api/games/:roomId', async (req, res) => {
    try {
      const game = await GameModel.findOne({ 
        roomId: req.params.roomId,
        isActive: true 
      });
      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }
      res.json(game);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch game' });
    }
  });
}; 