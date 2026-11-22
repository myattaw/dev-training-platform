# Company Interview Prep

Learners pick a company, see the coding questions a **third-party dataset** associates with it,
and practise related skills with **PracStack's own challenges**, including in timed sessions.

Two kinds of content are always kept apart, in the data model, the API and the UI:

| | Reported questions | Recommended practice |
| --- | --- | --- |
| What it is | A reference to a problem on another site (title, difficulty, link) | An original PracStack challenge |
| Where you solve it | On the provider (link opens in a new tab) | In PracStack's workspace |
| How it counts as done | Only when the learner marks it ("Reviewed externally", "Solved externally") | Only when a server-graded submission passes every test |
| Claim made | "Listed in a third-party company-question dataset" (a reported association) | "Practises related skills"; never "asked by this company" |

Every page carries a "not affiliated with, endorsed by or sponsored by" notice. Frequency values
are always shown with an explanation that they are the source's relative ranking, not a
probability.

## Starting point (audit, 22 Nov 2026)

Before this work PracStack had Skill Mastery (server-graded, scored), five coding challenges
(browser runs plus server grading in isolated runners), Cognito sign-in with PKCE, a JWT-checked
API on Lambda with DynamoDB, a CDK stack with budgets and a kill switch, and a local stack
(file store, Docker runners, local Oracle). Nothing was deployed. Company prep reuses all of it:
the challenge workspace and runner for timed sessions, the progress store pattern for account
data, and the existing auth path for entitlements.

## Data model

Defined in `packages/content-model/src/company.ts`:

- `DataSource`: provenance and licence status (see [company-data-licensing.md](company-data-licensing.md)).
- `Company`: stable slug (`liberty-mutual`), display name, aliases.
- `ExternalProblemReference`: `<source>:<externalId>`, title, URL, difficulty, acceptance rate,
  and **editorial** competency tags (assigned by PracStack, not the source).
- `CompanyQuestionAssociation`: company × problem × source × time window, with the source's
  frequency value, snapshot date and import time. This is many-to-many: Two Sum is stored once
  and associated with both Intuit and PayPal.
- `PlannedChallenge`: a Coming Soon challenge (metadata only; `access: free | pro`).
- `CompanyRecommendation`: challenge, reason, similarity tags, confidence, origin
  (`curated` | `computed`), editorial review status.
- `PreparationPath`: steps that point at challenges, skills or a timed session.

Owned challenges stay in `content/src/challenges` (with hidden tests and TS/Java references).

## Import pipeline

`content/src/companies/import/`:

- `csv.ts`: strict RFC 4180 parser (quotes, escaped quotes, embedded newlines, CRLF, BOM); errors
  carry line numbers.
- `company-csv.ts`: checks the required columns (any order and case, extras reported), the file
  name → time window, kebab-case folders and stable slugs. Per row: numeric IDs, https problem
  URLs on allow-listed hosts only (no credentials or other paths), difficulty, percentages from
  0 to 100, sanitised titles (control and bidirectional-override characters removed), and
  duplicate or conflicting rows. Bad rows are rejected with a reason; good rows are kept.
- `dataset.ts`: pure, repeatable merge. References are deduplicated; associations are keyed by
  company, problem, source and window. A newer snapshot updates; an older one is ignored as
  stale; disagreeing facts (title, URL, difficulty, or a different frequency in the same
  snapshot) are reported as **conflicts** and never overwrite.
- `content/scripts/import-companies.ts`: CLI for authorised sources. Incremental (merges into an
  existing dataset file), prints a summary, exits 1 on rejected rows or conflicts, and refuses
  sources without `bulkImportAllowed`.

The content build runs the demo sample through the same pipeline and fails on any rejected row
or conflict.

## Recommendations

`content/src/companies/recommend.ts` is deterministic and explainable; there is no machine
learning.

1. Editor-curated recommendations first, in the editor's order (`curation.ts`).
2. Remaining places, up to 8: PracStack challenges ranked by the competencies they share with
   the company's references, weighted by the source's frequency value. Broad competencies
   (strings, arrays) count half, and at least one specific competency must be shared, so
   "both use strings" is never enough on its own. Weak matches are dropped rather than padding
   the list.
3. Reasons are generated from the shared competencies ("Practises stacks and string
   manipulation, like “Simplify Path”."). The build rejects reasons that overclaim ("asked",
   "official", "chance", …).

Current output: Liberty Mutual has 4 curated available challenges, 2 Pro Coming Soon previews
and 1 computed match. Capital One has 5, Intuit 5, PayPal 2 and GEICO 1 (all computed).

**Preparation path:** "Liberty Mutual: Text editor preparation", five steps from string
handling to a timed session. A path is shown only if every step points at content that exists
(checked by the build and by the API).

## Pages

| Route | What it shows |
| --- | --- |
| `/companies` | Server-side search (case and accent-insensitive, aliases), an A–Z filter, pages of 25, saved companies with progress |
| `/companies/:slug` | Progress, reported questions (difficulty and time-window filters, source and frequency notes, learner marks), Recommended Practice (Pro previews locked and Coming Soon), the path, timed sessions |
| `/companies/:slug/questions/:id` | One reported question: facts, an external link and the learner's mark; no copied statement |
| `/companies/:slug/practice` | Starts a timed session: challenge, 30/45/60/90 minutes, language; lists sessions in progress |
| `/companies/:slug/practice/:sessionId` | The normal challenge workspace in interview mode, with the countdown, then a summary |

Company data is private content: it is served by the API to signed-in users and is never in the
web bundle (a content test and the leak check enforce this). The catalog page explains sign-in
when signed out; the other pages require it.

## Timed sessions

The server is the clock (`services/api/src/interview/interview-service.ts`):

- `POST /api/interview-sessions` sets `startedAt` and `deadline`. Client-sent times are ignored;
  retrying with the same `clientRequestId` returns the same session; a second session for the
  same challenge while one runs is refused (409), so the clock cannot be reset by starting over.
- Submissions use the normal challenge grader (isolated runner, hidden tests) and are accepted
  only before the deadline (`409 session-expired` afterwards). The best result is kept.
  Concurrent submissions are safe: the session uses optimistic concurrency.
- `finish` is idempotent; after the deadline it records `expired` with the time used capped at
  the deadline. Elapsed time is always computed on the server.
- The browser's countdown is computed from the deadline on every tick and when the tab becomes
  visible again, corrected by the server-clock offset, so it stays right after throttling,
  sleep and reloads. Screen readers hear it only at 10, 5 and 1 minutes left and at the end.
  Closing the tab or navigating away mid-session asks for confirmation; drafts are saved locally
  per session. When time is up the editor becomes read-only.

Visible tests still run in the browser as practice; that is not a security boundary, and only
server-graded submissions count.

## Progress

Per company (`CompanyProgress`): reported questions marked, recommended practice solved
(server-graded), timed sessions completed, last activity, and a status: **Not started**, **In
progress**, or **Completed** (every question marked, every practisable recommendation solved
and at least one timed session completed). External questions show **Not started**, **Reviewed
externally** or **Solved externally**, always set by the learner. Clicking a provider link
changes nothing.
