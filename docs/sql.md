# SQL practice (PostgreSQL, Oracle and SQL Server)

Three dialects, each on its real engine: PostgreSQL (below), Oracle and SQL Server (further down).
Grading is the same for both: results are compared on the sample and the hidden datasets.

Learners write real SQL against a real PostgreSQL engine:
[PGlite](https://github.com/electric-sql/pglite), PostgreSQL compiled to WebAssembly (pinned to
0.5.17). There is no database server to run or pay for; every query gets its own fresh database.

## How a query runs

```
API process ──IPC──▶ SQL runner process (packages/sql-engine/src/runtime/runner.ts)
                       main thread: supervisor (time limit, memory watchdog, one job at a time)
                       └─ worker thread: PGlite (sql-worker.ts)
```

1. The supervisor rejects obviously invalid input with a friendly message (empty, too long,
   not a SELECT/WITH/VALUES/TABLE). This is for clarity only; it is **not** a security control.
2. The worker starts a fresh database from an empty PostgreSQL cluster (`base-cluster.ts`),
   creates the exercise's tables and rows as the setup superuser, grants the `learner` role
   `SELECT` on them, and switches the session to it: `SET SESSION AUTHORIZATION learner`.
   Initializing a cluster (initdb) takes about a second, loading the empty one a fraction of
   that, and the tables and rows milliseconds; so the cluster is made once per worker, and the
   AWS runner image ships one made at image build time (`sql-base.tar`), so even a cold runner
   never runs initdb.
3. It runs `BEGIN READ ONLY`, then `DECLARE pracstack_cursor NO SCROLL CURSOR FOR <query>`,
   fetches at most `maxRows + 1` rows, and rolls back.
4. Values are normalized to JSON-safe primitives (numeric as text, dates as ISO strings).

## Security boundaries

Each one was verified with tests (`packages/sql-engine/src/engine.spec.ts`), most against the
attack itself.

