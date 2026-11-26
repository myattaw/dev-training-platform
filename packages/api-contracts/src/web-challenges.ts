import type {
  WebChallenge,
  WebFramework,
  WebImplementation,
  WebTestResult,
} from '@pracstack/content-model';

/*
 * Web Development Challenges: HTTP contract between the web app and the API.
 *
 * Long builds never hold a request open: a run is created with POST and then
 * polled with GET. A run is one batch: build the project, start a fresh
 * application, send requests in order, stop it. Its requests are the visible
 * tests, the visible and hidden tests (a graded submission), or the learner's
 * own requests from the HTTP client. Nothing keeps running between runs.
 * Every id is checked against the caller: users only ever see their own runs,
 * drafts and submissions.
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
  | 'infrastructure-error'
  /** HTTP-client runs only: the application ran and the requests were sent (not graded). */
  | 'responded';

export const WEB_VERDICT_LABELS: Readonly<Record<WebVerdict, string>> = {
  accepted: 'Accepted',
  'tests-failed': 'Tests failed',
  'compilation-error': 'Compilation error',
  'startup-error': 'Application startup error',
  'time-limit-exceeded': 'Time limit exceeded',
  'resource-limit-exceeded': 'Resource limit exceeded',
  'infrastructure-error': 'Infrastructure error',
  responded: 'Responses received',
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
  /** Recent application output (visible-test and HTTP-client runs; never for submissions). */
  readonly logs: readonly string[];
  readonly durationMs?: number;
  /** HTTP-client runs: each request with what came back, in order. */
  readonly exchanges?: readonly WebHttpExchange[];
}

/**
 * `visible`: run the visible tests (not recorded). `submit`: graded and recorded.
 * `requests`: send the learner's own requests (HTTP client; not graded, not recorded).
 */
export type WebRunMode = 'visible' | 'submit' | 'requests';

/** POST /api/web-challenges/:id/runs */
export interface CreateWebRunRequest {
  readonly framework: WebFramework;
  /** Editable files only: path → content. Others come from the trusted template. */
  readonly files: Readonly<Record<string, string>>;
  readonly mode: WebRunMode;
  /** Mode `requests` only: the requests to send, in order, to one fresh application. */
  readonly requests?: readonly WebHttpRequest[];
  /** Submit within a timed session (deadline enforced by the server). */
  readonly timedSessionId?: string;
}

export interface WebRun {
  readonly id: string;
  readonly challengeId: string;
  readonly framework: WebFramework;
  readonly mode: WebRunMode;
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

/* ---------- HTTP client (runs in mode `requests`) ---------- */

/** Limits of one HTTP-client run (also enforced by the API). */
export const WEB_REQUEST_LIMITS = {
  maxRequests: 20,
  maxHeaders: 10,
  maxBodyBytes: 16 * 1024,
  maxTotalBodyBytes: 64 * 1024,
} as const;

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

export interface WebHttpExchange {
  readonly request: WebHttpRequest;
  readonly response: WebHttpResponse;
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
