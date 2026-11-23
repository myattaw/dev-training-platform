import { callTests, type ChallengeSource } from '@pracstack/content-model';

/**
 * Enterprise challenge: validate and total a batch of payment transactions.
 * C# only. The result is a tuple, which the C# runner encodes as an array:
 * [accepted count, totals by "account/currency", errors as "line:code"].
 */

type Result = [accepted: number, totals: Record<string, string>, errors: string[]];
type ProcessBatch = (lines: string[]) => Result;

const line = (id: string, account: string, amount: string, currency = 'EUR', date = '2025-03-01') =>
  `${id},${account},${amount},${currency},${date}`;

/** 1,000 valid lines over three accounts; expected totals computed in whole cents. */
const bigBatch = (() => {
  const lines: string[] = [];
  const cents: Record<string, number> = {};
  for (let i = 0; i < 1000; i++) {
    const account = `ACC-${i % 3}`;
    const currency = i % 2 === 0 ? 'EUR' : 'USD';
    const amount = `${(i % 97) + 1}.${String(i % 100).padStart(2, '0')}`; // e.g. 13.07
    const amountCents = ((i % 97) + 1) * 100 + (i % 100);
    lines.push(line(`TX-${i}`, account, amount, currency));
    const key = `${account}/${currency}`;
    cents[key] = (cents[key] ?? 0) + amountCents;
  }
  // A few duplicates at the end: none of them may change the totals.
  lines.push(line('TX-5', 'ACC-2', '1000.00'), line('tx-999', 'ACC-0', '1.00', 'USD'));
  const totals = Object.fromEntries(
    Object.entries(cents).map(([k, c]) => [
      k,
      `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`,
    ]),
  );
  return { lines, expected: [1000, totals, ['1001:duplicate-id', '1002:duplicate-id']] as Result };
})();

