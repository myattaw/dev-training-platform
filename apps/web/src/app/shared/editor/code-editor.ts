import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type * as Monaco from 'monaco-editor';
import type { CompileDiagnostic } from './compile.models';
import { loadMonaco, MONACO_THEME, type MonacoApi } from './monaco-loader';

export type EditorLanguage = 'typescript' | 'java' | 'sql';

const LANGUAGES: Readonly<Record<EditorLanguage, { file: string; monacoId: string }>> = {
  typescript: { file: 'solution.ts', monacoId: 'typescript' },
  java: { file: 'Solution.java', monacoId: 'java' },
  sql: { file: 'query.sql', monacoId: 'pgsql' },
};

export type CompileResult =
  | { readonly ok: true; readonly js: string }
  | { readonly ok: false; readonly diagnostics: readonly CompileDiagnostic[] };

const ERROR_CATEGORY = 1;

/**
 * A Monaco-powered TypeScript editor.
 *
 * - `fileName` identifies the virtual file. Changing it swaps the Monaco model,
 *   so one editor instance can be reused when navigating between challenges.
 * - `code` is a two-way binding: `[(code)]="mySignal"`.
 * - `compile()` type-checks and transpiles the current code via Monaco's TS worker.
 */
@Component({
  selector: 'app-code-editor',
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
      padding: var(--space-4);
      color: var(--color-text-secondary);
      text-align: center;
    }
  `,
})
export class CodeEditor {
  readonly fileName = input.required<string>();
  /** `typescript` gets type checking and `compile()`; `sql` uses PostgreSQL highlighting. */
  readonly language = input<EditorLanguage>('typescript');
  readonly code = model.required<string>();
  /** Emitted on Ctrl/Cmd + Enter. */
  readonly runRequested = output<void>();

  protected readonly ready = signal(false);
  protected readonly failed = signal(false);

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private monaco: MonacoApi | undefined;
  private editor: Monaco.editor.IStandaloneCodeEditor | undefined;
  private destroyed = false;

  constructor() {
    // Monaco needs a real DOM element, so we wait until the view is rendered.
    afterNextRender(() => void this.initEditor());

    // Swap the model whenever the file changes (e.g. navigating to another challenge).
    effect(() => {
      const fileName = this.fileName();
      if (this.ready()) untracked(() => this.useModel(fileName));
    });

    // Push external code changes (e.g. "Reset") into the editor.
    effect(() => {
      const code = this.code();
      const model = this.ready() ? this.editor?.getModel() : null;
      if (model && model.getValue() !== code) model.setValue(code);
    });

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.editor?.getModel()?.dispose();
      this.editor?.dispose();
    });
  }

  async compile(): Promise<CompileResult> {
    const monaco = this.monaco;
    const model = this.editor?.getModel();
    if (!monaco || !model) {
      return {
        ok: false,
        diagnostics: [{ line: 1, column: 1, message: 'The editor is still loading.' }],
      };
    }

    const getWorker = await typeScriptWorker(monaco);
    const worker = await getWorker(model.uri);
    const file = model.uri.toString();

    const [syntactic, semantic] = await Promise.all([
      worker.getSyntacticDiagnostics(file),
      worker.getSemanticDiagnostics(file),
    ]);
    const errors = [...syntactic, ...semantic].filter((d) => d.category === ERROR_CATEGORY);
    if (errors.length > 0) {
      return {
        ok: false,
        diagnostics: errors.map((d) => {
          const pos = model.getPositionAt(d.start ?? 0);
          return {
            line: pos.lineNumber,
            column: pos.column,
            message: flattenMessage(d.messageText),
          };
        }),
      };
    }

    const output = await worker.getEmitOutput(file);
    const js = output.outputFiles.find((f) => f.name.endsWith('.js'))?.text;
    return js === undefined
      ? {
          ok: false,
          diagnostics: [{ line: 1, column: 1, message: 'TypeScript produced no output.' }],
        }
      : { ok: true, js };
  }

  protected retry(): void {
    this.failed.set(false);
    void this.initEditor();
  }

  private async initEditor(): Promise<void> {
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
    this.editor = monaco.editor.create(this.host().nativeElement, {
      theme: MONACO_THEME,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      lineHeight: 20,
      fontFamily: "'Cascadia Code', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      renderLineHighlight: 'line',
      overviewRulerBorder: false,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      tabSize: 2,
      scrollBeyondLastLine: false,
      fixedOverflowWidgets: true,
      padding: { top: 8, bottom: 8 },
    });
    this.editor.onDidChangeModelContent(() => {
      const value = this.editor?.getValue() ?? '';
      if (value !== this.code()) this.code.set(value);
    });
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
      this.runRequested.emit(),
    );

    this.useModel(this.fileName());
    this.ready.set(true);
  }

  private useModel(fileName: string): void {
    const monaco = this.monaco;
    const editor = this.editor;
    if (!monaco || !editor) return;

    const lang = this.language();
    const uri = monaco.Uri.parse(`file:///${fileName}/${LANGUAGES[lang].file}`);
    const previous = editor.getModel();
    if (previous?.uri.toString() === uri.toString()) return;

    const model =
      monaco.editor.getModel(uri) ??
      monaco.editor.createModel(this.code(), LANGUAGES[lang].monacoId, uri);
    editor.setModel(model);
    // Keep only the active file in the TypeScript program, so challenges can't clash.
    previous?.dispose();
  }
}

function flattenMessage(message: string | Monaco.typescript.Diagnostic['messageText']): string {
  if (typeof message === 'string') return message;
  const nested = (message.next ?? []).map((m) => flattenMessage(m));
  return [message.messageText, ...nested].join(' ');
}

/**
 * Monaco registers its TypeScript support asynchronously, after the editor is
 * already visible; until then `getTypeScriptWorker()` throws "TypeScript not
 * registered!". Waits for it (a click on "Run tests" right after the editor
 * appears used to do nothing at all). Exported for tests.
 */
export async function typeScriptWorker(
  monaco: Pick<typeof Monaco, 'typescript'>,
  timeoutMs = 15_000,
  pollMs = 100,
): Promise<Awaited<ReturnType<typeof Monaco.typescript.getTypeScriptWorker>>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await monaco.typescript.getTypeScriptWorker();
    } catch (err) {
      if (Date.now() >= deadline) throw err;
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
}
