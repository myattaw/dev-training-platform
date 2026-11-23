import type { ScenarioSource } from '@pracstack/content-model';
import { cs, plain, text } from '../skill-mastery/helpers';
import { challengeTask, predict, questionTask, single } from './builders';

const ID = 'transaction-processing';

export const transactionProcessing: ScenarioSource = {
  id: ID,
  version: 1,
  title: 'Nightly Transaction Processing',
  summary:
    'Validate and total a partner bank’s settlement file in C#: exact money, duplicate detection, useful errors and LINQ traps.',
  difficulty: 'medium',
  estimatedMinutes: 70,
  technologies: ['C#', '.NET', 'LINQ', 'Collections'],
  relatedSkillIds: [
    'cs-linq',
    'cs-linq-execution',
    'cs-collections',
    'cs-exceptions',
    'cs-value-reference-types',
  ],
  context: text(
    'Kestrel Pay (a fictional payment processor) settles card payments for 3,000 small merchants. Every night a partner bank drops a CSV-like settlement file; the Settlement team’s service validates it, drops duplicates (the bank re-sends lines after a timeout) and books one total per merchant account and currency.',
    'Last month the old service, written in a hurry, was off by 0.01 on a large merchant’s total, booked a re-sent line twice, and aborted the whole file on the first bad line, so 2,000 merchants were paid a day late. You are rewriting the core of it.',
  ),
  requirements: [
    {
      kind: 'list',
      items: [
        'Validate every line and keep going: one bad line must not stop the batch.',
        'Report each rejected line with its line number and a machine-readable error code for the operations dashboard.',
        'Detect duplicate transaction ids: keep the first valid line, report the others.',
        'Total accepted amounts per account and currency, exactly, to the cent.',
      ],
    },
  ],
  acceptanceCriteria: [
    'The batch processor passes the hidden tests, including boundaries (zero and negative amounts, extra decimals, whitespace, duplicates, empty input) and an 18-digit total.',
    'Money is handled as `decimal` end to end; no `double` appears in the calculation.',
    'The input is enumerated once, even when several aggregates are computed.',
    'Bad data produces error results; exceptions are reserved for failures the batch cannot recover from.',
  ],
  artifacts: [
    {
      id: 'file-spec',
      title: 'Settlement file specification (partner bank)',
      description: 'The agreed format of each line.',
      snippet: plain(`Encoding: UTF-8, one transaction per line, no header
Fields:   id,account,amount,currency,date
  id        bank transaction id, unique per transaction; re-sent lines repeat the id (any letter case)
  account   merchant account, e.g. ACC-10442 (case-sensitive)
  amount    positive, '.' as decimal separator, at most 2 decimals, no sign, no thousands separator
  currency  ISO 4217: EUR, GBP or USD
  date      settlement date, yyyy-MM-dd`),
    },
    {
      id: 'sample-file',
      title: 'Extract of last night’s file',
      description: 'Real-looking lines, including the problems the service must handle.',
      snippet: plain(`TX-88120,ACC-10442,1250.00,EUR,2025-03-01
TX-88121,ACC-10442, 19.99 ,eur,2025-03-01
TX-88122,ACC-20017,-15.00,EUR,2025-03-01
TX-88123,ACC-20017,7.505,EUR,2025-03-01

TX-88121,ACC-10442,19.99,EUR,2025-03-01
TX-88124,ACC-30001,12.00,CHF,2025-03-01
TX-88125,ACC-30001,12.00,USD,2025-02-30`),
    },
    {
      id: 'old-code',
      title: 'The old implementation (excerpt)',
      description: 'The code behind last month’s incidents.',
      snippet: cs(`public static Dictionary<string, double> Totals(IEnumerable<string> lines)
{
    var records = lines.Select(Parse);                      // deferred: runs Parse on every enumeration
    Console.WriteLine($"Parsed {records.Count()} lines");   // enumerates once
    return records                                          // enumerates again
        .GroupBy(r => r.Account + "/" + r.Currency)
        .ToDictionary(g => g.Key, g => g.Sum(r => r.Amount));   // double arithmetic
}

static (string Id, string Account, double Amount, string Currency) Parse(string line)
{
    var f = line.Split(',');
    return (f[0], f[1], double.Parse(f[2]), f[3]);          // throws on the first bad line
}`),
    },
  ],
  tasks: [
    challengeTask(
      'process-the-batch',
      'Write the batch processor',
      'transaction-batch',
      'Implement `Solution.ProcessBatch`. The hidden tests cover every validation rule, rule order, duplicates, blank lines, a 1,000-line batch and totals too large for `double`.',
    ),
    questionTask(
      'double-vs-decimal',
      'Predict double and decimal sums',
      predict({
        id: `${ID}-double-vs-decimal`,
        difficulty: 2,
        prompt: 'Ten payments of 0.10 are added up. What does this program print?',
        code: cs(`double asDouble = 0;
decimal asDecimal = 0;
for (int i = 0; i < 10; i++)
{
    asDouble += 0.1;
    asDecimal += 0.1m;
}
Console.WriteLine(asDouble == 1.0);
Console.WriteLine(asDecimal == 1.0m);
Console.WriteLine(asDecimal);`),
        output: 'False\nTrue\n1.0',
        hint: '0.1 has no exact binary representation; `decimal` stores base-10 digits.',
        why: '`double` is binary floating point: 0.1 is stored as the nearest binary fraction, and ten additions accumulate the error (the sum is 0.9999999999999999), so the comparison is false. `decimal` stores a base-10 integer and a scale, so 0.1m is exact and the sum is exactly 1.0. The scale is kept from the operands, which is why it prints `1.0` rather than `1`. That is why money is `decimal` in .NET.',
      }),
    ),
    questionTask(
      'group-and-sum',
      'Predict a GroupBy total',
      predict({
        id: `${ID}-group-and-sum`,
        difficulty: 2,
        prompt: 'What does this program print?',
        code: cs(`var accepted = new[]
{
    (Account: "ACC-1", Amount: 19.99m),
    (Account: "ACC-2", Amount: 5.00m),
    (Account: "ACC-1", Amount: 0.01m),
    (Account: "ACC-2", Amount: 2.5m),
};
foreach (var g in accepted.GroupBy(t => t.Account).OrderBy(g => g.Key))
{
    Console.WriteLine($"{g.Key}: {g.Sum(t => t.Amount)} ({g.Count()})");
}`),
        output: 'ACC-1: 20.00 (2)\nACC-2: 7.50 (2)',
        hint: 'A `decimal` sum keeps the largest scale of its operands.',
        why: '`GroupBy` collects the tuples per account; `Sum` over `decimal` is exact, so 19.99 + 0.01 is exactly 20.00. Decimal addition keeps the larger scale (two decimals), so `5.00m + 2.5m` prints `7.50`. Formatting still matters in the output file: the processor formats totals with `"0.00"` and the invariant culture, so a total such as `20` is written as `20.00` and never as `20,00`.',
      }),
    ),
    questionTask(
      'iterator-read-twice',
      'Predict re-enumerating an iterator over the input',
      predict({
        id: `${ID}-iterator-read-twice`,
        difficulty: 4,
        prompt:
          'A refactoring streams the file with an iterator instead of loading it. What does this program print?',
        code: cs(`using System.Globalization;

var reader = new StringReader("T1,10.00\\nT2,5.00\\nT3,2.50");
var records = ReadRecords(reader);
Console.WriteLine(records.Count());
Console.WriteLine(records.Sum(r => r.Amount));

static IEnumerable<(string Id, decimal Amount)> ReadRecords(TextReader reader)
{
    string? line;
    while ((line = reader.ReadLine()) is not null)
    {
        var fields = line.Split(',');
        yield return (fields[0], decimal.Parse(fields[1], CultureInfo.InvariantCulture));
    }
}`),
        output: '3\n0',
        hint: 'An iterator method runs again from the top on every enumeration, but the reader it uses keeps its position.',
        why: '`ReadRecords` is lazy: nothing is read until it is enumerated. `Count()` enumerates it and reads all three lines. `Sum` enumerates it again, which restarts the iterator, but the `TextReader` is already at the end, so it yields nothing and the sum is 0. No exception, just a wrong total: in the real service that means booking nothing. Enumerate a one-shot source once, for example with `ToList()`, or compute all aggregates in a single pass.',
      }),
    ),
    questionTask(
      'deferred-execution-fix',
      'Fix double parsing caused by deferred execution',
      single({
        id: `${ID}-deferred-execution-fix`,
        difficulty: 3,
        prompt:
          'The audit counter shows that every line is parsed twice, and parsing is the slow part of the batch. What is the best fix?',
        code: cs(`using System.Globalization;

string[] lines = ["T1,ACC-1,10.00", "T2,ACC-1,oops", "T3,ACC-2,5.00"];
int parsed = 0;
IEnumerable<decimal> amounts = lines.Select(line =>
{
    parsed++;
    return decimal.TryParse(line.Split(',')[2], NumberStyles.Number, CultureInfo.InvariantCulture, out var a) ? a : 0m;
});
var total = amounts.Sum();
var count = amounts.Count();
Console.WriteLine($"{total} {count} parsed={parsed}");`),
        correct:
          'Materialize the parsed results once (`var amounts = lines.Select(...).ToList();`) and compute both aggregates from the list',
        wrong: [
          'Replace `Sum()` with `Aggregate(0m, (a, b) => a + b)`, which does not re-run the query',
          'Make `parsed` a static field so it is only counted once',
          'Add `AsParallel()` so the two enumerations run at the same time',
        ],
        hint: 'A LINQ query is a recipe, not a result: every operator that consumes it runs it again.',
        why: '`Select` is deferred, so `Sum()` and `Count()` each run the lambda over every line: the program prints `15.00 3 parsed=6`. `ToList()` (or `ToArray()`) runs the query once and stores the results; both aggregates then read the list. `Aggregate` is just another consuming operator that runs the query again, a static counter hides the symptom, and `AsParallel` still runs the query twice (and makes the side effect a data race).',
      }),
    ),
    questionTask(
      'errors-as-results',
      'Decide how to handle a bad line',
      single({
        id: `${ID}-errors-as-results`,
        difficulty: 3,
        prompt:
          'The old service called `double.Parse` and aborted the whole file on the first bad line. Given the requirements, how should the new processor handle an invalid line?',
        correct:
          'Validate each line with `TryParse`-style checks, return an error result (line number and code) and continue; throw only for failures that make the whole batch unusable, such as an unreadable file',
        wrong: [
          'Throw a `FormatException` on the first invalid line so that the file is booked all-or-nothing',
          'Wrap each line in `try { ... } catch (Exception) { }` and skip lines that throw, without reporting them',
          'Replace invalid amounts with 0 so that every line can be booked',
        ],
        hint: 'Invalid lines are expected in this file. What do the operations dashboard and the other merchants need?',
        why: 'Invalid lines are a normal, expected outcome here, so they are data (error results), not exceptions: the batch books the valid lines and the dashboard gets every rejected line with a reason. Exceptions are for exceptional failures the processor cannot handle locally. Aborting on the first bad line is what delayed 2,000 merchants. Swallowing exceptions hides errors (and catches real bugs too), and booking a 0 silently changes a merchant’s money.',
      }),
    ),
  ],
  limitations:
    'The batch processor is executed against hidden tests; code quality, performance on very large files and the I/O around the file (reading, archiving, booking) are not graded.',
};
