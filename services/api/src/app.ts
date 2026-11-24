import type { Plan } from '@pracstack/api-contracts';
import { AccountService } from './account/account-service';
import { EntitlementService } from './account/entitlements';
import { IdentityService } from './account/identity';
import { CompanyService } from './companies/company-service';
import { InterviewService } from './interview/interview-service';
import { PreparationService } from './roles/preparation-service';
import { ScenarioService } from './scenarios/scenario-service';
import type { AccountStore } from './store/account-store';
import type { ProgressStore } from './store/progress-store';
import type { Authenticator, Caller } from './auth';
import { ApiError, type ApiRequest, type ApiResponse, notFound } from './http';
import { ChallengeService } from './challenges/challenge-service';
import { PracticeService, type PracticeDeps } from './practice/practice-service';
import type { CodeRunner } from '@pracstack/code-runner';
import { type RateLimiter, SlidingWindowRateLimiter } from './rate-limit';
import {
  parseAnswerRequest,
  parseChallengeCodeRequest,
  parseHintRequest,
  parseId,
  parseNextQuestionRequest,
  parseRunSqlRequest,
  parseScenarioAnswerRequest,
} from './validation';
import {
  parseCompanyQuery,
  parseCreateInterviewSession,
  parseCreatePlan,
  parseDisplayName,
  parseFinishInterview,
  parseLanguage,
  parseProgressImport,
  parseQuestionId,
  parseQuestionStatus,
  parseSetTargetRole,
  parseUuid,
} from './prep-validation';

export interface ApiDeps extends PracticeDeps {
  readonly auth: Authenticator;
  readonly store: ProgressStore;
  /** Profiles, plans, identities, company preparation, interview sessions, drafts. */
  readonly accounts: AccountStore;
  /**
   * Local development only: the plan of the local developer, to try Pro
   * features. Refused with any real authenticator.
   */
  readonly localPlanOverride?: Plan;
  readonly rateLimiter: RateLimiter;
  /**
   * Stricter limit for requests that run SQL ("Run query" and answers), which
   * cost far more than other requests.
   */
  readonly sqlRateLimiter?: RateLimiter;
  /** Runs challenge submissions in isolated containers. Without it, server-side runs return 503. */
  readonly codeRunner?: CodeRunner;
  /** Limit for code runs and submissions, each of which starts a container. */
  readonly codeRateLimiter?: RateLimiter;
  /** Must be set to use the unauthenticated local developer user. */
  readonly allowLocalDevUser?: boolean;
  /** Receives unexpected errors (never shown to the client). */
  readonly logError?: (err: unknown) => void;
}

export type ApiHandler = (request: ApiRequest) => Promise<ApiResponse>;

/**
 * Builds the API as a plain function from request to response. The local
 * server and the future Lambda handler are thin adapters around this.
 */
