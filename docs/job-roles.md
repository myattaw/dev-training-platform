# Job Role Preparation and the Job Description Analyzer

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

### Saved plans and privacy

Signed-in users can save the path: `POST /api/me/preparation/plans { title, termIds }`. The API
accepts exactly those two fields (any other field is a 400), validates term ids against the
taxonomy, sanitizes the title like display names (1–80 characters) and keeps at most 10 plans
(409 beyond). A plan's path is rebuilt from its term ids, so the posting is never needed again.
The e2e test asserts that no request body or URL contains the posting.

## API

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/me/preparation` | | `{ targetRoleId, plans }` |
| PUT | `/api/me/preparation/target-role` | `{ roleId }` (null clears) | same; 404 unknown role, 409 coming-soon role |
| POST | `/api/me/preparation/plans` | `{ title, termIds }` | the plan (UUID id) |
| DELETE | `/api/me/preparation/plans/:id` | | `{ deleted: true }`; 404 if not yours |

Storage (`AccountStore`): one record per user. DynamoDB item `USER#<user> / PREP` with top-level
`targetRoleId`, `plans` and `updatedAt`; adding a plan is one conditional `list_append` guarded by
`size(plans) < 10`, so the limit holds under concurrent requests (see `dynamo-account.ts`).

## Limitations

- Keyword matching cannot understand negation ("Java not required" still detects Java) or
  seniority; it only recognizes names in the taxonomy.
- Coverage means PracStack has *some* practice for a term, not that the practice covers
  everything a job means by it.
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
leave it empty when PracStack does not cover the term. Add a test to
`packages/content-model/src/job-analysis.spec.ts` for any new matching subtlety.
