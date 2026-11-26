/**
 * Lambda handler of the web-challenge runner functions (one container image
 * per framework; `WEB_FRAMEWORK` says which). Invoked only by the trusted web
 * worker with a batch: an assembled project and request sequences, never
 * expected values. One invocation builds the project, starts the application,
 * sends every sequence through the probe (in this process, on loopback) and
 * returns the raw responses, signed with the run's key (see batch.ts in
 * @pracstack/web-runner and docs/lambda-web-runner.md).
 *
 * Isolation is the code runners' (isolate.ts): the function's VPC has no route
 * out, its role has no permissions and its credentials are removed before the
 * runtime starts; the application runs with a clean environment under OS
 * limits, and every other process is killed and /tmp emptied before and after
 * each run.
 */
import { randomBytes } from 'node:crypto';
import {
  APP_PORT,
  parseWebBatchEvent,
  signBatch,
  WEB_BATCH_LIMITS,
  type WebBatchBody,
  type WebBatchKind,
  type WebBatchResponse,
  type WebRunnerFramework,
} from '@pracstack/web-runner';
import { runSequences, waitForApp } from '@pracstack/web-runner/probe-lib';
import { cleanUp, newRunDir, startIsolated } from './isolate';

const RUN_SCRIPT = '/opt/pracstack/run.sh';
const MAX_LOG_LINES = 400;
const MAX_LINE_CHARS = 2_000;
const SYSTEM_PATH = '/usr/local/bin:/usr/bin:/bin';

interface FrameworkConfig {
  readonly path: string;
  readonly env: (dir: string) => Record<string, string>;
  readonly buildTimeoutMs: number;
  readonly startupTimeoutMs: number;
  /** Total resident memory of the application's processes. */
  readonly maxRssMb: number;
  /** RLIMIT_NPROC: processes AND threads of this OS user (the supervisor's count too). */
  readonly maxProcesses: number;
}

/** Per framework; the limits match the local Docker runner (DEFAULT_WEB_LIMITS). */
export const WEB_FRAMEWORKS: Readonly<Record<WebRunnerFramework, FrameworkConfig>> = {
  // dotnet build: MSBuild and Roslyn need many threads; no build servers, no telemetry.
  aspnetcore: {
    path: `/usr/share/dotnet:${SYSTEM_PATH}`,
    env: (dir) => ({
      DOTNET_ROOT: '/usr/share/dotnet',
      DOTNET_CLI_HOME: dir,
      NUGET_PACKAGES: `${dir}/nuget`,
      DOTNET_CLI_TELEMETRY_OPTOUT: '1',
      DOTNET_NOLOGO: '1',
      DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
      DOTNET_GENERATE_ASPNET_CERTIFICATE: 'false',
      DOTNET_EnableDiagnostics: '0',
      DOTNET_EnableWriteXorExecute: '0',
      DOTNET_gcServer: '0',
      MSBUILDDISABLENODEREUSE: '1',
      ASPNETCORE_URLS: `http://127.0.0.1:${APP_PORT}`,
      ASPNETCORE_ENVIRONMENT: 'Production',
      Logging__Console__FormatterName: 'simple',
    }),
    buildTimeoutMs: 120_000,
    startupTimeoutMs: 30_000,
    maxRssMb: 2_048,
    maxProcesses: 1_024,
  },
  // javac over the fixed class path, then Spring Boot with Tomcat.
  'spring-boot': {
    path: `/opt/java/openjdk/bin:${SYSTEM_PATH}`,
    env: () => ({ JAVA_HOME: '/opt/java/openjdk' }),
    buildTimeoutMs: 90_000,
    startupTimeoutMs: 60_000,
    maxRssMb: 2_048,
    maxProcesses: 512,
  },
  // Syntax check, migrations into a fresh SQLite file, then runserver.
  django: {
    path: `/var/lang/bin:${SYSTEM_PATH}`,
    env: () => ({
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONUNBUFFERED: '1',
      PYTHONHASHSEED: '0',
      PYTHONIOENCODING: 'utf-8',
    }),
    buildTimeoutMs: 60_000,
    startupTimeoutMs: 30_000,
    maxRssMb: 1_024,
    maxProcesses: 256,
  },
};

const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
/** Time kept back from the function timeout for clean-up and the response. */
const RESERVE_MS = 10_000;

interface LambdaContext {
  readonly getRemainingTimeInMillis?: () => number;
}

/** An unsigned response: the worker's verification rejects it (infrastructure error). */
const REJECTED: WebBatchResponse = { body: '', signature: '' };

