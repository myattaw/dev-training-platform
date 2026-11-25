import {
  BLANK_PATTERN,
  normalizeOutput,
  type TrackSource,
  type ValidationIssue,
} from '@pracstack/content-model';
import type { OracleScriptResult } from '@pracstack/sql-engine';

/**
 * Checks the PL/SQL track on Oracle Database Free: every code sample runs in a
 * fresh schema holding the practice tables (`setup`), and
 * - predict-output: DBMS_OUTPUT must print exactly the answer;
 * - fill-in-blank: the code must run with every accepted answer filled in;
 * - multiple-choice with code: it must run, or with `plsqlCheck: { kind: 'fails' }`
 *   fail with exactly that error.
 */

export interface PlsqlSnippet {
  readonly path: string;
  readonly source: string;
  readonly expectedOutput?: string;
  /** The error the run must fail with; undefined: it must succeed. */
  readonly expectedError?: string;
}

export type ScriptRunner = (script: string) => Promise<OracleScriptResult>;

export function collectPlsqlSnippets(track: TrackSource): PlsqlSnippet[] {
  const snippets: PlsqlSnippet[] = [];
  for (const topic of track.topics) {
    for (const skill of topic.skills) {
      for (const q of skill.questions) {
        const path = `track:${track.id}/${topic.id}/${skill.id}/${q.id}`;
        if (q.format === 'predict-output') {
          snippets.push({ path, source: q.code.source, expectedOutput: q.answer.output });
        } else if (q.format === 'multiple-choice' && q.code) {
          snippets.push({
            path,
            source: q.code.source,
            ...(q.plsqlCheck ? { expectedError: q.plsqlCheck.error } : {}),
          });
        } else if (q.format === 'fill-in-blank') {
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
  return snippets;
}

export async function checkPlsqlSnippets(
  snippets: readonly PlsqlSnippet[],
  run: ScriptRunner,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  for (const snippet of snippets) {
    const error = (message: string) =>
      issues.push({ severity: 'error', path: snippet.path, message });
    const result = await run(snippet.source);
    if (snippet.expectedError !== undefined) {
      if (result.error?.code !== snippet.expectedError) {
        error(
          `expected it to fail with ${snippet.expectedError}, but it ${
            result.error ? `failed with ${result.error.code}: ${result.error.message}` : 'ran'
          }`,
        );
      }
      continue;
    }
    if (result.error) {
      error(`failed with ${result.error.code}: ${result.error.message}`);
      continue;
    }
    if (
      snippet.expectedOutput !== undefined &&
      normalizeOutput(result.output) !== normalizeOutput(snippet.expectedOutput)
    ) {
      error(
        `prints ${JSON.stringify(result.output)}, but the answer is ${JSON.stringify(snippet.expectedOutput)}`,
      );
    }
  }
  return issues;
}
