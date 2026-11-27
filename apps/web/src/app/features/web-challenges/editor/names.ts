import type { ProjectSymbol } from './project-symbols';
import { JAVA_LANG, type SymbolEntry, SYMBOLS } from './symbols';

/** A fix the editor can offer for a problem (a quick fix, Ctrl+.). */
export type NameFix =
  | { readonly kind: 'import'; readonly target: { name: string; module: string } }
  | {
      readonly kind: 'replace';
      readonly with: string;
      /** The replacement also needs this import. */
      readonly target?: { name: string; module: string };
    };

export interface NameProblem {
  readonly line: number;
  readonly startColumn: number;
  readonly endColumn: number;
  readonly name: string;
  readonly message: string;
  /** Certain (a missing import of a known class) or likely (an unknown name). */
  readonly severity: 'error' | 'warning';
  readonly fix?: NameFix;
}

/** Levenshtein distance, stopping early above `max`. */
export function editDistance(a: string, b: string, max = 8): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      row.push(v);
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length] ?? max + 1;
}

const commonPrefix = (a: string, b: string): number => {
  let i = 0;
  while (i < a.length && i < b.length && a[i]?.toLowerCase() === b[i]?.toLowerCase()) i++;
  return i;
};

/**
 * The known name `name` was most likely meant to be, if one is close enough:
 * a small edit away, or (when it is used as `Name.member`) one sharing a
 * prefix that has that member (`ResponseBody.ok` → `ResponseEntity`).
 */
export function closestName(
  name: string,
  candidates: Iterable<string>,
  options: { readonly withMember?: (candidate: string) => boolean } = {},
): string | undefined {
  const limit = name.length <= 4 ? 1 : name.length <= 8 ? 2 : 3;
  let best: { name: string; score: number } | undefined;
  for (const c of new Set(candidates)) {
    if (c === name) continue;
    const distance = editDistance(name.toLowerCase(), c.toLowerCase(), 8);
    let score: number | undefined;
    if (distance <= limit) score = distance;
    else if (options.withMember?.(c) && commonPrefix(name, c) >= 4)
      score = limit + 1 + distance / 10;
    if (score !== undefined && (!best || score < best.score)) best = { name: c, score };
  }
  return best?.name;
}

/**
 * Java source with comments, string, text-block and char literals replaced by
 * spaces (line breaks kept), so positions stay the same and only code is scanned.
 */
export function blankJava(text: string): string {
  let out = '';
  let i = 0;
  const blank = (s: string) => s.replace(/[^\n]/g, ' ');
  while (i < text.length) {
    const rest = text.slice(i, i + 3);
    let end = -1;
    if (rest.startsWith('//'))
      end = text.indexOf('\n', i) === -1 ? text.length : text.indexOf('\n', i);
    else if (rest.startsWith('/*')) end = (text.indexOf('*/', i + 2) + 1 || text.length - 1) + 1;
    else if (rest === '"""') end = (text.indexOf('"""', i + 3) + 1 || text.length - 2) + 2;
    else if (text[i] === '"' || text[i] === "'") {
      const quote = text[i];
      let j = i + 1;
      while (j < text.length && text[j] !== quote && text[j] !== '\n')
        j += text[j] === '\\' ? 2 : 1;
      end = Math.min(j + 1, text.length);
    }
    if (end > i) {
      out += blank(text.slice(i, end));
      i = end;
    } else {
      out += text[i];
      i++;
    }
  }
  return out;
}

/**
 * Class names a Java file uses that cannot compile: a known class that is not
 * imported (with the import as a fix), or a name that is neither imported,
 * declared in the project, nor in java.lang (with "did you mean" when a known
 * name is close). Checked in the browser as you type; the compiler stays the
 * judge, so an unknown name with no close match is only a warning.
 */
