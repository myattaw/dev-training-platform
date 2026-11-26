// PHASE 0 SPIKE (not production code). A Lambda custom runtime that builds and
// runs one web-challenge project per invocation, sends it a batch of request
// sequences through the existing probe, and returns the raw responses. It runs
// the same run.sh and probe.mjs as the local Docker runner, under Lambda's
// conditions: read-only image, writable /tmp only, one OS user, no network.
//
// Event:    { tar (base64), spring?, sequences, requestTimeoutMs?, buildTimeoutMs?, startupTimeoutMs? }
// Response: { kind, timings, peakRssMb, leftoversAtStart, logs, results? }
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const API = process.env.AWS_LAMBDA_RUNTIME_API;
const RUN = '/opt/pracstack/run.sh';
const PROBE = '/opt/pracstack/probe.mjs';
const SCRATCH = '/tmp';
const MAX_LOG_LINES = 400;
const NPROC = Number(process.env.PRACSTACK_NPROC ?? 512);
const MAX_RSS_MB = Number(process.env.PRACSTACK_MAX_RSS_MB ?? 3000);
// Only runtime settings reach the learner's processes: never the function's own environment.
const ENV_PREFIXES = [
  'DOTNET_',
  'ASPNETCORE_',
  'MSBUILD',
  'NUGET_',
  'Logging__',
  'PYTHON',
  'JAVA_',
];

for (;;) {
  const next = await fetch(`http://${API}/2018-06-01/runtime/invocation/next`);
  const id = next.headers.get('lambda-runtime-aws-request-id');
  let out;
  try {
    out = await handle(await next.json());
  } catch (err) {
    out = { kind: 'unavailable', message: String(err?.stack ?? err) };
  }
  await fetch(`http://${API}/2018-06-01/runtime/invocation/${id}/response`, {
    method: 'POST',
    body: JSON.stringify(out),
  });
}