export function createApi(deps: ApiDeps): ApiHandler {
  if (deps.auth.kind === 'local-dev' && !deps.allowLocalDevUser) {
    throw new Error(
      'The local developer user has no authentication; it requires allowLocalDevUser.',
    );
  }
  if (deps.localPlanOverride && deps.auth.kind !== 'local-dev') {
    throw new Error('localPlanOverride is for the local developer user only.');
  }
  const practice = new PracticeService(deps);
  const sqlRateLimiter = deps.sqlRateLimiter ?? new SlidingWindowRateLimiter(30, 60_000);
  const codeRateLimiter = deps.codeRateLimiter ?? new SlidingWindowRateLimiter(10, 60_000);
  const challenges = new ChallengeService({
    content: deps.content,
    store: deps.store,
    now: deps.now,
    newId: deps.newId,
    ...(deps.codeRunner ? { runner: deps.codeRunner } : {}),
  });
  const entitlements = new EntitlementService({
    store: deps.accounts,
    now: deps.now,
    ...(deps.localPlanOverride ? { localPlanOverride: deps.localPlanOverride } : {}),
  });
  const identities = new IdentityService(deps.accounts, deps.now, deps.newId);
  const accounts = new AccountService({
    content: deps.content,
    store: deps.store,
    accounts: deps.accounts,
    now: deps.now,
  });
  const companies = new CompanyService({
    content: deps.content,
    store: deps.store,
    accounts: deps.accounts,
    entitlements,
    now: deps.now,
  });
  const preparation = new PreparationService({
    content: deps.content,
    accounts: deps.accounts,
    now: deps.now,
    newId: deps.newId,
  });
  const scenarios = new ScenarioService({
    content: deps.content,
    store: deps.accounts,
    now: deps.now,
    solvedLanguages: async (userId) =>
      new Map(
        (await deps.store.listChallengeProgress(userId)).map((p) => [
          p.challengeId,
          p.languagesSolved,
        ]),
      ),
  });
  const interviews = new InterviewService({
    content: deps.content,
    accounts: deps.accounts,
    challenges,
    now: deps.now,
    newId: deps.newId,
  });
  const limit = async (limiter: RateLimiter, key: string): Promise<void> => {
    const wait = await limiter.hit(key, deps.now().getTime());
    if (wait > 0) {
      const seconds = Math.ceil(wait / 1000);
      throw new ApiError('rate-limited', `Too many requests. Try again in ${seconds} s.`, {
        'retry-after': String(seconds),
      });
    }
  };
  const logError = deps.logError ?? ((err) => console.error(err));

  const ok = (body: unknown): ApiResponse => ({ status: 200, body });
  const segment = (value: string | undefined, field: string): string =>
    parseId(decodeURIComponent(value ?? ''), field);

  /** /api/me and below: the caller's own account. */
  async function routeMe(
    request: ApiRequest,
    raw: Caller,
    user: Caller,
  ): Promise<ApiResponse | undefined> {
    const { method, path } = request;
    if (path === '/api/me') {
      if (method === 'GET') return ok(await accounts.me(user));
      if (method === 'PATCH') {
        return ok(await accounts.updateProfile(user, parseDisplayName(request.body)));
      }
    }
    if (method === 'GET' && path === '/api/me/entitlements') {
      return ok(await entitlements.describe(user));
    }
    if (method === 'GET' && path === '/api/me/progress') return ok(await accounts.progress(user));
    if (method === 'POST' && path === '/api/me/progress/import') {
      await limit(sqlRateLimiter, user.id);
      return ok(await accounts.importProgress(user, parseProgressImport(request.body)));
    }
    const draft = /^\/api\/me\/drafts\/([^/]+)\/([^/]+)$/.exec(path);
    if (method === 'GET' && draft) {
      return ok(
        await accounts.draft(
          user,
          segment(draft[1], 'challengeId'),
          parseLanguage(decodeURIComponent(draft[2] ?? '')),
        ),
      );
    }
    if (method === 'GET' && path === '/api/me/identities') {
      return ok({ identities: await identities.list(user.id) });
    }
    if (method === 'POST' && path === '/api/me/identities/link-intents') {
      return ok(await identities.createLinkIntent(user));
    }
    if (method === 'POST' && path === '/api/me/identities/link') {
      const body = request.body as Record<string, unknown> | undefined;
      // The identity being linked is the raw caller, before mapping.
      return ok(await identities.completeLink(raw, parseUuid(body?.['token'], 'token')));
    }
    if (method === 'GET' && path === '/api/me/companies') return ok(await companies.saved(user));
    const prep = await routePreparation(request, user);
    if (prep) return prep;
    const save = /^\/api\/me\/companies\/([^/]+)\/save$/.exec(path);
    if (save) {
      const slug = segment(save[1], 'companySlug');
      if (method === 'POST') return ok(await companies.save(user, slug));
      if (method === 'DELETE') return ok(await companies.unsave(user, slug));
    }
    const mark = /^\/api\/me\/companies\/([^/]+)\/questions\/([^/]+)$/.exec(path);
    if (method === 'PUT' && mark) {
      return ok(
        await companies.setQuestionStatus(
          user,
          segment(mark[1], 'companySlug'),
          parseQuestionId(decodeURIComponent(mark[2] ?? '')),
          parseQuestionStatus(request.body),
        ),
      );
    }
    return undefined;
  }

  /**
   * /api/me/preparation: target job role and saved plans (taxonomy term ids
   * only; job postings are analyzed in the browser and never sent).
   */
  async function routePreparation(
    request: ApiRequest,
    user: Caller,
  ): Promise<ApiResponse | undefined> {
    const { method, path } = request;
    if (method === 'GET' && path === '/api/me/preparation') return ok(await preparation.get(user));
    if (method === 'PUT' && path === '/api/me/preparation/target-role') {
      return ok(await preparation.setTargetRole(user, parseSetTargetRole(request.body)));
    }
    if (method === 'POST' && path === '/api/me/preparation/plans') {
      return ok(await preparation.createPlan(user, parseCreatePlan(request.body)));
    }
    const plan = /^\/api\/me\/preparation\/plans\/([^/]+)$/.exec(path);
    if (method === 'DELETE' && plan) {
      return ok(
        await preparation.deletePlan(user, parseUuid(decodeURIComponent(plan[1] ?? ''), 'planId')),
      );
    }
    return undefined;
  }

  /** /api/companies and below: the catalog (signed-in users). */
  async function routeCompanies(
    request: ApiRequest,
    user: Caller,
  ): Promise<ApiResponse | undefined> {
    const { method, path } = request;
    if (method !== 'GET') return undefined;
    if (path === '/api/companies') {
      return ok(await companies.list(user, parseCompanyQuery(request.query)));
    }
    const detail = /^\/api\/companies\/([^/]+)(\/questions|\/recommendations)?$/.exec(path);
    if (!detail) return undefined;
    const slug = segment(detail[1], 'companySlug');
    if (detail[2] === '/recommendations') return ok(await companies.recommendations(user, slug));
    const body = await companies.detail(user, slug);
    return ok(detail[2] === '/questions' ? { questions: body.questions } : body);
  }

  /** /api/interview-sessions: timed practice with a server-side deadline. */
  async function routeInterviews(
    request: ApiRequest,
    user: Caller,
  ): Promise<ApiResponse | undefined> {
    const { method, path } = request;
    if (path === '/api/interview-sessions') {
      if (method === 'POST') {
        return ok(await interviews.create(user, parseCreateInterviewSession(request.body)));
      }
      if (method === 'GET') {
        const company = request.query['companySlug'];
        return ok(
          await interviews.list(
            user,
            company === undefined ? undefined : parseId(company, 'companySlug'),
          ),
        );
      }
    }
    const route = /^\/api\/interview-sessions\/([^/]+)(\/submit|\/finish)?$/.exec(path);
    if (!route) return undefined;
    const id = parseUuid(decodeURIComponent(route[1] ?? ''), 'sessionId');
    if (method === 'GET' && !route[2]) return ok(await interviews.get(user, id));
    if (method === 'POST' && route[2] === '/submit') {
      const code = parseChallengeCodeRequest(request.body);
      await limit(codeRateLimiter, user.id);
      return ok(await interviews.submit(user, id, code));
    }
    if (method === 'POST' && route[2] === '/finish') {
      return ok(await interviews.finish(user, id, parseFinishInterview(request.body).outcome));
    }
    return undefined;
  }

  return async (request) => {
    try {
      const raw = await deps.auth.authenticate(request);
      const user = await identities.resolve(raw);
      await limit(deps.rateLimiter, user.id);

      const { method, path } = request;

      if (path === '/api/me' || path.startsWith('/api/me/')) {
        const response = await routeMe(request, raw, user);
        if (response) return response;
      }
      if (path.startsWith('/api/companies')) {
        const response = await routeCompanies(request, user);
        if (response) return response;
      }
      if (path.startsWith('/api/interview-sessions')) {
        const response = await routeInterviews(request, user);
        if (response) return response;
      }
      if (method === 'GET' && path === '/api/skill-mastery/progress') {
        return ok(
          await practice.progress(user, parseId(request.query['technologyId'], 'technologyId')),
        );
      }
      if (method === 'POST' && path === '/api/skill-mastery/practice/next') {
        return ok(await practice.next(user, parseNextQuestionRequest(request.body).skillId));
      }
      if (method === 'POST' && path === '/api/skill-mastery/practice/hint') {
        return ok(await practice.hint(user, parseHintRequest(request.body).token));
      }
      if (method === 'POST' && path === '/api/skill-mastery/practice/answer') {
        await limit(sqlRateLimiter, user.id);
        return ok(await practice.answer(user, parseAnswerRequest(request.body)));
      }
      if (method === 'POST' && path === '/api/skill-mastery/practice/run-sql') {
        await limit(sqlRateLimiter, user.id);
        return ok(await practice.runSql(user, parseRunSqlRequest(request.body)));
      }
      const history = /^\/api\/skill-mastery\/skills\/([^/]+)\/history$/.exec(path);
      if (method === 'GET' && history) {
        return ok(
          await practice.history(user, parseId(decodeURIComponent(history[1] ?? ''), 'skillId')),
        );
      }
      if (method === 'GET' && path === '/api/scenarios/progress') {
        return ok(await scenarios.list(user, deps.content.scenarioIds()));
      }
      const scenarioRoute = /^\/api\/scenarios\/([^/]+)\/(progress|answer)$/.exec(path);
      if (scenarioRoute) {
        const id = parseId(decodeURIComponent(scenarioRoute[1] ?? ''), 'scenarioId');
        if (method === 'GET' && scenarioRoute[2] === 'progress') {
          return ok(await scenarios.progress(user, id));
        }
        if (method === 'POST' && scenarioRoute[2] === 'answer') {
          await limit(sqlRateLimiter, user.id);
          const body = parseScenarioAnswerRequest(request.body);
          return ok(await scenarios.answer(user, id, body.taskId, body.answer));
        }
      }
      if (method === 'GET' && path === '/api/challenges/progress') {
        return ok(await challenges.progress(user));
      }
      const challengeRoute = /^\/api\/challenges\/([^/]+)\/(run|submissions)$/.exec(path);
      if (challengeRoute) {
        const id = parseId(decodeURIComponent(challengeRoute[1] ?? ''), 'challengeId');
        const action = challengeRoute[2];
        if (method === 'GET' && action === 'submissions')
          return ok(await challenges.history(user, id));
        if (method === 'POST') {
          const codeRequest = parseChallengeCodeRequest(request.body);
          await limit(codeRateLimiter, user.id);
          return ok(
            action === 'run'
              ? await challenges.run(user, id, codeRequest)
              : await challenges.submit(user, id, codeRequest),
          );
        }
      }
      throw notFound('No such API route.');
    } catch (err) {
      if (err instanceof ApiError) return err.toResponse();
      logError(err);
      return new ApiError('internal', 'Something went wrong on the server.').toResponse();
    }
  };
}
