import type { TrackSource } from '@pracstack/content-model';
import { bulkQuestions, triggerQuestions } from './advanced';
import { blockQuestions, controlQuestions } from './basics';
import { cursorQuestions, exceptionQuestions } from './data';
import { moreBulkQuestions, moreTriggerQuestions } from './more-advanced';
import { moreBlockQuestions, moreControlQuestions } from './more-basics';
import { moreCursorQuestions, moreExceptionQuestions } from './more-data';
import { morePackageQuestions, moreSubprogramQuestions } from './more-units';
import { packageQuestions, subprogramQuestions } from './units';

/**
 * Oracle PL/SQL: the procedural language job postings ask for alongside Oracle
 * SQL ("stored procedures, functions and packages"). Every code sample is run
 * on Oracle Database Free by content/src/checks/plsql-snippets.spec.ts; the
 * questions themselves need no database, so they work everywhere.
 */
export const plsqlTrack: TrackSource = {
  id: 'oracle-plsql',
  name: 'Oracle PL/SQL',
  category: 'databases',
  description:
    'Blocks, cursors, exceptions, procedures, functions, packages, bulk processing and triggers.',
  topics: [
    {
      id: 'plsql-basics',
      name: 'PL/SQL basics',
      description: 'Anonymous blocks, variables, SELECT INTO, conditions and loops.',
      skills: [
        {
          id: 'plsql-blocks',
          name: 'Blocks and variables',
          description: 'DECLARE, BEGIN and END, %TYPE, DBMS_OUTPUT and SELECT INTO.',
          questions: [...blockQuestions, ...moreBlockQuestions],
        },
        {
          id: 'plsql-control',
          prerequisites: ['plsql-blocks'],
          name: 'Conditions and loops',
          description: 'IF and ELSIF, CASE, FOR, WHILE and basic loops, and NULL in conditions.',
          questions: [...controlQuestions, ...moreControlQuestions],
        },
      ],
    },
    {
      id: 'plsql-data',
      name: 'Working with data',
      description: 'Process query results and handle errors.',
      skills: [
        {
          id: 'plsql-cursors',
          prerequisites: ['plsql-control'],
          name: 'Cursors and %ROWTYPE',
          description: 'Cursor FOR loops, explicit cursors, cursor attributes and SQL%ROWCOUNT.',
          questions: [...cursorQuestions, ...moreCursorQuestions],
        },
        {
          id: 'plsql-exceptions',
          prerequisites: ['plsql-blocks'],
          name: 'Exceptions',
          description:
            'NO_DATA_FOUND and friends, your own exceptions, RAISE_APPLICATION_ERROR and propagation.',
          questions: [...exceptionQuestions, ...moreExceptionQuestions],
        },
      ],
    },
    {
      id: 'plsql-program-units',
      name: 'Stored program units',
      description: 'The procedures, functions and packages job postings ask for.',
      skills: [
        {
          id: 'plsql-subprograms',
          prerequisites: ['plsql-exceptions'],
          name: 'Procedures and functions',
          description: 'Create and call them; IN, OUT and IN OUT parameters; functions in SQL.',
          questions: [...subprogramQuestions, ...moreSubprogramQuestions],
        },
        {
          id: 'plsql-packages',
          prerequisites: ['plsql-subprograms'],
          name: 'Packages',
          description: 'Specification and body, private routines, package state and overloading.',
          questions: [...packageQuestions, ...morePackageQuestions],
        },
      ],
    },
    {
      id: 'plsql-advanced',
      name: 'Bulk processing and triggers',
      description: 'Work with many rows efficiently, and react to changes.',
      skills: [
        {
          id: 'plsql-bulk',
          prerequisites: ['plsql-cursors'],
          name: 'BULK COLLECT and FORALL',
          description: 'Collections, batch fetching with LIMIT, and batch DML.',
          questions: [...bulkQuestions, ...moreBulkQuestions],
        },
        {
          id: 'plsql-triggers',
          prerequisites: ['plsql-subprograms'],
          name: 'Triggers',
          description: 'Row and statement triggers, :NEW and :OLD, BEFORE and AFTER.',
          questions: [...triggerQuestions, ...moreTriggerQuestions],
        },
      ],
    },
  ],
};
