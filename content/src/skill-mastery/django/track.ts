import type { TrackSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

// Skeleton: replaced by the full curriculum.
const b = programBuilders('python');

export const djangoTrack: TrackSource = {
  id: 'django',
  name: 'Django',
  category: 'frameworks',
  description: 'Django.',
  topics: [
    {
      id: 'django-seed-topic',
      name: 'Seed',
      description: 'Seed',
      skills: [
        {
          id: 'django-seed',
          name: 'Seed',
          description: 'Seed',
          questions: b.concept('django-seed-concept', 1, 'h', [
            { key: 'a', question: 'q a', correct: 'r', wrong: ['w'], why: 'w' },
            { key: 'b', question: 'q b', correct: 'r', wrong: ['w'], why: 'w' },
            { key: 'c', question: 'q c', correct: 'r', wrong: ['w'], why: 'w' },
          ]),
        },
      ],
    },
  ],
};
