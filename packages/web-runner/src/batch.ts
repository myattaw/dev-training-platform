import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { gradeWebTest, type WebTest } from '@pracstack/content-model';
import { parseDiagnostics } from './diagnostics';
import {
  HTTP_METHODS,
  type BuildDiagnostic,
  type ProbeRequest,
  type ProbeResponse,
  type SpringLibrarySet,
  WEB_RUNNER_FRAMEWORKS,
  type WebRunnerFramework,
} from './protocol';
import type { WebTestRun } from './run-tests';

/*
 * Batch runs on AWS Lambda: one invocation of a framework's runner function
 * builds the project, starts the application, sends every request sequence in
 * order and returns the raw responses (see docs/lambda-web-runner.md).
 *
 * ```
 * trusted worker ──event { runId, key, tar, sequences }──▶ runner function
 *                ◀──{ body, signature: HMAC(key, body) }──  (learner code runs here)
 * ```
 *
 * Learner code runs in the same environment as the function's supervisor and
 * can reach Lambda's runtime API on loopback, so it could try to post a response
 * of its own. It never sees the per-run key (the supervisor keeps it in memory
 * and passes it to no process), so a forged response fails verification and the
 * worker treats it as an infrastructure error. Expected values never leave the
 * trusted side: the event carries requests only.
 */

/** Limits the caller may lower (never raise) for one batch. */
export interface WebBatchLimits {
  readonly buildTimeoutMs?: number;
  readonly startupTimeoutMs?: number;
  readonly requestTimeoutMs?: number;
}

/** Invocation payload of a web runner function. */
export interface WebBatchEvent {
  /** Echoed in the signed body, so a body cannot be replayed for another run. */
  readonly runId: string;
  /** 32 random bytes, hex: the HMAC key for this run only. */
  readonly key: string;
  readonly framework: WebRunnerFramework;
  /** A ustar archive of the assembled project, base64. */
  readonly tar: string;
  readonly spring?: { readonly mainClass: string; readonly librarySet: SpringLibrarySet };
  /** Requests only, never expectations. */
  readonly sequences: readonly (readonly ProbeRequest[])[];
  readonly limits?: WebBatchLimits;
}

export type WebBatchKind =
  | 'completed'
  | 'build-failed'
  | 'startup-failed'
  | 'resource-limit'
  | 'time-limit'
  | 'project-invalid'
  | 'unavailable';

/** What the runner reports (untrusted output of learner code is bounded inside). */
export interface WebBatchBody {
  readonly runId: string;
  readonly kind: WebBatchKind;
  readonly message?: string;
  /** Output of the build step (for diagnostics). */
  readonly buildLogs: readonly string[];
  /** Recent output, build and application. */
  readonly logs: readonly string[];
  /** One list of responses per sequence (completed batches only). */
  readonly results?: readonly (readonly ProbeResponse[])[];
  /** Milliseconds from the start of the run at each step. */
  readonly timings: Readonly<Record<string, number>>;
}

export interface WebBatchResponse {
  /** The JSON of a WebBatchBody, exactly as signed. */
  readonly body: string;
  /** HMAC-SHA256 of `body` with the run's key, hex. */
  readonly signature: string;
}

export const WEB_BATCH_LIMITS = {
  /** Lambda's synchronous response limit is 6 MB; stay well below it. */
  maxResponseBytes: 5_000_000,
  maxSequences: 100,
  maxStepsPerSequence: 30,
  maxTarBytes: 2_000_000,
} as const;

export const newBatchKey = (): string => randomBytes(32).toString('hex');

const hmac = (key: string, body: string) =>
  createHmac('sha256', Buffer.from(key, 'hex')).update(body, 'utf8').digest();

export function signBatch(key: string, body: WebBatchBody): WebBatchResponse {
  const json = JSON.stringify(body);
  return { body: json, signature: hmac(key, json).toString('hex') };
}

/**
 * Checks a runner's response: well-formed, signed with this run's key, and for
 * this run. Anything else (a forged, truncated or replayed response) is undefined.
 */
