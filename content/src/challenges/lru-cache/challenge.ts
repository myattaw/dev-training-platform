import { type ChallengeSource, operationTests } from '@pracstack/content-model';
import type { LRUCache } from './reference';

export const source: ChallengeSource = {
  challenge: {
    id: 'lru-cache',
    version: 1,
    title: 'LRU Cache',
    summary: 'Build a fixed-size cache that evicts the least recently used entry.',
    category: 'data-structures',
    difficulty: 'medium',
    tags: ['hash-maps', 'linked-lists', 'design'],
    instructions: [
      {
        kind: 'paragraph',
        text: 'Implement a cache with a fixed capacity. When it is full and a new key is added, it evicts the least recently used key.',
      },
      { kind: 'heading', text: 'Your task' },
      { kind: 'paragraph', text: 'Implement the class `LRUCache`:' },
      {
        kind: 'list',
        items: [
          '`new LRUCache(capacity)` creates an empty cache that holds at most `capacity` entries (`capacity >= 1`).',
          '`get(key)` returns the value for `key`, or `-1` if it is not in the cache.',
          '`put(key, value)` inserts or updates `key`. If this makes the cache exceed its capacity, remove the least recently used key.',
          'Both `get` and `put` count as using a key.',
        ],
      },
      {
        kind: 'code',
        code: 'const cache = new LRUCache(2);\ncache.put(1, 1);\ncache.put(2, 2);\ncache.get(1);    // 1 (key 1 is now most recent)\ncache.put(3, 3); // evicts key 2\ncache.get(2);    // -1',
      },
      { kind: 'heading', text: 'Going further' },
      {
        kind: 'paragraph',
        text: 'Aim for `get` and `put` in constant time on average. A `Map` remembers insertion order, which helps.',
      },
    ],
    languages: {
      typescript: {
        entryPoint: 'LRUCache',
        starterCode: `export class LRUCache {
  constructor(capacity: number) {
    // TODO: set up your storage
  }

  get(key: number): number {
    throw new Error('Not implemented');
  }

  put(key: number, value: number): void {
    throw new Error('Not implemented');
  }
}
`,
      },
      java: {
        entryPoint: 'LRUCache',
        starterCode: `class LRUCache {
    LRUCache(int capacity) {
        // TODO: set up your storage
    }

    int get(int key) {
        throw new UnsupportedOperationException("Not implemented");
    }

    void put(int key, int value) {
        throw new UnsupportedOperationException("Not implemented");
    }
}
`,
      },
    },
    visibleTests: operationTests<typeof LRUCache>([
      {
        description: 'stores and returns values',
        constructorArgs: [2],
        steps: [
          { call: 'put', args: [1, 10] },
          { call: 'put', args: [2, 20] },
          { call: 'get', args: [1], expected: 10 },
          { call: 'get', args: [2], expected: 20 },
        ],
      },
      {
        description: 'returns -1 for a missing key',
        constructorArgs: [1],
        steps: [{ call: 'get', args: [7], expected: -1 }],
      },
      {
        description: 'evicts the least recently used key',
        constructorArgs: [2],
        steps: [
          { call: 'put', args: [1, 1] },
          { call: 'put', args: [2, 2] },
          { call: 'put', args: [3, 3] },
          { call: 'get', args: [1], expected: -1 },
          { call: 'get', args: [3], expected: 3 },
        ],
      },
      {
        description: 'get makes a key recently used',
        constructorArgs: [2],
        steps: [
          { call: 'put', args: [1, 1] },
          { call: 'put', args: [2, 2] },
          { call: 'get', args: [1], expected: 1 },
          { call: 'put', args: [3, 3] },
          { call: 'get', args: [2], expected: -1 },
          { call: 'get', args: [1], expected: 1 },
        ],
      },
      {
        description: 'put updates an existing key',
        constructorArgs: [2],
        steps: [
          { call: 'put', args: [1, 1] },
          { call: 'put', args: [1, 100] },
          { call: 'get', args: [1], expected: 100 },
        ],
      },
    ]),
  },
  hiddenTests: operationTests<typeof LRUCache>([
    {
      description: 'updating a key makes it recently used',
      constructorArgs: [2],
      steps: [
        { call: 'put', args: [1, 1] },
        { call: 'put', args: [2, 2] },
        { call: 'put', args: [1, 10] },
        { call: 'put', args: [3, 3] },
        { call: 'get', args: [2], expected: -1 },
        { call: 'get', args: [1], expected: 10 },
      ],
    },
    {
      description: 'capacity of one',
      constructorArgs: [1],
      steps: [
        { call: 'put', args: [1, 1] },
        { call: 'put', args: [2, 2] },
        { call: 'get', args: [1], expected: -1 },
        { call: 'get', args: [2], expected: 2 },
      ],
    },
    {
      description: 'updating does not grow the cache',
      constructorArgs: [2],
      steps: [
        { call: 'put', args: [1, 1] },
        { call: 'put', args: [1, 2] },
        { call: 'put', args: [1, 3] },
        { call: 'put', args: [2, 2] },
        { call: 'get', args: [1], expected: 3 },
        { call: 'get', args: [2], expected: 2 },
      ],
    },
    {
      description: 'missing gets do not affect recency',
      constructorArgs: [2],
      steps: [
        { call: 'put', args: [1, 1] },
        { call: 'put', args: [2, 2] },
        { call: 'get', args: [9], expected: -1 },
        { call: 'put', args: [3, 3] },
        { call: 'get', args: [1], expected: -1 },
        { call: 'get', args: [2], expected: 2 },
      ],
    },
  ]),
};
