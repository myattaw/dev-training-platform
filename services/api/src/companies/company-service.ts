import {
  COMPANY_PAGE_SIZE,
  type CompanyDetailResponse,
  type CompanyListResponse,
  type CompanyProgress,
  type CompanySummary,
  type PreparationPathView,
  type RecommendationsResponse,
  type RecommendationView,
  type ReportedQuestion,
  type ReportedQuestionStatus,
  type SavedCompaniesResponse,
  type SourceInfo,
} from '@pracstack/api-contracts';
import {
  COMPETENCIES,
  type CompanyContent,
  type CompanyIndexEntry,
  type DataSource,
  normalizeCompanyName,
} from '@pracstack/content-model';
import type { Caller } from '../auth';
import type { ContentSource } from '../content/content-source';
import type { EntitlementService } from '../account/entitlements';
import { notFound } from '../http';
import type {
  AccountStore,
  InterviewSessionRecord,
  QuestionMarkRecord,
} from '../store/account-store';
import type { ChallengeProgressRecord, ProgressStore } from '../store/progress-store';

export interface CompanyServiceDeps {
  readonly content: ContentSource;
  readonly store: ProgressStore;
  readonly accounts: AccountStore;
  readonly entitlements: EntitlementService;
  readonly now: () => Date;
}

export interface CompanyQuery {
  readonly q?: string;
  readonly letter?: string;
  readonly page?: number;
}

/** `A`–`Z` for names starting with a letter, `#` for everything else. */
export function firstLetter(displayName: string): string {
  const c = normalizeCompanyName(displayName).charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}

/**
 * Case- and accent-insensitive search over names and aliases: every word of
 * the query must appear. Names starting with the query rank first, then
 * alphabetical order.
 */
export function searchCompanies(
  companies: readonly CompanyIndexEntry[],
  q: string,
  letter?: string,
): CompanyIndexEntry[] {
  const query = normalizeCompanyName(q);
  const words = query.split(' ').filter(Boolean);
  const matches = companies.filter(
    (c) =>
      (letter === undefined || firstLetter(c.displayName) === letter) &&
      words.every((w) => c.searchText.includes(w)),
  );
  const startsWith = (c: CompanyIndexEntry) =>
    query !== '' && normalizeCompanyName(c.displayName).startsWith(query) ? 0 : 1;
  return matches.sort(
    (a, b) => startsWith(a) - startsWith(b) || a.displayName.localeCompare(b.displayName, 'en'),
  );
}

const toSourceInfo = (s: DataSource): SourceInfo => ({
  id: s.id,
  name: s.name,
  url: s.url,
  provider: s.provider,
  providerUrl: s.providerUrl,
  snapshotDate: s.snapshotDate,
  licenseStatus: s.license.status,
});

interface UserState {
  readonly saved: ReadonlySet<string>;
  readonly marks: readonly QuestionMarkRecord[];
  readonly challenges: ReadonlyMap<string, ChallengeProgressRecord>;
  readonly sessions: readonly InterviewSessionRecord[];
}

/**
 * Company Interview Prep. Reported questions are third-party references
 * (title, difficulty, link); recommended practice is PracStack's own content.
 * The two are never mixed: a reference is never "completed" by PracStack,
 * only marked by the learner.
 */
export class CompanyService {
  constructor(private readonly deps: CompanyServiceDeps) {}

  async list(caller: Caller, query: CompanyQuery): Promise<CompanyListResponse> {
    const all = this.deps.content.companyIndex().companies;
    const matches = searchCompanies(all, query.q ?? '', query.letter);
    const page = Math.max(1, query.page ?? 1);
    const saved = new Set(
      (await this.deps.accounts.listSavedCompanies(caller.id)).map((s) => s.companyId),
    );
    const start = (page - 1) * COMPANY_PAGE_SIZE;
    return {
      companies: matches
        .slice(start, start + COMPANY_PAGE_SIZE)
        .map((c) => this.summary(c, saved.has(c.id))),
      total: matches.length,
      page,
      pageSize: COMPANY_PAGE_SIZE,
      letters: [...new Set(all.map((c) => firstLetter(c.displayName)))].sort(),
    };
  }

