/**
 * Runs learner code off the main thread. A Web Worker has no access to the
 * DOM, the page's variables, or localStorage, and the page can kill it with
 * `terminate()` if the code never finishes (e.g. an infinite loop).
 *
 * This protects the page from the learner's own mistakes; it is not a
 * security boundary and its results are never treated as official.
 */
import { runInSandbox } from '@pracstack/challenge-runtime';
import type { SandboxRequest } from './runner.models';

addEventListener('message', ({ data }: MessageEvent<SandboxRequest>) => {
  postMessage(runInSandbox(data.code, data.entryPoint, data.tests));
});
