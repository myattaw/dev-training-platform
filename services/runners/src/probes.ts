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

/** Tries HTTPS to an AWS endpoint, the internet and a raw IP, and DNS. Prints one line each. */
export function networkProbe(region: string): string {
  return `
const https = require('node:https');
const dns = require('node:dns');
const out = [];
const tryGet = (url) => new Promise((done) => {
  const req = https.get(url, { timeout: 3000 }, () => { out.push('REACHED ' + url); req.destroy(); done(); });
  req.on('timeout', () => { out.push('blocked ' + url + ' (timeout)'); req.destroy(); done(); });
  req.on('error', (e) => { out.push('blocked ' + url + ' (' + e.code + ')'); done(); });
});
(async () => {
  await tryGet(${JSON.stringify(`https://lambda.${region}.amazonaws.com/`)});
  await tryGet('https://example.com/');
  await tryGet('https://1.1.1.1/');
  await new Promise((done) => dns.resolve4('example.com', (e) => {
    out.push(e ? 'blocked dns (' + e.code + ')' : 'REACHED dns'); done();
  }));
  console.log(out.join('\\n'));
})();`;
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
