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
  readonly stdin: string;
  readonly limits: IsolationLimits;
}

export interface IsolatedResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly killedFor?: 'timeout' | 'output' | 'memory';
}

const SCRATCH = process.env['PRACSTACK_SCRATCH'] ?? '/tmp';
const MEMORY_POLL_MS = 50;

export async function runIsolated(run: IsolatedRun): Promise<IsolatedResult> {
  cleanUp();
  const dir = join(SCRATCH, `run-${randomBytes(8).toString('hex')}`);
  mkdirSync(dir, { mode: 0o700 });
  try {
    return await execute(run, dir);
  } finally {
    cleanUp();
  }
}

function execute(run: IsolatedRun, dir: string): Promise<IsolatedResult> {
  const { limits } = run;
  const args = [
    `--nproc=${limits.maxProcesses}`,
    `--nofile=${limits.maxOpenFiles}`,
    `--fsize=${limits.maxFileBytes}`,
    '--',
    run.command,
    ...run.args.map((a) => a.replaceAll('{dir}', dir)),
  ];
  return new Promise((resolve) => {
    const child = spawn('prlimit', args, {
      cwd: dir,
      // No credentials, no configuration from the function's environment.
      env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: dir, TMPDIR: dir, LANG: 'C.UTF-8' },
      stdio: ['pipe', 'pipe', 'pipe'],
      // Its own process group, so the whole group can be killed at once.
      detached: true,
    });
    const stdout: Buffer[] = [];
    let outBytes = 0;
    let stderr = '';
    let killedFor: IsolatedResult['killedFor'];

    const stop = (reason: NonNullable<IsolatedResult['killedFor']>): void => {
      killedFor ??= reason;
      killGroup(child.pid);
    };
    const timer = setTimeout(() => stop('timeout'), limits.timeoutMs);
    const memory = setInterval(() => {
      if (otherProcessesRssMb() > limits.maxRssMb) stop('memory');
    }, MEMORY_POLL_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      outBytes += chunk.length;
      if (outBytes > limits.maxOutputBytes) stop('output');
      else stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 4000) stderr += chunk.toString('utf8');
    });
    child.stdin.on('error', () => undefined);
    child.on('error', (err) => {
      stderr += String(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      clearInterval(memory);
      resolve({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr,
        exitCode: code,
        ...(killedFor ? { killedFor } : {}),
      });
    });
    child.stdin.end(run.stdin);
  });
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
