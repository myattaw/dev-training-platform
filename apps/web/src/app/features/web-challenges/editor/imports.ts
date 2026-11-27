import { csharpNamespace, javaPackage, pythonModule } from './project-symbols';
import { CSHARP_IMPLICIT, type ProjectLanguage } from './symbols';

/** What to import: a simple name and where it comes from. */
export interface ImportTarget {
  readonly name: string;
  readonly module: string;
  /** Python: `import <name>` rather than `from <module> import <name>`. */
  readonly plainImport?: boolean;
}

/** A text edit, 1-based like Monaco's ranges (an insertion has start = end). */
export interface TextEdit {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly text: string;
}

export interface ImportContext {
  /** The file being edited, project-relative. */
  readonly path: string;
  /** C#: `global using` namespaces of the project. */
  readonly globalUsings?: ReadonlySet<string>;
}

/** The import line a target needs in this language (for hints and quick fixes). */
export function importLine(language: ProjectLanguage, target: ImportTarget, fromPath = ''): string {
  switch (language) {
    case 'java':
      return `import ${target.module}.${target.name};`;
    case 'csharp':
      return `using ${target.module};`;
    case 'python':
      return target.plainImport
        ? `import ${target.name}`
        : `from ${pythonImportModule(target.module, fromPath)} import ${target.name}`;
  }
}

/**
 * The edit that imports `target` into `text`, or undefined when nothing is needed:
 * already imported, in the same package or namespace, or visible without an import.
 * The new line goes after the last existing import, keeping the file's layout.
 */
export function importEdit(
  language: ProjectLanguage,
  text: string,
  target: ImportTarget,
  context: ImportContext,
): TextEdit | undefined {
  const lines = text.split('\n');
  switch (language) {
    case 'java': {
      const pkg = javaPackage(text);
      if (target.module === 'java.lang' || target.module === pkg) return undefined;
      const exact = new RegExp(
        `^\\s*import\\s+${escape(target.module)}\\.(?:${escape(target.name)}|\\*)\\s*;`,
        'm',
      );
      // Another class with this simple name already imported: importing would clash.
      const clash = new RegExp(`^\\s*import\\s+[\\w.]+\\.${escape(target.name)}\\s*;`, 'm');
      if (exact.test(text) || clash.test(text)) return undefined;
      return insertAfter(lines, /^\s*import\s/, /^\s*package\s/, importLine('java', target));
    }
    case 'csharp': {
      const ns = csharpNamespace(text);
      const visible =
        CSHARP_IMPLICIT.has(target.module) ||
        context.globalUsings?.has(target.module) === true ||
        ns === target.module ||
        ns.startsWith(`${target.module}.`) ||
        new RegExp(`^\\s*using\\s+${escape(target.module)}\\s*;`, 'm').test(text);
      if (visible) return undefined;
      return insertAfter(lines, /^\s*using\s+[\w.]+\s*;/, undefined, importLine('csharp', target));
    }
    case 'python': {
      const module = pythonImportModule(target.module, context.path);
      if (target.plainImport) {
        if (new RegExp(`^import\\s+${escape(target.name)}\\s*$`, 'm').test(text)) return undefined;
        return insertAfter(lines, /^(?:import|from)\s/, undefined, `import ${target.name}`);
      }
      if (pythonModule(context.path) === target.module) return undefined;
      // `from module import a, b` already there: add the name to it.
      const fromLine = new RegExp(`^from\\s+${escape(module)}\\s+import\\s+([^()#\\n]+?)\\s*$`);
      for (let i = 0; i < lines.length; i++) {
        const m = fromLine.exec(lines[i] ?? '');
        if (!m) continue;
        const names = (m[1] ?? '').split(',').map((n) => n.trim().split(/\s+as\s+/)[0]);
        if (names.includes(target.name) || names.includes('*')) return undefined;
        const end = (lines[i] ?? '').trimEnd().length + 1;
        return {
          startLine: i + 1,
          startColumn: end,
          endLine: i + 1,
          endColumn: end,
          text: `, ${target.name}`,
        };
      }
      return insertAfter(
        lines,
        /^(?:import|from)\s/,
        undefined,
        `from ${module} import ${target.name}`,
      );
    }
  }
}

/**
 * The module as this file imports it: a sibling module in the same package is
 * imported relatively (`from .models import Employee`), as the projects do.
 */
function pythonImportModule(module: string, fromPath: string): string {
  const own = pythonModule(fromPath).split('.');
  const target = module.split('.');
  const samePackage =
    fromPath !== '' &&
    own.length > 1 &&
    target.length === own.length &&
    own.slice(0, -1).join('.') === target.slice(0, -1).join('.');
  return samePackage ? `.${target[target.length - 1]}` : module;
}

/**
 * Inserts `line` after the last line matching `after`; with none, after the
 * `fallback` line (with a blank line between) or at the top of the file.
 */
function insertAfter(
  lines: readonly string[],
  after: RegExp,
  fallback: RegExp | undefined,
  line: string,
): TextEdit {
  let last = -1;
  lines.forEach((l, i) => {
    if (after.test(l)) last = i;
  });
  if (last >= 0) {
    const end = (lines[last] ?? '').length + 1;
    return {
      startLine: last + 1,
      startColumn: end,
      endLine: last + 1,
      endColumn: end,
      text: `\n${line}`,
    };
  }
  const anchor = fallback ? lines.findIndex((l) => fallback.test(l)) : -1;
  if (anchor >= 0) {
    const end = (lines[anchor] ?? '').length + 1;
    return {
      startLine: anchor + 1,
      startColumn: end,
      endLine: anchor + 1,
      endColumn: end,
      text: `\n\n${line}`,
    };
  }
  const blank = (lines[0] ?? '').trim() === '' ? '\n' : '\n\n';
  return { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1, text: `${line}${blank}` };
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
