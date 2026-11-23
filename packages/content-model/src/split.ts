import {
  type Challenge,
  type ChallengeGrading,
  type ChallengeSource,
  type ChallengeSummary,
  DEFAULT_LIMITS,
  supportedLanguages,
} from './challenge';
import type {
  PublicQuestion,
  QuestionAnswer,
  QuestionGrading,
  QuestionSource,
  Skill,
  Topic,
  TrackCatalog,
  TrackSource,
} from './skill';

/*
 * Public/private separation.
 *
 * Every public object is rebuilt field by field (a whitelist) instead of
 * deleting private fields (a blacklist). A field added to an authoring type
 * later stays private until someone deliberately adds it here.
 */

export interface SplitChallenge {
  readonly summary: ChallengeSummary;
  readonly challenge: Challenge;
  readonly grading: ChallengeGrading;
}

export function splitChallenge(source: ChallengeSource): SplitChallenge {
  const c = source.challenge;
  const challenge: Challenge = {
    id: c.id,
    version: c.version,
    title: c.title,
    summary: c.summary,
    category: c.category,
    difficulty: c.difficulty,
    tags: [...c.tags],
    instructions: c.instructions,
    languages: c.languages,
    visibleTests: c.visibleTests,
  };
  const summary: ChallengeSummary = {
    id: c.id,
    version: c.version,
    title: c.title,
    summary: c.summary,
    category: c.category,
    difficulty: c.difficulty,
    tags: [...c.tags],
    languages: supportedLanguages(c),
    visibleTestCount: c.visibleTests.length,
  };
  const grading: ChallengeGrading = {
    challengeId: c.id,
    version: c.version,
    hiddenTests: source.hiddenTests,
    limits: { ...DEFAULT_LIMITS, ...source.limits },
  };
  return { summary, challenge, grading };
}

export interface SplitQuestion {
  readonly question: PublicQuestion;
  readonly grading: QuestionGrading;
}

export interface SplitTrack {
  readonly catalog: TrackCatalog;
  /** Keyed by skill id. Private: the API serves these one at a time. */
  readonly questionsBySkill: Readonly<Record<string, readonly SplitQuestion[]>>;
}

export function splitTrack(track: TrackSource): SplitTrack {
  const topics: Topic[] = [];
  const skills: (Skill & { questionCount: number })[] = [];
  const questionsBySkill: Record<string, SplitQuestion[]> = {};

  for (const topic of track.topics) {
    topics.push({
      id: topic.id,
      technologyId: track.id,
      name: topic.name,
      description: topic.description,
    });
    for (const skill of topic.skills) {
      skills.push({
        id: skill.id,
        topicId: topic.id,
        name: skill.name,
        description: skill.description,
        ...(skill.prerequisites?.length ? { prerequisites: [...skill.prerequisites] } : {}),
        questionCount: skill.questions.length,
      });
      questionsBySkill[skill.id] = skill.questions.map((q) => splitQuestion(q, skill.id));
    }
  }

  return {
    catalog: {
      technology: {
        id: track.id,
        name: track.name,
        description: track.description,
        category: track.category,
      },
      topics,
      skills,
    },
    questionsBySkill,
  };
}

export function splitQuestion(source: QuestionSource, skillId: string): SplitQuestion {
  const base = {
    id: source.id,
    version: source.version,
    skillId,
    familyId: source.family ?? source.id,
    difficulty: source.difficulty,
    prompt: source.prompt,
    hintCount: source.hints.length,
  };

  let question: PublicQuestion;
  let answer: QuestionAnswer;
  switch (source.format) {
    case 'multiple-choice':
      question = {
        ...base,
        format: source.format,
        ...(source.code ? { code: source.code } : {}),
        options: source.options.map((o) => ({ id: o.id, text: o.text })),
        selection: source.selection,
      };
      answer = { format: source.format, correct: [...source.answer.correct] };
      break;
    case 'predict-output':
      question = { ...base, format: source.format, code: source.code };
      answer = { format: source.format, output: source.answer.output };
      break;
    case 'fill-in-blank':
      question = { ...base, format: source.format, template: source.template };
      answer = { format: source.format, blanks: source.answer.blanks };
      break;
    case 'sql-query':
      question = {
        ...base,
        format: source.format,
        dialect: source.dialect,
        schema: source.database.schema,
        sampleTables: source.database.sample,
        ordered: source.ordered,
      };
      answer = {
        format: source.format,
        referenceQuery: source.answer.referenceQuery,
        checkColumnNames: source.answer.checkColumnNames ?? false,
        hiddenData: source.database.hidden,
      };
      break;
  }

  return {
    question,
    grading: {
      questionId: source.id,
      version: source.version,
      answer,
      hints: source.hints,
      explanation: source.explanation,
    },
  };
}
