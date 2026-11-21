# Skill Mastery scoring

PracStack's own algorithm (not IXL's), implemented in `packages/scoring`. It is pure and
deterministic: `applyAttempt(state, attempt, config)` always gives the same result, so every
score can be recomputed and explained. **Scores are only ever computed on the server**; the
browser displays them.

## Goals

1. A score from 0 to 100, where 100 means *demonstrated* mastery, not just many attempts.
2. Questions get harder as the score rises.
3. Mistakes cost something, but one slip never wipes out real progress.
4. Hints help without being free.
5. Everything tunable through one versioned config (`DEFAULT_SCORING_CONFIG`, version 1).
6. XP rewards effort and is completely separate from mastery.

## Bands

The current score selects a band. The band sets which question difficulty is offered and the
base points for answers at that difficulty.

| Score  | Offered difficulty | Gain (correct) | Loss (incorrect) |
| ------ | ------------------ | -------------- | ---------------- |
| 0–24   | 1                  | 9              | 1                |
| 25–49  | 2                  | 8              | 2                |
| 50–69  | 3                  | 7              | 3                |
| 70–89  | 4                  | 5              | 4                |
| 90–99  | 5 (mastery zone)   | 3              | 5                |

Losses grow as the score rises: early on, mistakes are part of learning; near mastery,
consistency is what is being measured.

## Correct answers

`gain = round(base × difficulty × hints) + streak bonus`, between 1 and 15.

- **Difficulty:** ×(1 + 0.25) per level *above* the band's target, ×(1 − 0.35) per level
  *below* (minimum ×0.25). Harder questions are worth more; easy ones still count a little.
- **Hints:** ×1 with no hints, ×0.6 with one, ×0.3 with two or more.
- **Streak bonus:** +1 on the 3rd correct answer in a row, +2 on the 4th, +3 from the 5th on
  (hint-free answers only).
- A correct answer always gains at least 1 point.

## Incorrect answers

`loss = round(base × difficulty × slip)`, at most 8.

- **Harder questions cost less:** ×(1 − 0.25) per level above the target (minimum ×0.25).
- **Slip forgiveness:** a miss right after 3+ correct in a row costs half.
- **Checkpoints:** once the score reaches **50** or **80**, it never falls below that again.
- The score never goes below 0.

## Partial credit

Graders can return `partial` (e.g. right rows in the wrong order when order didn't matter).
It earns half the gain and **never loses points**; the correct streak is kept.

## Reaching 100

In the mastery zone (90+), the score is capped at 99 until the learner answers **3 questions in
a row correctly, without hints, at difficulty 4 or 5**. Answers that brought the score into the
zone don't count; the streak must happen *in* the zone. Then the score becomes 100 and the
skill is marked **mastered**.

Mastery is permanent as an achievement. The score can still drop after mistakes, but never
below 90, and the learner can return to 100 without repeating the streak.

## What this looks like

Simulated by always answering the offered difficulty, without hints (from
`packages/scoring/src/engine.spec.ts`):

| Learner                | Answers to 100 | Score after each answer |
| ---------------------- | -------------- | ----------------------- |
| Always right           | 13             | 9 18 28 38 49 60 70 78 86 94 99 99 100 |
| Wrong every 5th answer | 18             | 9 18 28 38 37 45 53 61 70 68 75 80 86 93 90 93 96 100 |
| Wrong every 3rd answer | never          | climbs into the 90s (94–99) and stays there |

The last row is intentional: someone who misses a third of the questions is close to mastery,
and the score says so, but they have not shown the consistency that 100 means.

## XP

XP never decreases and does not affect mastery. Per answer:
`correct: 10 × difficulty`, `partial: 5 × difficulty` (both reduced by the hint multiplier),
`incorrect: 1 × difficulty`, minimum 1. Mastered skills still earn XP for practice.

## Changing the numbers

Edit or copy `DEFAULT_SCORING_CONFIG`, bump `version`, and run `npm test`. The test suite checks
the config is valid (`validateScoringConfig`) and replays 2,000 random 60-answer sessions,
asserting the invariants: scores stay in 0–100, are integers, never drop below a checkpoint,
reach 100 only through mastery, correct and partial answers never lower the score, incorrect
answers never raise it, mastery is never lost, and results are deterministic. Each learner's
state records the `configVersion` that produced it.
