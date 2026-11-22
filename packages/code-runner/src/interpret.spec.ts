import { describe, expect, it } from 'vitest';
import { interpret, OUTPUT_LIMIT_EXIT_CODE } from './interpret';

const NONCE = '<<PRACSTACK-abc>>';

describe('interpret (harness output and exit status → result)', () => {
  it('reads the result line marked with the nonce', () => {
    const stdout = `noise\n${NONCE}${JSON.stringify({ kind: 'completed', outcomes: [{ kind: 'call', value: 1 }], logs: [] })}\n`;
    expect(interpret(stdout, NONCE, 0, '', 1)).toEqual({
      kind: 'completed',
      outcomes: [{ kind: 'call', value: 1 }],
      logs: [],
    });
  });

  it('reports an output flood stopped inside the sandbox as too much output, not memory', () => {
    expect(interpret('x'.repeat(1000), NONCE, OUTPUT_LIMIT_EXIT_CODE, '', 1)).toEqual({
      kind: 'resource-limit',
      message: expect.stringContaining('too much output'),
    });
  });

  it('reports the memory limit (kernel kill or runtime heap limit)', () => {
    for (const [code, stderr] of [
      [137, ''],
      [134, 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory'],
    ] as const)
      expect(interpret('', NONCE, code, stderr, 1)).toMatchObject({
        kind: 'resource-limit',
        message: expect.stringContaining('too much memory'),
      });
  });

  it('ignores result kinds a harness never reports (a forged resource-limit is unreadable)', () => {
    const forged = `${NONCE}${JSON.stringify({ kind: 'resource-limit', message: 'x' })}`;
    expect(interpret(forged, NONCE, 0, '', 1)).toMatchObject({ kind: 'load-error' });
  });

  it('reports a program that exits before reporting', () => {
    expect(interpret('', NONCE, 0, '', 1)).toMatchObject({
      kind: 'load-error',
      message: expect.stringContaining('stopped before reporting'),
    });
  });
});
