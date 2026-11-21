import { defineTests, type Exercise } from '../../models/exercise';

export const reverseString: Exercise = {
  id: 'reverse-string',
  title: 'Reverse String',
  description: 'Reverse a given string.',
  difficulty: 'Easy',
  topics: ['strings'],
  featured: true,
  entryPoint: 'reverse',
  instructions: [
    { kind: 'paragraph', text: 'Reverse a string. For example:' },
    { kind: 'code', code: 'input:  "cool"\noutput: "looc"' },
    { kind: 'heading', text: 'Your task' },
    { kind: 'paragraph', text: 'Implement `reverse(input)` so it returns the characters of `input` in reverse order.' },
  ],
  starterCode: `export function reverse(input: string): string {
  // TODO: implement me
  throw new Error('Remove this line and implement the function');
}
`,
  tests: defineTests<(input: string) => string>([
    { description: 'an empty string', input: [''], expected: '' },
    { description: 'a word', input: ['robot'], expected: 'tobor' },
    { description: 'a capitalized word', input: ['Ramen'], expected: 'nemaR' },
    { description: 'a sentence with punctuation', input: ["I'm hungry!"], expected: "!yrgnuh m'I" },
    { description: 'a palindrome', input: ['racecar'], expected: 'racecar' },
    { description: 'an even-sized word', input: ['drawer'], expected: 'reward' },
  ]),
};
