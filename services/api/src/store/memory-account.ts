import type { LanguageId } from '@pracstack/content-model';
import type {
  AccountStore,
  CreateSessionOutcome,
  DraftRecord,
  EntitlementRecord,
  IdentityRecord,
  ImportRecord,
  InterviewSessionRecord,
  LinkIntentRecord,
  ProfileRecord,
  QuestionMarkRecord,
  SavedCompanyRecord,
} from './account-store';

/** Account data held by the in-memory (and file) store. */
export interface AccountData {
  profiles: Record<string, ProfileRecord>;
  entitlements: Record<string, EntitlementRecord>;
  identities: Record<string, IdentityRecord>;
  linkIntents: Record<string, LinkIntentRecord>;
  savedCompanies: Record<string, SavedCompanyRecord>;
  questionMarks: Record<string, QuestionMarkRecord>;
  interviewSessions: Record<string, InterviewSessionRecord>;
  drafts: Record<string, DraftRecord>;
  imports: Record<string, ImportRecord>;
}

export const emptyAccountData = (): AccountData => ({
  profiles: {},
  entitlements: {},
  identities: {},
  linkIntents: {},
  savedCompanies: {},
  questionMarks: {},
  interviewSessions: {},
  drafts: {},
  imports: {},
});

const key = (...parts: string[]): string => parts.join('#');

/**
 * In-memory implementation of {@link AccountStore}. Every method runs in one
 * JavaScript turn, so check-then-write sequences are atomic.
 */
export class InMemoryAccountStore implements AccountStore {
  constructor(
    private readonly account: () => AccountData,
    private readonly persist: () => Promise<void>,
    /** Other progress (XP, mastery, submissions) for `hasUserData`. */
    private readonly hasProgress: (userId: string) => boolean,
  ) {}

  private get data(): AccountData {
    return this.account();
  }

  getProfile(userId: string): Promise<ProfileRecord | undefined> {
    return Promise.resolve(this.data.profiles[userId]);
  }

  putProfile(profile: ProfileRecord): Promise<void> {
    this.data.profiles[profile.userId] = profile;
    return this.persist();
  }

  getEntitlement(userId: string): Promise<EntitlementRecord | undefined> {
    return Promise.resolve(this.data.entitlements[userId]);
  }

  putEntitlement(entitlement: EntitlementRecord): Promise<void> {
    this.data.entitlements[entitlement.userId] = entitlement;
    return this.persist();
  }

  getIdentity(provider: string, subject: string): Promise<IdentityRecord | undefined> {
    return Promise.resolve(this.data.identities[key(provider, subject)]);
  }

  async putIdentityIfAbsent(identity: IdentityRecord): Promise<IdentityRecord> {
    const k = key(identity.provider, identity.subject);
    const existing = this.data.identities[k];
    if (existing) return existing;
    this.data.identities[k] = identity;
    await this.persist();
    return identity;
  }

  async replaceIdentity(identity: IdentityRecord, previousUserId: string): Promise<boolean> {
    const k = key(identity.provider, identity.subject);
    if (this.data.identities[k]?.userId !== previousUserId) return false;
    this.data.identities[k] = identity;
    await this.persist();
    return true;
  }

  listIdentities(userId: string): Promise<readonly IdentityRecord[]> {
    return Promise.resolve(
      Object.values(this.data.identities)
        .filter((i) => i.userId === userId)
        .sort((a, b) => a.linkedAt.localeCompare(b.linkedAt)),
    );
  }

  putLinkIntent(intent: LinkIntentRecord): Promise<void> {
    this.data.linkIntents[intent.token] = intent;
    return this.persist();
  }

  async consumeLinkIntent(token: string, at: string): Promise<LinkIntentRecord | undefined> {
    const intent = this.data.linkIntents[token];
    if (!intent || intent.usedAt || intent.expiresAt <= at) return undefined;
    const used = { ...intent, usedAt: at };
    this.data.linkIntents[token] = used;
    await this.persist();
    return used;
  }

