import type { ProjectLanguage, SymbolKind } from './symbols';

/** A class (or module-level function, in Python) declared in the learner's project. */
export interface ProjectSymbol {
  readonly name: string;
  /** Package, namespace or module it is imported from. */
  readonly module: string;
  readonly kind: SymbolKind;
  readonly path: string;
  /** Declared inside another type: visible by name, but not offered for import. */
  readonly nested: boolean;
}

export interface ProjectSymbols {
  readonly symbols: readonly ProjectSymbol[];
  /** C#: namespaces imported for every file (`global using X;`). */
  readonly globalUsings: ReadonlySet<string>;
}

export const languageOfPath = (path: string): ProjectLanguage | undefined =>
  path.endsWith('.java')
    ? 'java'
    : path.endsWith('.cs')
      ? 'csharp'
      : path.endsWith('.py')
        ? 'python'
        : undefined;

/** Java: `package x.y;` of a file; '' when it has none. */
export const javaPackage = (text: string): string =>
  /^\s*package\s+([\w.]+)\s*;/m.exec(text)?.[1] ?? '';

/** C#: the file's namespace (file-scoped or block); '' when it has none. */
export const csharpNamespace = (text: string): string =>
  /^\s*namespace\s+([\w.]+)\s*[;{]?/m.exec(text)?.[1] ?? '';

/** Python: the module a file is imported as (`employees/models.py` → `employees.models`). */
export const pythonModule = (path: string): string =>
  path
    .replace(/\.py$/, '')
    .replace(/\/__init__$/, '')
    .split('/')
    .join('.');

const JAVA_DECLARATION =
  /^([ \t]*)(?:(?:public|protected|private|abstract|final|static|sealed|non-sealed|strictfp)\s+)*(class|interface|enum|record|@interface)\s+([A-Za-z_$][\w$]*)/gm;
const CSHARP_DECLARATION =
  /^([ \t]*)(?:(?:public|internal|protected|private|abstract|sealed|static|partial|readonly|file|unsafe|new)\s+)*(class|interface|enum|struct|record(?:\s+struct|\s+class)?)\s+([A-Za-z_]\w*)/gm;

const kindOf = (keyword: string): SymbolKind =>
  keyword === 'interface'
    ? 'interface'
    : keyword === 'enum'
      ? 'enum'
      : keyword === '@interface'
        ? 'annotation'
        : 'class';

/** Every class (Java, C#) or top-level class and function (Python) in the project's files. */
export function projectSymbols(files: Readonly<Record<string, string>>): ProjectSymbols {
  const symbols: ProjectSymbol[] = [];
  const globalUsings = new Set<string>();
  for (const [path, text] of Object.entries(files)) {
    const language = languageOfPath(path);
    if (language === 'java' || language === 'csharp') {
      const module = language === 'java' ? javaPackage(text) : csharpNamespace(text);
      const pattern = language === 'java' ? JAVA_DECLARATION : CSHARP_DECLARATION;
      // The first declaration is a top-level one (inside a C# block namespace it is
      // indented once); anything indented deeper is nested in another type.
      let topIndent: number | undefined;
      for (const m of text.matchAll(pattern)) {
        const indent = (m[1] ?? '').replace(/\t/g, '    ').length;
        topIndent ??= indent;
        symbols.push({
          name: m[3] ?? '',
          module,
          kind: kindOf(m[2] ?? ''),
          path,
          nested: indent > topIndent,
        });
      }
      if (language === 'csharp') {
        for (const g of text.matchAll(/^\s*global\s+using\s+(?!static\b)([\w.]+)\s*;/gm)) {
          globalUsings.add(g[1] ?? '');
        }
      }
    } else if (language === 'python') {
      const module = pythonModule(path);
      for (const m of text.matchAll(/^(class|def)\s+([A-Za-z_]\w*)/gm)) {
        symbols.push({
          name: m[2] ?? '',
          module,
          kind: m[1] === 'class' ? 'class' : 'function',
          path,
          nested: false,
        });
      }
    }
  }
  return { symbols, globalUsings };
}
