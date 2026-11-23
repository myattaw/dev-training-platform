/**
 * Lambda handler of the TypeScript and Java runner functions (one container
 * image each; `RUNNER_LANGUAGE` says which). Invoked only by the API
 * function, with test INPUTS only; expected values never reach this function.
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

/** Languages with a Lambda runner image (all of them). */
export type LambdaRunnerLanguage = RunnerLanguage;

export const LIMITS: Readonly<Record<LambdaRunnerLanguage, IsolationLimits>> = {
  typescript: { ...COMMON, timeoutMs: 10_000, maxRssMb: 384, maxProcesses: 256 },
  java: { ...COMMON, timeoutMs: 15_000, maxRssMb: 768, maxProcesses: 256 },
  // .NET plus Roslyn; ASP.NET Core exercises host a small app with its own threads.
  csharp: { ...COMMON, timeoutMs: 15_000, maxRssMb: 768, maxProcesses: 256 },
};

const HARNESS = '/opt/harness';
const COMMANDS: Readonly<
  Record<
    LambdaRunnerLanguage,
    { command: string; args: string[]; env?: Readonly<Record<string, string>> }
  >
> = {
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
  csharp: {
    command: '/usr/share/dotnet/dotnet',
    args: [`${HARNESS}/Harness.dll`],
    env: {
      DOTNET_ROOT: '/usr/share/dotnet',
      // As in the local image: W^X double-maps JIT code through a memory file
      // that exceeds the 16 MB file-size limit; no diagnostics IPC.
      DOTNET_EnableWriteXorExecute: '0',
      DOTNET_EnableDiagnostics: '0',
      DOTNET_gcServer: '0',
      DOTNET_TieredPGO: '0',
      DOTNET_NOLOGO: '1',
      // A managed heap cap well below the RSS limit, so a memory bomb usually ends
      // with a catchable OutOfMemoryException instead of the process being killed.
      DOTNET_GCHeapHardLimit: '18000000', // hex: 384 MiB
    },
  },
};

const MAX_LOG_LINES = 200;

export async function handler(event: unknown): Promise<CodeRunResult> {
  const configured = process.env['RUNNER_LANGUAGE'];
  const language =
    configured && configured in LIMITS ? (configured as LambdaRunnerLanguage) : undefined;
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
