import type { ScenarioSource } from '@pracstack/content-model';
import { plain, sql, text } from '../skill-mastery/helpers';
import { blanks, multiple, questionTask, single } from './builders';

const ID = 'sql-performance-investigation';

export const sqlPerformanceInvestigation: ScenarioSource = {
  id: ID,
  version: 1,
  title: 'SQL Server Performance Investigation',
  summary:
    'Read an execution plan, find the non-SARGable predicates and the implicit conversion, and choose one good index instead of five.',
  difficulty: 'hard',
  estimatedMinutes: 50,
  technologies: ['SQL Server', 'T-SQL', 'Indexing', 'Execution plans'],
  relatedSkillIds: ['mssql-performance', 'mssql-querying', 'mssql-joins-aggregation'],
  context: text(
    'Brightwater Outdoor (a fictional retailer of camping gear) runs its web shop on SQL Server. Since the spring sale the “My orders” page takes three seconds and the support team’s order search times out. The database has grown to 48 million orders.',
    'You are on call for the Commerce Platform team. The DBA has captured the two slow queries, the table definitions and the actual execution plans. A colleague has already proposed adding every index the missing-index hints suggest. Before anything is changed in production, you need to explain what is wrong and propose the smallest effective fix.',
  ),
  requirements: [
    {
      kind: 'list',
      items: [
        'Identify which predicates stop SQL Server from seeking on an index, and why.',
        'Fix the data-type mismatch between the application’s parameter and the column.',
        'Propose at most one new index for the “My orders” query, with the key order and included columns justified.',
        'Explain the cost of that index and which existing index it makes redundant.',
        'Reject index suggestions that would not help.',
      ],
    },
  ],
  acceptanceCriteria: [
    'Every non-SARGable predicate is identified, with a SARGable rewrite for the date filter.',
    'The parameter type matches the column type, so the implicit conversion warning disappears.',
    'The proposed index supports the seek, the order and the selected columns without key lookups.',
    'The write and storage cost of the index is stated, and a redundant index is retired.',
    'The leading-wildcard search is not “fixed” with an index that cannot be used for a seek.',
  ],
  artifacts: [
    {
      id: 'slow-queries',
      title: 'The two slow queries',
      description:
        'Captured from Query Store; @Email arrives from the .NET data layer as NVARCHAR(4000).',
      snippet: sql(`-- Query 1: "My orders" page, about 40 executions per second
SELECT o.OrderId, o.OrderDate, o.Status, o.TotalAmount
FROM dbo.Orders AS o
JOIN dbo.Customers AS c ON c.CustomerId = o.CustomerId
WHERE c.Email = @Email                              -- @Email NVARCHAR(4000)
  AND YEAR(o.OrderDate) = @Year
  AND ISNULL(o.Status, N'Open') <> N'Cancelled'
ORDER BY o.OrderDate DESC;

-- Query 2: support search by the end of an order reference, about 1 execution per minute
SELECT TOP (50) o.OrderId, o.Reference, o.OrderDate
FROM dbo.Orders AS o
WHERE o.Reference LIKE N'%' + @RefSuffix
ORDER BY o.OrderDate DESC;`),
    },
    {
      id: 'tables',
      title: 'Table definitions, indexes and row counts',
      description: 'Database collation SQL_Latin1_General_CP1_CI_AS.',
      snippet: sql(`CREATE TABLE dbo.Customers (            -- 1,204,113 rows
    CustomerId INT IDENTITY NOT NULL CONSTRAINT PK_Customers PRIMARY KEY CLUSTERED,
    Email      VARCHAR(256)  NOT NULL,
    FullName   NVARCHAR(200) NOT NULL
);
CREATE UNIQUE INDEX IX_Customers_Email ON dbo.Customers (Email);

CREATE TABLE dbo.Orders (               -- 48,210,554 rows, about 60,000 inserts and 90,000 status updates per day
    OrderId     BIGINT IDENTITY NOT NULL CONSTRAINT PK_Orders PRIMARY KEY CLUSTERED,
    CustomerId  INT            NOT NULL,
    OrderDate   DATETIME2(0)   NOT NULL,
    Status      NVARCHAR(20)   NULL,     -- NULL means Open (legacy rows); 3% Cancelled
    TotalAmount DECIMAL(12,2)  NOT NULL,
    Reference   NVARCHAR(40)   NOT NULL, -- e.g. BW-2025-0004417
    Notes       NVARCHAR(MAX)  NULL
);
CREATE INDEX IX_Orders_CustomerId ON dbo.Orders (CustomerId);
CREATE INDEX IX_Orders_OrderDate  ON dbo.Orders (OrderDate);`),
    },
    {
      id: 'execution-plans',
      title: 'Actual execution plans (text summary)',
      description: 'Operators with their actual row counts; costs are the optimizer’s estimates.',
      snippet: plain(`Query 1   duration 2,840 ms   logical reads 1,412,906
  Sort (ORDER BY o.OrderDate DESC)                                          cost  2%
  └─ Nested Loops (Inner Join)
     ├─ Index Scan  [Customers].[IX_Customers_Email]                       cost 61%
     │    Predicate: CONVERT_IMPLICIT(nvarchar(256),[c].[Email],0)=[@Email]
     │    Rows read 1,204,113   Actual rows 1
     └─ Nested Loops (Inner Join)
        ├─ Index Seek  [Orders].[IX_Orders_CustomerId]   Seek: CustomerId = [c].[CustomerId]   Actual rows 2,315
        └─ Key Lookup (Clustered) [Orders].[PK_Orders]   Executions 2,315                     cost 35%
             Predicate: datepart(year,[o].[OrderDate])=[@Year]
                        AND isnull([o].[Status],N'Open')<>N'Cancelled'
  Warning: Type conversion in expression (CONVERT_IMPLICIT(nvarchar(256),[c].[Email],0))
           may affect "SeekPlan" in query plan choice

Query 2   duration 9,120 ms   logical reads 3,902,331
  Top (50)
  └─ Sort (ORDER BY o.OrderDate DESC)
     └─ Clustered Index Scan [Orders].[PK_Orders]
          Predicate: [o].[Reference] like N'%'+[@RefSuffix]
          Rows read 48,210,554   Actual rows 38

Missing index hints
  Query 1: CREATE INDEX ... ON dbo.Orders (CustomerId) INCLUDE (OrderDate, Status, TotalAmount)
  Query 2: CREATE INDEX ... ON dbo.Orders (Reference) INCLUDE (OrderDate)`),
    },
  ],
  tasks: [
    questionTask(
      'non-sargable-predicates',
      'Find the non-SARGable predicates',
      multiple({
        id: `${ID}-non-sargable`,
        difficulty: 3,
        prompt:
          'Which predicates in the two queries prevent SQL Server from seeking on an index on the column they filter? Select all that apply.',
        options: [
          { text: '`YEAR(o.OrderDate) = @Year`', correct: true },
          { text: "`ISNULL(o.Status, N'Open') <> N'Cancelled'`", correct: true },
          {
            text: '`c.Email = @Email`, with the NVARCHAR parameter and the VARCHAR column',
            correct: true,
          },
          { text: "`o.Reference LIKE N'%' + @RefSuffix`", correct: true },
          { text: '`c.CustomerId = o.CustomerId`', correct: false },
        ],
        hint: 'An index is sorted by the column’s raw values. Which predicates transform the column, or ask for something the sort order cannot locate?',
        why: [
          {
            kind: 'list',
            items: [
              '`YEAR(OrderDate)` wraps the column in a function, so the sorted index on `OrderDate` cannot be used to find a range; the plan evaluates it row by row in the key lookup.',
              '`ISNULL(Status, ...)` also wraps the column (and `<>` would at best be two range scans).',
              'NVARCHAR has higher data-type precedence than VARCHAR, so SQL Server converts the column, not the parameter: `CONVERT_IMPLICIT(nvarchar(256),[c].[Email])`. With a SQL collation this forces a scan of all 1.2 million emails, exactly what the plan shows.',
              "A leading wildcard (`LIKE N'%...'`) has no fixed prefix to seek to in a B-tree.",
              'The join predicate compares the raw `CustomerId` columns of the same type, so it is used for the index seek on `IX_Orders_CustomerId`.',
            ],
          },
        ],
      }),
    ),
    questionTask(
      'rewrite-the-date-filter',
      'Rewrite the date filter',
      blanks({
        id: `${ID}-rewrite-date-filter`,
        difficulty: 3,
        prompt:
          'Rewrite `YEAR(o.OrderDate) = @Year` as a SARGable range on the raw column. Fill in the two boundaries using `DATEFROMPARTS`.',
        template: sql(`WHERE c.Email = @Email
  AND o.OrderDate >= {{blank:start}}
  AND o.OrderDate <  {{blank:end}}
  AND (o.Status IS NULL OR o.Status <> N'Cancelled')`),
        accepted: {
          start: ['DATEFROMPARTS(@Year, 1, 1)', 'DATEFROMPARTS(@Year,1,1)'],
          end: [
            'DATEFROMPARTS(@Year + 1, 1, 1)',
            'DATEFROMPARTS(@Year+1, 1, 1)',
            'DATEFROMPARTS(@Year+1,1,1)',
            'DATEFROMPARTS(@Year + 1,1,1)',
          ],
        },
        hint: 'Use a half-open range: from the first day of the year (inclusive) to the first day of the next year (exclusive).',
        why: 'A half-open range `>= Jan 1 of @Year` and `< Jan 1 of @Year + 1` selects exactly the same rows as `YEAR(OrderDate) = @Year` for every `DATETIME2` value, including times late on 31 December, and leaves the column untouched so an index on it can seek. Avoid `<= DATEFROMPARTS(@Year, 12, 31)`, which misses everything after midnight on the last day. The `ISNULL` is rewritten the same way: test the column itself (`IS NULL OR <>`).',
      }),
    ),
    questionTask(
      'fix-the-implicit-conversion',
      'Fix the implicit conversion',
      single({
        id: `${ID}-implicit-conversion`,
        difficulty: 4,
        prompt:
          'How do you remove the `CONVERT_IMPLICIT` on `Customers.Email` and get an index seek on `IX_Customers_Email`?',
        correct:
          'Send the parameter as `VARCHAR(256)` to match the column, for example `SqlDbType.VarChar` with `Size = 256` (or map the property as non-Unicode in EF Core with `IsUnicode(false)`)',
        wrong: [
          'Rewrite the predicate as `CAST(c.Email AS NVARCHAR(256)) = @Email`, so the conversion is explicit',
          'Add a table hint `WITH (INDEX(IX_Customers_Email))` so the optimizer has to use the index',
          'Rebuild `IX_Customers_Email` and update its statistics with FULLSCAN',
        ],
        hint: 'The conversion is applied to the side with lower data-type precedence. Make both sides the same type.',
        why: '.NET strings default to NVARCHAR parameters (`AddWithValue`, or EF Core when the column is not mapped as non-Unicode). Because NVARCHAR wins data-type precedence, every one of the 1.2 million VARCHAR emails is converted and compared: an index scan. Declaring the parameter as VARCHAR(256) makes the comparison type-exact and the seek returns the single row. An explicit CAST on the column is the same problem written out, an index hint can only force the same scan, and fresh statistics do not change the data type.',
      }),
    ),
    questionTask(
      'choose-the-index',
      'Choose the index for “My orders”',
      single({
        id: `${ID}-choose-index`,
        difficulty: 4,
        prompt:
          'With the parameter type fixed and the date filter rewritten, Query 1 seeks one customer and needs that customer’s orders for one year, newest first, with `Status` and `TotalAmount`. Which single index serves it best?',
        correct:
          '`CREATE INDEX IX_Orders_CustomerId_OrderDate ON dbo.Orders (CustomerId, OrderDate DESC) INCLUDE (Status, TotalAmount);`',
        wrong: [
          '`CREATE INDEX IX_Orders_OrderDate_CustomerId ON dbo.Orders (OrderDate, CustomerId) INCLUDE (Status, TotalAmount);`',
          '`CREATE INDEX IX_Orders_Status_CustomerId ON dbo.Orders (Status, CustomerId, OrderDate);`',
          '`CREATE INDEX IX_Orders_CustomerId_Notes ON dbo.Orders (CustomerId) INCLUDE (OrderDate, Status, TotalAmount, Notes);`',
        ],
        hint: 'Put the equality column first, then the range and sort column; carry the remaining selected columns at the leaf level.',
        why: 'The equality predicate (`CustomerId`) leads, so the seek lands on one customer; `OrderDate` second turns the year filter into a range inside that customer, already in the requested order (no Sort); `Status` and `TotalAmount` are included at the leaf, so there are no key lookups and the status filter is checked on the index row. Leading with `OrderDate` would seek a whole year of every customer’s orders (millions of rows) to find one customer’s. `Status` first cannot be sought with `<>` or `IS NULL OR`, and it does not deliver the date order. Including `Notes` (NVARCHAR(MAX)) adds no value for this query and bloats the index; this is also why the missing-index hint, which ignores the ORDER BY, is not quite right.',
      }),
    ),
    questionTask(
      'index-trade-offs',
      'Weigh the cost of the new index',
      multiple({
        id: `${ID}-index-trade-offs`,
        difficulty: 4,
        prompt:
          'Which statements about adding `IX_Orders_CustomerId_OrderDate (CustomerId, OrderDate DESC) INCLUDE (Status, TotalAmount)` are true? Select all that apply.',
        options: [
          {
            text: '`IX_Orders_CustomerId` becomes redundant, because its key is a left prefix of the new index; drop it after checking index usage and any plans or hints that name it',
            correct: true,
          },
          {
            text: 'Every insert into `Orders`, and every update that changes `Status` or `TotalAmount`, now also has to maintain the new index',
            correct: true,
          },
          {
            text: 'Included columns are not stored in the index, so the index needs no extra storage for them',
            correct: false,
          },
          {
            text: 'The query will still need a key lookup for each order, but the lookups will be faster',
            correct: false,
          },
          {
            text: '`IX_Orders_OrderDate` can be dropped too, because the new index also contains `OrderDate`',
            correct: false,
          },
        ],
        hint: 'An index can replace another one only if it can serve the same seeks. Included columns live in the leaf rows.',
        why: 'An index whose key starts with `CustomerId` serves every seek `IX_Orders_CustomerId` served, so keeping both doubles the write cost for nothing; check `sys.dm_db_index_usage_stats` and hints before dropping it. The new index has to be maintained on every insert and on the 90,000 daily status updates, and the included columns are stored in its leaf rows (that is what removes the key lookups). `IX_Orders_OrderDate` must stay if other queries filter by date across all customers: `OrderDate` is the second key column of the new index, so it cannot be sought on by itself.',
      }),
    ),
    questionTask(
      'reject-the-reference-index',
      'Reject an index that cannot help',
      single({
        id: `${ID}-reject-reference-index`,
        difficulty: 5,
        prompt:
          'The missing-index hint for Query 2 suggests `CREATE INDEX ... ON dbo.Orders (Reference) INCLUDE (OrderDate)`. What should you tell your colleague?',
        correct:
          "Do not add it as is: with a leading wildcard SQL Server can at best scan this narrower index, never seek. If suffix search is a real requirement, index a persisted computed column `REVERSE(Reference)` and search it with `LIKE REVERSE(@RefSuffix) + N'%'`, or change the search to a prefix or exact match",
        wrong: [
          'Add it: SQL Server seeks on any index whose key column appears in a LIKE predicate',
          'Add it with a filter `WHERE Reference IS NOT NULL`, which turns the scan into a seek',
          'Add `OPTION (RECOMPILE)` to Query 2 so the optimizer can seek once it sees the parameter value',
        ],
        hint: 'A B-tree on Reference is sorted by the first characters. Where in that order do references ending in “4417” live?',
        why: 'Values ending in a given suffix are spread across the entire index, so the only plan is a scan; the suggested index would make that scan a little cheaper (a narrower structure than the clustered index) while every insert pays for it, for a query that runs once a minute. Reversing the string turns the suffix into a prefix, which a seek can find; a prefix or exact search changes the requirement instead. A filtered index on a NOT NULL column filters nothing, and RECOMPILE cannot make a leading wildcard seekable. Often the right outcome of an investigation is fewer indexes, not more.',
      }),
    ),
  ],
  limitations:
    'Nothing is executed: there is no SQL Server behind this scenario, so plans, timings and the effect of the proposed index are assessed through structured questions about the captured artifacts, not measured.',
};
