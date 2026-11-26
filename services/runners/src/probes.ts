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

/**
 * A minimal Django project for the web runner functions: POST /probe runs the
 * request body as a Node.js script (the runner images have Node.js) and
 * answers with its output, so the same probes as above run inside a web runner.
 * `manage.py` honors two test switches in the project itself (`STARTUP`):
 * "exit" (runserver exits at once) and "hang" (runserver never listens).
 */
export function webProbeProject(
  startup: 'normal' | 'exit' | 'hang' = 'normal',
): Record<string, string> {
  return {
    'manage.py': [
      'import os, sys, time',
      `STARTUP = ${JSON.stringify(startup)}`,
      "if __name__ == '__main__':",
      "    if 'runserver' in sys.argv and STARTUP == 'exit':",
      '        sys.exit(3)',
      "    if 'runserver' in sys.argv and STARTUP == 'hang':",
      '        time.sleep(3600)',
      "    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')",
      '    from django.core.management import execute_from_command_line',
      '    execute_from_command_line(sys.argv)',
      '',
    ].join('\n'),
    'config/__init__.py': '',
    'config/settings.py': [
      "SECRET_KEY = 'probe-only'",
      'DEBUG = False',
      "ALLOWED_HOSTS = ['*']",
      "ROOT_URLCONF = 'config.urls'",
      'INSTALLED_APPS = []',
      'MIDDLEWARE = []',
      "DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': '/tmp/probe.sqlite3'}}",
      'USE_TZ = True',
      '',
    ].join('\n'),
    'config/urls.py': [
      'import subprocess',
      'from django.http import HttpResponse',
      'from django.urls import path',
      '',
      'def probe(request):',
      '    try:',
      "        out = subprocess.run(['node', '-e', request.body.decode()], capture_output=True, timeout=8).stdout.decode()",
      '    except Exception as e:',
      "        out = 'PROBE-FAILED ' + str(e)",
      "    return HttpResponse(out, content_type='text/plain')",
      '',
      'def memory(request):',
      "    hog = b'x' * (3 * 1024 * 1024 * 1024)  # written, so it is resident",
      '    return HttpResponse(str(len(hog)))',
      '',
      "urlpatterns = [path('probe', probe), path('memory', memory), path('', lambda r: HttpResponse('ok'))]",
      '',
    ].join('\n'),
  };
}

/** The request that runs `script` in a webProbeProject application. */
export const webProbeRequest = (script: string) => ({
  method: 'POST' as const,
  path: '/probe',
  headers: { 'content-type': 'text/plain' },
  body: script,
});
