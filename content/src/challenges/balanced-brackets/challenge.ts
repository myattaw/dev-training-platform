import { callTests, type ChallengeSource } from '@pracstack/content-model';

export const source: ChallengeSource = {
  challenge: {
    id: 'balanced-brackets',
    version: 1,
    title: 'Balanced Brackets',
    summary: 'Decide whether every bracket in a string is matched and correctly nested.',
    category: 'parsing',
    difficulty: 'medium',
    tags: ['stacks', 'strings'],
    instructions: [
      {
        kind: 'paragraph',
        text: 'Given a string that may contain the brackets `()`, `[]` and `{}`, decide whether all brackets are balanced.',
      },
      { kind: 'paragraph', text: 'A string is balanced when:' },
      {
        kind: 'list',
        items: [
          'every opening bracket is closed by a bracket of the same type, and',
          'brackets are closed in the correct order, so `([)]` is not balanced.',
        ],
      },
      { kind: 'paragraph', text: 'Any other characters are ignored.' },
      {
        kind: 'code',
        code: 'isBalanced("{[a + b] * (c)}")  // true\nisBalanced("([)]")            // false\nisBalanced("((")              // false',
      },
      { kind: 'heading', text: 'Your task' },
      {
        kind: 'paragraph',
        text: 'Implement `isBalanced(text)` so it returns `true` when the brackets are balanced.',
      },
    ],
    languages: {
      typescript: {
        entryPoint: 'isBalanced',
        starterCode: `/**
 * Returns true if every bracket in \`text\` is matched and correctly nested.
 */
export function isBalanced(text: string): boolean {
  // TODO: implement me
  throw new Error('Remove this line and implement the function');
}
`,
      },
      java: {
        entryPoint: 'isBalanced',
        starterCode: `class Solution {
    /**
     * Returns true if every bracket in text is matched and correctly nested.
     */
    static boolean isBalanced(String text) {
        // TODO: implement me
        throw new UnsupportedOperationException("Remove this line and implement the method");
    }
}
`,
      },
      csharp: {
        entryPoint: 'isBalanced',
        starterCode: `public static class Solution
{
    /// <summary>
    /// Returns true if every bracket in <paramref name="text"/> is matched and correctly nested.
    /// </summary>
    public static bool IsBalanced(string text)
    {
        // TODO: implement me
        throw new NotImplementedException("Remove this line and implement the method");
    }
}
`,
      },
    },
    visibleTests: callTests<(text: string) => boolean>([
      { description: 'empty string', input: [''], expected: true },
      { description: 'a single pair', input: ['()'], expected: true },
      { description: 'unclosed bracket', input: ['('], expected: false },
      { description: 'closing before opening', input: [')('], expected: false },
      { description: 'all three bracket types', input: ['{[()]}'], expected: true },
      { description: 'wrong nesting order', input: ['([)]'], expected: false },
      { description: 'mismatched types', input: ['(]'], expected: false },
      { description: 'brackets among other text', input: ['{[a + b] * (c)}'], expected: true },
      { description: 'extra closing bracket', input: ['(()))'], expected: false },
      { description: 'no brackets at all', input: ['hello world'], expected: true },
    ]),
  },
  hiddenTests: callTests<(text: string) => boolean>([
    { description: 'deep nesting', input: ['(((([[[{{{}}}]]]))))'], expected: true },
    { description: 'only closing brackets', input: [']]]'], expected: false },
    {
      description: 'balanced code snippet',
      input: ['function f(a) { return [a, (a)]; }'],
      expected: true,
    },
    { description: 'unclosed brace at the end', input: ['if (x) { y();'], expected: false },
  ]),
};
