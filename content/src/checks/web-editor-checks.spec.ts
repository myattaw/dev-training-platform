import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { Language, Parser } from 'web-tree-sitter';
import { beforeAll, describe, expect, it } from 'vitest';
import { explainDiagnostic } from '../../../apps/web/src/app/features/web-challenges/editor/hints';
import { findJavaNameProblems } from '../../../apps/web/src/app/features/web-challenges/editor/names';
import { projectSymbols } from '../../../apps/web/src/app/features/web-challenges/editor/project-symbols';

/*
 * The web-challenge editor's checks while typing (unknown or unimported class
 * names in Java; syntax errors in Java and C#) must never flag
 * correct code. Every starter and reference project compiles, so none of their
 * files may get a finding.
 */

const ROOT = fileURLToPath(new URL('../web-challenges', import.meta.url));
const grammar = (file: string) =>
  fileURLToPath(new URL(`../../../apps/web/public/grammars/${file}`, import.meta.url));
const parsers: Record<'csharp' | 'java', Parser> = {} as never;

beforeAll(async () => {
  await Parser.init();
  for (const [language, file] of [
    ['csharp', 'tree-sitter-c_sharp.wasm.gz'],
    ['java', 'tree-sitter-java.wasm.gz'],
  ] as const) {
    const parser = new Parser();
    parser.setLanguage(await Language.load(gunzipSync(readFileSync(grammar(file)))));
    parsers[language] = parser;
  }
});

function readTree(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else files[relative(dir, full).replace(/\\/g, '/')] = readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return files;
}

/** Each challenge's starter, and the starter with the reference applied, per framework. */
function projects(framework: string): { name: string; files: Record<string, string> }[] {
  const found: { name: string; files: Record<string, string> }[] = [];
  for (const challenge of readdirSync(ROOT)) {
    const dir = join(ROOT, challenge, framework);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    const starter = readTree(join(dir, 'starter'));
    found.push({ name: `${challenge}/${framework}/starter`, files: starter });
    found.push({
      name: `${challenge}/${framework}/reference`,
      files: { ...starter, ...readTree(join(dir, 'reference')) },
    });
  }
  return found;
}

describe('web-challenge editor checks on correct projects', () => {
  it('finds no unknown or unimported class names in any Spring Boot project', () => {
    const all = projects('spring-boot');
    expect(all.length).toBeGreaterThanOrEqual(16);
    const found: string[] = [];
    for (const { name, files } of all) {
      const { symbols } = projectSymbols(files);
      for (const [path, text] of Object.entries(files)) {
        if (!path.endsWith('.java')) continue;
        for (const p of findJavaNameProblems(text, symbols)) {
          found.push(`${name}/${path}:${p.line}: ${p.message}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('finds no syntax errors in any Java or C# file', () => {
    const found: string[] = [];
    for (const [framework, language, ext] of [
      ['spring-boot', 'java', '.java'],
      ['aspnetcore', 'csharp', '.cs'],
    ] as const) {
      for (const { name, files } of projects(framework)) {
        for (const [path, text] of Object.entries(files)) {
          if (!path.endsWith(ext)) continue;
          const tree = parsers[language].parse(text);
          if (!tree) throw new Error(`no parse tree for ${path}`);
          try {
            if (tree.rootNode.hasError) found.push(`${name}/${path}: syntax error`);
          } finally {
            tree.delete();
          }
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('explains the ResponseBody typo from the real compiler message', () => {
    const [project] = projects('spring-boot').filter(
      (p) => p.name.startsWith('employee-rest-api/') && p.name.endsWith('/reference'),
    );
    const files = { ...project!.files };
    const path = Object.keys(files).find((p) => files[p]!.includes('ResponseEntity.'))!;
    files[path] = files[path]!.replace('ResponseEntity.', 'ResponseBody.');
    const line = files[path]!.split('\n').findIndex((l) => l.includes('ResponseBody.')) + 1;
    expect(
      explainDiagnostic({ file: path, line, message: 'cannot find symbol: ResponseBody' }, files),
    ).toMatchObject({
      message: 'cannot find symbol: ResponseBody. Did you mean ResponseEntity?',
      fix: { kind: 'replace', with: 'ResponseEntity' },
    });
  });
});
