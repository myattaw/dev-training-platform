import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { parseDiagnostics } from './diagnostics';
import { tarProject } from './files';
import {
  APP_PORT,
  type AppState,
  type BuildDiagnostic,
  FINAL_STATES,
  type ProbeRequest,
  type ProbeResponse,
  type WebProject,
  WEB_RUNNER_IMAGES,
  type WebRunnerFramework,
} from './protocol';

export interface WebRunnerLimits {
  /** From container start until the build has finished. */
  readonly buildTimeoutMs: number;
  /** From the end of the build until the application answers HTTP. */
  readonly startupTimeoutMs: number;
  /** Hard cap on a container's life, whatever happens. */
  readonly maxLifetimeMs: number;
  readonly memoryMb: number;
  readonly cpus: number;
  readonly pidsLimit: number;
  readonly tmpfsMb: number;
  /** Output read from the application before it is stopped (build output included). */
  readonly maxOutputBytes: number;
  /** Lines of output kept for display (the most recent ones). */
  readonly maxLogLines: number;
}

export const DEFAULT_WEB_LIMITS: Readonly<Record<WebRunnerFramework, WebRunnerLimits>> = {
  // dotnet build: MSBuild and Roslyn need ~1 GB and many threads; ~10 s warm.
  aspnetcore: {
    buildTimeoutMs: 120_000,
    startupTimeoutMs: 30_000,
    maxLifetimeMs: 15 * 60_000,
    memoryMb: 1536,
    cpus: 2,
    pidsLimit: 512,
    tmpfsMb: 512,
    maxOutputBytes: 4_000_000,
    maxLogLines: 400,
  },
  // javac over the fixed class path (~3 s), then Spring Boot with Tomcat (~3–6 s).
  'spring-boot': {
    buildTimeoutMs: 90_000,
    startupTimeoutMs: 60_000,
    maxLifetimeMs: 15 * 60_000,
    memoryMb: 1024,
    cpus: 2,
    pidsLimit: 256,
    tmpfsMb: 256,
    maxOutputBytes: 4_000_000,
    maxLogLines: 400,
  },
  // Syntax check, migrations into a fresh SQLite file, then runserver.
  django: {
    buildTimeoutMs: 60_000,
    startupTimeoutMs: 30_000,
    maxLifetimeMs: 15 * 60_000,
    memoryMb: 512,
    cpus: 1,
    pidsLimit: 128,
    tmpfsMb: 128,
    maxOutputBytes: 4_000_000,
    maxLogLines: 400,
  },
};

export interface ProbeLimits {
  readonly requestTimeoutMs: number;
  /** The whole probe run (all requests). */
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
}

export const DEFAULT_PROBE_LIMITS: ProbeLimits = {
  requestTimeoutMs: 5_000,
  timeoutMs: 60_000,
  maxOutputBytes: 8_000_000,
};

export interface DockerWebRunnerOptions {
  readonly limits?: Partial<Record<WebRunnerFramework, Partial<WebRunnerLimits>>>;
  readonly probe?: Partial<ProbeLimits>;
  /** Applications running (or building) at once, across all users. Bounds memory and CPU. */
  readonly maxConcurrent?: number;
  /** Applications waiting for a slot; beyond this, start() reports "unavailable". */
  readonly maxQueue?: number;
  readonly docker?: string;
}

export type ProbeRunResult =
  | { readonly kind: 'completed'; readonly results: readonly (readonly ProbeResponse[])[] }
  /** The application is not (or no longer) answering. */
  | { readonly kind: 'not-ready'; readonly message: string }
  /** The probe itself failed or timed out: an infrastructure problem. */
  | { readonly kind: 'unavailable'; readonly message: string };

/** Docker label on every container this runner starts, for clean-up after a crash. */
export const CONTAINER_LABEL = 'pracstack.web=1';

