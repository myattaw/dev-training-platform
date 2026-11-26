/**
 * Prepares the Docker build contexts of the three runner functions:
 *
 *   services/runners/dist/{typescript,java,csharp,sql}/   Dockerfile + everything it copies
 *   services/runners/dist/web-{aspnetcore,spring-boot,django}/   web-challenge runners
 *
 *   npm run build -w @pracstack/runners              # contexts only (CDK builds the images)
 *   npm run build -w @pracstack/runners -- --images  # also build local images for the tests
 *   npm run build -w @pracstack/runners -- --web-images  # also build the web runner images
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
export const localImage = (name: RunnerName | WebRunnerName): string =>
  `pracstack-lambda-${name}:local`;
/** Web-challenge runner functions (one per framework; see src/web-handler.ts). */
export const WEB_RUNNERS = ['web-aspnetcore', 'web-spring-boot', 'web-django'] as const;
export type WebRunnerName = (typeof WEB_RUNNERS)[number];

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
  await buildWebContexts();
  writeFileSync(
    join(sql, 'package.json'),
    JSON.stringify(
      { private: true, type: 'module', dependencies: { '@electric-sql/pglite': '0.5.17' } },
      null,
      2,
    ),
  );
}

/** Web runners: the handler, the framework's run.sh (as in the local image) and its pinned dependencies. */
async function buildWebContexts(): Promise<void> {
  const webDocker = join(packages, 'web-runner', 'docker');
  for (const name of WEB_RUNNERS) {
    const framework = name.slice('web-'.length);
    const out = join(DIST, name);
    mkdirSync(out, { recursive: true });
    cpSync(join(root, 'docker', `${name}.Dockerfile`), join(out, 'Dockerfile'));
    cpSync(join(root, 'docker', 'web-entrypoint.sh'), join(out, 'web-entrypoint.sh'));
    cpSync(join(webDocker, framework, 'run.sh'), join(out, 'run.sh'));
    if (framework === 'spring-boot')
      cpSync(join(webDocker, framework, 'libs'), join(out, 'libs'), { recursive: true });
    if (framework === 'django')
      cpSync(join(webDocker, framework, 'requirements.txt'), join(out, 'requirements.txt'));
    await bundle(join(root, 'src', 'web-handler.ts'), join(out, 'handler.mjs'));
  }
}

export function buildLocalImages(names: readonly (RunnerName | WebRunnerName)[] = RUNNERS): void {
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
  if (process.argv.includes('--web-images')) buildLocalImages(WEB_RUNNERS);
}
