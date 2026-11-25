import type { TrackSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

// Skeleton: replaced by the full curriculum.
const b = programBuilders('java');

export const springBootTrack: TrackSource = {
  id: 'spring-boot',
  name: 'Spring Boot',
  category: 'frameworks',
  description: 'Spring Boot.',
  topics: [
    {
      id: 'spring-boot-seed-topic',
      name: 'Seed',
      description: 'Seed',
      skills: [
        {
          id: 'spring-boot-seed',
          name: 'Seed',
          description: 'Seed',
          questions: b.concept('spring-boot-seed-concept', 1, 'h', [
            { key: 'a', question: 'q a', correct: 'r', wrong: ['w'], why: 'w' },
            { key: 'b', question: 'q b', correct: 'r', wrong: ['w'], why: 'w' },
            { key: 'c', question: 'q c', correct: 'r', wrong: ['w'], why: 'w' },
          ]),
        },
      ],
    },
  ],
};
