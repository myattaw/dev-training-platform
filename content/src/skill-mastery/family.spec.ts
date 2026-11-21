import { describe, expect, it } from 'vitest';
import { choice, family, seededShuffle } from './family';
import { text } from './helpers';

const build = (v: { key: string; n: number }) => ({
  difficulty: 1 as const,
  format: 'predict-output' as const,
  prompt: text(`Print ${v.n}`),
  code: { language: 'typescript' as const, source: `console.log(${v.n});` },
  answer: { output: String(v.n) },
  hints: [],
  explanation: text('It prints the number.'),
});

describe('family', () => {
  it('gives each variant a stable id from its key, and the family id', () => {
    const qs = family(
      'print-number',
      [
        { key: 'one', n: 1 },
        { key: 'two', n: 2 },
      ],
      build,
    );
    expect(qs.map((q) => [q.id, q.family, q.version])).toEqual([
      ['print-number-one', 'print-number', 1],
      ['print-number-two', 'print-number', 1],
    ]);
    // Reordering variants does not change ids.
    const reordered = family(
      'print-number',
      [
        { key: 'two', n: 2 },
        { key: 'one', n: 1 },
      ],
      build,
    );
    expect(reordered.find((q) => q.id === 'print-number-one')).toEqual(qs[0]);
  });

  it('rejects duplicate or malformed keys', () => {
    expect(() =>
      family(
        'f',
        [
          { key: 'a', n: 1 },
          { key: 'a', n: 2 },
        ],
        build,
      ),
    ).toThrow('duplicate variant key "a"');
    expect(() => family('f', [{ key: 'Bad Key', n: 1 }], build)).toThrow('must be kebab-case');
  });
});

describe('seeded helpers', () => {
  it('shuffle deterministically per seed, and differently across seeds', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(seededShuffle(items, 's1')).toEqual(seededShuffle(items, 's1'));
    expect(seededShuffle(items, 's1')).not.toEqual(seededShuffle(items, 's2'));
    expect([...seededShuffle(items, 's1')].sort()).toEqual(items);
  });

  it('choice keeps the right answer marked wherever it lands', () => {
    const positions = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const q = choice(`seed-${i}`, 'right', ['w1', 'w2', 'w3']);
      const correct = q.options.find((o) => o.id === q.answer.correct[0]);
      expect(correct?.text).toBe('right');
      positions.add(q.answer.correct[0] ?? '');
    }
    expect(positions.size).toBeGreaterThan(1);
  });
});
