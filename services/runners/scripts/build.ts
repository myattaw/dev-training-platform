/**
 * Prepares the Docker build contexts of the three runner functions:
 *
 *   services/runners/dist/{typescript,java,csharp,sql}/   Dockerfile + everything it copies
 *
 *   npm run build -w @pracstack/runners              # contexts only (CDK builds the images)
 *   npm run build -w @pracstack/runners -- --images  # also build local images for the tests
 *
 * Contexts contain code and the runtime only: no content, no expected values,
 * no secrets.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const packages = resolve(root, '../../packages');
export const DIST = join(root, 'dist');
export const RUNNERS = ['typescript', 'java', 'csharp', 'sql'] as const;
export type RunnerName = (typeof RUNNERS)[number];
/** Tags of locally built images (tests only; AWS deployments are built by the CDK). */
export const localImage = (name: RunnerName): string => `pracstack-lambda-${name}:local`;

const bundle = (entry: string, outfile: string, external: string[] = []) =>
  build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    external,
    logLevel: 'warning',
    banner: {
      js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
    },
  });

export async function buildContexts(): Promise<void> {
  rmSync(DIST, { recursive: true, force: true });
  const codeRunner = join(packages, 'code-runner');

  for (const lang of ['typescript', 'java', 'csharp'] as const) {
    const out = join(DIST, lang);
    mkdirSync(join(out, 'harness'), { recursive: true });
    cpSync(join(root, 'docker', `${lang}.Dockerfile`), join(out, 'Dockerfile'));
    cpSync(join(root, 'docker', 'entrypoint.sh'), join(out, 'entrypoint.sh'));
    await bundle(join(root, 'src', 'code-handler.ts'), join(out, 'handler.mjs'));
  }
  // TypeScript harness: the same files as the local Docker image, plus the shared executor.
  for (const file of ['harness.mjs', 'package.json'])
    cpSync(
      join(codeRunner, 'docker', 'typescript', file),
      join(DIST, 'typescript', 'harness', file),
    );
  await build({
    entryPoints: [join(packages, 'challenge-runtime', 'src', 'execute.ts')],
    outfile: join(DIST, 'typescript', 'harness', 'execute.mjs'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    logLevel: 'warning',
  });
  cpSync(
    join(codeRunner, 'docker', 'java', 'Harness.java'),
    join(DIST, 'java', 'harness', 'Harness.java'),
  );
  // C#: the same harness project as the local image; the Dockerfile publishes it.
  for (const file of ['Harness.cs', 'Harness.csproj'])
    cpSync(join(codeRunner, 'docker', 'csharp', file), join(DIST, 'csharp', 'harness', file));

  // SQL: handler, supervisor process and worker; PGlite is installed in the image.
  const sql = join(DIST, 'sql');
  mkdirSync(sql, { recursive: true });
  cpSync(join(root, 'docker', 'sql.Dockerfile'), join(sql, 'Dockerfile'));
  cpSync(join(root, 'docker', 'entrypoint.sh'), join(sql, 'entrypoint.sh'));
  const pglite = ['@electric-sql/pglite'];
  await bundle(join(root, 'src', 'sql-handler.ts'), join(sql, 'handler.mjs'), pglite);
  await bundle(
    join(packages, 'sql-engine', 'src', 'runtime', 'runner.ts'),
    join(sql, 'sql-runner.mjs'),
    pglite,
  );
  await bundle(
    join(packages, 'sql-engine', 'src', 'runtime', 'sql-worker.ts'),
    join(sql, 'sql-worker.mjs'),
    pglite,
  );
  // Run once while building the image: the empty cluster every query starts from.
  await bundle(
    join(packages, 'sql-engine', 'src', 'runtime', 'make-base-cluster.ts'),
    join(sql, 'make-base-cluster.mjs'),
    pglite,
  );
  writeFileSync(
    join(sql, 'package.json'),
    JSON.stringify(
      { private: true, type: 'module', dependencies: { '@electric-sql/pglite': '0.5.17' } },
      null,
      2,
    ),
  );
}

export function buildLocalImages(names: readonly RunnerName[] = RUNNERS): void {
  for (const name of names) {
    console.log(`Building ${localImage(name)}…`);
    const result = spawnSync(
      'docker',
      ['build', '--platform', 'linux/amd64', '--tag', localImage(name), join(DIST, name)],
      { stdio: 'inherit' },
    );
    if (result.status !== 0)
      throw new Error(`Building ${localImage(name)} failed. Is Docker running?`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await buildContexts();
  console.log(`Runner build contexts in ${DIST}`);
  if (process.argv.includes('--images')) buildLocalImages();
}