export function findJavaNameProblems(
  text: string,
  project: readonly ProjectSymbol[],
): NameProblem[] {
  const code = blankJava(text);
  const lines = code.split('\n');
  const pkg = /^\s*package\s+([\w.]+)\s*;/m.exec(code)?.[1] ?? '';

  const imported = new Set<string>();
  const wildcards = new Set<string>();
  for (const m of code.matchAll(/^\s*import\s+(static\s+)?([\w.]+?)(\.\*)?\s*;/gm)) {
    const path = m[2] ?? '';
    if (m[3]) {
      if (!m[1]) wildcards.add(path);
    } else {
      imported.add(path.slice(path.lastIndexOf('.') + 1));
    }
  }
  const index = SYMBOLS.java;
  // Names visible without an import: this file's and its package's types, nested
  // types anywhere (reached through their outer class), java.lang, wildcard imports.
  const visible = new Set<string>([...imported, ...JAVA_LANG]);
  for (const s of project) if (s.module === pkg || s.nested) visible.add(s.name);
  for (const m of code.matchAll(
    /\b(?:class|interface|enum|record|@interface)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    visible.add(m[1] ?? '');
  }
  // Type parameters: `class Box<T, ID extends X>` and generic methods `<K, V> Map<K, V> of(…)`
  // (a `<` that follows a space or modifier, not a type name).
  for (const m of code.matchAll(
    /(?:(?:class|interface|record)\s+[\w$]+\s*<([^>]*)>)|(?:(?:^|[\s;{}(])<([^<>]*)>\s+[\w$])/gm,
  )) {
    for (const p of (m[1] ?? m[2] ?? '').split(',')) visible.add(p.trim().split(/\s+/)[0] ?? '');
  }
  for (const w of wildcards) {
    for (const s of [...index, ...project]) if (s.module === w) visible.add(s.name);
  }
  const unknownWildcard = [...wildcards].some(
    (w) => ![...index, ...project].some((s) => s.module === w),
  );

  const known = [
    ...new Set([
      ...visible,
      ...index.map((s) => s.name),
      ...project.filter((s) => !s.nested).map((s) => s.name),
    ]),
  ];
  const problems: NameProblem[] = [];
  lines.forEach((line, i) => {
    if (/^\s*(?:package|import)\s/.test(line)) return;
    for (const m of line.matchAll(/(@?)\b([A-Z][A-Za-z0-9_$]*)\b/g)) {
      const name = m[2] ?? '';
      const at = m.index + (m[1] ?? '').length;
      // Qualified (`Map.Entry`, `java.util.List`) or a constant (`HttpStatus.OK`, `MAX`).
      if (/\.\s*$/.test(line.slice(0, at)) || /^[A-Z][A-Z0-9_$]*$/.test(name)) continue;
      if (visible.has(name)) continue;
      const annotation = m[1] === '@';
      const member = /^\s*\.\s*([A-Za-z_$][\w$]*)/.exec(line.slice(at + name.length))?.[1];
      const range = { line: i + 1, startColumn: at + 1, endColumn: at + name.length + 1 };

      const fromIndex = index.filter(
        (s) => s.name === name && (s.kind === 'annotation') === annotation,
      );
      const fromProject = project.filter((s) => s.name === name && !s.nested);
      const sources: { name: string; module: string }[] = [...fromProject, ...fromIndex];
      if (sources.length === 1 && !unknownWildcard) {
        const target = sources[0]!;
        problems.push({
          ...range,
          name,
          severity: 'error',
          message: `${name} is not imported. Add: import ${target.module}.${name};`,
          fix: { kind: 'import', target: { name, module: target.module } },
        });
        continue;
      }
      if (sources.length > 1 || unknownWildcard) continue;

      const hasMember = (candidate: string) =>
        member !== undefined &&
        index.some(
          (s: SymbolEntry) => s.name === candidate && s.members.some((x) => x.name === member),
        );
      const suggestion = closestName(
        name,
        known.filter((k) => {
          const entries = index.filter((s) => s.name === k);
          // An annotation is only a match for an annotation, and the other way around.
          return (
            entries.length === 0 || entries.some((s) => (s.kind === 'annotation') === annotation)
          );
        }),
        { withMember: hasMember },
      );
      if (suggestion) {
        const needsImport = !visible.has(suggestion);
        const target = needsImport
          ? [...project.filter((s) => !s.nested), ...index].find((s) => s.name === suggestion)
          : undefined;
        problems.push({
          ...range,
          name,
          severity: 'warning',
          message: `Unknown name ${name}. Did you mean ${suggestion}?`,
          fix: {
            kind: 'replace',
            with: suggestion,
            ...(target ? { target: { name: suggestion, module: target.module } } : {}),
          },
        });
      } else {
        problems.push({
          ...range,
          name,
          severity: 'warning',
          message: `Unknown name ${name}: it is not imported and not declared in this project.`,
        });
      }
    }
  });
  return problems;
}
