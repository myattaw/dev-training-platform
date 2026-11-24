import type { QuestionSource } from '@pracstack/content-model';
import { json, plain } from '../helpers';
import { tsqlChoiceFamily, tsqlMultiFamily } from './builders';

/*
 * SQL Server Integration Services (SSIS) and Reporting Services (SSRS). Nothing
 * here is executed (there is no SQL Server, Integration Services or Reporting
 * Services engine in PracStack), so these are scenario questions built around
 * package designs, catalog (SSISDB) messages, dataset queries and report
 * expressions, with answer keys reviewed by hand.
 */

export const ssisFamilies: readonly QuestionSource[] = [
  ...tsqlChoiceFamily(
    'mssql-ssis-control-flow',
    'The control flow orders tasks and decides what runs next; the data flow moves rows through sources, transformations and destinations.',
    [
      {
        key: 'control-vs-data',
        difficulty: 1,
        question:
          'A package must empty a staging table, then copy rows from a CSV file into it while trimming and upper-casing the customer code on every row. Where does the per-row trimming belong?',
        code: plain(`Control flow
  [Execute SQL Task] TRUNCATE TABLE stg.Customer
        |  (Success)
        v
  [Data Flow Task]   Load stg.Customer`),
        correct:
          'In the Data Flow Task, as a Derived Column transformation between the Flat File Source and the destination',
        wrong: [
          'In the Execute SQL Task, before the `TRUNCATE`, because the control flow processes rows',
          'On the precedence constraint between the two tasks, as an expression',
          'In a Sequence container around both tasks',
        ],
        why: 'The control flow runs tasks in order (here: truncate, then load) but never touches individual rows. Row-by-row work such as trimming and changing case is done by data flow transformations, like Derived Column, inside a Data Flow Task. Precedence constraint expressions and containers only decide whether and when tasks run.',
      },
      {
        key: 'foreach-files',
        difficulty: 2,
        question:
          'A Foreach Loop container processes every CSV in an inbox folder, and the log shows 12 iterations, one per file. Yet the target table ends up with the first file loaded 12 times. What is missing?',
        code: plain(`Foreach Loop container
  Enumerator:          Foreach File Enumerator
  Folder:              @[$Project::InboxFolder]
  Files:               *.csv
  Retrieve file name:  Fully qualified
  Variable mappings:   User::FileName  <- index 0

  [Data Flow Task]  Flat File Source -> OLE DB Destination

Connection manager "OrdersCsv" (Flat File)
  ConnectionString:    C:\\Inbox\\orders_2026-11-01.csv
  Property expressions: (none)`),
        correct:
          "A property expression that sets the connection manager's `ConnectionString` to `@[User::FileName]`, so each iteration opens the current file",
        wrong: [
          'A second Foreach Loop inside the first one, so the Data Flow Task sees every file',
          'Setting the Data Flow Task to run in parallel with itself',
          'Changing the file mask from `*.csv` to `*.*`',
        ],
        why: 'The loop correctly writes each file name into `User::FileName`, but nothing uses the variable: the Flat File connection manager still points at the fixed path it was designed with. Bind its `ConnectionString` to the variable with a property expression (often with `DelayValidation` on, because the file may not exist at design time). More loops or a different mask do not change which file the connection opens.',
      },
      {
        key: 'expression-escape',
        difficulty: 3,
        question:
          'A File System Task moves each processed file to an archive folder. Its destination path comes from this SSIS expression, which fails to evaluate. What is the fix?',
        code: plain(`"D:\\Archive\\" + @[User::FileNameOnly]`),
        correct:
          'Escape each backslash in the string literal, as in `"D:\\\\Archive\\\\"`, ideally reading the folder from a parameter instead of a literal',
        wrong: [
          'Use `&` instead of `+` to concatenate strings in SSIS expressions',
          'Wrap the variable in `(DT_STR, 260, 1252)` because variables cannot be concatenated with literals',
          'Replace the double quotes with single quotes',
        ],
        why: 'In SSIS expressions the backslash starts an escape sequence inside string literals (`\\n`, `\\t`, `\\"`), so `"D:\\Archive\\"` does not end where you expect: `\\"` is an escaped quote. Write `\\\\` for a literal backslash. `+` is the concatenation operator for strings, a string variable concatenates without a cast, and SSIS string literals use double quotes. A folder that differs per environment is better passed in as a project parameter.',
      },
      {
        key: 'precedence-expression',
        difficulty: 4,
        question:
          'A Row Count transformation in the Data Flow Task writes to `User::NewOrders` (default value 0). The constraint below leads to a task that emails "No new orders today". One night the Data Flow Task fails on its first buffer with a connection error. What happens?',
        code: plain(`Precedence constraint: [Data Flow Task] -> [Send "no new orders" email]
  Evaluation operation:  Expression or Constraint
  Value:                 Success
  Expression:            @[User::NewOrders] == 0`),
        correct:
          'The email is sent: the constraint value fails, but the expression is true because the count is still 0, and "or" needs only one of them',
        wrong: [
          'The email is not sent, because a failed task never evaluates its outgoing precedence constraints',
          'The email is not sent, because "Expression or Constraint" evaluates the expression only after success',
          'The package fails validation, because a Success constraint cannot also have an expression',
        ],
        why: 'Every outgoing constraint is evaluated when a task completes, whatever its result. With "Expression or Constraint" the next task runs when the task succeeded OR the expression is true, and a Row Count variable that never received rows is still at its default of 0, so a failure looks like "no new orders". The intended rule needs "Expression and Constraint" (success AND count = 0), with a separate Failure constraint for alerts.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-ssis-bad-rows',
    'Look at the data types SSIS assigns to each column and at what the component does with a row it cannot process.',
    [
      {
        key: 'unicode-mismatch',
        difficulty: 2,
        question:
          'The source column is `NVARCHAR(100)`, the destination column is `VARCHAR(100)`, and the data flow fails validation with the error below. Which change fixes it?',
        code: plain(`[OLE DB Destination [42]] Error: Column "CustomerName" cannot convert between
unicode and non-unicode string data types.`),
        correct:
          "Convert the column to `DT_STR` with the destination's code page (a Data Conversion transformation, or a `CAST` in the source query) and map the converted column to the destination",
        wrong: [
          'Switch the OLE DB Destination to fast load, which converts types automatically',
          'Set `ValidateExternalMetadata` to False on the destination so the check is skipped',
          'Increase the destination column to `VARCHAR(200)`, because each Unicode character needs two bytes',
        ],
        why: '`NVARCHAR` arrives in the pipeline as `DT_WSTR` (Unicode) and a `VARCHAR` destination expects `DT_STR` (non-Unicode with a code page); SSIS never converts between them implicitly. Convert explicitly and map the new column (Data Conversion adds a copy, so mapping the original column keeps the error). Fast load and skipping validation do not change types, and a longer column does not make a Unicode string non-Unicode.',
      },
      {
        key: 'redirect-bad-dates',
        difficulty: 3,
        question:
          'A nightly flat file sometimes contains values such as `2026-02-30` in `OrderDate`. A Data Conversion to `DT_DBDATE` fails the whole package on such a row. The business wants good rows loaded and bad rows kept for review. What should the design be?',
        code: plain(`Flat File Source
   -> Data Conversion (OrderDate: DT_STR -> DT_DBDATE)
        Error output: Fail component
   -> OLE DB Destination dbo.Orders`),
        correct:
          'Set the conversion\'s error disposition to "Redirect row" and send the error output, with its `ErrorCode` and `ErrorColumn` columns, to a reject table',
        wrong: [
          'Set the error disposition to "Ignore failure" so the bad rows load with their original text',
          'Raise the package `MaximumErrorCount` so the package keeps running after the failure',
          'Wrap the Data Flow Task in a Sequence container with a Failure constraint that reruns it',
        ],
        why: 'An error output lets a component pass rows it cannot process down a separate path; SSIS adds `ErrorCode` and `ErrorColumn` so the rejects can be reviewed. "Ignore failure" does not load the original text: the converted column becomes NULL and the row continues silently. `MaximumErrorCount` only stops the package from failing on the error count; the component still fails and the remaining rows are not processed. Rerunning on failure just fails again on the same row.',
      },
      {
        key: 'fast-load-batch',
        difficulty: 5,
        question:
          'An OLE DB Destination uses fast load with a commit size of 10,000 rows, and its error output is set to "Redirect row" into a reject table. One row in a batch violates a `CHECK` constraint. What lands in the reject table, and how do you isolate just the bad row?',
        code: plain(`OLE DB Destination dbo.FactSales
  Data access mode:            Table or view - fast load
  Maximum insert commit size:  10000
  Error output:                Redirect row -> dbo.FactSales_Rejects`),
        correct:
          'The whole failed batch is redirected; connect that error output to a second destination that inserts row by row (not fast load), whose own error output catches only the bad row',
        wrong: [
          'Only the bad row is redirected, because fast load checks constraints row by row before the bulk insert',
          'Nothing is redirected: with fast load, error outputs are ignored and the package fails',
          'The bad row is redirected and the other 9,999 rows in that batch are silently dropped',
        ],
        why: 'Fast load sends rows as a bulk insert per batch, so when the server rejects the batch, the destination can only redirect the batch as a whole: the 9,999 good rows go to the error output with the bad one. The common pattern is a "cascade": the fast-load error output feeds a second destination in row-by-row mode, which retries those rows individually and redirects only the true failures. You keep fast-load speed for clean batches and still get row-level rejects.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-ssis-lookup',
    'Think about when the Lookup reads its reference data, how much it reads, and what it does with a row that has no match.',
    [
      {
        key: 'no-match',
        difficulty: 3,
        question:
          'A data flow uses a Lookup on `dbo.DimCustomer` to find existing customers and update them. On the first day a brand-new customer appears, the package fails with the message below. What is the right change?',
        code: plain(`[Lookup DimCustomer [17]] Error: Row yielded no match during lookup.
[SSIS.Pipeline] Error: SSIS Error Code DTS_E_PROCESSINPUTFAILED.`),
        correct:
          'Set the Lookup to "Redirect rows to no match output" and connect the no-match output to the path that inserts new customers',
        wrong: [
          'Switch the Lookup from full cache to no cache, so new customers are found in the database',
          'Set the Lookup to "Ignore failure", which inserts unmatched rows automatically',
          'Add a Sort before the Lookup, because a Lookup needs sorted input to match rows',
        ],
        why: 'By default a Lookup fails the component when a row has no match. For incremental loads, unmatched rows are exactly the new ones, so redirect them to the no-match output and insert them, while matched rows go to the update path. The cache mode only changes how reference rows are read; the new customer is not in the table under any mode. "Ignore failure" passes the row on with NULL lookup columns down the match path, and Lookup does not need sorted input (Merge Join does).',
      },
      {
        key: 'cache-mode',
        difficulty: 4,
        question:
          'A daily load brings about 2,000 changed orders and looks up the product key in a reference table of 50 million rows. The data flow spends most of its time before the first row moves, and memory use spikes. Which Lookup configuration fits best?',
        code: plain(`Lookup "Find ProductKey"
  Cache mode:       Full cache
  Connection:       DW
  Reference query:  SELECT * FROM dbo.DimProductHistory   -- 50 million rows, 40 columns`),
        correct:
          'Partial cache (or no cache) with a query that returns only the key columns, so only the products the 2,000 rows need are queried',
        wrong: [
          'Keep full cache: it is always the fastest mode because it never queries the database during the flow',
          'Full cache with a larger `DefaultBufferMaxRows`, so the 50 million rows load in fewer buffers',
          'Replace the Lookup with a Sort and Merge Join over both inputs',
        ],
        why: 'Full cache loads the entire reference query into memory before the data flow starts, which pays off when many input rows hit a reference set that fits comfortably in memory. Here it reads 50 million wide rows to serve 2,000 lookups. Partial or no cache issues a small query per distinct key instead, and the reference query should return only the columns used. Buffer settings do not shrink the cache, and Sort plus Merge Join would sort 50 million rows.',
      },
      {
        key: 'same-batch-duplicates',
        difficulty: 5,
        question:
          "New customers are found with a full-cache Lookup on `dbo.DimCustomer` and inserted from the no-match output. Today's extract contains two rows for the same new customer `C-7781` (an order and an address change), and the load fails with a duplicate key on `CustomerCode`. Why, and what is a reliable fix?",
        code: plain(`Source (2 rows for C-7781)
  -> Lookup DimCustomer (Full cache, no match -> redirect)
       no match -> OLE DB Destination dbo.DimCustomer (fast load)`),
        correct:
          'The cache was filled before the flow started, so both rows miss and both are inserted; remove duplicates per customer before the Lookup (for example in the source query) or stage the rows and upsert them set-based',
        wrong: [
          'Switch to partial cache: the second row then finds the first one, because it was inserted a moment earlier',
          "The destination's fast load inserts rows twice; switching to row-by-row inserts fixes it",
          'Full cache Lookups refresh after every buffer, so the rows must have arrived in the same buffer; reduce the buffer size',
        ],
        why: 'A full cache is a snapshot of the reference table taken when the data flow starts and is never refreshed, so rows inserted by the same data flow are invisible to it. Partial cache is not reliable either: the first row may still sit in an uncommitted fast-load batch when the second is looked up. Make the input one row per business key (pick the latest change), or land the batch in staging and apply it with a set-based upsert.',
      },
    ],
  ),
  ...tsqlMultiFamily(
    'mssql-ssis-dataflow-performance',
    'Some transformations must see all their input rows before they can output any; others work buffer by buffer.',
    [
      {
        key: 'merge-join-sorted',
        difficulty: 2,
        question:
          'A Merge Join combines orders from SQL Server with customer rows from a flat file, joined on `CustomerId`, and fails validation because an input is not sorted. Which statements describe what the Merge Join needs?',
        right: [
          'Both inputs are sorted on the join key columns',
          'If the sort is done by `ORDER BY` in a source query, the source output is marked `IsSorted` and the key column has its `SortKeyPosition` set',
          'The join key columns have matching data types on both inputs',
        ],
        wrong: [
          'Both inputs come from the same connection manager',
          'The left input has fewer rows than the right input',
        ],
        why: 'Merge Join walks two sorted streams in step, so both inputs must be sorted on the join keys, with compatible key types. SSIS only knows an input is sorted when a Sort transformation produced it or when you declare it (`IsSorted` on the output and `SortKeyPosition` on the keys) after an `ORDER BY` in the source query. The inputs can come from different sources, and their sizes do not matter; a Lookup is often the simpler choice when one side is a small reference set.',
      },
      {
        key: 'blocking',
        difficulty: 4,
        question:
          'This data flow reads 40 million sales rows from a SQL Server table on the same server as the warehouse. It runs for hours and pages heavily. Which changes reduce the blocking work in the pipeline?',
        code: plain(`OLE DB Source  SELECT * FROM dbo.SalesLine
  -> Sort       (StoreId, SaleDate)
  -> Aggregate  Group by StoreId, SaleDate; Sum(Amount)
  -> Derived Column  LoadDate = GETDATE()
  -> OLE DB Destination dbo.DailyStoreSales (fast load)`),
        right: [
          'Do the grouping in the source query with `GROUP BY StoreId, SaleDate` and `SUM(Amount)`, which removes both the Sort and the Aggregate',
          'Select only the columns the flow needs instead of `SELECT *`',
        ],
        wrong: [
          'Replace the Derived Column with a Script Component, because Derived Column is a blocking transformation',
          'Add a Union All after the Sort so rows are released to the Aggregate sooner',
          'Switch the destination from fast load to row-by-row inserts to reduce memory pressure',
        ],
        why: 'Sort and Aggregate are fully blocking: they hold every input row before they output anything, which is what fills memory and spills. When the source is SQL Server, push sorting and grouping into the query, where indexes and the optimizer do it far more cheaply, and select only the columns needed so buffers carry fewer bytes. Derived Column is a streaming (non-blocking) transformation, a Union All cannot make an upstream Sort release rows earlier, and row-by-row inserts are much slower than fast load.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-ssis-incremental',
    'An incremental load must pick up every change exactly once, and running it again must not change the result.',
    [
      {
        key: 'scd-type',
        difficulty: 2,
        question:
          'A customer moves from Leeds to Bristol. Sales reports must keep showing her past sales under Leeds and new sales under Bristol. How should `DimCustomer` handle the change?',
        code: plain(`DimCustomer (before)
CustomerKey  CustomerCode  City   ValidFrom   ValidTo     IsCurrent
-----------  ------------  -----  ----------  ----------  ---------
1042         C-1001        Leeds  2024-03-01  9999-12-31  1`),
        correct:
          'Type 2: close row 1042 (set `ValidTo` and `IsCurrent = 0`) and insert a new row with a new `CustomerKey` for Bristol; new facts use the new key',
        wrong: [
          'Type 1: update `City` to Bristol on row 1042',
          'Type 1: update `City` on row 1042 and also update the city on past fact rows',
          'Type 2: insert a new row for Bristol that reuses `CustomerKey` 1042',
        ],
        why: 'A Type 2 change keeps history by adding a new dimension row with its own surrogate key and closing the old one; existing facts still point at the Leeds row, new facts at the Bristol row. Type 1 overwrites the attribute, so all past sales would move to Bristol. Reusing the surrogate key would break the dimension key and make facts ambiguous.',
      },
      {
        key: 'watermark-update',
        difficulty: 4,
        question:
          'An incremental extract reads rows changed since the last run. Rows are modified around the clock, including while the package runs. Which watermark design never misses a change?',
        code: plain(`1. Execute SQL Task:  SELECT LastLoaded FROM etl.Watermark WHERE TableName = 'Orders'  -> User::From
2. Data Flow Task:    SELECT ... FROM dbo.Orders WHERE ModifiedAt > ?   (? = User::From)
3. Execute SQL Task:  UPDATE etl.Watermark SET LastLoaded = ??? WHERE TableName = 'Orders'`),
        correct:
          'Capture an upper bound before extracting, read `ModifiedAt > @From AND ModifiedAt <= @To`, and store `@To` as the new watermark only after the load succeeds',
        wrong: [
          'Set `LastLoaded = GETDATE()` at the end of the package, after the load succeeds',
          'Set `LastLoaded = GETDATE()` at the start of the package, before the extract',
          'Skip the watermark and reload every row from `dbo.Orders` each night',
        ],
        why: 'Taking `GETDATE()` at the end skips rows changed while the extract was running: they were not read, and their timestamps are now below the new watermark. A fixed window (from the previous upper bound to one captured before reading), saved only after success, means every row is in exactly one window and a failed run is simply retried with the same window. Setting the watermark at the start loses the window if the load fails. A full reload works but defeats the purpose of an incremental load.',
      },
      {
        key: 'idempotent-rerun',
        difficulty: 4,
        question:
          "This package loads one business day into `dbo.FactSales`. Last night it failed after 6 of 10 commit batches had been written. The operator reran it and the day's totals are now too high. Which change makes reruns safe?",
        code: plain(`Package LoadFactSales (parameter LoadDate)
  [Data Flow Task]  Source: SELECT ... WHERE SaleDate = ?
                    -> Lookups -> OLE DB Destination dbo.FactSales
                       (fast load, Maximum insert commit size = 100000)`),
        correct:
          'Start with an Execute SQL Task that deletes the rows for `LoadDate` (or load into staging and switch or merge the day in one transaction), so every run produces the same result',
        wrong: [
          'Enable checkpoints so the rerun resumes the Data Flow Task at the first uncommitted batch',
          'Raise `MaximumErrorCount` so the package does not stop halfway again',
          'Set the commit size to 0 so failures never leave partial data',
        ],
        why: 'A package is re-runnable when running it twice for the same input gives the same result. Clearing the target slice first (or loading staging and applying it atomically) achieves that. Checkpoints restart at the failed task, not inside it, so the Data Flow Task reruns from the beginning on top of the committed rows. More allowed errors do not undo partial writes, and a single huge commit only avoids partial data for this one failure mode while making the transaction log and blocking much worse.',
      },
      {
        key: 'late-commit',
        difficulty: 5,
        question:
          'The source application sets `ModifiedAt = SYSDATETIME()` when it updates a row, inside transactions that sometimes stay open for minutes, and the database uses read committed snapshot isolation, so readers see the last committed version instead of waiting. The extract below runs at 02:00 and saves the highest `ModifiedAt` it read (01:59:40). An order updated at 01:58:10 in a transaction that committed at 02:03 never reaches the warehouse. What is the cause and a sound fix?',
        code: `SELECT OrderId, Status, ModifiedAt
FROM dbo.Orders
WHERE ModifiedAt > @LastLoaded;   -- next run: @LastLoaded = '2026-11-22 01:59:40'`,
        correct:
          'The row was invisible at 02:00 and its timestamp is older than the saved watermark, so later runs skip it; use change tracking (or a rowversion bounded by `MIN_ACTIVE_ROWVERSION()`), or re-read an overlap window and upsert idempotently',
        wrong: [
          'The comparison should be `>=` instead of `>`; that alone picks up the row on the next run',
          'Read the source `WITH (NOLOCK)` so uncommitted changes are always included',
          'Change `ModifiedAt` to `datetime2(7)` so the timestamps are precise enough',
        ],
        why: 'A timestamp records when the change was made, not when it became visible. A long transaction can commit a row stamped before a watermark that has already moved past it. Change tracking, or a `rowversion` upper bound capped at `MIN_ACTIVE_ROWVERSION()` (which stays below values of still-open transactions), avoids that; a deliberate overlap window works too if the load is idempotent. `>=` only helps rows that share the exact boundary timestamp, NOLOCK reads changes that may still roll back, and precision has nothing to do with commit timing.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-ssis-deployment',
    'In the project deployment model, packages run from the SSIS catalog (SSISDB), and environments supply the values that differ between servers.',
    [
      {
        key: 'environment-connection',
        difficulty: 1,
        question:
          'The same SSIS project is deployed to the SSIS catalogs on the dev, test and production servers, each with a different source database. How should the connection string be supplied?',
        correct:
          'As a project parameter (or connection manager property) bound to an environment variable, with a dev, test and prod environment referenced by the project',
        wrong: [
          'Hard-coded in each package, with a separate copy of the project per server',
          'Typed into the connection manager in Visual Studio before each deployment',
          "Stored in a variable whose value the package reads from a text file on the developer's machine",
        ],
        why: "Deploy one build of the project everywhere and let each server's catalog provide the differences: an environment holds variables such as `SourceConnectionString`, the project references the environment, and parameters (or connection manager properties) are bound to those variables. Hard-coded or hand-edited values drift between copies and get deployed to the wrong server.",
      },
      {
        key: 'catalog-messages',
        difficulty: 3,
        question:
          'An execution in the SSIS catalog failed. These are its error messages in the order they were logged. Which one tells you what to fix?',
        code: plain(`02:14:07  Load DimCustomer:Error: SSIS Error Code DTS_E_OLEDBERROR. An OLE DB error has occurred.
          Error code: 0x80004005. Description: "Violation of PRIMARY KEY constraint
          'PK_DimCustomer'. Cannot insert duplicate key in object 'dbo.DimCustomer'.
          The duplicate key value is (C-7781)."
02:14:07  Load DimCustomer:Error: SSIS Error Code DTS_E_INDUCEDTRANSFORMFAILUREONERROR.
          The "OLE DB Destination.Inputs[OLE DB Destination Input]" failed because error
          code 0xC020907B occurred, and the error row disposition specifies failure on error.
02:14:07  Load DimCustomer:Error: SSIS Error Code DTS_E_PROCESSINPUTFAILED. The ProcessInput
          method on component "OLE DB Destination" (52) failed with error code 0xC0209029.
02:14:08  LoadCustomers:Error: The execution of the package failed.`),
        correct:
          'The first one: a duplicate `C-7781` violates the primary key of `dbo.DimCustomer`',
        wrong: [
          'The last one: the package failed, so the package-level settings must be changed',
          'The third one: the `ProcessInput` method is broken and the component must be reinstalled',
          'The second one: the error row disposition is wrong and should be set to "Ignore failure"',
        ],
        why: 'SSIS logs the original database error first and then a chain of generic follow-up errors as the failure propagates up through the component, the pipeline and the package. Read the earliest error of the execution: here the destination hit a duplicate key, so the fix is in the data or the lookup logic. Switching the disposition to "Ignore failure" would hide the duplicate rather than fix it.',
      },
      {
        key: 'agent-environment',
        difficulty: 4,
        question:
          'The `SalesETL` project in the production catalog references an environment `Prod`, and its `SourceConnectionString` parameter is bound to a `Prod` variable. Yet a scheduled run, started by the SQL Server Agent job step below, connected to the development database. Why?',
        code: `DECLARE @id bigint;
EXEC SSISDB.catalog.create_execution
     @folder_name     = N'Sales',
     @project_name    = N'SalesETL',
     @package_name    = N'LoadOrders.dtsx',
     @use32bitruntime = 0,
     @reference_id    = NULL,
     @execution_id    = @id OUTPUT;
EXEC SSISDB.catalog.start_execution @id;`,
        correct:
          'No environment reference is applied to the execution (`@reference_id` is NULL), so the parameter keeps the value stored with the project, which came from development',
        wrong: [
          'Environment variables are applied only to packages run from Visual Studio, not from the catalog',
          "SQL Server Agent always ignores project parameters and uses the connection manager's design-time value",
          'The environment must be in the same folder as the project, and `Prod` is in another folder',
        ],
        why: "A project can reference several environments, so each execution must say which one to use: `@reference_id` in `catalog.create_execution`, or the environment selected in the Agent job step. Without it, parameters use the project's own value (the design default, unless a server default was set), here the dev connection string. Environments in another folder are allowed through an absolute reference, and catalog executions started by Agent do use project parameters.",
      },
      {
        key: 'protection-level',
        difficulty: 5,
        question:
          "A package needs a password for an SFTP connection. The project is in source control, built by a pipeline and deployed by an operator account. The current setup works only on one developer's machine. Which setup is sound?",
        code: json(`{
  "ProjectProtectionLevel": "EncryptSensitiveWithUserKey",
  "ProjectParameters": [
    { "Name": "SftpPassword", "Sensitive": false, "Value": "Winter2026!" }
  ]
}`),
        correct:
          'Use `DontSaveSensitive`, mark `SftpPassword` as sensitive, and supply it from a sensitive environment variable in the SSIS catalog',
        wrong: [
          'Keep `EncryptSensitiveWithUserKey`, because the password is then encrypted for every user who opens the project',
          'Use `EncryptAllWithPassword` and put the project password in the repository README for the pipeline',
          'Store the password in a configuration table and read it at run time with an Execute SQL Task',
        ],
        why: '`EncryptSensitiveWithUserKey` encrypts sensitive values with the Windows profile of whoever saved the project, so nobody else can decrypt them; and this parameter is not even marked sensitive, so the password sits in the project file in plain text. With `DontSaveSensitive` nothing secret reaches source control, and a sensitive parameter bound to a sensitive environment variable is stored encrypted in SSISDB and masked in the catalog. A password published next to the project, or kept in plain text in a table, is no protection.',
      },
    ],
  ),
];

export const ssrsFamilies: readonly QuestionSource[] = [
  ...tsqlChoiceFamily(
    'mssql-ssrs-data-sources',
    'Shared items live once on the report server and many reports point at them; embedded items live inside one report.',
    [
      {
        key: 'shared-data-source',
        difficulty: 1,
        question:
          'Forty reports query the same sales database. Next month the database moves to a new server. Which design makes the move a single change?',
        correct:
          'All reports use one shared data source on the report server; update its connection string once',
        wrong: [
          'Each report has an embedded data source, and every report is edited and republished',
          'Each dataset query names the server explicitly, so it is easy to find with search and replace',
          'Each report reads the server name from a report parameter that users type in',
        ],
        why: 'A shared data source is a separate item on the report server that many reports reference, so connection details and stored credentials are managed in one place. Embedded data sources copy those details into every report, so a server move means editing all forty. Letting users type a server name is both fragile and a security risk.',
      },
      {
        key: 'shared-dataset',
        difficulty: 2,
        question:
          'Twelve reports have a Region parameter whose list of valid values comes from the query below, and each report has its own copy of it. Sales operations add a "Closed" flag so retired regions disappear from the lists. What is the best structure going forward?',
        code: `SELECT RegionCode, RegionName
FROM dbo.Region
ORDER BY RegionName;`,
        correct:
          "Publish the query as a shared dataset (adding `WHERE IsClosed = 0`) and have every report's Region parameter get its available values from it",
        wrong: [
          'Keep twelve embedded datasets and add the filter to each one as a report filter',
          "Type the region list into each parameter's available values as fixed labels",
          'Add the filter only to the most used report; the others read its parameter values',
        ],
        why: "A shared dataset is one query, published once, that many reports use; parameter value lists are a classic use, since a fix like hiding closed regions then applies everywhere at once. Twelve embedded copies drift apart, hard-coded value lists go stale, and reports cannot read another report's parameter values.",
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-ssrs-parameters',
    'A multi-value parameter holds an array of values; think about how that array reaches the query and the other parameters.',
    [
      {
        key: 'multi-value-in',
        difficulty: 2,
        question:
          'The report parameter `Region` allows multiple values, and the user picks North and West. Which dataset query returns the orders for both regions?',
        correct: '`SELECT ... FROM dbo.Orders WHERE Region IN (@Region)`',
        wrong: [
          '`SELECT ... FROM dbo.Orders WHERE Region = @Region`',
          '`SELECT ... FROM dbo.Orders WHERE Region LIKE @Region`',
          "`SELECT ... FROM dbo.Orders WHERE Region IN ('@Region')`",
        ],
        why: 'For a text query against SQL Server, Reporting Services expands a multi-value parameter used in `IN (@Region)` into the list of selected values before sending the query. With `=` or `LIKE` the expanded list produces invalid SQL as soon as more than one value is selected, and quoting `@Region` turns it into a literal string instead of a parameter.',
      },
      {
        key: 'equals-multi',
        difficulty: 3,
        question:
          'Testers report that this dataset works when one region is selected but fails with a syntax error when two are. The report parameter `Region` was just changed to allow multiple values. What is the fix?',
        code: `SELECT OrderId, Region, Amount
FROM dbo.Orders
WHERE Region = @Region
  AND OrderDate >= @StartDate;`,
        correct: 'Change the condition to `Region IN (@Region)`',
        wrong: [
          'Change the condition to `Region = @Region OR Region = @Region2`',
          'Cast the parameter with `CAST(@Region AS NVARCHAR(MAX))`',
          'Set the parameter data type to Text, which allows comma-separated values with `=`',
        ],
        why: 'The selected values are substituted as a comma-separated list, so the condition becomes `Region = <first value>, <second value>`, which is invalid SQL; with one selection it happens to work, which hides the bug in quick tests. `IN (@Region)` accepts the expanded list. A cast or a different parameter type does not make `=` compare against several values.',
      },
      {
        key: 'cascading-order',
        difficulty: 3,
        question:
          'A report has cascading parameters: the City list should show only cities of the chosen Country. Its dataset is below. Publishing gives the error shown. What must change?',
        code: plain(`Dataset CityList:  SELECT CityId, CityName FROM dbo.City WHERE CountryCode = @Country

Report parameter order:
  1. City     (available values from CityList)
  2. Country  (available values from CountryList)

Error: The report parameter 'City' has a DefaultValue or a ValidValue that depends
on the report parameter 'Country'. Forward dependencies are not valid.`),
        correct:
          'Move Country above City in the parameter order, so City is resolved after Country',
        wrong: [
          'Make City a multi-value parameter',
          'Replace `@Country` with a report filter on the CityList dataset',
          'Give City a default value, so it no longer needs Country',
        ],
        why: 'Parameters are resolved in their listed order, and a parameter can only depend on parameters above it. Put Country first and CityList can use its value. Multi-value does not change the order, a report filter would make CityList fetch all cities and filter afterwards, and a default value of City still comes from a list that depends on Country.',
      },
      {
        key: 'stored-procedure-list',
        difficulty: 4,
        question:
          'The dataset now calls a stored procedure instead of a text query, and the multi-value Region parameter stopped working: the procedure receives no rows for multi-region selections. Which approach works?',
        code: `CREATE OR ALTER PROCEDURE dbo.GetOrders
    @Regions NVARCHAR(MAX)
AS
SELECT o.OrderId, o.Region, o.Amount
FROM dbo.Orders AS o
WHERE o.Region IN (SELECT value FROM STRING_SPLIT(@Regions, N','));`,
        correct:
          'Set the dataset parameter `@Regions` to `=Join(Parameters!Region.Value, ",")` so the procedure receives one delimited string, which it splits',
        wrong: [
          'Set the dataset parameter to `=Parameters!Region.Value`; Reporting Services expands the array for stored procedures as it does for `IN (@Region)`',
          'Set the dataset parameter to `=Parameters!Region.Label(0)`',
          'Change `@Regions` to a table-valued parameter, which Reporting Services fills from a multi-value parameter automatically',
        ],
        why: 'The `IN (@Region)` expansion only works for text queries; a stored procedure parameter receives a single value. Join the selected values into a delimited string in the dataset parameter expression and split it inside the procedure. `Label(0)` passes just the first label, and Reporting Services does not map a multi-value parameter to a table-valued parameter.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-ssrs-expressions',
    'Report expressions are Visual Basic expressions over the Fields, Parameters, Globals and User collections; check what is evaluated and in which scope.',
    [
      {
        key: 'parameter-in-title',
        difficulty: 1,
        question:
          'The report title should read "Sales from" followed by the start date the user picked in the `StartDate` parameter. Which textbox expression shows that date?',
        correct: '`="Sales from " & Parameters!StartDate.Value`',
        wrong: [
          '`="Sales from " & Fields!StartDate.Value`',
          '`="Sales from " & @StartDate`',
          '`="Sales from " & Globals!StartDate`',
        ],
        why: 'Report parameters are read through the `Parameters` collection with `.Value` (or `.Label` for the display text), and `&` concatenates strings. `Fields` holds dataset columns, `@StartDate` is query syntax, not expression syntax, and `Globals` contains built-in values such as `ExecutionTime` and `ReportName`.',
      },
      {
        key: 'iif-division',
        difficulty: 4,
        question:
          '`Amount` and `Qty` are `decimal` columns. This average-price textbox shows `#Error` on rows where `Qty` is 0, even though the `IIF` checks for zero. Why, and which expression works?',
        code: plain(`=IIF(Fields!Qty.Value = 0, 0, Fields!Amount.Value / Fields!Qty.Value)`),
        correct:
          '`IIF` is a function, so both branches are evaluated before it picks one; use `=IIF(Fields!Qty.Value = 0, 0, Fields!Amount.Value / IIF(Fields!Qty.Value = 0, 1, Fields!Qty.Value))`',
        wrong: [
          'The comparison must be `Fields!Qty.Value == 0`; with a single `=` the condition is always false',
          'Decimal division needs `\\` instead of `/`; with `/` the result is `#Error`',
          'Rows with `Qty` = 0 are aggregated, so wrap the expression in `Sum(...)`',
        ],
        why: '`IIF` evaluates all its arguments before returning one of them, so the division still runs when `Qty` is 0 and decimal division by zero throws. Guard the denominator itself so it is never 0 (or compute the value in the query, or use custom code). Visual Basic uses a single `=` for comparison, `\\` is integer division, and summing does not avoid the division.',
      },
      {
        key: 'group-scope',
        difficulty: 4,
        question:
          "A table has a row group named `RegionGroup` and detail rows per product. A detail-row column should show each product's share of its region's total. Which expression does that?",
        correct: '`=Fields!Amount.Value / Sum(Fields!Amount.Value, "RegionGroup")`',
        wrong: [
          '`=Fields!Amount.Value / Sum(Fields!Amount.Value)`',
          '`=Fields!Amount.Value / Sum(Fields!Amount.Value, "SalesDataset")`',
          '`=Sum(Fields!Amount.Value, "RegionGroup") / Fields!Amount.Value`',
        ],
        why: 'An aggregate without a scope uses the current scope, which in a detail row is that one row, so the share would be 1 (100%). Naming the group makes the aggregate cover all rows of the enclosing region. The dataset scope gives the share of the grand total, and the last option is the inverse ratio.',
      },
      {
        key: 'dataset-scope-filter',
        difficulty: 5,
        question:
          'The tablix has a filter `Category = "Bikes"`. Its "% of total" column uses the expression below, and the percentages add up to only 38%. Why, and what fixes it?',
        code: plain(`Dataset SalesDataset: all categories
Tablix1 filter:       =Fields!Category.Value = "Bikes"
"% of total":         =Sum(Fields!Amount.Value) / Sum(Fields!Amount.Value, "SalesDataset")`),
        correct:
          'The dataset scope ignores the tablix filter, so the denominator includes every category; use the tablix as the scope (`"Tablix1"`), or better, filter Bikes in the dataset query',
        wrong: [
          'Tablix filters are applied after percentages are formatted, so the rounding is off; format with more decimals',
          'Dataset-scope aggregates count each row twice when a tablix has a filter; divide by 2',
          'Percentages only add up to 100% in a matrix, not in a table',
        ],
        why: "Filters on a data region apply only to that data region; an aggregate scoped to the dataset sees all the dataset's rows, including other categories. Scope the denominator to the tablix so it sees the same rows, or, since only Bikes is needed, filter in the query so less data is fetched and every scope agrees.",
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-ssrs-grouping',
    'Row groups expand downward, column groups expand across, and a total belongs to the group it is placed in.',
    [
      {
        key: 'matrix-groups',
        difficulty: 2,
        question:
          'A report must show product categories down the side, one column per year, and the sales amount in each cell. The number of years changes over time. Which layout fits?',
        correct:
          'A matrix with a row group on Category, a column group on Year, and `=Sum(Fields!Amount.Value)` in the data cell',
        wrong: [
          'A table with one fixed column per year, added by hand each January',
          'A matrix with a row group on Year and a column group on Category',
          'A table grouped by Category and Year, with the amount in the detail row',
        ],
        why: 'A matrix creates one column per distinct value of a column group, so new years appear automatically, and the data cell aggregates the rows at each Category and Year intersection. Fixed columns need editing every year, swapping the groups puts years down the side, and a plain table lists years as rows.',
      },
      {
        key: 'subtotal-placement',
        difficulty: 3,
        question:
          "A table is grouped by Region (outer) and Store (inner). Someone wants a subtotal per region beneath that region's stores, and one grand total at the end. Where do the totals go?",
        code: plain(`Row groups
  RegionGroup      (group on Region)
    StoreGroup     (group on Store, shows =Sum(Fields!Amount.Value))`),
        correct:
          'Add a total row after the Store group (inside RegionGroup) for the region subtotal, and a total row after RegionGroup (outside every group) for the grand total',
        wrong: [
          "Add a total row after the Store group only; it shows each region's subtotal and the grand total at the end",
          'Add a total row after RegionGroup only; it repeats under each region',
          'Add a detail row with `=Sum(Fields!Amount.Value, "RegionGroup")` under every store',
        ],
        why: 'A total row sums the rows of the scope it sits in: a row inside RegionGroup, after the stores, repeats for each region and sums that region; a row outside all groups appears once and sums the whole data region. One total row cannot be both. A detail-row expression repeats the region total on every store line instead of once.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-ssrs-performance',
    'Decide where the work happens: in the database, in the report processor, or ahead of time on a schedule.',
    [
      {
        key: 'query-filter',
        difficulty: 3,
        question:
          'This report takes two minutes to render a single year of orders. The year comes from the `Year` parameter, used as a tablix filter. What change helps most?',
        code: plain(`Dataset Orders:  SELECT * FROM dbo.Orders           -- 6 million rows, 10 years
Tablix filter:   =Fields!OrderYear.Value = Parameters!Year.Value`),
        correct:
          'Filter in the dataset query, as in `WHERE OrderDate >= @From AND OrderDate < @To` built from the `Year` parameter, and select only the needed columns',
        wrong: [
          'Move the filter from the tablix to the dataset filters in the report',
          'Add page breaks so the report renders one page at a time',
          'Change the tablix filter to use `Parameters!Year.Label`',
        ],
        why: 'Report filters (on the dataset or the data region) run after the report server has fetched every row, so 6 million rows cross the network and are processed to show one year. A `WHERE` clause lets SQL Server use indexes and return only that year, ideally as a sargable date range. Moving the filter between report objects or adding page breaks does not reduce what is fetched.',
      },
      {
        key: 'cache-snapshot',
        difficulty: 4,
        question:
          'An executive dashboard report runs a 90-second aggregation query. The warehouse is loaded once a night at 03:00, and 300 people open the report in the morning, all with the same parameter values. What should be configured?',
        correct:
          'A cache refresh plan or a report snapshot scheduled after the 03:00 load, so users get the prepared result instead of running the query',
        wrong: [
          'Report `AutoRefresh` every 60 seconds so the data is always current',
          'A longer timeout on the dataset so the 300 executions do not fail',
          'A data-driven subscription that runs the report once per user every morning',
        ],
        why: 'When data only changes nightly and everyone sees the same result, executing the query once after the load and reusing it is the right trade-off: a snapshot or a preloaded cache does exactly that. Auto-refresh and longer timeouts multiply the load, and a subscription per user still runs the query 300 times.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-ssrs-subscriptions',
    'Subscriptions run unattended on the report server, with no user signed in.',
    [
      {
        key: 'stored-credentials',
        difficulty: 3,
        question:
          'Users run the "Weekly sales" report successfully with their own Windows sign-in. Creating an email subscription for it is refused with a message that the data source credentials are not stored. What is needed?',
        correct:
          'Change the data source to use stored credentials (for example a dedicated read-only account), because a subscription has no interactive user to impersonate',
        wrong: [
          'Grant every subscriber the Content Manager role on the report folder',
          "Configure the subscription to run with the subscriber's Windows credentials",
          'Turn on report caching, which supplies the credentials of the last user',
        ],
        why: "Subscriptions are processed by the report server on a schedule, so a data source that relies on the viewer's Windows identity has no one to connect as. Store credentials for a least-privileged account on the data source (or use one that needs none). Folder roles control who can manage items, not how the query connects, and caching does not lend credentials.",
      },
      {
        key: 'data-driven',
        difficulty: 4,
        question:
          'Every Monday, each of 60 regional managers must receive a PDF of the "Regional performance" report filtered to their own region. Managers change often and are maintained in this table. Which approach fits?',
        code: `SELECT ManagerEmail, RegionCode
FROM dbo.RegionManager
WHERE IsActive = 1;`,
        correct:
          'A data-driven subscription that uses this query to set the email recipient and the `Region` parameter for each row',
        wrong: [
          'A standard subscription with all 60 addresses in the To field and the Region parameter set to all regions',
          'Sixty standard subscriptions, each edited by hand when managers change',
          'A report snapshot, which emails itself to every user with access to the folder',
        ],
        why: 'A data-driven subscription reads recipients and parameter values from a query at run time, so each row produces one delivery with its own filter, and changes to the table take effect automatically. A single standard subscription sends the same content to everyone (here every region to every manager), sixty hand-kept ones drift, and snapshots are not a delivery mechanism.',
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-ssrs-security',
    'Folder and item roles decide who can open a report; which rows they see must be enforced where the data is queried.',
    [
      {
        key: 'browser-role',
        difficulty: 2,
        question:
          'The sales team must be able to view and run the reports in the `/Sales` folder but must not change, upload or delete anything. Which assignment fits?',
        correct:
          "Give the sales team's group the Browser role on the `/Sales` folder, which its reports inherit",
        wrong: [
          'Give the group the Content Manager role on the `/Sales` folder',
          'Give the group the Publisher role on the `/Sales` folder',
          'Give each salesperson the Browser role on each report individually',
        ],
        why: "Reporting Services uses role-based security: the Browser role allows viewing reports and folders and managing one's own subscriptions, and assignments on a folder are inherited by its items. Content Manager and Publisher let users change or add content. Per-person, per-report assignments work but become unmanageable; assign roles to groups at folder level.",
      },
      {
        key: 'row-level-filter',
        difficulty: 5,
        question:
          'Every regional manager may open the "Margins" report, but each must see only their own region\'s rows. Which design actually enforces that?',
        code: `SELECT r.RegionName, s.Product, s.Margin
FROM dbo.SalesMargin AS s
JOIN dbo.Region AS r ON r.RegionCode = s.RegionCode
JOIN dbo.RegionAccess AS a ON a.RegionCode = s.RegionCode
WHERE a.UserName = @UserName;`,
        correct:
          'Set the dataset query parameter `@UserName` directly to the expression `=User!UserID`, not to a report parameter a user could set',
        wrong: [
          'Add a hidden report parameter `UserName` with default `=User!UserID` and pass it to `@UserName`',
          "Return all regions and set each row's visibility to hidden unless the region matches the user",
          'Return all regions and add a tablix filter on `User!UserID`',
        ],
        why: "The rows a user may see must be decided in the query, from an identity the user cannot supply. Mapping the query parameter straight to `User!UserID` does that. A hidden report parameter is still a report parameter: its value can be set, for example on the report URL, so a manager could ask for another user's rows. Hiding rows or filtering the tablix only changes the display after all regions' data has already been fetched for that user.",
      },
    ],
  ),
  ...tsqlChoiceFamily(
    'mssql-ssrs-paginated-vs-interactive',
    'Paginated reports are laid out for printing and exporting page by page; Power BI reports are built for interactive exploration.',
    [
      {
        key: 'statements',
        difficulty: 2,
        question:
          'Finance needs a monthly customer statement: a fixed letter-size layout with a header and footer on every page, all transaction lines even if a customer has 40 pages, exported to PDF and mailed. Which kind of report fits?',
        correct: 'A paginated report (RDL) in Reporting Services',
        wrong: [
          'An interactive Power BI report with slicers',
          'A Power BI dashboard pinned with one tile per customer',
          'An Excel PivotTable connected to the warehouse',
        ],
        why: 'Paginated reports are designed for exact, printable layouts: repeating headers and footers, page breaks, every row printed across as many pages as needed, and clean PDF export. Interactive Power BI reports are built for exploring data on screen, not for pixel-precise multi-page documents.',
      },
      {
        key: 'mixed-needs',
        difficulty: 4,
        question:
          'Sales leaders want to slice revenue by product, region and month and click a bar to cross-filter the other visuals. Store managers want a printed weekly 30-page list of every open order per store. Which combination fits?',
        correct:
          "A Power BI report for the leaders' exploration and a paginated report, delivered by subscription, for the store order lists",
        wrong: [
          'One paginated report with every possible grouping as a parameter for both audiences',
          'One Power BI report for both, with store managers printing the order table visual',
          'Two paginated reports, using drillthrough links to imitate cross-filtering',
        ],
        why: 'The two needs pull in opposite directions. Cross-filtering visuals and ad hoc slicing are what Power BI reports do well, while a long, complete, printable row listing is what paginated reports do well (Power BI paginated reports and Power BI Report Server use the same RDL format, so the choice is about report type, not product). Forcing one tool to do both gives either a clumsy parameter-driven "explorer" or a printout that cuts rows off at the visual\'s size.',
      },
    ],
  ),
];
