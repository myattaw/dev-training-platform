import type { TrackSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

// Skeleton: replaced by the full curriculum.
const b = programBuilders('swift');

export const swiftTrack: TrackSource = {
  id: 'swift',
  name: 'Swift',
  category: 'languages',
  description: 'Swift.',
  topics: [
    {
      id: 'swift-seed-topic',
      name: 'Seed',
      description: 'Seed',
      skills: [
        {
          id: 'swift-seed',
          name: 'Seed',
          description: 'Seed',
          questions: b.concept('swift-seed-concept', 1, 'h', [
            { key: 'a', question: 'q a', correct: 'r', wrong: ['w'], why: 'w' },
            { key: 'b', question: 'q b', correct: 'r', wrong: ['w'], why: 'w' },
            { key: 'c', question: 'q c', correct: 'r', wrong: ['w'], why: 'w' },
          ]),
        },
      ],
    },
  ],
};
