/**
 * Fails if any private content (hidden tests, answers, hints, explanations,
 * question prompts) appears in the browser bundle.
 *
 * Usage: tsx content/scripts/check-leaks.ts <bundle-dir>   (default: dist/web/browser)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { buildContent } from '../src';
import { findLeaks, sensitiveStrings } from '../src/leak-check';

const bundleDir = resolve(process.argv[2] ?? 'dist/web/browser');
const TEXT_FILE = /\.(js|mjs|css|html|json|txt|map)$/;

const build = buildContent();
const sensitive = sensitiveStrings(build.privateFiles, build.publicFiles);

const bundle = new Map<string, string>();
for (const file of walk(bundleDir)) {
  const path = relative(bundleDir, file).replace(/\\/g, '/');
  bundle.set(path, TEXT_FILE.test(file) ? readFileSync(file, 'utf8') : '');
}
if (bundle.size === 0) {
  console.error(`No files found in ${bundleDir}. Build the web app first.`);
  process.exit(1);
}

const leaks = findLeaks(sensitive, bundle);
for (const leak of leaks) console.error(`LEAK  ${leak.file}: ${JSON.stringify(leak.value)}`);
if (leaks.length > 0) {
  console.error(`\n${leaks.length} private value(s) found in the browser bundle.`);
  process.exit(1);
}
console.log(
  `No private content in ${bundle.size} bundle files (${sensitive.length} sensitive strings checked).`,
);

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}
