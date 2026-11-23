import { callTests, type ChallengeSource } from '@pracstack/content-model';

type ApplyEdits = (commands: string[]) => string;

export const source: ChallengeSource = {
  challenge: {
    id: 'apply-edit-commands',
    version: 1,
    title: 'Apply Edit Commands',
    summary: 'Replay a list of editor commands and return the final text.',
    category: 'parsing',
    difficulty: 'easy',
    tags: ['command-parsing', 'text-editing', 'cursor-state', 'index-boundaries', 'strings'],
    instructions: [
      {
        kind: 'paragraph',
        text: 'A simple text editor records every keystroke as a command. Replay the commands and return the text the editor ends up with.',
      },
      {
        kind: 'paragraph',
        text: 'The editor starts empty, with the cursor at position 0. The cursor always sits between two characters (or at either end of the text).',
      },
      { kind: 'heading', text: 'Commands' },
      {
        kind: 'list',
        items: [
          '`type <text>`: insert `<text>` at the cursor; the cursor moves to just after it. The text is everything after the first space, and may itself contain spaces.',
          '`left <n>` and `right <n>`: move the cursor `n` characters, stopping at the start or end of the text.',
          '`backspace <n>`: delete up to `n` characters before the cursor.',
          '`delete <n>`: delete up to `n` characters after the cursor.',
          '`home` and `end`: move the cursor to the start or end of the text.',
        ],
      },
      {
        kind: 'paragraph',
        text: '`n` is a whole number (0 or more). Ignore any command that is not in this list or has an invalid `n`.',
      },
      {
        kind: 'code',
        code: 'applyEdits(["type world", "home", "type hello "])    // "hello world"\napplyEdits(["type abcdef", "left 2", "backspace 2"])  // "abef"',
      },
      { kind: 'heading', text: 'Your task' },
      {
        kind: 'paragraph',
        text: 'Implement `applyEdits(commands)` so it returns the final text.',
      },
      { kind: 'heading', text: 'Going further' },
      {
        kind: 'paragraph',
        text: 'Keeping the text before and after the cursor separately makes every command cheap: typing and backspace only touch the end of the first part.',
      },
    ],
    languages: {
      typescript: {
        entryPoint: 'applyEdits',
        starterCode: `/**
 * Replays editor commands and returns the final text.
 */
export function applyEdits(commands: string[]): string {
  // TODO: implement me
  throw new Error('Remove this line and implement the function');
}
`,
      },
      java: {
        entryPoint: 'applyEdits',
        starterCode: `class Solution {
    /**
     * Replays editor commands and returns the final text.
     */
    static String applyEdits(String[] commands) {
        // TODO: implement me
        throw new UnsupportedOperationException("Remove this line and implement the method");
    }
}
`,
      },
      csharp: {
        entryPoint: 'applyEdits',
        starterCode: `public static class Solution
{
    /// <summary>
    /// Replays editor commands and returns the final text.
    /// </summary>
    public static string ApplyEdits(string[] commands)
    {
        // TODO: implement me
        throw new NotImplementedException("Remove this line and implement the method");
    }
}
`,
      },
    },
    visibleTests: callTests<ApplyEdits>([
      { description: 'typing into an empty editor', input: [['type hello']], expected: 'hello' },
      {
        description: 'typing at the start',
        input: [['type world', 'home', 'type hello ']],
        expected: 'hello world',
      },
      {
        description: 'backspace in the middle',
        input: [['type abcdef', 'left 2', 'backspace 2']],
        expected: 'abef',
      },
      {
        description: 'moving stops at the ends',
        input: [['type abc', 'left 10', 'right 1', 'delete 1']],
        expected: 'ac',
      },
      {
        description: 'unknown commands are ignored',
        input: [['type ab', 'jump 3', 'type c']],
        expected: 'abc',
      },
    ]),
  },
  hiddenTests: callTests<ApplyEdits>([
    { description: 'no commands', input: [[]], expected: '' },
    {
      description: 'editing an empty editor',
      input: [['backspace 3', 'delete 2', 'left 1', 'type x']],
      expected: 'x',
    },
    {
      description: 'backspace at the end',
      input: [['type one two', 'end', 'backspace 4']],
      expected: 'one',
    },
    {
      description: 'delete everything',
      input: [['type hello', 'home', 'delete 99']],
      expected: '',
    },
    { description: 'spaces are kept', input: [['type a b  c']], expected: 'a b  c' },
    {
      description: 'moving right past the end',
      input: [['type 12', 'left 1', 'type x', 'right 5', 'type y']],
      expected: '1x2y',
    },
    {
      description: 'a count of zero changes nothing',
      input: [['type abc', 'left 1', 'backspace 0', 'delete 0']],
      expected: 'abc',
    },
    {
      description: 'invalid counts are ignored',
      input: [['type abc', 'backspace -1', 'backspace two', 'left', 'type d']],
      expected: 'abcd',
    },
  ]),
};