  async detail(caller: Caller, slug: string): Promise<CompanyDetailResponse> {
    const content = this.find(slug);
    const state = await this.userState(caller);
    const sources = this.deps.content
      .companyIndex()
      .sources.filter((s) => content.references.some((r) => r.sourceId === s.id))
      .map(toSourceInfo);
    const providerOf = new Map(sources.map((s) => [s.id, s.provider]));
    const marks = new Map(
      state.marks.filter((m) => m.companyId === slug).map((m) => [m.questionId, m.status]),
    );

    const questions: ReportedQuestion[] = content.references.map((ref) => ({
      id: ref.id,
      title: ref.title,
      difficulty: ref.difficulty,
      provider: providerOf.get(ref.sourceId) ?? ref.sourceId,
      externalId: ref.externalId,
      externalUrl: ref.externalUrl,
      sourceId: ref.sourceId,
      ...(ref.acceptanceRate !== undefined ? { acceptanceRate: ref.acceptanceRate } : {}),
      windows: content.associations
        .filter((a) => a.problemId === ref.id)
        .map((a) => ({
          window: a.window,
          ...(a.reportedFrequency !== undefined ? { reportedFrequency: a.reportedFrequency } : {}),
        })),
      relatedChallenges: content.recommendations
        .filter((r) => r.sourceProblemId === ref.id)
        .flatMap((r) => {
          const challenge = this.deps.content.findChallenge(r.challengeId)?.challenge;
          return challenge ? [{ id: challenge.id, title: challenge.title }] : [];
        }),
      status: (marks.get(ref.id) ?? 'not-started') as ReportedQuestionStatus,
    }));

    const entry = this.deps.content.companyIndex().companies.find((c) => c.id === slug);
    return {
      company: entry
        ? this.summary(entry, state.saved.has(slug))
        : {
            slug,
            displayName: content.company.displayName,
            aliases: content.company.aliases,
            questionCount: content.references.length,
            saved: state.saved.has(slug),
          },
      sources,
      questions,
      progress: this.progressOf(content, state),
      preparationPaths: this.paths(content, state),
    };
  }

  async recommendations(caller: Caller, slug: string): Promise<RecommendationsResponse> {
    const content = this.find(slug);
    const [entitlements, challenges] = await Promise.all([
      this.deps.entitlements.resolve(caller),
      this.deps.store.listChallengeProgress(caller.id),
    ]);
    const solved = new Set(challenges.filter((c) => c.solved).map((c) => c.challengeId));
    const titles = new Map(content.references.map((r) => [r.id, r.title]));
    const premium = entitlements.features.has('premium-recommendations');

    const recommendations: RecommendationView[] = [];
    for (const rec of content.recommendations) {
      const owned = this.deps.content.findChallenge(rec.challengeId)?.challenge;
      const planned = owned ? undefined : this.deps.content.findPlannedChallenge(rec.challengeId);
      const base = owned ?? planned;
      if (!base) continue; // Content changed: never show a recommendation for nothing.
      const access = planned?.access ?? 'free';
      const relatedTitle = rec.sourceProblemId ? titles.get(rec.sourceProblemId) : undefined;
      recommendations.push({
        challengeId: base.id,
        title: base.title,
        summary: base.summary,
        difficulty: base.difficulty,
        category: base.category,
        reason: rec.reason,
        competencies: rec.similarityTags.map((t) => COMPETENCIES[t]),
        confidence: rec.confidence,
        origin: rec.origin,
        ...(rec.sourceProblemId && relatedTitle
          ? { relatedQuestion: { id: rec.sourceProblemId, title: relatedTitle } }
          : {}),
        access,
        availability: owned ? 'available' : 'coming-soon',
        locked: access === 'pro' && !premium,
        solved: owned !== undefined && solved.has(owned.id),
      });
    }
    return { recommendations, plan: entitlements.plan };
  }

  async save(caller: Caller, slug: string): Promise<{ saved: boolean }> {
    this.find(slug);
    await this.deps.accounts.saveCompany({
      userId: caller.id,
      companyId: slug,
      savedAt: this.deps.now().toISOString(),
    });
    return { saved: true };
  }

  async unsave(caller: Caller, slug: string): Promise<{ saved: boolean }> {
    this.find(slug);
    await this.deps.accounts.unsaveCompany(caller.id, slug);
    return { saved: false };
  }

  async setQuestionStatus(
    caller: Caller,
    slug: string,
    questionId: string,
    status: ReportedQuestionStatus,
  ): Promise<{ status: ReportedQuestionStatus }> {
    const content = this.find(slug);
    if (!content.references.some((r) => r.id === questionId)) {
      throw notFound('This question is not listed for this company.');
    }
    await this.deps.accounts.setQuestionMark({
      userId: caller.id,
      companyId: slug,
      questionId,
      status,
      updatedAt: this.deps.now().toISOString(),
    });
    return { status };
  }

  async saved(caller: Caller): Promise<SavedCompaniesResponse> {
    const savedRecords = await this.deps.accounts.listSavedCompanies(caller.id);
    const state = await this.userState(caller);
    const index = new Map(this.deps.content.companyIndex().companies.map((c) => [c.id, c]));
    const companies = savedRecords.flatMap((s) => {
      const entry = index.get(s.companyId);
      const content = this.deps.content.findCompany(s.companyId);
      if (!entry || !content) return [];
      return [
        {
          ...this.summary(entry, true),
          progress: this.progressOf(content, state),
          savedAt: s.savedAt,
        },
      ];
    });
    companies.sort((a, b) =>
      (b.progress.lastActivityAt ?? b.savedAt).localeCompare(
        a.progress.lastActivityAt ?? a.savedAt,
      ),
    );
    return { companies: companies.map(({ savedAt, ...rest }) => (void savedAt, rest)) };
  }