| Threat                           | Control                                                                                                                                                                                         | Enforced by             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Writes, DDL, multiple statements | Query is the body of `DECLARE CURSOR` (single SELECT/WITH/VALUES; no data-modifying CTEs, no `SELECT INTO`), inside a `READ ONLY` transaction                                                   | PostgreSQL              |
| Reading or changing other data   | `learner` has `SELECT` on the exercise tables only; no `CREATE`                                                                                                                                 | PostgreSQL privileges   |
| Privilege escalation             | Session user is `learner` (not just current user); `set_config` revoked, so the role cannot be reset; string-executing functions (`query_to_xml`) refuse `SET`; superuser-only functions denied | PostgreSQL              |
| Host files, network, processes   | PGlite has a virtual filesystem only, no sockets, cannot start processes (`COPY … TO PROGRAM` has no effect)                                                                                    | WebAssembly sandbox     |
| Infinite or slow queries         | The worker thread is terminated at 3 s (PostgreSQL's `statement_timeout` does **not** fire in PGlite; worker termination does interrupt WebAssembly)                                            | Supervisor              |
| Memory exhaustion                | The supervisor polls the runner's RSS and kills the worker above 1,200 MB                                                                                                                       | Supervisor              |
| Crashing the API                 | All of the above happens in a separate process; if it dies or hangs, the API restarts it                                                                                                        | `ChildProcessSqlEngine` |
| Huge results                     | At most `maxRows + 1` rows are fetched from the cursor (100 for "Run query", 1,000 for grading)                                                                                                 | Cursor `FETCH`          |
| Floods                           | 30 SQL requests per user per minute (runs and answers); at most 20 queued jobs, beyond which requests are refused as busy                                                                       | API                     |
| Learning hidden data             | Only results and errors from the **sample** data are shown. For hidden datasets the learner only learns that the query was wrong there                                                          | Grader                  |

**Known limits**, stated plainly:

- The memory watchdog polls every 25 ms; a query can briefly exceed the limit before being killed.
  Peak memory per run is several hundred MB, which is why only one query runs at a time.
- Each grading outcome reveals one bit about the hidden data (right or wrong). That is inherent
  to hidden tests; the rate limit bounds it.
- The local runner is a single process on your machine. On AWS (Phase 7) the runner becomes a
  separate Lambda function with its own memory limit, no network access, and no IAM permissions,
  so the operating system enforces the memory cap as well.

## Grading

Queries are compared by **behavior, never by SQL text** (`services/api/src/practice/sql-grading.ts`):

1. The learner's query runs on the sample data and on every hidden dataset, in **one batch**
   (on AWS, one runner invocation; it stops at the first dataset where the query fails). It is
   compared with the reference query's results on the same datasets, which the content build
   records in the private grading data (`expected` on the answer key); without a recording (or
   when it does not match the datasets) the API runs the reference query once per question
   version and caches the results.
2. Results are compared as multisets of rows (or in order, when the question has
   `ordered: true`). Numbers compare numerically, so `2.50` equals `2.5`.
3. Outcomes:
   - all datasets match: **correct**;
   - right data but rows in the wrong order, columns in a different order, or different column
     names (when the question checks them): **partial**;
   - wrong on the sample: **incorrect**, with the reason ("Expected 2 rows, but your query returns 3");
   - right on the sample but wrong on hidden data: **incorrect**, with a hint not to rely on
     sample values (hidden rows are never shown);
   - not a query at all (empty, `DELETE …`): refused with 400 and not scored.

"Run query" (`POST /api/skill-mastery/practice/run-sql`) runs on the sample data only and is
never graded or scored. It requires an open token for a SQL question, so the endpoint cannot be
used as a general-purpose database.

## Authoring

See `content/src/skill-mastery/postgresql/` and `oracle/`; each question has a `dialect`
(`postgresql`, `oracle` or `sqlserver`) and is checked and graded by that dialect's engine. A practice database has a schema (SQL DDL), sample
data and at least one hidden dataset, written as structured tables (converted to quoted
`INSERT`s by `tablesToSql`). Questions reference the database and give a reference query:

```ts
sql({
  id: 'pg-where-title',
  difficulty: 2,
  prompt: text('List the `name` of every employee whose `title` is exactly `Engineer`.'),
  ordered: false,
  answer: { referenceQuery: "SELECT name FROM employees WHERE title = 'Engineer'" },
  hints: ['…'],
  explanation: text('…'),
});
```

The content build runs every reference query on every dataset through the same engine, and:

- fails if setup or the reference query errors, or returns more than 1,000 rows;
- fails if an `ordered` question's reference has no `ORDER BY`;
- warns if the hidden datasets give the same result as the sample (they would not catch
  hard-coded answers);
- records the PostgreSQL reference results in the grading data, so grading never reruns them.
  (Only PostgreSQL: its engine is part of every build, so the output does not depend on whether
  the local Oracle or SQL Server is running.)

For ordered questions, make sure the sort key has no ties in any dataset, or a correct query
could legitimately return tied rows in another order.

## Oracle

The Oracle SQL track runs on **Oracle Database Free** (23ai/26ai Free, the free edition, in the
`gvenzl/oracle-free` slim image pinned by digest) in a local Docker container. Oracle cannot
run inside AWS Lambda, so **on AWS the Oracle track serves only its questions that need no
database** (half of each skill) until a cloud Oracle host is chosen.

```bash
npm run oracle:start    # once per boot: starts or reuses "pracstack-oracle" on 127.0.0.1:1521 (≈ 1.3 GB download once)
npm start               # the local API uses it automatically when it is running
npm run oracle:stop     # or oracle:remove to delete it and its settings
```

Without it, Oracle SQL-writing questions are skipped (the API never serves a question it
cannot grade), and the content build warns that the Oracle reference queries were not run.

### Security boundaries (`packages/sql-engine/src/oracle-engine.ts`)

Unlike PGlite there is one long-lived database, so isolation comes from Oracle's own access
control, set up by the engine:

| Boundary                                   | How                                                                                                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Datasets are separate schemas**          | Each dataset (sample and each hidden one) is a schema owned by a user that cannot log in                                                                                                                                                         |
| **Learner SQL runs as a per-dataset user** | It can log in and _read_ that one dataset's tables (the `READ` privilege: no writes, not even `SELECT … FOR UPDATE` locks) and nothing else. Hidden datasets are other schemas, so "Run query" cannot read them; the tests try every schema name |
| **Fresh session per run**                  | Inline PL/SQL (`WITH FUNCTION`) could change session state; every run opens a new connection, so nothing carries over. Inline PL/SQL is also refused before running                                                                              |
| **Limits**                                 | A client-side call timeout (3 s; the call is cancelled), CPU and logical reads per call (profile), a 64 MB temporary tablespace, rows fetched, 2 runs at a time                                                                                  |
| **No network or files**                    | `UTL_HTTP`, `UTL_TCP`, `UTL_SMTP`, `UTL_INADDR`, `UTL_FILE`, `DBMS_LDAP` and `HTTPURITYPE` are revoked from `PUBLIC`; Oracle's default network ACLs already block them                                                                           |
| **Admin credentials**                      | The SYS/SYSTEM password is random, kept in `.local/oracle.json` (git-ignored), used only to create datasets, and never reaches learner sessions                                                                                                  |
| **Local only**                             | The container listens on 127.0.0.1 only and is limited to 2 CPUs and 2.5 GB                                                                                                                                                                      |

Values are normalized like the PostgreSQL engine's: numbers stay exact (long ones as text),
`DATE` values print as `YYYY-MM-DD` (with the time when there is one) independent of this
machine's time zone, and Oracle's rule that `''` is NULL applies.

**Known limits.** Learners share one database (separated by users, privileges and limits, not
by a fresh database per run as with PGlite); a query can list other datasets' _schema names_
(not their contents) in `ALL_USERS`; CPU limits are per call, so a slow query is stopped by the
3 s timeout.

### Tests

- `packages/sql-engine/src/oracle-engine.spec.ts`: values, Oracle syntax, errors, isolation
  between datasets (hidden data), writes, network packages, runaway queries.
- `content/src/checks/oracle-questions.spec.ts`: every Oracle reference query on every dataset.
- `services/api/src/practice/oracle-grading.spec.ts`: hard-coded and NULL-mistake answers fail
  on hidden data without revealing it; behavior without an Oracle engine.
- `e2e/oracle.e2e.ts`: practicing in the browser against the local Oracle.

All start Oracle in Docker (about 20 s); `PRACSTACK_SKIP_DOCKER_TESTS=1` skips them.

## Oracle PL/SQL track

A separate track (`content/src/skill-mastery/plsql/`, id `oracle-plsql`): blocks and
variables, conditions and loops, cursors, exceptions, procedures and functions, packages,
`BULK COLLECT`/`FORALL`, and triggers. Its questions are knowledge questions (predict the
output, fill in the blank, multiple choice), so practicing needs no database and works on AWS.

Every code sample is run on Oracle Database Free by
`content/src/checks/plsql-snippets.spec.ts` (`runOracleScript` in
`packages/sql-engine/src/oracle-script.ts`): each in a brand-new Oracle user holding the practice
tables (`PLSQL_SETUP` in `plsql/builders.ts`), dropped afterwards.

- predict-output: `DBMS_OUTPUT` must print exactly the answer;
- fill-in-blank: the code must run with every accepted answer (answers are not case-sensitive);
- code shown with a multiple-choice question must run, or, with `plsqlCheck: { kind: 'fails' }`,
  fail with exactly the named error (`ORA-01422`, or `compile` when a CREATE compiles with errors;
  anonymous blocks that do not compile fail with `ORA-06550`).

Scripts are written SQL*Plus style: a PL/SQL unit ends with a line holding only `/`.

Learners do not run their own PL/SQL yet: that needs an Oracle database reachable from AWS (see
Oracle above). The job analyzer maps "PL/SQL" in postings to this track (`plsql` term).

## SQL Server (T-SQL)

The SQL Server track's querying skills include runnable T-SQL questions
(`content/src/skill-mastery/sqlserver/runnable.ts`, 20 questions on a small shop database).
Locally they run on **SQL Server 2022 Developer edition** (Microsoft's
`mcr.microsoft.com/mssql/server` image, pinned by digest) in Docker. Developer edition is free
for development and testing only, not for serving a public site; starting it accepts
Microsoft's SQL Server license terms (`ACCEPT_EULA=Y`), which the project owner has accepted.
There is no SQL Server on AWS yet, so **on AWS the track serves only its hand-reviewed
questions** (see [enterprise-prep.md](enterprise-prep.md) for the hosting options).

```bash
npm run sqlserver:start   # once per boot: starts or reuses "pracstack-sqlserver" on 127.0.0.1:1433 (≈ 1.6 GB download once)
npm start                 # the local API uses it automatically when it is running
npm run sqlserver:stop    # or sqlserver:remove to delete it and its settings
```

Without it, the runnable T-SQL questions are skipped and the content build warns that their
reference queries were not run.

### Security boundaries (`packages/sql-engine/src/sqlserver-engine.ts`)

| Boundary                                    | How                                                                                                                                                                                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Datasets are separate databases**         | Each dataset (sample and each hidden one) is its own database, built by `sa` and then set `READ_ONLY`, so nothing can change it and readers take no locks (one learner cannot block another)                                                         |
| **Learner SQL runs as a per-dataset login** | Its only permission is `SELECT` on that database's `dbo` schema. `guest` is disabled, so other datasets (hidden data included) cannot be opened (Msg 916), and `VIEW ANY DATABASE` is revoked from `public`, so they are not even listed             |
| **Fresh session per run**                   | Every run opens a new connection, so temp tables and `SET` options never carry over                                                                                                                                                                  |
| **One result set**                          | A batch that returns a second result set is cancelled and refused; statements that write fail on permissions and the read-only database                                                                                                              |
| **Limits**                                  | A 3 s request timeout (the batch is cancelled), a 1 s lock timeout, rows fetched (cancelled after one extra row), 4 runs at a time                                                                                                                   |
| **No shell, files or network**              | `xp_cmdshell`, OLE automation, ad hoc `OPENROWSET`, CLR and external scripts are kept off; `xp_dirtree`, `xp_fileexist`, `xp_subdirs`, `xp_regread` and similar are revoked from `public`; bulk `OPENROWSET` needs a permission learners do not have |
| **Admin credentials**                       | The `sa` password is random, kept in `.local/sqlserver.json` (git-ignored), used only to create datasets, and never reaches learner sessions                                                                                                         |
| **Local only**                              | The container listens on 127.0.0.1 only and is limited to 2 CPUs and 2.5 GB (SQL Server itself to 2 GB)                                                                                                                                              |

Values: `date` prints as `YYYY-MM-DD`, `datetime`/`datetime2` add the time when there is one
(independent of this machine's time zone), `bit` is a boolean, `bigint` is a number when it is
exact and text otherwise. Errors show as SQL Server reports them, e.g.
`Msg 207, Level 16, Line 1: Invalid column name 'x'.`

**Known limits.** Learners share one server (separated by logins, permissions and read-only
databases); a batch can create `#temp` tables in `tempdb` for up to the 3 s timeout; dataset
logins are visible by name in `sys.server_principals` (not their data).

### Tests

- `packages/sql-engine/src/sqlserver-engine.spec.ts`: values, T-SQL syntax, errors, isolation
  between datasets, writes, shell/file procedures, runaway queries, sharing between processes.
- `content/src/checks/sqlserver-questions.spec.ts`: every T-SQL reference query on every dataset.
- `services/api/src/practice/real-content.spec.ts`: grades every reference answer through the
  real grader.
- `e2e/sqlserver.e2e.ts`: practicing in the browser against the local SQL Server.

All start SQL Server in Docker (about 10 s); `PRACSTACK_SKIP_DOCKER_TESTS=1` skips them.
