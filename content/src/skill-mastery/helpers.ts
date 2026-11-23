import type { CodeSnippet, InstructionBlock } from '@pracstack/content-model';

/** Shorthand for a one-paragraph prompt or explanation. */
export const text = (...paragraphs: string[]): InstructionBlock[] =>
  paragraphs.map((t) => ({ kind: 'paragraph', text: t }));

export const ts = (source: string): CodeSnippet => ({ language: 'typescript', source });

export const cs = (source: string): CodeSnippet => ({ language: 'csharp', source });

export const sql = (source: string): CodeSnippet => ({ language: 'sql', source });

export const yaml = (source: string): CodeSnippet => ({ language: 'yaml', source });

export const json = (source: string): CodeSnippet => ({ language: 'json', source });

/** Plain text: logs, Power Fx, DAX, HTTP exchanges and other artifacts that are not compiled. */
export const plain = (source: string): CodeSnippet => ({ language: 'text', source });
