import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  type CodeRunner,
  type CodeRunRequest,
  type CodeRunResult,
  RUNNER_IMAGES,
  type RunnerInput,
  type RunnerLanguage,
  type RunnerOutput,
} from './protocol';

export interface DockerRunnerLimits {
  /** Wall-clock limit per run, including container start and compilation. */
  readonly timeoutMs: number;
  readonly memoryMb: number;
  readonly cpus: number;
  readonly pidsLimit: number;
  /** Output read from the container before it is killed. */
  readonly maxOutputBytes: number;
  readonly maxLogLines: number;
}

export const DEFAULT_LIMITS: Readonly<Record<RunnerLanguage, DockerRunnerLimits>> = {
  typescript: {
    timeoutMs: 10_000,
    memoryMb: 256,
    cpus: 1,
    pidsLimit: 64,
    maxOutputBytes: 1_000_000,
    maxLogLines: 200,
  },
  java: {
    timeoutMs: 15_000,
    memoryMb: 512,
    cpus: 1,
    pidsLimit: 128,
    maxOutputBytes: 1_000_000,
    maxLogLines: 200,
  },
};

export interface DockerRunnerOptions {
  readonly limits?: Partial<Record<RunnerLanguage, Partial<DockerRunnerLimits>>>;
  /** Containers running at once. Each is capped by `memoryMb`, so this bounds total memory. */
  readonly maxConcurrent?: number;
  /** Waiting runs beyond this are refused as busy. */
  readonly maxQueue?: number;
  readonly docker?: string;
}

/**
 * Runs submissions in throwaway Docker containers. See docs/runners.md for
 * the threat model. Every container:
 *
 * - has no network (`--network none`);
 * - has a read-only root filesystem and a small writable /tmp (tmpfs);
 * - runs as an unprivileged user with all capabilities dropped and
 *   `no-new-privileges`;
 * - is capped in memory (no swap), CPU, processes, open files and file size;
 * - is killed when it exceeds the wall-clock limit or prints too much;
 * - is removed afterwards (`--rm`), so nothing persists between runs;
 * - never pulls images from the internet (`--pull never`).
 *
 * The container receives test inputs only; expected values stay here.
 */
export class DockerCodeRunner implements CodeRunner {
  private readonly limits: Readonly<Record<RunnerLanguage, DockerRunnerLimits>>;
  private readonly maxConcurrent: number;
  private readonly maxQueue: number;
  private readonly docker: string;
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(options: DockerRunnerOptions = {}) {
    this.limits = {
      typescript: { ...DEFAULT_LIMITS.typescript, ...options.limits?.typescript },
      java: { ...DEFAULT_LIMITS.java, ...options.limits?.java },
    };
    this.maxConcurrent = options.maxConcurrent ?? 2;
    this.maxQueue = options.maxQueue ?? 20;
    this.docker = options.docker ?? 'docker';
  }

  /** Checks that Docker is reachable and the runner images exist. */
  async check(): Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }> {
    const result = await exec(this.docker, [
      'image',
      'inspect',
      '--format',
      '{{.Id}}',
      ...Object.values(RUNNER_IMAGES),
    ]);
    if (result.code === 0) return { ok: true };
    if (/cannot connect|error during connect|daemon/i.test(result.stderr)) {
      return { ok: false, message: 'Docker is not running.' };
    }
    return {
      ok: false,
      message: 'Runner images are missing. Build them with "npm run runners:build".',
    };
  }

  async run(request: CodeRunRequest): Promise<CodeRunResult> {
    if (this.running >= this.maxConcurrent && this.waiting.length >= this.maxQueue) {
      return { kind: 'unavailable', message: 'The code runner is busy. Try again in a moment.' };
    }
    await this.acquire();
    try {
      return await this.runContainer(request);
    } finally {
      this.release();
    }
  }

  private runContainer(request: CodeRunRequest): Promise<CodeRunResult> {
    const limits = this.limits[request.language];
    const name = `pracstack-run-${randomUUID()}`;
    const nonce = `<<PRACSTACK-${randomBytes(16).toString('hex')}>>`;
    const input: RunnerInput = {
      nonce,
      code: request.code,
      entryPoint: request.entryPoint,
      tests: request.tests,
      maxLogLines: limits.maxLogLines,
    };

    const args = [
      'run',
      '--rm',
      '-i',
      '--pull',
      'never',
      '--name',
      name,
      '--network',
      'none',
      '--memory',
      `${limits.memoryMb}m`,
      '--memory-swap',
      `${limits.memoryMb}m`,
      '--cpus',
      String(limits.cpus),
      '--pids-limit',
      String(limits.pidsLimit),
      '--read-only',
      '--tmpfs',
      '/tmp:rw,nosuid,nodev,size=64m',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--user',
      '10001:10001',
      '--ulimit',
      'nofile=256:256',
      '--ulimit',
      'fsize=16777216',
      RUNNER_IMAGES[request.language],
    ];

    return new Promise<CodeRunResult>((resolve) => {
      const child = spawn(this.docker, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      const stdout: Buffer[] = [];
      let stdoutBytes = 0;
      let stderr = '';
      let settled: CodeRunResult | undefined;

      const kill = (): void => {
        // Killing the docker CLI does not stop the container; kill it by name.
        void exec(this.docker, ['kill', name]);
        child.kill();
      };
      const finishEarly = (result: CodeRunResult): void => {
        if (settled) return;
        settled = result;
        kill();
      };

      const timer = setTimeout(
        () => finishEarly({ kind: 'timeout', timeoutMs: limits.timeoutMs }),
        limits.timeoutMs,
      );

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > limits.maxOutputBytes) {
          finishEarly({
            kind: 'resource-limit',
            message: 'Your program printed too much output and was stopped.',
          });
          return;
        }
        stdout.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < 4000) stderr += chunk.toString('utf8');
      });
      child.on('error', () => {
        clearTimeout(timer);
        resolve({ kind: 'unavailable', message: 'Docker is not available on this server.' });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (settled) return resolve(settled);
        resolve(interpret(Buffer.concat(stdout).toString('utf8'), nonce, code, stderr));
      });

      child.stdin.on('error', () => undefined);
      child.stdin.end(JSON.stringify(input));
    });
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

/** Turns container output and exit status into a result. Exported for tests. */
export function interpret(
  stdout: string,
  nonce: string,
  exitCode: number | null,
  stderr: string,
): CodeRunResult {
  const line = stdout.split('\n').find((l) => l.startsWith(nonce));
  if (line) {
    try {
      return JSON.parse(line.slice(nonce.length)) as RunnerOutput;
    } catch {
      return { kind: 'load-error', message: 'The runner produced an unreadable result.', logs: [] };
    }
  }
  if (exitCode === 125 || /Unable to find image|No such image/i.test(stderr)) {
    return {
      kind: 'unavailable',
      message: /No such image|Unable to find image/i.test(stderr)
        ? 'Runner images are missing. Build them with "npm run runners:build".'
        : 'The code runner could not start a container.',
    };
  }
  // 137: killed by the kernel at the container memory limit. 134 with a heap
  // message: the runtime's own heap limit (Node's --max-old-space-size, Java's heap).
  if (exitCode === 137 || /heap out of memory|OutOfMemoryError/i.test(stderr)) {
    return {
      kind: 'resource-limit',
      message: 'Your program used too much memory and was stopped.',
    };
  }
  return {
    kind: 'load-error',
    message: `Your program stopped before reporting any results (exit code ${exitCode ?? 'unknown'}).`,
    logs: [],
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
