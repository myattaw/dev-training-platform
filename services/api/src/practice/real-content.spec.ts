import type { AnswerPayload } from '@pracstack/api-contracts';
import { buildContent } from '@pracstack/content';
import type { QuestionAnswer, SplitQuestion } from '@pracstack/content-model';
import { describe, expect, it } from 'vitest';
import { gradeAnswer } from './grading';

/** The answer a learner would give if they knew the key. */
function answerFromKey(key: QuestionAnswer): AnswerPayload {
  switch (key.format) {
    case 'multiple-choice':
      return { format: key.format, selected: key.correct };
    case 'predict-output':
      return { format: key.format, output: key.output };
    case 'fill-in-blank':
      return {
        format: key.format,
        blanks: Object.fromEntries(
          Object.entries(key.blanks).map(([id, b]) => [id, b.accepted[0] ?? '']),
        ),
      };
  }
}

const questions = [...buildContent().privateFiles]
  .filter(([path]) => path.endsWith('.questions.json'))
  .flatMap(([, value]) => value as SplitQuestion[]);

describe('grading the real question bank', () => {
  it('has questions to check', () => {
    expect(questions.length).toBeGreaterThanOrEqual(20);
  });

  it.each(questions.map((q) => [q.question.id, q] as const))(
    '%s: its own answer key grades as correct',
    (_, q) => {
      const grade = gradeAnswer(q.question, q.grading.answer, answerFromKey(q.grading.answer));
      expect(grade.result).toBe('correct');
    },
  );
});
