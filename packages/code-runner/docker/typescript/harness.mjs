// TypeScript runner harness. Runs INSIDE an isolated container (see
// docs/runners.md): no network, read-only filesystem, non-root user,
// memory/CPU/process limits, killed by the host on timeout.
//
// stdin:  RunnerInput JSON (code + test inputs; never expected values)
// stdout: "\n<nonce><RunnerOutput JSON>\n"
import ts from 'typescript';
import { executeTests } from './execute.mjs';

// Keep references before any learner code can replace them.
const writeOut = process.stdout.write.bind(process.stdout);
const exit = process.exit.bind(process);
const stringify = JSON.stringify;

// Learner code can write to stdout/stderr directly. Those writes are never
// results (the result line goes through writeOut, saved above) and are capped
// here, inside the sandbox. Node keeps writes the reader has not taken yet in
// memory, so without this cap a flood read slowly by a busy host reached the
// memory limit first and was reported as "too much memory". Must match
// OUTPUT_LIMIT_EXIT_CODE in packages/code-runner/src/interpret.ts.
const OUTPUT_LIMIT_EXIT_CODE = 3;
const MAX_DIRECT_OUTPUT_BYTES = 256 * 1024;
let directOutputBytes = 0;
for (const stream of [process.stdout, process.stderr]) {
  const write = stream.write.bind(stream);
  stream.write = (chunk, ...rest) => {
    directOutputBytes += typeof chunk === 'string' ? Buffer.byteLength(chunk) : (chunk?.length ?? 0);
    if (directOutputBytes > MAX_DIRECT_OUTPUT_BYTES) exit(OUTPUT_LIMIT_EXIT_CODE);
    return write(chunk, ...rest);
  };
}

const input = JSON.parse(await readStdin());
const nonce = input.nonce;
const logs = [];

function emit(output) {
  writeOut(`\n${nonce}${stringify(output)}\n`, () => exit(0));
}

const COMPILER_OPTIONS = {
  strict: true,
  noImplicitReturns: true,
  noFallthroughCasesInSwitch: true,
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.CommonJS,
  lib: ['lib.es2022.d.ts'],
  types: [],
  skipLibCheck: true,
};

// The same minimal console the browser editor declares.
const GLOBALS = `declare const console: {
  log(...data: unknown[]): void; info(...data: unknown[]): void; warn(...data: unknown[]): void;
  error(...data: unknown[]): void; debug(...data: unknown[]): void;
};`;

const diagnostics = typeCheck(input.code);
if (diagnostics.length > 0) {
  emit({ kind: 'compile-error', diagnostics });
} else {
  const js = ts.transpileModule(input.code, { compilerOptions: COMPILER_OPTIONS }).outputText;
  let moduleExports;
  try {
    const module = { exports: {} };
    const factory = new Function('module', 'exports', 'console', `"use strict";\n${js}`);
    factory(module, module.exports, captureConsole());
    moduleExports = module.exports;
  } catch (err) {
    emit({ kind: 'load-error', message: `Error while loading your code: ${describe(err)}`, logs });
  }
  if (moduleExports) {
    const result = executeTests(moduleExports, input.entryPoint, input.tests);
    emit(result.kind === 'load-error' ? { ...result, logs } : { kind: 'completed', outcomes: result.outcomes, logs });
  }
}

function typeCheck(code) {
  const files = new Map([
    ['/work/solution.ts', code],
    ['/work/globals.d.ts', GLOBALS],
  ]);
  const host = ts.createCompilerHost(COMPILER_OPTIONS);
  const base = { getSourceFile: host.getSourceFile, fileExists: host.fileExists, readFile: host.readFile };
  host.getSourceFile = (name, version, onError) =>
    files.has(name) ? ts.createSourceFile(name, files.get(name), version, true) : base.getSourceFile(name, version, onError);
  host.fileExists = (name) => files.has(name) || base.fileExists(name);
  host.readFile = (name) => files.get(name) ?? base.readFile(name);
  host.writeFile = () => {};
  const program = ts.createProgram([...files.keys()], { ...COMPILER_OPTIONS, noEmit: true }, host);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.category === ts.DiagnosticCategory.Error && d.file?.fileName === '/work/solution.ts')
    .slice(0, 50)
    .map((d) => {
      const pos = d.file.getLineAndCharacterOfPosition(d.start ?? 0);
      return { line: pos.line + 1, column: pos.character + 1, message: ts.flattenDiagnosticMessageText(d.messageText, ' ') };
    });
}

function captureConsole() {
  const write = (prefix) => (...args) => {
    if (logs.length >= input.maxLogLines) return;
    logs.push(prefix + args.map((a) => (typeof a === 'string' ? a : safeFormat(a))).join(' ').slice(0, 2000));
  };
  return { log: write(''), info: write(''), debug: write(''), warn: write('⚠ '), error: write('✖ ') };
}

function safeFormat(value) {
  try {
    return stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function describe(err) {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}
