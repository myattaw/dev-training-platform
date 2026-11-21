import { defineTests, type Challenge } from '../models/challenge';

export const reverseString: Challenge = {
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
  },
  visibleTests: defineTests<(input: string) => string>([
    { description: 'an empty string', input: [''], expected: '' },
    { description: 'a word', input: ['robot'], expected: 'tobor' },
    { description: 'a capitalized word', input: ['Ramen'], expected: 'nemaR' },
    { description: 'a sentence with punctuation', input: ["I'm hungry!"], expected: "!yrgnuh m'I" },
    { description: 'a palindrome', input: ['racecar'], expected: 'racecar' },
    { description: 'an even-sized word', input: ['drawer'], expected: 'reward' },
  ]),
};
