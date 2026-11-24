# Job Role Preparation, the Job Description Analyzer and the Interview Study Planner

Learners pick a target job role and follow a preparation path built **only from real PracStack
content**, or paste a job posting and get the same kind of path for the technologies it asks for.
Nothing is invented: every activity points at a skill or a coding challenge that exists, and the
content build rejects anything else. Where PracStack has no practice, the pages say so.

## Model

`packages/content-model/src/roles.ts`:

- `ActivityRef`: `{ kind: 'skill', skillId }`, `{ kind: 'challenge', challengeId, language? }` or
  `{ kind: 'scenario', scenarioId }`. Scenario refs are reserved for Enterprise Scenarios and are
  invalid until the validator is given `scenarioIds`. A challenge ref with a `language` opens the
  workspace in that language and counts as solved only in that language.
- `RoleCompetency { id, name, description, activities }`: the activities are in the recommended
  order. A competency with no activities is shown as "No practice on PracStack yet": honest
  coverage information.
- `JobRole`: `available` roles have a description and an ordered list of competencies;
  `coming-soon` roles have only a title, summary and technologies (their page says there is no
  path yet and lists related practice through their technologies).
- `validateRoles(roles, { skillIds, challengeIds, challengeLanguages?, scenarioIds?, termIds })`:
  duplicate ids, unknown or repeated activities, unknown technologies, a language the challenge
  does not offer, coming-soon roles with competencies, and available roles with fewer than
  **4 competencies that have practice**.

Content: `content/src/roles/roles.ts` (roles) and `content/src/roles/taxonomy.ts` (terms). The
content build validates both against the real skills and challenges and publishes them as public
files, `roles.json` and `taxonomy.json`, referenced from `manifest.json` (`preparation`). They
contain no secrets: only names and ids that the catalogs already publish.

| Role | Status |
| --- | --- |
| .NET Backend Developer | Available (12 competencies, all with practice) |
| Full-Stack Angular + .NET Developer | Available |
| C# / .NET Developer | Available |
| ASP.NET Core Backend Developer | Available |
| SQL Server Database Developer | Available |
| Azure Developer | Available |
| Power Platform Developer | Available |
| Enterprise Application Developer | Coming soon |
| Power Platform Solution Architect | Coming soon |

## Pages

| Route | What it shows |
| --- | --- |
| `/roles` | Search and technology filter (in the URL), status badges, the target role highlighted, saved plans |
| `/roles/:roleId` | Description, technologies, competencies in order with linked activities and statuses, progress, suggested next activity, "Set as my target role" |
| `/roles/analyze` | The job description analyzer |
| `/roles/plans/:planId` | A saved plan: its path rebuilt from the stored term ids (signed in) |

Roles and the analyzer work signed out. Setting a target role, tracking progress and saving plans
need an account (or local mode, where the local developer user is used).

## Progress calculation

Progress uses only server data the app already fetches:

- **Skills**: `GET /api/skill-mastery/progress?technologyId=…` for each technology the path uses.
  A skill is *mastered* when the server says `mastered`, *practiced, not mastered* when it has at
  least one attempt, and *not yet assessed* otherwise.
- **Challenges**: `GET /api/challenges/progress`. A challenge activity is *solved* when a
  server-graded submission passed every test; if the activity names a language, only a solve in
  that language counts (`languagesSolved`). *Attempted* means submitted but not solved.

The role page shows these separately, with labels:

- **Content coverage**: competencies with practice on PracStack / all competencies.
- **Skills mastered**: x of y; **skills practiced, not yet mastered**; **skills not yet assessed**.
- **Challenges solved**: x of y.

There is deliberately **no single "readiness" percentage**: mastering a skill and solving a
challenge are different evidence, and competencies without practice cannot be measured at all.
Every page with progress carries a note that completing a path is practice on PracStack, not
professional experience.

**Suggested next activity**: the first activity, in path order, that is not mastered (skills) or
solved (challenges). Scenario refs are skipped. Signed out, it is the first activity.

## The analyzer

`analyzeJobDescription(text, taxonomy)` in `packages/content-model/src/job-analysis.ts` is a pure,
deterministic function. **It runs in the browser**: the posting is never sent to PracStack,
logged, or stored (not even in `localStorage`; the text box also disables spell checking, which
some browsers send to a cloud service). The page says "Analyzed in your browser; the text is not
sent to PracStack". There is no AI, no network call and no learning.

### Taxonomy

`TaxonomyTerm { id, label, category, aliases, variants?, matchCase?, ambiguity?, practice, tracks?, note? }`.
Categories: language, framework, database, cloud, devops, testing, security, business-apps,
practice, architecture. `practice` is the ordered list of activities that cover the term; an
empty list means **not covered yet**. `validateTaxonomy` checks ids, that no name belongs to two
terms (case-insensitively), that `matchCase` entries are real names, and that practice and tracks
exist.

### Matching rules

