# Skill Mastery scoring

PracStack's own algorithm, implemented in `packages/scoring`. It is pure and deterministic:
`applyAttempt(state, attempt, config)` always gives the same result, so every score can be
recomputed and explained. **Scores are only ever computed on the server**; the browser displays
them. This is version 2 of the rules (`DEFAULT_SCORING_CONFIG.version`); see
[the audit](skill-mastery-audit.md) for why version 1 was replaced.

## Goals

1. Three separate numbers, never mixed up:
   - **Difficulty tier**: how hard the next questions are (1 Beginner, 2 Elementary,
     3 Intermediate, 4 Advanced, 5 Expert);
   - **Mastery**: 0–100, how much the learner has *demonstrated*;
   - **Session progress**: answered, correct, streak and XP in the current sitting (browser only).
2. Difficulty changes gradually and predictably: one tier at a time, for a visible reason.
3. Mastery can't be farmed: easy questions only take you so far, and repeats earn little.
4. Mistakes cost something, but one slip never wipes out real progress.
5. Hints help without being free.
6. Everything tunable through one versioned config; XP is completely separate from mastery.

## Difficulty tiers

Every learner starts a skill at tier 1. The tier only moves after a run of answers:

| Event | Effect |
| --- | --- |
| 2 correct answers in a row, first time seen, no hints, at or above the current tier | up one tier |
| 2 incorrect answers in a row at or below the current tier | down one tier |

Both counters reset whenever the tier moves, so changes are never more than one tier at a time
and never happen on a single answer. Partial answers, hinted answers and repeats don't count
toward promotion; a miss on a question *above* the tier doesn't count toward demotion. The answer
response reports `tierBefore` and `tierAfter`, and the practice page says "Up to Intermediate".

## Mastery gains and caps

A correct, hint-free answer earns the gain of the **question's** difficulty, but can't take the
score past that difficulty's cap:

| Difficulty | Gain | Score cap |
| --- | --- | --- |
| 1 Beginner | 6 | 30 |
| 2 Elementary | 7 | 50 |
| 3 Intermediate | 8 | 70 |
| 4 Advanced | 9 | 90 |
| 5 Expert | 10 | 99 |

Above a cap, that difficulty earns nothing more (`cappedByTier` in the response; the page says
"Beginner questions can't raise your mastery further"). Gains are then adjusted:

- **Hints**: × 1 with none, × 0.6 with one, × 0.3 with two or more.
- **Repeats** (a question this learner has already answered correctly): × 0.5, and repeats never
  count toward promotion or mastery.
- **Partial** answers: × 0.5. They never lose points.
- **Streak bonus**: +1 per correct answer in a row from the 3rd, at most +3.
- Never more than 15 per answer.

## Incorrect answers

The loss grows with the score: 2 below 50, 3 from 50, 4 from 80; halved for a miss on a question
above the learner's tier, and halved again for the first miss after a streak of 3 or more (a
slip). Never more than 6 per answer.

**Checkpoints** at 50 and 80: once reached, the score never falls below them.

## Reaching 100

99 is the most the gains above can reach. 100 needs **3 correct answers in a row, first time
seen, hint-free, at difficulty 4 or 5, while the score is 90 or more**. After that the skill is
mastered for good: the score never drops below 90 and the skill stays "Mastered".

## What this looks like

A learner who answers every question correctly, first time, without hints, sees:

| Answer | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Question tier | 1 | 1 | 2 | 2 | 3 | 3 | 4 | 4 | 5 | 5 | 5 | 5 | 5 |
| Mastery after | 6 | 12 | 20 | 29 | 40 | 51 | 63 | 75 | 88 | 99 | 99 | 99 | 100 |

That is the minimum: 13 answers. Mistakes, hints and repeats make it longer, as they should. The
test suite asserts this exact path.

## Choosing the next question

`services/api/src/practice/select-question.ts` picks from the skill's questions using the
learner's whole answer history. It is deterministic: the seed is
`learnerId|skillId|answers so far`, hashed (FNV-1a), and only breaks ties.

1. Prefer questions at the learner's tier; if none qualify, the nearest tier (easier first), with
   a note saying so.
2. Within that, prefer in order:
   1. a question from a **family** not seen yet (families group variants of one exercise);
   2. an unseen variant of a family not seen in the last few answers;
   3. a question answered **wrongly** at least 3 answers ago (**review**, labeled as such);
   4. any other unseen question.
3. Only when every question has been answered: **repeat** the least recently seen one, never one
   of the last two while another exists, labeled "Repeat" with a note that it earns reduced
   credit.

Reloading the page returns the same unanswered question (no rerolls).

## XP

XP never decreases and does not affect mastery. Per answer:
`correct: 10 × difficulty`, `partial: 5 × difficulty` (both reduced by the hint and repeat
multipliers), `incorrect: 1 × difficulty`, minimum 1. Mastered skills still earn XP for practice.

## Existing learners

Each learner's state records the `configVersion` that produced it. `migrateState` upgrades a
version 1 state on read: the score, attempts, streaks, checkpoint and mastery are kept as they
were; the tier is derived from the old score band (0–24 → 1, 25–49 → 2, 50–69 → 3, 70–89 → 4,
90+ → 5). No progress is lost and nothing has to be rewritten in the store.

## Changing the numbers

Edit or copy `DEFAULT_SCORING_CONFIG`, bump `version`, and run `npm test`. The test suite checks
the config is valid (`validateScoringConfig`, which also checks that 100 is reachable) and replays
2,000 random sessions, asserting the invariants: scores stay in 0–100, are integers, never drop
below a checkpoint, reach 100 only through mastery, correct and partial answers never lower the
score, incorrect answers never raise it, the tier moves at most one step per answer, mastery is
never lost, and results are deterministic.