  hasUserData(userId: string): Promise<boolean> {
    const mine = (records: Record<string, { userId: string }>) =>
      Object.values(records).some((r) => r.userId === userId);
    return Promise.resolve(
      this.hasProgress(userId) ||
        mine(this.data.drafts) ||
        mine(this.data.interviewSessions) ||
        mine(this.data.savedCompanies) ||
        mine(this.data.questionMarks) ||
        this.data.profiles[userId] !== undefined,
    );
  }

  saveCompany(record: SavedCompanyRecord): Promise<void> {
    // Saving again keeps the original date.
    this.data.savedCompanies[key(record.userId, record.companyId)] ??= record;
    return this.persist();
  }

  unsaveCompany(userId: string, companyId: string): Promise<void> {
    delete this.data.savedCompanies[key(userId, companyId)];
    return this.persist();
  }

  listSavedCompanies(userId: string): Promise<readonly SavedCompanyRecord[]> {
    return Promise.resolve(
      Object.values(this.data.savedCompanies)
        .filter((r) => r.userId === userId)
        .sort(
          (a, b) => b.savedAt.localeCompare(a.savedAt) || a.companyId.localeCompare(b.companyId),
        ),
    );
  }

  setQuestionMark(
    record: Omit<QuestionMarkRecord, 'status'> & {
      status: QuestionMarkRecord['status'] | 'not-started';
    },
  ): Promise<void> {
    const k = key(record.userId, record.companyId, record.questionId);
    if (record.status === 'not-started') delete this.data.questionMarks[k];
    else this.data.questionMarks[k] = { ...record, status: record.status };
    return this.persist();
  }

  listQuestionMarks(userId: string): Promise<readonly QuestionMarkRecord[]> {
    return Promise.resolve(
      Object.values(this.data.questionMarks).filter((m) => m.userId === userId),
    );
  }

  async createInterviewSession(session: InterviewSessionRecord): Promise<CreateSessionOutcome> {
    const existing = Object.values(this.data.interviewSessions).find(
      (s) => s.userId === session.userId && s.clientRequestId === session.clientRequestId,
    );
    if (existing) return { kind: 'existing', session: existing };
    this.data.interviewSessions[session.id] = session;
    await this.persist();
    return { kind: 'created' };
  }

  getInterviewSession(
    userId: string,
    sessionId: string,
  ): Promise<InterviewSessionRecord | undefined> {
    const session = this.data.interviewSessions[sessionId];
    return Promise.resolve(session?.userId === userId ? session : undefined);
  }

  async updateInterviewSession(session: InterviewSessionRecord): Promise<boolean> {
    const current = this.data.interviewSessions[session.id];
    if (
      !current ||
      current.userId !== session.userId ||
      current.revision !== session.revision - 1
    ) {
      return false;
    }
    this.data.interviewSessions[session.id] = session;
    await this.persist();
    return true;
  }

  listInterviewSessions(userId: string, limit: number): Promise<readonly InterviewSessionRecord[]> {
    return Promise.resolve(
      Object.values(this.data.interviewSessions)
        .filter((s) => s.userId === userId)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id))
        .slice(0, limit),
    );
  }

  getDraft(
    userId: string,
    challengeId: string,
    language: LanguageId,
  ): Promise<DraftRecord | undefined> {
    return Promise.resolve(this.data.drafts[key(userId, challengeId, language)]);
  }

  putDraft(draft: DraftRecord): Promise<void> {
    this.data.drafts[key(draft.userId, draft.challengeId, draft.language)] = draft;
    return this.persist();
  }

  listDrafts(userId: string): Promise<readonly DraftRecord[]> {
    return Promise.resolve(
      Object.values(this.data.drafts)
        .filter((d) => d.userId === userId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  }

  getImport(userId: string, importId: string): Promise<ImportRecord | undefined> {
    return Promise.resolve(this.data.imports[key(userId, importId)]);
  }

  async putImportIfAbsent(record: ImportRecord): Promise<ImportRecord> {
    const k = key(record.userId, record.importId);
    const existing = this.data.imports[k];
    if (existing) return existing;
    this.data.imports[k] = record;
    await this.persist();
    return record;
  }
}