- **Token boundaries.** A name matches only when it is not preceded by a letter, digit, `_`, `#`,
  `+`, `.` or `-`, and not followed by a letter, digit, `_`, `#`, `+` or a `.word`. So "Java"
  never matches inside "JavaScript", ".NET" never inside "ASP.NET" or "ADO.NET", "SQL" never inside
  "T-SQL", "MySQL" or "NoSQL", "ADO" never inside "ADO.NET", and "C#" is distinct from "C" and
  "C++". Spaces inside names match any whitespace.
- **Case.** Case-insensitive, except names listed in `matchCase`: words that are also English
  ("REST" vs "the rest", "React" vs "react quickly") and acronyms ("ADO", "CDS", "CRM", "JS").
- **Longest match wins** where matches overlap: "SQL Server" is one SQL Server match, not also
  generic SQL; "Azure DevOps" is not also "Azure"; "ASP.NET Core" is not also "ASP.NET". A term is
  still reported if it is mentioned separately elsewhere ("SQL Server … good SQL" gives both).
- **Ambiguous names** (`ambiguity.aliases`) are low confidence. With `context`, they count only if
  a context word (or a word starting with it: "pipeline" → "pipelines") is in the same sentence:
  "ADO" is Azure DevOps only next to DevOps, pipeline, board or repo words; "CRM" is Dynamics 365
  only next to Microsoft, Dynamics or Power Platform words; "MVC" is ASP.NET MVC only next to .NET,
  C# or ASP. "ASP.NET" alone maps to the term "ASP.NET (classic or Core)", which explains both.
- Languages with common-word names (Go, R, Rust) are deliberately not in the taxonomy.

**Confidence**: *high* for the canonical label or an unambiguous alias, *medium* for a variant
(abbreviation, informal or historical name: "Postgres", "MSSQL", "Microsoft Flow", "CDS"), *low*
for an ambiguous name resolved by context. A term's confidence is the best of its mentions.

**Evidence**: the sentence or line containing each match (split on new lines and on `.`, `!`, `?`,
`;` followed by whitespace), whitespace collapsed, bullets removed, at most 160 characters with an
ellipsis window around the match; up to three distinct snippets per term.

**Experience requirements** ("5+ years of C#", "3-5 years working with SQL Server", "five years
in …") are extracted when the sentence mentions experience or the number is followed by
of/in/with/using; they are shown as information only, with a note that PracStack cannot satisfy
years-of-experience requirements.

**Limits**: empty input shows an explanation; input over 20,000 characters is truncated with a
notice. Analysis of 20,000 characters takes a few milliseconds (a unit test asserts < 50 ms).

**Suggested path**: `suggestPath(termIds, taxonomy)` orders covered terms by category (languages
first, ways of working last) and then by first mention; activities shared by several terms appear
once. Uncovered terms are listed separately under "Not covered by PracStack yet".

### Requirement levels, alternatives and qualifications

Detection confidence (how sure a name match is) is kept separate from how the posting asks for
something, which drives preparation priority:

| Requirement level | From | Priority |
| --- | --- | --- |
| Required | Requirements / Minimum qualifications / What we're looking for…, or "required", "must have", "strong", "proficiency" | High |
| Core responsibility | Responsibilities / What will you do? / In this role…, or a line starting with a work verb ("Write", "Maintain", "Debug") | High |
| Preferred | Preferred qualifications / Nice to have, or "preferred", "is a plus", "an advantage" | Medium |
| General familiarity | "familiarity with", "exposure to", "basic knowledge of" | Low |
| One of several options | "X or Y", or examples ("such as", "e.g.") | The group's level, for the chosen option only |
| Mentioned | About us, Benefits… | Low |
| Uncertain | No headings and no wording | Medium |

The wording nearest a mention wins over its section, so "Nice to have: Docker" inside a
Requirements list is preferred. Alternative groups record their kind (`or` or `examples`), level
and the broader requirement they illustrate ("cloud platforms (e.g., Azure, AWS)" → parent
`cloud`); the learner chooses which option to prepare (default: their preferred language, else
the best-covered option). Degrees, work eligibility and communication are listed separately as
qualifications that PracStack cannot practice or verify.

### Coverage

`TaxonomyTerm.coverage` (derived when not set): **executable** (code or SQL that runs and is
graded), **conceptual** (knowledge questions), **partial** (direct practice for part of the term),
**related** (only `relatedPractice`: transferable, never counted as coverage) and **none**. Every
term that is not directly covered must have a `gap` that says what is not covered, with optional
official documentation links (https on an allowed documentation host; each URL was checked when
added). Examples: modern C# is *related* practice for .NET Framework; ASP.NET Core is *related* for
classic ASP.NET MVC; "ASP.NET" alone is *partial*; SSIS and SSRS are *conceptual*, with a gap
saying packages and reports are not built or deployed.

### Study planner

`packages/content-model/src/study-planner.ts`, pure and deterministic like the analyzer, in the
browser. Inputs: the requirements (term, level, priority), interview settings (date, daily
minutes, format, preferred language), today's date, content metadata (from the public catalogs;
missing content is never linked) and server-graded progress.

