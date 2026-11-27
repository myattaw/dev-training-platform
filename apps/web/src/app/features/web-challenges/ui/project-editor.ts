import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type * as Monaco from 'monaco-editor';
import { loadMonaco, MONACO_THEME, type MonacoApi } from '../../../shared/editor/monaco-loader';
import { hasSyntaxCheck, SyntaxChecker } from '../../../shared/editor/syntax-checker';
import { attachModel, registerProjectAssist, setFix } from '../editor/assist';
import type { ExplainedDiagnostic } from '../editor/hints';
import { findJavaMemberProblems } from '../editor/members';
import { findJavaNameProblems } from '../editor/names';
import { projectSymbols } from '../editor/project-symbols';
import { monacoLanguage } from './labels';

export interface EditorFile {
  readonly path: string;
  readonly editable: boolean;
}

const MARKER_OWNER = 'pracstack-build';
/** Markers of the checks run as you type: class names (Java) and syntax (Java, C#). */
const NAMES_OWNER = 'pracstack-names';
const SYNTAX_OWNER = 'pracstack-syntax';
const CHECK_DELAY_MS = 400;

/**
 * A Monaco editor over a whole project: one model per file, with a stable URI
 * (`file:///<namespace>/<path>`), its own undo history, and its own cursor and
 * scroll position (view state) when switching files. Read-only files cannot be
 * changed. Build errors from the server are shown as markers in their file.
 *
 * No language server: suggestions (with automatic imports), quick fixes and the
 * checks while typing (unknown or unimported class names in Java, syntax in
 * Java and C#) run in the browser from a fixed list (see ../editor/).
 *
 * Models are created for every file up front and all disposed when the
 * component is destroyed (or the namespace changes), so nothing leaks.
 */
