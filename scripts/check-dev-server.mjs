/**
 * Starts the Angular dev server (`ng serve`), requests a few pages, and fails
 * if it reports any error (e.g. dependency prebundling problems). The e2e
 * tests use the production build, so without this the dev server could break
 * unnoticed. Part of `npm run verify`.
 */
import { spawn, spawnSync } from 'node:child_process';

const PORT = 4398;
const TIMEOUT_MS = 120_000;
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

const server = spawn('npx', ['ng', 'serve', '--port', String(PORT)], {
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  // On Linux/macOS: its own process group, so the shell AND ng serve can be killed together.
  detached: process.platform !== 'win32',
});
let output = '';
server.stdout.on('data', (d) => (output += strip(String(d))));
server.stderr.on('data', (d) => (output += strip(String(d))));

const stop = () => {
  // Synchronous, so the whole process tree is gone before this script exits.
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F']);
  else {
    try {
      process.kill(-server.pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
};
const fail = (message) => {
  console.error(`Dev server check failed: ${message}\n\n${output}`);
  stop();
  process.exit(1);
};

const started = Date.now();
while (!/Local:\s+http/.test(output)) {
  if (Date.now() - started > TIMEOUT_MS) fail('ng serve did not start.');
  if (server.exitCode !== null) fail('ng serve exited.');
  await new Promise((r) => setTimeout(r, 500));
}

for (const path of ['/', '/challenges/pangram/workspace', '/skills/typescript']) {
  const res = await fetch(`http://localhost:${PORT}${path}`);
  if (!res.ok) fail(`GET ${path} returned ${res.status}.`);
}
// Prebundling and compile errors are reported asynchronously after startup.
await new Promise((r) => setTimeout(r, 8000));

// API proxy errors are expected: this check runs without the API.
const errors = output.split('\n').filter((l) => /\[ERROR\]|\berror TS\d+|Error during/i.test(l));
if (errors.length > 0) fail(`${errors.length} error line(s).`);
console.log('Dev server compiles and serves pages without errors.');
stop();
process.exit(0);
