/**
 * Runs one untrusted program inside a runner function's environment (on AWS:
 * a Lambda execution environment, i.e. a Firecracker microVM that is reused
 * for later invocations). The function's VPC has no network route, and its
 * role has no permissions; this module adds per-run isolation:
 *
 * - a fresh working directory, and an environment with NO credentials
 *   (Lambda keeps the function role's keys in its own environment);
 * - OS limits via prlimit: processes/threads, open files, file size;
 * - wall-clock, output and memory limits, enforced by killing the run;
 * - afterwards (and before, in case a previous invocation crashed): every
 *   process other than this supervisor is killed, including ones that
 *   detached into their own session, and /tmp is wiped. Nothing a run starts
 *   or writes is left for the next run.
 *
 * What this cannot prevent: the program runs as the same OS user as this
 * supervisor, so it can kill the supervisor (the invocation then fails and
 * Lambda starts a fresh environment). See docs/runners.md.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export interface IsolationLimits {
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  /** Total resident memory of all processes the run starts. */
  readonly maxRssMb: number;
  /** RLIMIT_NPROC: processes AND threads of this OS user (the supervisor's count too). */
  readonly maxProcesses: number;
  readonly maxOpenFiles: number;
  readonly maxFileBytes: number;
}

export interface IsolatedRun {
  readonly command: string;
  /** Arguments; `{dir}` is replaced with the run's working directory. */
  readonly args: readonly string[];
  readonly stdin: string | Buffer;
  readonly limits: IsolationLimits;
  /** Extra environment for the runtime (settings only; never credentials). */
  readonly env?: Readonly<Record<string, string>>;
  /** PATH for the program (default: /usr/local/bin:/usr/bin:/bin). */
  readonly path?: string;
  /** Count stderr towards `maxOutputBytes` too (default: stdout only). */
  readonly limitStderr?: boolean;
}

export interface IsolatedResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly killedFor?: KillReason;
}

export type KillReason = 'timeout' | 'output' | 'memory';

const SCRATCH = process.env['PRACSTACK_SCRATCH'] ?? '/tmp';
const MEMORY_POLL_MS = 50;

/** A fresh, private working directory for one run (under the scratch directory). */
export function newRunDir(): string {
  const dir = join(SCRATCH, `run-${randomBytes(8).toString('hex')}`);
  mkdirSync(dir, { mode: 0o700 });
  return dir;
}

export async function runIsolated(run: IsolatedRun): Promise<IsolatedResult> {
  cleanUp();
  const dir = newRunDir();
  try {
    const stdout: Buffer[] = [];
    let stderr = '';
    const proc = startIsolated(run, dir, {
      onStdout: (chunk) => stdout.push(chunk),
      onStderr: (chunk) => {
        if (stderr.length < 4000) stderr += chunk.toString('utf8');
      },
    });
    const { exitCode, killedFor, spawnError } = await proc.exited;
    return {
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: spawnError ? stderr + spawnError : stderr,
      exitCode,
      ...(killedFor ? { killedFor } : {}),
    };
  } finally {
    cleanUp();
  }
}

/** A running isolated program (see startIsolated). */
export interface IsolatedProcess {
  /** Resolves when the program's process group leader has exited and its pipes closed. */
  readonly exited: Promise<{
    readonly exitCode: number | null;
    readonly killedFor?: KillReason;
    readonly spawnError?: string;
  }>;
  /** Whether the program has exited. */
  readonly done: () => boolean;
  /** Kills the program's whole process group (for `reason`, if given). */
  readonly stop: (reason?: KillReason) => void;
  /** Why the program was killed, once it was. */
  readonly killedFor: () => KillReason | undefined;
  /** Peak resident memory of all other processes seen so far, MB. */
  readonly peakRssMb: () => number;
}

/**
 * Starts one untrusted program in `dir` under the limits and returns at once;
 * output is streamed to the callbacks (output beyond the limit is dropped and
 * the program killed). For long-running programs (web applications). The
 * caller cleans up (`cleanUp`) before and after.
 */
