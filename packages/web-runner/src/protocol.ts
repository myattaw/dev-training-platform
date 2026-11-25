/**
 * The contract between the API (trusted) and web-challenge execution
 * (untrusted application containers plus a trusted HTTP probe).
 *
 * ```
 * API ──tar of the project──▶ app container (untrusted: learner code, --network none)
 *  │                              ▲ loopback only
 *  └──requests (no expectations)──▶ probe container (trusted image, shares the app's
 *     ◀──raw responses───────────    network namespace, nothing else)
 * ```
 *
 * Expected values never leave the API: the probe receives requests only, and the
 * API grades the raw responses (see web-grading in @pracstack/api). See
 * docs/execution-security.md for the threat model.
 */

/** Frameworks with an application runner image. */
export type WebRunnerFramework = 'aspnetcore' | 'spring-boot' | 'django';

export const WEB_RUNNER_FRAMEWORKS: readonly WebRunnerFramework[] = [
  'aspnetcore',
  'spring-boot',
  'django',
];

/** Container images. Bump a tag when its Dockerfile or entry script changes. */
export const WEB_RUNNER_IMAGES: Readonly<Record<WebRunnerFramework | 'probe', string>> = {
  aspnetcore: 'pracstack-web-aspnetcore:1',
  'spring-boot': 'pracstack-web-spring-boot:1',
  django: 'pracstack-web-django:1',
  probe: 'pracstack-web-probe:2',
};

/** The port every application listens on, on 127.0.0.1 inside its container. */
export const APP_PORT = 8080;

/** Spring Boot library sets baked into the image (see docker/spring-boot/libs). */
export type SpringLibrarySet = 'core' | 'jpa' | 'security';

/** A complete project to build and run (already assembled and validated by the API). */
export interface WebProject {
  readonly framework: WebRunnerFramework;
  /** Project-relative path → file content. */
  readonly files: Readonly<Record<string, string>>;
  /** Spring Boot: the class with `main`, and the library set (from trusted content). */
  readonly spring?: { readonly mainClass: string; readonly librarySet: SpringLibrarySet };
}

/** HTTP methods the probe sends. */
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** One request the probe sends to the application. */
export interface ProbeRequest {
  readonly method: HttpMethod;
  /** Relative path and query, e.g. `/api/employees?page=2`. Never a URL. */
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  /** Raw body text (usually JSON). */
  readonly body?: string | null;
  /**
   * Values to read from this response's JSON (dot paths) and substitute as
   * `{{name}}` into later requests of the same sequence, e.g. a created id.
   */
  readonly capture?: Readonly<Record<string, string>>;
}

/** What the application answered (untrusted data, bounded by the probe). */
export interface ProbeResponse {
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly truncated?: boolean;
  /** Approximate: measured inside the sandbox, includes the application's work. */
  readonly durationMs?: number;
  /** Set when there was no HTTP response (refused, timed out, invalid request). */
  readonly error?: string;
}

/** Where an application run is. */
export type AppState =
  | 'queued'
  | 'building'
  | 'starting'
  | 'ready'
  /** Compile/check errors: see diagnostics. */
  | 'build-failed'
  /** Built, but the application exited or did not answer HTTP in time. */
  | 'startup-failed'
  /** Ran out of memory or printed too much, and was stopped. */
  | 'resource-limit'
  /** Exceeded its build deadline or lifetime. */
  | 'expired'
  | 'stopped'
  /** Docker or an image is missing, or the runner is busy: not the learner's fault. */
  | 'unavailable';

/** States after which the application will never answer again. */
export const FINAL_STATES: readonly AppState[] = [
  'build-failed',
  'startup-failed',
  'resource-limit',
  'expired',
  'stopped',
  'unavailable',
];

export interface BuildDiagnostic {
  /** Project-relative path, when the compiler named a project file. */
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly message: string;
}
