# Skill Mastery audit (before the overhaul)

Audited on the code as of `044c88b` (main). Answers to the ten questions in the brief.

## 1. What does "Level X of 5" represent?

The **authored difficulty of the current question** (1–5), not the learner's level, and not
their progress. `practice-page.html` renders `Level {{ question.difficulty }} of 5`. Nothing on
the page explains this, so it reads like "your level".

## 2. Why does it change between questions?

Two mechanisms push the difficulty around:

- **The target difficulty follows the mastery score band** (`packages/scoring/src/config.ts`):
  0–24 → 1, 25–49 → 2, 50–69 → 3, 70–89 → 4, 90–99 → 5. Early answers are worth about 9 points
  each, so the target changes every 2–3 answers, in either direction.
- **The selector trades difficulty for novelty** (`services/api/src/practice/select-question.ts`).
  Each candidate costs 10 per level away from the target, +100 if it was among the last 3
  questions answered and +20 if among the last 6. Every skill has only 5 or 6 questions, about one
  per difficulty. Once the questions near the target are recent, a question 2–3 levels away costs
  less than repeating one. So a learner at target 2 can get a level 4 question, then a level 1.

## 3. Random, deterministic or mastery-dependent?

Mostly deterministic, but driven by mastery **and** recency in a way that looks random. The
final tie-break is `Math.random()` (`random: Math.random` in the local server), so identical
states can produce different questions.

## 4. How are questions selected?

Lowest cost wins (see 2). The history used is only the **last 6 attempts** of the skill.

## 5. How many question families and variants exist?

70 questions, each written once, with no families or variants:

| Track | Skills | Questions | Per skill |
| --- | --- | --- | --- |
| TypeScript | 4 | 20 | 5 (one per difficulty) |
| PostgreSQL | 4 | 20 | 5 (one per difficulty) |
| Oracle SQL | 5 | 30 | 6 |

## 6. How quickly can a learner see repeats?

With 5 questions and a 6-answer recency window, every question is "recent" after 5 answers. From
the 6th answer on, the learner gets a question they answered 4–6 answers earlier.

## 7. Is the mastery algorithm consistent?

The scoring function itself is pure and well tested. The problems are in the inputs: the
difficulty a learner faces depends on recency more than on performance, and mastery depends on
repeating the same few questions.

## 8. Can learners reach 100 with the available questions?

Only by repetition. Reaching 100 needs 3 consecutive hint-free correct answers at difficulty ≥ 4
with a score of 90+. Each skill has 1–2 questions at difficulty ≥ 4, so the streak can only be
completed by answering **the same question again**, from memory. That makes mastery farmable.

## 9. Does restarting a practice session cause repetition?

No more than continuing does: attempts and the open question are stored on the server, and an
unanswered question is resumed. But the 6-attempt window is the only memory, so repeats come
from the pool size (6), not from restarts.

## 10. Are answer keys and explanations validated?

- **SQL** (PostgreSQL and Oracle): yes. Every reference query runs on the sample data and every
  hidden dataset, in PGlite or Oracle Database Free, at content build or test time.
- **TypeScript**: predict-output snippets are compiled (strict) and run, and the output is
  compared. Fill-in-blank templates are compiled with each accepted answer.
- **Multiple-choice questions** (all tracks): **not validated**; the keys are written by hand.
  Explanations are not machine-checked anywhere.

## Layout problems (screenshots)

- **SQL page:** the schema `<pre>` and every sample table render fully expanded above the editor.
  With the 10-row company database, the editor starts well below the fold.
- **Sidebar:** 232 px (`--nav-width`), with tight item spacing.

## What the overhaul changes (see `docs/scoring.md` and `docs/content.md`)

- **Difficulty becomes a tier with its own explainable state** (promotion and demotion rules),
  separate from the mastery score. Mastery is capped per tier, so easy questions cannot farm it.
- **Selection is deterministic (seeded) and uses the full history**: it prefers unseen variants
  and unseen families, schedules review of missed questions, and says when a tier's pool is used up.
- **Question families with generated variants**, validated at build time.
