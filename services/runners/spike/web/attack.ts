/**
 * PHASE 0 SPIKE: hostile project against the Lambda-style Django image, in one
 * warm environment (like Lambda reusing it for the next user):
 *
 *  1. scans every process's environment for AWS credentials and reports them;
 *  2. leaves a detached background process and a file in /tmp;
 *  then a second, clean invocation shows whether anything survived.
 *
 *   npx tsx services/runners/spike/web/attack.ts
 */
import { execFileSync } from 'node:child_process';
import { WEB_CHALLENGES } from '@pracstack/content/web-challenges';
import { assembleProject, tarProject } from '@pracstack/web-runner';

const impl = WEB_CHALLENGES[0]!.source.implementations.find((i) => i.framework === 'django')!;
const hostile = `
import os, socket, subprocess, json
from django.http import HttpResponse
from django.urls import include, path

def creds(request):
    found = []
    for pid in os.listdir('/proc'):
        if not pid.isdigit(): continue
        try:
            env = open(f'/proc/{pid}/environ', 'rb').read().split(b'\\0')
        except Exception:
            continue
        found += [f'{pid}:{e.split(b"=")[0].decode()}' for e in env if e.startswith(b'AWS_') and b'=' in e and e.split(b'=',1)[1]]
    return HttpResponse(json.dumps(found), content_type='application/json')

def plant(request):
    subprocess.Popen(['sleep', '600'], start_new_session=True)
    open('/tmp/planted.txt', 'w').write('left behind')
    return HttpResponse('planted')

def survivors(request):
    procs = [open(f'/proc/{p}/cmdline','rb').read().replace(b'\\0', b' ').decode() for p in os.listdir('/proc') if p.isdigit()]
    return HttpResponse(json.dumps({'planted_file': os.path.exists('/tmp/planted.txt'), 'sleepers': [c for c in procs if c.startswith('sleep')]}), content_type='application/json')

urlpatterns = [path('api/', include('employees.urls')), path('creds', creds), path('plant', plant), path('survivors', survivors)]
`;

const fw = 'django';
const id = execFileSync('docker', [
  'run',
  '-d',
  '--rm',
  '-p',
  '127.0.0.1:19000:9000',
  '--user',
  '993:990',
  '--read-only',
  '--mount',
  'type=volume,dst=/tmp',
  '--memory',
  '2048m',
  '--cpus',
  '1.16',
  '-e',
  'AWS_ACCESS_KEY_ID=AKIAFAKEPRACSTACKTEST',
  '-e',
  'AWS_SECRET_ACCESS_KEY=fake-secret',
  '-e',
  'AWS_SESSION_TOKEN=fake-token',
  `pracstack-lambda-web-${fw}:spike`,
])
  .toString()
  .trim();
await new Promise((r) => setTimeout(r, 1500));
const invoke = async (paths: string[]) => {
  const res = await fetch('http://127.0.0.1:19000/2015-03-31/functions/function/invocations', {
    method: 'POST',
    body: JSON.stringify({
      tar: tarProject(assembleProject(impl.starter, { 'config/urls.py': hostile })).toString(
        'base64',
      ),
      sequences: [paths.map((p) => ({ method: 'GET', path: p }))],
    }),
  });
  return (await res.json()) as {
    kind: string;
    leftoversAtStart: unknown;
    results: { body?: string }[][];
  };
};
try {
  const first = await invoke(['/creds', '/plant', '/survivors']);
  console.log(
    'run 1:',
    first.kind,
    first.results?.[0]?.map((r) => r.body),
  );
  const second = await invoke(['/survivors', '/creds']);
  console.log(
    'run 2: leftovers found (and killed) before the run:',
    JSON.stringify(second.leftoversAtStart),
  );
  console.log(
    'run 2:',
    second.kind,
    second.results?.[0]?.map((r) => r.body),
  );
} finally {
  execFileSync('docker', ['rm', '-f', id]);
}
