/**
 * Builds the runner container images.
 *
 *   npm run runners:build
 *
 * The TypeScript image gets a bundle of the shared test executor from
 * @pracstack/challenge-runtime (execute.ts), so the browser, the content
 * build and the container all execute tests with the same code.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { RUNNER_IMAGES } from '../src/protocol';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeEntry = join(root, '..', 'challenge-runtime', 'src', 'execute.ts');

await build({
  entryPoints: [runtimeEntry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: join(root, 'docker', 'typescript', 'execute.mjs'),
  logLevel: 'warning',
});

for (const [language, image] of Object.entries(RUNNER_IMAGES)) {
  console.log(`Building ${image}…`);
  const result = spawnSync('docker', ['build', '--tag', image, join(root, 'docker', language)], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\nBuilding ${image} failed. Is Docker running?`);
    process.exit(1);
  }
}
console.log('Runner images are ready.');
