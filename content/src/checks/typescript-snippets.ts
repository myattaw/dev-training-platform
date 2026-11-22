import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
 *   type-check;
 * - multiple-choice with a `typeCheck`: the answer key must agree with the
 *   compiler. `compiles`: "Yes" is correct exactly when the code compiles.
 *   `options-compile`: the correct options are exactly those that compile.
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

/**
 * Snippets that import Angular (`from '@angular/…'`) are compiled in a second
 * program against the real Angular type definitions from node_modules, with
 * the DOM library, as in an Angular app. They are type-checked only.
 */
const ANGULAR_IMPORT = /from\s+['"]@angular\//;
const ANGULAR_OPTIONS: ts.CompilerOptions = {
  ...COMPILER_OPTIONS,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
};
/** A (virtual) folder inside the content package, so module resolution finds node_modules. */
const ANGULAR_SNIPPET_DIR = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  '.snippets',
);

const RUN_TIMEOUT_MS = 1000;

interface Snippet {
  readonly path: string;
  readonly fileName: string;
  readonly source: string;
  /** Set for predict-output snippets, which are also executed. */
  readonly expectedOutput?: string;
  /**
   * Set for answer-key checks: whether the answer key says this compiles.
   * Compile errors are then expected for `false`, and reported as a wrong key
   * instead of a broken snippet.
   */
  readonly keySaysCompiles?: boolean;
}

/** Option text as code: the text without surrounding backticks. */
const optionCode = (text: string): string => text.trim().replace(/^`+|`+$/g, '');

export function checkTypeScriptSnippets(tracks: readonly TrackSource[]): ValidationIssue[] {
  const snippets = collectSnippets(tracks);
  const issues: ValidationIssue[] = [];

  const diagnostics = typeCheck(snippets);
  for (const snippet of snippets) {
    const errors = diagnostics.get(snippet.fileName) ?? [];
    if (snippet.keySaysCompiles !== undefined) {
      const compiles = errors.length === 0;
      if (compiles !== snippet.keySaysCompiles) {
        issues.push({
          severity: 'error',
          path: snippet.path,
          message: compiles
            ? 'answer key says this does not compile, but it does'
            : `answer key says this compiles, but it does not: ${errors.join('; ')}`,
        });
      }
      continue;
    }
    for (const message of errors) {
      issues.push({
        severity: 'error',
        path: snippet.path,
        message: `does not compile: ${message}`,
      });
    }
    if (snippet.expectedOutput !== undefined && ANGULAR_IMPORT.test(snippet.source)) {
      issues.push({
        severity: 'error',
        path: snippet.path,
        message:
          'predict-output code cannot import Angular: Angular snippets are type-checked only',
      });
      continue;
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
          if (q.format === 'multiple-choice' && q.typeCheck) {
            const correct = new Set(q.answer.correct);
            if (q.typeCheck.kind === 'compiles') {
              const yes = q.options.find((o) => /^yes\b/i.test(o.text.trim()));
              if (!q.code || q.code.language !== 'typescript' || !yes) {
                throw new Error(
                  `${path}: a "compiles" check needs TypeScript code and a "Yes" option`,
                );
              }
              snippets.push({
                path,
                fileName: `/snippets/${q.id}--key.ts`,
                source: q.code.source,
                keySaysCompiles: correct.has(yes.id),
              });
            } else if (q.typeCheck.kind === 'type-equals') {
              // Exact type identity (not just assignability), the standard trick.
              // The check sits inside a function: there, outer `let` variables are
              // not narrowed by their initialiser, so `typeof` gives the declared
              // type the learner sees on hover (`boolean`, not `false`).
              const { prelude, expression } = q.typeCheck;
              for (const option of q.options) {
                snippets.push({
                  path: `${path} (option ${option.id}: ${option.text})`,
                  fileName: `/snippets/${q.id}--type-${option.id}.ts`,
                  source: `${prelude}
type Expected = ${optionCode(option.text)};
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export function sameType(): Equals<typeof ${expression}, Expected> {
  return true;
}
`,
                  keySaysCompiles: correct.has(option.id),
                });
              }
            } else {
              const prelude = q.typeCheck.prelude ?? '';
              for (const option of q.options) {
                snippets.push({
                  path: `${path} (option ${option.id}: ${option.text})`,
                  fileName: `/snippets/${q.id}--option-${option.id}.ts`,
                  source: `${prelude}\n${optionCode(option.text)}\n`,
                  keySaysCompiles: correct.has(option.id),
                });
              }
            }
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
  const angular = snippets.filter((s) => ANGULAR_IMPORT.test(s.source));
  const plain = snippets.filter((s) => !ANGULAR_IMPORT.test(s.source));
  const result = compile(
    new Map(plain.map((s) => [s.fileName, s.source])).set('/snippets/globals.d.ts', GLOBALS),
    COMPILER_OPTIONS,
  );
  if (angular.length > 0) {
    // Real paths for resolution; diagnostics are reported under the snippet's own name.
    // Forward slashes: the compiler asks the host for normalised paths, also on Windows.
    const realName = (s: Snippet) =>
      join(ANGULAR_SNIPPET_DIR, s.fileName.replace(/^\/snippets\//, '')).replace(/\\/g, '/');
    const angularResult = compile(
      new Map(angular.map((s) => [realName(s), s.source])),
      ANGULAR_OPTIONS,
    );
    for (const s of angular) {
      const errors = angularResult.get(realName(s));
      if (errors) result.set(s.fileName, errors);
    }
    const global = angularResult.get('(global)');
    if (global) throw new Error(`Angular snippet compiler setup is broken: ${global.join('; ')}`);
  }
  // Problems in the shared setup would affect every snippet; surface them loudly.
  const global = [
    ...(result.get('(global)') ?? []),
    ...(result.get('/snippets/globals.d.ts') ?? []),
  ];
  if (global.length > 0) throw new Error(`Snippet compiler setup is broken: ${global.join('; ')}`);
  return result;
}

function compile(files: Map<string, string>, options: ts.CompilerOptions): Map<string, string[]> {
  const host = ts.createCompilerHost(options);
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

  const program = ts.createProgram([...files.keys()], options, host);
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