export function startIsolated(
  run: IsolatedRun,
  dir: string,
  output: {
    readonly onStdout: (chunk: Buffer) => void;
    readonly onStderr: (chunk: Buffer) => void;
  },
): IsolatedProcess {
  const { limits } = run;
  const args = [
    `--nproc=${limits.maxProcesses}`,
    `--nofile=${limits.maxOpenFiles}`,
    `--fsize=${limits.maxFileBytes}`,
    // No core dumps of learner programs (they hold code and hidden-test inputs).
    // 1, not 0: Linux ignores 0 when core_pattern pipes to a collector, but skips
    // piped dumps at exactly 1, and 1 byte is below the minimum for a core file.
    '--core=1',
    '--',
    run.command,
    ...run.args.map((a) => a.replaceAll('{dir}', dir)),
  ];
  const child = spawn('prlimit', args, {
    cwd: dir,
    // No credentials, no configuration from the function's environment.
    env: {
      ...run.env,
      PATH: run.path ?? '/usr/local/bin:/usr/bin:/bin',
      HOME: dir,
      TMPDIR: dir,
      LANG: 'C.UTF-8',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    // Its own process group, so the whole group can be killed at once.
    detached: true,
  });
  let outBytes = 0;
  let killedFor: KillReason | undefined;
  let spawnError: string | undefined;
  let finished = false;
  let peak = 0;

  const stop = (reason?: KillReason): void => {
    if (reason) killedFor ??= reason;
    killGroup(child.pid);
  };
  const timer = setTimeout(() => stop('timeout'), limits.timeoutMs);
  const memory = setInterval(() => {
    const rss = otherProcessesRssMb();
    peak = Math.max(peak, rss);
    if (rss > limits.maxRssMb) stop('memory');
  }, MEMORY_POLL_MS);

  child.stdout.on('data', (chunk: Buffer) => {
    outBytes += chunk.length;
    if (outBytes > limits.maxOutputBytes) stop('output');
    else output.onStdout(chunk);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    if (run.limitStderr) {
      outBytes += chunk.length;
      if (outBytes > limits.maxOutputBytes) {
        stop('output');
        return;
      }
    }
    output.onStderr(chunk);
  });
  child.stdin.on('error', () => undefined);
  const exited = new Promise<{
    exitCode: number | null;
    killedFor?: KillReason;
    spawnError?: string;
  }>((resolve) => {
    child.on('error', (err) => {
      spawnError = String(err);
    });
    child.on('close', (code) => {
      finished = true;
      clearTimeout(timer);
      clearInterval(memory);
      resolve({
        exitCode: code,
        ...(killedFor ? { killedFor } : {}),
        ...(spawnError ? { spawnError } : {}),
      });
    });
  });
  child.stdin.end(run.stdin);
  return {
    exited,
    done: () => finished,
    stop,
    killedFor: () => killedFor,
    peakRssMb: () => Math.round(peak),
  };
}

function killGroup(pid: number | undefined): void {
  if (!pid) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
}

/** Kills every process except this one and its ancestors, then empties the scratch directory. */
export function cleanUp(): void {
  // Repeat: a process may fork while we sweep. prlimit bounds how many can exist.
  for (let round = 0; round < 50; round++) {
    let killed = 0;
    for (const pid of otherProcesses()) {
      try {
        process.kill(pid, 'SIGKILL');
        killed++;
      } catch {
        /* not ours to kill (e.g. root-owned init), or already gone */
      }
    }
    if (killed === 0) break;
  }
  for (const entry of safeReaddir(SCRATCH)) {
    rmSync(join(SCRATCH, entry), { recursive: true, force: true, maxRetries: 2 });
  }
}

/** PIDs of all processes except this one and its ancestors (the Lambda runtime / init). */
function otherProcesses(): number[] {
  const keep = new Set<number>();
  for (let pid = process.pid; pid > 0 && !keep.has(pid); pid = parentOf(pid)) keep.add(pid);
  return safeReaddir('/proc')
    .filter((name) => /^\d+$/.test(name))
    .map(Number)
    .filter((pid) => !keep.has(pid) && pid !== 1);
}

function parentOf(pid: number): number {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    // Field 4, after the parenthesised command name (which may contain spaces).
    return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
  } catch {
    return 0;
  }
}

function otherProcessesRssMb(): number {
  let kb = 0;
  for (const pid of otherProcesses()) {
    try {
      const status = readFileSync(`/proc/${pid}/status`, 'utf8');
      kb += Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0);
    } catch {
      /* exited */
    }
  }
  return kb / 1024;
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
