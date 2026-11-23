import {
  BLANK_PATTERN,
  normalizeOutput,
  type TrackSource,
  type ValidationIssue,
} from '@pracstack/content-model';

/**
 * Compiles and runs the C# in Skill Mastery questions with the real C# runner
 * (the same .NET 10 / Roslyn container that grades learners' code):
 *
 * - predict-output: the program must compile, run without an exception, and
 *   print exactly the expected answer;
 * - fill-in-blank: the template, filled in with each accepted answer, must
 *   compile and run without an exception;
 * - multiple-choice with a `csharpCheck`: the answer key must agree with the
 *   compiler (`compiles`, `options-compile`).
 *
 * Programs may use top-level statements; files with only declarations are
 * compiled and not run. Runs need Docker, so this check lives in a test
 * (csharp-snippets.spec.ts), like the Oracle checks, not in the content build.
 */

/** The subset of a code runner this check needs (see @pracstack/code-runner). */
export interface CSharpProgramRunner {
  run(request: {
    readonly language: 'csharp';
    readonly code: string;
    readonly entryPoint: string;
    readonly tests: readonly { readonly kind: 'call'; readonly input: readonly unknown[] }[];
  }): Promise<
    | {
        readonly kind: 'completed';
        readonly outcomes: readonly unknown[];
        readonly logs: readonly string[];
      }
    | {
        readonly kind: 'compile-error';
        readonly diagnostics: readonly { readonly line: number; readonly message: string }[];
      }
    | { readonly kind: string; readonly message?: string }
  >;
}

/** Tells the harness to run the code as a whole program (see Harness.cs). */
export const PROGRAM_ENTRY_POINT = '$program';

export interface CSharpSnippet {
  readonly path: string;
  readonly source: string;
  /** predict-output: the exact output. */
  readonly expectedOutput?: string;
  /** Answer-key checks: whether the key says this compiles. */
  readonly keySaysCompiles?: boolean;
}

type ProgramResult =
  | { readonly kind: 'ran'; readonly output: string; readonly error?: string }
  | { readonly kind: 'compile-error'; readonly errors: readonly string[] }
  | { readonly kind: 'failed'; readonly message: string };

async function runProgram(runner: CSharpProgramRunner, source: string): Promise<ProgramResult> {
  const result = await runner.run({
    language: 'csharp',
    code: source,
    entryPoint: PROGRAM_ENTRY_POINT,
    tests: [{ kind: 'call', input: [] }],
  });
  if (result.kind === 'completed' && 'logs' in result) {
    const outcome = result.outcomes[0] as { readonly error?: string } | undefined;
    return {
      kind: 'ran',
      output: result.logs.join('\n'),
      ...(outcome?.error ? { error: outcome.error } : {}),
    };
  }
  if (result.kind === 'compile-error' && 'diagnostics' in result) {
    return {
      kind: 'compile-error',
      errors: result.diagnostics.map((d) => `line ${d.line}: ${d.message}`),
    };
  }
  return {
    kind: 'failed',
    message: `${result.kind}${'message' in result && result.message ? `: ${result.message}` : ''}`,
  };
}

export async function checkCSharpSnippets(
  tracks: readonly TrackSource[],
  runner: CSharpProgramRunner,
): Promise<ValidationIssue[]> {
  const snippets = collectCSharpSnippets(tracks);
  const results = await Promise.all(snippets.map((s) => runProgram(runner, s.source)));
  const issues: ValidationIssue[] = [];
  const error = (path: string, message: string) =>
    issues.push({ severity: 'error', path, message });

  snippets.forEach((snippet, i) => {
    const result = results[i];
    if (!result) return;
    if (result.kind === 'failed') {
      error(snippet.path, `the runner could not check this snippet (${result.message})`);
      return;
    }
    const compiled = result.kind === 'ran';
    if (snippet.keySaysCompiles !== undefined) {
      if (compiled !== snippet.keySaysCompiles) {
        error(
          snippet.path,
          snippet.keySaysCompiles
            ? `answer key says this compiles, but: ${result.kind === 'compile-error' ? result.errors.join('; ') : ''}`
            : 'answer key says this does not compile, but it does',
        );
      }
      return;
    }
    if (result.kind === 'compile-error') {
      error(snippet.path, `does not compile: ${result.errors.join('; ')}`);
      return;
    }
    if (result.error) {
      error(snippet.path, `throws: ${result.error}`);
      return;
    }
    if (
      snippet.expectedOutput !== undefined &&
      normalizeOutput(result.output) !== normalizeOutput(snippet.expectedOutput)
    ) {
      error(
        snippet.path,
        `expected output ${JSON.stringify(snippet.expectedOutput)} but the code prints ${JSON.stringify(result.output)}`,
      );
    }
  });
  return issues;
}

/** Strips the inline-code backticks an option's text is written with. */
const optionCode = (text: string): string => text.trim().replace(/^`([\s\S]*)`$/, '$1');

export function collectCSharpSnippets(tracks: readonly TrackSource[]): CSharpSnippet[] {
  const snippets: CSharpSnippet[] = [];
  for (const track of tracks) {
    for (const topic of track.topics) {
      for (const skill of topic.skills) {
        for (const q of skill.questions) {
          const path = `track:${track.id}/${topic.id}/${skill.id}/${q.id}`;
          if (q.format === 'predict-output' && q.code.language === 'csharp') {
            snippets.push({ path, source: q.code.source, expectedOutput: q.answer.output });
          }
          if (q.format === 'multiple-choice' && q.code?.language === 'csharp' && !q.csharpCheck) {
            // Code shown with a question must at least compile (and not throw).
            snippets.push({ path, source: q.code.source });
          }
          if (q.format === 'multiple-choice' && q.csharpCheck) {
            const correct = new Set(q.answer.correct);
            if (q.csharpCheck.kind === 'compiles') {
              const yes = q.options.find((o) => /^yes\b/i.test(o.text.trim()));
              if (!q.code || q.code.language !== 'csharp' || !yes) {
                throw new Error(`${path}: a "compiles" check needs C# code and a "Yes" option`);
              }
              snippets.push({ path, source: q.code.source, keySaysCompiles: correct.has(yes.id) });
            } else {
              const prelude = q.csharpCheck.prelude ?? '';
              for (const option of q.options) {
                snippets.push({
                  path: `${path} (option ${option.id}: ${option.text})`,
                  source: `${prelude}\n${optionCode(option.text)}\n`,
                  keySaysCompiles: correct.has(option.id),
                });
              }
            }
          }
          if (q.format === 'fill-in-blank' && q.template.language === 'csharp') {
            const blanks = q.answer.blanks;
            const first = (id: string): string => blanks[id]?.accepted[0] ?? '';
            for (const [blankId, answer] of Object.entries(blanks)) {
              for (const value of answer.accepted) {
                snippets.push({
                  path: `${path} (blank "${blankId}" = ${JSON.stringify(value)})`,
                  source: q.template.source.replace(BLANK_PATTERN, (_, id: string) =>
                    id === blankId ? value : first(id),
                  ),
                });
              }
            }
          }
        }
      }
    }
  }
  return snippets;
}
