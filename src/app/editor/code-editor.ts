import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type * as Monaco from 'monaco-editor';
import type { CompileDiagnostic } from '../test-runner/test-runner.models';
import { loadMonaco, type MonacoApi } from './monaco-loader';

export type CompileResult =
  | { readonly ok: true; readonly js: string }
  | { readonly ok: false; readonly diagnostics: readonly CompileDiagnostic[] };

const ERROR_CATEGORY = 1;

/**
 * A Monaco-powered TypeScript editor.
 *
 * - `fileName` identifies the virtual file. Changing it swaps the Monaco model,
 *   so one editor instance can be reused when navigating between exercises.
 * - `code` is a two-way binding: `[(code)]="mySignal"`.
 * - `compile()` type-checks and transpiles the current code via Monaco's TS worker.
 */
@Component({
  selector: 'app-code-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #host class="host"></div>
    @if (!ready()) {
      <div class="loading">Loading editor…</div>
    }
  `,
  styles: `
    :host { display: block; position: relative; min-height: 0; }
    .host { position: absolute; inset: 0; }
    .loading {
      position: absolute; inset: 0; display: grid; place-items: center;
      color: var(--text-muted); font-size: 0.9rem;
    }
  `,
})
export class CodeEditor {
  readonly fileName = input.required<string>();
  readonly code = model.required<string>();
  /** Emitted on Ctrl/Cmd + Enter. */
  readonly runRequested = output<void>();

  protected readonly ready = signal(false);

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private monaco: MonacoApi | undefined;
  private editor: Monaco.editor.IStandaloneCodeEditor | undefined;
  private destroyed = false;

  constructor() {
    // Monaco needs a real DOM element, so we wait until the view is rendered.
    afterNextRender(() => void this.initEditor());

    // Swap the model whenever the file changes (e.g. navigating to another exercise).
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
      return { ok: false, diagnostics: [{ line: 1, column: 1, message: 'The editor is still loading.' }] };
    }

    const getWorker = await monaco.typescript.getTypeScriptWorker();
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
          return { line: pos.lineNumber, column: pos.column, message: flattenMessage(d.messageText) };
        }),
      };
    }

    const output = await worker.getEmitOutput(file);
    const js = output.outputFiles.find((f) => f.name.endsWith('.js'))?.text;
    return js === undefined
      ? { ok: false, diagnostics: [{ line: 1, column: 1, message: 'TypeScript produced no output.' }] }
      : { ok: true, js };
  }

  private async initEditor(): Promise<void> {
    const monaco = await loadMonaco();
    if (this.destroyed) return;

    this.monaco = monaco;
    this.editor = monaco.editor.create(this.host().nativeElement, {
      theme: 'typexercise-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
      tabSize: 2,
      scrollBeyondLastLine: false,
      fixedOverflowWidgets: true,
      padding: { top: 12, bottom: 12 },
    });
    this.editor.onDidChangeModelContent(() => {
      const value = this.editor?.getValue() ?? '';
      if (value !== this.code()) this.code.set(value);
    });
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => this.runRequested.emit());

    this.useModel(this.fileName());
    this.ready.set(true);
  }

  private useModel(fileName: string): void {
    const monaco = this.monaco;
    const editor = this.editor;
    if (!monaco || !editor) return;

    const uri = monaco.Uri.parse(`file:///exercises/${fileName}/solution.ts`);
    const previous = editor.getModel();
    if (previous?.uri.toString() === uri.toString()) return;

    const model = monaco.editor.getModel(uri) ?? monaco.editor.createModel(this.code(), 'typescript', uri);
    editor.setModel(model);
    // Keep only the active file in the TypeScript program, so exercises can't clash.
    previous?.dispose();
  }
}

function flattenMessage(message: string | Monaco.typescript.Diagnostic['messageText']): string {
  if (typeof message === 'string') return message;
  const nested = (message.next ?? []).map((m) => flattenMessage(m));
  return [message.messageText, ...nested].join(' ');
}
