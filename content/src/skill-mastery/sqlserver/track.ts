import type { TrackSource } from '@pracstack/content-model';
import { advancedQueryFamilies } from './advanced';
import { dataModelingFamilies } from './modeling';
import { performanceFamilies } from './performance';
import { programmingFamilies } from './programming';
import { joinsAggregationFamilies, queryingFamilies } from './querying';
import { transactionFamilies } from './transactions';

/**
 * SQL Server (T-SQL). There is no SQL Server engine in PracStack yet (running one
 * needs Microsoft's licence terms accepted), so this track uses multiple-choice and
 * fill-in-blank questions whose answer keys are reviewed by hand; nothing is executed.
 * See builders.ts.
 */
export const sqlServerTrack: TrackSource = {
  id: 'sql-server',
  name: 'SQL Server (T-SQL)',
  category: 'databases',
  description:
    'Microsoft SQL Server and T-SQL: querying, joins and window functions, stored procedures and error handling, transactions and concurrency, indexing and query performance, and table design. Questions are reviewed by hand; running your own T-SQL needs a SQL Server engine, which is not set up yet.',
  topics: [
    {
      id: 'mssql-querying-data',
      name: 'Querying data',
      description:
        'Read data with T-SQL: filtering, NULLs, paging, joins, aggregation and window functions.',
      skills: [
        {
          id: 'mssql-querying',
          name: 'Filtering, sorting and NULLs',
          description:
            '`SELECT`, `WHERE`, `ORDER BY`, `TOP` and `WITH TIES`, `OFFSET`/`FETCH`, three-valued logic, `ISNULL` versus `COALESCE`, string concatenation and `CASE`.',
          questions: queryingFamilies,
        },
        {
          id: 'mssql-joins-aggregation',
          prerequisites: ['mssql-querying'],
          name: 'Joins and aggregation',
          description:
            'Inner, outer, full and self joins, `ON` versus `WHERE` filters, join fan-out, `GROUP BY`/`HAVING`, `COUNT` variants, `APPLY` and `STRING_AGG`.',
          questions: joinsAggregationFamilies,
        },
        {
          id: 'mssql-advanced-queries',
          prerequisites: ['mssql-joins-aggregation'],
          name: 'Subqueries, CTEs and window functions',
          description:
            'Correlated subqueries and `EXISTS`, CTEs and recursive CTEs, ranking functions, `LAG`/`LEAD`, window frames and top-N per group.',
          questions: advancedQueryFamilies,
        },
      ],
    },
    {
      id: 'mssql-programmability',
      name: 'Programming and transactions',
      description:
        'Write T-SQL code that handles errors and keeps data consistent under concurrency.',
      skills: [
        {
          id: 'mssql-programming',
          prerequisites: ['mssql-querying'],
          name: 'T-SQL programming',
          description:
            'Variables and control flow, stored procedures and `OUTPUT` parameters, functions, `TRY`/`CATCH` and `THROW`, temp tables versus table variables, and safe dynamic SQL.',
          questions: programmingFamilies,
        },
        {
          id: 'mssql-transactions',
          prerequisites: ['mssql-programming'],
          name: 'Transactions and concurrency',
          description:
            '`XACT_ABORT`, `@@TRANCOUNT` and nesting, isolation levels and their anomalies, RCSI and `SNAPSHOT`, blocking, deadlocks and `MERGE` under concurrency.',
          questions: transactionFamilies,
        },
      ],
    },
    {
      id: 'mssql-performance-tuning',
      name: 'Query performance',
      description: 'Make queries fast with the right indexes and plans that fit the data.',
      skills: [
        {
          id: 'mssql-performance',
          prerequisites: ['mssql-joins-aggregation'],
          name: 'Indexes and query tuning',
          description:
            'Clustered and nonclustered indexes, covering indexes and key lookups, SARGable predicates, implicit conversions, statistics and parameter sniffing.',
          questions: performanceFamilies,
        },
      ],
    },
    {
      id: 'mssql-database-design',
      name: 'Database design',
      description: 'Design tables that keep data correct and queries simple.',
      skills: [
        {
          id: 'mssql-data-modeling',
          prerequisites: ['mssql-querying'],
          name: 'Keys, constraints and data types',
          description:
            'Natural and surrogate keys, `IDENTITY`, `SEQUENCE` and GUIDs, foreign keys and cascades, `UNIQUE` and `CHECK` constraints, normalisation and data type choice.',
          questions: dataModelingFamilies,
        },
      ],
    },
  ],
};
