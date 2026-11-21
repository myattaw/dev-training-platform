import { callTests, type ChallengeSource } from '@pracstack/content-model';

export const source: ChallengeSource = {
  challenge: {
    id: 'reverse-string',
    version: 1,
    title: 'Reverse String',
    summary: 'Return the characters of a string in reverse order.',
    category: 'strings',
    difficulty: 'easy',
    tags: ['strings'],
    instructions: [
      { kind: 'paragraph', text: 'Reverse a string. For example:' },
      { kind: 'code', code: 'input:  "cool"\noutput: "looc"' },
      { kind: 'heading', text: 'Your task' },
      {
        kind: 'paragraph',
        text: 'Implement `reverse(input)` so it returns the characters of `input` in reverse order.',
      },
    ],
    languages: {
      typescript: {
        entryPoint: 'reverse',
        starterCode: `export function reverse(input: string): string {
  // TODO: implement me
  throw new Error('Remove this line and implement the function');
}
`,
      },
      java: {
        entryPoint: 'reverse',
        starterCode: `class Solution {
    static String reverse(String input) {
        // TODO: implement me
        throw new UnsupportedOperationException("Remove this line and implement the method");
    }
}
`,
      },
    },
    visibleTests: callTests<(input: string) => string>([
      { description: 'an empty string', input: [''], expected: '' },
      { description: 'a word', input: ['robot'], expected: 'tobor' },
      { description: 'a capitalized word', input: ['Ramen'], expected: 'nemaR' },
      {
        description: 'a sentence with punctuation',
        input: ["I'm hungry!"],
        expected: "!yrgnuh m'I",
      },
      { description: 'a palindrome', input: ['racecar'], expected: 'racecar' },
      { description: 'an even-sized word', input: ['drawer'], expected: 'reward' },
    ]),
  },
  hiddenTests: callTests<(input: string) => string>([
    { description: 'a single character', input: ['x'], expected: 'x' },
    { description: 'leading and trailing spaces', input: [' a b '], expected: ' b a ' },
    { description: 'digits', input: ['12345'], expected: '54321' },
  ]),
};
