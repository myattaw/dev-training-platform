/**
 * Normalization rules shared by the content build (which verifies answers)
 * and the grader (which checks learner answers). Keeping one implementation
 * guarantees the two agree.
 */

/** Program output: ignore trailing whitespace on each line and trailing blank lines. */
export function normalizeOutput(output: string): string {
  return output
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n+$/, '');
}

/** A fill-in-the-blank answer: trim, and collapse runs of whitespace to one space. */
export function normalizeBlank(value: string, caseSensitive = true): string {
  const collapsed = value.trim().replace(/\s+/g, ' ');
  return caseSensitive ? collapsed : collapsed.toLowerCase();
}
