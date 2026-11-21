import type { MeResponse } from '@pracstack/api-contracts';
import type { Authenticator } from './auth';
import { ApiError, type ApiRequest, type ApiResponse, notFound } from './http';
import { PracticeService, type PracticeDeps } from './practice/practice-service';
import type { RateLimiter } from './rate-limit';
import {
  parseAnswerRequest,
  parseHintRequest,
  parseId,
  parseNextQuestionRequest,
} from './validation';

export interface ApiDeps extends PracticeDeps {
  readonly auth: Authenticator;
  readonly rateLimiter: RateLimiter;
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
  const practice = new PracticeService(deps);
  const logError = deps.logError ?? ((err) => console.error(err));

  return async (request) => {
    try {
      const user = await deps.auth.authenticate(request);
      const wait = deps.rateLimiter.hit(user.id, deps.now().getTime());
      if (wait > 0) {
        const seconds = Math.ceil(wait / 1000);
        throw new ApiError('rate-limited', `Too many requests. Try again in ${seconds} s.`, {
          'retry-after': String(seconds),
        });
      }

      const { method, path } = request;
      const ok = (body: unknown): ApiResponse => ({ status: 200, body });

      if (method === 'GET' && path === '/api/me') {
        const body: MeResponse = { user, xp: await deps.store.getXp(user.id) };
        return ok(body);
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
        return ok(await practice.answer(user, parseAnswerRequest(request.body)));
      }
      const history = /^\/api\/skill-mastery\/skills\/([^/]+)\/history$/.exec(path);
      if (method === 'GET' && history) {
        return ok(
          await practice.history(user, parseId(decodeURIComponent(history[1] ?? ''), 'skillId')),
        );
      }
      throw notFound('No such API route.');
    } catch (err) {
      if (err instanceof ApiError) return err.toResponse();
      logError(err);
      return new ApiError('internal', 'Something went wrong on the server.').toResponse();
    }
  };
}
