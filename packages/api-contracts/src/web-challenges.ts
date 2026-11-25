import type {
  WebChallenge,
  WebFramework,
  WebImplementation,
  WebTestResult,
} from '@pracstack/content-model';

/*
 * Web Development Challenges: HTTP contract between the web app and the API.
 *
 * Long builds never hold a request open: a run (visible tests or a graded
 * submission) is created with POST and then polled with GET. An interactive
 * application session (for the HTTP client) is created, polled, sent requests,
 * and stopped. Every id is checked against the caller: users only ever see
 * their own runs, sessions, drafts and submissions.
 */

/** GET /api/web-challenges/:id — the challenge, access-checked, with the caller's progress. */
export interface WebChallengeResponse {
  readonly challenge: WebChallenge;
  readonly progress: WebChallengeProgress | null;
  /** Whether this server can run applications (false: browse only). */
  readonly executionAvailable: boolean;
}

/** GET /api/web-challenges/:id/frameworks/:framework/project — the starter project. */
export interface WebProjectResponse {
  readonly challengeId: string;
  readonly challengeVersion: number;
  readonly project: WebImplementation;
}

/** Status of a run or submission, from creation to result. */
export type WebRunStatus = 'queued' | 'building' | 'starting' | 'testing' | 'completed';

/**
 * The verdict of a completed run. `infrastructure-error` is never the
 * learner's fault: it is not recorded as an attempt and never counts.
 */
export type WebVerdict =
  | 'accepted'
  | 'tests-failed'
  | 'compilation-error'
  | 'startup-error'
  | 'time-limit-exceeded'
  | 'resource-limit-exceeded'
  | 'infrastructure-error';

export const WEB_VERDICT_LABELS: Readonly<Record<WebVerdict, string>> = {
  accepted: 'Accepted',
  'tests-failed': 'Tests failed',
  'compilation-error': 'Compilation error',
  'startup-error': 'Application startup error',
  'time-limit-exceeded': 'Time limit exceeded',
  'resource-limit-exceeded': 'Resource limit exceeded',
  'infrastructure-error': 'Infrastructure error',
};

export interface WebDiagnostic {
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly message: string;
}

/** A hidden test as the learner sees it: its category and whether it passed. */
export interface HiddenTestOutcome {
  readonly category: string;
  readonly passed: boolean;
}

export interface WebRunResult {
  readonly verdict: WebVerdict;
  readonly message?: string;
  readonly diagnostics: readonly WebDiagnostic[];
  /** Visible tests, with requests, expectations and what came back. */
  readonly visible: readonly WebTestResult[];
  /** Hidden tests (submissions only): categories and pass/fail, never inputs. */
  readonly hidden: readonly HiddenTestOutcome[];
  /** Recent application output (visible-test runs only; never for submissions). */
  readonly logs: readonly string[];
  readonly durationMs?: number;
}

/** POST /api/web-challenges/:id/runs */
export interface CreateWebRunRequest {
  readonly framework: WebFramework;
  /** Editable files only: path → content. Others come from the trusted template. */
  readonly files: Readonly<Record<string, string>>;
  /** `visible`: run the visible tests (not recorded). `submit`: graded, recorded. */
  readonly mode: 'visible' | 'submit';
  /** Submit within a timed session (deadline enforced by the server). */
  readonly timedSessionId?: string;
}

export interface WebRun {
  readonly id: string;
  readonly challengeId: string;
  readonly framework: WebFramework;
  readonly mode: 'visible' | 'submit';
  readonly status: WebRunStatus;
  /** When the server accepted the run (used for timed-session deadlines). */
  readonly acceptedAt: string;
  readonly result?: WebRunResult;
  /** Progress after a graded submission. */
  readonly progress?: WebChallengeProgress;
  readonly timedSessionId?: string;
}

/** POST /api/web-challenges/:id/runs, GET /api/web-runs/:id */
export interface WebRunResponse {
  readonly run: WebRun;
}

/* ---------- Interactive application sessions (HTTP client) ---------- */

export type WebSessionState =
  | 'queued'
  | 'building'
  | 'starting'
  | 'ready'
  | 'build-failed'
  | 'startup-failed'
  | 'resource-limit'
  | 'expired'
  | 'stopped'
  | 'unavailable';