/**
 * Builds and runs web-challenge applications in throwaway Docker containers
 * and sends them HTTP requests through the probe. Every application container:
 *
 * - has no network at all (`--network none`): only the probe, which joins its
 *   network namespace, can reach it, on loopback;
 * - has a read-only root filesystem and a bounded, noexec `/tmp` (tmpfs);
 * - runs as an unprivileged user with every capability dropped and
 *   `no-new-privileges`, under Docker's default seccomp profile;
 * - is capped in memory (no swap), CPU, processes and open files;
 * - is killed at its build deadline, its startup deadline, its lifetime, or
 *   when it prints too much; and removed afterwards (`--rm`);
 * - never pulls images at run time (`--pull never`) and receives no host
 *   environment, credentials or mounts.
 *
 * See docs/execution-security.md for the threat model and the known limits.
 */
export class DockerWebRunner {
  private readonly limits: Readonly<Record<WebRunnerFramework, WebRunnerLimits>>;
  readonly probeLimits: ProbeLimits;
  private readonly maxConcurrent: number;
  private readonly maxQueue: number;
  readonly docker: string;
  private running = 0;
  private readonly waiting: (() => void)[] = [];
  private readonly apps = new Set<WebApp>();

  constructor(options: DockerWebRunnerOptions = {}) {
    this.limits = {
      aspnetcore: { ...DEFAULT_WEB_LIMITS.aspnetcore, ...options.limits?.aspnetcore },
      'spring-boot': { ...DEFAULT_WEB_LIMITS['spring-boot'], ...options.limits?.['spring-boot'] },
      django: { ...DEFAULT_WEB_LIMITS.django, ...options.limits?.django },
    };
    this.probeLimits = { ...DEFAULT_PROBE_LIMITS, ...options.probe };
    this.maxConcurrent = options.maxConcurrent ?? 2;
    this.maxQueue = options.maxQueue ?? 10;
    this.docker = options.docker ?? 'docker';
  }

  /** Checks that Docker is reachable and the images exist. */
  async check(
    frameworks: readonly WebRunnerFramework[] = ['aspnetcore', 'spring-boot', 'django'],
  ): Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }> {
    const images = [...frameworks.map((f) => WEB_RUNNER_IMAGES[f]), WEB_RUNNER_IMAGES.probe];
    const result = await exec(this.docker, ['image', 'inspect', '--format', '{{.Id}}', ...images]);
    if (result.code === 0) return { ok: true };
    if (/cannot connect|error during connect|daemon/i.test(result.stderr)) {
      return { ok: false, message: 'Docker is not running.' };
    }
    return {
      ok: false,
      message: 'Web runner images are missing. Build them with "npm run web-runners:build".',
    };
  }

  /** Removes containers left behind by an earlier process (e.g. after a crash). */
  async removeLeftovers(): Promise<void> {
    const list = await execOut(this.docker, ['ps', '-aq', '--filter', `label=${CONTAINER_LABEL}`]);
    const ids = list.stdout.split(/\s+/).filter(Boolean);
    if (ids.length > 0) await exec(this.docker, ['rm', '-f', ...ids]);
  }

  /** Applications currently queued, building, starting or ready. */
  get activeCount(): number {
    return [...this.apps].filter((a) => !FINAL_STATES.includes(a.state)).length;
  }

  /**
   * Starts building and running a project. Returns at once; follow the state
   * with `settled()` and `onChange`. The caller must `stop()` it when done.
   */
  start(project: WebProject, options: { readonly lifetimeMs?: number } = {}): WebApp {
    const limits = this.limits[project.framework];
    const app = new WebApp(this, project, {
      ...limits,
      maxLifetimeMs: Math.min(options.lifetimeMs ?? limits.maxLifetimeMs, limits.maxLifetimeMs),
    });
    this.apps.add(app);
    app.onChange(() => {
      if (FINAL_STATES.includes(app.state)) this.apps.delete(app);
    });
    if (this.running >= this.maxConcurrent && this.waiting.length >= this.maxQueue) {
      app.fail('unavailable', 'The application runner is busy. Try again in a moment.');
      return app;
    }
    void this.acquire().then(() => {
      if (FINAL_STATES.includes(app.state)) {
        this.release();
        return;
      }
      app.launch(() => this.release());
    });
    return app;
  }

  /** Stops every application (server shutdown). */
  async stopAll(): Promise<void> {
    await Promise.all([...this.apps].map((a) => a.stop('stopped')));
  }

  private acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(() => resolve()));
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.running--;
  }
}

