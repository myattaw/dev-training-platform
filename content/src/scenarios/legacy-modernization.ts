import { readFileSync } from 'node:fs';
import type { ScenarioSource } from '@pracstack/content-model';
import { cs, plain, text } from '../skill-mastery/helpers';
import { challengeTask, multiple, predict, questionTask, single } from './builders';

const ID = 'legacy-modernization';

const legacy = readFileSync(
  new URL('../challenges/legacy-invoice-refactor/Legacy.cs', import.meta.url),
  'utf8',
);

export const legacyModernization: ScenarioSource = {
  id: ID,
  version: 1,
  title: 'Legacy Billing Modernization',
  summary:
    'Refactor a 2014 invoice calculator without changing a cent, fix one confirmed bug, and plan the move from ASP.NET MVC on .NET Framework to ASP.NET Core.',
  difficulty: 'hard',
  estimatedMinutes: 90,
  technologies: ['C#', '.NET', 'ASP.NET MVC', 'ASP.NET Core', 'Architecture'],
  relatedSkillIds: [
    'cs-oop',
    'cs-records-immutability',
    'cs-pattern-matching',
    'eng-testing',
    'eng-git-workflow',
  ],
  context: text(
    'Marlowe Office Supplies (a fictional B2B wholesaler) bills 4,000 business customers from a 2014 ASP.NET MVC 5 application on .NET Framework 4.8. It runs on two aging Windows servers that go out of support next year, and every change to billing takes weeks because nobody trusts the code.',
    'The Billing team will move to ASP.NET Core on .NET 10 incrementally, keeping the old application running until the last page has moved. The first piece to move is the invoice calculation used by the nightly billing run. Finance has also confirmed a long-standing bug (INV-4521) that must be fixed as part of the move, and nothing else may change: customers compare invoices month to month.',
  ),
  requirements: [
    {
      kind: 'list',
      items: [
        'Refactor the invoice calculation into readable, testable code with identical results.',
        'Fix INV-4521 (a discount carried over from one invoice to the next) and only that.',
        'Agree a safe order of work and keep behavior changes out of the refactoring.',
        'Plan the migration from ASP.NET MVC 5 to ASP.NET Core without a big-bang rewrite.',
      ],
    },
  ],
  acceptanceCriteria: [
    'The refactored calculator passes the hidden characterization tests, which pin today’s totals including their quirks.',
    'INV-4521 is fixed and covered by regression tests.',
    'Characterization tests exist before the refactoring, and the bug fix is a separate, reviewable change.',
    'The migration plan routes traffic incrementally and keeps the old application serving what has not moved.',
  ],
  artifacts: [
    {
      id: 'legacy-code',
      title: 'InvoiceTotals.cs (Billing.Core, 2014)',
      description: 'The calculation as it runs in production today.',
      snippet: cs(legacy),
    },
    {
      id: 'bug-report',
      title: 'INV-4521',
      description: 'The confirmed bug.',
      snippet:
        plain(`INV-4521  Discount carried over between invoices in the nightly run    Status: Confirmed by Finance
Run 2025-02-03: invoice 88121 (STAFF, 10.00) was followed by invoice 88122 (REGULAR, 10.00).
Expected 88122: 18.09 (10.00 + 4.95 shipping, plus 21% VAT)
Actual   88122: 14.46 (the 30% staff discount was applied)
Also seen: GOLD invoices under the 100.00 threshold receiving 10% after a large GOLD invoice.
Finance: fix it going forward; do not change any other rounding or rule.`),
    },
    {
      id: 'current-architecture',
      title: 'Current architecture',
      description: 'The system to migrate, described in text.',
      snippet: plain(`Browser ──> IIS ──> Marlowe.Billing.Web (ASP.NET MVC 5, .NET Framework 4.8)
                      ├─ Controllers: Invoices, Customers, Reports, Admin (forms authentication)
                      ├─ /api/invoices (Web API 2), used by the customer portal
                      ├─ Billing.Core.dll  (InvoiceTotals.cs, uses only System and System.Globalization)
                      └─ Data access: Entity Framework 6 ──> SQL Server "Billing"
Windows Task Scheduler ──> Billing.NightlyRun.exe (.NET Framework 4.8, references Billing.Core.dll)`),
    },
  ],
  tasks: [
    challengeTask(
      'refactor-and-fix',
      'Refactor the calculator and fix INV-4521',
      'legacy-invoice-refactor',
      'Refactor `Solution.BillingRun` into readable code and fix INV-4521. The hidden characterization tests compare your totals with the legacy totals, quirks included.',
    ),
    questionTask(
      'technical-debt',
      'Identify the technical debt',
      multiple({
        id: `${ID}-technical-debt`,
        difficulty: 3,
        prompt:
          'Which of these are real technical debt in `InvoiceTotals.cs` (see the artifact)? Select all that apply.',
        options: [
          {
            text: 'The static mutable field `disc` is shared between invoices (the cause of INV-4521) and between concurrent runs',
            correct: true,
          },
          {
            text: 'Unnamed magic numbers such as `0.98m`, `4.95m`, `1.21m` and `100`',
            correct: true,
          },
          {
            text: 'The list of countries is repeated in the shipping and the VAT logic',
            correct: true,
          },
          {
            text: 'The GOLD free-shipping rule can never change a total: a GOLD subtotal over 100 is already above the free-shipping limit after the 10% discount',
            correct: true,
          },
          {
            text: 'Amounts are `decimal` rather than `double`',
            correct: false,
          },
          {
            text: 'Totals are formatted with `CultureInfo.InvariantCulture`',
            correct: false,
          },
        ],
        hint: 'Debt is whatever makes the code risky or expensive to change. Some choices in this file are exactly right.',
        why: 'Shared static state couples invoices (and would corrupt results if two runs ever overlapped in one process); magic numbers and duplicated country lists mean a VAT change must be made in several places; the GOLD rule is a duplicated, dead condition (a subtotal over 100 minus 10% is at least 90, already free shipping) that misleads readers. `decimal` for money and invariant formatting for a file other systems read are correct and must stay.',
      }),
    ),
    questionTask(
      'safe-refactoring-order',
      'Choose a safe order of work',
      single({
        id: `${ID}-refactoring-order`,
        difficulty: 3,
        prompt: 'In which order should the work on `InvoiceTotals.cs` be done?',
        correct:
          'First write characterization tests that pin today’s totals, quirks included; then refactor in small steps, keeping them green; then fix INV-4521 in a separate commit, starting with a test that fails on the old behavior',
        wrong: [
          'Fix INV-4521 first, since it is confirmed, then refactor, then write tests for the new code',
          'Rewrite the calculator from the specification in the wiki, then compare a sample of invoices by hand',
          'Refactor and fix the bug together in one commit, then add unit tests for the new classes',
        ],
        hint: 'You can only call a change a refactoring if something proves that behavior did not change.',
        why: 'Characterization tests record what the code does today (not what anyone thinks it should do), so every refactoring step can be verified. The bug fix is a deliberate behavior change: in its own commit with its own failing-then-passing test, reviewers can see that it changes exactly the INV-4521 cases. Mixing the fix into the refactoring, or rewriting from a wiki that is probably out of date, makes it impossible to tell an intended change from an accident.',
      }),
    ),
    questionTask(
      'rounding-quirk',
      'Predict the rounding a colleague wants to “fix”',
      predict({
        id: `${ID}-rounding-quirk`,
        difficulty: 3,
        prompt:
          'During review a colleague proposes `MidpointRounding.AwayFromZero` “because that is how people round”. What does this program print?',
        code: cs(`decimal[] totals = [50.125m, 50.135m, 75.625m];
foreach (var total in totals)
{
    var today = Math.Round(total, 2);
    var proposed = Math.Round(total, 2, MidpointRounding.AwayFromZero);
    Console.WriteLine($"{today} {proposed}");
}`),
        output: '50.12 50.13\n50.14 50.14\n75.62 75.63',
        hint: '`Math.Round` without a mode rounds a midpoint to the nearest even digit.',
        why: '`Math.Round(decimal, int)` defaults to `MidpointRounding.ToEven` (banker’s rounding): 50.125 goes down to 50.12 because 2 is even, 50.135 goes up to 50.14. AwayFromZero always rounds midpoints up, so two of the three totals would change by a cent. Whatever the better rule is, changing it is a business decision for Finance, not part of a refactoring; the characterization tests exist to catch exactly this.',
      }),
    ),
    questionTask(
      'strangler-fig',
      'Plan the migration to ASP.NET Core',
      single({
        id: `${ID}-strangler-fig`,
        difficulty: 4,
        prompt:
          'Which plan moves Marlowe.Billing.Web from ASP.NET MVC 5 on .NET Framework to ASP.NET Core with the least risk?',
        correct:
          'Strangler fig: put a new ASP.NET Core app with a reverse proxy (YARP) in front, forward every route it does not handle to the old app, move one area at a time (starting with /api/invoices and the nightly run, which depend on the calculator), share authentication between the two, and retire the old app when nothing is forwarded',
        wrong: [
          'Rewrite the whole application in ASP.NET Core in a long-running branch and switch over in one weekend release',
          'Reference the MVC 5 controllers’ assembly from an ASP.NET Core project and serve them from there',
          'Retarget the MVC 5 project to .NET 10 in place, then fix compile errors until `System.Web` builds',
        ],
        hint: 'Which option keeps the system releasable after every step?',
        why: 'The strangler fig pattern replaces a system route by route behind a proxy, so each step is small, can be released and rolled back, and the old application keeps serving everything that has not moved (YARP is what Microsoft’s incremental migration guidance uses). Sharing authentication (for example a shared cookie and data protection keys, or tokens) lets users move between old and new pages without noticing. A big-bang rewrite delays all value and risk to one weekend; ASP.NET Core cannot host MVC 5 controllers, and `System.Web` does not exist on modern .NET, so an in-place retarget is a rewrite in disguise. Moving the calculator first works because it only depends on `System` and can target .NET Standard 2.0 to serve both apps during the transition.',
      }),
    ),
    questionTask(
      'not-in-this-pr',
      'Keep the pull request focused',
      multiple({
        id: `${ID}-not-in-this-pr`,
        difficulty: 3,
        prompt:
          'The refactoring pull request is open. Which of these changes should NOT go into it (and get their own change and sign-off instead)? Select all that apply.',
        options: [
          {
            text: 'Switch rounding to `MidpointRounding.AwayFromZero`',
            correct: true,
          },
          {
            text: 'Treat country codes case-insensitively, so `nl` is charged Dutch VAT',
            correct: true,
          },
          {
            text: 'Upgrade the solution to .NET 10 and update every NuGet package',
            correct: true,
          },
          {
            text: 'Replace the magic numbers with named constants',
            correct: false,
          },
          {
            text: 'Add the characterization tests that the refactoring relies on',
            correct: false,
          },
        ],
        hint: 'A refactoring PR changes structure, not behavior or platform. What would a reviewer need to approve separately?',
        why: 'Rounding and case-sensitivity changes alter invoice totals: they may well be improvements, but they need Finance’s decision, their own tests and their own release note. A framework and package upgrade changes the platform under the code and deserves its own review and rollback. Named constants are exactly what the refactoring is for, and the characterization tests are its safety net, so both belong in it.',
      }),
    ),
  ],
  limitations:
    'Only behavior is graded automatically: the hidden tests prove the refactored code gives the same totals and fixes INV-4521, but code structure and readability are not scored, and the migration plan is assessed through questions, not by running ASP.NET MVC or YARP.',
};
