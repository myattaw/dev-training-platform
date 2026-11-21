import { describe, expect, it } from 'vitest';
import { typeScriptWorker } from './code-editor';

type Monaco = Parameters<typeof typeScriptWorker>[0];

/** A fake Monaco whose TypeScript support registers after `failures` attempts. */
function monacoRegisteringAfter(failures: number) {
  let calls = 0;
  const worker = () => Promise.resolve({});
  const fake = {
    typescript: {
      getTypeScriptWorker: () => {
        calls++;
        return calls > failures
          ? Promise.resolve(worker)
          : Promise.reject(new Error('TypeScript not registered!'));
      },
    },
  } as unknown as Monaco;
  return { fake, worker, calls: () => calls };
}

describe('typeScriptWorker', () => {
  it('waits until Monaco has registered TypeScript', async () => {
    const { fake, worker, calls } = monacoRegisteringAfter(3);
    expect(await typeScriptWorker(fake, 2000, 5)).toBe(worker);
    expect(calls()).toBe(4);
  });

  it('gives up with the original error after the timeout', async () => {
    const { fake } = monacoRegisteringAfter(Number.POSITIVE_INFINITY);
    await expect(typeScriptWorker(fake, 50, 5)).rejects.toThrow('TypeScript not registered!');
  });
});
