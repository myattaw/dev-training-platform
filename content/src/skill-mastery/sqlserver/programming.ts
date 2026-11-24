import type { QuestionSource } from '@pracstack/content-model';
import { tsqlBlankFamily, tsqlChoiceFamily } from './builders';

/*
 * T-SQL programming: variables and control flow, stored procedures, functions,
 * error handling, temporary tables and dynamic SQL. Reviewed by hand.
 */

export const programmingFamilies: readonly QuestionSource[] = [
  ...tsqlChoiceFamily(
    'mssql-variables',
    'Consider what a variable holds before it is assigned, and how `SET` and `SELECT` assignment differ when the query returns zero or many rows.',
    [
      {
        key: 'unassigned',
        difficulty: 1,
        question: 'What does this batch return?',
        code: `DECLARE @Count INT;
SELECT @Count + 1 AS Result;`,
        correct: 'NULL',
        wrong: ['1', '0', 'An error: `@Count` is used before it is assigned'],
        why: 'A declared but unassigned T-SQL variable is NULL (it is not 0 as in some languages), and NULL + 1 is NULL. There is no compile-time "use before assignment" check as in C#.',
      },
      {
        key: 'many-rows',
        difficulty: 3,
        question: "Three customers have `Country = 'NO'`. What happens in statements 1 and 2?",
        code: `DECLARE @Name NVARCHAR(100);

-- 1
SELECT @Name = Name FROM dbo.Customers WHERE Country = 'NO';

-- 2
SET @Name = (SELECT Name FROM dbo.Customers WHERE Country = 'NO');`,
        correct:
          'Statement 1 silently assigns one of the three names; statement 2 fails because the subquery returns more than one value',
        wrong: [
          'Both fail because three rows are returned',
          'Both assign the first name in alphabetical order',
          'Statement 1 fails; statement 2 assigns the last name',
        ],
        why: '`SELECT @v = col` assigns once per row, so the variable ends up with whichever row was processed last: no error, and no guaranteed choice. `SET` with a scalar subquery raises error 512 when more than one row comes back, which surfaces the bug.',
      },
      {
        key: 'zero-rows',
        difficulty: 4,
        question:
          'No customer has `CustomerId = 999`. What are the values of `@A` and `@B` at the end?',
        code: `DECLARE @A NVARCHAR(100) = N'old', @B NVARCHAR(100) = N'old';

SELECT @A = Name FROM dbo.Customers WHERE CustomerId = 999;
SET @B = (SELECT Name FROM dbo.Customers WHERE CustomerId = 999);

SELECT @A AS A, @B AS B;`,
        correct: "`A = 'old'`, `B = NULL`",
        wrong: ["`A = NULL`, `B = 'old'`", 'Both are NULL', "Both are `'old'`"],
        why: 'When the `SELECT` returns no rows, no assignment happens, so `@A` keeps its previous value: a classic bug in loops that reuse a variable. A scalar subquery with no rows yields NULL, so `@B` becomes NULL. Reset the variable or check `@@ROWCOUNT` when using `SELECT` assignment.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-while-loop',
    'Look at exactly which statements belong to the loop body.',
    [
      {
        key: 'counter',
        difficulty: 1,
        question: 'What does this batch print?',
        code: `DECLARE @i INT = 0;
WHILE @i < 3
BEGIN
    SET @i += 1;
    PRINT @i;
END;`,
        correct: '1, 2 and 3, each on its own line',
        wrong: ['0, 1 and 2', '1 and 2', 'Nothing: `PRINT` cannot print an `INT`'],
        why: 'The counter is incremented before it is printed, and the loop stops after `@i` reaches 3. `PRINT` converts the integer to text implicitly.',
      },
      {
        key: 'no-begin-end',
        difficulty: 2,
        question: 'What does this batch print?',
        code: `DECLARE @i INT = 0;
WHILE @i < 3
    SET @i += 1;
    PRINT @i;`,
        correct: 'Only 3, once',
        wrong: ['1, 2 and 3', '0, 1 and 2', 'Nothing; the loop never ends'],
        why: 'Without `BEGIN ... END`, `WHILE` (like `IF`) controls only the next single statement. Indentation means nothing to SQL Server: `PRINT` runs once, after the loop. Always wrap loop bodies in `BEGIN ... END`.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-stored-procedures',
    'Think about what the caller has to write to receive an `OUTPUT` value, and what the client sees for every statement.',
    [
      {
        key: 'nocount',
        difficulty: 1,
        question: 'Why do most stored procedures start with `SET NOCOUNT ON;`?',
        code: `CREATE OR ALTER PROCEDURE dbo.ArchiveOrders @Before DATE
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.OrdersArchive SELECT * FROM dbo.Orders WHERE OrderDate < @Before;
    DELETE FROM dbo.Orders WHERE OrderDate < @Before;
END;`,
        correct:
          'It stops a "rows affected" message being sent to the client for every statement, which saves round-trip noise and can confuse some client libraries',
        wrong: [
          'It stops the procedure from changing more rows than it reads',
          'It makes `@@ROWCOUNT` always return 0 inside the procedure',
          'It prevents the procedure from returning result sets',
        ],
        why: '`SET NOCOUNT ON` suppresses the `(n rows affected)` done messages; some client libraries treat those messages as extra results. `@@ROWCOUNT` still works, and result sets are still returned.',
      },
      {
        key: 'missing-output-keyword',
        difficulty: 2,
        question: 'The procedure sets `@Total` to 42. What does the final `SELECT` return?',
        code: `CREATE OR ALTER PROCEDURE dbo.CountOrders @CustomerId INT, @Total INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT @Total = COUNT(*) FROM dbo.Orders WHERE CustomerId = @CustomerId;
END;
GO

DECLARE @t INT;
EXEC dbo.CountOrders @CustomerId = 7, @Total = @t;
SELECT @t AS Total;`,
        correct:
          'NULL: the caller must also write `OUTPUT` (`@Total = @t OUTPUT`) to receive the value',
        wrong: [
          '42',
          'An error, because an `OUTPUT` parameter was passed without `OUTPUT`',
          '0, the default for an `OUTPUT` parameter',
        ],
        why: '`OUTPUT` is needed on both sides: in the parameter declaration and at the call site. Without it at the call, the value is passed in but not copied back, and no error is raised, so `@t` stays NULL.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-error-handling',
    'Which errors reach a `CATCH` block, and how does the code in `CATCH` raise them again?',
    [
      {
        key: 'throw-rethrow',
        difficulty: 2,
        question:
          'An `INSERT` inside the `TRY` block fails with a primary key violation (error 2627). What does the caller receive?',
        code: `BEGIN TRY
    INSERT INTO dbo.Customers (CustomerId, Name) VALUES (1, N'Ana');
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;`,
        correct: 'The original error 2627, with its original message',
        wrong: [
          'Error 50000 with the message of the original error',
          'Nothing: the `CATCH` block handles the error',
          'A syntax error, because `THROW` needs an error number',
        ],
        why: '`THROW` without arguments, inside a `CATCH` block, re-raises the caught error unchanged: same number, message and severity. Re-raising with `RAISERROR(ERROR_MESSAGE(), 16, 1)` would instead report error 50000.',
      },
      {
        key: 'raiserror-severity',
        difficulty: 3,
        question: 'What happens when this runs?',
        code: `BEGIN TRY
    RAISERROR('Stock is low', 10, 1);
    PRINT 'after';
END TRY
BEGIN CATCH
    PRINT 'caught';
END CATCH;`,
        correct:
          'The message is returned as information, then `after` is printed; `caught` is not printed',
        wrong: [
          '`caught` is printed',
          '`caught` is printed, then `after`',
          'The batch stops with an error',
        ],
        why: 'Severity 10 and below are informational messages, not errors, so they do not transfer control to `CATCH`. Use severity 11–16 for errors in `RAISERROR`, or `THROW`, which always uses severity 16.',
      },
      {
        key: 'deferred-name-resolution',
        difficulty: 5,
        question: '`dbo.Orderz` does not exist (a typo). What happens when this batch runs?',
        code: `BEGIN TRY
    SELECT * FROM dbo.Orderz;
END TRY
BEGIN CATCH
    PRINT 'caught: ' + ERROR_MESSAGE();
END CATCH;`,
        correct:
          'The "Invalid object name" error is not caught by this `CATCH` block; it goes straight to the caller',
        wrong: [
          "It prints `caught: Invalid object name 'dbo.Orderz'.`",
          'The batch does not compile, so nothing runs at all',
          'It returns an empty result set, because the table does not exist yet',
        ],
        why: 'Because of deferred name resolution, the missing table is only discovered when the statement is compiled at run time, and a `TRY ... CATCH` does not catch that error at the same level. It is caught if the failing code runs at a lower level, for example inside a stored procedure or `sp_executesql` called from the `TRY` block.',
      },
      {
        key: 'doomed-transaction',
        difficulty: 4,
        question:
          'With `SET XACT_ABORT ON`, the second `UPDATE` fails. The `CATCH` block then fails too, with "The current transaction cannot be committed and cannot support operations that write to the log file". Why, and what is the fix?',
        code: `SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;
    UPDATE dbo.Accounts SET Balance -= 100 WHERE AccountId = 1;
    UPDATE dbo.Accounts SET Balance += 100 WHERE AccountId = 2;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    INSERT INTO dbo.ErrorLog (Msg) VALUES (ERROR_MESSAGE());
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;`,
        correct:
          'The transaction is doomed (`XACT_STATE()` is -1), so nothing can be written until it is rolled back; roll back first, then write the log row',
        wrong: [
          '`ERROR_MESSAGE()` is NULL inside a transaction; read it after `COMMIT`',
          'A `CATCH` block may not write to tables; log from the calling application instead',
          '`XACT_ABORT` has already rolled back and closed the transaction, so the `INSERT` has no transaction to run in',
        ],
        why: 'After an error under `XACT_ABORT ON` (and after some errors even without it) the transaction becomes uncommittable: it still exists and `@@TRANCOUNT` is still 1, but the only thing allowed is a rollback. Roll back first, then write the log row; `ERROR_MESSAGE()` is still available in the `CATCH` block. The last option is the misconception: inside `TRY ... CATCH` the transaction is not gone yet, it is doomed.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-temp-tables',
    'Compare `#temp` tables and table variables: scope, transactions and statistics.',
    [
      {
        key: 'nested-proc-scope',
        difficulty: 2,
        question:
          'Procedure `A` creates `#Work` and fills it, then calls procedure `B`, which runs `SELECT * FROM #Work;`. What happens?',
        correct:
          '`B` can read `#Work`, because a local temp table is visible to procedures called by its creator',
        wrong: [
          '`B` fails, because `#Work` is only visible inside procedure `A`',
          '`B` reads an empty copy of `#Work`',
          '`B` can read `#Work` only if it is declared as `@Work` instead',
        ],
        why: 'A local temp table lives until the procedure that created it ends, and nested calls can see it. A table variable is the opposite: it is visible only in the batch or procedure that declares it, so `B` could not use `@Work`.',
      },
      {
        key: 'rollback',
        difficulty: 3,
        question: 'How many rows do `#Log` and `@Log` contain after the rollback?',
        code: `CREATE TABLE #Log (Msg NVARCHAR(100));
DECLARE @Log TABLE (Msg NVARCHAR(100));

BEGIN TRANSACTION;
INSERT INTO #Log VALUES (N'step 1');
INSERT INTO @Log VALUES (N'step 1');
ROLLBACK TRANSACTION;

SELECT (SELECT COUNT(*) FROM #Log) AS TempRows,
       (SELECT COUNT(*) FROM @Log) AS VarRows;`,
        correct: '`TempRows = 0`, `VarRows = 1`',
        wrong: [
          '`TempRows = 1`, `VarRows = 0`',
          'Both are 0',
          'Both are 1, because temporary objects are not logged',
        ],
        why: 'Temp tables take part in transactions, so the insert is rolled back. Table variables do not: data written to them survives a rollback. That makes a table variable useful for keeping log rows you want to write after rolling back.',
      },
      {
        key: 'statistics',
        difficulty: 4,
        question:
          'A procedure loads 200,000 ids into a table variable and joins it to a large table. The plan shows a nested loops join with a very low estimated row count for the table variable, and the query is slow. What is the most likely improvement?',
        code: `DECLARE @Ids TABLE (OrderId INT PRIMARY KEY);
INSERT INTO @Ids (OrderId) SELECT OrderId FROM dbo.Staging;

SELECT o.*
FROM dbo.Orders o
JOIN @Ids i ON i.OrderId = o.OrderId;`,
        correct:
          'Use a `#temp` table instead, which has column statistics, so the optimizer can estimate the row count and choose a better join',
        wrong: [
          'Add `WITH (NOLOCK)` to `dbo.Orders`',
          'Remove the primary key from the table variable',
          'Replace the `JOIN` with `IN (SELECT OrderId FROM @Ids)`; that always forces a hash join',
        ],
        why: 'Table variables have no column statistics, so the optimizer works with poor estimates and can choose plans suited to a handful of rows. A temp table gets statistics (and can trigger recompiles as it grows), which fits large intermediate results. `NOLOCK` only changes locking, and rewriting as `IN` does not supply missing statistics.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-dynamic-sql',
    'Separate the values (which can be parameters) from identifiers (which cannot), and check the data types `sp_executesql` expects.',
    [
      {
        key: 'injection',
        difficulty: 2,
        question:
          'This procedure builds a search query from user input. What is the problem, and the fix?',
        code: `DECLARE @sql NVARCHAR(MAX) =
    N'SELECT CustomerId, Name FROM dbo.Customers WHERE Name = ''' + @Name + N'''';
EXEC (@sql);`,
        correct:
          'It is open to SQL injection; pass the value as a parameter with `sp_executesql` and `WHERE Name = @Name`',
        wrong: [
          'It is only a performance problem; wrap the input with `QUOTENAME` and keep `EXEC`',
          'It is safe, because the input is enclosed in quotes',
          'It is safe as long as the procedure runs with `SET NOCOUNT ON`',
        ],
        why: "Input such as `x' OR 1=1 --` closes the string and changes the query. With `sp_executesql` and a parameter, the value is never parsed as SQL, and the plan can be reused. `QUOTENAME` is meant for identifiers and returns NULL for input longer than 128 characters, so it is not a general fix for values.",
      },
      {
        key: 'varchar-statement',
        difficulty: 3,
        question: 'What happens when this runs?',
        code: `DECLARE @sql VARCHAR(500) = 'SELECT COUNT(*) FROM dbo.Orders WHERE CustomerId = @c';
EXEC sys.sp_executesql @sql, N'@c INT', @c = 7;`,
        correct:
          'It fails: `sp_executesql` expects the statement as a Unicode string (`NVARCHAR`), so `@sql` must be declared as `NVARCHAR`',
        wrong: [
          'It returns the order count for customer 7',
          'It fails because `@c` is not declared in the outer batch',
          'It returns NULL, because `VARCHAR` statements ignore parameters',
        ],
        why: "`sp_executesql` requires `@stmt` (and the parameter definition) to be `NVARCHAR`/`NCHAR`; a `VARCHAR` variable is rejected, not converted. Declare `@sql NVARCHAR(MAX)` and use `N'...'` literals. `@c` is declared by the parameter definition string, not in the outer batch.",
      },
      {
        key: 'dynamic-order-by',
        difficulty: 5,
        question:
          'A procedure lets the caller choose the sort column (`@SortColumn`) and a minimum total (`@MinTotal`). Which construction is safe?',
        correct:
          'Check `@SortColumn` against an allowlist of column names, embed it with `QUOTENAME(@SortColumn)`, and pass `@MinTotal` as an `sp_executesql` parameter',
        wrong: [
          'Pass both as `sp_executesql` parameters: `ORDER BY @SortColumn` and `WHERE Total >= @MinTotal`',
          'Concatenate both into the string, since `@MinTotal` is numeric and therefore cannot be injected',
          'Concatenate `@SortColumn` directly, and remove any semicolons from it first',
        ],
        why: 'Parameters can only carry values; `ORDER BY @SortColumn` sorts by a constant, so it compiles but does not sort by the column. Identifiers must be embedded in the string, so validate them against known names and quote them with `QUOTENAME`. Stripping semicolons is not a defense: injection does not need one. Values stay parameters even when numeric, for plan reuse and to avoid conversion surprises.',
      },
    ],
  ),
  ...tsqlBlankFamily(
    'mssql-sp-executesql-blank',
    'The second argument of `sp_executesql` declares every parameter the statement uses, with its type.',
    [
      {
        key: 'input-param',
        difficulty: 3,
        prompt:
          'Fill in the parameter definition so the statement runs with `@cust` as an `INT` parameter (write the declaration as it appears inside the string).',
        template: `DECLARE @sql NVARCHAR(MAX) =
    N'SELECT OrderId, Total FROM dbo.Orders WHERE CustomerId = @cust;';

EXEC sys.sp_executesql @sql, N'{{blank:decl}}', @cust = @CustomerId;`,
        blanks: { decl: ['@cust INT', '@cust INTEGER'] },
        why: 'The parameter definition lists each parameter used in the statement with its data type, just like a procedure signature: `@cust INT`. The value is then passed by name after it. Because the value never becomes part of the SQL text, it cannot inject code, and the cached plan is reused for every customer.',
      },
      {
        key: 'output-param',
        difficulty: 4,
        prompt:
          'The dynamic statement sets `@cnt`. Fill in the keyword that copies its value back into `@Count` in the calling batch.',
        template: `DECLARE @Count INT;
DECLARE @sql NVARCHAR(MAX) =
    N'SELECT @cnt = COUNT(*) FROM dbo.Orders WHERE CustomerId = @cust;';

EXEC sys.sp_executesql @sql,
     N'@cust INT, @cnt INT OUTPUT',
     @cust = @CustomerId,
     @cnt = @Count {{blank:out}};

SELECT @Count;`,
        blanks: { out: ['OUTPUT', 'OUT'] },
        why: 'As with stored procedures, `OUTPUT` (or its short form `OUT`) is needed both in the parameter definition and at the call. Leaving it off the call is not an error, but `@Count` stays NULL.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-functions',
    'Compare how the optimizer treats a scalar function, a multi-statement function and an inline table-valued function.',
    [
      {
        key: 'which-inline',
        difficulty: 3,
        question: 'Which of these is an inline table-valued function?',
        correct:
          '`CREATE FUNCTION dbo.OrdersOf (@c INT) RETURNS TABLE AS RETURN (SELECT OrderId, Total FROM dbo.Orders WHERE CustomerId = @c);`',
        wrong: [
          '`CREATE FUNCTION dbo.OrdersOf (@c INT) RETURNS @r TABLE (OrderId INT, Total DECIMAL(12,2)) AS BEGIN INSERT @r SELECT OrderId, Total FROM dbo.Orders WHERE CustomerId = @c; RETURN; END;`',
          '`CREATE FUNCTION dbo.OrderCount (@c INT) RETURNS INT AS BEGIN RETURN (SELECT COUNT(*) FROM dbo.Orders WHERE CustomerId = @c); END;`',
          '`CREATE PROCEDURE dbo.OrdersOf @c INT AS SELECT OrderId, Total FROM dbo.Orders WHERE CustomerId = @c;`',
        ],
        why: 'An inline TVF is `RETURNS TABLE AS RETURN (single SELECT)`, with no body and no table variable. The optimizer expands it into the calling query like a parameterized view. The `RETURNS @r TABLE ... BEGIN ... END` form is a multi-statement TVF, the third is a scalar function, and a procedure cannot be used in `FROM`.',
      },
      {
        key: 'scalar-udf',
        difficulty: 4,
        question:
          'This query over 2 million customers takes minutes; without the function call it takes seconds. The plan shows no parallelism. What is the usual fix?',
        code: `CREATE FUNCTION dbo.OrderTotal (@c INT) RETURNS DECIMAL(18,2)
AS
BEGIN
    RETURN (SELECT SUM(Total) FROM dbo.Orders WHERE CustomerId = @c);
END;
GO

SELECT c.CustomerId, dbo.OrderTotal(c.CustomerId) AS Spent
FROM dbo.Customers c;`,
        correct:
          'Rewrite it as an inline table-valued function (or a join with `GROUP BY`) and use it with `OUTER APPLY`, so the optimizer can plan it as one set-based query',
        wrong: [
          'Add `WITH SCHEMABINDING` so the function result is cached per customer',
          'Convert it to a multi-statement table-valued function that returns one row',
          'Mark the function `WITH RECOMPILE` so each call gets a fresh plan',
        ],
        why: 'Unless SQL Server can inline it, a scalar UDF that reads data runs once per row, hides its cost from the optimizer and prevents a parallel plan. An inline TVF is expanded into the outer query and can be joined and parallelized. A multi-statement TVF has the same opaque, per-call behavior, and schemabinding does not cache results.',
      },
    ],
  ),
];
