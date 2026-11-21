/** A TypeScript error reported by the editor's language service. */
export interface CompileDiagnostic {
  readonly line: number;
  readonly column: number;
  readonly message: string;
}
