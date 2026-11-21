import type { AnswerPayload, AnswerResult, RevealedAnswer } from '@pracstack/api-contracts';
import {
  blankIds,
  normalizeBlank,
  normalizeOutput,
  type PublicQuestion,
  type QuestionAnswer,
} from '@pracstack/content-model';
import { badRequest } from '../http';

export interface Grade {
  readonly result: AnswerResult;
  /** Explains a partial result. */
  readonly note?: string;
  readonly revealed: RevealedAnswer;
}

/**
 * Grades an answer against the private answer key. Pure.
 *
 * Partial credit exists so minor slips are not punished like wrong answers:
 * right output with different spacing, some (but not all) blanks right, or
 * only correct options chosen in a multiple-selection question.
 */
export function gradeAnswer(
  question: PublicQuestion,
  key: QuestionAnswer,
  answer: AnswerPayload,
): Grade {
  if (answer.format !== question.format || key.format !== question.format) {
    throw badRequest(`This question expects a ${question.format} answer.`);
  }

  switch (key.format) {
    case 'multiple-choice': {
      if (question.format !== 'multiple-choice' || answer.format !== 'multiple-choice') break;
      const optionIds = new Set(question.options.map((o) => o.id));
      if (answer.selected.some((id) => !optionIds.has(id)))
        throw badRequest('Unknown option selected.');
      if (answer.selected.length === 0) throw badRequest('Select at least one option.');
      if (question.selection === 'single' && answer.selected.length > 1) {
        throw badRequest('Select exactly one option.');
      }
      const correct = new Set(key.correct);
      const chosen = new Set(answer.selected);
      const revealed: RevealedAnswer = { format: 'multiple-choice', correct: [...key.correct] };
      const allRight = chosen.size === correct.size && [...chosen].every((id) => correct.has(id));
      if (allRight) return { result: 'correct', revealed };
      const onlyCorrectChosen = [...chosen].every((id) => correct.has(id));
      if (question.selection === 'multiple' && onlyCorrectChosen) {
        return {
          result: 'partial',
          note: `You chose ${chosen.size} of the ${correct.size} correct options and no wrong ones.`,
          revealed,
        };
      }
      return { result: 'incorrect', revealed };
    }

    case 'predict-output': {
      if (answer.format !== 'predict-output') break;
      const revealed: RevealedAnswer = { format: 'predict-output', output: key.output };
      if (normalizeOutput(answer.output) === normalizeOutput(key.output)) {
        return { result: 'correct', revealed };
      }
      const squash = (s: string): string => s.trim().replace(/\s+/g, ' ');
      if (answer.output.trim() !== '' && squash(answer.output) === squash(key.output)) {
        return {
          result: 'partial',
          note: 'Right output, but the spacing or line breaks differ.',
          revealed,
        };
      }
      return { result: 'incorrect', revealed };
    }

    case 'fill-in-blank': {
      if (question.format !== 'fill-in-blank' || answer.format !== 'fill-in-blank') break;
      const ids = blankIds(question.template.source);
      for (const id of Object.keys(answer.blanks)) {
        if (!ids.includes(id)) throw badRequest(`Unknown blank "${id}".`);
      }
      const revealedBlanks: Record<string, string> = {};
      const blankResults: Record<string, boolean> = {};
      let right = 0;
      for (const id of ids) {
        const spec = key.blanks[id];
        if (!spec) continue;
        revealedBlanks[id] = spec.accepted[0] ?? '';
        const given = normalizeBlank(answer.blanks[id] ?? '', spec.caseSensitive ?? true);
        const ok = spec.accepted.some(
          (a) => normalizeBlank(a, spec.caseSensitive ?? true) === given,
        );
        blankResults[id] = ok;
        if (ok) right++;
      }
      const revealed: RevealedAnswer = {
        format: 'fill-in-blank',
        blanks: revealedBlanks,
        blankResults,
      };
      if (right === ids.length) return { result: 'correct', revealed };
      if (right > 0) {
        return {
          result: 'partial',
          note: `${right} of ${ids.length} blanks are correct.`,
          revealed,
        };
      }
      return { result: 'incorrect', revealed };
    }
  }
  throw badRequest(`This question expects a ${question.format} answer.`);
}
