import { callTests, type ChallengeSource } from '@pracstack/content-model';

type Interval = [start: number, end: number];

export const source: ChallengeSource = {
  challenge: {
    id: 'merge-intervals',
    version: 1,
    title: 'Merge Intervals',
    summary: 'Merge overlapping ranges into the smallest set of non-overlapping ranges.',
    category: 'arrays',
    difficulty: 'medium',
    tags: ['arrays', 'sorting'],
    instructions: [
      {
        kind: 'paragraph',
        text: 'You are given a list of closed intervals `[start, end]` in any order. Merge every group of overlapping intervals into one.',
      },
      { kind: 'code', code: 'merge([[1, 3], [8, 10], [2, 6]])\n// → [[1, 6], [8, 10]]' },
      { kind: 'heading', text: 'Rules' },
      {
        kind: 'list',
        items: [
          'Intervals that touch overlap: `[1, 4]` and `[4, 5]` become `[1, 5]`.',
          'Return the merged intervals sorted by start.',
          'Every input interval has `start <= end`.',
          'Do not modify the input array.',
        ],
      },
      { kind: 'heading', text: 'Your task' },
      { kind: 'paragraph', text: 'Implement `merge(intervals)`.' },
    ],
    languages: {
      typescript: {
        entryPoint: 'merge',
        starterCode: `export type Interval = [start: number, end: number];

export function merge(intervals: Interval[]): Interval[] {
  // TODO: implement me
  throw new Error('Remove this line and implement the function');
}
`,
      },
      java: {
        entryPoint: 'merge',
        starterCode: `class Solution {
    /**
     * Each interval is a pair {start, end}. Return the merged intervals, sorted by start.
     */
    static int[][] merge(int[][] intervals) {
        // TODO: implement me
        throw new UnsupportedOperationException("Remove this line and implement the method");
    }
}
`,
      },
      csharp: {
        entryPoint: 'merge',
        starterCode: `public static class Solution
{
    /// <summary>
    /// Each interval is a pair { start, end }. Returns the merged intervals, sorted by start.
    /// </summary>
    public static int[][] Merge(int[][] intervals)
    {
        // TODO: implement me
        throw new NotImplementedException("Remove this line and implement the method");
    }
}
`,
      },
    },
    visibleTests: callTests<(intervals: Interval[]) => Interval[]>([
      { description: 'no intervals', input: [[]], expected: [] },
      { description: 'a single interval', input: [[[1, 2]]], expected: [[1, 2]] },
      {
        description: 'non-overlapping, already sorted',
        input: [
          [
            [1, 2],
            [4, 5],
          ],
        ],
        expected: [
          [1, 2],
          [4, 5],
        ],
      },
      {
        description: 'two overlapping intervals',
        input: [
          [
            [1, 3],
            [2, 6],
          ],
        ],
        expected: [[1, 6]],
      },
      {
        description: 'touching intervals merge',
        input: [
          [
            [1, 4],
            [4, 5],
          ],
        ],
        expected: [[1, 5]],
      },
      {
        description: 'unsorted input',
        input: [
          [
            [8, 10],
            [1, 3],
            [2, 6],
            [15, 18],
          ],
        ],
        expected: [
          [1, 6],
          [8, 10],
          [15, 18],
        ],
      },
      {
        description: 'one interval contains another',
        input: [
          [
            [1, 10],
            [2, 3],
          ],
        ],
        expected: [[1, 10]],
      },
      {
        description: 'everything collapses into one',
        input: [
          [
            [5, 6],
            [1, 2],
            [2, 5],
          ],
        ],
        expected: [[1, 6]],
      },
    ]),
  },
  hiddenTests: callTests<(intervals: Interval[]) => Interval[]>([
    {
      description: 'negative numbers',
      input: [
        [
          [-5, -1],
          [-3, 2],
        ],
      ],
      expected: [[-5, 2]],
    },
    {
      description: 'duplicate intervals',
      input: [
        [
          [1, 2],
          [1, 2],
        ],
      ],
      expected: [[1, 2]],
    },
    {
      description: 'zero-length interval',
      input: [
        [
          [3, 3],
          [1, 2],
        ],
      ],
      expected: [
        [1, 2],
        [3, 3],
      ],
    },
    {
      description: 'reverse order, no overlap',
      input: [
        [
          [9, 10],
          [5, 6],
          [1, 2],
        ],
      ],
      expected: [
        [1, 2],
        [5, 6],
        [9, 10],
      ],
    },
  ]),
};
