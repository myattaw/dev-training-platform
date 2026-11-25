import type { BuildDiagnostic, WebRunnerFramework } from './protocol';

/** Where projects are unpacked inside the containers. */
const PROJECT_ROOT = '/tmp/app/';

/**
 * Extracts compiler errors from build output (untrusted text: only matched
 * fields are kept, each bounded), with project-relative file paths so the
 * editor can mark them.
 *
 * - dotnet:  `/tmp/app/Services/X.cs(31,9): error CS1002: ; expected [/tmp/app/App.csproj]`
 * - javac:   `src/main/java/com/x/Y.java:12: error: ';' expected`
 * - Python (run.sh's syntax check):  `app/views.py:4:7: error: SyntaxError: invalid syntax`
 */
export function parseDiagnostics(
  framework: WebRunnerFramework,
  lines: readonly string[],
): BuildDiagnostic[] {
  const found: BuildDiagnostic[] = [];
  const seen = new Set<string>();
  const add = (d: BuildDiagnostic): void => {
    const key = `${d.file}:${d.line}:${d.column}:${d.message}`;
    if (seen.has(key) || found.length >= 50) return;
    seen.add(key);
    found.push(d);
  };
  for (const line of lines) {
    if (framework === 'aspnetcore') {
      const m = /^(.+?)\((\d+),(\d+)\): error ([A-Z]+\d+): (.*?)(?: \[[^\]]*\])?$/.exec(
        line.trim(),
      );
      if (m) {
        add({
          file: relative(m[1] ?? ''),
          line: Number(m[2]),
          column: Number(m[3]),
          message: `${m[4]}: ${m[5]}`.slice(0, 500),
        });
      } else if (/error [A-Z]+\d+:/.test(line)) {
        add({ message: line.trim().slice(0, 500) });
      }
    } else {
      const m = /^(.+?\.(?:java|py)):(\d+):(?:(\d+):)? error: (.*)$/.exec(line.trim());
      if (m) {
        add({
          file: relative(m[1] ?? ''),
          line: Number(m[2]),
          ...(m[3] ? { column: Number(m[3]) } : {}),
          message: (m[4] ?? '').slice(0, 500),
        });
      }
    }
  }
  if (found.length === 0) {
    // No structured errors (e.g. a Django import error during migrate): show the tail.
    const tail = lines
      .filter((l) => l.trim() !== '')
      .slice(-8)
      .join('\n');
    found.push({ message: tail.slice(0, 2000) || 'The build failed without an error message.' });
  }
  return found;
}

function relative(path: string): string | undefined {
  const normalized = path.replace(/\\/g, '/');
  const rel = normalized.startsWith(PROJECT_ROOT)
    ? normalized.slice(PROJECT_ROOT.length)
    : normalized;
  return /^[A-Za-z0-9_\-./]{1,200}$/.test(rel) && !rel.includes('..') ? rel : undefined;
}