export async function handler(raw: unknown, context?: LambdaContext): Promise<WebBatchResponse> {
  const framework = process.env['WEB_FRAMEWORK'] as WebRunnerFramework | undefined;
  const event = parseWebBatchEvent(raw);
  if (!framework || !(framework in WEB_FRAMEWORKS) || !event || event.framework !== framework) {
    return REJECTED;
  }
  const config = WEB_FRAMEWORKS[framework];
  const started = Date.now();
  const timings: Record<string, number> = {};
  const lap = (name: string) => {
    timings[name] = Date.now() - started;
  };
  const budgetMs = Math.max(
    5_000,
    (context?.getRemainingTimeInMillis?.() ?? 15 * 60_000) - RESERVE_MS,
  );
  const buildTimeoutMs = Math.min(config.buildTimeoutMs, event.limits?.buildTimeoutMs ?? Infinity);
  const startupTimeoutMs = Math.min(
    config.startupTimeoutMs,
    event.limits?.startupTimeoutMs ?? Infinity,
  );
  const requestTimeoutMs = Math.min(
    DEFAULT_REQUEST_TIMEOUT_MS,
    event.limits?.requestTimeoutMs ?? Infinity,
  );

  cleanUp();
  const dir = newRunDir();
  const marker = `@@PRACSTACK-${randomBytes(12).toString('hex')}@@`;
  const lines: string[] = [];
  let buildLogs: readonly string[] = [];
  let partial = '';
  let status = 'queued';
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  const onLine = (line: string) => {
    if (line.startsWith(marker)) {
      status = line.slice(marker.length).trim();
      lap(status);
      if (status === 'build-ok' || status === 'build-failed' || status === 'project-invalid') {
        buildLogs = [...lines];
      }
      notify();
      return;
    }
    lines.push(line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}…` : line);
    if (lines.length > MAX_LOG_LINES) lines.shift();
  };
  const read = (chunk: Buffer) => {
    const parts = (partial + chunk.toString('utf8')).split('\n');
    partial = parts.pop() ?? '';
    if (partial.length > MAX_LINE_CHARS) {
      onLine(partial);
      partial = '';
    }
    parts.forEach(onLine);
  };

  const app = startIsolated(
    {
      command: '/bin/sh',
      args: [RUN_SCRIPT],
      stdin: Buffer.from(event.tar, 'base64'),
      env: {
        ...config.env(dir),
        PRACSTACK_MARKER: marker,
        ...(event.spring
          ? {
              PRACSTACK_MAIN_CLASS: event.spring.mainClass,
              PRACSTACK_LIB_SET: event.spring.librarySet,
            }
          : {}),
      },
      path: config.path,
      limitStderr: true,
      limits: {
        timeoutMs: budgetMs,
        maxOutputBytes: 4_000_000,
        maxRssMb: config.maxRssMb,
        maxProcesses: config.maxProcesses,
        maxOpenFiles: 2_048,
        maxFileBytes: 64 * 1024 * 1024,
      },
    },
    dir,
    { onStdout: read, onStderr: read },
  );
  void app.exited.then(notify);
  /** Resolves true once `ready()` holds, false at the timeout. */
  const waitFor = (ready: () => boolean, ms: number) =>
    new Promise<boolean>((resolve) => {
      const check = () => {
        if (!ready()) return;
        listeners.delete(check);
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        listeners.delete(check);
        resolve(ready());
      }, ms);
      listeners.add(check);
      check();
    });

  const finish = (
    kind: WebBatchKind,
    message?: string,
    results?: WebBatchBody['results'],
  ): WebBatchResponse => {
    lap('total');
    const logs = partial ? [...lines, partial] : [...lines];
    const body: WebBatchBody = {
      runId: event.runId,
      kind,
      ...(message ? { message } : {}),
      buildLogs,
      logs,
      ...(results ? { results } : {}),
      timings: { ...timings, peakRssMb: app.peakRssMb() },
    };
    if (JSON.stringify(body).length > WEB_BATCH_LIMITS.maxResponseBytes) {
      return signBatch(event.key, {
        runId: event.runId,
        kind: 'resource-limit',
        message: 'The responses were too large to return.',
        buildLogs: buildLogs.slice(-50),
        logs: logs.slice(-50),
        timings,
      });
    }
    return signBatch(event.key, body);
  };
  /** The application stopped by itself or was killed: why, in the learner's terms. */
  const stopped = (otherwise: WebBatchKind, message: string): WebBatchResponse => {
    switch (app.killedFor()) {
      case 'memory':
        return finish('resource-limit', 'The application used too much memory and was stopped.');
      case 'output':
        return finish('resource-limit', 'The application printed too much output and was stopped.');
      case 'timeout':
        return finish('time-limit', 'The run took longer than its time limit.');
      default:
        return finish(otherwise, message);
    }
  };

  try {
    const built = await waitFor(
      () => app.done() || !['queued', 'building'].includes(status),
      buildTimeoutMs,
    );
    if (!built) {
      return finish('time-limit', `The build took longer than ${buildTimeoutMs / 1000} seconds.`);
    }
    if (status === 'project-invalid') return finish('project-invalid', 'The project is invalid.');
    if (status === 'build-failed') return finish('build-failed');
    if (status !== 'build-ok' && status !== 'starting') {
      return stopped('unavailable', 'The runner could not build the project.');
    }
    const answering = await waitForApp(APP_PORT, startupTimeoutMs, () => app.done());
    if (!answering) {
      await waitFor(() => app.done(), 1_000);
      return app.done()
        ? stopped('startup-failed', 'The application exited before it answered HTTP requests.')
        : finish(
            'time-limit',
            `The application did not answer HTTP requests within ${startupTimeoutMs / 1000} seconds.`,
          );
    }
    lap('ready');
    const results = await runSequences(APP_PORT, event.sequences, requestTimeoutMs);
    lap('tested');
    // A request that got no response may mean the application was just killed (e.g. for
    // memory): its exit is reported a moment later, so wait for it briefly.
    if (results.some((sequence) => sequence.some((r) => r.error !== undefined))) {
      await waitFor(() => app.done(), 1_000);
    }
    if (app.done()) {
      return stopped('startup-failed', 'The application stopped while the requests were running.');
    }
    return finish('completed', undefined, results);
  } finally {
    app.stop();
    // Reap the application before sweeping, so nothing is left even as a zombie.
    await Promise.race([app.exited, new Promise((r) => setTimeout(r, 5_000))]);
    cleanUp();
  }
}
