import { Injectable, signal } from '@angular/core';
import type { LanguageId } from '@pracstack/content-model';
import { readJson, removeKey, writeJson } from '../../../core/browser/browser-storage';
import type { RunOutcome } from '../runner/runner.models';

/** Where a learner stands on a challenge, as known to *this browser*. */
export type LocalChallengeStatus = 'not-started' | 'in-progress' | 'visible-passed';

export interface LastRun {
  readonly status: RunOutcome['status'];
  /** Passed / total visible tests; 0/total for compile, load and timeout errors. */
  readonly passed: number;
  readonly total: number;
  /** ISO timestamp. */
  readonly at: string;
}

export interface LocalChallengeRecord {
  readonly challengeId: string;
  readonly status: LocalChallengeStatus;
  readonly hasDraft: boolean;
  readonly lastRun: LastRun | undefined;
  /** ISO timestamp of the latest draft save or run, if any. */
  readonly lastActivityAt: string | undefined;
}

interface StoredDraft {
  readonly code: string;
  readonly updatedAt: string;
}

const isStoredDraft = (v: unknown): v is StoredDraft =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as StoredDraft).code === 'string' &&
  typeof (v as StoredDraft).updatedAt === 'string';

const isLastRun = (v: unknown): v is LastRun =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as LastRun).status === 'string' &&
  typeof (v as LastRun).passed === 'number' &&
  typeof (v as LastRun).total === 'number' &&
  typeof (v as LastRun).at === 'string';

const draftKey = (id: string, lang: LanguageId): string => `challenge:${id}:${lang}:draft`;
const lastRunKey = (id: string, lang: LanguageId): string => `challenge:${id}:${lang}:last-run`;
/** Drafts saved before the PracStack rename (TypeScript only, raw string). */
const legacyDraftKey = (id: string): string => `typexercise:solution:${id}`;

const LANGUAGES: readonly LanguageId[] = ['typescript'];

/**
 * Drafts and last visible-test results, stored in localStorage.
 *
 * This is deliberately local and unauthenticated: it records what happened in
 * this browser and is never treated as official progress. Server-side
 * submissions and completion tracking arrive with accounts.
 */
@Injectable({ providedIn: 'root' })
export class ChallengeProgressService {
  /** Bumped on every write so callers of `record()` inside computeds re-read storage. */
  private readonly revision = signal(0);

  /** Reactive: re-evaluates in a `computed()` after any progress write. */
  record(challengeId: string): LocalChallengeRecord {
    this.revision();
    let hasDraft = false;
    let lastRun: LastRun | undefined;
    let lastActivityAt: string | undefined;

    for (const lang of LANGUAGES) {
      const draft = readJson(draftKey(challengeId, lang), isStoredDraft);
      const run = readJson(lastRunKey(challengeId, lang), isLastRun);
      hasDraft ||= draft !== undefined || this.hasLegacyDraft(challengeId);
      if (run && (!lastRun || run.at > lastRun.at)) lastRun = run;
      for (const at of [draft?.updatedAt, run?.at]) {
        if (at && (!lastActivityAt || at > lastActivityAt)) lastActivityAt = at;
      }
    }

    const status: LocalChallengeStatus =
      lastRun?.status === 'passed'
        ? 'visible-passed'
        : hasDraft || lastRun
          ? 'in-progress'
          : 'not-started';
    return { challengeId, status, hasDraft, lastRun, lastActivityAt };
  }

  loadDraft(challengeId: string, lang: LanguageId): string | null {
    const draft = readJson(draftKey(challengeId, lang), isStoredDraft);
    if (draft) return draft.code;
    return lang === 'typescript' ? this.migrateLegacyDraft(challengeId) : null;
  }

  /** Saves a draft. Unmodified starter code is not stored, so starter updates still reach learners. */
  saveDraft(challengeId: string, lang: LanguageId, code: string, starterCode: string): void {
    const exists = readJson(draftKey(challengeId, lang), isStoredDraft) !== undefined;
    if (code === starterCode) {
      if (!exists) return;
      removeKey(draftKey(challengeId, lang));
    } else {
      writeJson(draftKey(challengeId, lang), {
        code,
        updatedAt: new Date().toISOString(),
      } satisfies StoredDraft);
    }
    // Only notify on add/remove; status does not change while typing in an existing draft.
    if (exists !== (code !== starterCode)) this.revision.update((n) => n + 1);
  }

  recordRun(challengeId: string, lang: LanguageId, outcome: RunOutcome, testCount: number): void {
    const passed =
      outcome.status === 'passed' || outcome.status === 'failed'
        ? outcome.results.filter((r) => r.passed).length
        : 0;
    writeJson(lastRunKey(challengeId, lang), {
      status: outcome.status,
      passed,
      total: testCount,
      at: new Date().toISOString(),
    } satisfies LastRun);
    this.revision.update((n) => n + 1);
  }

  private hasLegacyDraft(challengeId: string): boolean {
    try {
      return localStorage.getItem(legacyDraftKey(challengeId)) !== null;
    } catch {
      return false;
    }
  }

  private migrateLegacyDraft(challengeId: string): string | null {
    try {
      const code = localStorage.getItem(legacyDraftKey(challengeId));
      if (code === null) return null;
      writeJson(draftKey(challengeId, 'typescript'), {
        code,
        updatedAt: new Date().toISOString(),
      } satisfies StoredDraft);
      localStorage.removeItem(legacyDraftKey(challengeId));
      return code;
    } catch {
      return null;
    }
  }
}