  // ---- helpers ----

  private find(slug: string): CompanyContent {
    const content = this.deps.content.findCompany(slug);
    if (!content) throw notFound('There is no company with this name in PracStack.');
    return content;
  }

  private summary(entry: CompanyIndexEntry, saved: boolean): CompanySummary {
    return {
      slug: entry.id,
      displayName: entry.displayName,
      aliases: entry.aliases,
      questionCount: entry.questionCount,
      ...(entry.sourceRowCount !== undefined && entry.sourceRowCount > entry.questionCount
        ? { sourceQuestionCount: entry.sourceRowCount }
        : {}),
      saved,
    };
  }

  private async userState(caller: Caller): Promise<UserState> {
    const [saved, marks, challenges, sessions] = await Promise.all([
      this.deps.accounts.listSavedCompanies(caller.id),
      this.deps.accounts.listQuestionMarks(caller.id),
      this.deps.store.listChallengeProgress(caller.id),
      this.deps.accounts.listInterviewSessions(caller.id, 200),
    ]);
    return {
      saved: new Set(saved.map((s) => s.companyId)),
      marks,
      challenges: new Map(challenges.map((c) => [c.challengeId, c])),
      sessions,
    };
  }

  /** Practisable recommended challenges (available, free). */
  private practiceIds(content: CompanyContent): string[] {
    return content.recommendations
      .map((r) => r.challengeId)
      .filter((id) => this.deps.content.findChallenge(id) !== undefined);
  }

  private progressOf(content: CompanyContent, state: UserState): CompanyProgress {
    const id = content.company.id;
    const marks = state.marks.filter((m) => m.companyId === id);
    const practice = this.practiceIds(content);
    const solved = practice.filter((c) => state.challenges.get(c)?.solved);
    const sessions = state.sessions.filter((s) => s.companyId === id);
    const completedSessions = sessions.filter((s) => s.status === 'completed').length;

    const activity = [
      ...marks.map((m) => m.updatedAt),
      ...sessions.map((s) => s.finishedAt ?? s.startedAt),
      ...practice.flatMap((c) => {
        const at = state.challenges.get(c)?.lastSubmittedAt;
        return at ? [at] : [];
      }),
    ].sort();
    const lastActivityAt = activity[activity.length - 1];

    const questionsDone = marks.length;
    const total = content.references.length;
    const started = questionsDone > 0 || solved.length > 0 || sessions.length > 0;
    const finished =
      total > 0 &&
      questionsDone === total &&
      solved.length === practice.length &&
      completedSessions > 0;
    return {
      status: finished ? 'completed' : started ? 'in-progress' : 'not-started',
      questionsTotal: total,
      questionsReviewed: marks.filter((m) => m.status === 'reviewed-externally').length,
      questionsSolvedExternally: marks.filter((m) => m.status === 'solved-externally').length,
      practiceTotal: practice.length,
      practiceSolved: solved.length,
      timedSessionsCompleted: completedSessions,
      ...(lastActivityAt ? { lastActivityAt } : {}),
    };
  }

  private paths(content: CompanyContent, state: UserState): PreparationPathView[] {
    const completedSession = state.sessions.some(
      (s) => s.companyId === content.company.id && s.status === 'completed',
    );
    return content.preparationPaths.flatMap((path) => {
      const steps: PreparationPathView['steps'][number][] = [];
      for (const step of path.steps) {
        const t = step.target;
        if (t.kind === 'challenge') {
          const challenge = this.deps.content.findChallenge(t.challengeId)?.challenge;
          // A path is shown only when every step can be followed.
          if (!challenge) return [];
          steps.push({
            title: step.title,
            description: step.description,
            target: { kind: 'challenge', challengeId: challenge.id, title: challenge.title },
            done: state.challenges.get(challenge.id)?.solved === true,
          });
        } else if (t.kind === 'skill') {
          const skill = this.deps.content.findSkill(t.skillId);
          if (!skill) return [];
          steps.push({
            title: step.title,
            description: step.description,
            target: {
              kind: 'skill',
              skillId: t.skillId,
              technologyId: skill.technologyId,
              title: skill.skill.name,
            },
            done: false,
          });
        } else {
          steps.push({
            title: step.title,
            description: step.description,
            target: { kind: 'timed-session' },
            done: completedSession,
          });
        }
      }
      return [{ id: path.id, title: path.title, summary: path.summary, steps }];
    });
  }
}