export const source: ChallengeSource = {
  challenge: {
    id: 'transaction-batch',
    version: 1,
    title: 'Transaction Batch Processor',
    summary:
      'Validate a nightly batch of payment records, reject bad lines with clear error codes, skip duplicates and total by account and currency.',
    category: 'enterprise',
    difficulty: 'medium',
    tags: ['input-validation', 'data-aggregation', 'hash-maps'],
    instructions: [
      {
        kind: 'paragraph',
        text: 'A payments team receives a nightly file of card settlements from a partner bank. Before the money is booked, every line must be validated, duplicates must be dropped, and the finance team needs a total per account and currency. Implement `Solution.ProcessBatch(lines)`.',
      },
      {
        kind: 'code',
        code: 'ProcessBatch(["T1,ACC-1,100.00,EUR,2025-03-01", "T2,ACC-1,-5,EUR,2025-03-01", "T1,ACC-1,7.00,EUR,2025-03-02"])\n// → (1, { "ACC-1/EUR": "100.00" }, ["2:non-positive-amount", "3:duplicate-id"])',
      },
      { kind: 'heading', text: 'Input' },
      {
        kind: 'list',
        items: [
          'Each line is `id,account,amount,currency,date`. Trim every field. There is no header line.',
          'Lines that are empty or only whitespace are skipped without an error, but they still count for line numbers.',
          'Line numbers start at 1 and are positions in the `lines` array.',
        ],
      },
      { kind: 'heading', text: 'Validation (report the first rule a line breaks, in this order)' },
      {
        kind: 'list',
        items: [
          '`malformed`: the line does not have exactly 5 fields.',
          '`missing-id`: the id is empty. `missing-account`: the account is empty.',
          '`invalid-amount`: the amount is not digits with an optional leading `-` and an optional `.` followed by digits. `+5`, `5.`, `.5`, `1e3` and `1,000` are not valid (a comma also makes the line `malformed`).',
          '`too-many-decimals`: more than two digits after the decimal point, as written: `12.300` is rejected.',
          '`non-positive-amount`: the amount is zero or negative.',
          '`invalid-currency`: not `EUR`, `GBP` or `USD`. Compare ignoring case and report totals in upper case.',
          '`invalid-date`: not a real calendar date in the exact format `yyyy-MM-dd` (so `2025-02-30` and `2025-3-01` are invalid).',
          '`duplicate-id`: a valid line whose id (ignoring case) was already accepted. The first valid line with an id wins; an invalid line never claims an id.',
        ],
      },
      { kind: 'heading', text: 'Result' },
      {
        kind: 'list',
        items: [
          '`Accepted`: the number of lines accepted.',
          '`Totals`: for each `account/currency` with accepted lines, the exact sum formatted with two decimals and a `.` (`"1234.50"`), no thousands separator. Accounts are case-sensitive.',
          '`Errors`: one `"<line>:<code>"` entry per rejected line, in line order.',
          'Money must be exact: use `decimal`, not `double`. Totals can have 18 or more significant digits.',
        ],
      },
    ],
    languages: {
      csharp: {
        entryPoint: 'ProcessBatch',
        starterCode: `public static class Solution
{
    /// <summary>
    /// Validates the batch and totals the accepted lines by "account/currency".
    /// Errors are "line:code", for example "3:duplicate-id".
    /// </summary>
    public static (int Accepted, Dictionary<string, string> Totals, string[] Errors) ProcessBatch(string[] lines)
    {
        // TODO: implement me
        throw new NotImplementedException("Remove this line and implement the method");
    }
}
`,
      },
    },
    visibleTests: callTests<ProcessBatch>([
      { description: 'an empty batch', input: [[]], expected: [0, {}, []] },
      {
        description: 'totals by account and currency',
        input: [
          [
            line('T1', 'ACC-1', '100.00'),
            line('T2', 'ACC-1', '25.50'),
            line('T3', 'ACC-2', '10', 'USD'),
            line('T4', 'ACC-1', '5.25', 'GBP'),
          ],
        ],
        expected: [4, { 'ACC-1/EUR': '125.50', 'ACC-2/USD': '10.00', 'ACC-1/GBP': '5.25' }, []],
      },
      {
        description: 'rejects negative and zero amounts',
        input: [[line('T1', 'A', '-5.00'), line('T2', 'A', '0'), line('T3', 'A', '0.01')]],
        expected: [1, { 'A/EUR': '0.01' }, ['1:non-positive-amount', '2:non-positive-amount']],
      },
      {
        description: 'keeps the first of two lines with the same id',
        input: [[line('T1', 'A', '10'), line('T2', 'A', '20'), line('T1', 'A', '99')]],
        expected: [2, { 'A/EUR': '30.00' }, ['3:duplicate-id']],
      },
      {
        description: 'trims fields and accepts a lower-case currency',
        input: [['  T1 , ACC-9 , 12.5 , eur , 2025-06-30 ']],
        expected: [1, { 'ACC-9/EUR': '12.50' }, []],
      },
      {
        description: 'rejects extra decimals, unknown currencies and impossible dates',
        input: [
          [
            line('T1', 'A', '10.005'),
            line('T2', 'A', '10', 'JPY'),
            line('T3', 'A', '10', 'EUR', '2025-02-30'),
            line('T4', 'A', '10', 'EUR', '01/02/2025'),
          ],
        ],
        expected: [
          0,
          {},
          ['1:too-many-decimals', '2:invalid-currency', '3:invalid-date', '4:invalid-date'],
        ],
      },
    ]),
  },
  hiddenTests: callTests<ProcessBatch>([
    {
      description: 'skips blank lines but keeps counting line numbers',
      input: [['', line('T1', 'A', 'abc'), '   ', line('T2', 'A', '1')]],
      expected: [1, { 'A/EUR': '1.00' }, ['2:invalid-amount']],
    },
    {
      description: 'rejects lines without exactly five fields',
      input: [['T1,A,10,EUR', 'T2,A,1,000.00,EUR,2025-01-01', line('T3', 'A', '5')]],
      expected: [1, { 'A/EUR': '5.00' }, ['1:malformed', '2:malformed']],
    },
    {
      description: 'rejects a missing id or account',
      input: [[line('', 'A', '1'), line('T2', ' ', '1')]],
      expected: [0, {}, ['1:missing-id', '2:missing-account']],
    },
    {
      description: 'accepts only plain decimal amounts with at most two decimals',
      input: [
        [
          line('T1', 'A', '+5'),
          line('T2', 'A', '5.'),
          line('T3', 'A', '.5'),
          line('T4', 'A', '1e3'),
          line('T5', 'A', '12.345'),
          line('T6', 'A', '12.30'),
          line('T7', 'A', '12.300'),
        ],
      ],
      expected: [
        1,
        { 'A/EUR': '12.30' },
        [
          '1:invalid-amount',
          '2:invalid-amount',
          '3:invalid-amount',
          '4:invalid-amount',
          '5:too-many-decimals',
          '7:too-many-decimals',
        ],
      ],
    },
    {
      description: 'reports the first rule broken, in the documented order',
      input: [
        [
          'T1,A,-0.001,XXX,bad',
          'T2,,abc,XXX,bad',
          'T3,A,0.00,XXX,bad',
          'T4,A,1,XXX,bad',
          'T5,A,1,usd,2025-1-05',
        ],
      ],
      expected: [
        0,
        {},
        [
          '1:too-many-decimals',
          '2:missing-account',
          '3:non-positive-amount',
          '4:invalid-currency',
          '5:invalid-date',
        ],
      ],
    },
    {
      description: 'detects duplicate ids ignoring case; an invalid line does not claim its id',
      input: [
        [
          line('T1', 'A', 'abc'),
          line('t1', 'A', '10'),
          line('T1', 'A', '20'),
          line('T2', 'B', '1', 'USD'),
          line('T2', 'B', '2', 'USD'),
        ],
      ],
      expected: [
        2,
        { 'A/EUR': '10.00', 'B/USD': '1.00' },
        ['1:invalid-amount', '3:duplicate-id', '5:duplicate-id'],
      ],
    },
    {
      description: 'keeps large totals exact (decimal, not double)',
      input: [
        [
          line('T1', 'BIG', '99999999999999.99'),
          line('T2', 'BIG', '0.01'),
          line('T3', 'SMALL', '0.10'),
          line('T4', 'SMALL', '0.20'),
          line('T5', 'HUGE', '1234567890123456.78'),
          line('T6', 'HUGE', '0.01'),
        ],
      ],
      expected: [
        6,
        { 'BIG/EUR': '100000000000000.00', 'SMALL/EUR': '0.30', 'HUGE/EUR': '1234567890123456.79' },
        [],
      ],
    },
    {
      description: 'groups case-sensitive accounts and each currency separately',
      input: [
        [line('T1', 'acc-1', '1'), line('T2', 'ACC-1', '2'), line('T3', 'ACC-1', '3', 'usd')],
      ],
      expected: [3, { 'acc-1/EUR': '1.00', 'ACC-1/EUR': '2.00', 'ACC-1/USD': '3.00' }, []],
    },
    {
      description: 'validates calendar dates, including leap days',
      input: [
        [
          line('T1', 'A', '1', 'EUR', '2024-02-29'),
          line('T2', 'A', '1', 'EUR', '2025-02-29'),
          line('T3', 'A', '1', 'EUR', '2025-13-01'),
          line('T4', 'A', '1', 'EUR', '2025-12-31'),
        ],
      ],
      expected: [2, { 'A/EUR': '2.00' }, ['2:invalid-date', '3:invalid-date']],
    },
    {
      description: 'a batch of 1,000 lines with duplicates at the end',
      input: [bigBatch.lines],
      expected: bigBatch.expected,
    },
  ]),
};