/** POST /api/web-sessions */
export interface CreateWebSessionRequest {
  readonly challengeId: string;
  readonly framework: WebFramework;
  readonly files: Readonly<Record<string, string>>;
}

export interface WebSession {
  readonly id: string;
  readonly challengeId: string;
  readonly framework: WebFramework;
  readonly state: WebSessionState;
  readonly message?: string;
  readonly diagnostics: readonly WebDiagnostic[];
  readonly logs: readonly string[];
  readonly createdAt: string;
  /** The session is stopped at this time, or earlier after being idle. */
  readonly expiresAt: string;
  readonly requestsUsed: number;
  readonly requestLimit: number;
}

export interface WebSessionResponse {
  readonly session: WebSession;
}

/** POST /api/web-sessions/:id/requests */
export interface WebHttpRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Relative path and query, e.g. `/api/employees?page=2`. Never a URL. */
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface WebHttpResponse {
  readonly status?: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly truncated: boolean;
  /** Approximate, measured inside the sandbox. */
  readonly durationMs?: number;
  /** No HTTP response: why (refused, timed out, application not running). */
  readonly error?: string;
}

export interface WebHttpExchangeResponse {
  readonly response: WebHttpResponse;
  readonly session: WebSession;
}

/* ---------- Progress, history, drafts, quotas ---------- */

export interface WebChallengeProgress {
  readonly challengeId: string;
  readonly attempts: number;
  readonly solved: boolean;
  readonly frameworksSolved: readonly WebFramework[];
  /** Frameworks with at least one graded submission. */
  readonly frameworksAttempted: readonly WebFramework[];
  readonly lastSubmittedAt?: string;
  readonly solvedAt?: string;
}

/** GET /api/web-challenges/progress */
export interface WebProgressResponse {
  readonly challenges: readonly WebChallengeProgress[];
}

export interface WebSubmissionSummary {
  readonly id: string;
  readonly challengeId: string;
  readonly challengeVersion: number;
  readonly framework: WebFramework;
  readonly verdict: WebVerdict;
  readonly visiblePassed: number;
  readonly visibleTotal: number;
  readonly hiddenPassed: number;
  readonly hiddenTotal: number;
  readonly submittedAt: string;
  readonly timedSessionId?: string;
}

/** GET /api/web-challenges/:id/submissions */
export interface WebSubmissionsResponse {
  readonly submissions: readonly WebSubmissionSummary[];
}

/** GET/PUT /api/me/web-drafts/:challengeId/:framework */
export interface WebDraft {
  readonly challengeId: string;
  readonly framework: WebFramework;
  /** The challenge version the draft was written against. */
  readonly challengeVersion: number;
  readonly files: Readonly<Record<string, string>>;
  readonly updatedAt: string;
}

export interface WebDraftResponse {
  readonly draft: WebDraft | null;
}

export interface SaveWebDraftRequest {
  readonly challengeVersion: number;
  readonly files: Readonly<Record<string, string>>;
}

/** GET /api/me/web-usage — server-enforced execution limits for the caller. */
export interface WebUsageResponse {
  readonly day: string;
  readonly executionsUsed: number;
  readonly executionsPerDay: number;
  readonly concurrentLimit: number;
}

/* ---------- Timed sessions ---------- */

export const WEB_TIMED_DURATIONS = [30, 45, 60, 90, 120] as const;
export type WebTimedDuration = (typeof WEB_TIMED_DURATIONS)[number];

export type WebTimedStatus = 'active' | 'completed' | 'expired';

/** POST /api/web-timed-sessions */
export interface CreateWebTimedSessionRequest {
  readonly challengeId: string;
  readonly framework: WebFramework;
  readonly durationMinutes: WebTimedDuration;
}

export interface WebTimedSession {
  readonly id: string;
  readonly challengeId: string;
  readonly framework: WebFramework;
  readonly durationMinutes: WebTimedDuration;
  readonly startedAt: string;
  /** Server-authoritative. A submission is on time if the server accepted it before this. */
  readonly deadline: string;
  readonly status: WebTimedStatus;
  readonly finishedAt?: string;
  readonly submissions: number;
  /** The best graded submission accepted before the deadline. */
  readonly best?: WebSubmissionSummary;
}

export interface WebTimedSessionResponse {
  readonly session: WebTimedSession;
  /** Server time, so the browser can show an accurate countdown. */
  readonly serverTime: string;
}
