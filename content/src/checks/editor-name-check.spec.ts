import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Language, Parser } from 'web-tree-sitter';
import { beforeAll, describe, expect, it } from 'vitest';
import { undefinedNames } from '../../../apps/web/src/app/shared/editor/workers/undefined-names';
import { CHALLENGES } from '../challenges';
import { TRACKS } from '../skill-mastery';
import { collectCSharpSnippets } from './csharp-snippets';

/*
 * The editor's live "name declared nowhere" check (C# and Java) must never
 * flag correct code. Every reference solution, starter file and C# snippet in
 * the content is correct code, so none may get a finding.
 */

const grammar = (file: string) =>
  fileURLToPath(new URL(`../../../apps/web/public/grammars/${file}`, import.meta.url));
const parsers: Record<'csharp' | 'java', Parser> = {} as never;

beforeAll(async () => {
  await Parser.init();
  for (const [language, file] of [
    ['csharp', 'tree-sitter-c_sharp.wasm'],
    ['java', 'tree-sitter-java.wasm'],
  ] as const) {
    const parser = new Parser();
    parser.setLanguage(await Language.load(grammar(file)));
    parsers[language] = parser;
  }
});

function findings(language: 'csharp' | 'java', code: string): string[] {
  const tree = parsers[language].parse(code);
  if (!tree) throw new Error('no parse tree');
  try {
    return undefinedNames(tree.rootNode, language).map((d) => `${d.line}:${d.column} ${d.message}`);
  } finally {
    tree.delete();
  }
}

describe('editor name check', () => {
  it('flags a name declared nowhere, and nothing else', () => {
    expect(
      findings('csharp', 'class S { static bool F(string sentence) { var seen = 1; return ew; } }'),
    ).toEqual(["1:65 The name 'ew' does not exist here: it is not declared in this file."]);
    expect(findings('java', 'class S { static int f(int v) { return v + w; } }')).toHaveLength(1);
  });

  it('never flags the challenges reference solutions or starter code', () => {
    const dir = fileURLToPath(new URL('../challenges', import.meta.url));
    const sources: [string, 'csharp' | 'java', string][] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      for (const [file, language] of [
        ['Reference.cs', 'csharp'],
        ['Reference.java', 'java'],
      ] as const) {
        const path = `${dir}/${entry.name}/${file}`;
        if (existsSync(path)) sources.push([path, language, readFileSync(path, 'utf8')]);
      }
    }
    for (const { source } of CHALLENGES) {
      for (const language of ['csharp', 'java'] as const) {
        const starter = source.challenge.languages[language]?.starterCode;
        if (starter) sources.push([`${source.challenge.id} starter`, language, starter]);
      }
    }
    expect(sources.length).toBeGreaterThan(20);
    const flagged = sources
      .map(([name, language, code]) => [name, findings(language, code)] as const)
      .filter(([, f]) => f.length > 0);
    expect(flagged).toEqual([]);
  });

  it('never flags the C# snippets in Skill Mastery', () => {
    const snippets = collectCSharpSnippets(TRACKS);
    expect(snippets.length).toBeGreaterThan(100);
    const flagged = snippets
      .map((s) => [s.path, findings('csharp', s.source)] as const)
      .filter(([, f]) => f.length > 0);
    expect(flagged).toEqual([]);
  });
});
