import type { TrackSource } from '@pracstack/content-model';
import {
  groupByQuestions,
  joinQuestions,
  orderLimitQuestions,
  selectWhereQuestions,
} from './questions';

export const postgresqlTrack: TrackSource = {
  id: 'postgresql',
  name: 'PostgreSQL',
  description: 'Query relational data with SQL: filtering, sorting, aggregation and joins.',
  topics: [
    {
      id: 'pg-basic-queries',
      name: 'Basic queries',
      description: 'Select, filter and sort rows from a single table.',
      skills: [
        {
          id: 'pg-select-where',
          name: 'SELECT and WHERE',
          description: 'Choose columns and filter rows, including NULL handling.',
          questions: selectWhereQuestions,
        },
        {
          id: 'pg-order-limit',
          name: 'ORDER BY and LIMIT',
          description: 'Sort results and take the first rows.',
          questions: orderLimitQuestions,
        },
      ],
    },
    {
      id: 'pg-aggregation',
      name: 'Aggregation',
      description: 'Summarize rows with aggregate functions and groups.',
      skills: [
        {
          id: 'pg-group-by',
          name: 'GROUP BY and HAVING',
          description: 'Count, sum and average per group, and filter groups.',
          questions: groupByQuestions,
        },
      ],
    },
    {
      id: 'pg-joins',
      name: 'Joins',
      description: 'Combine rows from related tables.',
      skills: [
        {
          id: 'pg-joins-basics',
          name: 'Inner and left joins',
          description: 'Match rows across tables, and keep rows without a match.',
          questions: joinQuestions,
        },
      ],
    },
  ],
};
