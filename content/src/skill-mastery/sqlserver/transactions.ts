import type { QuestionSource } from '@pracstack/content-model';
import { tsqlBlankFamily, tsqlChoiceFamily } from './builders';

/*
 * SQL Server transactions and concurrency: XACT_ABORT, @@TRANCOUNT, isolation
 * levels, row versioning (RCSI and SNAPSHOT), blocking, deadlocks and MERGE.
 * Reviewed by hand (no engine yet).
 */

const threeInserts = (prefix: string): string => `${prefix}BEGIN TRANSACTION;
INSERT INTO dbo.Items (ItemId) VALUES (1);
INSERT INTO dbo.Items (ItemId) VALUES (1);   -- duplicate primary key
INSERT INTO dbo.Items (ItemId) VALUES (2);
COMMIT TRANSACTION;`;

export const transactionFamilies: readonly QuestionSource[] = [
  ...tsqlChoiceFamily(
    'mssql-xact-abort',
    'By default, many run-time errors end only the failing statement, not the transaction.',
    [
      {
        key: 'off',
        difficulty: 3,
        question:
          '`dbo.Items` is empty and `ItemId` is its primary key. The session uses default settings (`XACT_ABORT OFF`) and there is no `TRY ... CATCH`. Which rows are in the table afterwards?',
        code: threeInserts(''),
        correct:
          'Items 1 and 2: only the failing statement was rolled back, and `COMMIT` still ran',
        wrong: [
          'No rows: an error inside a transaction rolls the whole transaction back',
          'Only item 1: the batch stops at the error and the open transaction is committed',
          'Only item 1, and the transaction is left open',
        ],
        why: 'With `XACT_ABORT OFF`, a primary key violation is a statement-level error: that `INSERT` is undone, execution continues with the next statement, and `COMMIT` commits the rest. Many developers assume a transaction is "all or nothing" automatically; it is only if you check for errors or turn `XACT_ABORT` on.',
      },
      {
        key: 'on',
        difficulty: 3,
        question:
          'The same batch, but with `SET XACT_ABORT ON` first. Which rows are in the table afterwards?',
        code: threeInserts('SET XACT_ABORT ON;\n\n'),
        correct: 'No rows: the error rolls back the whole transaction and aborts the batch',
        wrong: [
          'Items 1 and 2',
          'Only item 1',
          'Only item 1, with the transaction left open for the caller to commit',
        ],
        why: 'With `XACT_ABORT ON`, most run-time errors terminate the batch and roll back the entire transaction, so the third `INSERT` and the `COMMIT` never run. That is the behavior most code expects from a transaction.',
      },
      {
        key: 'client-timeout',
        difficulty: 4,
        question:
          'A procedure starts a transaction, updates some rows, then runs a slow query. The application’s 30-second command timeout fires. Afterwards, other sessions stay blocked on the updated rows for minutes. What is the best fix in the procedure?',
        code: `CREATE OR ALTER PROCEDURE dbo.CloseMonth @Month DATE
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    UPDATE dbo.Ledger SET Closed = 1 WHERE PostingMonth = @Month;
    EXEC dbo.RebuildMonthlySummary @Month;   -- slow
    COMMIT TRANSACTION;
END;`,
        correct:
          'Add `SET XACT_ABORT ON;` at the top, so the cancelled batch also rolls back its transaction',
        wrong: [
          'Add a `TRY ... CATCH` with `ROLLBACK`; the `CATCH` block runs when the client cancels',
          'Add `WITH (NOLOCK)` to the `UPDATE`, so it does not hold locks',
          'Switch the database to `READ COMMITTED SNAPSHOT`, so the update takes no locks',
        ],
        why: 'A client timeout sends an attention signal that stops the batch, and no `CATCH` block runs. With `XACT_ABORT OFF` the transaction stays open, holding its locks, on a connection that may sit in the pool. With `XACT_ABORT ON`, the cancellation rolls the transaction back. Writers still take exclusive locks under RCSI, and `NOLOCK` does not apply to the target of an `UPDATE`.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-trancount',
    '`BEGIN TRANSACTION` increments `@@TRANCOUNT`; `COMMIT` decrements it; `ROLLBACK` (without a savepoint) sets it to 0.',
    [
      {
        key: 'two-begins',
        difficulty: 1,
        question: 'What does the `SELECT` return?',
        code: `BEGIN TRANSACTION;
BEGIN TRANSACTION;
SELECT @@TRANCOUNT AS Depth;`,
        correct: '2',
        wrong: ['1', '0', 'An error: a transaction is already open'],
        why: 'Each `BEGIN TRANSACTION` increments `@@TRANCOUNT`, even though there is really only one transaction. Nesting is allowed; it just counts.',
      },
      {
        key: 'nested-rollback',
        difficulty: 4,
        question: 'What does the `SELECT` return?',
        code: `BEGIN TRANSACTION;
    INSERT INTO dbo.Audit (Msg) VALUES (N'outer');
    BEGIN TRANSACTION;
        INSERT INTO dbo.Audit (Msg) VALUES (N'inner');
    ROLLBACK TRANSACTION;
SELECT @@TRANCOUNT AS Depth;`,
        correct: '0, and both inserts are undone',
        wrong: [
          '1, and only the inner insert is undone',
          '1, and both inserts are undone',
          '0, and only the inner insert is undone',
        ],
        why: 'SQL Server has no truly nested transactions: `ROLLBACK` without a savepoint name rolls back everything to the outermost `BEGIN` and sets `@@TRANCOUNT` to 0. To undo only part of the work, use `SAVE TRANSACTION name` and `ROLLBACK TRANSACTION name`.',
      },
      {
        key: 'inner-commit',
        difficulty: 4,
        question: 'Which rows remain in `dbo.Audit` after this batch?',
        code: `BEGIN TRANSACTION;
    INSERT INTO dbo.Audit (Msg) VALUES (N'outer');
    BEGIN TRANSACTION;
        INSERT INTO dbo.Audit (Msg) VALUES (N'inner');
    COMMIT TRANSACTION;
ROLLBACK TRANSACTION;`,
        correct: 'Neither row',
        wrong: ['Only `inner`', 'Only `outer`', 'Both rows'],
        why: 'An inner `COMMIT` only decrements `@@TRANCOUNT` from 2 to 1; nothing is made durable until the outermost commit. The final `ROLLBACK` therefore undoes both inserts. Expecting the inner commit to "save" its work is the classic misconception.',
      },
      {
        key: 'proc-mismatch',
        difficulty: 5,
        question:
          'The caller has already opened a transaction and inserted a row. Then it runs `EXEC dbo.AddLine`, and the `INSERT` inside the procedure fails. The caller receives the original error and also "Transaction count after EXECUTE indicates a mismatching number of BEGIN and COMMIT statements. Previous count = 1, current count = 0." What happened to the caller’s earlier insert?',
        code: `CREATE OR ALTER PROCEDURE dbo.AddLine @OrderId INT, @ProductId INT
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;
        INSERT INTO dbo.OrderLines (OrderId, ProductId) VALUES (@OrderId, @ProductId);
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;`,
        correct:
          'It was rolled back too: the procedure’s `ROLLBACK` undid the whole transaction, including the caller’s work',
        wrong: [
          'It is kept: the procedure only rolled back its own nested transaction',
          'It is kept but uncommitted; the caller must run `COMMIT` twice',
          'It is committed automatically when the transaction count changes',
        ],
        why: 'The procedure’s `BEGIN TRANSACTION` only raised `@@TRANCOUNT` to 2, so its `ROLLBACK` rolled back the caller’s transaction as well, and SQL Server reports the count mismatch on return. Code that may run inside a caller’s transaction should use a savepoint, or leave the rollback to the outermost level.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-isolation-levels',
    'For each isolation level, ask which locks readers take and how long they keep them.',
    [
      {
        key: 'default',
        difficulty: 1,
        question:
          'In a SQL Server database (not Azure SQL Database) where no isolation options have been changed, which isolation level does a new session use?',
        correct: '`READ COMMITTED`, implemented with shared locks',
        wrong: ['`SERIALIZABLE`', '`READ UNCOMMITTED`', '`SNAPSHOT`'],
        why: 'SQL Server defaults to `READ COMMITTED` using locks: readers never see uncommitted data, but they can wait for writers. Azure SQL Database enables the row-versioning variant (`READ_COMMITTED_SNAPSHOT`) by default, which is why behavior can differ between the two. `SERIALIZABLE` is the ANSI default but not SQL Server’s.',
      },
      {
        key: 'dirty-read',
        difficulty: 2,
        question:
          'A dashboard query uses `WITH (NOLOCK)`. It showed an order total of 5,000, but that order was rolled back a second later and never existed. What happened?',
        code: `SELECT SUM(Total) AS OpenValue
FROM dbo.Orders WITH (NOLOCK)
WHERE Status = 'Open';`,
        correct:
          'A dirty read: `NOLOCK` is `READ UNCOMMITTED`, which reads changes that are not committed yet',
        wrong: [
          'A phantom read: a new row was inserted between two reads',
          'A lost update: the dashboard overwrote the order',
          'A deadlock: the rollback was caused by the dashboard',
        ],
        why: '`NOLOCK` takes no shared locks and reads data in flight, including changes later rolled back. It can also skip rows or read the same row twice while pages move. It is not a "faster read" with no consequences.',
      },
      {
        key: 'non-repeatable',
        difficulty: 3,
        question:
          'Within one transaction, session A reads an account balance twice. Between the reads, session B updates the balance and commits, so A’s two reads differ. Among the lock-based levels, which is the lowest isolation level that prevents this?',
        correct: '`REPEATABLE READ`',
        wrong: ['`READ COMMITTED`', '`READ UNCOMMITTED`', '`SERIALIZABLE`'],
        why: 'Under `READ COMMITTED`, shared locks are released as soon as the row is read, so B can update it before A reads again: a non-repeatable read. `REPEATABLE READ` holds shared locks until the end of the transaction, so B waits. `SERIALIZABLE` also prevents it, but it is not the lowest level that does.',
      },
      {
        key: 'phantom',
        difficulty: 4,
        question:
          'Session A runs at `REPEATABLE READ` and counts customer 5’s orders twice in one transaction: first 3, then 4. Session B inserted and committed a new order for customer 5 in between, without being blocked. Why?',
        correct:
          '`REPEATABLE READ` locks only the rows already read; a new row in the range is a phantom, which only `SERIALIZABLE` (key-range locks) prevents',
        wrong: [
          'B’s insert should have been blocked; this only happens when `NOLOCK` is used',
          '`REPEATABLE READ` releases its locks after each statement',
          '`COUNT(*)` reads without locks at every isolation level',
        ],
        why: 'Locks on existing rows cannot stop a row that does not exist yet. `SERIALIZABLE` locks the key range that was read (needing a suitable index), so inserts into it wait. Row versioning (`SNAPSHOT`) avoids the anomaly in a different way, by reading a consistent snapshot.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-row-versioning',
    'With row versioning, readers get a committed version from the version store instead of waiting; ask "as of when?".',
    [
      {
        key: 'rcsi-reader',
        difficulty: 3,
        question:
          'The database has `READ_COMMITTED_SNAPSHOT ON`. Session A runs this and has not committed. Session B, at the default `READ COMMITTED` level, runs `SELECT Price FROM dbo.Products WHERE ProductId = 1;`. What does B get?',
        code: `-- Session A (price was 10)
BEGIN TRANSACTION;
UPDATE dbo.Products SET Price = 12 WHERE ProductId = 1;`,
        correct: '10, immediately: B reads the last committed version',
        wrong: [
          '12, immediately',
          'B waits until A commits or rolls back, then gets the final price',
          'An update conflict error',
        ],
        why: 'Under RCSI, `READ COMMITTED` reads use row versions, so readers do not wait for writers and see the most recently committed value as of the start of their statement. Without RCSI, B would block on A’s exclusive lock. B never sees the uncommitted 12.',
      },
      {
        key: 'update-conflict',
        difficulty: 4,
        question:
          'Both sessions run at `SNAPSHOT` isolation. Each starts a transaction and reads row 1. Session A updates row 1 and commits. Then session B updates row 1. What happens to B?',
        correct:
          'B’s update fails with a snapshot update conflict and its transaction is rolled back',
        wrong: [
          'B’s update overwrites A’s change (last writer wins)',
          'B waits forever, because A’s version is still in the version store',
          'B’s update succeeds, but only after re-reading A’s committed value',
        ],
        why: '`SNAPSHOT` detects that the row changed after B’s snapshot began and aborts B with an update conflict, preventing a lost update. The application must retry the whole transaction. RCSI behaves differently: there, an update simply waits for the lock and then updates the current row.',
      },
      {
        key: 'statement-vs-transaction',
        difficulty: 5,
        question:
          'Under RCSI, a report runs two queries in one transaction: the total of all order lines, then the total per region. When orders are committed between the two queries, the totals do not match. Which change gives both queries the same point-in-time view without blocking writers?',
        correct: 'Run the transaction at `SNAPSHOT` isolation (with `ALLOW_SNAPSHOT_ISOLATION ON`)',
        wrong: [
          'Use `READ UNCOMMITTED`, so both queries see the latest data',
          'Use `REPEATABLE READ`, which keeps the rows read by the first query stable',
          'Nothing is needed: RCSI already gives each transaction a single snapshot',
        ],
        why: 'RCSI gives statement-level consistency: each statement sees data as of its own start. `SNAPSHOT` gives transaction-level consistency: every statement sees data as of the transaction’s first read. `REPEATABLE READ` blocks writers and still allows new rows (phantoms), and `READ UNCOMMITTED` makes consistency worse.',
      },
      {
        key: 'check-then-insert',
        difficulty: 5,
        question:
          'The database uses RCSI. Under load, two customers sometimes book the same seat. What is the reliable fix?',
        code: `BEGIN TRANSACTION;
IF NOT EXISTS (SELECT 1 FROM dbo.Bookings
               WHERE ShowId = @ShowId AND SeatId = @SeatId)
    INSERT INTO dbo.Bookings (ShowId, SeatId, CustomerId)
    VALUES (@ShowId, @SeatId, @CustomerId);
COMMIT TRANSACTION;`,
        correct:
          'Add a unique constraint on `(ShowId, SeatId)` and handle the duplicate-key error (the check can also read `WITH (UPDLOCK, HOLDLOCK)` to serialize bookings)',
        wrong: [
          'Turn RCSI off, because locking `READ COMMITTED` keeps the shared lock from the check until commit',
          'Add `WITH (NOLOCK)` to the check, so it sees bookings that are not committed yet',
          'Nothing in the database can prevent it; the transaction already makes the check and the insert atomic',
        ],
        why: 'Both sessions run the check before either inserts, both see no booking, and both insert. A transaction does not make check-then-act atomic. Locking `READ COMMITTED` releases shared locks right after the read, so turning RCSI off does not help. A unique constraint makes the database enforce the rule; `UPDLOCK, HOLDLOCK` makes the second session wait at the check.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-deadlocks',
    'Blocking is waiting for a lock; a deadlock is a cycle of waits that SQL Server breaks by choosing a victim.',
    [
      {
        key: 'blocking',
        difficulty: 2,
        question:
          "Session 61 ran `BEGIN TRANSACTION; UPDATE dbo.Orders SET Status = 'Held' WHERE OrderId = 5;` and then its user went to lunch. Session 72’s `SELECT * FROM dbo.Orders WHERE OrderId = 5;` has been waiting for 20 minutes (no row versioning). What is this?",
        correct:
          'Blocking: 72 waits for 61’s exclusive lock and will continue only when 61 commits or rolls back (or 72 times out)',
        wrong: [
          'A deadlock: SQL Server will soon pick one session as the victim',
          'A deadlock that SQL Server failed to detect',
          'Lock escalation: 72 will continue once the lock escalates to the table',
        ],
        why: 'Nothing is waiting on 72, so there is no cycle and the deadlock monitor has nothing to resolve; this is plain blocking caused by a long-open transaction. Keep transactions short and never wait for user input inside one.',
      },
      {
        key: 'victim',
        difficulty: 3,
        question: 'An application receives this error. What should it do?',
        data: `Msg 1205, Level 13, State 51
Transaction (Process ID 87) was deadlocked on lock resources with another
process and has been chosen as the deadlock victim. Rerun the transaction.`,
        correct:
          'Retry the whole transaction from the beginning, a limited number of times with a short delay',
        wrong: [
          'Retry only the statement that failed; the earlier statements are still in the transaction',
          'Commit the transaction, because the other process has finished',
          'Add `WITH (NOLOCK)` to every query, so deadlocks cannot happen',
        ],
        why: 'The victim’s transaction has already been rolled back, so retrying just the last statement would run it outside the original transaction. Retrying the whole unit of work is safe and usually succeeds. Then reduce deadlocks at the source (access order, indexes, shorter transactions); `NOLOCK` does not stop writers deadlocking.',
      },
      {
        key: 'access-order',
        difficulty: 4,
        question:
          'These two procedures run concurrently many times a minute and occasionally deadlock. What is the most direct fix?',
        code: `-- dbo.PayInvoice
BEGIN TRANSACTION;
UPDATE dbo.Accounts SET Balance -= @Amount WHERE AccountId = @AccountId;
UPDATE dbo.Invoices SET Paid = 1 WHERE InvoiceId = @InvoiceId;
COMMIT TRANSACTION;

-- dbo.CancelInvoice
BEGIN TRANSACTION;
UPDATE dbo.Invoices SET Cancelled = 1 WHERE InvoiceId = @InvoiceId;
UPDATE dbo.Accounts SET Balance += @Refund WHERE AccountId = @AccountId;
COMMIT TRANSACTION;`,
        correct:
          'Make both procedures update the tables in the same order (for example `Accounts`, then `Invoices`)',
        wrong: [
          'Run both at `SERIALIZABLE`, so they cannot interleave',
          'Set `DEADLOCK_PRIORITY HIGH` in both procedures',
          'Split each procedure into two transactions, one per `UPDATE`',
        ],
        why: 'Each procedure holds a lock on one table while requesting the other in the opposite order, so two calls can wait on each other in a cycle. A consistent access order removes the cycle. `SERIALIZABLE` holds more locks for longer (more deadlocks), equal priorities change nothing, and splitting the transactions breaks the atomicity of the payment.',
      },
    ],
  ),
  ...tsqlBlankFamily(
    'mssql-transaction-template',
    'The `CATCH` block must work whether or not a transaction is still open.',
    [
      {
        key: 'xact-abort',
        difficulty: 2,
        prompt:
          'Fill in the session option that makes any run-time error roll back the whole transaction.',
        template: `SET {{blank:option}} ON;

BEGIN TRY
    BEGIN TRANSACTION;
    UPDATE dbo.Accounts SET Balance -= 100 WHERE AccountId = 1;
    UPDATE dbo.Accounts SET Balance += 100 WHERE AccountId = 2;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;`,
        blanks: { option: ['XACT_ABORT'] },
        why: '`SET XACT_ABORT ON` makes run-time errors (and client cancellations) roll back the whole transaction, which is what a money transfer needs. The `TRY ... CATCH` still rolls back and re-raises explicitly, so the error reaches the caller.',
      },
      {
        key: 'trancount',
        difficulty: 3,
        prompt:
          'Fill in the function that tells the `CATCH` block whether there is a transaction to roll back.',
        template: `SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;
    UPDATE dbo.Accounts SET Balance -= 100 WHERE AccountId = 1;
    UPDATE dbo.Accounts SET Balance += 100 WHERE AccountId = 2;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF {{blank:check}} > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;`,
        blanks: { check: ['@@TRANCOUNT'] },
        why: 'The error may happen before `BEGIN TRANSACTION` or after the transaction already ended, and `ROLLBACK` without an open transaction is itself an error that would hide the original one. `@@TRANCOUNT > 0` guards against that. (`XACT_STATE() <> 0` also works, but `XACT_STATE() > 0` would skip a doomed transaction.)',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-merge',
    '`MERGE` is a single statement, but it matches rows first and modifies them afterwards.',
    [
      {
        key: 'duplicate-source',
        difficulty: 4,
        question:
          'The staging table accidentally contains two rows for product 7. What happens when this runs?',
        code: `MERGE dbo.Products AS t
USING dbo.StagingPrices AS s
    ON t.ProductId = s.ProductId
WHEN MATCHED THEN
    UPDATE SET t.Price = s.Price
WHEN NOT MATCHED BY TARGET THEN
    INSERT (ProductId, Price) VALUES (s.ProductId, s.Price);`,
        correct:
          'It fails: a target row cannot be updated more than once by the same `MERGE`; de-duplicate the source first',
        wrong: [
          'Product 7 gets the price from the last staging row',
          'Product 7 gets the price from the first staging row',
          'Product 7 is inserted a second time',
        ],
        why: 'When two source rows match the same target row, `MERGE` raises an error instead of choosing one, and the whole statement is rolled back. (A plain `UPDATE ... FROM` with a join would silently pick one row, which is worse.) Reduce the source to one row per key, for example with `ROW_NUMBER()`.',
      },
      {
        key: 'upsert-race',
        difficulty: 5,
        question:
          'Under concurrent calls for a new key, this upsert occasionally fails with a primary key violation. Why, and what is the usual fix?',
        code: `MERGE dbo.PageViews AS t
USING (SELECT @Url AS Url) AS s
    ON t.Url = s.Url
WHEN MATCHED THEN
    UPDATE SET t.Views = t.Views + 1
WHEN NOT MATCHED THEN
    INSERT (Url, Views) VALUES (s.Url, 1);`,
        correct:
          'Both sessions can find no match before either inserts; add `WITH (HOLDLOCK)` to the target so the key range stays locked until the insert',
        wrong: [
          '`MERGE` is atomic, so the error must come from a trigger on the table',
          'Add `WITH (NOLOCK)` to the target, so each session sees the other’s insert',
          'Replace `WHEN NOT MATCHED` with `WHEN NOT MATCHED BY SOURCE`',
        ],
        why: '`MERGE` is a single statement but not a lock on "this key does not exist": under the default isolation level two sessions can both read "no match" and both insert. `HOLDLOCK` (serializable semantics on the target) takes a key-range lock during the match, so the second session waits and then updates. `NOT MATCHED BY SOURCE` means target rows missing from the source, which is a different thing.',
      },
    ],
  ),
];
