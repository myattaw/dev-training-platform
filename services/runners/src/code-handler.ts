/**
 * Lambda handler of the TypeScript and Java runner functions (one container
 * image each; `RUNNER_LANGUAGE` says which). Invoked only by the API function,
 * with test INPUTS only; expected values never reach this function.
 */
import { randomBytes } from 'node:crypto';
import {
  type CodeRunResult,
  interpret,
  parseCodeRunRequest,
  type RunnerInput,
  type RunnerLanguage,
} from '@pracstack/code-runner';
import { type IsolationLimits, runIsolated } from './isolate';

const COMMON = { maxOutputBytes: 1_000_000, maxOpenFiles: 256, maxFileBytes: 16 * 1024 * 1024 };

export const LIMITS: Readonly<Record<RunnerLanguage, IsolationLimits>> = {
  typescript: { ...COMMON, timeoutMs: 10_000, maxRssMb: 384, maxProcesses: 256 },
  java: { ...COMMON, timeoutMs: 15_000, maxRssMb: 768, maxProcesses: 256 },
};

const HARNESS = '/opt/harness';
const COMMANDS: Readonly<Record<RunnerLanguage, { command: string; args: string[] }>> = {
  typescript: {
    command: process.execPath,
    args: ['--max-old-space-size=192', `${HARNESS}/harness.mjs`],
  },
  java: {
    command: 'java',
    args: [
      '-XX:+UseSerialGC',
      '-Xmx256m',
      '-XX:MaxMetaspaceSize=128m',
      '-XX:TieredStopAtLevel=1',
      '-Xss1m',
      '-XX:-UsePerfData',
      '-Djava.io.tmpdir={dir}',
      '-cp',
      HARNESS,
      'Harness',
    ],
  },
};

const MAX_LOG_LINES = 200;

export async function handler(event: unknown): Promise<CodeRunResult> {
  const language = process.env['RUNNER_LANGUAGE'] as RunnerLanguage | undefined;
  const request = parseCodeRunRequest(event);
  if (!language || !request || request.language !== language) {
    return { kind: 'unavailable', message: 'The runner received an invalid request.' };
  }
  const nonce = `<<PRACSTACK-${randomBytes(16).toString('hex')}>>`;
  const input: RunnerInput = {
    nonce,
    code: request.code,
    entryPoint: request.entryPoint,
    tests: request.tests,
    maxLogLines: MAX_LOG_LINES,
  };
  const limits = LIMITS[language];
  const result = await runIsolated({ ...COMMANDS[language], stdin: JSON.stringify(input), limits });

  switch (result.killedFor) {
    case 'timeout':
      return { kind: 'timeout', timeoutMs: limits.timeoutMs };
    case 'output':
      return {
        kind: 'resource-limit',
        message: 'Your program printed too much output and was stopped.',
      };
    case 'memory':
      return {
        kind: 'resource-limit',
        message: 'Your program used too much memory and was stopped.',
      };
    default:
      return interpret(result.stdout, nonce, result.exitCode, result.stderr, request.tests.length);
  }
}
