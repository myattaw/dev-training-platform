import { defineTests, type Challenge } from '../models/challenge';

export const pangram: Challenge = {
  id: 'pangram',
  version: 1,
  title: 'Pangram',
  summary: 'Check whether a sentence contains every letter of the alphabet.',
  category: 'strings',
  difficulty: 'easy',
  tags: ['strings', 'sets'],
  instructions: [
    {
      kind: 'paragraph',
      text: 'A pangram (Greek: παν γράμμα, "every letter") is a sentence that uses every letter of the alphabet at least once.',
    },
    { kind: 'paragraph', text: 'The best known English pangram is:' },
    { kind: 'code', code: 'The quick brown fox jumps over the lazy dog.' },
    { kind: 'heading', text: 'Your task' },
    {
      kind: 'paragraph',
      text: 'Implement `isPangram(sentence)` so it returns `true` if the sentence is a pangram and `false` otherwise.',
    },
    {
      kind: 'list',
      items: [
        'The alphabet is the 26 ASCII letters `a` to `z`.',
        'Letters are case-insensitive: `A` and `a` count as the same letter.',
        'Ignore everything that is not a letter, such as digits, spaces, and punctuation.',
      ],
    },
    { kind: 'heading', text: 'Hint' },
    {
      kind: 'paragraph',
      text: 'A `Set<string>` is a handy way to collect the distinct letters you have seen.',
    },
  ],
  languages: {
    typescript: {
      entryPoint: 'isPangram',
      starterCode: `/**
 * Returns true if \`sentence\` contains every letter of the alphabet at least once.
 */
export function isPangram(sentence: string): boolean {
  // TODO: implement me
  throw new Error('Remove this line and implement the function');
}
`,
    },
  },
  visibleTests: defineTests<(sentence: string) => boolean>([
    { description: 'empty sentence', input: [''], expected: false },
    { description: 'perfect lower case', input: ['abcdefghijklmnopqrstuvwxyz'], expected: true },
    {
      description: 'only lower case',
      input: ['the quick brown fox jumps over the lazy dog'],
      expected: true,
    },
    {
      description: "missing the letter 'x'",
      input: ['a quick movement of the enemy will jeopardize five gunboats'],
      expected: false,
    },
    {
      description: "missing the letter 'h'",
      input: ['five boxing wizards jump quickly at it'],
      expected: false,
    },
    {
      description: 'with underscores',
      input: ['the_quick_brown_fox_jumps_over_the_lazy_dog'],
      expected: true,
    },
    {
      description: 'with numbers',
      input: ['the 1 quick brown fox jumps over the 2 lazy dogs'],
      expected: true,
    },
    {
      description: 'missing letters replaced by numbers',
      input: ['7h3 qu1ck brown fox jumps ov3r 7h3 lazy dog'],
      expected: false,
    },
    {
      description: 'mixed case and punctuation',
      input: ['"Five quacking Zephyrs jolt my wax bed."'],
      expected: true,
    },
    {
      description: 'a-m and A-M are 26 characters but not a pangram',
      input: ['abcdefghijklm ABCDEFGHIJKLM'],
      expected: false,
    },
  ]),
};
