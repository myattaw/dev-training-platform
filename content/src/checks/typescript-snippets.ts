import { format } from 'node:util';
import { runInNewContext } from 'node:vm';
import {
  BLANK_PATTERN,
  normalizeOutput,
  type TrackSource,
  type ValidationIssue,
} from '@pracstack/content-model';
import * as ts from 'typescript';

/**
 * Compiles and runs the TypeScript in Skill Mastery questions:
 *
 * - predict-output: the code must type-check, and running it must print
 *   exactly the expected answer;
 * - fill-in-blank: the template, filled in with each accepted answer, must
 *   type-check.
 *
 * Snippets use the same compiler settings as the learner's editor: strict,
 * ES2022, no DOM, and only a minimal `console`.
 */

const COMPILER_OPTIONS: ts.CompilerOptions = {
  strict: true,
  noImplicitReturns: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  lib: ['lib.es2022.d.ts'],
  types: [],
  noEmit: true,
  skipLibCheck: true,
  // Treat every snippet as its own module so names don't clash across files.
  moduleDetection: ts.ModuleDetectionKind.Force,
};

const GLOBALS = `declare const console: {
  log(...data: unknown[]): void;
  error(...data: unknown[]): void;
};`;

const RUN_TIMEOUT_MS = 1000;

interface Snippet {
  readonly path: string;
  readonly fileName: string;
  readonly source: string;
  /** Set for predict-output snippets, which are also executed. */
  readonly expectedOutput?: string;
}

export function checkTypeScriptSnippets(tracks: readonly TrackSource[]): ValidationIssue[] {
  const snippets = collectSnippets(tracks);
  const issues: ValidationIssue[] = [];

  const diagnostics = typeCheck(snippets);
  for (const snippet of snippets) {
    const errors = diagnostics.get(snippet.fileName) ?? [];
    for (const message of errors) {
      issues.push({
        severity: 'error',
        path: snippet.path,
        message: `does not compile: ${message}`,
      });
    }
    if (snippet.expectedOutput !== undefined && errors.length === 0) {
      const result = run(snippet.source);
      if ('error' in result) {
        issues.push({ severity: 'error', path: snippet.path, message: `throws: ${result.error}` });
      } else if (normalizeOutput(result.output) !== normalizeOutput(snippet.expectedOutput)) {
        issues.push({
          severity: 'error',
          path: snippet.path,
          message: `expected output ${JSON.stringify(snippet.expectedOutput)} but the code prints ${JSON.stringify(result.output)}`,
        });
      }
    }
  }
  return issues;
}

function collectSnippets(tracks: readonly TrackSource[]): Snippet[] {
  const snippets: Snippet[] = [];
  for (const track of tracks) {
    for (const topic of track.topics) {
      for (const skill of topic.skills) {
        for (const q of skill.questions) {
          const path = `track:${track.id}/${topic.id}/${skill.id}/${q.id}`;
          if (q.format === 'predict-output' && q.code.language === 'typescript') {
            snippets.push({
              path,
              fileName: `/snippets/${q.id}.ts`,
              source: q.code.source,
              expectedOutput: q.answer.output,
            });
          }
          if (q.format === 'fill-in-blank' && q.template.language === 'typescript') {
            // One file per combination would explode; check each accepted answer
            // for each blank, with the other blanks filled with their first answer.
            const blanks = q.answer.blanks;
            const first = (id: string): string => blanks[id]?.accepted[0] ?? '';
            for (const [blankId, answer] of Object.entries(blanks)) {
              answer.accepted.forEach((value, i) => {
                const filled = q.template.source.replace(BLANK_PATTERN, (_, id: string) =>
                  id === blankId ? value : first(id),
                );
                snippets.push({
                  path: `${path} (blank "${blankId}" = ${JSON.stringify(value)})`,
                  fileName: `/snippets/${q.id}--${blankId}-${i}.ts`,
                  source: filled,
                });
              });
            }
          }
        }
      }
    }
  }
  return snippets;
}

function typeCheck(snippets: readonly Snippet[]): Map<string, string[]> {
  const files = new Map<string, string>(snippets.map((s) => [s.fileName, s.source]));
  files.set('/snippets/globals.d.ts', GLOBALS);

  const host = ts.createCompilerHost(COMPILER_OPTIONS);
  const base = {
    getSourceFile: host.getSourceFile,
    fileExists: host.fileExists,
    readFile: host.readFile,
  };
  host.getSourceFile = (fileName, languageVersion, onError) => {
    const text = files.get(fileName);
    return text !== undefined
      ? ts.createSourceFile(fileName, text, languageVersion, true)
      : base.getSourceFile(fileName, languageVersion, onError);
  };
  host.fileExists = (fileName) => files.has(fileName) || base.fileExists(fileName);
  host.readFile = (fileName) => files.get(fileName) ?? base.readFile(fileName);

  const program = ts.createProgram([...files.keys()], COMPILER_OPTIONS, host);
  const result = new Map<string, string[]>();
  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    const fileName = diagnostic.file?.fileName ?? '(global)';
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
    const where =
      diagnostic.file && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
        : undefined;
    const list = result.get(fileName) ?? [];
    list.push(where ? `line ${where.line + 1}: ${message}` : message);
    result.set(fileName, list);
  }
  // Problems in the shared setup would affect every snippet; surface them loudly.
  const global = [
    ...(result.get('(global)') ?? []),
    ...(result.get('/snippets/globals.d.ts') ?? []),
  ];
  if (global.length > 0) throw new Error(`Snippet compiler setup is broken: ${global.join('; ')}`);
  return result;
}

function run(source: string): { output: string } | { error: string } {
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const lines: string[] = [];
  const log = (...args: unknown[]): void => {
    lines.push(format(...args));
  };
  const module = { exports: {} };
  try {
    runInNewContext(
      js,
      { console: { log, error: log }, module, exports: module.exports },
      {
        timeout: RUN_TIMEOUT_MS,
      },
    );
    return { output: lines.join('\n') };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
