import type { TrackSource } from '@pracstack/content-model';
import { seedFamilies } from './seed';

export const pythonTrack: TrackSource = {
  id: 'python',
  name: 'Python',
  category: 'languages',
  description: 'Python 3.14.',
  topics: [
    {
      id: 'py-seed-topic',
      name: 'Seed',
      description: 'Seed',
      skills: [{ id: 'py-seed', name: 'Seed', description: 'Seed', questions: seedFamilies }],
    },
  ],
};
