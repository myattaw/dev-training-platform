import type * as Monaco from 'monaco-editor';
import { BASIC_WORDS, projectModels } from '../../../shared/editor/completions';
import type { MonacoApi } from '../../../shared/editor/monaco-loader';
import { importEdit, importLine, type TextEdit } from './imports';
import { type ClassMember, membersAt } from './members';
import type { NameFix } from './names';
import { projectSymbols } from './project-symbols';
import {
  CSHARP_CONTROLLER_METHODS,
  JAVA_LANG,
  type ProjectLanguage,
  type SymbolEntry,
  type SymbolMember,
  SYMBOLS,
} from './symbols';

/*
 * Editor help for web-challenge projects (Monaco, in the browser, no server):
 * suggestions of the framework's classes and the project's own, each adding
 * its import when picked; members after `Name.`; and quick fixes (Ctrl+.) for
 * the problems the live check and the build report.
 */

interface ProjectModel {
  /** The file's project-relative path. */
  readonly path: string;
  /** The whole project's current contents. */
  readonly files: () => Readonly<Record<string, string>>;
}

const attached = new WeakMap<Monaco.editor.ITextModel, ProjectModel>();
/** Quick fixes per model, by marker position and message. */
const fixes = new WeakMap<Monaco.editor.ITextModel, Map<string, NameFix>>();

const fixKey = (line: number, column: number, message: string) => `${line}:${column}:${message}`;

/** Makes a model part of a project: project suggestions instead of the basic ones. */
export function attachModel(
  model: Monaco.editor.ITextModel,
  path: string,
  files: () => Readonly<Record<string, string>>,
): void {
  attached.set(model, { path, files });
  projectModels.add(model);
}

/** Remembers the quick fix offered for a marker (set with the same position and message). */
export function setFix(
  model: Monaco.editor.ITextModel,
  marker: { startLineNumber: number; startColumn: number; message: string },
  fix: NameFix,
): void {
  let map = fixes.get(model);
  if (!map) {
    map = new Map();
    fixes.set(model, map);
  }
  map.set(fixKey(marker.startLineNumber, marker.startColumn, marker.message), fix);
}

const languageOf = (model: Monaco.editor.ITextModel): ProjectLanguage | undefined => {
  const id = model.getLanguageId();
  return id === 'java' || id === 'csharp' || id === 'python' ? id : undefined;
};

/** The project with this model's unsaved text in it. */
function projectOf(
  model: Monaco.editor.ITextModel,
): { path: string; files: Record<string, string> } | undefined {
  const p = attached.get(model);
  if (!p) return undefined;
  return { path: p.path, files: { ...p.files(), [p.path]: model.getValue() } };
}

/** Members every object has, offered after a project class's own. */
const OBJECT_METHODS: Readonly<Record<'java' | 'csharp', readonly string[]>> = {
  java: ['equals', 'hashCode', 'toString'],
  csharp: ['Equals', 'GetHashCode', 'ToString'],
};

const toRange = (e: TextEdit): Monaco.IRange => ({
  startLineNumber: e.startLine,
  startColumn: e.startColumn,
  endLineNumber: e.endLine,
  endColumn: e.endColumn,
});

let registered = false;

