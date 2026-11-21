import type { TrackSource } from '@pracstack/content-model';
import {
  functionFamilies,
  groupByFamilies,
  joinFamilies,
  orderLimitFamilies,
  selectWhereFamilies,
  subqueryFamilies,
} from './families';
import {
  groupByQuestions,
  joinQuestions,
  orderLimitQuestions,
  selectWhereQuestions,
} from './questions';

export const postgresqlTrack: TrackSource = {
  id: 'postgresql',
  name: 'PostgreSQL',
  description:
    'Query relational data with SQL: filtering, sorting, expressions, aggregation, joins and subqueries.',
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
          questions: [...selectWhereQuestions, ...selectWhereFamilies],
        },
        {
          id: 'pg-order-limit',
          name: 'ORDER BY and LIMIT',
          description: 'Sort results, take the first rows, and page through them.',
          questions: [...orderLimitQuestions, ...orderLimitFamilies],
        },
      ],
    },
    {
      id: 'pg-expressions',
      name: 'Expressions',
      description: 'Compute new values from columns.',
      skills: [
        {
          id: 'pg-functions-case',
          name: 'Functions, CASE and COALESCE',
          description:
            'Text, number and date functions; conditional values with CASE; NULL fallbacks with COALESCE.',
          questions: functionFamilies,
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
          questions: [...groupByQuestions, ...groupByFamilies],
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
          name: 'Inner, left and self joins',
          description:
            'Match rows across tables, keep rows without a match, and find missing partners.',
          questions: [...joinQuestions, ...joinFamilies],
        },
      ],
    },
    {
      id: 'pg-subqueries',
      name: 'Subqueries',
      description: 'Use the result of one query inside another.',
      skills: [
        {
          id: 'pg-subqueries-basics',
          name: 'Scalar, IN and EXISTS subqueries',
          description:
            'Compare with a computed value, test membership, and check for related rows, including the NOT IN trap.',
          questions: subqueryFamilies,
        },
      ],
    },
  ],
};
