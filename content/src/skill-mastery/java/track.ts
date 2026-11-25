import type { TrackSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

// Skeleton: replaced by the full curriculum.
const b = programBuilders('java');

export const javaTrack: TrackSource = {
  id: 'java',
  name: 'Java',
  category: 'languages',
  description: 'Java.',
  topics: [
    {
      id: 'java-seed-topic',
      name: 'Seed',
      description: 'Seed',
      skills: [
        {
          id: 'java-seed',
          name: 'Seed',
          description: 'Seed',
          questions: b.concept('java-seed-concept', 1, 'h', [
            { key: 'a', question: 'q a', correct: 'r', wrong: ['w'], why: 'w' },
            { key: 'b', question: 'q b', correct: 'r', wrong: ['w'], why: 'w' },
            { key: 'c', question: 'q c', correct: 'r', wrong: ['w'], why: 'w' },
          ]),
        },
      ],
    },
  ],
};
