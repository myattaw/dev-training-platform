import { type ChallengeSource, operationTests } from '@pracstack/content-model';
import { operationsAdapter } from '../swift-adapter';
import type { TextBuffer } from './reference';

export const source: ChallengeSource = {
  challenge: {
    id: 'text-cursor-buffer',
    version: 2,
    title: 'Text Buffer with a Cursor',
    summary: 'Build the text buffer behind an editor: insert, backspace and move a cursor.',
    category: 'data-structures',
    difficulty: 'medium',
    tags: ['cursor-state', 'text-editing', 'index-boundaries', 'stacks', 'design'],
    instructions: [
      {
        kind: 'paragraph',
        text: 'Every text editor keeps the document in a buffer with a cursor. Build one. The cursor sits between two characters, or at either end of the text; it starts at position 0 in an empty buffer.',
      },
      { kind: 'heading', text: 'Your task' },
      { kind: 'paragraph', text: 'Implement the class `TextBuffer`:' },
      {
        kind: 'list',
        items: [
          '`new TextBuffer()` creates an empty buffer.',
          '`insert(text)` inserts `text` at the cursor and moves the cursor to just after it.',
          '`backspace(count)` deletes up to `count` characters before the cursor and returns how many were deleted.',
          '`move(offset)` moves the cursor `offset` characters (left when negative, right when positive), stopping at the start or end of the text. It returns the new cursor position.',
          '`textAround(radius)` returns up to `radius` characters on each side of the cursor, with `|` marking the cursor.',
          '`getText()` returns the whole text; `getCursor()` returns the cursor position (the number of characters before it).',
        ],
      },
      {
        kind: 'paragraph',
        text: 'Text contains printable ASCII characters only. `count` and `radius` are 0 or more.',
      },
      {
        kind: 'code',
        code: 'const buffer = new TextBuffer();\nbuffer.insert("helo");\nbuffer.move(-1);        // 3\nbuffer.insert("l");\nbuffer.getText();       // "hello"\nbuffer.textAround(2);   // "ll|o"\nbuffer.backspace(10);   // 4\nbuffer.getText();       // "o"',
      },
      { kind: 'heading', text: 'Going further' },
      {
        kind: 'paragraph',
        text: 'Rebuilding a string on every keystroke is slow for long documents. Keep the characters before the cursor and the characters after it in two stacks: typing and backspace touch only the top of one stack, and moving the cursor by `k` costs `k` steps.',
      },
    ],
    languages: {
      typescript: {
        entryPoint: 'TextBuffer',
        starterCode: `export class TextBuffer {
  insert(text: string): void {
    throw new Error('Not implemented');
  }

  backspace(count: number): number {
    throw new Error('Not implemented');
  }

  move(offset: number): number {
    throw new Error('Not implemented');
  }

  textAround(radius: number): string {
    throw new Error('Not implemented');
  }

  getText(): string {
    throw new Error('Not implemented');
  }

  getCursor(): number {
    throw new Error('Not implemented');
  }
}
`,
      },
      java: {
        entryPoint: 'TextBuffer',
        starterCode: `class TextBuffer {
    TextBuffer() {
        // TODO: set up your storage
    }

    void insert(String text) {
        throw new UnsupportedOperationException("Not implemented");
    }

    int backspace(int count) {
        throw new UnsupportedOperationException("Not implemented");
    }

    int move(int offset) {
        throw new UnsupportedOperationException("Not implemented");
    }

    String textAround(int radius) {
        throw new UnsupportedOperationException("Not implemented");
    }

    String getText() {
        throw new UnsupportedOperationException("Not implemented");
    }

    int getCursor() {
        throw new UnsupportedOperationException("Not implemented");
    }
}
`,
      },
      csharp: {
        entryPoint: 'TextBuffer',
        starterCode: `public class TextBuffer
{
    public TextBuffer()
    {
        // TODO: set up your storage
    }

    /// <summary>Inserts <paramref name="text"/> at the cursor and moves the cursor to just after it.</summary>
    public void Insert(string text)
    {
        // TODO: implement me
        throw new NotImplementedException("Remove this line and implement the method");
    }

    /// <summary>Deletes up to <paramref name="count"/> characters before the cursor; returns how many were deleted.</summary>
    public int Backspace(int count)
    {
        // TODO: implement me
        throw new NotImplementedException("Remove this line and implement the method");
    }

    /// <summary>Moves the cursor, stopping at either end of the text; returns the new cursor position.</summary>
    public int Move(int offset)
    {
        // TODO: implement me
        throw new NotImplementedException("Remove this line and implement the method");
    }

    /// <summary>Returns up to <paramref name="radius"/> characters on each side of the cursor, with | marking it.</summary>
    public string TextAround(int radius)
    {
        // TODO: implement me
        throw new NotImplementedException("Remove this line and implement the method");
    }

    /// <summary>Returns the whole text.</summary>
    public string GetText()
    {
        // TODO: implement me
        throw new NotImplementedException("Remove this line and implement the method");
    }

    /// <summary>Returns the cursor position (the number of characters before it).</summary>
    public int GetCursor()
    {
        // TODO: implement me
        throw new NotImplementedException("Remove this line and implement the method");
    }
}
`,
      },
      python: {
        entryPoint: 'TextBuffer',
        starterCode: `class TextBuffer:
    def __init__(self):
        # TODO: set up your storage
        pass

    def insert(self, text: str) -> None:
        """Inserts text at the cursor and moves the cursor to just after it."""
        # TODO: implement me
        raise NotImplementedError("Remove this line and implement the method")

    def backspace(self, count: int) -> int:
        """Deletes up to count characters before the cursor; returns how many were deleted."""
        # TODO: implement me
        raise NotImplementedError("Remove this line and implement the method")

    def move(self, offset: int) -> int:
        """Moves the cursor, stopping at either end of the text; returns the new cursor position."""
        # TODO: implement me
        raise NotImplementedError("Remove this line and implement the method")

    def text_around(self, radius: int) -> str:
        """Returns up to radius characters on each side of the cursor, with | marking it."""
        # TODO: implement me
        raise NotImplementedError("Remove this line and implement the method")

    def get_text(self) -> str:
        """Returns the whole text."""
        # TODO: implement me
        raise NotImplementedError("Remove this line and implement the method")

    def get_cursor(self) -> int:
        """Returns the cursor position (the number of characters before it)."""
        # TODO: implement me
        raise NotImplementedError("Remove this line and implement the method")
`,
      },
      swift: {
        entryPoint: 'TextBuffer',
        starterCode: `final class TextBuffer {
    init() {
        // TODO: set up your storage
    }

    /// Inserts \`text\` at the cursor and moves the cursor to just after it.
    func insert(_ text: String) {
        // TODO: implement me
        fatalError("Remove this line and implement the method")
    }

    /// Deletes up to \`count\` characters before the cursor; returns how many were deleted.
    func backspace(_ count: Int) -> Int {
        // TODO: implement me
        fatalError("Remove this line and implement the method")
    }

    /// Moves the cursor, stopping at either end of the text; returns the new cursor position.
    func move(_ offset: Int) -> Int {
        // TODO: implement me
        fatalError("Remove this line and implement the method")
    }

    /// Returns up to \`radius\` characters on each side of the cursor, with | marking it.
    func textAround(_ radius: Int) -> String {
        // TODO: implement me
        fatalError("Remove this line and implement the method")
    }

    /// Returns the whole text.
    func getText() -> String {
        // TODO: implement me
        fatalError("Remove this line and implement the method")
    }

    /// Returns the cursor position (the number of characters before it).
    func getCursor() -> Int {
        // TODO: implement me
        fatalError("Remove this line and implement the method")
    }
}
`,
        supportCode: operationsAdapter('TextBuffer', 'TextBuffer()', {
          insert: 'object.insert(try arg(args, 0)); return PracStackVoid()',
          backspace: 'return object.backspace(try arg(args, 0))',
          move: 'return object.move(try arg(args, 0))',
          textAround: 'return object.textAround(try arg(args, 0))',
          getText: 'return object.getText()',
          getCursor: 'return object.getCursor()',
        }),
      },
    },
    visibleTests: operationTests<typeof TextBuffer>([
      {
        description: 'inserts at the cursor',
        constructorArgs: [],
        steps: [
          { call: 'insert', args: ['hello'] },
          { call: 'getText', args: [], expected: 'hello' },
          { call: 'getCursor', args: [], expected: 5 },
        ],
      },
      {
        description: 'inserts in the middle after moving',
        constructorArgs: [],
        steps: [
          { call: 'insert', args: ['helo'] },
          { call: 'move', args: [-1], expected: 3 },
          { call: 'insert', args: ['l'] },
          { call: 'getText', args: [], expected: 'hello' },
          { call: 'getCursor', args: [], expected: 4 },
        ],
      },
      {
        description: 'backspace returns how many characters it deleted',
        constructorArgs: [],
        steps: [
          { call: 'insert', args: ['abc'] },
          { call: 'backspace', args: [5], expected: 3 },
          { call: 'getText', args: [], expected: '' },
        ],
      },
      {
        description: 'moving stops at both ends',
        constructorArgs: [],
        steps: [
          { call: 'insert', args: ['abc'] },
          { call: 'move', args: [-10], expected: 0 },
          { call: 'move', args: [10], expected: 3 },
        ],
      },
      {
        description: 'shows the text around the cursor',
        constructorArgs: [],
        steps: [
          { call: 'insert', args: ['abcdef'] },
          { call: 'move', args: [-2], expected: 4 },
          { call: 'textAround', args: [2], expected: 'cd|ef' },
          { call: 'textAround', args: [10], expected: 'abcd|ef' },
        ],
      },
    ]),
  },
  hiddenTests: operationTests<typeof TextBuffer>([
    {
      description: 'backspace in the middle keeps the text after the cursor',
      constructorArgs: [],
      steps: [
        { call: 'insert', args: ['abcdef'] },
        { call: 'move', args: [-3], expected: 3 },
        { call: 'backspace', args: [2], expected: 2 },
        { call: 'getText', args: [], expected: 'adef' },
        { call: 'getCursor', args: [], expected: 1 },
      ],
    },
    {
      description: 'radius zero shows only the cursor',
      constructorArgs: [],
      steps: [
        { call: 'insert', args: ['abc'] },
        { call: 'textAround', args: [0], expected: '|' },
      ],
    },
    {
      description: 'an empty buffer',
      constructorArgs: [],
      steps: [
        { call: 'getText', args: [], expected: '' },
        { call: 'move', args: [-1], expected: 0 },
        { call: 'backspace', args: [1], expected: 0 },
        { call: 'textAround', args: [3], expected: '|' },
      ],
    },
    {
      description: 'a longer editing session',
      constructorArgs: [],
      steps: [
        { call: 'insert', args: ['one'] },
        { call: 'insert', args: [' two'] },
        { call: 'move', args: [-4], expected: 3 },
        { call: 'insert', args: [','] },
        { call: 'getText', args: [], expected: 'one, two' },
        { call: 'move', args: [100], expected: 8 },
        { call: 'backspace', args: [4], expected: 4 },
        { call: 'getText', args: [], expected: 'one,' },
      ],
    },
    {
      description: 'moving by zero',
      constructorArgs: [],
      steps: [
        { call: 'insert', args: ['ab'] },
        { call: 'move', args: [0], expected: 2 },
      ],
    },
    {
      description: 'radius one in the middle',
      constructorArgs: [],
      steps: [
        { call: 'insert', args: ['abc'] },
        { call: 'move', args: [-1], expected: 2 },
        { call: 'textAround', args: [1], expected: 'b|c' },
      ],
    },
  ]),
};
