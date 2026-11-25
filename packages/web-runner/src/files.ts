/**
 * Submitted project files: validation and assembly (trusted side, in the API).
 *
 * A learner may only replace files the challenge marks editable. The project
 * that runs is always the trusted starter project with those files swapped in:
 * no new files, no deletions, no build-file or dependency changes, no paths the
 * challenge did not list. Paths are compared to the trusted list exactly, so
 * traversal (`../`), absolute paths, symlinks and odd encodings cannot get in;
 * the pattern check below is defense in depth.
 */

export interface FileLimits {
  readonly maxFiles: number;
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
}

export const DEFAULT_FILE_LIMITS: FileLimits = {
  maxFiles: 40,
  maxFileBytes: 100_000,
  maxTotalBytes: 400_000,
};

/** Project-relative paths: letters, digits, `_ - . /`; no `..`, no leading or doubled slash. */
const SAFE_PATH = /^(?!\/)(?!.*\/\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9_\-./]{1,200}$/;

export function isSafeProjectPath(path: string): boolean {
  return SAFE_PATH.test(path);
}

export type FileValidation =
  | { readonly ok: true; readonly files: Readonly<Record<string, string>> }
  | { readonly ok: false; readonly message: string };

/**
 * Validates submitted files against the challenge's editable paths. Missing
 * editable files are allowed (the starter version is used).
 */
export function validateSubmittedFiles(
  submitted: unknown,
  editable: readonly string[],
  limits: FileLimits = DEFAULT_FILE_LIMITS,
): FileValidation {
  if (typeof submitted !== 'object' || submitted === null || Array.isArray(submitted)) {
    return { ok: false, message: 'files must be an object of path → content.' };
  }
  const entries = Object.entries(submitted as Record<string, unknown>);
  if (entries.length > limits.maxFiles) {
    return { ok: false, message: `At most ${limits.maxFiles} files can be submitted.` };
  }
  const allowed = new Set(editable);
  const files: Record<string, string> = {};
  let total = 0;
  for (const [path, content] of entries) {
    if (!isSafeProjectPath(path) || !allowed.has(path)) {
      return { ok: false, message: `"${path.slice(0, 200)}" is not an editable file of this project.` };
    }
    if (typeof content !== 'string') {
      return { ok: false, message: `The content of ${path} must be text.` };
    }
    if (content.includes('\u0000')) {
      return { ok: false, message: `${path} contains a NUL character.` };
    }
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > limits.maxFileBytes) {
      return { ok: false, message: `${path} is larger than ${limits.maxFileBytes / 1000} KB.` };
    }
    total += bytes;
    if (total > limits.maxTotalBytes) {
      return { ok: false, message: `The project is larger than ${limits.maxTotalBytes / 1000} KB.` };
    }
    files[path] = content;
  }
  return { ok: true, files };
}

/** The trusted starter project with the learner's (validated) editable files swapped in. */
export function assembleProject(
  starter: Readonly<Record<string, string>>,
  submitted: Readonly<Record<string, string>>,
): Record<string, string> {
  const project: Record<string, string> = { ...starter };
  for (const [path, content] of Object.entries(submitted)) {
    if (path in starter) project[path] = content;
  }
  return project;
}

/**
 * A POSIX ustar archive of the files (regular files and their directories
 * only: no links, devices or special permissions), fed to the container on
 * stdin. Paths must already be validated.
 */
export function tarProject(files: Readonly<Record<string, string>>): Buffer {
  const blocks: Buffer[] = [];
  const directories = new Set<string>();
  for (const path of Object.keys(files).sort()) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) directories.add(`${parts.slice(0, i).join('/')}/`);
  }
  for (const dir of [...directories].sort()) blocks.push(header(dir, 0, '5', 0o755));
  for (const path of Object.keys(files).sort()) {
    const data = Buffer.from(files[path] ?? '', 'utf8');
    blocks.push(header(path, data.length, '0', 0o644), data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) blocks.push(Buffer.alloc(pad));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

function header(path: string, size: number, type: '0' | '5', mode: number): Buffer {
  const block = Buffer.alloc(512);
  let name = path;
  let prefix = '';
  if (Buffer.byteLength(name) > 100) {
    const cut = path.lastIndexOf('/', path.length - 2);
    prefix = path.slice(0, cut);
    name = path.slice(cut + 1);
    if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) {
      throw new Error(`path too long for a tar header: ${path}`);
    }
  }
  const octal = (value: number, length: number): string =>
    `${value.toString(8).padStart(length - 1, '0')}\0`;
  block.write(name, 0, 100, 'utf8');
  block.write(octal(mode, 8), 100, 'ascii');
  block.write(octal(10001, 8), 108, 'ascii');
  block.write(octal(10001, 8), 116, 'ascii');
  block.write(octal(size, 12), 124, 'ascii');
  block.write(octal(0, 12), 136, 'ascii');
  block.write('        ', 148, 'ascii');
  block.write(type, 156, 'ascii');
  block.write('ustar\u000000', 257, 'ascii');
  block.write(prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii');
  return block;
}