/** One application run: one container, from build to removal. */
export class WebApp {
  readonly id = randomUUID();
  readonly containerName = `pracstack-web-${this.id}`;
  private readonly marker = `@@PRACSTACK-${randomBytes(12).toString('hex')}@@`;
  private currentState: AppState = 'queued';
  private message: string | undefined;
  private readonly lines: string[] = [];
  private buildLines: string[] = [];
  private diagnosticList: BuildDiagnostic[] = [];
  private outputBytes = 0;
  private partial = '';
  private readonly listeners = new Set<() => void>();
  private timers: NodeJS.Timeout[] = [];
  private releaseSlot: (() => void) | undefined;
  private exited = false;
  readonly startedAt = Date.now();

  constructor(
    private readonly runner: DockerWebRunner,
    readonly project: WebProject,
    private readonly limits: WebRunnerLimits,
  ) {}

  get state(): AppState {
    return this.currentState;
  }

  /** Why the application is in its state (for failures). */
  get stateMessage(): string | undefined {
    return this.message;
  }

  get diagnostics(): readonly BuildDiagnostic[] {
    return this.diagnosticList;
  }

  /** Recent output lines (build output and the application's own logs; untrusted text). */
  logs(): readonly string[] {
    return this.partial ? [...this.lines, this.partial] : [...this.lines];
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Resolves once the application is ready or has reached a final state. */
  settled(): Promise<AppState> {
    if (this.currentState === 'ready' || FINAL_STATES.includes(this.currentState)) {
      return Promise.resolve(this.currentState);
    }
    return new Promise((resolve) => {
      const off = this.onChange(() => {
        if (this.currentState === 'ready' || FINAL_STATES.includes(this.currentState)) {
          off();
          resolve(this.currentState);
        }
      });
    });
  }

  /** @internal Called by the runner when a slot is free. */
  launch(release: () => void): void {
    this.releaseSlot = release;
    const env = ['-e', `PRACSTACK_MARKER=${this.marker}`];
    if (this.project.spring) {
      env.push('-e', `PRACSTACK_MAIN_CLASS=${this.project.spring.mainClass}`);
      env.push('-e', `PRACSTACK_LIB_SET=${this.project.spring.librarySet}`);
    }
    const l = this.limits;
    const args = [
      'run',
      '--rm',
      '-i',
      '--pull',
      'never',
      '--name',
      this.containerName,
      '--label',
      CONTAINER_LABEL,
      '--network',
      'none',
      '--memory',
      `${l.memoryMb}m`,
      '--memory-swap',
      `${l.memoryMb}m`,
      '--cpus',
      String(l.cpus),
      '--pids-limit',
      String(l.pidsLimit),
      '--read-only',
      '--tmpfs',
      `/tmp:rw,nosuid,nodev,noexec,size=${l.tmpfsMb}m`,
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--user',
      '10001:10001',
      '--ulimit',
      'nofile=2048:2048',
      '--ulimit',
      'core=1:1',
      ...env,
      WEB_RUNNER_IMAGES[this.project.framework],
    ];
    this.setState('building');
    const child = spawn(this.runner.docker, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.timers.push(
      setTimeout(() => {
        if (this.currentState === 'building') {
          void this.stop('expired', 'The build took too long and was stopped.');
        }
      }, l.buildTimeoutMs),
      setTimeout(
        () => void this.stop('expired', 'The application reached its time limit and was stopped.'),
        l.maxLifetimeMs,
      ),
    );
    const onData = (chunk: Buffer): void => {
      this.outputBytes += chunk.length;
      if (this.outputBytes > l.maxOutputBytes) {
        void this.stop(
          'resource-limit',
          'The application printed too much output and was stopped.',
        );
        return;
      }
      this.consume(chunk.toString('utf8'));
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', () => {
      this.fail('unavailable', 'Docker is not available on this server.');
    });
    child.on('close', (code) => {
      this.exited = true;
      this.cleanup();
      if (FINAL_STATES.includes(this.currentState)) return;
      const output = this.lines.join('\n');
      if (code === 125 || /Unable to find image|No such image/i.test(output)) {
        this.fail('unavailable', 'The web runner images are missing on this server.');
      } else if (code === 137) {
        this.fail('resource-limit', 'The application ran out of memory and was stopped.');
      } else if (this.currentState === 'building') {
        this.fail('startup-failed', 'The build stopped unexpectedly.');
      } else {
        this.fail(
          'startup-failed',
          this.currentState === 'ready'
            ? `The application exited (exit code ${code ?? 'unknown'}).`
            : `The application exited before it answered HTTP requests (exit code ${code ?? 'unknown'}).`,
        );
      }
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(tarProject(this.project.files));
  }

  private consume(text: string): void {
    const parts = (this.partial + text).split('\n');
    this.partial = (parts.pop() ?? '').slice(0, 4000);
    for (const raw of parts) {
      const line = raw.replace(/\r$/, '');
      if (line.startsWith(this.marker)) {
        this.onMarker(line.slice(this.marker.length).trim());
        continue;
      }
      if (this.currentState === 'building') this.buildLines.push(line.slice(0, 2000));
      this.lines.push(line.slice(0, 2000));
      if (this.lines.length > this.limits.maxLogLines) this.lines.shift();
    }
  }

  private onMarker(event: string): void {
    // Learner code shares the container with the entry script and could print a
    // marker line; a forged event can only make its own run fail or look ready
    // early (the probe then finds nothing). Grading never depends on markers.
    switch (event) {
      case 'project-invalid':
        this.fail('startup-failed', 'The project could not be unpacked.');
        break;
      case 'build-failed':
        this.diagnosticList = parseDiagnostics(this.project.framework, this.buildLines);
        this.fail('build-failed', 'The project did not build.');
        break;
      case 'starting':
        if (this.currentState === 'building') {
          this.buildLines = [];
          this.setState('starting');
          void this.waitUntilReady();
        }
        break;
      default:
        break;
    }
  }

  private async waitUntilReady(): Promise<void> {
    const result = await this.runProbe([], this.limits.startupTimeoutMs);
    if (this.currentState !== 'starting') return;
    if (result.kind === 'completed') {
      this.setState('ready');
    } else if (result.kind === 'not-ready') {
      await this.stop(
        'startup-failed',
        `The application did not answer HTTP requests within ${Math.round(this.limits.startupTimeoutMs / 1000)} s.`,
      );
    } else {
      await this.stop('unavailable', result.message);
    }
  }

  /** Sends request sequences to the ready application. */
  async send(sequences: readonly (readonly ProbeRequest[])[]): Promise<ProbeRunResult> {
    if (this.currentState !== 'ready') {
      return { kind: 'not-ready', message: 'The application is not running.' };
    }
    const result = await this.runProbe(sequences, 0);
    if (result.kind === 'not-ready' || this.exited) {
      return { kind: 'not-ready', message: this.message ?? 'The application stopped answering.' };
    }
    return result;
  }

  private runProbe(
    sequences: readonly (readonly ProbeRequest[])[],
    waitMs: number,
  ): Promise<ProbeRunResult> {
    const limits = this.runner.probeLimits;
    const nonce = `@@PROBE-${randomBytes(12).toString('hex')}@@`;
    const name = `pracstack-probe-${randomUUID()}`;
    const args = [
      'run',
      '--rm',
      '-i',
      '--pull',
      'never',
      '--name',
      name,
      '--label',
      CONTAINER_LABEL,
      '--network',
      `container:${this.containerName}`,
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--user',
      '10001:10001',
      '--memory',
      '128m',
      '--memory-swap',
      '128m',
      '--pids-limit',
      '32',
      '--cpus',
      '0.5',
      WEB_RUNNER_IMAGES.probe,
    ];
    const input = JSON.stringify({
      nonce,
      port: APP_PORT,
      waitMs,
      requestTimeoutMs: limits.requestTimeoutMs,
      sequences,
    });
    return new Promise((resolve) => {
      const child = spawn(this.runner.docker, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      const out: Buffer[] = [];
      let bytes = 0;
      let settled = false;
      const finish = (result: ProbeRunResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => {
        void exec(this.runner.docker, ['kill', name]);
        child.kill();
        finish({ kind: 'unavailable', message: 'The HTTP requests timed out.' });
      }, limits.timeoutMs + waitMs);
      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes <= limits.maxOutputBytes) out.push(chunk);
      });
      child.stderr.on('data', () => undefined);
      child.on('error', () => finish({ kind: 'unavailable', message: 'Docker is not available.' }));
      child.on('close', () => {
        const line = Buffer.concat(out)
          .toString('utf8')
          .split('\n')
          .find((l) => l.startsWith(nonce));
        if (!line) {
          // The probe could not join the network namespace: the app container is gone.
          finish(
            this.exited
              ? { kind: 'not-ready', message: 'The application is not running.' }
              : { kind: 'unavailable', message: 'The HTTP probe failed.' },
          );
          return;
        }
        finish(parseProbeOutput(line.slice(nonce.length), sequences));
      });
      child.stdin.on('error', () => undefined);
      child.stdin.end(input);
    });
  }

  /** Stops and removes the container. Safe to call more than once. */
  async stop(state: AppState = 'stopped', message?: string): Promise<void> {
    if (!FINAL_STATES.includes(this.currentState)) this.fail(state, message);
    this.cleanup();
    if (!this.exited) await exec(this.runner.docker, ['rm', '-f', this.containerName]);
  }

  /** @internal */
  fail(state: AppState, message?: string): void {
    if (FINAL_STATES.includes(this.currentState)) return;
    this.message = message;
    this.setState(state);
    this.cleanup();
    if (!this.exited && this.releaseSlot)
      void exec(this.runner.docker, ['rm', '-f', this.containerName]);
  }

  private cleanup(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    const release = this.releaseSlot;
    this.releaseSlot = undefined;
    release?.();
  }

  private setState(state: AppState): void {
    this.currentState = state;
    for (const listener of [...this.listeners]) listener();
  }
}

/** Validates the probe's output (it reflects untrusted responses) and checks its shape. */
function parseProbeOutput(
  text: string,
  sequences: readonly (readonly ProbeRequest[])[],
): ProbeRunResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: 'unavailable', message: 'The HTTP probe produced an unreadable result.' };
  }
  const value = parsed as { kind?: unknown; results?: unknown };
  if (value.kind === 'not-ready') {
    return { kind: 'not-ready', message: 'The application did not answer HTTP requests.' };
  }
  if (value.kind !== 'completed' || !Array.isArray(value.results)) {
    return { kind: 'unavailable', message: 'The HTTP probe failed.' };
  }
  if (value.results.length !== sequences.length) {
    return { kind: 'unavailable', message: 'The HTTP probe returned the wrong number of results.' };
  }
  const results = value.results.map((sequence: unknown, i) => {
    const expected = sequences[i]?.length ?? 0;
    const list = Array.isArray(sequence) ? sequence : [];
    return Array.from({ length: expected }, (_, j) => sanitizeResponse(list[j]));
  });
  return { kind: 'completed', results };
}

