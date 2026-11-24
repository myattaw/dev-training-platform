import type { QuestionSource } from '@pracstack/content-model';
import { tsqlChoiceFamily } from './builders';

/*
 * SQL Server advanced queries: subqueries, EXISTS, CTEs (including recursive),
 * window functions, frames and top-N per group. Reviewed by hand.
 */

const ranked = `Results
Player  Score
------  -----
Ana     100
Ben     90
Cy      90
Dee     80`;

const sales = `Sales
StoreId  SalesMonth  Amount
-------  ----------  ------
1        2025-01     100
1        2025-02     120
2        2025-01     80
2        2025-02     95`;

export const advancedQueryFamilies: readonly QuestionSource[] = [
  ...tsqlChoiceFamily(
    'mssql-window-ranking',
    'Compare how `ROW_NUMBER`, `RANK` and `DENSE_RANK` number rows that tie.',
    [
      {
        key: 'rank',
        difficulty: 1,
        question: 'What value does `Pos` have for Dee?',
        data: ranked,
        code: `SELECT Player, RANK() OVER (ORDER BY Score DESC) AS Pos
FROM dbo.Results;`,
        correct: '4',
        wrong: ['3', '2', '1'],
        why: 'Ana is 1, Ben and Cy tie at 2, and `RANK` then skips a number, so Dee is 4. A rank with no gaps (3) is what `DENSE_RANK` gives.',
      },
      {
        key: 'dense-rank',
        difficulty: 2,
        question: 'What value does `Pos` have for Dee?',
        data: ranked,
        code: `SELECT Player, DENSE_RANK() OVER (ORDER BY Score DESC) AS Pos
FROM dbo.Results;`,
        correct: '3',
        wrong: ['4', '2', '1'],
        why: '`DENSE_RANK` gives ties the same number and continues with the next integer: 1, 2, 2, 3. Expecting 4 confuses it with `RANK`, which leaves a gap after ties.',
      },
      {
        key: 'row-number-ties',
        difficulty: 3,
        question: 'Which statement about `Pos` for Ben and Cy is true?',
        data: ranked,
        code: `SELECT Player, ROW_NUMBER() OVER (ORDER BY Score DESC) AS Pos
FROM dbo.Results;`,
        correct:
          'One gets 2 and the other 3, and which one gets 2 is not guaranteed; add a tiebreaker such as `Player` to the `ORDER BY`',
        wrong: [
          'Both get 2, because they have the same score',
          'Ben always gets 2, because rows are numbered in insertion order',
          'Ben always gets 2, because rows are numbered alphabetically when scores tie',
        ],
        why: '`ROW_NUMBER` always gives distinct numbers, but with tied `ORDER BY` values the assignment between the tied rows is nondeterministic and can change between runs. Make the window order unique when the result must be repeatable.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-top-n-per-group',
    'Window functions are computed in the `SELECT` phase; and decide how ties should count.',
    [
      {
        key: 'filter-in-where',
        difficulty: 3,
        question:
          'A developer wants the two highest-paid employees per department. What happens when this runs?',
        code: `SELECT DepartmentId, Name, Salary,
       ROW_NUMBER() OVER (PARTITION BY DepartmentId ORDER BY Salary DESC) AS rn
FROM dbo.Employees
WHERE rn <= 2;`,
        correct:
          'It fails: `rn` does not exist yet when `WHERE` is evaluated; compute it in a CTE or derived table and filter outside',
        wrong: [
          'It returns the two highest-paid employees per department',
          'It returns the two highest-paid employees overall',
          'It fails because `ROW_NUMBER` needs `PARTITION BY` and `ORDER BY` on the same column',
        ],
        why: 'Window functions are evaluated in the `SELECT` phase, after `WHERE`, so neither the alias nor the function itself can be used in `WHERE`. The usual pattern is `WITH x AS (SELECT ..., ROW_NUMBER() OVER (...) AS rn FROM ...) SELECT ... FROM x WHERE rn <= 2;`.',
      },
      {
        key: 'distinct-levels',
        difficulty: 4,
        question:
          'In department 10 the salaries are 100, 100 and 90. The requirement: "everyone at the two highest distinct salary levels in each department". Which function should number the rows before filtering on `<= 2`?',
        code: `WITH x AS (
    SELECT DepartmentId, Name, Salary,
           ???() OVER (PARTITION BY DepartmentId ORDER BY Salary DESC) AS n
    FROM dbo.Employees
)
SELECT DepartmentId, Name, Salary
FROM x
WHERE n <= 2;`,
        correct: '`DENSE_RANK`, which numbers 100, 100, 90 as 1, 1, 2 and keeps all three',
        wrong: [
          '`RANK`, which numbers them 1, 1, 2 and keeps all three',
          '`ROW_NUMBER`, which keeps both 100s and the 90',
          '`NTILE`, which splits each department into two salary levels',
        ],
        why: '`DENSE_RANK` numbers distinct values without gaps (1, 1, 2), so `<= 2` keeps both levels. `RANK` gives 1, 1, 3 and would drop the 90; `ROW_NUMBER` gives 1, 2, 3 and also drops it. `NTILE(2)` splits rows into equal-sized buckets, not salary levels.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-window-frames',
    'Without an explicit frame, a window aggregate with `ORDER BY` uses `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`.',
    [
      {
        key: 'moving-average',
        difficulty: 3,
        question:
          'Which window computes a 3-day moving average (the current day and the two days before it), given exactly one row per day?',
        code: `SELECT SaleDate,
       AVG(Amount) OVER (ORDER BY SaleDate ???) AS MovingAvg
FROM dbo.DailySales;`,
        correct: '`ROWS BETWEEN 2 PRECEDING AND CURRENT ROW`',
        wrong: [
          '`ROWS BETWEEN 3 PRECEDING AND CURRENT ROW`',
          '`ROWS BETWEEN CURRENT ROW AND 2 FOLLOWING`',
          '`RANGE BETWEEN 2 PRECEDING AND CURRENT ROW`',
        ],
        why: 'Two preceding rows plus the current row is three rows. `3 PRECEDING` averages four days, and `FOLLOWING` looks ahead. SQL Server only supports `UNBOUNDED` and `CURRENT ROW` as `RANGE` boundaries, so `RANGE BETWEEN 2 PRECEDING ...` is rejected.',
      },
      {
        key: 'range-ties',
        difficulty: 4,
        question: 'What is `RunningTotal` on the first row dated 2025-01-02?',
        data: `Transactions
TxId  TxDate      Amount
----  ----------  ------
1     2025-01-01  10
2     2025-01-02  5
3     2025-01-02  20
4     2025-01-03  1`,
        code: `SELECT TxId, TxDate,
       SUM(Amount) OVER (ORDER BY TxDate) AS RunningTotal
FROM dbo.Transactions;`,
        correct: '35',
        wrong: ['15', '30', '36'],
        why: 'With `ORDER BY` and no frame, the default is `RANGE ... CURRENT ROW`, and `RANGE` treats all rows with the same `TxDate` as peers: both 2025-01-02 rows get 10 + 5 + 20 = 35. A row-by-row running total (15, then 35) needs `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` and a unique order such as `ORDER BY TxDate, TxId`.',
      },
      {
        key: 'rows-performance',
        difficulty: 5,
        question:
          'A running total over 20 million rows is slow; the plan shows a Window Spool writing to a worktable in tempdb. The ordering column is unique. Which change helps most without changing the results?',
        code: `SELECT TxId,
       SUM(Amount) OVER (ORDER BY TxId) AS RunningTotal
FROM dbo.Transactions;`,
        correct:
          'Specify the frame explicitly: `OVER (ORDER BY TxId ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`',
        wrong: [
          'Add `PARTITION BY TxId` so each row is summed on its own',
          'Replace the window with a correlated subquery that sums all earlier rows',
          'Add `OPTION (MAXDOP 1)` so the spool is not shared between threads',
        ],
        why: 'The default frame is `RANGE`, which in row-mode plans uses an on-disk worktable spool; `ROWS` can use a much cheaper in-memory spool. With a unique order key both frames give the same totals, so the change is safe. `PARTITION BY TxId` changes the result (each total equals its own amount), and a correlated subquery is quadratic.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-lag-lead',
    '`LAG` looks at an earlier row of the same partition in window order; check what happens at the partition start.',
    [
      {
        key: 'first-row-null',
        difficulty: 2,
        question: 'What is `PrevAmount` for store 1 in 2025-01?',
        data: sales,
        code: `SELECT StoreId, SalesMonth, Amount,
       LAG(Amount) OVER (PARTITION BY StoreId ORDER BY SalesMonth) AS PrevAmount
FROM dbo.Sales;`,
        correct: 'NULL',
        wrong: ['0', '100', '80'],
        why: 'There is no earlier row in store 1’s partition, and without a third argument `LAG` returns NULL there. It is not 0 unless you pass a default, and it does not borrow a row from another store.',
      },
      {
        key: 'default-and-partition',
        difficulty: 3,
        question: 'What is `PrevAmount` for store 2 in 2025-01?',
        data: sales,
        code: `SELECT StoreId, SalesMonth, Amount,
       LAG(Amount, 1, 0) OVER (PARTITION BY StoreId ORDER BY SalesMonth) AS PrevAmount
FROM dbo.Sales;`,
        correct: '0',
        wrong: ['120', 'NULL', '80'],
        why: '`PARTITION BY StoreId` restarts the window for store 2, so its first month has no previous row and gets the default, 0. Without the partition, the previous row would have been store 1’s last month (120).',
      },
      {
        key: 'missing-month',
        difficulty: 4,
        question:
          'A store had no sales in March, so there is no March row. What does `Change` show for April?',
        code: `SELECT SalesMonth, Amount,
       Amount - LAG(Amount) OVER (ORDER BY SalesMonth) AS Change
FROM dbo.MonthlySales   -- one row per month that had sales
WHERE StoreId = 3;`,
        correct:
          'April minus February: `LAG` takes the previous row, not the previous calendar month',
        wrong: [
          'NULL, because the previous month is missing',
          'April minus 0, because the missing month counts as zero',
          'April minus March, because SQL Server fills in the gap',
        ],
        why: '`LAG` is positional: it returns the previous row in window order, whatever its date. To compare with the previous calendar month, generate the months first (a calendar table) and left join the sales to it, so missing months become explicit rows.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-recursive-cte',
    'A recursive CTE has an anchor member, `UNION ALL`, and a recursive member; the statement has a recursion limit.',
    [
      {
        key: 'union',
        difficulty: 3,
        question: 'What happens when this runs?',
        code: `WITH Chain AS (
    SELECT EmployeeId, ManagerId, 0 AS Depth
    FROM dbo.Employees
    WHERE ManagerId IS NULL
    UNION
    SELECT e.EmployeeId, e.ManagerId, c.Depth + 1
    FROM dbo.Employees e
    JOIN Chain c ON e.ManagerId = c.EmployeeId
)
SELECT * FROM Chain;`,
        correct:
          'It fails: a recursive CTE needs `UNION ALL` between the anchor and the recursive member',
        wrong: [
          'It returns the hierarchy with duplicate rows removed',
          'It returns only the anchor row, because `UNION` stops the recursion',
          'It loops until the recursion limit is reached',
        ],
        why: 'SQL Server requires a top-level `UNION ALL` in a recursive CTE; `UNION` (which would need to compare against all earlier rows) is rejected. Remove duplicates afterwards if needed.',
      },
      {
        key: 'cycle',
        difficulty: 4,
        question:
          'After a bad data import, employee 7 is recorded as the manager of employee 9 and employee 9 as the manager of employee 7. What happens when this query walks up from employee 9?',
        code: `WITH Up AS (
    SELECT EmployeeId, ManagerId
    FROM dbo.Employees
    WHERE EmployeeId = 9
    UNION ALL
    SELECT e.EmployeeId, e.ManagerId
    FROM dbo.Employees e
    JOIN Up u ON e.EmployeeId = u.ManagerId
)
SELECT * FROM Up;`,
        correct:
          'It fails with "The maximum recursion 100 has been exhausted before statement completion"',
        wrong: [
          'It runs forever until someone kills the session',
          'SQL Server detects the cycle and returns each row once',
          'It returns two rows, because recursion stops when a row repeats',
        ],
        why: 'SQL Server does not detect cycles. The default `MAXRECURSION` of 100 stops the statement with an error (rows already returned to the client are not a valid result). Track the path or depth in the CTE and stop on a repeat, and fix the data.',
      },
      {
        key: 'maxrecursion-placement',
        difficulty: 5,
        question:
          'This CTE generates the numbers 1 to 1000 and fails at the default recursion limit. Where does the fix go?',
        code: `WITH Numbers AS (
    SELECT 1 AS n
    UNION ALL
    SELECT n + 1 FROM Numbers WHERE n < 1000
)
SELECT n FROM Numbers;`,
        correct:
          'Append `OPTION (MAXRECURSION 1000)` to the outer `SELECT n FROM Numbers` statement',
        wrong: [
          'Add `OPTION (MAXRECURSION 1000)` after the recursive member, inside the CTE',
          'Run `SET MAXRECURSION 1000;` before the statement',
          'Change the anchor to `SELECT TOP (1000) 1 AS n`',
        ],
        why: '`MAXRECURSION` is a query hint, so it goes in the `OPTION` clause of the statement that uses the CTE, not inside the CTE definition, and there is no session-level `SET` for it. `0` means no limit, which also removes the safety net against cycles. For number generation, a set-based approach (a numbers table, or `GENERATE_SERIES` where available) is usually faster than recursion.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-subquery-binding',
    'Check how many rows a subquery can return, and which table each unqualified column name actually resolves to.',
    [
      {
        key: 'exists',
        difficulty: 1,
        question: 'Which customers does this query return?',
        code: `SELECT c.Name
FROM dbo.Customers c
WHERE EXISTS (SELECT 1
              FROM dbo.Orders o
              WHERE o.CustomerId = c.CustomerId);`,
        correct: 'Customers with at least one order, each listed once',
        wrong: [
          'Customers with at least one order, listed once per order',
          'Customers whose order has the value 1',
          'Every customer, because `SELECT 1` always returns a row',
        ],
        why: '`EXISTS` is TRUE when the correlated subquery returns any row, and it does not multiply customers the way a join does. What the subquery selects (`1`, `*`) does not matter; only whether a row exists for that customer.',
      },
      {
        key: 'scalar-many-rows',
        difficulty: 2,
        question: 'Customer 5 has three orders. What happens when this runs?',
        code: `SELECT c.Name,
       (SELECT o.OrderDate
        FROM dbo.Orders o
        WHERE o.CustomerId = c.CustomerId) AS OrderDate
FROM dbo.Customers c
WHERE c.CustomerId = 5;`,
        correct: 'It fails: a subquery used as an expression returned more than one value',
        wrong: [
          'It returns three rows, one per order',
          'It returns one row with the first order date',
          'It returns one row with NULL',
        ],
        why: 'A subquery in the select list must return at most one value per row; with three orders SQL Server raises error 512 at run time. Aggregate it (`MAX(o.OrderDate)`), use `TOP (1) ... ORDER BY`, or join if you want a row per order.',
      },
      {
        key: 'unqualified-inner',
        difficulty: 4,
        question:
          '`dbo.Customers` has columns `Id` and `Name`; `dbo.Orders` has `OrderId` and `CustomerId`. The query is meant to return customers with orders, but it returns every customer. Why?',
        code: `SELECT Name
FROM dbo.Customers
WHERE EXISTS (SELECT 1
              FROM dbo.Orders
              WHERE Orders.CustomerId = CustomerId);`,
        correct:
          'The unqualified `CustomerId` resolves to `Orders.CustomerId`, so the subquery compares each order with itself and is not correlated to the customer',
        wrong: [
          'The unqualified `CustomerId` resolves to `Customers.Id` by naming convention',
          '`EXISTS` ignores the `WHERE` clause of its subquery',
          'SQL Server raises an ambiguity error that is silently ignored',
        ],
        why: 'An unqualified name binds to the nearest scope that has it: `Orders` has `CustomerId`, so the condition is `Orders.CustomerId = Orders.CustomerId`, TRUE for every order with a non-NULL customer. As long as any such order exists, every customer passes. Always qualify columns in correlated subqueries: `WHERE o.CustomerId = c.Id`.',
      },
      {
        key: 'missing-inner-column',
        difficulty: 5,
        question:
          '`dbo.BlockedEmails` has columns `Id` and `Email` (no `CustomerId`) and contains 3 rows. What does this statement do?',
        code: `DELETE FROM dbo.Customers
WHERE CustomerId IN (SELECT CustomerId FROM dbo.BlockedEmails);`,
        correct:
          'It deletes every customer with a non-NULL `CustomerId`: the subquery’s `CustomerId` binds to the outer `Customers` table',
        wrong: [
          'It fails with "Invalid column name \'CustomerId\'"',
          'It deletes nothing, because `BlockedEmails` has no matching column',
          'It deletes 3 customers, matched by position',
        ],
        why: 'A subquery may reference outer columns, so when `BlockedEmails` has no `CustomerId`, SQL Server binds it to `Customers.CustomerId` and the test becomes "is my id in a list of my own id". No error is raised. Qualifying the column (`SELECT b.CustomerId FROM dbo.BlockedEmails b`) turns this into a compile error instead of a data loss.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-cte-scope',
    'A CTE belongs to exactly one statement, and `WITH` has a parsing rule about the statement before it.',
    [
      {
        key: 'semicolon',
        difficulty: 2,
        question: 'This batch fails with a syntax error near `WITH`. Why?',
        code: `DECLARE @Since DATE = '2025-01-01'

WITH Recent AS (
    SELECT CustomerId, COUNT(*) AS Orders
    FROM dbo.Orders
    WHERE OrderDate >= @Since
    GROUP BY CustomerId
)
SELECT * FROM Recent;`,
        correct: 'The statement before a CTE must end with a semicolon',
        wrong: [
          'Variables cannot be used inside a CTE',
          'A CTE must be declared before any variable in the batch',
          'A CTE cannot contain `GROUP BY`',
        ],
        why: '`WITH` is also used for table hints and other options, so T-SQL requires the preceding statement to be terminated with `;` before a CTE. That is why some code writes `;WITH`; terminating every statement is the cleaner habit.',
      },
      {
        key: 'two-statements',
        difficulty: 3,
        question: 'What happens when this batch runs?',
        code: `WITH Recent AS (
    SELECT CustomerId FROM dbo.Orders WHERE OrderDate >= '2025-01-01'
)
SELECT COUNT(*) FROM Recent;

SELECT TOP (10) * FROM Recent;`,
        correct: 'The first `SELECT` works; the second fails with "Invalid object name \'Recent\'"',
        wrong: [
          'Both statements work, because the CTE lives until the end of the batch',
          'Both fail, because a CTE cannot be referenced twice',
          'The second `SELECT` returns the rows cached by the first',
        ],
        why: 'A CTE is a named expression scoped to the single statement that follows it; it is not a temporary table and is not materialized. To reuse a result across statements, store it in a `#temp` table.',
      },
    ],
  ),
];
