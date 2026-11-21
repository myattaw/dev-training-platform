import type * as Monaco from 'monaco-editor';

export type MonacoApi = typeof Monaco;

export const MONACO_THEME = 'pracstack-light';

/**
 * Monaco's stylesheet is built as a separate, non-injected bundle
 * (see `angular.json` → styles → `monaco`). The production builder does not
 * load CSS that is imported from lazily loaded JavaScript, so we link it here,
 * only when an editor is first shown.
 */
const STYLESHEET_HREF = 'monaco.css';

let monacoPromise: Promise<MonacoApi> | undefined;

/**
 * Lazily loads Monaco (several MB) the first time an editor is shown.
 * The dynamic `import()` makes esbuild put Monaco in its own chunk, so the
 * dashboard and catalog never download it. Later calls reuse the same promise;
 * a failed load is not cached, so a retry can succeed.
 */
export function loadMonaco(): Promise<MonacoApi> {
  monacoPromise ??= initMonaco().catch((err: unknown) => {
    monacoPromise = undefined;
    throw err;
  });
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

  const [monaco] = await Promise.all([import('monaco-editor'), loadStylesheet()]);
  configureTypeScript(monaco);
  defineTheme(monaco);
  return monaco;
}

function loadStylesheet(): Promise<void> {
  if (document.querySelector(`link[href="${STYLESHEET_HREF}"]`)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLESHEET_HREF;
    link.onload = () => resolve();
    link.onerror = () => {
      link.remove();
      reject(new Error('Failed to load editor styles.'));
    };
    document.head.append(link);
  });
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
    'file:///pracstack/globals.d.ts',
  );
}

/** Light theme matching the PracStack design tokens. */
function defineTheme(monaco: MonacoApi): void {
  monaco.editor.defineTheme(MONACO_THEME, {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editor.lineHighlightBackground': '#f4f6f9',
      'editor.lineHighlightBorder': '#00000000',
      'editorLineNumber.foreground': '#9aa5b1',
      'editorLineNumber.activeForeground': '#16191f',
      'editor.selectionBackground': '#cfe3f5',
      'editorCursor.foreground': '#1769aa',
      'editorIndentGuide.background1': '#e7eaee',
      'editorWidget.border': '#d5dbe3',
      'editorGutter.background': '#ffffff',
    },
  });
}
