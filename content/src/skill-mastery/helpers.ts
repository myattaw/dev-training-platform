import type { CodeSnippet, InstructionBlock } from '@pracstack/content-model';

/** Shorthand for a one-paragraph prompt or explanation. */
export const text = (...paragraphs: string[]): InstructionBlock[] =>
  paragraphs.map((t) => ({ kind: 'paragraph', text: t }));

export const ts = (source: string): CodeSnippet => ({ language: 'typescript', source });

export const sql = (source: string): CodeSnippet => ({ language: 'sql', source });
