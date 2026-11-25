import { programBuilders } from '../program-builders';

const py = programBuilders('python');

/** Pipeline check: one family per builder kind (replaced by the full curriculum). */
export const seedFamilies = [
  ...py.output(
    'py-seed-slicing',
    1,
    ['A slice `s[a:b]` includes index `a` and stops before `b`.'],
    [
      {
        key: 'basic',
        code: 's = "pracstack"\nprint(s[0:4])',
        output: 'prac',
        why: 'Stops before index 4.',
      },
      {
        key: 'negative',
        code: 's = "pracstack"\nprint(s[-5:])',
        output: 'stack',
        why: 'Negative indexes count from the end.',
      },
    ],
  ),
  ...py.fails('py-seed-key-error', 2, 'Indexing a dict with a missing key raises.', [
    {
      key: 'missing',
      question: 'Why does this program fail?',
      code: 'prices = {"apple": 3}\nprint(prices["pear"])',
      error: 'KeyError',
      correct: '`prices["pear"]` raises `KeyError`; use `prices.get("pear")` to get `None` instead',
      wrong: ['It prints `None`', 'It prints `0`', 'It is a syntax error'],
      why: 'Square-bracket lookup requires the key; `get` returns a default.',
    },
  ]),
  ...py.outputChoice('py-seed-default-arg', 3, 'Defaults are evaluated once.', [
    {
      key: 'list',
      code: 'def add(item, items=[]):\n    items.append(item)\n    return items\n\nadd(1)\nprint(add(2))',
      correct: '[1, 2]',
      wrong: ['[2]', '[1]', '[]'],
      why: 'The default list is created once, when `def` runs, and shared by every call.',
    },
  ]),
];
