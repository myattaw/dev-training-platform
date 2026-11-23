import type { TrackSource } from '@pracstack/content-model';
import { componentFamilies, signalFamilies } from './families';

/**
 * Angular: the parts that can be graded and checked today. Every code
 * question is compiled against the real @angular/core types at build time.
 * Topics that need a template compiler or a running app (control flow,
 * forms, routing, HTTP) are planned; see docs/skill-mastery-curriculum.md.
 */
export const angularTrack: TrackSource = {
  id: 'angular',
  name: 'Angular',
  category: 'frameworks',
  description:
    'Modern Angular with signals: signal state, computed values, effects, and component inputs, outputs and queries.',
  topics: [
    {
      id: 'ng-reactivity',
      name: 'Reactivity with signals',
      description: 'Hold state in signals and derive values from it.',
      skills: [
        {
          id: 'ng-signals',
          name: 'Signals, computed and effects',
          description:
            '`signal`, `computed`, `linkedSignal`, `effect`, `untracked` and `toSignal`, and their types.',
          questions: signalFamilies,
        },
      ],
    },
    {
      id: 'ng-components',
      name: 'Components',
      description: 'Pass data into and out of components.',
      skills: [
        {
          id: 'ng-component-io',
          prerequisites: ['ng-signals'],
          name: 'Inputs, outputs, models and queries',
          description:
            '`input`, `output`, `model`, signal queries and `inject`, and how the compiler checks them.',
          questions: componentFamilies,
        },
      ],
    },
  ],
};
