# SQL practice (PostgreSQL and Oracle)

Two dialects, each on its real engine: PostgreSQL (below) and Oracle (see "Oracle" further down).
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
2. The worker clones a prepared database (schema + data, created once per dataset and cached)
   and switches the session to the `learner` role: `SET SESSION AUTHORIZATION learner`.
3. It runs `BEGIN READ ONLY`, then `DECLARE pracstack_cursor NO SCROLL CURSOR FOR <query>`,
   fetches at most `maxRows + 1` rows, and rolls back.
4. Values are normalized to JSON-safe primitives (numeric as text, dates as ISO strings).

## Security boundaries

Each one was verified with tests (`packages/sql-engine/src/engine.spec.ts`), most against the
attack itself.

| Threat | Control | Enforced by |
| --- | --- | --- |
| Writes, DDL, multiple statements | Query is the body of `DECLARE CURSOR` (single SELECT/WITH/VALUES; no data-modifying CTEs, no `SELECT INTO`), inside a `READ ONLY` transaction | PostgreSQL |
| Reading or changing other data | `learner` has `SELECT` on the exercise tables only; no `CREATE` | PostgreSQL privileges |
| Privilege escalation | Session user is `learner` (not just current user); `set_config` revoked, so the role cannot be reset; string-executing functions (`query_to_xml`) refuse `SET`; superuser-only functions denied | PostgreSQL |
| Host files, network, processes | PGlite has a virtual filesystem only, no sockets, cannot start processes (`COPY … TO PROGRAM` has no effect) | WebAssembly sandbox |
| Infinite or slow queries | The worker thread is terminated at 3 s (PostgreSQL's `statement_timeout` does **not** fire in PGlite; worker termination does interrupt WebAssembly) | Supervisor |
| Memory exhaustion | The supervisor polls the runner's RSS and kills the worker above 1,200 MB | Supervisor |
| Crashing the API | All of the above happens in a separate process; if it dies or hangs, the API restarts it | `ChildProcessSqlEngine` |
| Huge results | At most `maxRows + 1` rows are fetched from the cursor (100 for "Run query", 1,000 for grading) | Cursor `FETCH` |
| Floods | 30 SQL requests per user per minute (runs and answers); at most 20 queued jobs, beyond which requests are refused as busy | API |
| Learning hidden data | Only results and errors from the **sample** data are shown. For hidden datasets the learner only learns that the query was wrong there | Grader |

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

1. The learner's query and the private reference query run on the sample data and on every
   hidden dataset. Reference results are cached per question version.
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
(`postgresql` or `oracle`) and is checked and graded by that dialect's engine. A practice database has a schema (SQL DDL), sample
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
  hard-coded answers).

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

| Boundary | How |
| --- | --- |
| **Datasets are separate schemas** | Each dataset (sample and each hidden one) is a schema owned by a user that cannot log in |
| **Learner SQL runs as a per-dataset user** | It can log in and *read* that one dataset's tables (the `READ` privilege: no writes, not even `SELECT … FOR UPDATE` locks) and nothing else. Hidden datasets are other schemas, so "Run query" cannot read them; the tests try every schema name |
| **Fresh session per run** | Inline PL/SQL (`WITH FUNCTION`) could change session state; every run opens a new connection, so nothing carries over. Inline PL/SQL is also refused before running |
| **Limits** | A client-side call timeout (3 s; the call is cancelled), CPU and logical reads per call (profile), a 64 MB temporary tablespace, rows fetched, 2 runs at a time |
| **No network or files** | `UTL_HTTP`, `UTL_TCP`, `UTL_SMTP`, `UTL_INADDR`, `UTL_FILE`, `DBMS_LDAP` and `HTTPURITYPE` are revoked from `PUBLIC`; Oracle's default network ACLs already block them |
| **Admin credentials** | The SYS/SYSTEM password is random, kept in `.local/oracle.json` (git-ignored), used only to create datasets, and never reaches learner sessions |
| **Local only** | The container listens on 127.0.0.1 only and is limited to 2 CPUs and 2.5 GB |

Values are normalized like the PostgreSQL engine's: numbers stay exact (long ones as text),
`DATE` values print as `YYYY-MM-DD` (with the time when there is one) independent of this
machine's time zone, and Oracle's rule that `''` is NULL applies.

**Known limits.** Learners share one database (separated by users, privileges and limits, not
by a fresh database per run as with PGlite); a query can list other datasets' *schema names*
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
