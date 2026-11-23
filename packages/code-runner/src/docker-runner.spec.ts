import type { TestInput } from '@pracstack/challenge-runtime';
import { beforeAll, describe, expect, it } from 'vitest';
import { DockerCodeRunner } from './docker-runner';
import { interpret } from './interpret';
import type { CodeRunResult, RunnerLanguage } from './protocol';

/*
 * Integration and security tests against real containers. They need Docker
 * and the runner images (`npm run runners:build`). Without them the tests
 * fail loudly; set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip them deliberately.
 */
const skip = process.env['PRACSTACK_SKIP_DOCKER_TESTS'] === '1';
const runner = new DockerCodeRunner({
  limits: {
    typescript: { timeoutMs: 8000 },
    java: { timeoutMs: 12_000 },
    csharp: { timeoutMs: 12_000 },
  },
  maxConcurrent: 3,
});

beforeAll(async () => {
  if (skip) return;
  const status = await runner.check();
  if (!status.ok) {
    throw new Error(
      `${status.message} (set PRACSTACK_SKIP_DOCKER_TESTS=1 to skip the container tests)`,
    );
  }
}, 60_000);

const call = (...input: unknown[]): TestInput => ({ kind: 'call', input });
const run = (
  language: RunnerLanguage,
  code: string,
  entryPoint: string,
  tests: TestInput[] = [call('ab')],
) => runner.run({ language, code, entryPoint, tests });

const completed = (result: CodeRunResult) => {
  if (result.kind !== 'completed')
    throw new Error(`expected completed, got ${JSON.stringify(result)}`);
  return result;
};

describe.skipIf(skip)('TypeScript runner', { timeout: 60_000 }, () => {
  it('runs code and returns raw values and logs', async () => {
    const result = completed(
      await run(
        'typescript',
        `export function rev(s: string): string { console.log('called', s); return [...s].reverse().join(''); }`,
        'rev',
      ),
    );
    expect(result.outcomes).toEqual([{ kind: 'call', value: 'ba' }]);
    expect(result.logs).toEqual(['called ab']);
  });

  it('reports type errors with positions', async () => {
    const result = await run(
      'typescript',
      'export function rev(s: string): string {\n  return 42;\n}',
      'rev',
    );
    expect(result).toMatchObject({
      kind: 'compile-error',
      diagnostics: [{ line: 2, message: expect.stringContaining("'number' is not assignable") }],
    });
  });

  it('reports errors thrown by the code, and a missing export', async () => {
    const thrown = completed(
      await run(
        'typescript',
        `export function rev(s: string): string { throw new Error('nope'); }`,
        'rev',
      ),
    );
    expect(thrown.outcomes).toEqual([{ kind: 'call', error: 'Error: nope' }]);
    expect(await run('typescript', 'export function other() {}', 'rev')).toMatchObject({
      kind: 'load-error',
    });
  });

  it('runs class-style operations tests', async () => {
    const code = `export class Counter { n = 0; inc(): number { return ++this.n; } }`;
    const result = completed(
      await run('typescript', code, 'Counter', [
        {
          kind: 'operations',
          constructorArgs: [],
          steps: [
            { call: 'inc', args: [] },
            { call: 'inc', args: [] },
          ],
        },
      ]),
    );
    expect(result.outcomes).toEqual([{ kind: 'operations', values: [1, 2] }]);
  });
});