/** Registers the suggestions and quick fixes once per page (Monaco providers are global). */
export function registerProjectAssist(monaco: MonacoApi): void {
  if (registered) return;
  registered = true;
  const { CompletionItemKind: Kind, CompletionItemInsertTextRule: Rule } = monaco.languages;
  const kindOf = (s: { kind: string }): Monaco.languages.CompletionItemKind =>
    ({
      interface: Kind.Interface,
      enum: Kind.Enum,
      annotation: Kind.Reference,
      function: Kind.Function,
      module: Kind.Module,
      constant: Kind.Constant,
    })[s.kind] ?? Kind.Class;

  for (const language of ['java', 'csharp', 'python'] as const) {
    monaco.languages.registerCompletionItemProvider(language, {
      triggerCharacters: ['.', '@'],
      provideCompletionItems(model, position) {
        const project = projectOf(model);
        if (!project || languageOf(model) !== language) return { suggestions: [] };
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const before = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
        const text = model.getValue();
        const index = SYMBOLS[language];
        const { symbols, globalUsings } = projectSymbols(project.files);

        const classMemberItem = (
          m: ClassMember,
          owner: string,
        ): Monaco.languages.CompletionItem => {
          const method = m.kind === 'method';
          return {
            label: { label: m.name, description: owner },
            kind: method
              ? Kind.Method
              : m.kind === 'constant'
                ? Kind.EnumMember
                : m.kind === 'property'
                  ? Kind.Property
                  : Kind.Field,
            insertText: method ? (m.params ? `${m.name}($0)` : `${m.name}()`) : m.name,
            ...(method && m.params ? { insertTextRules: Rule.InsertAsSnippet } : {}),
            detail: method ? `${m.type} ${m.name}(${m.params})` : `${m.type} ${m.name}`.trim(),
            sortText: `0${m.name}`,
            range,
          };
        };
        const objectItem = (name: string): Monaco.languages.CompletionItem => ({
          label: { label: name, description: 'Object' },
          kind: Kind.Method,
          insertText: name === 'equals' || name === 'Equals' ? `${name}($0)` : `${name}()`,
          insertTextRules: Rule.InsertAsSnippet,
          sortText: `1${name}`,
          range,
        });

        const memberItem = (m: SymbolMember, owner: string): Monaco.languages.CompletionItem => ({
          label: { label: m.name, description: owner },
          kind: m.method ? Kind.Method : Kind.Field,
          insertText: m.method ? `${m.name}($0)` : m.name,
          ...(m.method ? { insertTextRules: Rule.InsertAsSnippet } : {}),
          range,
        });

        if (/\.\s*$/.test(before)) {
          // After `expression.`: the members of the project class it is, when its
          // type can be read from the declarations (`request.` → the record's components).
          if (language !== 'python') {
            let dot =
              model.getOffsetAt({ lineNumber: position.lineNumber, column: word.startColumn }) - 1;
            while (dot > 0 && /\s/.test(text[dot] ?? '')) dot--;
            const found = membersAt(project.files, project.path, dot);
            if (found?.info) {
              const items = found.members.map((m) => classMemberItem(m, found.type ?? ''));
              if (!found.isStatic) items.push(...OBJECT_METHODS[language].map(objectItem));
              return { suggestions: items };
            }
          }

          // After `Name.`: a library class's (or module's) members.
          const owner = /([A-Za-z_$][\w$]*)\s*\.\s*$/.exec(before)?.[1];
          const entries = index.filter((s) => s.name === owner && s.members.length > 0);
          if (owner !== undefined && entries.length > 0) {
            return {
              suggestions: entries.flatMap((e) => e.members.map((m) => memberItem(m, owner))),
            };
          }
          // Anything else (a library type, an unknown one): the common members.
          const basic = language === 'python' ? undefined : BASIC_WORDS[language];
          return {
            suggestions: (basic?.members ?? []).map((label) => ({
              label,
              kind: Kind.Method,
              insertText: label,
              range,
            })),
          };
        }

        const annotationOnly =
          (language === 'java' && /@\s*$/.test(before)) ||
          (language === 'csharp' && /\[\s*(?:[\w.]+(?:\([^)]*\))?\s*,\s*)*$/.test(before));
        const wantsAnnotation = (kind: string) =>
          language === 'python' ? !annotationOnly : (kind === 'annotation') === annotationOnly;

        const importing = (target: {
          name: string;
          module: string;
          plainImport?: boolean;
        }): Monaco.languages.TextEdit[] => {
          const edit = importEdit(language, text, target, { path: project.path, globalUsings });
          return edit ? [{ range: toRange(edit), text: edit.text }] : [];
        };
        const symbolItem = (
          s: Pick<SymbolEntry, 'name' | 'module' | 'kind' | 'plainImport'>,
        ): Monaco.languages.CompletionItem => {
          const edits = importing(s);
          return {
            label: { label: s.name, description: s.module },
            kind: kindOf(s),
            insertText: s.name,
            detail: edits.length > 0 ? importLine(language, s, project.path) : s.module,
            additionalTextEdits: edits,
            range,
          };
        };

        const suggestions: Monaco.languages.CompletionItem[] = [
          ...index.filter((s) => wantsAnnotation(s.kind)).map(symbolItem),
          ...symbols
            .filter((s) => !s.nested && s.path !== project.path && wantsAnnotation(s.kind))
            .map(symbolItem),
        ];
        if (annotationOnly) return { suggestions };

        if (language === 'java') {
          for (const name of JAVA_LANG) {
            suggestions.push({
              label: { label: name, description: 'java.lang' },
              kind: Kind.Class,
              insertText: name,
              range,
            });
          }
        }
        if (language === 'csharp') {
          suggestions.push(
            ...CSHARP_CONTROLLER_METHODS.map((m) => memberItem(m, 'ControllerBase')),
          );
        }
        if (language !== 'python') {
          const basic = BASIC_WORDS[language];
          suggestions.push(
            ...basic.keywords.map((label) => ({
              label,
              kind: Kind.Keyword,
              insertText: label,
              range,
            })),
            ...basic.snippets.map((s) => ({
              label: s.label,
              kind: Kind.Snippet,
              detail: s.detail,
              insertText: s.body,
              insertTextRules: Rule.InsertAsSnippet,
              range,
            })),
          );
        }
        return { suggestions };
      },
    });

    monaco.languages.registerCodeActionProvider(language, {
      provideCodeActions(model, _range, context) {
        const project = projectOf(model);
        const map = fixes.get(model);
        if (!project || !map) return { actions: [], dispose: () => undefined };
        const { globalUsings } = projectSymbols(project.files);
        const text = model.getValue();
        const actions: Monaco.languages.CodeAction[] = [];
        for (const marker of context.markers) {
          const fix = map.get(fixKey(marker.startLineNumber, marker.startColumn, marker.message));
          if (!fix) continue;
          const edits: Monaco.languages.IWorkspaceTextEdit[] = [];
          const add = (range: Monaco.IRange, newText: string) =>
            edits.push({
              resource: model.uri,
              textEdit: { range, text: newText },
              versionId: model.getVersionId(),
            });
          let title: string;
          const target = fix.target;
          if (fix.kind === 'replace') {
            title = `Change to ${fix.with}`;
            add(
              {
                startLineNumber: marker.startLineNumber,
                startColumn: marker.startColumn,
                endLineNumber: marker.endLineNumber,
                endColumn: marker.endColumn,
              },
              fix.with,
            );
          } else {
            title = `Add ${importLine(language, fix.target, project.path).replace(/;$/, '')}`;
          }
          if (target) {
            const edit = importEdit(language, text, target, { path: project.path, globalUsings });
            if (edit) add(toRange(edit), edit.text);
          }
          if (edits.length === 0) continue;
          actions.push({
            title,
            kind: 'quickfix',
            diagnostics: [marker],
            isPreferred: true,
            edit: { edits },
          });
        }
        return { actions, dispose: () => undefined };
      },
    });
  }
}
