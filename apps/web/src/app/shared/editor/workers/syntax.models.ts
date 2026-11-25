import type { CompileDiagnostic } from '../compile.models';

/** Languages with an in-browser syntax check (grammar files in public/grammars). */
export type SyntaxLanguage = 'csharp' | 'java';

export interface SyntaxRequest {
  readonly id: number;
  readonly language: SyntaxLanguage;
  readonly code: string;
  /** The Tree-sitter runtime (web-tree-sitter.wasm); used by the first request. */
  readonly runtime?: ArrayBuffer;
  /** The language's grammar; sent with the first request for that language. */
  readonly grammar?: ArrayBuffer;
}

export type SyntaxResponse =
  | { readonly id: number; readonly ok: true; readonly diagnostics: readonly CompileDiagnostic[] }
  | { readonly id: number; readonly ok: false; readonly error: string };