- **Without a date**: a prioritized path. **With a date**: days from today to the day before the
  interview; the total never exceeds days × daily minutes (one hour a day is assumed, and said,
  when no daily time is given). What does not fit is listed, most important first.
- **Ranking**: priority, then weighted breadth first (each requirement's first activity before
  any second; core technologies for the interview format get about three activities for every one
  of a peripheral requirement), then job-aware order inside a requirement by interview format:
  enterprise exercises first for enterprise interviews, algorithm challenges first for live
  coding. General algorithm challenges drop one priority for enterprise, backend, database and
  knowledge interviews. When the format is "Not sure yet", the format of the inferred role is used.
- **Durations**: skills 25 min (developing 35, strong 15, mastered 10 as an optional final
  review), challenges 20/40/60 min by difficulty, scenarios their estimate, external study
  30/20/15 min by priority, a 20-minute review every third day and a 45-minute mock interview on
  the last day.
- **Progress**: solved challenges and completed scenarios are not scheduled again (listed as done,
  verified). Skills: not assessed (never answered: not a weakness), practiced (fewer than 3
  answers), developing, strong (score ≥ 70) or mastered. Manual marks (external study, reviews,
  mock interviews) and skips are stored separately from server-graded progress.
- **Not covered**: important requirements PracStack does not fully cover stay in the plan as
  external study items, with what is not covered and documentation links.
- **Inferred focus**: the job role with the most high-priority overlap, shown as "inferred".

### Saved plans and privacy

Signed-in users can save a plan: `POST /api/me/preparation/plans` with `title`, `termIds`,
`settings`, `requirements` (term, level, priority), `schedule` (days of activity keys and
minutes) and `done` / `skipped` keys. Every object is validated field by field and any unknown
field is a 400, so posting text and evidence excerpts cannot be stored even by a modified
client. `PATCH /api/me/preparation/plans/:id` renames, changes settings, replaces or removes the
schedule (`schedule: null`) and records marks; plans are stored per user, so another user's plan
id is not found (404). At most 10 plans (409 beyond); the `advanced-preparation-plans` feature
flag is reserved for future premium plan features, and nothing is gated today.

A saved schedule is shown exactly as saved, with today's statuses. It changes only when the
learner reschedules ("Reschedule unfinished work", or "Recalculate the remaining days") or saves a
new date or daily time: days before today and completed work keep their place, and everything
else is planned again from today. The posting itself stays in the page's memory while it is open
and is never stored, not even in the browser.
The e2e test asserts that no request body or URL contains the posting.

## API

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/me/preparation` | | `{ targetRoleId, plans }` |
| PUT | `/api/me/preparation/target-role` | `{ roleId }` (null clears) | same; 404 unknown role, 409 coming-soon role |
| POST | `/api/me/preparation/plans` | `{ title, termIds, settings?, requirements?, schedule?, done?, skipped? }` | the plan (UUID id) |
| PATCH | `/api/me/preparation/plans/:id` | any of `title, settings, requirements, schedule` (null removes), `done, skipped` | the plan; 404 if not yours |
| DELETE | `/api/me/preparation/plans/:id` | | `{ deleted: true }`; 404 if not yours |

Storage (`AccountStore`): one record per user. DynamoDB item `USER#<user> / PREP` with top-level
`targetRoleId`, `plans` and `updatedAt`; adding a plan is one conditional `list_append` guarded by
`size(plans) < 10`, so the limit holds under concurrent requests (see `dynamo-account.ts`).

## Limitations

- Keyword matching cannot understand negation ("Java not required" still detects Java) or
  seniority; it only recognizes names in the taxonomy.
- Coverage levels are curated per term; even direct practice does not cover everything a job
  means by a technology, and practice is not professional experience.
- Requirement levels come from headings and nearby wording; unusual postings (one long paragraph,
  tables, other languages) are classified as uncertain or mentioned.
- Durations are estimates; the planner does not adapt to how fast the learner actually works.
- Enterprise Scenarios are not registered yet; the scenario step of the .NET path uses the
  `employee-api` enterprise challenge until they are.

## Adding a role or a term

**A role**: add it to `content/src/roles/roles.ts`. Use real skill and challenge ids (the build
fails otherwise), order competencies and activities as a learner should take them, and list
technologies as taxonomy term ids. Make it `available` only when at least 4 competencies have
practice and the path is coherent; otherwise `coming-soon` with only title, summary and
technologies. Run `npm run content:build` and update `content/src/content.spec.ts`.

**A term**: add it to `content/src/roles/taxonomy.ts` with a kebab-case id (never renamed: saved
plans store it), the canonical `label`, unambiguous `aliases`, `variants` for abbreviations and
historical names, `matchCase` for names that are also English words or acronyms, and `ambiguity`
(with `context`) for names that can mean something else. Point `practice` at real activities, or
leave it empty when PracStack does not cover the term (then add a `gap`, and
`relatedPractice` where something transfers). Add a test to
`packages/content-model/src/job-analysis.spec.ts` for any new matching subtlety.
