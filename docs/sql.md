# SQL practice (PostgreSQL)

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

Queries are compared by **behaviour, never by SQL text** (`services/api/src/practice/sql-grading.ts`):

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

See `content/src/skill-mastery/postgresql/`. A practice database has a schema (SQL DDL), sample
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
