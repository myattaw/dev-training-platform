import type { QuestionSource } from '@pracstack/content-model';
import { plain } from '../helpers';
import { tsqlChoiceFamily, tsqlMultiFamily } from './builders';

/*
 * SQL Server query performance: indexes, covering and key lookups, SARGability,
 * implicit conversions, statistics and parameter sniffing. Execution plans are
 * described in text. Reviewed by hand.
 */

export const performanceFamilies: readonly QuestionSource[] = [
  ...tsqlChoiceFamily(
    'mssql-sargability',
    'An index on a column can be used for a seek only when the predicate compares the bare column with a value.',
    [
      {
        key: 'leading-wildcard',
        difficulty: 1,
        question:
          '`dbo.Customers` has a nonclustered index on `LastName`. Which filter can use an index seek?',
        correct: "`WHERE LastName LIKE 'And%'`",
        wrong: [
          "`WHERE LastName LIKE '%son'`",
          "`WHERE LastName LIKE '%and%'`",
          "`WHERE RIGHT(LastName, 3) = 'son'`",
        ],
        why: 'An index on `LastName` is sorted by the start of the name, so a fixed prefix (`And%`) becomes a range seek. With a leading wildcard, or a function on the column, any row could match, so SQL Server must scan.',
      },
      {
        key: 'year-function',
        difficulty: 2,
        question:
          '`OrderDate` is `DATETIME2` (it includes the time) and is indexed. `WHERE YEAR(OrderDate) = 2025` scans the index. Which rewrite returns the same rows and can seek?',
        correct: "`WHERE OrderDate >= '20250101' AND OrderDate < '20260101'`",
        wrong: [
          "`WHERE OrderDate BETWEEN '20250101' AND '20251231'`",
          "`WHERE CONVERT(CHAR(4), OrderDate, 112) = '2025'`",
          '`WHERE YEAR(OrderDate) = 2025 OPTION (RECOMPILE)`',
        ],
        why: "A half-open range on the bare column is seekable and includes every moment of 31 December. `BETWEEN ... '20251231'` stops at midnight at the start of 31 December, losing that day’s orders. Converting the column still hides it inside a function, and `RECOMPILE` does not make a function on a column seekable.",
      },
      {
        key: 'dateadd-on-column',
        difficulty: 3,
        question:
          '`DueDate` is indexed. Which rewrite of `WHERE DATEADD(DAY, 30, DueDate) < SYSDATETIME()` returns the same rows and can seek?',
        correct: '`WHERE DueDate < DATEADD(DAY, -30, SYSDATETIME())`',
        wrong: [
          '`WHERE DueDate < DATEADD(DAY, 30, SYSDATETIME())`',
          '`WHERE DATEDIFF(DAY, DueDate, SYSDATETIME()) > 30`',
          '`WHERE DATEADD(DAY, 30, DueDate) < CAST(SYSDATETIME() AS DATE)`',
        ],
        why: 'Move the arithmetic to the other side so the column stands alone: `DueDate + 30 < now` is `DueDate < now - 30`. Adding 30 on the right flips the meaning, and `DATEDIFF` on the column is still a function on the column (and counts day boundaries, not 24-hour periods).',
      },
    ],
  ),
  ...tsqlMultiFamily(
    'mssql-sargable-predicates',
    'For each predicate, ask whether the column appears on its own, untouched by functions or arithmetic.',
    [
      {
        key: 'last-name',
        difficulty: 4,
        question:
          '`LastName` is `NVARCHAR(100)` with a nonclustered index and a case-insensitive collation. Which predicates allow an index seek on that index?',
        right: ["`LastName = N'Smith'`", "`LastName LIKE N'Sm%'`"],
        wrong: [
          "`LEFT(LastName, 2) = N'Sm'`",
          "`LastName LIKE N'%mith'`",
          "`UPPER(LastName) = N'SMITH'`",
        ],
        why: "Equality and a fixed-prefix `LIKE` translate into seeks on the sorted index. `LEFT` and `UPPER` wrap the column, so every row must be evaluated, and a leading wildcard can match anywhere. With a case-insensitive collation `UPPER` is unnecessary anyway: `LastName = N'smith'` already matches `Smith`.",
      },
      {
        key: 'order-date',
        difficulty: 5,
        question:
          '`OrderDate` is `DATETIME2` with a nonclustered index; `@Day`, `@From` and `@To` are `DATETIME2` parameters. Which predicates allow an index seek on `OrderDate`?',
        right: [
          '`OrderDate >= @Day AND OrderDate < DATEADD(DAY, 1, @Day)`',
          '`OrderDate BETWEEN @From AND @To`',
        ],
        wrong: [
          '`DATEDIFF(DAY, OrderDate, @Day) = 0`',
          "`CONVERT(CHAR(8), OrderDate, 112) = '20250301'`",
          '`MONTH(OrderDate) = 3 AND YEAR(OrderDate) = 2025`',
          '`DATEADD(DAY, 1, OrderDate) > @Day`',
        ],
        why: 'Functions on parameters are fine: they are evaluated once and the column is compared directly. `DATEDIFF`, `CONVERT`, `MONTH`/`YEAR` and `DATEADD` applied to the column must be computed for every row, which forces a scan. The fix is always to move the computation to the parameter side.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-implicit-conversion',
    'When two types meet, SQL Server converts the one with lower data type precedence. Ask which side gets converted: the column or the value.',
    [
      {
        key: 'varchar-int-literal',
        difficulty: 4,
        question:
          "`PostalCode` is `VARCHAR(10)` with an index, and holds values like `'10115'` and `'SW1A 1AA'`. What happens with this query?",
        code: `SELECT CustomerId
FROM dbo.Customers
WHERE PostalCode = 10115;`,
        correct:
          'The column is converted to `INT` for every row: the index cannot be seeked, and the query fails when it reaches a value such as `SW1A 1AA`',
        wrong: [
          "The literal `10115` is converted to `'10115'`, so the index is seeked normally",
          'It returns no rows, because a number never equals a string',
          'It fails at compile time because the types differ',
        ],
        why: "`INT` has higher precedence than `VARCHAR`, so SQL Server converts the column, not the literal. That makes the predicate non-sargable and turns non-numeric postal codes into run-time conversion errors. Compare with a string: `PostalCode = '10115'`.",
      },
      {
        key: 'varchar-column-nvarchar-param',
        difficulty: 4,
        question:
          '`AccountNumber` is `VARCHAR(20)` with a SQL collation (`SQL_Latin1_General_CP1_CI_AS`) and an index. The application sends the value as `NVARCHAR(4000)`. The plan shows an Index Scan with a `CONVERT_IMPLICIT` warning. What is the fix?',
        data: `Index Scan  IX_Accounts_AccountNumber
  Predicate: CONVERT_IMPLICIT(nvarchar(20), [AccountNumber], 0) = @p0
  Warning:   Type conversion in expression may affect "CardinalityEstimate"
             and "SeekPlan" in query plan choice`,
        code: `-- Sent by the application
exec sp_executesql N'SELECT AccountId FROM dbo.Accounts WHERE AccountNumber = @p0',
                   N'@p0 nvarchar(4000)', @p0 = N'AC-100042';`,
        correct:
          'Send the parameter as `VARCHAR(20)` (in ADO.NET, an ANSI string parameter), so the column needs no conversion',
        wrong: [
          'Send the parameter as `NVARCHAR(20)` instead of `NVARCHAR(4000)`',
          'Add `OPTION (RECOMPILE)`, so the conversion is evaluated once',
          'Create a second index on `AccountNumber`',
        ],
        why: '`NVARCHAR` has higher precedence, so every `AccountNumber` value is converted to Unicode before comparing, and with a SQL collation that prevents a seek. Matching the column’s type removes the conversion. A shorter `NVARCHAR` is still `NVARCHAR`, and no extra index helps while the column is wrapped in a conversion.',
      },
      {
        key: 'nvarchar-column-varchar-param',
        difficulty: 5,
        question:
          '`Email` is `NVARCHAR(256)` with an index. A legacy client sends the search value as `VARCHAR(256)`. Does the mismatch prevent an index seek?',
        code: `exec sp_executesql N'SELECT UserId FROM dbo.Users WHERE Email = @p0',
                   N'@p0 varchar(256)', @p0 = 'ana@example.com';`,
        correct:
          'No: the parameter is converted to `NVARCHAR` (the higher-precedence type), the column is untouched, and the index can be seeked',
        wrong: [
          'Yes: any type mismatch converts the column and forces a scan',
          'Yes: `VARCHAR` values cannot be compared with `NVARCHAR` columns without an explicit `CAST`',
          'No, but only because the column is shorter than 4000 characters',
        ],
        why: 'Implicit conversion only hurts when the column is the side being converted. Here the `VARCHAR` value is converted up to `NVARCHAR` once, and the predicate stays seekable. Remembering "mismatches are bad" without asking which side converts leads to the wrong answer in both directions.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-key-lookups',
    'A nonclustered index row holds its key columns, its included columns, and the clustered key; anything else needs a lookup.',
    [
      {
        key: 'include-columns',
        difficulty: 3,
        question:
          '`dbo.Orders` is clustered on `OrderId` and has `IX_Orders_CustomerId ON (CustomerId)`. Which index change removes the Key Lookup in this plan?',
        data: `Nested Loops (Inner Join)
├─ Index Seek  IX_Orders_CustomerId      Seek: CustomerId = @c     Actual rows: 5,000
└─ Key Lookup  PK_Orders (clustered)     Output: OrderDate, Total  Executions: 5,000`,
        code: `SELECT OrderId, OrderDate, Total
FROM dbo.Orders
WHERE CustomerId = @c;`,
        correct:
          '`CREATE INDEX IX_Orders_CustomerId ON dbo.Orders (CustomerId) INCLUDE (OrderDate, Total) WITH (DROP_EXISTING = ON);`',
        wrong: [
          '`CREATE INDEX IX_Orders_CustomerId ON dbo.Orders (CustomerId) INCLUDE (OrderId, OrderDate) WITH (DROP_EXISTING = ON);`',
          '`CREATE INDEX IX_Orders_OrderDate ON dbo.Orders (OrderDate, Total);`',
          '`UPDATE STATISTICS dbo.Orders IX_Orders_CustomerId;`',
        ],
        why: 'The lookup fetches `OrderDate` and `Total` from the clustered index 5,000 times. Including them makes the index cover the query. `OrderId` does not need including: as the clustered key it is already in every nonclustered index row, so including it but omitting `Total` still leaves a lookup. A separate index on other columns does not help this seek, and statistics do not change which columns an index holds.',
      },
      {
        key: 'tipping-point',
        difficulty: 4,
        question:
          "`dbo.Orders` has 10 million rows and a nonclustered index on `Status` (no included columns). `WHERE Status = 'Shipped'` matches 4 million rows, and the plan uses a Clustered Index Scan instead of the index. Why?",
        code: `SELECT OrderId, CustomerId, OrderDate, Total
FROM dbo.Orders
WHERE Status = 'Shipped';`,
        correct:
          'A seek would need a key lookup for each of the 4 million rows, which costs more than reading the whole table once',
        wrong: [
          'The index on `Status` is corrupt, and the optimizer is avoiding it',
          'Nonclustered indexes cannot be used for string columns',
          'The optimizer always scans when the table has more than a million rows',
        ],
        why: 'Each key lookup is a random read into the clustered index; past a fairly small fraction of the table, a sequential scan is cheaper, and the optimizer correctly chooses it. An index on a column with few distinct values helps only for rare values, or when it covers the query.',
      },
      {
        key: 'key-vs-include',
        difficulty: 5,
        question:
          'With `IX_Orders_CustomerId ON (CustomerId) INCLUDE (OrderDate, Total)`, this query’s plan shows an Index Seek followed by a Sort. Which index lets SQL Server avoid the Sort?',
        code: `SELECT TOP (20) OrderId, OrderDate, Total
FROM dbo.Orders
WHERE CustomerId = @c
ORDER BY OrderDate DESC;`,
        correct: '`(CustomerId, OrderDate) INCLUDE (Total)`',
        wrong: [
          '`(OrderDate, CustomerId) INCLUDE (Total)`',
          '`(CustomerId) INCLUDE (Total, OrderDate)`, because the order of included columns decides the sort order',
          'None: an ascending `OrderDate` key cannot produce a descending order without a Sort',
        ],
        why: 'Included columns are stored but not sorted, so they cannot deliver an order. With `OrderDate` as the second key, all rows for one customer are already in date order and can be read backwards for `DESC`, so `TOP (20)` stops after 20 rows. Leading with `OrderDate` would no longer allow a seek on `CustomerId`.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-index-basics',
    'The clustered index is the table itself, stored in key order; nonclustered indexes are separate structures that point back to it.',
    [
      {
        key: 'one-clustered',
        difficulty: 1,
        question: 'How many clustered indexes can a SQL Server table have?',
        correct: 'At most one, because it defines how the table’s rows themselves are stored',
        wrong: [
          'One per column',
          'Up to 999',
          'Exactly one, always: every table must have a clustered index',
        ],
        why: 'The data rows can be stored in only one order, so there is at most one clustered index. A table without one is a heap. Up to 999 is the limit for nonclustered indexes.',
      },
      {
        key: 'pk-default',
        difficulty: 2,
        question: 'What index does this `CREATE TABLE` create?',
        code: `CREATE TABLE dbo.Invoices (
    InvoiceId INT IDENTITY(1,1) PRIMARY KEY,
    InvoiceNo NVARCHAR(20) NOT NULL,
    Amount    DECIMAL(12,2) NOT NULL
);`,
        correct: 'A unique clustered index on `InvoiceId`',
        wrong: [
          'A unique nonclustered index on `InvoiceId`; the table stays a heap',
          'No index: a primary key is only a constraint',
          'A clustered index on every `NOT NULL` column',
        ],
        why: 'By default a `PRIMARY KEY` constraint is enforced with a unique clustered index when the table does not already have one. You can write `PRIMARY KEY NONCLUSTERED` if you want to cluster on something else.',
      },
      {
        key: 'row-locator',
        difficulty: 3,
        question:
          '`dbo.Orders` is clustered on `OrderId`. Besides `CustomerId`, what does each row of `IX_Orders_CustomerId ON (CustomerId)` contain?',
        correct: 'The clustered key, `OrderId`, used to find the full row',
        wrong: [
          'A physical page and slot address of the row',
          'A copy of every column of the row',
          'Nothing else; the index only records which values exist',
        ],
        why: 'On a clustered table, a nonclustered index uses the clustered key as its row locator, which is why `OrderId` is available in that index without being included, and why a wide clustered key makes every nonclustered index wider. A physical row id is used only for heaps.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-parameter-sniffing',
    'A procedure’s plan is compiled for the parameter values of the call that compiled it, then reused.',
    [
      {
        key: 'symptom',
        difficulty: 3,
        question:
          'After the plan cache was cleared, the first call to `dbo.GetOrders` was for customer 42, who has 3 orders. Since then, calls for customer 1 (2 million orders) take minutes. The cached plan shows "Parameter Compiled Value: 42" and an estimate of 3 rows. What is happening?',
        code: `CREATE OR ALTER PROCEDURE dbo.GetOrders @CustomerId INT
AS
SELECT OrderId, OrderDate, Total
FROM dbo.Orders
WHERE CustomerId = @CustomerId;`,
        correct:
          'Parameter sniffing: the plan built for a 3-row customer (seek plus lookups) is reused for a 2-million-row customer',
        wrong: [
          'Statistics are missing for customer 1, so the optimizer cannot find their rows',
          'The procedure is recompiled on every call, which is slow for large customers',
          'Customer 1’s rows are locked by another session',
        ],
        why: 'The first call compiled a plan for the sniffed value 42; it is cached and reused for every value. That plan is ideal for 3 rows and terrible for 2 million. The compiled value in the plan is the clue. Options include `OPTION (RECOMPILE)`, `OPTIMIZE FOR`, or separate code paths for very large customers.',
      },
      {
        key: 'recompile-cost',
        difficulty: 4,
        question:
          'Someone proposes `OPTION (RECOMPILE)` on the query in a procedure that runs 3,000 times per second. What is the main cost?',
        correct:
          'The statement is compiled on every execution, which costs CPU each time and gives up plan reuse',
        wrong: [
          'It stops the optimizer from using statistics',
          'It forces a serial plan',
          'It clears the whole plan cache on every execution',
        ],
        why: '`OPTION (RECOMPILE)` builds a fresh plan for the actual values each time, which fixes sniffing problems, but compilation is not free. It is a good fit for infrequent queries with skewed data, and a poor one for very hot, cheap queries, where `OPTIMIZE FOR` or a different design may be better.',
      },
      {
        key: 'optimize-for-unknown',
        difficulty: 5,
        question:
          'What does `OPTION (OPTIMIZE FOR (@CustomerId UNKNOWN))` change when the query is compiled?',
        correct:
          'The optimizer ignores the sniffed value and estimates from the column’s average density, giving one "average" plan for every value',
        wrong: [
          'The query is recompiled on every call with the actual value',
          'The optimizer uses the most frequent value in the histogram',
          'The optimizer compiles the plan as if `@CustomerId` were NULL',
        ],
        why: '`UNKNOWN` makes the estimate the average rows per value (from the density vector), so the plan no longer depends on whichever value happened to compile it. It is stable but can be mediocre for outliers. `OPTIMIZE FOR (@CustomerId = 42)` would pin a specific value instead; recompiling per call is `OPTION (RECOMPILE)`.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-statistics',
    'Cardinality estimates come from statistics; compare the estimated and actual row counts.',
    [
      {
        key: 'stale-after-load',
        difficulty: 3,
        question:
          'A nightly job bulk-loads 1.8 million rows into `dbo.Events`. The morning report then runs with a plan like this. What is the most likely cause and fix?',
        code: plain(`Hash Match (Aggregate)
└─ Nested Loops (Inner Join)
   ├─ Index Seek  IX_Events_EventDate   Estimated rows: 120   Actual rows: 1,800,000
   └─ Key Lookup  PK_Events             Executions: 1,800,000
Warning: Operator used tempdb to spill data during execution`),
        correct:
          'The statistics on `EventDate` predate the load; update them after the load (`UPDATE STATISTICS dbo.Events`)',
        wrong: [
          'The index is fragmented; rebuilding it is the only way to fix estimates',
          'The server needs more memory; the estimate is lowered when memory is short',
          'Add `OPTION (MAXDOP 1)`, because parallelism distorts row estimates',
        ],
        why: 'An estimate of 120 against 1.8 million actual rows means the optimizer did not know about the new data, so it chose nested loops and lookups and a too-small memory grant (the spill). Updating statistics after a large load lets the next compilation see the real distribution. Fragmentation and memory do not change estimates; rebuilding an index does update its statistics, but as a side effect.',
      },
      {
        key: 'ascending-key',
        difficulty: 4,
        question:
          'Rows are inserted with ever-increasing `CreatedAt` values. Queries for "today" estimate very few rows during the day, although thousands match. Why?',
        correct:
          'Today’s values are newer than the highest step of the statistics histogram, so the optimizer must guess until statistics are updated',
        wrong: [
          'Statistics are never kept for `DATETIME2` columns',
          'The histogram only stores the first 200 rows of the table',
          'Auto-update statistics runs after every insert, so the estimate is always one row behind',
        ],
        why: 'A histogram describes the data at the time it was built (at most 200 steps over the whole range). Values above its last step are outside what it knows, so estimates for the newest data are guesses until enough modifications trigger an update. Updating statistics more often (for example after loads) helps.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-index-cost',
    'Every index speeds up some reads and is maintained on every write to the columns it contains.',
    [
      {
        key: 'too-many-indexes',
        difficulty: 3,
        question:
          'A logging table receives 5,000 inserts per second and has 14 nonclustered indexes, several of them never used by any query. Inserts are slow. What is the most effective change?',
        correct:
          'Drop the unused and redundant indexes, because each insert has to update every index',
        wrong: [
          'Add an index on the insert timestamp so inserts can find their position faster',
          'Rebuild all 14 indexes every hour',
          'Change the clustered index to a nonclustered one so inserts skip it',
        ],
        why: 'An insert writes one row into the table and one row into each nonclustered index, with the logging and locking that goes with it. Index usage statistics (for example `sys.dm_db_index_usage_stats`) help to find indexes that are written but never read. Adding indexes only adds work for inserts.',
      },
      {
        key: 'redundant-prefix',
        difficulty: 4,
        question:
          'Neither index is unique or used by a constraint. Which index is usually redundant?',
        code: `CREATE INDEX IX_A ON dbo.Orders (CustomerId);
CREATE INDEX IX_B ON dbo.Orders (CustomerId, OrderDate) INCLUDE (Total);`,
        correct:
          '`IX_A`: any seek on `CustomerId` can use `IX_B`, whose leading key is the same column',
        wrong: [
          '`IX_B`: an index with two key columns cannot be used for a filter on one of them',
          'Neither: SQL Server needs a separate index for each combination of filter columns',
          'Both: the clustered index already covers `CustomerId`',
        ],
        why: '`IX_B` is sorted by `CustomerId` first, so it supports every seek `IX_A` does (only slightly wider). Keeping both doubles the write cost for little gain. The leading column matters: an index on `(OrderDate, CustomerId)` would not replace `IX_A`.',
      },
    ],
  ),
];
