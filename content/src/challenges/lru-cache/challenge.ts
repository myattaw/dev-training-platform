import { type ChallengeSource, operationTests } from '@pracstack/content-model';
import { operationsAdapter } from '../swift-adapter';
import type { LRUCache } from './reference';

export const source: ChallengeSource = {
  challenge: {
    id: 'lru-cache',
    version: 2,
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
        text: 'Aim for `get` and `put` in constant time on average. A hash map that remembers insertion order (`Map` in TypeScript, `LinkedHashMap` in Java, `OrderedDict` in Python), or a hash map plus a doubly linked list (`LinkedList<T>` in C#, your own node class in Swift), helps.',
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
      csharp: {
        entryPoint: 'LRUCache',
        starterCode: `public class LRUCache
{
    /// <summary>Creates an empty cache that holds at most <paramref name="capacity"/> entries.</summary>
    public LRUCache(int capacity)
    {
        // TODO: set up your storage
    }

    /// <summary>Returns the value for <paramref name="key"/>, or -1 if it is not in the cache.</summary>
    public int Get(int key)
    {
        // TODO: implement me
        throw new NotImplementedException("Remove this line and implement the method");
    }

    /// <summary>Inserts or updates <paramref name="key"/>, evicting the least recently used key when full.</summary>
    public void Put(int key, int value)
    {
        // TODO: implement me
        throw new NotImplementedException("Remove this line and implement the method");
    }
}
`,
      },
      python: {
        entryPoint: 'LRUCache',
        starterCode: `class LRUCache:
    def __init__(self, capacity: int):
        """Creates an empty cache that holds at most capacity entries."""
        # TODO: set up your storage

    def get(self, key: int) -> int:
        """Returns the value for key, or -1 if it is not in the cache."""
        # TODO: implement me
        raise NotImplementedError("Remove this line and implement the method")

    def put(self, key: int, value: int) -> None:
        """Inserts or updates key, evicting the least recently used key when full."""
        # TODO: implement me
        raise NotImplementedError("Remove this line and implement the method")
`,
      },
      swift: {
        entryPoint: 'LRUCache',
        starterCode: `final class LRUCache {
    /// Creates an empty cache that holds at most \`capacity\` entries.
    init(capacity: Int) {
        // TODO: set up your storage
    }

    /// Returns the value for \`key\`, or -1 if it is not in the cache.
    func get(_ key: Int) -> Int {
        // TODO: implement me
        fatalError("Remove this line and implement the method")
    }

    /// Inserts or updates \`key\`, evicting the least recently used key when full.
    func put(_ key: Int, _ value: Int) {
        // TODO: implement me
        fatalError("Remove this line and implement the method")
    }
}
`,
        supportCode: operationsAdapter('LRUCache', 'LRUCache(capacity: try arg(args, 0))', {
          get: 'return object.get(try arg(args, 0))',
          put: 'object.put(try arg(args, 0), try arg(args, 1)); return PracStackVoid()',
        }),
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
