import type { TrackSource } from '@pracstack/content-model';
import { advancedQueryFamilies } from './advanced';
import { ssisFamilies, ssrsFamilies } from './integration-reporting';
import { dataModelingFamilies } from './modeling';
import { performanceFamilies } from './performance';
import { programmingFamilies } from './programming';
import { joinsAggregationFamilies, queryingFamilies } from './querying';
import { runnableAdvancedTasks, runnableJoinTasks, runnableQueryingTasks } from './runnable';
import { transactionFamilies } from './transactions';

/**
 * SQL Server (T-SQL). The querying skills include runnable questions (runnable.ts):
 * the learner's T-SQL runs on a real SQL Server, and every reference query is
 * executed in the content checks. They are served only where a SQL Server engine
 * is available (locally: `npm run sqlserver:start`). The other questions are
 * multiple choice and fill in the blank, reviewed by hand (builders.ts).
 */
export const sqlServerTrack: TrackSource = {
  id: 'sql-server',
  name: 'SQL Server (T-SQL)',
  category: 'databases',
  description:
    'Microsoft SQL Server and T-SQL: querying, joins and window functions, stored procedures and error handling, transactions and concurrency, indexing and query performance, table design, and SSIS and SSRS. Where a SQL Server engine is available, you also write T-SQL queries that run on a real SQL Server.',
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
          questions: [...queryingFamilies, ...runnableQueryingTasks],
        },
        {
          id: 'mssql-joins-aggregation',
          prerequisites: ['mssql-querying'],
          name: 'Joins and aggregation',
          description:
            'Inner, outer, full and self joins, `ON` versus `WHERE` filters, join fan-out, `GROUP BY`/`HAVING`, `COUNT` variants, `APPLY` and `STRING_AGG`.',
          questions: [...joinsAggregationFamilies, ...runnableJoinTasks],
        },
        {
          id: 'mssql-advanced-queries',
          prerequisites: ['mssql-joins-aggregation'],
          name: 'Subqueries, CTEs and window functions',
          description:
            'Correlated subqueries and `EXISTS`, CTEs and recursive CTEs, ranking functions, `LAG`/`LEAD`, window frames and top-N per group.',
          questions: [...advancedQueryFamilies, ...runnableAdvancedTasks],
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
            'Natural and surrogate keys, `IDENTITY`, `SEQUENCE` and GUIDs, foreign keys and cascades, `UNIQUE` and `CHECK` constraints, normalization and data type choice.',
          questions: dataModelingFamilies,
        },
      ],
    },
    {
      id: 'mssql-integration-reporting',
      name: 'Integration and reporting',
      description:
        'Move and transform data with SSIS packages and publish paginated reports with SSRS.',
      skills: [
        {
          id: 'mssql-ssis',
          prerequisites: ['mssql-programming'],
          name: 'SSIS (Integration Services)',
          description:
            'Control and data flow, Lookups and error outputs, data conversion, incremental loads and slowly changing dimensions, parameters and environments, performance, and deploying and troubleshooting through the SSIS catalog.',
          questions: ssisFamilies,
        },
        {
          id: 'mssql-ssrs',
          prerequisites: ['mssql-querying'],
          name: 'SSRS (Reporting Services)',
          description:
            'Data sources and datasets, single, multi-value and cascading parameters, expressions and scopes, grouping and totals, performance, subscriptions, security, and paginated versus interactive reports.',
          questions: ssrsFamilies,
        },
      ],
    },
  ],
};
