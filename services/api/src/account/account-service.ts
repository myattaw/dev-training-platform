import type {
  AccountProgressResponse,
  DraftImportConflict,
  DraftResponse,
  MeResponse,
  ProgressImportRequest,
  ProgressImportResponse,
  UserInfo,
} from '@pracstack/api-contracts';
import type { LanguageId } from '@pracstack/content-model';
import type { Caller } from '../auth';
import type { ContentSource } from '../content/content-source';
import { notFound } from '../http';
import type { AccountStore } from '../store/account-store';
import type { ProgressStore } from '../store/progress-store';

export interface AccountServiceDeps {
  readonly content: ContentSource;
  readonly store: ProgressStore;
  readonly accounts: AccountStore;
  readonly now: () => Date;
}

/** Profile, the cross-app progress overview, and importing browser-only progress. */
export class AccountService {
  constructor(private readonly deps: AccountServiceDeps) {}

  /** The public view of the caller: never includes provider, subject or groups. */
  async user(caller: Caller): Promise<UserInfo> {
    const profile = await this.deps.accounts.getProfile(caller.id);
    return {
      id: caller.id,
      displayName: profile?.displayName ?? caller.displayName,
      mode: caller.mode,
    };
  }

  async me(caller: Caller): Promise<MeResponse> {
    const [user, xp] = await Promise.all([this.user(caller), this.deps.store.getXp(caller.id)]);
    return { user, xp };
  }

  async updateProfile(caller: Caller, displayName: string): Promise<MeResponse> {
    await this.deps.accounts.putProfile({
      userId: caller.id,
      displayName,
      updatedAt: this.deps.now().toISOString(),
    });
    return this.me(caller);
  }

  async progress(caller: Caller): Promise<AccountProgressResponse> {
    const { store, accounts } = this.deps;
    const [xp, mastery, challenges, drafts, saved, sessions] = await Promise.all([
      store.getXp(caller.id),
      store.listMastery(caller.id),
      store.listChallengeProgress(caller.id),
      accounts.listDrafts(caller.id),
      accounts.listSavedCompanies(caller.id),
      accounts.listInterviewSessions(caller.id, 1000),
    ]);
    return {
      xp,
      skills: {
        practiced: mastery.length,
        mastered: mastery.filter((m) => m.state.mastered).length,
      },
      challenges: challenges.map(({ userId, ...rest }) => (void userId, rest)),
      drafts: drafts.map((d) => ({
        challengeId: d.challengeId,
        language: d.language,
        updatedAt: d.updatedAt,
        length: d.code.length,
      })),
      savedCompanies: saved.map((s) => s.companyId),
      interviewSessions: {
        completed: sessions.filter((s) => s.status === 'completed').length,
        total: sessions.length,
      },
    };
  }

  /**
   * Imports drafts from a browser. Idempotent per import id; never overwrites
   * a different account draft unless the learner chose to (`overwrite`).
   */
  async importProgress(
    caller: Caller,
    request: ProgressImportRequest,
  ): Promise<ProgressImportResponse> {
    const { accounts, content } = this.deps;
    const previous = await accounts.getImport(caller.id, request.importId);
    if (previous) return { ...previous.response, replayed: true };

    const overwrite = new Set(request.overwrite ?? []);
    const conflicts: DraftImportConflict[] = [];
    let imported = 0;
    let unchanged = 0;
    for (const draft of request.drafts) {
      const conflict = (reason: string) =>
        conflicts.push({ challengeId: draft.challengeId, language: draft.language, reason });
      const challenge = content.findChallenge(draft.challengeId)?.challenge;
      if (!challenge || !challenge.languages[draft.language]) {
        conflict('This challenge or language no longer exists.');
        continue;
      }
      const existing = await accounts.getDraft(caller.id, draft.challengeId, draft.language);
      if (existing?.code === draft.code) {
        unchanged++;
        continue;
      }
      if (existing && !overwrite.has(`${draft.challengeId}:${draft.language}`)) {
        conflict(
          existing.updatedAt > draft.updatedAt
            ? 'Your account has a newer, different draft.'
            : 'Your account has a different draft.',
        );
        continue;
      }
      await accounts.putDraft({
        userId: caller.id,
        challengeId: draft.challengeId,
        language: draft.language,
        code: draft.code,
        updatedAt: draft.updatedAt,
      });
      imported++;
    }

    const response: ProgressImportResponse = {
      importId: request.importId,
      imported,
      unchanged,
      conflicts,
      replayed: false,
    };
    const stored = await accounts.putImportIfAbsent({
      userId: caller.id,
      importId: request.importId,
      response,
      importedAt: this.deps.now().toISOString(),
    });
    return stored.response === response ? response : { ...stored.response, replayed: true };
  }

  async draft(caller: Caller, challengeId: string, language: LanguageId): Promise<DraftResponse> {
    const draft = await this.deps.accounts.getDraft(caller.id, challengeId, language);
    if (!draft) throw notFound('No saved draft for this challenge and language.');
    return { challengeId, language, code: draft.code, updatedAt: draft.updatedAt };
  }
}
