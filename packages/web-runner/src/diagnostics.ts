import type { BuildDiagnostic, WebRunnerFramework } from './protocol';

/** Where projects are unpacked inside the containers. */
const PROJECT_ROOT = '/tmp/app/';

/**
 * Extracts compiler errors from build output (untrusted text: only matched
 * fields are kept, each bounded), with project-relative file paths so the
 * editor can mark them.
 *
 * - dotnet:  `/tmp/app/Services/X.cs(31,9): error CS1002: ; expected [/tmp/app/App.csproj]`
 * - javac:   `src/main/java/com/x/Y.java:12: error: cannot find symbol`, followed by the
 *            source line, a caret line (`   ^`, which gives the column) and, for unknown
 *            names, `symbol:` and `location:` lines, which name what was not found
 * - Python (run.sh's syntax check):  `app/views.py:4:7: error: SyntaxError: invalid syntax`
 * - Python tracebacks (e.g. a NameError while Django loads the app during migrate):
 *            the last `File "/tmp/app/x.py", line N` frame and the final `XError: …` line
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
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
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
      continue;
    }
    const m = /^(.+?\.(?:java|py)):(\d+):(?:(\d+):)? error: (.*)$/.exec(line.trim());
    if (!m) continue;
    let column = m[3] ? Number(m[3]) : undefined;
    let message = m[4] ?? '';
    if (framework === 'spring-boot') {
      // javac's detail lines, up to the next error: the caret gives the column, and
      // `symbol:` / `location:` say what could not be found, and where it was looked for.
      let symbol: string | undefined;
      let location: string | undefined;
      for (let j = i + 1; j < lines.length && j <= i + 6; j++) {
        const detail = lines[j] ?? '';
        if (/\.(?:java):\d+: (?:error|warning):/.test(detail.trim())) break;
        const caret = /^(\s*)\^\s*$/.exec(detail);
        if (caret && column === undefined) column = (caret[1] ?? '').length + 1;
        const s = /^\s*symbol:\s+(.+)$/.exec(detail);
        if (s) symbol = s[1]?.trim();
        const l = /^\s*location:\s+(.+)$/.exec(detail);
        if (l) location = l[1]?.trim();
      }
      if (symbol) message = `${message}: ${describeSymbol(symbol, location)}`;
    }
    add({
      file: relative(m[1] ?? ''),
      line: Number(m[2]),
      ...(column !== undefined ? { column } : {}),
      message: message.slice(0, 500),
    });
  }
  if (found.length === 0 && framework === 'django') {
    const error = pythonTraceback(lines);
    if (error) add(error);
  }
  if (found.length === 0) {
    // No structured errors (e.g. a Django settings error during migrate): show the tail.
    const tail = lines
      .filter((l) => l.trim() !== '')
      .slice(-8)
      .join('\n');
    found.push({ message: tail.slice(0, 2000) || 'The build failed without an error message.' });
  }
  return found;
}

/**
 * javac's `symbol:` line as the learner needs it: a variable or class by its bare
 * name (`ResponseBody`), anything else with its kind (`method fndById(long)`), and for
 * a member, the type it was looked for in (`location: variable employees of type
 * EmployeeService` → `in EmployeeService`).
 */
function describeSymbol(symbol: string, location: string | undefined): string {
  const bare = /^(?:variable|class)\s+([A-Za-z_$][\w$]*)$/.exec(symbol);
  const what = bare ? (bare[1] ?? symbol) : symbol;
  if (bare || !location) return what;
  const type =
    /\bof type\s+([\w$.<>, ]+)$/.exec(location)?.[1] ??
    /^(?:class|interface|enum|record)\s+([\w$.<>, ]+)$/.exec(location)?.[1];
  return type ? `${what} in ${type.trim()}` : what;
}

/** The last project frame and the error line of a Python traceback, if there is one. */
function pythonTraceback(lines: readonly string[]): BuildDiagnostic | undefined {
  let start = -1;
  lines.forEach((l, i) => {
    if (l.startsWith('Traceback (most recent call last)')) start = i;
  });
  if (start < 0) return undefined;
  let file: string | undefined;
  let line: number | undefined;
  let message: string | undefined;
  for (const l of lines.slice(start + 1)) {
    const frame = /^\s*File "([^"]+)", line (\d+)/.exec(l);
    if (frame) {
      const rel = relativeProjectFile(frame[1] ?? '');
      if (rel) {
        file = rel;
        line = Number(frame[2]);
      }
      continue;
    }
    if (/^[A-Za-z_][\w.]*(?:Error|Exception)\b/.test(l)) message = l.trim();
  }
  if (!message) return undefined;
  return {
    ...(file ? { file, line } : {}),
    message: message.slice(0, 500),
  };
}

/** A path inside the project (not the standard library or a package), relative. */
function relativeProjectFile(path: string): string | undefined {
  const normalized = path.replace(/\\/g, '/');
  if (!normalized.startsWith(PROJECT_ROOT)) return undefined;
  return relative(normalized);
}

function relative(path: string): string | undefined {
  const normalized = path.replace(/\\/g, '/');
  const rel = normalized.startsWith(PROJECT_ROOT)
    ? normalized.slice(PROJECT_ROOT.length)
    : normalized;
  return /^[A-Za-z0-9_\-./]{1,200}$/.test(rel) && !rel.includes('..') ? rel : undefined;
}
