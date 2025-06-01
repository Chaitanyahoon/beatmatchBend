import { SongQuestion } from '../types';
import { logger } from './logger';

// This is a placeholder implementation. In a real application,
// this would fetch songs from a database or external music API
export function generateSongQuestion(): SongQuestion {
  const mockSongs = [
    { id: '1', name: 'Bohemian Rhapsody', artist: 'Queen' },
    { id: '2', name: 'Billie Jean', artist: 'Michael Jackson' },
    { id: '3', name: 'Sweet Child O\' Mine', artist: 'Guns N\' Roses' },
    { id: '4', name: 'Smells Like Teen Spirit', artist: 'Nirvana' }
  ];

  const randomSong = mockSongs[Math.floor(Math.random() * mockSongs.length)];
  const incorrectOptions = mockSongs
    .filter(song => song.id !== randomSong.id)
    .map(song => song.name);

  // Shuffle the options
  const options = [randomSong.name, ...incorrectOptions.slice(0, 3)]
    .sort(() => Math.random() - 0.5);

  const question: SongQuestion = {
    id: randomSong.id,
    correctAnswer: randomSong.name,
    options,
    startTime: Date.now(),
    endTime: Date.now() + 15000, // 15 seconds to answer
    timeLimit: 15000
  };

  logger.debug('Generated song question:', question);
  return question;
} 