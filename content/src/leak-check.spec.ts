import { ChildProcessSqlEngine } from '@pracstack/sql-engine';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildContent, type ContentBuild } from './build';
import { findLeaks, sensitiveStrings } from './leak-check';

describe('leak check', { timeout: 120_000 }, () => {
  let build: ContentBuild;
  let sensitive: string[];
  beforeAll(async () => {
    const sqlEngine = new ChildProcessSqlEngine();
    try {
      build = await buildContent({ sqlEngine });
    } finally {
      await sqlEngine.close();
    }
    sensitive = sensitiveStrings(build.privateFiles, build.publicFiles);
  }, 120_000);

  it('treats hidden tests, hints, explanations and question prompts as sensitive', () => {
    expect(sensitive).toContain('pangram with non-ASCII letters mixed in');
    expect(sensitive).toContain('Which values are falsy in JavaScript?');
    expect(sensitive.length).toBeGreaterThan(50);
  });

  it('does not treat schema vocabulary such as question format names as content', () => {
    expect(sensitive).not.toContain('multiple-choice');
    expect(sensitive).not.toContain('fill-in-blank');
  });

  it('does not flag text that is also public', () => {
    expect(sensitive).not.toContain(
      'Check whether a sentence contains every letter of the alphabet.',
    );
  });

  it('finds nothing in the public content itself', () => {
    const bundle = new Map([...build.publicFiles].map(([path, v]) => [path, JSON.stringify(v)]));
    expect(findLeaks(sensitive, bundle)).toEqual([]);
  });

  it('detects a private string in a bundle file, raw or JSON-escaped', () => {
    const secret = 'Which values are falsy in JavaScript?';
    const bundle = new Map([
      ['main.js', `const x = ${JSON.stringify({ hint: secret })};`],
      ['clean.js', 'console.log("nothing to see");'],
    ]);
    expect(findLeaks(sensitive, bundle)).toEqual([{ file: 'main.js', value: secret }]);
  });

  it('detects single-quoted and template literals too', () => {
    const secret = 'Which values are falsy in JavaScript?';
    expect(findLeaks(sensitive, new Map([['a.js', `x='${secret}'`]]))).toHaveLength(1);
    expect(findLeaks(sensitive, new Map([['b.js', `x=\`${secret}\``]]))).toHaveLength(1);
  });

  it('ignores a private phrase that only appears inside a longer third-party string', () => {
    // Real case: TypeScript's compiler messages contain "a single character",
    // which is also the description of a hidden test.
    expect(sensitive).toContain('a single character');
    const bundle = new Map([
      ['worker.js', '"Anything that would possibly match more than a single character is invalid"'],
    ]);
    expect(findLeaks(sensitive, bundle)).toEqual([]);
  });

  it('detects private files copied into the bundle', () => {
    const bundle = new Map([['content/challenges/pangram@1.grading.json', '{}']]);
    expect(findLeaks(sensitive, bundle)).toHaveLength(1);
  });
});
