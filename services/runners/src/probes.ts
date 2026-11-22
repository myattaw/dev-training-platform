/**
 * Hostile probe programs for the runner functions. Used by the local image
 * tests (src/runner-images.spec.ts) and, after deploying, against the real
 * functions on AWS (infra/scripts/verify-runners.ts), so both run the same
 * checks.
 */
import type { CodeRunRequest } from '@pracstack/code-runner';

/** A TypeScript submission that runs a Node.js script in a child process and returns its output. */
export function nodeProbe(script: string): CodeRunRequest {
  return {
    language: 'typescript',
    entryPoint: 'f',
    tests: [{ kind: 'call', input: [] }],
    code: [
      'declare const process: any;',
      'export function f(): string {',
      '  try {',
      `    return String(process.getBuiltinModule('child_process').execFileSync(process.execPath, ['-e', ${JSON.stringify(script)}], { timeout: 8000 }));`,
      "  } catch (e: any) { return 'PROBE-FAILED ' + String(e && e.message); }",
      '}',
    ].join('\n'),
  };
}

/**
 * Tries HTTPS to an AWS endpoint, the internet and a raw IP, and DNS. Prints one line
 * each, then exits (pending DNS queries must not hold the process past the run limit).
 */
export function networkProbe(region: string): string {
  return `
const https = require('node:https');
const dns = require('node:dns');
const out = [];
// All attempts run in parallel under one deadline that fits the run limit. In a VPC
// with no route out, packets are dropped silently, so attempts hang (DNS retries are
// not covered by the socket timeout); one still pending at the deadline never
// connected, which is "blocked". A reachable endpoint answers in well under a second.
// 4 s: about 3.5 s of the runner's 10 s limit goes to compiling and starting the probe.
const DEADLINE_MS = 4000;
const attempt = (name, run) => new Promise((done) => {
  let settled = false;
  const finish = (line) => { if (!settled) { settled = true; out.push(line); done(); } };
  setTimeout(() => finish('blocked ' + name + ' (no response in ' + DEADLINE_MS + ' ms)'), DEADLINE_MS);
  run(finish);
});
// Hostnames are resolved with dns.resolve4 (a DNS query, same resolver configuration)
// instead of the default getaddrinfo, which blocks a thread that keeps the process
// from exiting when no resolver answers (measured on AWS with DNS disabled).
const lookup = (host, opts, cb) => dns.resolve4(host, (e, addrs) => {
  if (e) return cb(e);
  if (opts && opts.all) return cb(null, addrs.map((address) => ({ address, family: 4 })));
  cb(null, addrs[0], 4);
});
const tryGet = (url) => attempt(url, (finish) => {
  const req = https.get(url, { timeout: DEADLINE_MS, lookup }, () => { finish('REACHED ' + url); req.destroy(); });
  req.on('timeout', () => { finish('blocked ' + url + ' (timeout)'); req.destroy(); });
  req.on('error', (e) => finish('blocked ' + url + ' (' + e.code + ')'));
});
Promise.all([
  tryGet(${JSON.stringify(`https://lambda.${region}.amazonaws.com/`)}),
  tryGet('https://example.com/'),
  tryGet('https://1.1.1.1/'),
  attempt('dns', (finish) => dns.resolve4('example.com', (e) =>
    finish(e ? 'blocked dns (' + e.code + ')' : 'REACHED dns'))),
]).then(() => process.stdout.write(out.join('\\n') + '\\n', () => process.exit(0)));`;
}

/** Lists processes whose environment holds a non-empty AWS credential. Prints "none" if there are none. */
export const ENVIRON_PROBE = `
const fs = require('node:fs');
const found = [];
for (const pid of fs.readdirSync('/proc').filter((n) => /^[0-9]+$/.test(n))) {
  let env = '';
  try { env = fs.readFileSync('/proc/' + pid + '/environ', 'utf8'); } catch { continue; }
  for (const line of env.split(String.fromCharCode(0)))
    if (/^AWS_(SECRET_ACCESS_KEY|ACCESS_KEY_ID|SESSION_TOKEN)=./.test(line)) found.push(pid + ':' + line.split('=')[0]);
}
console.log(found.length ? 'EXPOSED ' + found.join(' ') : 'none');`;

export const networkBlocked = (output: string): boolean =>
  output.includes('blocked') && !output.includes('REACHED') && !output.includes('PROBE-FAILED');

export const credentialsHidden = (output: string): boolean => output.trim() === 'none';
