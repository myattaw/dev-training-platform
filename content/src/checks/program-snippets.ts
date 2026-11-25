import {
  BLANK_PATTERN,
  normalizeOutput,
  type CodeLanguage,
  type TrackSource,
  type ValidationIssue,
} from '@pracstack/content-model';

/**
 * Compiles and runs the Java, Python and Swift code in Skill Mastery questions
 * with the real runners (the same containers that grade learners' code):
 *
 * - predict-output: the program must compile, run without an error, and print
 *   exactly the expected answer;
 * - fill-in-blank: the template, filled in with each accepted answer, must
 *   compile and run without an error;
 * - multiple-choice: code shown with the question must compile and run without
 *   an error, unless a `codeCheck` says otherwise (see ProgramKeyCheck).
 *
 * Java programs declare `public static void main(String[] args)`; Python and
 * Swift programs are scripts. Java snippets can use Spring Boot, Jakarta
 * Validation and JUnit; Python snippets can use Django and Django REST
 * Framework (all pinned in the runner images). Runs need Docker, so this check
 * lives in a test (program-snippets.spec.ts), like the C# and Oracle checks.
 */

export type ProgramLanguage = 'java' | 'python' | 'swift';

export const PROGRAM_LANGUAGES: readonly ProgramLanguage[] = ['java', 'python', 'swift'];

const isProgramLanguage = (language: CodeLanguage): language is ProgramLanguage =>
  (PROGRAM_LANGUAGES as readonly string[]).includes(language);

/** The subset of a code runner this check needs (see @pracstack/code-runner). */
export interface ProgramRunner {
  run(request: {
    readonly language: ProgramLanguage;
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

/** Tells the harnesses to run the code as a whole program. */
export const PROGRAM_ENTRY_POINT = '$program';

export interface ProgramSnippet {
  readonly path: string;
  readonly language: ProgramLanguage;
  readonly source: string;
  /** predict-output, or a multiple-choice `output` check: the exact output. */
  readonly expectedOutput?: string;
  /** Answer-key checks: whether the key says this compiles. */
  readonly keySaysCompiles?: boolean;
  /** `fails` checks: the run must fail with an error containing this text. */
  readonly expectedError?: string;
}

type ProgramResult =
  | { readonly kind: 'ran'; readonly output: string; readonly error?: string }
  | { readonly kind: 'compile-error'; readonly errors: readonly string[] }
  | { readonly kind: 'failed'; readonly message: string };

async function runProgram(runner: ProgramRunner, snippet: ProgramSnippet): Promise<ProgramResult> {
  const result = await runner.run({
    language: snippet.language,
    code: snippet.source,
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

/** Runs `tasks` with at most `limit` at once, keeping results in order. */
async function pooled<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      results[i] = await task(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function checkProgramSnippets(
  tracks: readonly TrackSource[],
  runner: ProgramRunner,
  options: { readonly concurrency?: number; readonly languages?: readonly ProgramLanguage[] } = {},
): Promise<ValidationIssue[]> {
  const wanted = new Set(options.languages ?? PROGRAM_LANGUAGES);
  const snippets = collectProgramSnippets(tracks).filter((s) => wanted.has(s.language));
  const results = await pooled(snippets, options.concurrency ?? 4, (s) => runProgram(runner, s));
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
    if (snippet.keySaysCompiles !== undefined) {
      const compiled = result.kind === 'ran';
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
    if (snippet.expectedError !== undefined) {
      if (!result.error) {
        error(snippet.path, `expected an error containing "${snippet.expectedError}", but it ran`);
      } else if (!result.error.includes(snippet.expectedError)) {
        error(
          snippet.path,
          `expected an error containing "${snippet.expectedError}", but got: ${result.error}`,
        );
      }
      return;
    }
    if (result.error) {
      error(snippet.path, `fails at run time: ${result.error}`);
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

const JAVA_MAIN = /static\s+void\s+main\s*\(/;

/** Strips the inline-code backticks an option's text is written with. */
const optionCode = (text: string): string => text.trim().replace(/^`([\s\S]*)`$/, '$1');

export function collectProgramSnippets(tracks: readonly TrackSource[]): ProgramSnippet[] {
  const snippets: ProgramSnippet[] = [];
  for (const track of tracks) {
    for (const topic of track.topics) {
      for (const skill of topic.skills) {
        for (const q of skill.questions) {
          const path = `track:${track.id}/${topic.id}/${skill.id}/${q.id}`;
          if (q.format === 'predict-output' && isProgramLanguage(q.code.language)) {
            snippets.push({
              path,
              language: q.code.language,
              source: q.code.source,
              expectedOutput: q.answer.output,
            });
          }
          if (q.format === 'multiple-choice') {
            snippets.push(...multipleChoiceSnippets(path, q));
          }
          if (q.format === 'fill-in-blank' && isProgramLanguage(q.template.language)) {
            const language = q.template.language;
            const blanks = q.answer.blanks;
            const first = (id: string): string => blanks[id]?.accepted[0] ?? '';
            for (const [blankId, answer] of Object.entries(blanks)) {
              for (const value of answer.accepted) {
                snippets.push({
                  path: `${path} (blank "${blankId}" = ${JSON.stringify(value)})`,
                  language,
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

type MultipleChoiceSource = Extract<
  TrackSource['topics'][number]['skills'][number]['questions'][number],
  { readonly format: 'multiple-choice' }
>;

function multipleChoiceSnippets(path: string, q: MultipleChoiceSource): ProgramSnippet[] {
  const check = q.codeCheck;
  const correct = new Set(q.answer.correct);
  if (check?.kind === 'options-compile') {
    const prelude = check.prelude ?? '';
    return q.options.map((option) => ({
      path: `${path} (option ${option.id}: ${option.text})`,
      language: check.language,
      source: `${prelude}\n${optionCode(option.text)}\n`,
      keySaysCompiles: correct.has(option.id),
    }));
  }
  const language = q.code?.language;
  if (!q.code || !language || !isProgramLanguage(language)) {
    if (check) {
      throw new Error(
        `${path}: a codeCheck needs Java, Python or Swift code shown with the question`,
      );
    }
    return [];
  }
  const source = q.code.source;
  if (!check) {
    // Java without a main method (a controller, an entity) is only compiled.
    return [
      language === 'java' && !JAVA_MAIN.test(source)
        ? { path, language, source, keySaysCompiles: true }
        : { path, language, source },
    ];
  }
  switch (check.kind) {
    case 'compiles': {
      const yes = q.options.find((o) => /^yes\b/i.test(o.text.trim()));
      if (!yes) throw new Error(`${path}: a "compiles" check needs a "Yes" option`);
      return [{ path, language, source, keySaysCompiles: correct.has(yes.id) }];
    }
    case 'output': {
      const right = q.options.filter((o) => correct.has(o.id));
      if (right.length !== 1 || q.selection !== 'single') {
        throw new Error(`${path}: an "output" check needs exactly one correct option`);
      }
      return [{ path, language, source, expectedOutput: optionCode(right[0]?.text ?? '') }];
    }
    case 'fails':
      return [{ path, language, source, expectedError: check.error }];
  }
}
