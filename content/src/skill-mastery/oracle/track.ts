import type { TrackSource } from '@pracstack/content-model';
import {
  conditionalFamilies,
  dateFamilies,
  hierarchyFamilies,
  nullFamilies,
  rowLimitingFamilies,
} from './families';
import {
  conditionalQuestions,
  dateQuestions,
  hierarchyQuestions,
  nullQuestions,
  rowLimitingQuestions,
} from './questions';

export const oracleTrack: TrackSource = {
  id: 'oracle-sql',
  name: 'Oracle SQL',
  description:
    'Oracle-specific SQL: row limiting, NULLs and NVL, dates, DECODE and CASE, and hierarchical queries.',
  topics: [
    {
      id: 'ora-query-basics',
      name: 'Oracle query basics',
      description: 'DUAL, limiting rows, and how Oracle treats NULL and empty strings.',
      skills: [
        {
          id: 'ora-row-limiting',
          name: 'DUAL, ROWNUM and FETCH FIRST',
          description: 'Select expressions from DUAL, and take the first rows correctly.',
          questions: [...rowLimitingQuestions, ...rowLimitingFamilies],
        },
        {
          id: 'ora-nulls',
          name: 'NULLs, NVL and COALESCE',
          description: "Handle missing values, and Oracle's empty-string rule.",
          questions: [...nullQuestions, ...nullFamilies],
        },
      ],
    },
    {
      id: 'ora-functions',
      name: 'Oracle functions',
      description: 'Work with dates and conditional expressions.',
      skills: [
        {
          id: 'ora-dates',
          name: 'Dates',
          description: 'Format, extract and calculate with DATE values.',
          questions: [...dateQuestions, ...dateFamilies],
        },
        {
          id: 'ora-decode-case',
          prerequisites: ['ora-nulls'],
          name: 'DECODE and CASE',
          description: 'Choose values by condition, and know where DECODE differs from CASE.',
          questions: [...conditionalQuestions, ...conditionalFamilies],
        },
      ],
    },
    {
      id: 'ora-hierarchies',
      name: 'Hierarchical queries',
      description: 'Walk tree-shaped data such as a management chain.',
      skills: [
        {
          id: 'ora-connect-by',
          prerequisites: ['ora-row-limiting'],
          name: 'CONNECT BY',
          description: 'Use START WITH, CONNECT BY PRIOR, LEVEL and SYS_CONNECT_BY_PATH.',
          questions: [...hierarchyQuestions, ...hierarchyFamilies],
        },
      ],
    },
  ],
};