async function handle(event) {
  const leftoversAtStart = {
    processes: otherProcesses().length,
    tmpEntries: safeReaddir(SCRATCH).length,
    detail: otherProcesses().map(describe),
  };
  cleanUp();
  const t0 = Date.now();
  const timings = {};
  const marker = `@@PRACSTACK-${randomBytes(12).toString('hex')}@@`;
  const env = {
    PATH: process.env.PATH,
    HOME: SCRATCH,
    TMPDIR: SCRATCH,
    LANG: 'C.UTF-8',
    PRACSTACK_MARKER: marker,
  };
  for (const [k, v] of Object.entries(process.env)) {
    if (ENV_PREFIXES.some((p) => k.startsWith(p))) env[k] = v;
  }
  if (event.spring) {
    env.PRACSTACK_MAIN_CLASS = event.spring.mainClass;
    env.PRACSTACK_LIB_SET = event.spring.librarySet;
  }
  const lines = [];
  let partial = '';
  let state = 'building';
  let peakRssMb = 0;
  let killedFor;
  const app = spawn(
    'prlimit',
    [`--nproc=${NPROC}`, '--nofile=2048', '--core=1', '--', '/bin/sh', RUN],
    {
      cwd: SCRATCH,
      env,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  let exited = false;
  const exit = new Promise((resolve) =>
    app.on('close', () => {
      exited = true;
      resolve();
    }),
  );
  const changed = [];
  const onLine = (line) => {
    if (line.startsWith(marker)) {
      const status = line.slice(marker.length).trim();
      timings[status] = Date.now() - t0;
      state = status;
      changed.splice(0).forEach((f) => f());
      return;
    }
    lines.push(line);
    if (lines.length > MAX_LOG_LINES) lines.shift();
  };
  const read = (chunk) => {
    const text = partial + chunk.toString('utf8');
    const parts = text.split('\n');
    partial = parts.pop() ?? '';
    parts.forEach(onLine);
  };
  app.stdout.on('data', read);
  app.stderr.on('data', read);
  app.stdin.on('error', () => undefined);
  app.stdin.end(Buffer.from(event.tar, 'base64'));

  const memory = setInterval(() => {
    const rss = otherProcessesRssMb();
    peakRssMb = Math.max(peakRssMb, rss);
    if (rss > MAX_RSS_MB) {
      killedFor = 'memory';
      killGroup(app.pid);
    }
  }, 100);
  const until = (pred, ms) =>
    new Promise((resolve) => {
      const check = () => (pred() ? resolve(true) : changed.push(check));
      const timer = setTimeout(() => resolve(false), ms);
      exit.then(() => {
        clearTimeout(timer);
        resolve(pred());
      });
      check();
    });

  try {
    const built = await until(() => state !== 'building', event.buildTimeoutMs ?? 150_000);
    if (!built) return finish('time-limit', 'The build ran past its time limit.');
    if (state !== 'starting' && state !== 'build-ok')
      return finish(state === 'project-invalid' ? 'project-invalid' : 'build-failed');
    await until(() => state === 'starting', 5_000);
    const probe = await runProbe(marker, event, () => exited);
    timings.probed = Date.now() - t0;
    if (probe.kind !== 'completed')
      return finish(exited ? 'startup-failed' : probe.kind, probe.message);
    return finish('completed', undefined, probe.results);
  } finally {
    clearInterval(memory);
    killGroup(app.pid);
    cleanUp();
  }

  function finish(kind, message, results) {
    if (killedFor === 'memory') kind = 'resource-limit';
    timings.total = Date.now() - t0;
    return {
      kind,
      message,
      timings,
      peakRssMb: Math.round(peakRssMb),
      leftoversAtStart,
      logs: partial ? [...lines, partial] : lines,
      results,
    };
  }
}

function runProbe(marker, event, appExited) {
  const nonce = randomBytes(16).toString('hex');
  return new Promise((resolve) => {
    const probe = spawn(process.execPath, ['--disallow-code-generation-from-strings', PROBE], {
      env: { PATH: process.env.PATH },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const chunks = [];
    probe.stdout.on('data', (c) => chunks.push(c));
    const timer = setTimeout(
      () => probe.kill('SIGKILL'),
      (event.startupTimeoutMs ?? 60_000) + 90_000,
    );
    probe.on('close', () => {
      clearTimeout(timer);
      const text = Buffer.concat(chunks).toString('utf8');
      const at = text.lastIndexOf(nonce);
      if (at < 0) return resolve({ kind: 'unavailable', message: 'The probe gave no result.' });
      const out = JSON.parse(text.slice(at + nonce.length).trim());
      if (out.kind === 'not-ready')
        return resolve({
          kind: appExited() ? 'startup-failed' : 'time-limit',
          message: 'The application did not answer HTTP.',
        });
      resolve(out);
    });
    probe.stdin.end(
      JSON.stringify({
        nonce,
        port: 8080,
        waitMs: event.startupTimeoutMs ?? 60_000,
        requestTimeoutMs: event.requestTimeoutMs ?? 5_000,
        sequences: event.sequences,
      }),
    );
  });
}

function describe(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return `${pid} ${stat.slice(stat.indexOf('('), stat.lastIndexOf(')') + 1)} ${stat
      .slice(stat.lastIndexOf(')') + 2)
      .split(' ')
      .slice(0, 2)
      .join(' ')}`;
  } catch {
    return `${pid} ?`;
  }
}

function killGroup(pid) {
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    /* gone */
  }
}

/** Kills every process except this one and its ancestors, then empties /tmp (as isolate.ts). */
function cleanUp() {
  for (let round = 0; round < 50; round++) {
    let killed = 0;
    for (const pid of otherProcesses()) {
      try {
        process.kill(pid, 'SIGKILL');
        killed++;
      } catch {
        /* not ours */
      }
    }
    if (killed === 0) break;
  }
  for (const entry of safeReaddir(SCRATCH))
    rmSync(join(SCRATCH, entry), { recursive: true, force: true, maxRetries: 2 });
}

function otherProcesses() {
  const keep = new Set();
  for (let pid = process.pid; pid > 0 && !keep.has(pid); pid = parentOf(pid)) keep.add(pid);
  return safeReaddir('/proc')
    .filter((n) => /^\d+$/.test(n))
    .map(Number)
    .filter((pid) => !keep.has(pid) && pid !== 1);
}

function parentOf(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
  } catch {
    return 0;
  }
}

function otherProcessesRssMb() {
  let kb = 0;
  for (const pid of otherProcesses()) {
    try {
      kb += Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))?.[1] ?? 0);
    } catch {
      /* exited */
    }
  }
  return kb / 1024;
}

function safeReaddir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
