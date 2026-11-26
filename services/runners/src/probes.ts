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

/** Node.js in every web runner image (all are built on the Lambda Node.js base). */
const IMAGE_NODE = '/var/lang/bin/node';

/**
 * The same probe application for each web runner framework: `GET /` answers
 * "ok", `POST /probe` runs the body as a Node.js script and answers with its
 * output. `spring` is what the runner needs to start a Spring Boot project.
 */
export function webProbeApp(framework: 'aspnetcore' | 'spring-boot' | 'django'): {
  readonly files: Record<string, string>;
  readonly spring?: { readonly mainClass: string; readonly librarySet: 'core' };
} {
  switch (framework) {
    case 'django':
      return { files: webProbeProject() };
    case 'aspnetcore':
      return {
        files: {
          'Probe.csproj': [
            '<Project Sdk="Microsoft.NET.Sdk.Web">',
            '  <PropertyGroup>',
            '    <TargetFramework>net10.0</TargetFramework>',
            '    <Nullable>enable</Nullable>',
            '    <ImplicitUsings>enable</ImplicitUsings>',
            '    <InvariantGlobalization>true</InvariantGlobalization>',
            '  </PropertyGroup>',
            '</Project>',
            '',
          ].join('\n'),
          'Program.cs': [
            'using System.Diagnostics;',
            '',
            'var app = WebApplication.CreateBuilder(args).Build();',
            'app.MapGet("/", () => "ok");',
            'app.MapPost("/probe", async (HttpRequest request) =>',
            '{',
            '    using var reader = new StreamReader(request.Body);',
            '    var script = await reader.ReadToEndAsync();',
            '    try',
            '    {',
            `        var start = new ProcessStartInfo("${IMAGE_NODE}") { RedirectStandardOutput = true, UseShellExecute = false };`,
            '        start.ArgumentList.Add("-e");',
            '        start.ArgumentList.Add(script);',
            '        using var process = Process.Start(start)!;',
            '        var output = await process.StandardOutput.ReadToEndAsync();',
            '        if (!process.WaitForExit(8000)) process.Kill(true);',
            '        return Results.Text(output, "text/plain");',
            '    }',
            '    catch (Exception e)',
            '    {',
            '        return Results.Text("PROBE-FAILED " + e.Message, "text/plain");',
            '    }',
            '});',
            'app.Run();',
            '',
          ].join('\n'),
        },
      };
    case 'spring-boot':
      return {
        spring: { mainClass: 'com.pracstack.probe.ProbeApplication', librarySet: 'core' },
        files: {
          'src/main/java/com/pracstack/probe/ProbeApplication.java': [
            'package com.pracstack.probe;',
            '',
            'import java.nio.charset.StandardCharsets;',
            'import java.util.concurrent.TimeUnit;',
            'import org.springframework.boot.SpringApplication;',
            'import org.springframework.boot.autoconfigure.SpringBootApplication;',
            'import org.springframework.web.bind.annotation.GetMapping;',
            'import org.springframework.web.bind.annotation.PostMapping;',
            'import org.springframework.web.bind.annotation.RequestBody;',
            'import org.springframework.web.bind.annotation.RestController;',
            '',
            '@SpringBootApplication',
            '@RestController',
            'public class ProbeApplication {',
            '    public static void main(String[] args) {',
            '        SpringApplication.run(ProbeApplication.class, args);',
            '    }',
            '',
            '    @GetMapping("/")',
            '    public String ok() {',
            '        return "ok";',
            '    }',
            '',
            '    @PostMapping(value = "/probe", produces = "text/plain")',
            '    public String probe(@RequestBody String script) {',
            '        try {',
            `            Process process = new ProcessBuilder("${IMAGE_NODE}", "-e", script)`,
            '                .redirectError(ProcessBuilder.Redirect.DISCARD)',
            '                .start();',
            '            String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);',
            '            if (!process.waitFor(8, TimeUnit.SECONDS)) process.destroyForcibly();',
            '            return output;',
            '        } catch (Exception e) {',
            '            return "PROBE-FAILED " + e.getMessage();',
            '        }',
            '    }',
            '}',
            '',
          ].join('\n'),
        },
      };
  }
}

/** Counts processes whose environment can be read and holds Lambda's settings (shows the credential check is real). */
export const READABLE_ENVIRON_PROBE = `
const fs = require('node:fs');
let readable = 0;
for (const pid of fs.readdirSync('/proc').filter((n) => /^[0-9]+$/.test(n))) {
  try { if (fs.readFileSync('/proc/' + pid + '/environ', 'utf8').includes('AWS_LAMBDA_FUNCTION_NAME=')) readable++; } catch {}
}
console.log(readable);`;

/**
 * Identifies the execution environment (its init process's start time and the
 * boot id) and reports what an earlier run left behind. With `plant`, it also
 * leaves a detached process and a file in /tmp for the next run to find.
 */
export function leftoverProbe(plant: boolean): string {
  return `
const fs = require('node:fs');
const cp = require('node:child_process');
${
  plant
    ? "const s = cp.spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); s.on('error', () => {}); s.unref(); fs.writeFileSync('/tmp/pracstack-planted.txt', 'x');"
    : ''
}
const stat = fs.readFileSync('/proc/1/stat', 'utf8');
const id = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] + '/' + fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
const cmds = fs.readdirSync('/proc').filter((n) => /^[0-9]+$/.test(n)).map((p) => { try { return fs.readFileSync('/proc/' + p + '/cmdline', 'utf8'); } catch { return ''; } });
console.log(JSON.stringify({ id, file: ${plant ? 'false' : "fs.existsSync('/tmp/pracstack-planted.txt')"}, sleepers: ${plant ? 0 : "cmds.filter((c) => c.startsWith('sleep')).length"} }));`;
}

/** The request that runs `script` in a webProbeProject application. */
export const webProbeRequest = (script: string) => ({
  method: 'POST' as const,
  path: '/probe',
  headers: { 'content-type': 'text/plain' },
  body: script,
});
