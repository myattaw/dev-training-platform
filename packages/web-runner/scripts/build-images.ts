/**
 * Builds the web-challenge runner images (one per framework, plus the HTTP probe).
 *
 *   npm run web-runners:build                  # all
 *   npm run web-runners:build -- django probe  # some
 *
 * Needs Docker. The first build downloads the base images (.NET SDK, JDK,
 * Python, Node) and the pinned Spring Boot libraries.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEB_RUNNER_IMAGES } from '../src/protocol';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wanted = process.argv.slice(2);

for (const [name, image] of Object.entries(WEB_RUNNER_IMAGES)) {
  if (wanted.length > 0 && !wanted.includes(name)) continue;
  console.log(`Building ${image}…`);
  const result = spawnSync('docker', ['build', '--tag', image, join(root, 'docker', name)], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error(`\nBuilding ${image} failed. Is Docker running?`);
    process.exit(1);
  }
}
console.log('Web runner images are ready.');
