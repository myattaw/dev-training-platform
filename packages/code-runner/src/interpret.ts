import type { CodeRunResult } from './protocol';
import { parseCodeRunResult } from './validate';

/**
 * Turns a harness's output and exit status into a result. Shared by the
 * Docker runner (local) and the Lambda runner functions (AWS).
 */
export function interpret(
  stdout: string,
  nonce: string,
  exitCode: number | null,
  stderr: string,
  testCount: number,
): CodeRunResult {
  const line = stdout.split('\n').find((l) => l.startsWith(nonce));
  if (line) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line.slice(nonce.length));
    } catch {
      parsed = undefined;
    }
    const result = parseCodeRunResult(parsed, testCount);
    // The harness only ever reports these three kinds.
    if (result && ['completed', 'compile-error', 'load-error'].includes(result.kind)) return result;
    return { kind: 'load-error', message: 'The runner produced an unreadable result.', logs: [] };
  }
  if (exitCode === 125 || /Unable to find image|No such image/i.test(stderr)) {
    return {
      kind: 'unavailable',
      message: /No such image|Unable to find image/i.test(stderr)
        ? 'Runner images are missing. Build them with "npm run runners:build".'
        : 'The code runner could not start a container.',
    };
  }
  // 137: killed by the kernel at the container memory limit. 134 with a heap
  // message: the runtime's own heap limit (Node's --max-old-space-size, Java's heap).
  if (exitCode === 137 || /heap out of memory|OutOfMemoryError/i.test(stderr)) {
    return {
      kind: 'resource-limit',
      message: 'Your program used too much memory and was stopped.',
    };
  }
  return {
    kind: 'load-error',
    message: `Your program stopped before reporting any results (exit code ${exitCode ?? 'unknown'}).`,
    logs: [],
  };
}
