import { readFileSync } from 'node:fs';
import { callTests, type ChallengeSource } from '@pracstack/content-model';

/**
 * Enterprise challenge: refactor legacy C# without changing its behavior, and
 * fix one documented bug. The starter (Legacy.cs) is the legacy code itself; the
 * hidden tests are characterization tests that pin its current behavior, plus
 * regression tests for the bug fix (INV-4521). Expected values were produced by
 * the legacy code and checked by hand; the only differences between the legacy
 * code and the reference are the INV-4521 cases.
 */

const legacy = readFileSync(new URL('./Legacy.cs', import.meta.url), 'utf8');

type BillingRun = (invoices: string[]) => string[];

export const source: ChallengeSource = {
  challenge: {
    id: 'legacy-invoice-refactor',
    version: 1,
    title: 'Legacy Invoice Refactor',
    summary:
      'Refactor a 2014-era invoice calculator into readable code without changing a single total, and fix the discount carry-over bug.',
    category: 'enterprise',
    difficulty: 'medium',
    tags: ['refactoring', 'design'],
    instructions: [
      {
        kind: 'paragraph',
        text: 'The billing team is moving its nightly billing run to a new service. The core calculation, `Solution.BillingRun`, is legacy code: one long method, magic numbers, a duplicated GOLD rule, country lists repeated in two places and static mutable fields. Nobody dares to touch it, but it has to move.',
      },
      {
        kind: 'paragraph',
        text: 'Your task: refactor it into code a colleague could review and extend, keeping its behavior exactly as it is today, and fix one bug that finance has confirmed.',
      },
      { kind: 'heading', text: 'The input format (unchanged)' },
      {
        kind: 'list',
        items: [
          'Each invoice is `TYPE|COUNTRY|SKU:QTY:PRICE;SKU:QTY:PRICE`, for example `GOLD|NL|DESK:1:249.00;PEN:12:1.50`.',
          '`BillingRun` returns one string per invoice, in order: the total with two decimals (`"36.24"`), or `"ERROR"` when the invoice cannot be read.',
        ],
      },
      { kind: 'heading', text: 'The bug to fix: INV-4521' },
      {
        kind: 'paragraph',
        text: 'A discount from one invoice carries over to later invoices in the same run. Example: in a run of `STAFF|NL|A:1:10.00` followed by `REGULAR|NL|A:1:10.00`, the regular customer also gets the 30% staff discount. A GOLD or SILVER invoice at or under the 100.00 threshold gets the discount of an earlier invoice too. Each invoice’s discount must depend only on that invoice.',
      },
      { kind: 'heading', text: 'What must not change' },
      {
        kind: 'list',
        items: [
          'Every other total, including the quirks: half-cents round to even (`Math.Round`’s default), customer types and country codes are case-sensitive, a price of 0 is allowed, and anything the parser rejects today is still `"ERROR"`.',
          'The signature of `Solution.BillingRun`. You may add classes, records and methods, and remove the static fields: nothing outside this file reads them.',
        ],
      },
      { kind: 'heading', text: 'How it is graded' },
      {
        kind: 'paragraph',
        text: 'Hidden characterization tests compare your totals with the legacy totals for many invoices and runs, plus regression tests for INV-4521. They check behavior, not code style: the refactoring itself is your craft (see the scenario questions).',
      },
    ],
    languages: {
      csharp: { entryPoint: 'BillingRun', starterCode: legacy },
    },
    visibleTests: callTests<BillingRun>([
      {
        description: 'a regular customer in the Netherlands (shipping and 21% VAT)',
        input: [['REGULAR|NL|BOOK:2:12.50']],
        expected: ['36.24'],
      },
      {
        description: 'GOLD gets 10% only above 100.00',
        input: [['GOLD|DE|DESK:1:100.00', 'GOLD|DE|DESK:1:100.01']],
        expected: ['119.00', '107.11'],
      },
      {
        description: 'lines of 10 or more get 2% off',
        input: [['REGULAR|US|PEN:10:1.00;PAD:9:1.00']],
        expected: ['28.75'],
      },
      {
        description: 'STAFF gets 30%',
        input: [['STAFF|BE|LAPTOP:1:999.99']],
        expected: ['846.99'],
      },
      {
        description: 'invoices that cannot be read are ERROR',
        input: [['GOLD|NL', 'GOLD|NL|X:0:1.00', 'GOLD|NL|X:1:-1', 'GOLD|NL|X:one:1', 'GOLD|NL|']],
        expected: ['ERROR', 'ERROR', 'ERROR', 'ERROR', 'ERROR'],
      },
      {
        description: 'INV-4521: a staff discount does not carry over to the next invoice',
        input: [['STAFF|NL|A:1:10.00', 'REGULAR|NL|A:1:10.00']],
        expected: ['14.46', '18.09'],
      },
    ]),
  },
  hiddenTests: callTests<BillingRun>([
    {
      description: 'keeps rounding half-cents to even',
      input: [['REGULAR|US|A:1:50.125', 'REGULAR|US|A:1:50.135', 'REGULAR|NL|A:1:62.5']],
      expected: ['50.12', '50.14', '75.62'],
    },
    {
      description: 'INV-4521: GOLD and SILVER discounts do not carry over',
      input: [['GOLD|US|A:1:200', 'GOLD|US|A:1:60', 'SILVER|US|A:1:200', 'UNKNOWN|US|A:1:60']],
      expected: ['180.00', '60.00', '190.00', '60.00'],
    },
    {
      description: 'INV-4521: shipping is charged on the discounted subtotal of each invoice',
      input: [['STAFF|NL|A:1:60', 'SILVER|DE|A:1:52']],
      expected: ['56.81', '61.88'],
    },
    {
      description: 'free shipping from exactly 50.00',
      input: [['REGULAR|DE|A:1:50', 'REGULAR|DE|A:1:49.99']],
      expected: ['59.50', '65.38'],
    },
    {
      description: 'keeps customer types and countries case-sensitive',
      input: [['gold|US|A:1:500', 'REGULAR|FR|A:1:20', 'REGULAR|nl|A:1:20']],
      expected: ['500.00', '29.95', '29.95'],
    },
    {
      description: 'bulk discount from exactly 10, with three-decimal prices',
      input: [['REGULAR|US|A:10:0.333']],
      expected: ['13.21'],
    },
    {
      description:
        'an ERROR invoice does not stop the run, and the discount does not carry over it',
      input: [['GOLD|NL|A:2:30;B:1:50.00', 'BAD', 'GOLD|NL|A:1:10']],
      expected: ['119.79', 'ERROR', '18.09'],
    },
    { description: 'an empty run', input: [[]], expected: [] },
    {
      description: 'keeps the strict number parsing, and allows a price of 0',
      input: [
        [
          'REGULAR|US|A: 1:10',
          'REGULAR|US|A:1:1,000.00',
          'REGULAR|US|A:1:10.00 ',
          'REGULAR|US|A:+1:10',
          'REGULAR|US|A:1:0',
        ],
      ],
      expected: ['ERROR', 'ERROR', 'ERROR', 'ERROR', '9.95'],
    },
    {
      description: 'a mixed run of eight invoices',
      input: [
        [
          'STAFF|DE|A:3:40',
          'REGULAR|DE|A:3:40',
          'SILVER|NL|A:12:9.99',
          'SILVER|NL|A:1:99.99',
          'GOLD|BE|A:1:100.50;B:10:5',
          'GOLD|BE|A:2:20',
          'STAFF|US|A:1:1',
          'REGULAR|US|A:1:1',
        ],
      ],
      expected: ['99.96', '142.80', '135.05', '120.99', '162.81', '54.39', '10.65', '10.95'],
    },
    {
      description: 'SILVER above the threshold with a bulk line',
      input: [['SILVER|NL|A:20:5.25;B:1:3']],
      expected: ['121.73'],
    },
  ]),
};
