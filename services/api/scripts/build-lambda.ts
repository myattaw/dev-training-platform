/**
 * Bundles the API Lambda function: one ESM file plus the generated content.
 *
 *   npm run build:lambda -w @pracstack/api      # → services/api/dist/lambda
 *
 * Requires generated content (`npm run content:build`). Fails if the bundle
 * contains code-execution machinery (the SQL engine or the code runner): the
 * API function must never run learner code.
 */
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

/** Packages that must never be part of the API function. */
const FORBIDDEN = [
  /@electric-sql[\\/]pglite/,
  /packages[\\/]sql-engine[\\/]src[\\/]runtime/,
  /docker-runner\.ts$/,
];

export interface LambdaBuild {
  readonly outDir: string;
  readonly bundleBytes: number;
}

export async function buildLambda(
  outDir = resolve(here, '../dist/lambda'),
  contentDist = join(repoRoot, 'content', 'dist'),
): Promise<LambdaBuild> {
  if (!existsSync(join(contentDist, 'public'))) {
    throw new Error(`No generated content in ${contentDist}. Run "npm run content:build" first.`);
  }
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const result = await build({
    entryPoints: [resolve(here, '../src/lambda/handler.ts')],
    outfile: join(outDir, 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    minify: true,
    sourcemap: 'linked',
    metafile: true,
    legalComments: 'none',
    // Some dependencies are CommonJS and call require(); give the ESM bundle one.
    banner: {
      js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
    },
    logLevel: 'warning',
  });

  // Files whose code actually ended up in the bundle (parsed-but-tree-shaken files have 0 bytes).
  const inputs = Object.values(result.metafile.outputs).flatMap((output) =>
    Object.entries(output.inputs)
      .filter(([, info]) => info.bytesInOutput > 0)
      .map(([file]) => file),
  );
  const forbidden = inputs.filter((file) => FORBIDDEN.some((re) => re.test(file)));
  if (forbidden.length > 0) {
    throw new Error(
      `The API bundle must not contain code-execution machinery, but includes:\n  ${forbidden.join('\n  ')}`,
    );
  }

  // Public and private content (hidden tests, answers): only ever inside the function.
  cpSync(contentDist, join(outDir, 'content'), { recursive: true });
  await buildGithubBridge(resolve(outDir, '../github-oidc'));
  return { outDir, bundleBytes: statSync(join(outDir, 'index.mjs')).size };
}

/**
 * The GitHub sign-in bridge (src/lambda/github-oidc.ts): its own function with
 * internet access, so it gets its own bundle without any content and without
 * the API's code.
 */
export async function buildGithubBridge(outDir: string): Promise<void> {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const result = await build({
    entryPoints: [resolve(here, '../src/lambda/github-oidc.ts')],
    outfile: join(outDir, 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    minify: true,
    sourcemap: 'linked',
    metafile: true,
    legalComments: 'none',
    banner: {
      js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
    },
    logLevel: 'warning',
  });
  const inputs = Object.values(result.metafile.outputs).flatMap((output) =>
    Object.entries(output.inputs)
      .filter(([, info]) => info.bytesInOutput > 0)
      .map(([file]) => file),
  );
  const unexpected = inputs.filter(
    (file) => /services[\\/]api[\\/]src[\\/]/.test(file) && !/github-oidc/.test(file),
  );
  if (unexpected.length > 0) {
    throw new Error(
      `The GitHub bridge bundle must contain only the bridge, but includes:\n  ${unexpected.join('\n  ')}`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { outDir, bundleBytes } = await buildLambda();
  console.log(`Lambda bundle: ${outDir} (${(bundleBytes / 1024).toFixed(0)} KB + content)`);
}
