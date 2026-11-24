# Company question data: licensing review

**Date of review:** 22 November 2026. **Outcome:** rights for bulk or commercial reuse are **not
established**. PracStack imports only a small, manually curated demonstration sample, and the
import tooling refuses the source for bulk import. This is a factual review of what the source
states, not legal advice.

## Source

| | |
| --- | --- |
| Repository | https://github.com/snehasishroy/leetcode-companywise-interview-questions |
| Content | One folder per company, CSV files per time window (`all.csv`, and e.g. `more-than-six-months.csv`) with the columns `ID, URL, Title, Difficulty, Acceptance %, Frequency %` |
| Stated snapshot | "This repository contains the snapshot as of **12th July 2026**." (README) |
| Problem provider | LeetCode (every URL is `https://leetcode.com/problems/…`) |

## What was checked

| Check | Result |
| --- | --- |
| `LICENSE`, `LICENSE.md`, `LICENSE.txt`, `COPYING`, `NOTICE`, `LICENSE-DATA` | None exist (HTTP 404) |
| GitHub's detected license (`/repos/…` API, `license` field) | `null` |
| README or "About" license statement | None |
| README statements on commercial use, redistribution or attribution | None |
| Provenance | The README does not say where the company lists come from. It links a scraper for contributing data that needs a LeetCode Premium username and password. |

## Conclusions

1. **No license means no permission.** Being publicly visible on GitHub does not grant the right
   to redistribute the data or use it commercially.
2. **Provenance concern.** The lists may come from LeetCode Premium's paid company tags, which
   carry LeetCode's own terms. PracStack does not scrape LeetCode and must not redistribute
   Premium content without authorization.
3. **What PracStack stores is limited to facts and links**: problem number, title, difficulty,
   URL, and the source's two percentage columns, always with attribution and a link to the
   source. No problem statements, examples, test cases, editorials or solutions are copied.
4. **Demonstration sample only.** `content/src/companies/demo/` holds Liberty Mutual's complete
   list (one row) and the first few complete rows of four other companies, exactly as they
   appear in the source. The UI labels them as samples ("4 of the 18 questions the source
   lists").
5. **Bulk import is blocked in code.** `content/src/companies/sources.ts` records the source as
   `license.status: 'unverified'` with `bulkImportAllowed: false`, and
   `content/scripts/import-companies.ts` refuses such sources.

## To import the full dataset later

1. Obtain written permission from the repository owner for commercial reuse and
   redistribution, or use a dataset with an explicit license that allows it.
2. Get legal advice on the provider-side question (LeetCode's terms for problem titles, links
   and company tags).
3. Record the outcome in `sources.ts` (`license.status: 'licensed'`, a note that cites the
   permission, `bulkImportAllowed: true`), then run the importer (see
   [company-interview-prep.md](company-interview-prep.md#import-pipeline)).
