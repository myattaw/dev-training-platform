import type { ActivityRef, LanguageId } from '@pracstack/content-model';

/** Short helpers for writing activity references in role and taxonomy content. */
export const skill = (skillId: string): ActivityRef => ({ kind: 'skill', skillId });

export const challenge = (challengeId: string, language?: LanguageId): ActivityRef =>
  language ? { kind: 'challenge', challengeId, language } : { kind: 'challenge', challengeId };

export const skills = (...ids: string[]): ActivityRef[] => ids.map(skill);

export const scenario = (scenarioId: string): ActivityRef => ({ kind: 'scenario', scenarioId });
