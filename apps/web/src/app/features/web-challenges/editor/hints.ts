import type { WebDiagnostic } from '@pracstack/api-contracts';
import { importLine } from './imports';
import { closestName, type NameFix } from './names';
import { JAVA_LANG, type ProjectLanguage, SYMBOLS } from './symbols';
import { languageOfPath, projectSymbols, type ProjectSymbol } from './project-symbols';

/** The name a compiler said it could not find, in each language's wording. */
function unknownName(language: ProjectLanguage, message: string): string | undefined {
  const pattern =
    language === 'java'
      ? /^cannot find symbol: ([A-Za-z_$][\w$]*)$/
      : language === 'csharp'
        ? /^CS(?:0103|0246): The (?:name|type or namespace name) '([A-Za-z_]\w*)'/
        : /NameError: name '([A-Za-z_]\w*)' is not defined/;
  return pattern.exec(message)?.[1];
}

export interface ExplainedDiagnostic extends WebDiagnostic {
  /** The quick fix the hint describes, if there is one. */
  readonly fix?: NameFix;
}

/**
 * A build error with a hint added when the compiler could not find a name: the
 * import it needs (a known class that is not imported), or the known name it
 * was most likely meant to be (`ResponseBody.ok` → "Did you mean ResponseEntity?").
 * Uses the project as it is now, to look at the code the error points at.
 */
export function explainDiagnostic(
  diagnostic: WebDiagnostic,
  files: Readonly<Record<string, string>>,
  symbols: readonly ProjectSymbol[] = projectSymbols(files).symbols,
): ExplainedDiagnostic {
  const language = diagnostic.file ? languageOfPath(diagnostic.file) : undefined;
  if (!language) return diagnostic;
  const name = unknownName(language, diagnostic.message);
  if (!name) return diagnostic;

  // How the name is used where the error points: as an annotation or attribute
  // (`@X`, `[X]`), or with a member after it (`X.ok`).
  const source = (files[diagnostic.file ?? ''] ?? '').split('\n')[(diagnostic.line ?? 0) - 1] ?? '';
  const at = locate(source, name, diagnostic.column);
  const annotation = at > 0 && /[@[]\s*$/.test(source.slice(0, at));
  const member =
    at >= 0 ? /^\s*\.\s*([A-Za-z_]\w*)/.exec(source.slice(at + name.length))?.[1] : undefined;

  const index = SYMBOLS[language];
  const matchesUse = (kind: string) =>
    language === 'python' || (kind === 'annotation') === annotation;
  const exact = [
    ...symbols.filter((s) => s.name === name && !s.nested),
    ...index.filter((s) => s.name === name && matchesUse(s.kind)),
  ];
  if (exact.length === 1) {
    const target = exact[0]!;
    return {
      ...diagnostic,
      message: `${diagnostic.message}. Missing import: ${importLine(language, target, diagnostic.file)}`,
      fix: { kind: 'import', target: { name, module: target.module } },
    };
  }
  if (exact.length > 1) return diagnostic;

  const candidates = [
    ...symbols.map((s) => s.name),
    ...index.filter((s) => matchesUse(s.kind)).map((s) => s.name),
    ...(language === 'java' ? JAVA_LANG : []),
  ];
  const suggestion = closestName(name, candidates, {
    withMember: (c) =>
      member !== undefined &&
      index.some((s) => s.name === c && s.members.some((m) => m.name === member)),
  });
  if (!suggestion) return diagnostic;
  const target = [...symbols.filter((s) => !s.nested), ...index].find((s) => s.name === suggestion);
  return {
    ...diagnostic,
    message: `${diagnostic.message}. Did you mean ${suggestion}?`,
    fix: {
      kind: 'replace',
      with: suggestion,
      ...(target ? { target: { name: suggestion, module: target.module } } : {}),
    },
  };
}

/** Where `name` stands as a whole word in `line`: at `column` if it is there, else the first. */
function locate(line: string, name: string, column: number | undefined): number {
  const word = new RegExp(`(?<![\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g');
  const all = [...line.matchAll(word)].map((m) => m.index);
  if (column !== undefined) {
    const near = all.find((i) => i <= column - 1 && column - 1 < i + name.length);
    if (near !== undefined) return near;
  }
  return all[0] ?? -1;
}