export function verifyBatch(
  key: string,
  runId: string,
  response: unknown,
): WebBatchBody | undefined {
  if (!isRecord(response)) return undefined;
  const { body, signature } = response;
  if (typeof body !== 'string' || typeof signature !== 'string') return undefined;
  if (!/^[0-9a-f]{64}$/.test(signature)) return undefined;
  if (!timingSafeEqual(hmac(key, body), Buffer.from(signature, 'hex'))) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || parsed['runId'] !== runId || typeof parsed['kind'] !== 'string') {
    return undefined;
  }
  return parsed as unknown as WebBatchBody;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const KEY = /^[0-9a-f]{64}$/;
const RUN_ID = /^[A-Za-z0-9-]{1,64}$/;
const JAVA_CLASS = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;

/** Validates an invocation payload (the runner trusts nothing it receives). */
export function parseWebBatchEvent(raw: unknown): WebBatchEvent | undefined {
  if (!isRecord(raw)) return undefined;
  const { runId, key, framework, tar, spring, sequences, limits } = raw;
  if (typeof runId !== 'string' || !RUN_ID.test(runId)) return undefined;
  if (typeof key !== 'string' || !KEY.test(key)) return undefined;
  if (!WEB_RUNNER_FRAMEWORKS.includes(framework as WebRunnerFramework)) return undefined;
  if (typeof tar !== 'string' || tar.length > (WEB_BATCH_LIMITS.maxTarBytes * 4) / 3 + 4) {
    return undefined;
  }
  if (spring !== undefined) {
    if (!isRecord(spring)) return undefined;
    if (typeof spring['mainClass'] !== 'string' || !JAVA_CLASS.test(spring['mainClass'])) {
      return undefined;
    }
    if (!['core', 'jpa', 'security'].includes(spring['librarySet'] as string)) return undefined;
  }
  if (!Array.isArray(sequences) || sequences.length > WEB_BATCH_LIMITS.maxSequences) {
    return undefined;
  }
  for (const sequence of sequences) {
    if (!Array.isArray(sequence) || sequence.length > WEB_BATCH_LIMITS.maxStepsPerSequence) {
      return undefined;
    }
    for (const step of sequence) if (!isProbeRequest(step)) return undefined;
  }
  if (limits !== undefined) {
    if (!isRecord(limits)) return undefined;
    for (const value of Object.values(limits)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
    }
  }
  return raw as unknown as WebBatchEvent;
}

function isProbeRequest(step: unknown): boolean {
  if (!isRecord(step)) return false;
  const { method, path, headers, body, capture } = step;
  if (!HTTP_METHODS.includes(method as never)) return false;
  if (typeof path !== 'string' || path.length > 2048) return false;
  if (headers !== undefined) {
    if (!isRecord(headers) || Object.keys(headers).length > 50) return false;
    if (Object.values(headers).some((v) => typeof v !== 'string')) return false;
  }
  if (body !== undefined && body !== null && typeof body !== 'string') return false;
  if (capture !== undefined) {
    if (!isRecord(capture) || Object.keys(capture).length > 10) return false;
    if (Object.values(capture).some((v) => typeof v !== 'string')) return false;
  }
  return true;
}

/** A verified batch as a graded test run (the same outcome the Docker runner gives). */
export function batchToTestRun(
  framework: WebRunnerFramework,
  body: WebBatchBody,
  tests: readonly WebTest[],
): WebTestRun {
  const logs = body.logs;
  switch (body.kind) {
    case 'completed': {
      const results = tests.map((test, i) => gradeWebTest(test, body.results?.[i] ?? []));
      return { kind: 'completed', results, logs, durationMs: body.timings['total'] ?? 0 };
    }
    case 'build-failed':
    case 'project-invalid': {
      const diagnostics: BuildDiagnostic[] = parseDiagnostics(framework, body.buildLogs);
      return { kind: 'build-failed', diagnostics, logs };
    }
    case 'startup-failed':
      return {
        kind: 'startup-failed',
        message: body.message ?? 'The application did not start.',
        logs,
      };
    case 'resource-limit':
      return {
        kind: 'resource-limit',
        message: body.message ?? 'A resource limit was reached.',
        logs,
      };
    case 'time-limit':
      return { kind: 'time-limit', message: body.message ?? 'A time limit was reached.', logs };
    default:
      return {
        kind: 'unavailable',
        message: body.message ?? 'The application runner is not available.',
      };
  }
}
