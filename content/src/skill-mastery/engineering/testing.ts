import type { QuestionSource } from '@pracstack/content-model';
import { csOutputFamily } from '../csharp/builders';
import { cs, plain } from '../helpers';
import { scenarioFamily, selectFamily } from './builders';

/*
 * Testing: the test pyramid, test structure, test doubles, flaky tests, TDD and
 * BDD, coverage and regression tests. C# shown as `csharp` is framework-free
 * (hand-written fakes and a tiny check helper) and is compiled and run by the
 * real C# runner; code using xUnit or Moq is shown as text.
 */

export const testingFamilies: readonly QuestionSource[] = [
  // ---------------------------------------------------------------- Test levels
  ...scenarioFamily(
    'eng-test-levels',
    1,
    'Ask what the test must exercise to give confidence, and how fast and stable it will be.',
    [
      {
        key: 'pure-calculation',
        question:
          '`CalculateShipping(weightKg, zone)` is a pure function with six pricing rules. Which kind of test should check the rules?',
        correct: 'Unit tests calling the function directly, one or more per rule',
        wrong: [
          'End-to-end tests that place orders through the browser',
          'A load test that sends many shipping requests',
          'Manual exploratory testing before each release',
        ],
        why: 'Pure logic with many cases is ideal for unit tests: they are fast, precise and point straight at the broken rule. Driving the same six rules through a browser is slow and fragile, and a failure would not say which rule broke. Load tests measure performance, not correctness.',
      },
      {
        key: 'inverted-pyramid',
        difficulty: 2,
        question:
          'A suite has 40 unit tests, 15 integration tests and 600 browser end-to-end tests that take two hours and fail randomly several times a week. What does the test pyramid suggest?',
        correct:
          'Move most checks down to unit and integration tests, and keep a small set of end-to-end tests for the critical user journeys',
        wrong: [
          'Add more end-to-end tests, since they test the real system',
          'Delete the unit tests, since the end-to-end tests already cover that code',
          'Keep the suite as it is but run it only once a week',
        ],
        why: 'The pyramid recommends many fast, isolated tests at the bottom and few slow, broad ones at the top. This suite is inverted: feedback takes hours and random failures teach people to ignore red builds. End-to-end tests are still valuable for a few key journeys; most behavior can be checked lower down, faster and more reliably.',
      },
      {
        key: 'sql-needs-integration',
        difficulty: 3,
        question:
          'A repository class builds SQL queries for PostgreSQL. Which test gives real confidence that its queries are correct?',
        correct:
          'An integration test that runs the repository against a real PostgreSQL instance (for example a throwaway container) with known data',
        wrong: [
          'A unit test with a mocked database connection that returns prepared rows',
          'A unit test with an in-memory list standing in for the repository',
          'A browser end-to-end test that opens the page showing the data',
        ],
        why: 'With a mocked connection the SQL is never executed, so a typo or a wrong join still passes. Replacing the repository with an in-memory fake tests its callers, not the repository. Code whose job is to talk to an external system needs integration tests against that system; an end-to-end test would also run the SQL, but slowly and without pointing at the cause.',
      },
    ],
  ),

  // ---------------------------------------------------------------- Test structure
  ...scenarioFamily(
    'eng-test-structure',
    1,
    'Arrange sets up, Act does the one thing being tested, Assert checks the result.',
    [
      {
        key: 'find-act',
        question: 'In this framework-free C# test, which line is the Act step?',
        code: cs(`var cart = new Cart();
cart.Add(new Line("Book", 12.50m, 2));
cart.Add(new Line("Pen", 1.25m, 4));

var total = cart.Total();

Check.Equal(30.00m, total);

record Line(string Name, decimal Price, int Quantity);

class Cart
{
    private readonly List<Line> lines = [];
    public void Add(Line line) => lines.Add(line);
    public decimal Total() => lines.Sum(l => l.Price * l.Quantity);
}

static class Check
{
    public static void Equal<T>(T expected, T actual)
    {
        if (!Equals(expected, actual))
            throw new Exception($"Expected {expected} but was {actual}");
    }
}`),
        correct: '`var total = cart.Total();`',
        wrong: [
          '`var cart = new Cart();`',
          '`cart.Add(new Line("Book", 12.50m, 2));`',
          '`Check.Equal(30.00m, total);`',
        ],
        why: 'Creating the cart and adding lines is Arrange: it puts the object into the state the test needs. Calling `Total()` is the behavior under test, the Act. `Check.Equal` is the Assert. Keeping the three parts separate, with a single Act, makes it obvious what a failing test was testing.',
      },
      {
        key: 'split-test',
        difficulty: 2,
        question:
          'A test named `Test1` deposits money, checks the balance, withdraws, checks again, then tries an overdraft and checks for an exception. It fails at the second check. What is the best improvement?',
        correct:
          'Split it into focused tests, one behavior each, with names such as `Withdraw_more_than_balance_is_rejected`',
        wrong: [
          'Add comments before each step explaining what it does',
          'Combine the checks into a single condition joined with `&&`',
          'Wrap each check in `try`/`catch` so the test continues after a failure',
        ],
        why: 'A test that exercises several behaviors stops at the first failure, hiding whether the others work, and its name says nothing about what broke. Separate tests with descriptive names act as a specification and fail independently. Combining conditions or swallowing failures makes the result even less informative.',
      },
    ],
  ),

  // ---------------------------------------------------------------- Test doubles
  ...scenarioFamily(
    'eng-test-doubles',
    2,
    'Ask what the double does: returns canned answers, works for real in a simple way, or records calls for the test to check.',
    [
      {
        key: 'stub-clock',
        question:
          'A test of `Subscription.IsExpired` uses `FixedClock`. What kind of test double is it?',
        code: cs(`var clock = new FixedClock(new DateTime(2026, 3, 1, 0, 0, 0, DateTimeKind.Utc));
var subscription = new Subscription(new DateTime(2026, 2, 28, 0, 0, 0, DateTimeKind.Utc), clock);
Console.WriteLine(subscription.IsExpired);

interface IClock { DateTime UtcNow { get; } }

class FixedClock(DateTime now) : IClock
{
    public DateTime UtcNow => now;
}

class Subscription(DateTime endsUtc, IClock clock)
{
    public bool IsExpired => clock.UtcNow > endsUtc;
}`),
        correct: 'A stub: it returns a canned value so the code under test sees a controlled input',
        wrong: [
          'A mock: it verifies that `UtcNow` was called',
          'A spy: it records how it was used for later checks',
          'A fake: a working lightweight implementation of a real dependency',
        ],
        why: 'A stub supplies predetermined answers and checks nothing. Here it makes "now" a fixed moment, so the test is deterministic. A mock is set up with expectations about calls and verifies them; a spy records calls for the test to inspect; a fake has real working behavior, like an in-memory database.',
      },
      {
        key: 'fake-repository',
        difficulty: 3,
        question: 'What kind of test double is `InMemoryUserRepository`?',
        code: cs(`var repository = new InMemoryUserRepository();
var service = new RegistrationService(repository);
Console.WriteLine(service.Register("ana@example.com"));
Console.WriteLine(service.Register("ana@example.com"));

interface IUserRepository
{
    bool Exists(string email);
    void Add(string email);
}

class InMemoryUserRepository : IUserRepository
{
    private readonly HashSet<string> emails = new(StringComparer.OrdinalIgnoreCase);
    public bool Exists(string email) => emails.Contains(email);
    public void Add(string email) => emails.Add(email);
}

class RegistrationService(IUserRepository users)
{
    public string Register(string email)
    {
        if (users.Exists(email)) return "Already registered";
        users.Add(email);
        return "Registered";
    }
}`),
        correct:
          'A fake: a simple but working implementation, so the service can be tested through realistic sequences of calls',
        wrong: [
          'A stub: it always returns the same canned answer',
          'A mock: it fails the test if `Add` is called an unexpected number of times',
          'Not a test double: it is the production repository',
        ],
        why: 'The in-memory repository really stores and looks up data, just without a database. That is a fake. Because it keeps state, the test can register twice and observe the duplicate check, which a stub with fixed answers could not support. It verifies nothing on its own, so it is not a mock.',
      },
      {
        key: 'spy-email',
        difficulty: 3,
        question:
          'After calling the service, the test checks `email.Sent` to confirm exactly one message went to the customer. What kind of test double is `RecordingEmailSender`?',
        code: cs(`var email = new RecordingEmailSender();
new PasswordReset(email).Request("ana@example.com");
Console.WriteLine(email.Sent.Count == 1 && email.Sent[0].To == "ana@example.com");

interface IEmailSender { void Send(string to, string subject); }

record SentEmail(string To, string Subject);

class RecordingEmailSender : IEmailSender
{
    public List<SentEmail> Sent { get; } = [];
    public void Send(string to, string subject) => Sent.Add(new SentEmail(to, subject));
}

class PasswordReset(IEmailSender email)
{
    public void Request(string address) => email.Send(address, "Reset your password");
}`),
        correct: 'A spy: it records the calls it receives so the test can inspect them afterwards',
        wrong: [
          'A stub: it provides canned return values to the code under test',
          'A fake: it delivers email through a lightweight SMTP server',
          'A dummy: it is passed only to satisfy the constructor and never used',
        ],
        why: 'A spy captures how it was used, and the test asserts on that record afterwards. It suits outgoing side effects such as sending email, where there is no return value to check. A dummy is never used, and a stub only feeds inputs into the code under test.',
      },
      {
        key: 'over-mocking',
        difficulty: 5,
        question: [
          'This C# test uses xUnit and Moq. A developer changed `OrderService` to compute the subtotal once and reuse it, with no change in behavior. The test now fails. What is the underlying problem?',
        ],
        code: plain(`[Fact]
public void PlaceOrder_saves_order()
{
    var calculator = new Mock<IPriceCalculator>();
    calculator.Setup(c => c.Subtotal(It.IsAny<Order>())).Returns(100m);
    var repository = new Mock<IOrderRepository>();
    var service = new OrderService(calculator.Object, repository.Object);

    service.PlaceOrder(new Order());

    calculator.Verify(c => c.Subtotal(It.IsAny<Order>()), Times.Exactly(2));
    repository.Verify(r => r.Save(It.IsAny<Order>()), Times.Once());
}`),
        correct:
          'The test verifies how `OrderService` uses an internal collaborator (how often `Subtotal` is called) instead of the observable outcome, so a harmless refactor breaks it',
        wrong: [
          '`Times.Exactly(2)` should be `Times.AtLeastOnce()`, and then the test would be well designed',
          'The test needs more `Verify` calls to pin down the behavior completely',
          'The refactor must be reverted, because the test defines the required behavior',
        ],
        why: 'Interaction checks on internal collaborators couple tests to implementation details. Good tests assert outcomes: what was saved, what was returned, what message left the system. Verifying calls is most useful at real boundaries, such as an outgoing payment or email. Loosening the count treats the symptom; more verifies make the coupling worse.',
      },
    ],
  ),
  ...csOutputFamily(
    'eng-test-doubles-run',
    4,
    [
      "Follow `PlaceOrder` line by line with the stub's answer, and count every call the spy records.",
    ],
    [
      {
        key: 'declined-payment',
        code: `var email = new SpyEmailSender();
var service = new OrderService(new StubPayments(approved: false), email);

var result = service.PlaceOrder("ana@example.com", 40m);

Console.WriteLine(result);
Console.WriteLine(email.Sent.Count);

interface IPayments { bool Charge(decimal amount); }
interface IEmailSender { void Send(string to, string subject); }

class StubPayments(bool approved) : IPayments
{
    public bool Charge(decimal amount) => approved;
}

class SpyEmailSender : IEmailSender
{
    public List<string> Sent { get; } = [];
    public void Send(string to, string subject) => Sent.Add($"{to}: {subject}");
}

class OrderService(IPayments payments, IEmailSender email)
{
    public string PlaceOrder(string customer, decimal amount)
    {
        email.Send(customer, "Order received");
        if (!payments.Charge(amount)) return "Declined";
        email.Send(customer, "Order confirmed");
        return "Confirmed";
    }
}`,
        output: 'Declined\n1',
        why: 'The stub declines the payment, so `PlaceOrder` returns "Declined" after sending only "Order received". The spy shows a real bug this test can now catch: a customer whose payment failed was still told their order was received. The stub controls the input, and the spy exposes the side effect.',
      },
    ],
  ),

  // ---------------------------------------------------------------- Isolation and flaky tests
  ...csOutputFamily(
    'eng-test-shared-state',
    3,
    ['Run the tests in the order listed and track the static list between them.'],
    [
      {
        key: 'register-first',
        code: `// A hand-rolled runner: each test returns true when it passes.
var tests = new (string Name, Func<bool> Run)[]
{
    ("Register adds a user", () => { Users.Register("ana"); return Users.Count == 1; }),
    ("New store is empty", () => Users.Count == 0),
};
foreach (var (name, run) in tests)
    Console.WriteLine($"{(run() ? "PASS" : "FAIL")} {name}");

static class Users
{
    private static readonly List<string> names = [];
    public static void Register(string name) => names.Add(name);
    public static int Count => names.Count;
}`,
        output: 'PASS Register adds a user\nFAIL New store is empty',
        why: 'Both tests use the same static list, so the first test leaves "ana" behind and the second fails. Each test is correct on its own; the failure depends on order. Test frameworks do not promise an order, so such a suite fails randomly. Give each test its own fresh instance instead of static state.',
      },
      {
        key: 'empty-first',
        code: `// A hand-rolled runner: each test returns true when it passes.
var tests = new (string Name, Func<bool> Run)[]
{
    ("New store is empty", () => Users.Count == 0),
    ("Register adds a user", () => { Users.Register("ana"); return Users.Count == 1; }),
    ("Register twice adds two users", () => { Users.Register("bo"); Users.Register("cy"); return Users.Count == 2; }),
};
foreach (var (name, run) in tests)
    Console.WriteLine($"{(run() ? "PASS" : "FAIL")} {name}");

static class Users
{
    private static readonly List<string> names = [];
    public static void Register(string name) => names.Add(name);
    public static int Count => names.Count;
}`,
        output:
          'PASS New store is empty\nPASS Register adds a user\nFAIL Register twice adds two users',
        why: 'The first two tests pass, but the third starts with "ana" already registered, so the count is 3, not 2. Shared static state leaks between tests; whether a test passes depends on what ran before it. Fresh state per test (a new instance, or a reset in setup) makes each test independent.',
      },
    ],
  ),
  ...scenarioFamily(
    'eng-test-flaky',
    3,
    'Find what differs between runs: time, order, timing or shared resources.',
    [
      {
        key: 'time-dependency',
        question:
          'A test expects `DiscountRate()` to be `0.10` and passes on Saturdays but fails on weekdays. What is the best fix?',
        code: cs(`Console.WriteLine(new Pricing().DiscountRate() is 0.10m or 0m);

class Pricing
{
    public decimal DiscountRate() =>
        DateTime.Now.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday ? 0.10m : 0m;
}`),
        correct:
          'Inject the time source (for example a `TimeProvider`) into `Pricing`, and have tests pass a fixed date for each case',
        wrong: [
          'Mark the test to run only on weekends',
          'Retry the test until it passes',
          'Compute the expected value in the test with the same `DateTime.Now` check',
        ],
        why: '`DateTime.Now` is a hidden input that changes every run. Making it an explicit dependency lets tests choose a Saturday and a Monday and check both rules deterministically. Copying the production logic into the test makes it pass always, including when the logic is wrong. Retrying hides the problem.',
      },
      {
        key: 'sleep-based-wait',
        difficulty: 5,
        question:
          'This test fails about once in twenty CI runs with "Expected 1 email, got 0". The background job usually finishes in 30 to 80 ms. What is the best fix?',
        code: plain(`// C# test (xUnit)
[Fact]
public async Task Sends_reminder_after_signup()
{
    var email = new RecordingEmailSender();
    var app = new App(email);

    app.SignUp("ana@example.com");   // queues a background job
    await Task.Delay(100);

    Assert.Single(email.Sent);
}`),
        correct:
          "Wait on the outcome instead of a fixed time: await the job's completion (or poll for the email with a generous timeout), or run the job synchronously in the test",
        wrong: [
          'Increase the delay to 1,000 ms',
          'Configure the CI to retry failed tests three times',
          'Run the whole test suite on one thread',
        ],
        why: 'A fixed sleep races against the job: on a busy CI machine 100 ms is sometimes not enough. A longer sleep makes every run slower and still fails under enough load. Automatic retries hide the race, and the suite stays nondeterministic. The fix is to synchronize on the event itself.',
      },
    ],
  ),
  ...selectFamily(
    'eng-test-flaky-causes',
    4,
    'Look for anything that can differ between two runs of the same code.',
    [
      {
        key: 'local-vs-ci',
        question:
          'A C# test passes locally but fails now and then in CI. Which of these are plausible causes?',
        right: [
          'Tests run in parallel and share one database without cleaning up',
          'The code under test reads the current time or time zone',
          'The test calls a real third-party HTTP API over the network',
        ],
        wrong: [
          'The test follows the Arrange-Act-Assert structure',
          'The test has a long, descriptive name',
          'The test uses a stub for the clock',
        ],
        why: 'Shared state with parallel tests, the clock and a real network service all vary between runs: data left by other tests, the date and time, and the availability and speed of the remote service. A clean structure, descriptive names and a stubbed clock do not cause flakiness; the stub removes one of its causes.',
      },
    ],
  ),

  // ---------------------------------------------------------------- TDD and BDD
  ...scenarioFamily(
    'eng-test-tdd-bdd',
    2,
    "Red, green, refactor; and scenarios describe behavior in the business's words.",
    [
      {
        key: 'after-red',
        question:
          'Doing TDD, you have just written a failing test: `Slugify("Hello World")` should return `"hello-world"`. What is the next step?',
        correct:
          'Write the simplest code that makes this test pass, then refactor while all tests stay green',
        wrong: [
          'Write the tests for every other slug rule before any production code',
          'Refactor the existing code first, while the test is still failing',
          'Commit the failing test to `main` so the team can see it',
        ],
        why: "Red-green-refactor works in small steps: one failing test, the minimum code to pass it, then clean-up under the protection of green tests. Writing many tests first loses the tight feedback loop, and refactoring while red mixes changing behavior with restructuring. A failing test on `main` breaks everyone's build.",
      },
      {
        key: 'passes-immediately',
        difficulty: 3,
        question:
          'You write a new test for behavior you have not implemented yet, run it, and it passes. What does that most likely mean?',
        correct:
          'The test does not test what you think: it may assert something already true, not reach the new code, or never run',
        wrong: [
          'The feature was already implemented, so you can move on',
          'TDD is working as intended: tests should pass on the first run',
          'The test framework is caching old results',
        ],
        why: 'Seeing a test fail first proves it can detect the missing behavior. A new test that passes immediately usually has a mistake: a wrong assertion, a test that is not discovered, or a check that is true regardless. Investigate before trusting it.',
      },
      {
        key: 'given-when-then',
        difficulty: 3,
        question:
          'Acceptance criterion: "A customer who has spent more than 500 euros in the last 12 months gets free shipping." Which scenario expresses it best?',
        correct:
          'Given a customer who spent 520 euros in the last 12 months, When they check out an order, Then the shipping cost is 0',
        wrong: [
          'Given the `orders` table has rows totalling 520, When `ShippingService.Calculate` is called, Then it returns 0',
          'Given a loyal customer, When they check out, Then shipping is cheaper',
          'Given a customer, When they spend more than 500 euros, Then the system works correctly',
        ],
        why: 'A BDD scenario states concrete behavior in domain language: a specific context, one action and an observable outcome. Table names and service methods are implementation details that make scenarios brittle. "Loyal", "cheaper" and "works correctly" are too vague to verify.',
      },
      {
        key: 'boundary-example',
        difficulty: 4,
        question:
          'For the rule "more than 500 euros in the last 12 months means free shipping", the team has an example with 520 euros (free) and one with 100 euros (paid). Which additional example adds the most?',
        correct: 'A customer who spent exactly 500 euros pays for shipping',
        wrong: [
          'A customer who spent 10,000 euros gets free shipping',
          'A customer who spent 0 euros pays for shipping',
          'A customer who spent 700 euros last month gets free shipping',
        ],
        why: 'Errors cluster at boundaries: "more than" versus "at least" is exactly the kind of misunderstanding an example at 500 settles, and an implementation using `>=` would fail it. The other examples sit well inside ranges the existing examples already cover.',
      },
    ],
  ),

  // ---------------------------------------------------------------- Coverage and regression tests
  ...scenarioFamily(
    'eng-test-coverage',
    4,
    'Coverage tells you which code ran during tests, not whether the results were checked correctly.',
    [
      {
        key: 'full-coverage-bug',
        question:
          'The rule is "orders of 100 or more get 10% off". These two tests pass, and line and branch coverage of `Discount` is 100%. What is true?',
        code: cs(`Check(Discount(200m) == 20m, "200 gets 10%");
Check(Discount(50m) == 0m, "50 gets nothing");

static decimal Discount(decimal total) => total > 100m ? total * 0.10m : 0m;

static void Check(bool passed, string name) =>
    Console.WriteLine($"{(passed ? "PASS" : "FAIL")} {name}");`),
        correct:
          'There is a bug at exactly 100 that the tests miss: full coverage only shows both branches ran, not that the rule is right',
        wrong: [
          'With 100% branch coverage, the function is proven correct',
          'Branch coverage is not enough; 100% line coverage would have found the bug',
          'The tests are fine; boundary values are not worth testing',
        ],
        why: '`total > 100m` should be `>=`, so an order of exactly 100 gets no discount. Both branches execute in the tests, so every coverage metric is at 100%, yet the boundary is never checked. Coverage finds untested code; it cannot tell you whether the tests ask the right questions. A test at 100 would catch this.',
      },
      {
        key: 'regression-first',
        difficulty: 3,
        question:
          'Bug report: importing a CSV file with a trailing empty line crashes. You have found the cause in the parser. What is the best order of work?',
        correct:
          'Write a test that imports such a file and fails with the crash, then fix the parser and keep the test in the suite',
        wrong: [
          'Fix the parser, try the file by hand, and close the bug',
          'Wrap the import in `try`/`catch` so the crash cannot happen again',
          'Fix the parser and ask QA to add the file to their manual checklist',
        ],
        why: 'A test that reproduces the bug proves you understand it, proves the fix works (it goes from red to green), and stops the bug from coming back unnoticed. Manual checks are forgotten, and catching the exception hides the defect instead of fixing it.',
      },
      {
        key: 'surviving-mutants',
        difficulty: 5,
        question:
          'Line coverage of `PriceCalculator` is 95%, but a mutation-testing run reports many surviving mutants: changing `>=` to `>` or `+` to `-` makes no test fail. What does this tell you?',
        correct:
          'The tests run that code but barely check its results; their assertions are missing or too weak',
        wrong: [
          'The mutation testing tool is unreliable when coverage is above 90%',
          'Coverage is too high and some tests should be removed',
          'The code is too complex to test and should be excluded from the report',
        ],
        why: 'Mutation testing makes small changes to the code and expects some test to fail. A surviving mutant means no test noticed the behavior change, typically because tests execute code without asserting on its results. High coverage combined with surviving mutants is the classic sign of tests that run code but do not verify it.',
      },
    ],
  ),
];