function sanitizeResponse(value: unknown): ProbeResponse {
  if (typeof value !== 'object' || value === null) return { error: 'No response.' };
  const v = value as Record<string, unknown>;
  const headers: Record<string, string> = {};
  if (typeof v['headers'] === 'object' && v['headers'] !== null) {
    for (const [k, h] of Object.entries(v['headers'] as Record<string, unknown>).slice(0, 50)) {
      if (typeof h === 'string') headers[k.toLowerCase().slice(0, 64)] = h.slice(0, 1024);
    }
  }
  const status =
    typeof v['status'] === 'number' && Number.isInteger(v['status']) ? v['status'] : undefined;
  return {
    ...(status !== undefined && status >= 100 && status <= 599 ? { status, headers } : {}),
    ...(typeof v['body'] === 'string' ? { body: v['body'].slice(0, 64 * 1024) } : {}),
    ...(v['truncated'] === true ? { truncated: true } : {}),
    ...(typeof v['durationMs'] === 'number'
      ? { durationMs: Math.max(0, Math.round(v['durationMs'])) }
      : {}),
    ...(typeof v['error'] === 'string' ? { error: v['error'].slice(0, 300) } : {}),
    ...(status === undefined && typeof v['error'] !== 'string' ? { error: 'No response.' } : {}),
  };
}

function exec(command: string, args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.on('error', (err) => resolve({ code: -1, stderr: err.message }));
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

function execOut(
  command: string,
  args: string[],
): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.on('error', () => resolve({ code: -1, stdout: '' }));
    child.on('close', (code) => resolve({ code, stdout }));
  });
}
