import type * as Monaco from 'monaco-editor';

export type MonacoApi = typeof Monaco;

let monacoPromise: Promise<MonacoApi> | undefined;

/**
 * Lazily loads Monaco (several MB) the first time an editor is shown.
 * The dynamic `import()` makes esbuild put Monaco in its own chunk, so the
 * homepage and catalog never download it. Later calls reuse the same promise.
 */
export function loadMonaco(): Promise<MonacoApi> {
  monacoPromise ??= initMonaco();
  return monacoPromise;
}

async function initMonaco(): Promise<MonacoApi> {
  // Monaco runs language services in Web Workers. We tell it how to create
  // them; each `new URL(..., import.meta.url)` is bundled by the Angular CLI.
  globalThis.MonacoEnvironment = {
    getWorker(_workerId: string, label: string): Worker {
      if (label === 'typescript' || label === 'javascript') {
        return new Worker(new URL('./workers/ts.worker', import.meta.url), { type: 'module' });
      }
      return new Worker(new URL('./workers/editor.worker', import.meta.url), { type: 'module' });
    },
  };

  const monaco = await import('monaco-editor');
  configureTypeScript(monaco);
  defineTheme(monaco);
  return monaco;
}

function configureTypeScript(monaco: MonacoApi): void {
  const { typescriptDefaults, ScriptTarget, ModuleKind } = monaco.typescript;

  typescriptDefaults.setCompilerOptions({
    target: ScriptTarget.ES2020,
    // CommonJS output is easy to evaluate in the sandbox: `exports.fn = fn`.
    module: ModuleKind.CommonJS,
    // Learner code runs in a worker, not a page: no DOM typings.
    lib: ['es2022'],
    strict: true,
    noImplicitReturns: true,
    noFallthroughCasesInSwitch: true,
    allowNonTsExtensions: true,
  });

  typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });

  // `console` lives in the DOM lib, which we excluded. Declare just what the sandbox provides.
  typescriptDefaults.addExtraLib(
    `declare const console: {
  log(...data: unknown[]): void;
  info(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
  debug(...data: unknown[]): void;
};`,
    'file:///typexercise/globals.d.ts',
  );
}

function defineTheme(monaco: MonacoApi): void {
  monaco.editor.defineTheme('typexercise-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0b1120',
      'editor.lineHighlightBackground': '#111a2e',
      'editorLineNumber.foreground': '#475569',
      'editorGutter.background': '#0b1120',
    },
  });
}
