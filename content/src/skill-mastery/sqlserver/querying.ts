import type { QuestionSource } from '@pracstack/content-model';
import { tsqlBlankFamily, tsqlChoiceFamily, tsqlMultiFamily } from './builders';

/*
 * SQL Server querying: filtering, ordering, TOP and OFFSET/FETCH, NULL logic,
 * CASE; then joins, aggregation and APPLY. Reviewed by hand (no engine yet).
 */

const scores = `Scores
Player  Score
------  -----
Ana     90
Ben     85
Cy      85
Dee     85
Eli     70`;

// ---------------------------------------------------------------- Querying basics

export const queryingFamilies: readonly QuestionSource[] = [
  ...tsqlChoiceFamily(
    'mssql-top-ties',
    'Think about what decides which rows are "first" and what happens to rows that share the last value.',
    [
      {
        key: 'top-no-order',
        difficulty: 1,
        question:
          'A report should show "the five largest orders". A developer writes this query. What does it actually return?',
        code: `SELECT TOP (5) OrderId, Total
FROM dbo.Orders;`,
        correct: 'Some five orders, with no guarantee which five or in what order',
        wrong: [
          'The five orders with the largest `Total`',
          'The five most recently inserted orders',
          'The first five orders by `OrderId`, always, because the table is clustered on `OrderId`',
        ],
        why: 'Without `ORDER BY`, `TOP` picks whichever rows the plan produces first, and that can change with the plan, parallelism or data changes. The tempting assumption is that the clustered index guarantees an order; it does not. Add `ORDER BY Total DESC` to get the five largest orders.',
      },
      {
        key: 'with-ties',
        difficulty: 2,
        question: 'How many rows does this query return?',
        data: scores,
        code: `SELECT TOP (3) WITH TIES Player, Score
FROM dbo.Scores
ORDER BY Score DESC;`,
        correct: '4 rows',
        wrong: ['3 rows', '5 rows', '2 rows'],
        why: '`TOP (3)` takes Ana (90), and two of the three 85s; `WITH TIES` then adds every other row whose `ORDER BY` value equals the last row taken (85), so Dee is included too: 4 rows. Expecting exactly 3 ignores the ties; 70 is never a tie with 85.',
      },
      {
        key: 'ties-no-order',
        difficulty: 3,
        question: 'What happens when this query runs?',
        data: scores,
        code: `SELECT TOP (3) WITH TIES Player, Score
FROM dbo.Scores;`,
        correct: 'It fails: `WITH TIES` is only allowed with an `ORDER BY` clause',
        wrong: [
          'It returns 3 rows in clustered index order',
          'It returns all 5 rows, because without an order every row ties',
          'It returns 3 rows plus any rows that share the third row’s `Score`',
        ],
        why: 'Ties are defined by the `ORDER BY` values, so SQL Server rejects `TOP ... WITH TIES` without `ORDER BY`. Guessing that it falls back to "index order" is the same misconception as assuming `TOP` without `ORDER BY` is ordered.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-offset-fetch',
    '`OFFSET`/`FETCH` belongs to the `ORDER BY` clause; think about what makes a page boundary stable.',
    [
      {
        key: 'missing-order-by',
        difficulty: 2,
        question: 'What happens when this query runs?',
        code: `SELECT OrderId, Total
FROM dbo.Orders
OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY;`,
        correct: 'It fails with a syntax error: `OFFSET` must follow an `ORDER BY` clause',
        wrong: [
          'It returns the first 10 rows in clustered key order',
          'It returns 10 arbitrary rows',
          'It returns every row, because `OFFSET 0` disables paging',
        ],
        why: 'In T-SQL, `OFFSET ... FETCH` is an extension of `ORDER BY`, so without `ORDER BY` the statement does not parse. Unlike `TOP`, it never silently returns arbitrary rows. If you truly do not care about order you could write `ORDER BY (SELECT NULL)`, but paging without a real order is rarely what you want.',
      },
      {
        key: 'top-and-offset',
        difficulty: 3,
        question: 'A developer combines both paging styles in one query. What happens?',
        code: `SELECT TOP (10) OrderId, Total
FROM dbo.Orders
ORDER BY OrderId
OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY;`,
        correct: 'It fails: `TOP` cannot be used in the same query as `OFFSET`',
        wrong: [
          'It returns rows 11–20, and `TOP (10)` has no further effect',
          'It returns rows 1–10, because `TOP` is applied first',
          'It returns no rows, because `TOP` keeps 10 rows and `OFFSET` then skips all of them',
        ],
        why: 'SQL Server rejects a query that has both `TOP` and `OFFSET`. Choose one: `TOP` for "first N", `OFFSET ... FETCH` for pages. Reasoning about which one "wins" assumes the statement compiles at all.',
      },
      {
        key: 'non-unique-order',
        difficulty: 4,
        question:
          'Orders are imported in batches, so thousands of rows share the same `CreatedAt`. Users report that some orders appear on both page 1 and page 2, and others never appear. What is the cause and the fix?',
        code: `SELECT OrderId, CreatedAt, Total
FROM dbo.Orders
ORDER BY CreatedAt DESC
OFFSET @Skip ROWS FETCH NEXT 50 ROWS ONLY;`,
        correct:
          'The order of rows with equal `CreatedAt` is not deterministic between executions; add a unique tiebreaker such as `ORDER BY CreatedAt DESC, OrderId DESC`',
        wrong: [
          '`OFFSET` skips rows before sorting them; move the `ORDER BY` into a CTE',
          'The query needs `WITH TIES` so rows sharing a timestamp stay together',
          'The default isolation level lets paging read uncommitted rows; add `WITH (NOLOCK)`',
        ],
        why: 'Each page is a separate execution, and among rows with the same `CreatedAt` SQL Server may return them in any order each time, so a tied row can land on two pages or none. A unique, total order (add the key) makes page boundaries stable. `OFFSET` is applied after sorting, and `NOLOCK` would make results less consistent, not more.',
      },
      {
        key: 'keyset',
        difficulty: 5,
        question:
          'Deep pages (`OFFSET 200000 ROWS`) are slow because SQL Server must read and discard every skipped row. You switch to keyset paging: the client sends the last row it saw (`@LastDate`, `@LastId`), and the query uses `SELECT TOP (50) ... ORDER BY OrderDate DESC, OrderId DESC`. Which `WHERE` clause returns the next page correctly?',
        correct: '`WHERE OrderDate < @LastDate OR (OrderDate = @LastDate AND OrderId < @LastId)`',
        wrong: [
          '`WHERE (OrderDate, OrderId) < (@LastDate, @LastId)`',
          '`WHERE OrderDate < @LastDate AND OrderId < @LastId`',
          '`WHERE OrderDate <= @LastDate AND OrderId < @LastId`',
        ],
        why: 'The next page is every row that sorts after the last one: an earlier date, or the same date with a lower id. T-SQL does not support row-value comparisons like `(a, b) < (x, y)`, so that option is a syntax error even though it works in some other databases. Requiring `OrderId < @LastId` for every row skips older orders that happen to have higher ids.',
      },
    ],
  ),
  ...tsqlBlankFamily(
    'mssql-paging-blank',
    'Pages are numbered from 1; how many rows come before the first row of the page you want?',
    [
      {
        key: 'first-page',
        difficulty: 1,
        prompt: 'Pages hold 50 rows and are numbered from 1. Fill in the blanks to return page 1.',
        template: `SELECT OrderId, OrderDate, Total
FROM dbo.Orders
ORDER BY OrderDate DESC, OrderId DESC
OFFSET {{blank:skip}} ROWS
FETCH NEXT {{blank:take}} ROWS ONLY;`,
        blanks: { skip: ['0'], take: ['50'] },
        why: 'The first page skips nothing (`OFFSET 0 ROWS`) and fetches one page of rows (`FETCH NEXT 50 ROWS ONLY`). A common slip is `OFFSET 1`, which would drop the first row.',
      },
      {
        key: 'fourth-page',
        difficulty: 2,
        prompt: 'Pages hold 25 rows and are numbered from 1. Fill in the blanks to return page 4.',
        template: `SELECT OrderId, OrderDate, Total
FROM dbo.Orders
ORDER BY OrderDate DESC, OrderId DESC
OFFSET {{blank:skip}} ROWS
FETCH NEXT {{blank:take}} ROWS ONLY;`,
        blanks: { skip: ['75'], take: ['25'] },
        why: 'Page 4 starts after pages 1–3, so skip `(4 - 1) * 25 = 75` rows and fetch 25. Using `4 * 25 = 100` would skip page 4 itself.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-null-logic',
    'A comparison with NULL is UNKNOWN, and `WHERE` keeps only rows where the condition is TRUE.',
    [
      {
        key: 'equals-null',
        difficulty: 1,
        question: 'With the default setting `ANSI_NULLS ON`, how many rows does this query return?',
        data: `Employees
EmployeeId  Name   ManagerId
----------  -----  ---------
1           Ana    NULL
2           Ben    1
3           Cy     1
4           Dee    2`,
        code: `SELECT Name
FROM dbo.Employees
WHERE ManagerId = NULL;`,
        correct: 'No rows; the filter should be `WHERE ManagerId IS NULL`',
        wrong: ['1 row (Ana)', '3 rows', 'It fails: you cannot compare a column with NULL'],
        why: '`ManagerId = NULL` evaluates to UNKNOWN for every row, including Ana’s, so nothing passes the filter. It is not an error, which is what makes the bug easy to miss. Test for missing values with `IS NULL`.',
      },
      {
        key: 'not-equal',
        difficulty: 2,
        question: 'How many rows does this query return?',
        data: `Orders
OrderId  Discount
-------  --------
1        10
2        5
3        NULL
4        0`,
        code: `SELECT OrderId
FROM dbo.Orders
WHERE Discount <> 10;`,
        correct: '2 rows (orders 2 and 4)',
        wrong: ['3 rows (orders 2, 3 and 4)', '1 row (order 2)', '4 rows'],
        why: 'For order 3, `NULL <> 10` is UNKNOWN, not TRUE, so the row is filtered out. Expecting it to be included treats NULL as "a value different from 10" rather than "unknown". Add `OR Discount IS NULL` if those rows are wanted.',
      },
      {
        key: 'not-in-null',
        difficulty: 3,
        question: 'Which customers does this query return?',
        data: `Customers            Orders
CustomerId           OrderId  CustomerId
----------           -------  ----------
1                    100      1
2                    101      NULL
3`,
        code: `SELECT CustomerId
FROM dbo.Customers
WHERE CustomerId NOT IN (SELECT CustomerId FROM dbo.Orders);`,
        correct: 'No customers at all',
        wrong: [
          'Customers 2 and 3',
          'Customer 3 only',
          'It fails because the subquery returns a NULL',
        ],
        why: '`2 NOT IN (1, NULL)` means `2 <> 1 AND 2 <> NULL`, which is TRUE AND UNKNOWN = UNKNOWN, so no row qualifies once the list contains a NULL. This silent empty result is why `NOT EXISTS` is the safer way to write an anti-join.',
      },
    ],
  ),
  ...tsqlMultiFamily(
    'mssql-null-safe-filters',
    'For each option, work out what happens to a row whose value is NULL.',
    [
      {
        key: 'customers-without-orders',
        difficulty: 4,
        question:
          '`dbo.Orders.CustomerId` is nullable and contains some NULLs. Which of these return exactly the customers that have no orders? Each option completes `SELECT c.CustomerId FROM dbo.Customers c ...`.',
        right: [
          '`WHERE NOT EXISTS (SELECT 1 FROM dbo.Orders o WHERE o.CustomerId = c.CustomerId)`',
          '`WHERE c.CustomerId NOT IN (SELECT o.CustomerId FROM dbo.Orders o WHERE o.CustomerId IS NOT NULL)`',
          '`LEFT JOIN dbo.Orders o ON o.CustomerId = c.CustomerId WHERE o.OrderId IS NULL`',
        ],
        wrong: [
          '`WHERE c.CustomerId NOT IN (SELECT o.CustomerId FROM dbo.Orders o)`',
          '`WHERE c.CustomerId <> ALL (SELECT o.CustomerId FROM dbo.Orders o)`',
        ],
        why: '`NOT EXISTS` only asks whether a matching row exists, so NULLs elsewhere do not matter. `NOT IN` and `<> ALL` both expand to a chain of `<>` comparisons joined by AND; one NULL makes the whole chain UNKNOWN, and every customer disappears. Filtering the NULLs out of the subquery fixes `NOT IN`. The LEFT JOIN works because `OrderId` (the key) is only NULL on the NULL-extended rows for unmatched customers.',
      },
      {
        key: 'not-west',
        difficulty: 5,
        question:
          '`Region` is nullable. Which filters return every row whose `Region` is not `West`, including rows where `Region` is NULL?',
        right: [
          "`WHERE Region <> 'West' OR Region IS NULL`",
          "`WHERE ISNULL(Region, '') <> 'West'`",
        ],
        wrong: [
          "`WHERE Region <> 'West'`",
          "`WHERE NOT (Region = 'West')`",
          "`WHERE Region NOT IN ('West', NULL)`",
          "`WHERE COALESCE(Region, 'West') <> 'West'`",
        ],
        why: '`NOT (UNKNOWN)` is still UNKNOWN, so negating the comparison does not bring NULL rows back. A NULL inside a `NOT IN` list makes the predicate UNKNOWN for every row, so that filter returns nothing at all. Replacing NULL with `West` excludes exactly the rows you wanted. Only an explicit `IS NULL` branch, or replacing NULL with a value that is not `West`, keeps them (the `ISNULL` version works but cannot seek an index on `Region`).',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-isnull-coalesce',
    'Compare how `ISNULL` and `COALESCE` decide their result type and how they are evaluated.',
    [
      {
        key: 'first-non-null',
        difficulty: 1,
        question:
          "For a contact with `MobilePhone = NULL`, `HomePhone = '555-0101'` and `WorkPhone = '555-0199'`, what does this expression return?",
        code: `SELECT COALESCE(MobilePhone, HomePhone, WorkPhone, 'none') AS Phone
FROM dbo.Contacts;`,
        correct: "`'555-0101'`",
        wrong: ["`'555-0199'`", "`'none'`", '`NULL`'],
        why: '`COALESCE` returns the first argument that is not NULL, left to right: the home phone. It does not skip to the last value or return NULL just because one argument is NULL.',
      },
      {
        key: 'type-truncation',
        difficulty: 3,
        question: 'What does this batch return?',
        code: `DECLARE @code CHAR(2) = NULL;

SELECT ISNULL(@code, 'Unknown')   AS A,
       COALESCE(@code, 'Unknown') AS B;`,
        correct: "`A` is `'Un'` and `B` is `'Unknown'`",
        wrong: [
          "Both are `'Unknown'`",
          "`A` is `'Unknown'` and `B` is `'Un'`",
          'Both are NULL, because `@code` is declared but never assigned',
        ],
        why: '`ISNULL` returns the data type of its first argument, here `CHAR(2)`, so the replacement is silently truncated to `Un`. `COALESCE` follows data type precedence across all arguments (like a `CASE` expression), so the full string survives. Assuming the two functions are interchangeable is the trap.',
      },
      {
        key: 'select-into-nullability',
        difficulty: 4,
        question:
          '`Discount` is a nullable `DECIMAL(5,2)` column. What nullability do the new columns `D1` and `D2` get?',
        code: `SELECT OrderId,
       ISNULL(Discount, 0)   AS D1,
       COALESCE(Discount, 0) AS D2
INTO dbo.OrderCopy
FROM dbo.Orders;`,
        correct: '`D1` is `NOT NULL`; `D2` allows NULL',
        wrong: [
          'Both are `NOT NULL`, because neither expression can return NULL',
          'Both allow NULL, because `Discount` allows NULL',
          '`D1` allows NULL; `D2` is `NOT NULL`',
        ],
        why: 'SQL Server treats `ISNULL(col, non-null constant)` as non-nullable, but `COALESCE` is a `CASE` expression whose result is considered nullable even though it can never actually be NULL here. This matters for `SELECT ... INTO`, computed columns and indexed views (for example, a computed column used in a primary key).',
      },
      {
        key: 'subquery-twice',
        difficulty: 5,
        question: 'Why might `ISNULL` be preferred over `COALESCE` in this query?',
        code: `SELECT p.ProductId,
       COALESCE((SELECT MAX(pr.Price)
                 FROM dbo.Prices pr
                 WHERE pr.ProductId = p.ProductId), 0) AS LatestPrice
FROM dbo.Products p;`,
        correct:
          '`COALESCE` is expanded to a `CASE` expression, so the subquery can be evaluated twice; `ISNULL` evaluates it once',
        wrong: [
          '`COALESCE` cannot take a subquery as an argument',
          '`COALESCE` returns NULL as soon as any argument is NULL',
          '`ISNULL` is the ANSI standard function and `COALESCE` is a SQL Server extension',
        ],
        why: '`COALESCE(x, 0)` becomes `CASE WHEN x IS NOT NULL THEN x ELSE 0 END`, so the subquery appears twice: extra work, and under concurrent changes the two evaluations can even disagree. `ISNULL` evaluates its first argument once. It is the other way round on standards: `COALESCE` is ANSI, `ISNULL` is T-SQL specific.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-string-concat',
    'Consider what `+` does with NULL and with mixed data types, and how `CONCAT` differs.',
    [
      {
        key: 'plus-null',
        difficulty: 2,
        question:
          "For a person with `FirstName = 'Ada'`, `MiddleName = NULL` and `LastName = 'Lovelace'`, what is `FullName` (default session settings)?",
        code: `SELECT FirstName + ' ' + MiddleName + ' ' + LastName AS FullName
FROM dbo.People;`,
        correct: 'NULL',
        wrong: ["`'Ada Lovelace'`", "`'Ada  Lovelace'` (two spaces)", "`'Ada NULL Lovelace'`"],
        why: 'With the default `CONCAT_NULL_YIELDS_NULL ON`, concatenating NULL with `+` yields NULL for the whole expression. `CONCAT` or `CONCAT_WS` treat NULL as an empty string instead.',
      },
      {
        key: 'concat-ws',
        difficulty: 3,
        question: 'For the same person (`MiddleName` is NULL), what are `A` and `B`?',
        code: `SELECT CONCAT(FirstName, ' ', MiddleName, ' ', LastName) AS A,
       CONCAT_WS(' ', FirstName, MiddleName, LastName)    AS B
FROM dbo.People;`,
        correct: '`A` is `Ada` and `Lovelace` separated by two spaces; `B` is `Ada Lovelace`',
        wrong: ['Both are `Ada Lovelace`', '`A` is NULL; `B` is `Ada Lovelace`', 'Both are NULL'],
        why: '`CONCAT` turns NULL into an empty string but still adds both literal spaces around it. `CONCAT_WS` skips NULL arguments entirely, so it adds the separator only between values that exist. Neither returns NULL, unlike `+`.',
      },
      {
        key: 'plus-int',
        difficulty: 4,
        question: '`OrderId` is an `INT` column. What happens when this runs?',
        code: `SELECT 'Order ' + OrderId AS Label
FROM dbo.Orders;`,
        correct:
          "It fails with a conversion error: `INT` has higher precedence, so SQL Server tries to convert `'Order '` to an integer",
        wrong: [
          "It returns labels such as `'Order 42'`",
          'It returns NULL for every row',
          'It returns the number with the text dropped, such as `42`',
        ],
        why: "With `+`, SQL Server converts the operand of lower data type precedence to the higher one; `INT` beats `VARCHAR`, so it attempts arithmetic and fails converting the text. Use `CONCAT('Order ', OrderId)`, which converts every argument to a string, or convert `OrderId` explicitly.",
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-case-expressions',
    'A `CASE` expression stops at the first branch that is TRUE, and it has a single result type.',
    [
      {
        key: 'first-match',
        difficulty: 1,
        question: 'What tier does an order with `Total = 1200` get?',
        code: `SELECT OrderId,
       CASE
           WHEN Total >= 500  THEN 'Silver'
           WHEN Total >= 1000 THEN 'Gold'
           ELSE 'Bronze'
       END AS Tier
FROM dbo.Orders;`,
        correct: "`'Silver'`",
        wrong: ["`'Gold'`", "`'Bronze'`", 'Both `Silver` and `Gold`, as two rows'],
        why: 'The branches are tested in order and the first TRUE one wins: 1200 >= 500 is already TRUE, so `Gold` is never reached. Put the most restrictive condition first.',
      },
      {
        key: 'simple-case-null',
        difficulty: 2,
        question: 'For a row where `Status` is NULL, what does this return?',
        code: `SELECT CASE Status
           WHEN 'A'  THEN 'Active'
           WHEN NULL THEN 'Missing'
           ELSE 'Other'
       END AS StatusText
FROM dbo.Accounts;`,
        correct: "`'Other'`",
        wrong: ["`'Missing'`", 'NULL', 'It fails: `WHEN NULL` is not allowed'],
        why: 'A simple `CASE` compares with `=`, and `NULL = NULL` is UNKNOWN, so the `WHEN NULL` branch never matches and the `ELSE` is used. Write a searched `CASE` with `WHEN Status IS NULL THEN ...`.',
      },
      {
        key: 'mixed-types',
        difficulty: 5,
        question: '`Quantity` is a nullable `INT` column. What happens when this runs?',
        code: `SELECT ProductId,
       CASE WHEN Quantity IS NULL THEN 'n/a'
            ELSE Quantity
       END AS QuantityText
FROM dbo.Stock;`,
        correct:
          "Rows with a NULL `Quantity` make it fail: the `CASE` result type is `INT`, so `'n/a'` cannot be converted",
        wrong: [
          "It returns `'n/a'` for NULL quantities and the number otherwise",
          'It fails to compile because the branches have different types',
          "It returns NULL instead of `'n/a'`, because `Quantity` is an `INT`",
        ],
        why: "A `CASE` expression has one result type: the highest-precedence type among its branches, here `INT`. The query compiles, and only fails at run time when a row actually reaches the `'n/a'` branch, which makes the bug data-dependent. Convert explicitly, for example `ELSE CAST(Quantity AS VARCHAR(11))`.",
      },
    ],
  ),
];

// ---------------------------------------------------------------- Joins and aggregation

const customersOrders = `Customers           Orders
CustomerId  Name    OrderId  CustomerId  Status
----------  ----    -------  ----------  ------
1           Ana     10       1           Open
2           Ben     11       1           Closed
3           Cy      12       2           Closed`;

export const joinsAggregationFamilies: readonly QuestionSource[] = [
  ...tsqlChoiceFamily(
    'mssql-left-join-filter',
    'A `LEFT JOIN` adds NULL-extended rows for unmatched customers; then ask what each filter does to those rows.',
    [
      {
        key: 'row-count',
        difficulty: 2,
        question: 'How many rows does this query return?',
        data: customersOrders,
        code: `SELECT c.Name, o.OrderId
FROM dbo.Customers c
LEFT JOIN dbo.Orders o ON o.CustomerId = c.CustomerId;`,
        correct: '4 rows',
        wrong: ['3 rows', '5 rows', '9 rows'],
        why: 'Ana matches two orders (2 rows), Ben one (1 row), and Cy none, but a `LEFT JOIN` keeps Cy with NULLs (1 row): 4. Three would be the `INNER JOIN` result, which drops Cy.',
      },
      {
        key: 'where-on-right',
        difficulty: 3,
        question:
          'The report should list every customer and their open orders (or NULL if none), but Ben and Cy are missing. Why?',
        data: customersOrders,
        code: `SELECT c.Name, o.OrderId
FROM dbo.Customers c
LEFT JOIN dbo.Orders o ON o.CustomerId = c.CustomerId
WHERE o.Status = 'Open';`,
        correct:
          "The `WHERE` filter removes the NULL-extended rows, turning the outer join into an inner join; move `o.Status = 'Open'` into the `ON` clause",
        wrong: [
          'A `LEFT JOIN` only returns unmatched rows when the right table is empty',
          'The join must be written as `RIGHT JOIN` because the filter is on `Orders`',
          '`Status` must be compared with `LIKE` because it is a string column',
        ],
        why: "Unmatched customers get `o.Status = NULL`, and `NULL = 'Open'` is UNKNOWN, so `WHERE` discards them; Ben’s closed order is discarded too. A condition in `ON` only decides which orders match, so customers without a match are still kept. A `RIGHT JOIN` would keep orders, not customers.",
      },
      {
        key: 'filter-in-on',
        difficulty: 4,
        question: 'How many rows does this query return?',
        data: customersOrders,
        code: `SELECT c.Name, o.OrderId
FROM dbo.Customers c
LEFT JOIN dbo.Orders o
       ON o.CustomerId = c.CustomerId
      AND o.Status = 'Open';`,
        correct: '3 rows: Ana with order 10, Ben with NULL, Cy with NULL',
        wrong: [
          '1 row: Ana with order 10',
          '4 rows: Ana twice, Ben and Cy',
          '2 rows: Ana with order 10, and Cy with NULL',
        ],
        why: "In the `ON` clause, `Status = 'Open'` limits which orders match; it never removes customers from the left side. Ana matches order 10, while Ben (only a closed order) and Cy (no orders) get one NULL-extended row each. Treating `ON` and `WHERE` as equivalent gives the 1-row answer.",
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-count-variants',
    '`COUNT(*)` counts rows; `COUNT(expression)` counts rows where the expression is not NULL.',
    [
      {
        key: 'star-vs-column',
        difficulty: 1,
        question:
          '`dbo.Customers` has 5 rows; 2 of them have a NULL `Email`. What does this query return?',
        code: `SELECT COUNT(*) AS A, COUNT(Email) AS B
FROM dbo.Customers;`,
        correct: '`A = 5`, `B = 3`',
        wrong: ['`A = 5`, `B = 5`', '`A = 3`, `B = 3`', '`A = 3`, `B = 5`'],
        why: '`COUNT(*)` counts rows regardless of content; `COUNT(Email)` skips rows where `Email` is NULL. They are not interchangeable.',
      },
      {
        key: 'distinct',
        difficulty: 2,
        question:
          "`City` holds `'Oslo'`, `'Oslo'`, `'Bergen'` and NULL. What does `SELECT COUNT(DISTINCT City) FROM dbo.Customers;` return?",
        correct: '2',
        wrong: ['3', '4', '1'],
        why: '`COUNT(DISTINCT City)` counts distinct non-NULL values: Oslo and Bergen. NULL is ignored, as in every aggregate except `COUNT(*)`.',
      },
      {
        key: 'left-join-count',
        difficulty: 3,
        question: 'Customer Cy has no orders. What do `A` and `B` show for Cy?',
        data: customersOrders,
        code: `SELECT c.Name,
       COUNT(*)         AS A,
       COUNT(o.OrderId) AS B
FROM dbo.Customers c
LEFT JOIN dbo.Orders o ON o.CustomerId = c.CustomerId
GROUP BY c.Name;`,
        correct: '`A = 1`, `B = 0`',
        wrong: ['`A = 0`, `B = 0`', '`A = 1`, `B = 1`', 'Cy is not in the result'],
        why: 'The `LEFT JOIN` produces one NULL-extended row for Cy. `COUNT(*)` counts that row (1); `COUNT(o.OrderId)` sees NULL and counts 0. To count orders per customer, count a column from the right table.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-group-having',
    'Think about the logical processing order: FROM, WHERE, GROUP BY, HAVING, SELECT, ORDER BY.',
    [
      {
        key: 'having',
        difficulty: 2,
        question: 'Which query lists customers with more than five orders?',
        correct: '`SELECT CustomerId FROM dbo.Orders GROUP BY CustomerId HAVING COUNT(*) > 5;`',
        wrong: [
          '`SELECT CustomerId FROM dbo.Orders WHERE COUNT(*) > 5 GROUP BY CustomerId;`',
          '`SELECT CustomerId FROM dbo.Orders GROUP BY CustomerId WHERE COUNT(*) > 5;`',
          '`SELECT CustomerId, COUNT(*) > 5 FROM dbo.Orders GROUP BY CustomerId;`',
        ],
        why: '`WHERE` filters rows before grouping, so it cannot use an aggregate; `HAVING` filters groups after aggregation. Putting `COUNT(*)` in `WHERE` is an error, and T-SQL has no boolean column type for `COUNT(*) > 5` in the select list.',
      },
      {
        key: 'not-in-group-by',
        difficulty: 3,
        question: 'What happens when this runs?',
        code: `SELECT CustomerId, OrderDate, SUM(Total) AS Spent
FROM dbo.Orders
GROUP BY CustomerId;`,
        correct:
          'It fails: `OrderDate` is neither in the `GROUP BY` nor inside an aggregate function',
        wrong: [
          'It returns one row per customer, with the first `OrderDate` of each',
          'It returns one row per customer, with an arbitrary `OrderDate`',
          'It returns one row per order, because `OrderDate` is listed',
        ],
        why: 'Each output row is one group, and a group of orders has many dates; SQL Server refuses to pick one (some other databases quietly do). Add `OrderDate` to `GROUP BY` or aggregate it, for example `MAX(OrderDate)`.',
      },
      {
        key: 'alias-in-group-by',
        difficulty: 4,
        question: 'What happens when this runs?',
        code: `SELECT YEAR(OrderDate) AS OrderYear, SUM(Total) AS Revenue
FROM dbo.Orders
GROUP BY OrderYear
ORDER BY OrderYear;`,
        correct:
          'It fails with "Invalid column name \'OrderYear\'" in the `GROUP BY`; the `ORDER BY` alias would be fine',
        wrong: [
          'It returns one row per year, ordered by year',
          'It fails in the `ORDER BY`, because aliases cannot be used there either',
          'It groups by the whole `OrderDate`, because the alias is ignored',
        ],
        why: '`GROUP BY` is processed before `SELECT`, so the alias does not exist yet: repeat the expression (`GROUP BY YEAR(OrderDate)`) or compute it in a CTE or `CROSS APPLY`. `ORDER BY` is processed after `SELECT`, which is why aliases work there.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-join-fanout',
    'Count how many times each parent row appears after the join, before the aggregate runs.',
    [
      {
        key: 'header-total',
        difficulty: 4,
        question:
          'Each order has several order lines. Revenue from this query is far higher than the sum of `Orders.Total`. Why?',
        code: `SELECT c.CustomerId, SUM(o.Total) AS Revenue
FROM dbo.Customers c
JOIN dbo.Orders o      ON o.CustomerId = c.CustomerId
JOIN dbo.OrderLines ol ON ol.OrderId = o.OrderId
WHERE ol.ProductId IN (7, 8)
GROUP BY c.CustomerId;`,
        correct:
          'Joining to order lines repeats each order once per matching line, so `o.Total` is summed several times; filter with `EXISTS` instead of joining',
        wrong: [
          '`SUM` adds NULL totals as zero, which inflates the result',
          'The `WHERE` clause runs after `SUM`, so all products are included',
          '`SUM` needs `DISTINCT` on the customer, as in `SUM(DISTINCT c.CustomerId)`',
        ],
        why: 'A join to a child table multiplies parent rows: an order with three matching lines contributes its total three times. Test for the products with `WHERE EXISTS (SELECT 1 FROM dbo.OrderLines ol WHERE ol.OrderId = o.OrderId AND ol.ProductId IN (7, 8))`. `SUM(DISTINCT o.Total)` is not a fix either: two different orders with the same total would collapse into one.',
      },
      {
        key: 'two-children',
        difficulty: 5,
        question:
          'Order 1 has two payments (100 and 50) and three shipments. What does `Paid` show for order 1?',
        code: `SELECT o.OrderId, SUM(p.Amount) AS Paid
FROM dbo.Orders o
LEFT JOIN dbo.Payments  p ON p.OrderId = o.OrderId
LEFT JOIN dbo.Shipments s ON s.OrderId = o.OrderId
GROUP BY o.OrderId;`,
        correct: '450',
        wrong: ['150', '300', '900'],
        why: 'Joining two independent child tables produces every payment-shipment combination: 2 × 3 = 6 rows, so each payment appears three times and (100 + 50) × 3 = 450. Aggregate each child separately (in derived tables or `OUTER APPLY`) before combining them.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-apply',
    '`APPLY` evaluates the right side once per left row and may refer to the left row’s columns.',
    [
      {
        key: 'outer-apply',
        difficulty: 3,
        question:
          'This query returns each customer’s latest order, but customers without orders are missing. Which change keeps them, with NULL order columns?',
        code: `SELECT c.Name, lo.OrderId, lo.OrderDate
FROM dbo.Customers c
CROSS APPLY (SELECT TOP (1) o.OrderId, o.OrderDate
             FROM dbo.Orders o
             WHERE o.CustomerId = c.CustomerId
             ORDER BY o.OrderDate DESC) AS lo;`,
        correct: 'Replace `CROSS APPLY` with `OUTER APPLY`',
        wrong: [
          'Replace `TOP (1)` with `TOP (1) WITH TIES`',
          'Add `OR o.CustomerId IS NULL` to the inner `WHERE` clause',
          'Replace `CROSS APPLY` with `CROSS JOIN`',
        ],
        why: '`CROSS APPLY` behaves like an inner join: a left row whose right side returns no rows is dropped. `OUTER APPLY` keeps it, like a `LEFT JOIN`. A `CROSS JOIN` cannot reference `c.CustomerId` inside the derived table at all.',
      },
      {
        key: 'join-correlated',
        difficulty: 4,
        question: 'A developer wants each customer’s three most recent orders. What happens?',
        code: `SELECT c.Name, t.OrderId
FROM dbo.Customers c
JOIN (SELECT TOP (3) o.OrderId
      FROM dbo.Orders o
      WHERE o.CustomerId = c.CustomerId
      ORDER BY o.OrderDate DESC) AS t ON 1 = 1;`,
        correct:
          'It fails: a derived table in a `JOIN` cannot refer to `c.CustomerId`; use `CROSS APPLY` instead',
        wrong: [
          'It returns three orders per customer',
          'It returns the three most recent orders overall, for every customer',
          'It returns three rows in total',
        ],
        why: 'The two inputs of a `JOIN` are evaluated independently, so the derived table cannot see `c` and the multi-part identifier `c.CustomerId` cannot be bound. `APPLY` exists for exactly this: a right side that is re-evaluated per left row.',
      },
      {
        key: 'string-split',
        difficulty: 5,
        question: 'How many rows does this query return?',
        data: `Products
ProductId  Tags
---------  ------------
1          'red,blue'
2          NULL`,
        code: `SELECT p.ProductId, t.value AS Tag
FROM dbo.Products p
CROSS APPLY STRING_SPLIT(p.Tags, ',') AS t;`,
        correct: '2 rows, both for product 1',
        wrong: [
          '3 rows: two for product 1 and one with a NULL tag for product 2',
          '1 row for product 1 with the value `red,blue`',
          'It fails because `STRING_SPLIT` receives a NULL',
        ],
        why: '`STRING_SPLIT` returns one row per piece (`red`, `blue`), and for a NULL input it returns an empty table, so `CROSS APPLY` drops product 2. Use `OUTER APPLY` to keep products without tags. (Storing lists in a column is a 1NF smell, which is why this query is needed at all.)',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-self-join',
    'Join the table to itself with two aliases: one for the employee, one for the manager.',
    [
      {
        key: 'include-ceo',
        difficulty: 1,
        question:
          '`dbo.Employees(EmployeeId, Name, ManagerId)`; the CEO has `ManagerId = NULL`. Which query lists every employee with their manager’s name, including the CEO?',
        correct:
          '`SELECT e.Name, m.Name AS Manager FROM dbo.Employees e LEFT JOIN dbo.Employees m ON m.EmployeeId = e.ManagerId;`',
        wrong: [
          '`SELECT e.Name, m.Name AS Manager FROM dbo.Employees e JOIN dbo.Employees m ON m.EmployeeId = e.ManagerId;`',
          '`SELECT e.Name, m.Name AS Manager FROM dbo.Employees e LEFT JOIN dbo.Employees m ON m.ManagerId = e.EmployeeId;`',
          '`SELECT Name, ManagerId AS Manager FROM dbo.Employees;`',
        ],
        why: 'The manager row is the one whose `EmployeeId` equals the employee’s `ManagerId`, and a `LEFT JOIN` keeps the CEO with a NULL manager. The inner join drops the CEO; reversing the condition lists each manager’s reports instead; and the last option returns ids, not names.',
      },
      {
        key: 'inner-count',
        difficulty: 3,
        question:
          'The table has 6 employees: the CEO (no manager) and 5 others, each with a valid `ManagerId`. Two of the five are themselves managers. How many rows does this query return?',
        code: `SELECT e.Name, m.Name AS Manager
FROM dbo.Employees e
JOIN dbo.Employees m ON m.EmployeeId = e.ManagerId;`,
        correct: '5',
        wrong: ['6', '3', '2'],
        why: 'Every employee with a manager matches exactly one manager row: 5 rows. The CEO has `ManagerId = NULL`, which matches nothing in an inner join. How many people are managers does not matter: the join is from each employee to one manager.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-full-join',
    'A `FULL JOIN` keeps unmatched rows from both sides; then think about which filter keeps them.',
    [
      {
        key: 'reconcile',
        difficulty: 4,
        question:
          'Finance compares `dbo.Ledger` with `dbo.BankLines` by `TransactionRef`. Which query lists references that exist on only one side?',
        correct:
          '`SELECT COALESCE(l.TransactionRef, b.TransactionRef) FROM dbo.Ledger l FULL JOIN dbo.BankLines b ON b.TransactionRef = l.TransactionRef WHERE l.TransactionRef IS NULL OR b.TransactionRef IS NULL;`',
        wrong: [
          '`SELECT l.TransactionRef FROM dbo.Ledger l LEFT JOIN dbo.BankLines b ON b.TransactionRef = l.TransactionRef WHERE b.TransactionRef IS NULL;`',
          '`SELECT l.TransactionRef FROM dbo.Ledger l JOIN dbo.BankLines b ON b.TransactionRef <> l.TransactionRef;`',
          '`SELECT COALESCE(l.TransactionRef, b.TransactionRef) FROM dbo.Ledger l FULL JOIN dbo.BankLines b ON b.TransactionRef = l.TransactionRef;`',
        ],
        why: 'A `FULL JOIN` keeps unmatched rows from both tables, and the `IS NULL` tests keep only those. The `LEFT JOIN` finds ledger-only rows but misses bank-only ones; the `<>` join pairs almost every row with every other; and without the `WHERE` you get the matched rows too.',
      },
      {
        key: 'amount-mismatch',
        difficulty: 5,
        question:
          'The team extends the reconciliation to also show amount mismatches, but one-sided references disappear from the result. Why?',
        code: `SELECT COALESCE(l.TransactionRef, b.TransactionRef) AS Ref, l.Amount, b.Amount
FROM dbo.Ledger l
FULL JOIN dbo.BankLines b ON b.TransactionRef = l.TransactionRef
WHERE l.Amount <> b.Amount;`,
        correct:
          'For a one-sided row one of the amounts is NULL, so `l.Amount <> b.Amount` is UNKNOWN and the row is filtered out',
        wrong: [
          'A `FULL JOIN` only keeps unmatched rows when there is no `WHERE` clause',
          '`<>` cannot compare `DECIMAL` columns from different tables',
          '`COALESCE` in the select list removes rows where either reference is NULL',
        ],
        why: 'The `WHERE` filter runs after the join, and any comparison with NULL is UNKNOWN. Keep the one-sided rows explicitly: `WHERE l.TransactionRef IS NULL OR b.TransactionRef IS NULL OR l.Amount <> b.Amount`.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-string-agg',
    'Think about how `STRING_AGG` treats NULLs, ordering and the size of its result.',
    [
      {
        key: 'within-group',
        difficulty: 3,
        question:
          "Department 10 has employees named `'Cy'`, NULL and `'Ana'`. What does this query return for department 10?",
        code: `SELECT DepartmentId,
       STRING_AGG(Name, ', ') WITHIN GROUP (ORDER BY Name) AS Names
FROM dbo.Employees
GROUP BY DepartmentId;`,
        correct: "`'Ana, Cy'`",
        wrong: ["`'Cy, Ana'`", "`', Ana, Cy'`", 'NULL, because one name is NULL'],
        why: '`STRING_AGG` ignores NULL values (no extra separator), and `WITHIN GROUP (ORDER BY Name)` fixes the order; without it the order of the pieces is not guaranteed. Unlike `+` concatenation, one NULL does not make the result NULL.',
      },
      {
        key: 'over-8000',
        difficulty: 5,
        question:
          '`Email` is `VARCHAR(255)`. For a large customer group this query fails with "STRING_AGG aggregation result exceeded the limit of 8000 bytes". What is the fix?',
        code: `SELECT GroupId, STRING_AGG(Email, ';') AS Recipients
FROM dbo.Customers
GROUP BY GroupId;`,
        correct:
          "Convert the input to a `MAX` type: `STRING_AGG(CAST(Email AS VARCHAR(MAX)), ';')`",
        wrong: [
          "Cast the result: `CAST(STRING_AGG(Email, ';') AS VARCHAR(MAX))`",
          'Add `WITHIN GROUP (ORDER BY Email)` so the result is built in order',
          "Use `NVARCHAR` for the separator: `STRING_AGG(Email, N';')`",
        ],
        why: 'The result type of `STRING_AGG` follows its input: a non-`MAX` string input gives a result limited to 8000 bytes. Converting the input to `VARCHAR(MAX)` (or `NVARCHAR(MAX)`) lifts the limit. Casting the result happens too late; the aggregation has already failed.',
      },
    ],
  ),
];