@Component({
  selector: 'app-project-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #host class="host"></div>
    @if (failed()) {
      <div class="overlay" role="alert">
        <p>The editor could not be loaded. Check your connection and try again.</p>
        <button type="button" class="btn btn--sm" (click)="retry()">Try again</button>
      </div>
    } @else if (!ready()) {
      <div class="overlay" role="status">Loading editor…</div>
    }
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      min-height: 0;
    }
    .host {
      position: absolute;
      inset: 0;
    }
    .overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary);
    }
  `,
})
export class ProjectEditor {
  /** Distinguishes projects (challenge + framework) so their models never mix. */
  readonly namespace = input.required<string>();
  readonly files = input.required<readonly EditorFile[]>();
  /** Current content per path (two-way through `changed`). */
  readonly contents = input.required<Readonly<Record<string, string>>>();
  readonly activePath = input.required<string>();
  readonly readOnly = input(false);
  readonly diagnostics = input<readonly ExplainedDiagnostic[]>([]);
  /** A line to reveal in the active file (e.g. after clicking a build error). */
  readonly revealLine = input<number | undefined>(undefined);

  readonly changed = output<{ readonly path: string; readonly content: string }>();
  readonly runRequested = output<void>();

  protected readonly ready = signal(false);
  protected readonly failed = signal(false);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private monaco: MonacoApi | undefined;
  private editor: Monaco.editor.IStandaloneCodeEditor | undefined;
  private models = new Map<string, Monaco.editor.ITextModel>();
  private viewStates = new Map<string, Monaco.editor.ICodeEditorViewState | null>();
  private current: string | undefined;
  private destroyed = false;
  private applying = false;
  private checkTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly syntax = inject(SyntaxChecker);

  constructor() {
    afterNextRender(() => void this.init());

    // (Re)create the models when the project changes.
    effect(() => {
      const ns = this.namespace();
      const files = this.files();
      if (this.ready()) untracked(() => this.syncModels(ns, files));
    });

    // Switch the visible model, keeping each file's cursor and scroll position.
    effect(() => {
      const path = this.activePath();
      this.namespace();
      if (this.ready()) untracked(() => this.show(path));
    });

    // Push external content changes (reset, draft recovery) into the models.
    effect(() => {
      const contents = this.contents();
      if (!this.ready()) return;
      untracked(() => {
        this.applying = true;
        for (const [path, model] of this.models) {
          const text = contents[path];
          if (text !== undefined && model.getValue() !== text) model.setValue(text);
        }
        this.applying = false;
      });
    });

    effect(() => {
      const readOnly = this.readOnly();
      const path = this.activePath();
      if (!this.ready()) return;
      const file = untracked(() => this.files().find((f) => f.path === path));
      this.editor?.updateOptions({
        readOnly: readOnly || !file?.editable,
        readOnlyMessage: {
          value: readOnly
            ? 'The session has ended.'
            : 'This file is part of the project template and cannot be edited.',
        },
      });
    });

    effect(() => {
      const diagnostics = this.diagnostics();
      if (this.ready()) untracked(() => this.showDiagnostics(diagnostics));
    });

    effect(() => {
      const line = this.revealLine();
      this.activePath();
      if (line && this.ready()) {
        untracked(() => {
          this.editor?.revealLineInCenter(line);
          this.editor?.setPosition({ lineNumber: line, column: 1 });
          this.editor?.focus();
        });
      }
    });

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.checkTimer);
      this.disposeModels();
      this.editor?.dispose();
    });
  }

  protected retry(): void {
    this.failed.set(false);
    void this.init();
  }

  /** Opens Monaco's find-and-replace widget in the active file. */
  findReplace(): void {
    void this.editor?.getAction('editor.action.startFindReplaceAction')?.run();
  }

  private async init(): Promise<void> {
    let monaco: MonacoApi;
    try {
      monaco = await loadMonaco();
    } catch (err) {
      console.error(err);
      if (!this.destroyed) this.failed.set(true);
      return;
    }
    if (this.destroyed) return;
    this.monaco = monaco;
    registerProjectAssist(monaco);
    this.editor = monaco.editor.create(this.host().nativeElement, {
      theme: MONACO_THEME,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      lineHeight: 20,
      fontFamily: "'Cascadia Code', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      overviewRulerBorder: false,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      tabSize: 4,
      scrollBeyondLastLine: false,
      fixedOverflowWidgets: true,
      padding: { top: 8, bottom: 8 },
    });
    this.editor.onDidChangeModelContent(() => {
      if (this.applying || !this.current) return;
      const model = this.editor?.getModel();
      if (model) this.changed.emit({ path: this.current, content: model.getValue() });
      this.scheduleCheck();
    });
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
      this.runRequested.emit(),
    );
    this.syncModels(this.namespace(), this.files());
    this.show(this.activePath());
    this.ready.set(true);
  }

  private uri(ns: string, path: string): Monaco.Uri {
    return (this.monaco as MonacoApi).Uri.parse(`file:///${encodeURIComponent(ns)}/${path}`);
  }

  private syncModels(ns: string, files: readonly EditorFile[]): void {
    const monaco = this.monaco;
    if (!monaco) return;
    const wanted = new Set(files.map((f) => this.uri(ns, f.path).toString()));
    const stale = [...this.models.values()].some((m) => !wanted.has(m.uri.toString()));
    if (stale) {
      this.editor?.setModel(null);
      this.current = undefined;
      this.disposeModels();
    }
    const contents = this.contents();
    for (const file of files) {
      if (this.models.has(file.path)) continue;
      const uri = this.uri(ns, file.path);
      // A model left over (e.g. a previous visit) is replaced: content comes from the draft.
      monaco.editor.getModel(uri)?.dispose();
      const model = monaco.editor.createModel(
        contents[file.path] ?? '',
        monacoLanguage(file.path),
        uri,
      );
      attachModel(model, file.path, () => this.contents());
      this.models.set(file.path, model);
    }
  }

  private show(path: string): void {
    const editor = this.editor;
    const model = this.models.get(path);
    if (!editor || !model || this.current === path) return;
    if (this.current) this.viewStates.set(this.current, editor.saveViewState());
    this.current = path;
    editor.setModel(model);
    const state = this.viewStates.get(path);
    if (state) editor.restoreViewState(state);
    this.showDiagnostics(this.diagnostics());
    this.scheduleCheck();
  }

  private showDiagnostics(diagnostics: readonly ExplainedDiagnostic[]): void {
    const monaco = this.monaco;
    if (!monaco) return;
    for (const [path, model] of this.models) {
      const shown = diagnostics.filter((d) => d.file === path && d.line !== undefined);
      const markers = shown.map((d): Monaco.editor.IMarkerData => {
        const line = Math.min(Math.max(1, d.line ?? 1), model.getLineCount());
        const column = Math.min(Math.max(1, d.column ?? 1), model.getLineMaxColumn(line));
        const word = model.getWordAtPosition({ lineNumber: line, column });
        return {
          severity: monaco.MarkerSeverity.Error,
          message: d.message,
          startLineNumber: line,
          startColumn: word?.startColumn ?? 1,
          endLineNumber: line,
          endColumn: word?.endColumn ?? model.getLineMaxColumn(line),
        };
      });
      monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
      markers.forEach((marker, i) => {
        const fix = shown[i]?.fix;
        if (fix) setFix(model, marker, fix);
      });
    }
  }

  private scheduleCheck(): void {
    clearTimeout(this.checkTimer);
    this.checkTimer = setTimeout(() => void this.checkActive(), CHECK_DELAY_MS);
  }

  /** The checks while typing, on the visible file, once typing pauses. */
  private async checkActive(): Promise<void> {
    const monaco = this.monaco;
    const path = this.current;
    const model = path ? this.models.get(path) : undefined;
    if (!monaco || !path || !model) return;
    const language = model.getLanguageId();
    const code = model.getValue();
    const version = model.getVersionId();

    const files = { ...this.contents(), [path]: code };
    const problems =
      language === 'java'
        ? [
            ...findJavaNameProblems(code, projectSymbols(files).symbols),
            ...findJavaMemberProblems(files, path),
          ]
        : [];
    const markers = problems.map((p): Monaco.editor.IMarkerData => ({
      severity:
        p.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
      message: p.message,
      source: 'PracStack',
      startLineNumber: p.line,
      startColumn: p.startColumn,
      endLineNumber: p.line,
      endColumn: p.endColumn,
    }));
    monaco.editor.setModelMarkers(model, NAMES_OWNER, markers);
    problems.forEach((p, i) => {
      if (p.fix && markers[i]) setFix(model, markers[i], p.fix);
    });

    if (!hasSyntaxCheck(language)) return;
    // Syntax errors only: the file's own declarations are not all its names here.
    const errors = await this.syntax.check(language, code, { names: false });
    // Only if nothing changed meanwhile (a newer check is on its way otherwise).
    if (this.destroyed || model.isDisposed() || model.getVersionId() !== version) return;
    monaco.editor.setModelMarkers(
      model,
      SYNTAX_OWNER,
      errors.map((d) => {
        const line = Math.min(Math.max(1, d.line), model.getLineCount());
        const column = Math.min(Math.max(1, d.column), model.getLineMaxColumn(line));
        const word = model.getWordAtPosition({ lineNumber: line, column });
        const end = Math.min(column + 1, model.getLineMaxColumn(line));
        return {
          severity: monaco.MarkerSeverity.Error,
          message: d.message,
          source: 'syntax',
          startLineNumber: line,
          startColumn: word?.startColumn ?? (end > column ? column : Math.max(1, column - 1)),
          endLineNumber: line,
          endColumn: word?.endColumn ?? (end > column ? end : column),
        };
      }),
    );
  }

  private disposeModels(): void {
    for (const model of this.models.values()) model.dispose();
    this.models = new Map();
    this.viewStates = new Map();
  }
}