describe.skipIf(skip)('TypeScript runner isolation', { timeout: 60_000 }, () => {
  // The submission is TypeScript; `any` casts reach Node APIs the way an attacker would.
  const attempt = (body: string) =>
    run(
      'typescript',
      `declare const require: any; declare const process: any; declare const globalThis: any;\nexport function f(s: string): string {\n${body}\n}`,
      'f',
    );

  it('has no network access', async () => {
    const result = completed(
      await attempt(`
        const cp = (globalThis as any).process.getBuiltinModule('child_process');
        const out = cp.spawnSync('node', ['-e', "require('net').connect(80, '1.1.1.1').on('error', e => { console.log(e.code); process.exit(0) }).on('connect', () => { console.log('CONNECTED'); process.exit(0) })"], { encoding: 'utf8', timeout: 4000 });
        return String(out.stdout).trim();`),
    );
    const value = (result.outcomes[0] as { value?: string }).value ?? '';
    expect(value).not.toContain('CONNECTED');
    expect(value).toMatch(/ENETUNREACH|EAI_AGAIN|ECONNREFUSED|EHOSTUNREACH|^$/);
  });

  it('cannot write outside /tmp, and cannot read host environment variables', async () => {
    process.env['PRACSTACK_HOST_SECRET'] = 'should-not-leak';
    const result = completed(
      await attempt(`
        const fs = (globalThis as any).process.getBuiltinModule('fs');
        let write = 'ok';
        try { fs.writeFileSync('/harness/evil.txt', 'x'); } catch (e: any) { write = e.code; }
        const env = JSON.stringify((globalThis as any).process.env);
        const uid = (globalThis as any).process.getuid();
        return write + '|' + (env.includes('should-not-leak') ? 'LEAKED' : 'clean') + '|' + uid;`),
    );
    expect((result.outcomes[0] as { value?: string }).value).toBe('EROFS|clean|10001');
  });

  it('stops infinite loops at the time limit', async () => {
    const started = Date.now();
    expect(await attempt('while (true) {}')).toEqual({ kind: 'timeout', timeoutMs: 8000 });
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  it('stops memory bombs', async () => {
    // Real allocations: "x".repeat(n) is a shared rope in V8, so pushing those
    // grew the heap by only bytes per iteration and hit the limit after seconds of GC.
    const result = await attempt(
      'const a: number[][] = []; while (true) a.push(new Array<number>(1_000_000).fill(a.length));',
    );
    expect(result).toMatchObject({
      kind: 'resource-limit',
      message: expect.stringContaining('too much memory'),
    });
  });

  it('contains fork bombs with the process limit', async () => {
    const result = await attempt(`
      const cp = (globalThis as any).process.getBuiltinModule('child_process');
      let failures = 0;
      for (let i = 0; i < 200; i++) { try { cp.spawn('sleep', ['30']); } catch { failures++; } }
      return 'spawned';`);
    // Either the spawns fail (pids limit) or the run is cut off; the host is unaffected.
    expect(['completed', 'timeout', 'load-error', 'resource-limit']).toContain(result.kind);
    // The runner still works afterwards.
    expect(
      completed(await run('typescript', 'export function f(s: string) { return s; }', 'f'))
        .outcomes,
    ).toEqual([{ kind: 'call', value: 'ab' }]);
  });

  it('stops output floods', async () => {
    const result = await attempt(`
      const out = (globalThis as any).process.stdout;
      for (let i = 0; i < 100000; i++) out.write('x'.repeat(1000));
      return s;`);
    expect(result).toMatchObject({
      kind: 'resource-limit',
      message: expect.stringContaining('too much output'),
    });
  });

  it('cannot forge a result line, and exiting early yields no results', async () => {
    const forged = completed(
      await attempt(`
        (globalThis as any).process.stdout.write('\\n<<PRACSTACK-0000>>{"kind":"completed","outcomes":[{"kind":"call","value":"forged"}],"logs":[]}\\n');
        return 'real';`),
    );
    expect(forged.outcomes).toEqual([{ kind: 'call', value: 'real' }]);

    expect(await attempt('(globalThis as any).process.exit(0); return s;')).toMatchObject({
      kind: 'load-error',
      message: expect.stringContaining('stopped before reporting'),
    });
  });
});

describe.skipIf(skip)('Java runner', { timeout: 60_000 }, () => {
  it('compiles and runs static methods, converting arguments and results', async () => {
    const code = `class Solution {
      static int[][] merge(int[][] intervals) { System.out.println("n=" + intervals.length); return intervals; }
    }`;
    const result = completed(
      await run('java', code, 'merge', [
        call([
          [1, 2],
          [3, 4],
        ]),
      ]),
    );
    expect(result.outcomes).toEqual([
      {
        kind: 'call',
        value: [
          [1, 2],
          [3, 4],
        ],
      },
    ]);
    expect(result.logs).toEqual(['n=2']);
  });

  it('supports strings, booleans, lists and public classes', async () => {
    const code = `import java.util.*;
      public class Tools {
        public static boolean has(String s, char c) { return s.indexOf(c) >= 0; }
        public static List<Integer> doubled(List<Integer> xs) { List<Integer> out = new ArrayList<>(); for (int x : xs) out.add(x * 2); return out; }
      }`;
    expect(
      completed(await run('java', code, 'has', [call('abc', 'b'), call('abc', 'z')])).outcomes,
    ).toEqual([
      { kind: 'call', value: true },
      { kind: 'call', value: false },
    ]);
    expect(completed(await run('java', code, 'doubled', [call([1, 2, 3])])).outcomes).toEqual([
      { kind: 'call', value: [2, 4, 6] },
    ]);
  });

  it('runs class-style operations tests, with void methods', async () => {
    const code = `class Counter { private int n; Counter(int start) { n = start; } int inc() { return ++n; } void reset() { n = 0; } }`;
    const result = completed(
      await run('java', code, 'Counter', [
        {
          kind: 'operations',
          constructorArgs: [5],
          steps: [
            { call: 'inc', args: [] },
            { call: 'reset', args: [] },
            { call: 'inc', args: [] },
          ],
        },
      ]),
    );
    expect(result.outcomes).toEqual([
      { kind: 'operations', values: [6, { $pracstack: 'undefined' }, 1] },
    ]);
  });

  it('reports compile errors and exceptions', async () => {
    expect(
      await run('java', 'class Solution { static int f(String s) { return s; } }', 'f'),
    ).toMatchObject({
      kind: 'compile-error',
      diagnostics: [{ line: 1, message: expect.stringContaining('incompatible types') }],
    });
    const thrown = completed(
      await run(
        'java',
        'class Solution { static int f(String s) { throw new IllegalStateException("nope"); } }',
        'f',
      ),
    );
    expect(thrown.outcomes).toEqual([{ kind: 'call', error: 'IllegalStateException: nope' }]);
  });

  it('stops infinite loops, and System.exit yields no results', async () => {
    expect(
      await run('java', 'class Solution { static int f(String s) { while (true) {} } }', 'f'),
    ).toEqual({
      kind: 'timeout',
      timeoutMs: 12_000,
    });
    expect(
      await run(
        'java',
        'class Solution { static String f(String s) { System.exit(0); return s; } }',
        'f',
      ),
    ).toMatchObject({
      kind: 'load-error',
    });
  });

  it('cannot write outside /tmp', async () => {
    const code = `import java.nio.file.*;
      class Solution { static String f(String s) {
        try { Files.writeString(Path.of("/harness/evil.txt"), "x"); return "WROTE"; } catch (Exception e) { return e.getClass().getSimpleName(); }
      } }`;
    expect(completed(await run('java', code, 'f')).outcomes).toEqual([
      { kind: 'call', value: 'FileSystemException' },
    ]);
  });
});

describe.skipIf(skip)('C# runner', { timeout: 60_000 }, () => {
  const csharp = (body: string, tests: TestInput[] = [call('ab')]) =>
    run(
      'csharp',
      `public static class Solution { public static object F(string s) { ${body} } }`,
      'f',
      tests,
    );
  const value = (result: CodeRunResult) =>
    (completed(result).outcomes[0] as { value?: unknown }).value;

  it('compiles and runs static methods, converting arguments and results', async () => {
    const code = `public static class Solution {
      public static int[][] Merge(int[][] intervals) { Console.WriteLine($"n={intervals.Length}"); return intervals; }
    }`;
    // A shared test names the method "merge"; C#'s "Merge" is found too.
    const result = completed(
      await run('csharp', code, 'merge', [
        call([
          [1, 2],
          [3, 4],
        ]),
      ]),
    );
    expect(result.outcomes).toEqual([
      {
        kind: 'call',
        value: [
          [1, 2],
          [3, 4],
        ],
      },
    ]);
    expect(result.logs).toEqual(['n=2']);
  });

  it('supports strings, chars, booleans, lists, dictionaries, tuples, nulls and doubles', async () => {
    const code = `public class Tools {
      public static bool Has(string s, char c) => s.Contains(c);
      public static List<int> Doubled(IReadOnlyList<int> xs) => xs.Select(x => x * 2).ToList();
      public static Dictionary<string, int> Counts(IEnumerable<string> words) =>
        words.GroupBy(w => w).ToDictionary(g => g.Key, g => g.Count());
      public static (int Min, int Max) Range(int[] xs) => (xs.Min(), xs.Max());
      public static string? Maybe(int? n) => n is null ? null : $"#{n}";
      public static double Half(decimal d) => (double)(d / 2);
    }`;
    const outcomes = async (entry: string, ...tests: TestInput[]) =>
      completed(await run('csharp', code, entry, tests)).outcomes;
    expect(await outcomes('Has', call('abc', 'b'), call('abc', 'z'))).toEqual([
      { kind: 'call', value: true },
      { kind: 'call', value: false },
    ]);
    expect(await outcomes('Doubled', call([1, 2, 3]))).toEqual([
      { kind: 'call', value: [2, 4, 6] },
    ]);
    expect(await outcomes('Counts', call(['a', 'b', 'a']))).toEqual([
      { kind: 'call', value: { a: 2, b: 1 } },
    ]);
    expect(await outcomes('Range', call([3, 1, 2]))).toEqual([{ kind: 'call', value: [1, 3] }]);
    expect(await outcomes('Maybe', call(null), call(4))).toEqual([
      { kind: 'call', value: null },
      { kind: 'call', value: '#4' },
    ]);
    expect(await outcomes('Half', call(5))).toEqual([{ kind: 'call', value: 2.5 }]);
  });

  it('runs class-style operations tests, with void and async methods', async () => {
    const code = `public class Counter(int start) {
      private int _n = start;
      public int Inc() => ++_n;
      public void Reset() => _n = 0;
      public async Task<int> SlowValueAsync() { await Task.Delay(5); return _n; }
    }`;
    const result = completed(
      await run('csharp', code, 'Counter', [
        {
          kind: 'operations',
          constructorArgs: [5],
          steps: [
            { call: 'inc', args: [] },
            { call: 'reset', args: [] },
            { call: 'Inc', args: [] },
            { call: 'slowValueAsync', args: [] },
          ],
        },
      ]),
    );
    expect(result.outcomes).toEqual([
      { kind: 'operations', values: [6, { $pracstack: 'undefined' }, 1, 1] },
    ]);
  });

  it('reports compile errors with positions, exceptions, and a missing method', async () => {
    expect(
      await run('csharp', 'class Solution {\n  static int F(string s) { return s; }\n}', 'f'),
    ).toMatchObject({
      kind: 'compile-error',
      diagnostics: [{ line: 2, column: 35, message: expect.stringContaining('CS0029') }],
    });
    expect(
      completed(
        await run(
          'csharp',
          'class S { static int F(string s) => throw new InvalidOperationException("nope"); }',
          'f',
        ),
      ).outcomes,
    ).toEqual([{ kind: 'call', error: 'InvalidOperationException: nope' }]);
    expect(await run('csharp', 'class S { static int G(string s) => 1; }', 'f')).toMatchObject({
      kind: 'load-error',
      message: expect.stringContaining('static method named "f"'),
    });
  });

  it('has no network access', async () => {
    const result = await csharp(`
      try { using var c = new System.Net.Sockets.TcpClient(); c.Connect("1.1.1.1", 80); return "CONNECTED"; }
      catch (Exception e) { return e.GetType().Name; }`);
    expect(value(result)).toBe('SocketException');
  });

  it('cannot write outside /tmp, and cannot read host environment variables', async () => {
    process.env['PRACSTACK_HOST_SECRET'] = 'should-not-leak';
    const result = await csharp(`
      string write;
      try { System.IO.File.WriteAllText("/harness/evil.txt", "x"); write = "WROTE"; } catch (Exception e) { write = e.GetType().Name; }
      var env = string.Join(",", Environment.GetEnvironmentVariables().Values.Cast<object>());
      return write + "|" + (env.Contains("should-not-leak") ? "LEAKED" : "clean") + "|" + Environment.UserName;`);
    expect(value(result)).toMatch(/^(UnauthorizedAccessException|IOException)\|clean\|/);
  });

  it('stops infinite loops at the time limit', async () => {
    const started = Date.now();
    expect(await csharp('while (true) { } ')).toEqual({ kind: 'timeout', timeoutMs: 12_000 });
    expect(Date.now() - started).toBeLessThan(20_000);
  });

  it('stops memory bombs', async () => {
    const result = await csharp(`
      var keep = new List<long[]>();
      while (true) { var a = new long[1_000_000]; Array.Fill(a, keep.Count); keep.Add(a); }`);
    // .NET reads the container's memory limit and usually throws OutOfMemoryException
    // first (the test fails with that error); if not, the kernel kills the container.
    if (result.kind === 'completed') {
      expect(result.outcomes).toEqual([
        { kind: 'call', error: expect.stringMatching(/^OutOfMemoryException/) },
      ]);
    } else {
      expect(result).toMatchObject({
        kind: 'resource-limit',
        message: expect.stringContaining('too much memory'),
      });
    }
  });

  it('contains fork bombs with the process limit, and the runner still works afterwards', async () => {
    const result = await csharp(`
      var started = 0;
      for (var i = 0; i < 300; i++) { try { System.Diagnostics.Process.Start("sleep", "30"); started++; } catch { } }
      return started;`);
    expect(['completed', 'timeout', 'load-error', 'resource-limit']).toContain(result.kind);
    if (result.kind === 'completed') expect(value(result)).toBeLessThan(300);
    expect(value(await csharp('return s;'))).toBe('ab');
  });

  it('stops output floods', async () => {
    const result = await csharp(`
      var stdout = Console.OpenStandardOutput();
      var line = System.Text.Encoding.ASCII.GetBytes(new string('x', 1000));
      for (var i = 0; i < 100_000; i++) stdout.Write(line);
      return s;`);
    expect(result).toMatchObject({
      kind: 'resource-limit',
      message: expect.stringContaining('too much output'),
    });
  });

  it('runs whole programs in $program mode (content checks), capturing output and errors', async () => {
    const program = (code: string) =>
      run('csharp', code, '$program', [{ kind: 'call', input: [] }]);
    const printed = completed(
      await program('Console.WriteLine(new Point(1, 2));\nrecord Point(int X, int Y);'),
    );
    expect(printed.logs).toEqual(['Point { X = 1, Y = 2 }']);
    const threw = completed(await program('int[] a = [];\nConsole.WriteLine(a[1]);'));
    expect(threw.outcomes).toEqual([
      { kind: 'call', error: expect.stringMatching(/^IndexOutOfRangeException/) },
    ]);
  });

  it('hosts ASP.NET Core on loopback only: real HTTP requests work, the outside world does not', async () => {
    const code = `using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
var builder = WebApplication.CreateSlimBuilder();
builder.Logging.ClearProviders();
builder.WebHost.UseUrls("http://127.0.0.1:5080");
var app = builder.Build();
app.MapGet("/orders/{id:int}", (int id) => id == 1 ? Results.Ok(new { id }) : Results.NotFound());
await app.StartAsync();
using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
foreach (var path in new[] { "/orders/1", "/orders/2", "/orders/abc" })
    Console.WriteLine((int)(await http.GetAsync("http://127.0.0.1:5080" + path)).StatusCode);
try { await http.GetAsync("http://1.1.1.1/"); Console.WriteLine("REACHED"); }
catch (HttpRequestException) { Console.WriteLine("no network"); }
await app.StopAsync();`;
    const result = completed(await run('csharp', code, '$program', [{ kind: 'call', input: [] }]));
    expect(result.logs).toEqual(['200', '404', '404', 'no network']);
  });

  it('cannot forge a result line; exiting early or overflowing the stack yields no results', async () => {
    const forged = await csharp(`
      var stdout = new System.IO.StreamWriter(Console.OpenStandardOutput());
      stdout.Write("\\n<<PRACSTACK-0000>>{\\"kind\\":\\"completed\\",\\"outcomes\\":[{\\"kind\\":\\"call\\",\\"value\\":\\"forged\\"}],\\"logs\\":[]}\\n");
      stdout.Flush();
      return "real";`);
    expect(value(forged)).toBe('real');
    expect(await csharp('Environment.Exit(0); return s;')).toMatchObject({
      kind: 'load-error',
      message: expect.stringContaining('stopped before reporting'),
    });
    const overflow = await run(
      'csharp',
      'public static class Solution { static int Down(int n) => Down(n + 1) + 1; public static int F(string s) => Down(0); }',
      'f',
    );
    expect(['load-error', 'resource-limit']).toContain(overflow.kind);
  });
});

describe('interpret', () => {
  const nonce = '<<N>>';
  it('reads only the line with the nonce', () => {
    expect(
      interpret(`noise\n${nonce}{"kind":"load-error","message":"m","logs":[]}\n`, nonce, 0, '', 1),
    ).toEqual({
      kind: 'load-error',
      message: 'm',
      logs: [],
    });
  });

  it('maps exit codes to outcomes', () => {
    expect(interpret('', nonce, 137, '', 1).kind).toBe('resource-limit');
    expect(
      interpret(
        '',
        nonce,
        134,
        'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
        1,
      ).kind,
    ).toBe('resource-limit');
    expect(interpret('', nonce, 125, 'Unable to find image', 1).kind).toBe('unavailable');
    expect(interpret('', nonce, 0, '', 1).kind).toBe('load-error');
  });

  it('rejects results of the wrong shape, or claiming a different number of tests', () => {
    const done = (outcomes: unknown[]) =>
      `${nonce}${JSON.stringify({ kind: 'completed', outcomes, logs: [] })}
`;
    expect(interpret(done([{ kind: 'call', value: 1 }]), nonce, 0, '', 1).kind).toBe('completed');
    expect(interpret(done([{ kind: 'call', value: 1 }]), nonce, 0, '', 2).kind).toBe('load-error');
    expect(interpret(done([{ kind: 'bogus' }]), nonce, 0, '', 1).kind).toBe('load-error');
    // A harness never reports "unavailable" or "timeout"; forged ones are rejected.
    expect(interpret(`${nonce}{"kind":"unavailable","message":"x"}`, nonce, 0, '', 1).kind).toBe(
      'load-error',
    );
  });
});
