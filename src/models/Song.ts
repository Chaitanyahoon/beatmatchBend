import { Schema, model } from 'mongoose';

interface Song {
  title: string;
  artist: string;
  audioUrl: string;
  options: string[];
  correctOption: number;
  difficulty: 'easy' | 'medium' | 'hard';
  genre?: string;
}

const songSchema = new Schema<Song>({
  title: { type: String, required: true },
  artist: { type: String, required: true },
  audioUrl: { type: String, required: true },
  options: [{ type: String, required: true }],
  correctOption: { type: Number, required: true },
  difficulty: { 
    type: String, 
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  genre: { type: String }
});

export const SongModel = model<Song>('Song', songSchema); 