import type { QuestionSource } from '@pracstack/content-model';
import { csCodeChoiceFamily, csCompilesFamily, csConceptFamily, csOutputFamily } from './builders';

/*
 * C# testing and maintainability: unit testing and TDD, dependency injection and
 * SOLID, refactoring and readable code. Every snippet is compiled and run by the
 * real C# runner (see builders.ts). The runner has no NuGet test frameworks, so the
 * tests here are framework-free: a tiny `Check` helper that throws, hand-written
 * test doubles, and a `Run` loop that prints PASS or FAIL. The ideas carry over
 * one-to-one to xUnit, NUnit and MSTest.
 */

/** A minimal assertion helper, shared by the testing questions. */
const CHECK = `static class Check
{
    public static void Equal<T>(T expected, T actual)
    {
        if (!EqualityComparer<T>.Default.Equals(expected, actual))
            throw new Exception($"expected {expected}, got {actual}");
    }
}`;

/** A minimal test runner: runs one test and reports PASS or FAIL. */
const RUN = `static void Run(string name, Action test)
{
    try
    {
        test();
        Console.WriteLine($"PASS {name}");
    }
    catch (Exception e)
    {
        Console.WriteLine($"FAIL {name}: {e.Message}");
    }
}`;

const DOUBLE_OPTIONS = {
  stub: 'A stub: it returns canned answers so the code under test can run, and the test does not check how it was called',
  spy: 'A spy: it records how it was called, so the test can check those calls afterwards',
  fake: 'A fake: a working but simplified implementation, such as an in-memory store',
  mock: 'A mock: it is set up with the calls it expects and fails the test itself when they do not happen',
};

// ---------------------------------------------------------------- Unit testing and TDD

export const unitTestingFamilies: readonly QuestionSource[] = [
  ...csCodeChoiceFamily(
    'cs-test-arrange-act-assert',
    1,
    'A test has three parts: Arrange (set up), Act (do the one thing under test), Assert (check the result).',
    [
      {
        key: 'find-act',
        question: 'In `WithdrawReducesBalance`, which line is the Act step?',
        code: `WithdrawReducesBalance();
Console.WriteLine("PASS");

static void WithdrawReducesBalance()
{
    var account = new Account("NL01", 100m);
    var amount = 30m;
    account.Withdraw(amount);
    Check.Equal(70m, account.Balance);
}

class Account(string iban, decimal opening)
{
    public string Iban { get; } = iban;
    public decimal Balance { get; private set; } = opening;
    public void Withdraw(decimal amount) => Balance -= amount;
}

${CHECK}`,
        correct: '`account.Withdraw(amount);`',
        wrong: [
          '`var account = new Account("NL01", 100m);`',
          '`var amount = 30m;`',
          '`Check.Equal(70m, account.Balance);`',
        ],
        why: 'The Act is the single call whose behavior the test is about: `Withdraw`. Creating the account and choosing the amount are Arrange (setting the scene), and `Check.Equal` is the Assert. Mistaking the constructor for the Act is common; keeping the three parts visibly separate (often with a blank line between them) makes a test easy to read.',
      },
      {
        key: 'no-assert',
        question:
          '`Withdraw` has a bug (it adds instead of subtracting), yet the runner reports this test as PASS. Why?',
        code: `try
{
    var account = new Account(100m);
    account.Withdraw(30m);
    Console.WriteLine(account.Balance);
    Console.WriteLine("PASS Withdraw reduces balance");
}
catch (Exception e)
{
    Console.WriteLine($"FAIL: {e.Message}");
}

class Account(decimal opening)
{
    public decimal Balance { get; private set; } = opening;
    public void Withdraw(decimal amount) => Balance += amount;
}`,
        correct:
          'The test has no Assert: printing `130` checks nothing, so it only fails if something throws',
        wrong: [
          'The runner caches the previous result of a test and reports it again',
          '`decimal` arithmetic is checked only in Release builds',
          'A test only fails when it prints the word FAIL itself, and this one did not',
        ],
        why: 'A test fails when an assertion fails (or something throws). Writing the value to the console is not an assertion: nobody reads it, and the test goes green whatever `Withdraw` does. A test with no Assert is a smoke test at best; add `Check.Equal(70m, account.Balance)` and it immediately goes red.',
      },
      {
        key: 'two-acts',
        question:
          'This test fails at its second check. What is the main problem with how it is written?',
        code: `try
{
    var account = new Account(100m);
    account.Withdraw(30m);
    Check.Equal(70m, account.Balance);
    account.Deposit(50m);
    Check.Equal(120m, account.Balance);
    Console.WriteLine("PASS Account works");
}
catch (Exception e)
{
    Console.WriteLine($"FAIL Account works: {e.Message}");
}

class Account(decimal opening)
{
    public decimal Balance { get; private set; } = opening;
    public void Withdraw(decimal amount) => Balance -= amount;
    public void Deposit(decimal amount) => Balance += amount * 1.4m;
}

${CHECK}`,
        correct:
          'It has two Acts (withdraw, then deposit) in one test with a vague name; split it into one test per behavior, so a failure names exactly what broke',
        wrong: [
          'It should assert only once, at the very end, after both calls',
          'Tests must not call more than one method of the class under test',
          'The two `Check.Equal` calls run in parallel, so their results get mixed up',
        ],
        why: 'One test, one behavior: when `Account works` fails you must read the code to learn whether withdrawing or depositing broke, and the deposit check depends on the withdraw step before it. Two tests (`Withdraw_ReducesBalance`, `Deposit_IncreasesBalance`), each with its own Arrange, fail independently and name the problem. Asserting only at the end makes it worse, not better.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-test-runner-output',
    2,
    [
      'An assertion that fails throws; the runner catches the exception, reports FAIL with its message, and moves on to the next test.',
    ],
    [
      {
        key: 'boundary-fail',
        code: `Run("free shipping from 50", () => Check.Equal(0m, Shipping.Cost(50m)));
Run("shipping below 50", () => Check.Equal(4.95m, Shipping.Cost(49.99m)));

${RUN}

static class Shipping
{
    public static decimal Cost(decimal orderTotal) => orderTotal > 50m ? 0m : 4.95m;
}

${CHECK}`,
        output: 'FAIL free shipping from 50: expected 0, got 4.95\nPASS shipping below 50',
        why: 'At exactly 50 the code uses `>`, so it charges 4.95: `Check.Equal` throws and the runner prints FAIL with the message. A failing test does not stop the others: the second test still runs and passes. The failing test caught a boundary bug (`>` instead of `>=`).',
      },
      {
        key: 'expected-exception',
        code: `Run("negative quantity", () => Check.Throws<ArgumentException>(() => new OrderLine("pen", -1)));
Run("zero quantity", () => Check.Throws<ArgumentOutOfRangeException>(() => new OrderLine("pen", 0)));
Run("missing name", () => Check.Throws<ArgumentOutOfRangeException>(() => new OrderLine(null!, 1)));

${RUN}

class OrderLine
{
    public OrderLine(string name, int quantity)
    {
        ArgumentException.ThrowIfNullOrEmpty(name);
        ArgumentOutOfRangeException.ThrowIfNegative(quantity);
    }
}

static class Check
{
    public static void Throws<TException>(Action act) where TException : Exception
    {
        try
        {
            act();
        }
        catch (TException)
        {
            return;
        }
        throw new Exception($"expected {typeof(TException).Name}");
    }
}`,
        output:
          "PASS negative quantity\nFAIL zero quantity: expected ArgumentOutOfRangeException\nFAIL missing name: Value cannot be null. (Parameter 'name')",
        why: '`catch (TException)` also catches derived types, so `ArgumentOutOfRangeException` satisfies `Throws<ArgumentException>`. Zero is allowed, so nothing is thrown and `Throws` fails the test itself. For `null`, `ThrowIfNullOrEmpty` throws `ArgumentNullException`, which is not the expected type, so it escapes `Throws` and the runner reports it as a failure with its own message. Real frameworks behave alike: xUnit’s `Assert.Throws` even demands the exact type, while `ThrowsAny` accepts derived ones.',
      },
    ],
  ),
  ...csConceptFamily(
    'cs-test-naming',
    2,
    'A good test name tells you what broke without opening the test.',
    [
      {
        key: 'insufficient-funds',
        question:
          'A test checks that withdrawing more than the balance throws `InsufficientFundsException`. Which name is best?',
        correct: '`Withdraw_AmountAboveBalance_ThrowsInsufficientFunds`',
        wrong: [
          '`TestWithdraw2`',
          '`WithdrawWorksCorrectly`',
          '`Withdraw_CallsValidateThenWritesBalanceField`',
        ],
        why: 'A name in the form “unit, scenario, expected outcome” reads as a specification and makes a failure report self-explanatory. `TestWithdraw2` and `WithdrawWorksCorrectly` say nothing about the case. Naming the internal steps (`CallsValidateThenWritesBalanceField`) describes the implementation, so the name goes stale as soon as the code is refactored, even though the behavior is unchanged.',
      },
    ],
  ),
  ...csCodeChoiceFamily(
    'cs-test-boundary-cases',
    2,
    'Bugs cluster at boundaries: the exact threshold, zero, one, empty, the maximum.',
    [
      {
        key: 'discount-threshold',
        question:
          'The rule is “orders of 10 or more items get 10% off”. Both tests pass. Which extra test would expose the bug?',
        code: `Run("big order gets discount", () => Check.Equal(0.1m, Discount.Rate(25)));
Run("small order gets none", () => Check.Equal(0m, Discount.Rate(3)));

${RUN}

static class Discount
{
    public static decimal Rate(int items) => items > 10 ? 0.1m : 0m;
}

${CHECK}`,
        correct: '`Check.Equal(0.1m, Discount.Rate(10))`: exactly at the threshold',
        wrong: [
          '`Check.Equal(0.1m, Discount.Rate(1000))`: a much larger order',
          '`Check.Equal(0m, Discount.Rate(5))`: another small order',
          'Running `Discount.Rate(25)` a second time to check it is stable',
        ],
        why: 'Values far from the threshold (3, 5, 25, 1000) all land on the same side under `>` and `>=`, so they cannot tell the two apart. Only the boundary value 10 does: the rule says 10 gets the discount, the code says it does not. Pick test inputs at, just below and just above each boundary, not just “typical” ones.',
      },
    ],
  ),
  ...csCodeChoiceFamily(
    'cs-test-doubles',
    3,
    'Ask what the test double does: return canned data, record calls, behave like a simple real implementation, or verify expectations itself?',
    [
      {
        key: 'stub',
        question: 'What kind of test double is `FixedUserStore`?',
        code: `var service = new GreetingService(new FixedUserStore("Ada"));
Check.Equal("Hello, Ada", service.Greet(42));
Console.WriteLine("PASS greets the user by name");

interface IUserStore
{
    string? FindName(int id);
}

class FixedUserStore(string name) : IUserStore
{
    public string? FindName(int id) => name;
}

class GreetingService(IUserStore users)
{
    public string Greet(int id) => $"Hello, {users.FindName(id) ?? "guest"}";
}

${CHECK}`,
        correct: DOUBLE_OPTIONS.stub,
        wrong: [DOUBLE_OPTIONS.spy, DOUBLE_OPTIONS.fake, DOUBLE_OPTIONS.mock],
        why: '`FixedUserStore` ignores its input and returns a canned value: a stub. It feeds indirect input into the code under test, and the test asserts on the result (`Greet`), not on the store. It records nothing (so it is not a spy), has no real behavior (not a fake), and does not verify anything itself (not a mock). People often call every double a “mock”; the precise words help you pick the simplest one that works.',
      },
      {
        key: 'spy',
        question: 'What kind of test double is `RecordingMailer`?',
        code: `var mailer = new RecordingMailer();
var signup = new SignupService(mailer);
signup.Register("ada@example.com");
Check.Equal(1, mailer.Sent.Count);
Check.Equal("ada@example.com", mailer.Sent[0]);
Console.WriteLine("PASS sends one welcome email");

interface IMailer
{
    void Send(string to, string subject);
}

class RecordingMailer : IMailer
{
    public List<string> Sent { get; } = [];
    public void Send(string to, string subject) => Sent.Add(to);
}

class SignupService(IMailer mailer)
{
    public void Register(string email) => mailer.Send(email, "Welcome");
}

${CHECK}`,
        correct: DOUBLE_OPTIONS.spy,
        wrong: [DOUBLE_OPTIONS.stub, DOUBLE_OPTIONS.fake, DOUBLE_OPTIONS.mock],
        why: 'Sending an email is an outgoing side effect with no return value, so the test checks it by recording the calls and asserting on them afterwards: a spy. The difference from a mock is who checks: a mock is told the expected calls up front and verifies them itself (what Moq’s `Verify` does); here the test does the checking with ordinary assertions.',
      },
      {
        key: 'fake',
        question: 'What kind of test double is `InMemoryAccounts`?',
        code: `var accounts = new InMemoryAccounts();
var service = new TransferService(accounts);
accounts.Save(new Account("A", 100m));
accounts.Save(new Account("B", 0m));
service.Transfer("A", "B", 40m);
Check.Equal(60m, accounts.Find("A")!.Balance);
Check.Equal(40m, accounts.Find("B")!.Balance);
Console.WriteLine("PASS transfer moves money");

record Account(string Id, decimal Balance);

interface IAccountRepository
{
    Account? Find(string id);
    void Save(Account account);
}

class InMemoryAccounts : IAccountRepository
{
    private readonly Dictionary<string, Account> _rows = [];
    public Account? Find(string id) => _rows.GetValueOrDefault(id);
    public void Save(Account account) => _rows[account.Id] = account;
}

class TransferService(IAccountRepository accounts)
{
    public void Transfer(string from, string to, decimal amount)
    {
        var source = accounts.Find(from) ?? throw new InvalidOperationException("unknown account");
        var target = accounts.Find(to) ?? throw new InvalidOperationException("unknown account");
        accounts.Save(source with { Balance = source.Balance - amount });
        accounts.Save(target with { Balance = target.Balance + amount });
    }
}

${CHECK}`,
        correct: DOUBLE_OPTIONS.fake,
        wrong: [DOUBLE_OPTIONS.stub, DOUBLE_OPTIONS.spy, DOUBLE_OPTIONS.mock],
        why: '`InMemoryAccounts` really works: what you save you can find again. It is a fake, a lightweight stand-in for the database that is unsuitable for production but behaves correctly. Fakes let a test check the resulting state instead of a list of calls, which keeps tests robust when the service changes how many times it reads or writes.',
      },
    ],
  ),
  ...csCodeChoiceFamily(
    'cs-test-time-dependency',
    3,
    'Code that reads the clock directly cannot be tested at a chosen moment. Make the time an input.',
    [
      {
        key: 'datetime-now',
        question:
          'A test asserts `shop.IsOpen()` is `true`. It passes in the morning and fails in the evening. What is the best fix?',
        code: `var shop = new Shop();
Console.WriteLine(shop.IsOpen() ? "open" : "closed");

class Shop
{
    public bool IsOpen()
    {
        var hour = DateTime.Now.Hour;
        return hour >= 9 && hour < 18;
    }
}`,
        correct:
          'Inject a `TimeProvider` through the constructor; production passes `TimeProvider.System`, and tests pass a subclass that returns a fixed time',
        wrong: [
          'Only run the test suite during opening hours',
          'Compute the expected value in the test from `DateTime.Now` as well',
          'Retry the test up to three times before reporting a failure',
        ],
        why: 'The hidden input is the clock. Making it a dependency (`TimeProvider`, built into .NET 8 and later, or your own `IClock`) lets each test choose the moment: 10:00 for “open”, 20:00 for “closed”, 9:00 and 18:00 for the boundaries. Recomputing the expectation from `DateTime.Now` duplicates the logic under test and is still racy near a boundary; retries and timetables only hide a flaky test.',
      },
      {
        key: 'bypassed-clock',
        question:
          'The test pins the clock to 31 January 2026 and expects `DueOn()` to be 2 March 2026, but the test fails. Why?',
        code: `var clock = new FixedClock(new DateTimeOffset(2026, 1, 31, 12, 0, 0, TimeSpan.Zero));
var invoice = new Invoice(clock);
Console.WriteLine(invoice.IssuedOn.ToString("yyyy-MM-dd"));
Console.WriteLine(invoice.DueOn() == new DateOnly(2026, 3, 2));

class FixedClock(DateTimeOffset now) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => now;
}

class Invoice(TimeProvider clock)
{
    public DateOnly IssuedOn { get; } = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
    public DateOnly DueOn() => DateOnly.FromDateTime(DateTime.UtcNow).AddDays(30);
}`,
        correct:
          '`DueOn` reads `DateTime.UtcNow` directly, bypassing the injected clock; it should be `IssuedOn.AddDays(30)` (or use `clock`)',
        wrong: [
          '`FixedClock` must also override `GetLocalNow`, which `DateOnly.FromDateTime` calls',
          'A `TimeProvider` subclass cannot be passed to a primary constructor',
          '`AddDays(30)` on a `DateOnly` skips the end of the month',
        ],
        why: 'Injecting a clock only helps if every read of the time goes through it. `IssuedOn` uses the fixed clock, but `DueOn` calls `DateTime.UtcNow`, so the result depends on the real date the test runs. Search for stray `DateTime.Now`/`UtcNow` calls when introducing a seam. (31 January plus 30 days is 2 March 2026, so the expectation itself is right.)',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-test-isolation',
    4,
    [
      'Static fields live for the whole process. Tests that share them see each other’s leftovers, so the result depends on the order the tests run in.',
    ],
    [
      {
        key: 'shared-list',
        code: `Run(nameof(StartsEmpty), StartsEmpty);
Run(nameof(AddsOneItem), AddsOneItem);
Console.WriteLine("-- other order --");
Run(nameof(AddsOneItem), AddsOneItem);
Run(nameof(StartsEmpty), StartsEmpty);

static void StartsEmpty() => Check.Equal(0, Basket.Items.Count);

static void AddsOneItem()
{
    Basket.Items.Add("pen");
    Check.Equal(1, Basket.Items.Count);
}

${RUN}

static class Basket
{
    public static readonly List<string> Items = [];
}

${CHECK}`,
        output:
          'PASS StartsEmpty\nPASS AddsOneItem\n-- other order --\nFAIL AddsOneItem: expected 1, got 2\nFAIL StartsEmpty: expected 0, got 2',
        why: 'Both tests use the one static `Basket.Items` list. In the first order each test happens to see what it expects; afterwards the list still holds `pen`, so the second run adds a second pen and `StartsEmpty` sees 2. Test runners do not promise an order (and may run tests in parallel), so such tests pass or fail at random. Give each test its own fresh instance (`new Basket()`), or reset shared state in setup.',
      },
      {
        key: 'static-id',
        code: `Run(nameof(IdsIncrease), IdsIncrease);
Run(nameof(FirstOrderGetsIdOne), FirstOrderGetsIdOne);

static void FirstOrderGetsIdOne() => Check.Equal(1, new Order().Id);

static void IdsIncrease()
{
    var a = new Order();
    var b = new Order();
    Check.Equal(a.Id + 1, b.Id);
}

${RUN}

class Order
{
    private static int _next;
    public int Id { get; } = ++_next;
}

${CHECK}`,
        output: 'PASS IdsIncrease\nFAIL FirstOrderGetsIdOne: expected 1, got 3',
        why: 'The static counter keeps counting across tests: `IdsIncrease` creates orders 1 and 2, so the next order gets id 3. `IdsIncrease` is robust because it asserts a relationship, but `FirstOrderGetsIdOne` passes only when it runs first. The real fix is a seam: inject an id generator so each test controls it, instead of a hidden static.',
      },
    ],
  ),
  ...csCodeChoiceFamily(
    'cs-test-behaviour-not-implementation',
    4,
    'Would a user of the class notice the change? If not, a test that fails on it is testing the implementation.',
    [
      {
        key: 'call-count',
        question:
          'A colleague added the cache to `PriceService`. Prices are still correct, but the second test now fails (`expected 2, got 1`). What is the best response?',
        code: `Run("returns the stored price", () =>
{
    var service = new PriceService(new CountingRepository());
    Check.Equal(1.5m, service.PriceOf("pen"));
});
Run("asks the repository each time", () =>
{
    var repo = new CountingRepository();
    var service = new PriceService(repo);
    service.PriceOf("pen");
    service.PriceOf("pen");
    Check.Equal(2, repo.Calls);
});

${RUN}

interface IPriceRepository
{
    decimal Find(string sku);
}

class CountingRepository : IPriceRepository
{
    public int Calls { get; private set; }
    public decimal Find(string sku)
    {
        Calls++;
        return 1.5m;
    }
}

class PriceService(IPriceRepository repository)
{
    private readonly Dictionary<string, decimal> _cache = [];

    public decimal PriceOf(string sku)
    {
        if (!_cache.TryGetValue(sku, out var price))
            _cache[sku] = price = repository.Find(sku);
        return price;
    }
}

${CHECK}`,
        correct:
          'Delete or rewrite the second test: it pins how `PriceService` gets its data, not what it returns, so it breaks on a correct refactoring',
        wrong: [
          'Remove the cache: the test documents the intended design',
          'Change the expected count to `1` and keep the test as it is',
          'Make `Calls` private so tests cannot depend on it',
        ],
        why: 'Good tests survive refactoring: they check observable behavior (the price returned) and fail only when that behavior breaks. Counting repository calls over-specifies the interaction, so it fails on a harmless change; changing the number to 1 just pins the new implementation, and the next refactoring breaks it again. Assert on interactions only when the interaction is the requirement (for example “never call the paid API twice for the same SKU”), and name the test after that requirement.',
      },
    ],
  ),
  ...csCodeChoiceFamily(
    'cs-test-tdd-cycle',
    4,
    'Red: write a failing test. Green: the simplest code that passes. Refactor: clean up while all tests stay green.',
    [
      {
        key: 'make-it-green',
        question:
          'You are doing TDD. The first test passed with `=> 0`. You just wrote the second test and watched it fail. What do you do next?',
        code: `Run("no points under 1 euro", () => Check.Equal(0, Loyalty.Points(0.99m)));
Run("one point per whole euro", () => Check.Equal(12, Loyalty.Points(12.80m)));

${RUN}

static class Loyalty
{
    public static int Points(decimal amount) => 0;
}

${CHECK}`,
        correct:
          'Write the simplest code that makes both tests pass, such as `(int)Math.Floor(amount)`, run all tests, then consider refactoring',
        wrong: [
          'Also implement the “double points for members” rule you know is coming, to save a cycle',
          'Delete the first test: `=> 0` was a fake implementation, so it proved nothing',
          'Refactor `Points` first, while the new test is still red',
        ],
        why: 'Green means the smallest change that passes all tests: here, truncating to whole euros. Writing code for requirements that have no failing test yet (members) produces untested code, which is exactly what TDD avoids. The first test still matters: it pins the “under 1 euro” case. Refactoring is done only while green, so you always know a failure came from your last step.',
      },
      {
        key: 'refactor-while-green',
        question:
          'All three tests pass. The next requirement is “no points on gift cards”. In red-green-refactor, what comes next?',
        code: `Run("1 point per euro", () => Check.Equal(12, Loyalty.Points(12.80m, member: false)));
Run("members get double", () => Check.Equal(24, Loyalty.Points(12.80m, member: true)));
Run("no points under 1 euro", () => Check.Equal(0, Loyalty.Points(0.99m, member: true)));

${RUN}

static class Loyalty
{
    public static int Points(decimal amount, bool member)
    {
        if (member)
        {
            int points = (int)Math.Floor(amount);
            return points * 2;
        }
        else
        {
            int points = (int)Math.Floor(amount);
            return points;
        }
    }
}

${CHECK}`,
        correct:
          'Refactor now, while green: remove the duplicated floor logic, rerun the tests, and only then write a failing test for gift cards',
        wrong: [
          'Write the gift-card code first and add its test once it works',
          'Write the gift-card test, make it pass and remove the duplication in one change',
          'Nothing needs tidying: the tests pass, so the duplication is harmless',
        ],
        why: 'The refactor step is part of the cycle, not optional polish: with all tests green you can restructure (`var points = (int)Math.Floor(amount); return member ? points * 2 : points;`) and the tests prove behavior is unchanged. Mixing the refactor with new behavior means a red test could come from either change. Skipping it lets duplication pile up; the next rule would have to be added in two places.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-test-coverage-limits',
    5,
    [
      'Coverage says which lines ran during the tests, not whether the results were right for inputs nobody tried.',
    ],
    [
      {
        key: 'integer-average',
        code: `Run("average of 2 and 4", () => Check.Equal(3.0, Stats.Average([2, 4])));
Run("average of one value", () => Check.Equal(7.0, Stats.Average([7])));
Console.WriteLine(Stats.Average([1, 2]));

${RUN}

static class Stats
{
    public static double Average(int[] values) => values.Sum() / values.Length;
}

${CHECK}`,
        output: 'PASS average of 2 and 4\nPASS average of one value\n1',
        why: 'Both tests pass and cover every line, yet `Average` is wrong: `values.Sum() / values.Length` is integer division (3 / 2 is 1), and only then converted to `double`. The tests happened to use inputs whose average is a whole number. 100% coverage cannot reveal a bug that your inputs do not trigger; choose cases that would distinguish right from wrong (here, an odd sum), then fix with `(double)values.Sum() / values.Length`.',
      },
      {
        key: 'and-instead-of-or',
        code: `// Rule: free delivery for members, or for orders of 50 or more.
Run("member, big order", () => Check.Equal(true, FreeDelivery(true, 80m)));
Run("guest, small order", () => Check.Equal(false, FreeDelivery(false, 20m)));
Console.WriteLine(FreeDelivery(true, 20m));
Console.WriteLine(FreeDelivery(false, 80m));

static bool FreeDelivery(bool member, decimal total) => member && total >= 50m;

${RUN}

${CHECK}`,
        output: 'PASS member, big order\nPASS guest, small order\nFalse\nFalse',
        why: 'The tests produce both `true` and `false`, so line and branch coverage are complete, but both test cases agree under `&&` and `||`. The cases that distinguish them (a member with a small order, a guest with a big one) were never tested, and both get the wrong answer. Coverage measures what ran, not what was checked; think about which inputs would fail if the code were wrong.',
      },
    ],
  ),
  ...csCodeChoiceFamily(
    'cs-test-regression',
    5,
    'Before fixing a reported bug, capture it in a test that fails for the reported reason.',
    [
      {
        key: 'bill-split',
        question:
          'Bug report: “splitting a bill of 10.00 between 3 people only collects 9.99.” What should you do first?',
        code: `var shares = Bill.Split(10.00m, 3);
Console.WriteLine(string.Join(" + ", shares) + " = " + shares.Sum());

static class Bill
{
    public static decimal[] Split(decimal total, int people)
    {
        var share = Math.Round(total / people, 2);
        return Enumerable.Repeat(share, people).ToArray();
    }
}`,
        correct:
          'Write a test that `Split(10.00m, 3)` adds up to 10.00, watch it fail, then fix the code and keep the test as a regression test',
        wrong: [
          'Change the rounding to `MidpointRounding.AwayFromZero` and check the bill again by hand',
          'Add tests for `Split(9.00m, 3)` and `Split(12.00m, 4)` to raise coverage',
          'Wrap `Split` in a `try`/`catch` so the error is logged',
        ],
        why: 'A failing test that reproduces the report proves you understand the bug, proves the fix works (red turns green), and stops the bug from quietly coming back. Here the rounding mode is not the cause (3.333… rounds to 3.33 either way): the remainder cent must go to one of the shares, which a reproducing test would have made clear. Tests with inputs that divide evenly pass already and prove nothing, and nothing is thrown, so a `try`/`catch` changes nothing.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Dependency injection and SOLID

const DI = 'using Microsoft.Extensions.DependencyInjection;';

export const solidDiFamilies: readonly QuestionSource[] = [
  ...csCodeChoiceFamily(
    'cs-di-constructor-injection',
    1,
    'Can a caller (or a test) see and replace what this class depends on?',
    [
      {
        key: 'new-inside',
        question:
          'You want to test `Register` without sending real email. What is the best change?',
        code: `var service = new SignupService();
service.Register("ada@example.com");

interface IEmailSender
{
    void Send(string to, string subject);
}

class SmtpEmailSender : IEmailSender
{
    public void Send(string to, string subject) => Console.WriteLine($"SMTP to {to}: {subject}");
}

class SignupService
{
    private readonly SmtpEmailSender _email = new();
    public void Register(string address) => _email.Send(address, "Welcome");
}`,
        correct:
          'Take an `IEmailSender` in the constructor and store it; the app passes `SmtpEmailSender`, a test passes a spy',
        wrong: [
          'Make `_email` public and non-readonly so a test can overwrite it',
          'Add a `bool isTest` parameter and skip sending when it is `true`',
          'Make `SmtpEmailSender.Send` static so it is easier to call',
        ],
        why: 'Creating the dependency with `new` inside the class hard-wires it: every caller, including tests, gets real SMTP. Constructor injection makes the dependency explicit and replaceable: `SignupService(IEmailSender email)`. A test flag puts test logic in production code, and a public mutable field lets any code swap the sender at any time.',
      },
      {
        key: 'service-locator',
        question: 'This works and depends on an interface. What is the main design problem?',
        code: `ServiceLocator.Register<IEmailSender>(new ConsoleEmailSender());
var service = new SignupService();
service.Register("ada@example.com");

interface IEmailSender
{
    void Send(string to, string subject);
}

class ConsoleEmailSender : IEmailSender
{
    public void Send(string to, string subject) => Console.WriteLine($"to {to}: {subject}");
}

static class ServiceLocator
{
    private static readonly Dictionary<Type, object> Services = [];
    public static void Register<T>(T service) where T : notnull => Services[typeof(T)] = service;
    public static T Get<T>() => (T)Services[typeof(T)];
}

class SignupService
{
    public void Register(string address) => ServiceLocator.Get<IEmailSender>().Send(address, "Welcome");
}`,
        correct:
          'The dependency is hidden: the constructor says `SignupService` needs nothing, so a missing registration only shows up at run time, and tests share one global registry',
        wrong: [
          'Dictionary lookups by `Type` are too slow to use for every call',
          'Interfaces cannot be used as generic type arguments to `Get<T>`',
          'Nothing: a service locator is the same as constructor injection',
        ],
        why: 'A service locator pulls dependencies from a global inside the method, so the class signature lies about what it needs. Forget a registration and you get a `KeyNotFoundException` deep in a call; tests must set up (and clean up) static state, which breaks isolation. Constructor injection puts the same dependency in the signature, where the compiler and the DI container check it.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-di-lifetimes',
    2,
    [
      'Singleton: one instance for the app. Scoped: one per scope (in ASP.NET Core, per request). Transient: a new one every time it is resolved.',
    ],
    [
      {
        key: 'identity',
        code: `${DI}

var services = new ServiceCollection();
services.AddSingleton<Clock>();
services.AddScoped<Basket>();
services.AddTransient<Receipt>();
using var provider = services.BuildServiceProvider();

using var scope1 = provider.CreateScope();
using var scope2 = provider.CreateScope();
var a = scope1.ServiceProvider;
var b = scope2.ServiceProvider;

Console.WriteLine(ReferenceEquals(a.GetRequiredService<Clock>(), b.GetRequiredService<Clock>()));
Console.WriteLine(ReferenceEquals(a.GetRequiredService<Basket>(), a.GetRequiredService<Basket>()));
Console.WriteLine(ReferenceEquals(a.GetRequiredService<Basket>(), b.GetRequiredService<Basket>()));
Console.WriteLine(ReferenceEquals(a.GetRequiredService<Receipt>(), a.GetRequiredService<Receipt>()));

class Clock { }
class Basket { }
class Receipt { }`,
        output: 'True\nTrue\nFalse\nFalse',
        why: 'The singleton is shared across scopes. The scoped `Basket` is the same object within one scope but different between scopes. A transient is created anew on every resolve, even twice in the same scope. Choosing the lifetime is a design decision: state that must be per request (a basket, a database unit of work) is scoped; stateless or thread-safe shared services can be singletons.',
      },
      {
        key: 'disposal',
        code: `${DI}

var services = new ServiceCollection();
services.AddScoped<DbSession>();
services.AddSingleton<Cache>();
var provider = services.BuildServiceProvider();

using (var scope = provider.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<DbSession>();
    scope.ServiceProvider.GetRequiredService<Cache>();
    Console.WriteLine("end of request");
}
Console.WriteLine("shutting down");
provider.Dispose();

class DbSession : IDisposable
{
    public void Dispose() => Console.WriteLine("DbSession disposed");
}

class Cache : IDisposable
{
    public void Dispose() => Console.WriteLine("Cache disposed");
}`,
        output: 'end of request\nDbSession disposed\nshutting down\nCache disposed',
        why: 'The container owns what it creates and disposes it when the owning scope ends. A scoped service is disposed with its scope (the end of the request); a singleton lives in the root provider, so it is disposed only when the provider is, even though it was first resolved inside the scope. So do not dispose injected services yourself, and do not keep a scoped service after its scope ends.',
      },
    ],
  ),
  ...csCodeChoiceFamily(
    'cs-solid-single-responsibility',
    2,
    'Count the reasons this class would have to change: a new file format, a new database, new email wording…',
    [
      {
        key: 'importer',
        question: 'Which change best follows the single responsibility principle?',
        code: `var importer = new CustomerImporter();
importer.Import("Ada,ada@example.com\\nLinus,linus@example.com");

class CustomerImporter
{
    private readonly List<string> _database = [];

    public void Import(string csv)
    {
        foreach (var line in csv.Split('\\n'))
        {
            var parts = line.Split(',');
            _database.Add(parts[0]);
            Console.WriteLine($"Email to {parts[1]}: welcome, {parts[0]}");
        }
    }
}`,
        correct:
          'Extract a `CustomerCsvParser` (text to `Customer` records), an `ICustomerRepository` and an `IWelcomeMailer`; `CustomerImporter` only coordinates them',
        wrong: [
          'Make `Import` static so the class holds no state',
          'Move the three steps into three private methods of `CustomerImporter`',
          'Create an abstract `CustomerImporterBase` with virtual parse, save and email methods',
        ],
        why: 'The class mixes parsing, persistence and notification: three reasons to change, and you cannot test the parsing without the “database” and the email. Separate classes with injected interfaces let each part change and be tested alone, and the importer becomes a short coordinator. Private methods improve readability but keep all three concerns (and their dependencies) in one class; a base class with virtual hooks couples them through inheritance instead.',
      },
    ],
  ),
  ...csCodeChoiceFamily(
    'cs-solid-dependency-inversion',
    2,
    'Which way should the dependency arrow point: from the business rule to the database code, or to an abstraction the business rule owns?',
    [
      {
        key: 'report-store',
        question:
          '`SalesReport` holds business logic and depends directly on `SqlSalesStore`. Which change applies the dependency inversion principle?',
        code: `var report = new SalesReport(new SqlSalesStore());
Console.WriteLine(report.Build(2026));

class SqlSalesStore
{
    public decimal TotalFor(int year) => 1200m;
}

class SalesReport(SqlSalesStore store)
{
    public string Build(int year) => $"{year}: {store.TotalFor(year)}";
}`,
        correct:
          'Define an `ISalesStore` shaped by what the report needs, make `SalesReport` depend on it, and have `SqlSalesStore` implement it',
        wrong: [
          'Make `SalesReport` inherit from `SqlSalesStore` so it can call `TotalFor` directly',
          'Create the `SqlSalesStore` with `new` inside `SalesReport` instead of passing it in',
          'Move the SQL query into `SalesReport` so there is only one class',
        ],
        why: 'Dependency inversion: high-level policy (the report) should not depend on low-level detail (SQL); both depend on an abstraction, and the abstraction belongs to the high-level side. Then the report can be tested with an in-memory store and the storage can change without touching it. Inheriting from or merging with the SQL class couples them even more tightly; `new` inside hides the coupling but keeps it.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-di-multiple-registrations',
    3,
    [
      'Resolving a single service returns the last registration; resolving `IEnumerable<T>` returns all of them, in registration order. The `TryAdd…` methods skip a registration that already exists.',
    ],
    [
      {
        key: 'last-wins',
        code: `${DI}

var services = new ServiceCollection();
services.AddSingleton<INotifier, EmailNotifier>();
services.AddSingleton<INotifier, SmsNotifier>();
services.AddSingleton<INotifier, PushNotifier>();
using var provider = services.BuildServiceProvider();

Console.WriteLine(provider.GetRequiredService<INotifier>().Channel);
var all = provider.GetServices<INotifier>();
Console.WriteLine(string.Join(",", all.Select(n => n.Channel)));

interface INotifier
{
    string Channel { get; }
}

class EmailNotifier : INotifier
{
    public string Channel => "email";
}

class SmsNotifier : INotifier
{
    public string Channel => "sms";
}

class PushNotifier : INotifier
{
    public string Channel => "push";
}`,
        output: 'push\nemail,sms,push',
        why: 'Registering the same service type again does not replace the earlier registrations; it adds one. A single resolve picks the last one added, while `IEnumerable<INotifier>` (here via `GetServices`) gives every implementation in order. That is how you build a “notify on every channel” service: inject `IEnumerable<INotifier>` and loop, adding a channel by adding one registration.',
      },
      {
        key: 'try-add',
        code: `${DI}
using Microsoft.Extensions.DependencyInjection.Extensions;

var services = new ServiceCollection();
services.AddSingleton<INotifier, EmailNotifier>();
services.TryAddSingleton<INotifier, SmsNotifier>();
services.TryAddEnumerable(ServiceDescriptor.Singleton<INotifier, PushNotifier>());
services.TryAddEnumerable(ServiceDescriptor.Singleton<INotifier, EmailNotifier>());
using var provider = services.BuildServiceProvider();

Console.WriteLine(provider.GetRequiredService<INotifier>().Channel);
Console.WriteLine(string.Join(",", provider.GetServices<INotifier>().Select(n => n.Channel)));

interface INotifier
{
    string Channel { get; }
}

class EmailNotifier : INotifier
{
    public string Channel => "email";
}

class SmsNotifier : INotifier
{
    public string Channel => "sms";
}

class PushNotifier : INotifier
{
    public string Channel => "push";
}`,
        output: 'push\nemail,push',
        why: '`TryAddSingleton` adds nothing when any `INotifier` is already registered, so `SmsNotifier` is skipped. `TryAddEnumerable` skips only an identical service-and-implementation pair: `PushNotifier` is new, so it is added, while a second `EmailNotifier` is not. Libraries use these so they provide a default without overriding the app’s choice, and without registering the same handler twice.',
      },
    ],
  ),
  ...csCodeChoiceFamily(
    'cs-solid-open-closed',
    3,
    'Open/closed is about the changes you actually expect: make those additions possible without editing working code.',
    [
      {
        key: 'growing-switch',
        question:
          'A new shipping method is added every quarter, each with its own pricing rules, tests and owner, and every change edits this switch. Which design follows the open/closed principle?',
        code: `Console.WriteLine(Shipping.Cost("express", 2.0m));

static class Shipping
{
    public static decimal Cost(string method, decimal kg) => method switch
    {
        "standard" => 4.95m,
        "express" => 9.95m + kg,
        "pickup" => 0m,
        _ => throw new ArgumentException($"unknown method {method}"),
    };
}`,
        correct:
          'An `IShippingMethod` interface (name and cost) with one class per method, all registered in DI; the calculator picks from `IEnumerable<IShippingMethod>`',
        wrong: [
          'Keep the switch but replace the strings with an enum',
          'Rewrite the switch expression as an `if`/`else if` chain',
          'Move the switch into a base class and make `Cost` virtual',
        ],
        why: 'With a strategy per method, adding “same-day” means adding one class and one registration; the calculator and the existing methods are not edited, so they cannot be broken by the change and their tests keep passing. An enum, an `if` chain or a base class still need the central switch edited for every new method.',
      },
      {
        key: 'stable-switch',
        question:
          'A colleague proposes replacing this switch with one `IStatusLabel` class per status, registered in DI, “to follow open/closed”. The statuses are fixed by the order workflow and rarely change. What is the best response?',
        code: `Console.WriteLine(Label(OrderStatus.Shipped));

static string Label(OrderStatus status) => status switch
{
    OrderStatus.Pending => "Waiting for payment",
    OrderStatus.Paid => "Paid",
    OrderStatus.Shipped => "On its way",
    _ => throw new ArgumentOutOfRangeException(nameof(status)),
};

enum OrderStatus { Pending, Paid, Shipped }`,
        correct:
          'Keep the switch: the set is small and stable, the whole mapping reads in one place, and the classes would make no expected change easier',
        wrong: [
          'Accept it: open/closed means every switch should become a set of classes',
          'Accept it: switch expressions over enums are slower than virtual calls',
          'Replace the switch with a reflection lookup of a `[Label]` attribute on each enum value',
        ],
        why: 'Open/closed pays off where you expect frequent, independent extension (new shipping methods, new payment providers). For a closed, stable set, a switch expression is the clearest code: one place to read, and a compiler warning if a value is unhandled and there is no default arm. Applying a principle where no change is expected adds classes and indirection without benefit.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-di-captive-dependency',
    4,
    [
      'A singleton is created once and keeps the dependencies it was given. What scope does a scoped dependency of a singleton come from?',
    ],
    [
      {
        key: 'silent',
        code: `${DI}

var services = new ServiceCollection();
services.AddScoped<RequestContext>();
services.AddSingleton<AuditLog>();
using var provider = services.BuildServiceProvider();

foreach (var user in new[] { "ada", "linus" })
{
    using var scope = provider.CreateScope();
    scope.ServiceProvider.GetRequiredService<RequestContext>().User = user;
    var log = scope.ServiceProvider.GetRequiredService<AuditLog>();
    Console.WriteLine(log.Write("viewed order"));
}

class RequestContext
{
    public string User { get; set; } = "anonymous";
}

class AuditLog(RequestContext context)
{
    public string Write(string action) => $"{context.User}: {action}";
}`,
        output: 'anonymous: viewed order\nanonymous: viewed order',
        why: 'This is a captive dependency: the singleton `AuditLog` is built once, from the root provider, so it captures a `RequestContext` from the root scope, not the one belonging to the current request. Each request sets the user on its own context, which the log never sees. Without scope validation (off by default outside ASP.NET Core’s Development environment) nothing warns you. Fix it by making `AuditLog` scoped too, or by passing the user as a method argument.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-solid-liskov',
    4,
    [
      'Code written against the base type must keep working with every subtype. Watch for overrides that throw or demand more than the base did.',
    ],
    [
      {
        key: 'not-supported',
        code: `FileStore[] stores = [new FileStore(), new ReadOnlyFileStore()];
foreach (var store in stores)
{
    try
    {
        store.Save("report.txt", "Q3");
        Console.WriteLine($"{store.GetType().Name}: saved {store.Count}");
    }
    catch (Exception e)
    {
        Console.WriteLine($"{store.GetType().Name}: {e.GetType().Name}");
    }
}

class FileStore
{
    protected readonly Dictionary<string, string> Files = [];
    public int Count => Files.Count;
    public virtual void Save(string name, string content) => Files[name] = content;
}

class ReadOnlyFileStore : FileStore
{
    public override void Save(string name, string content) => throw new NotSupportedException();
}`,
        output: 'FileStore: saved 1\nReadOnlyFileStore: NotSupportedException',
        why: 'The loop is written against `FileStore`, whose contract says `Save` works, and the subclass breaks that promise at run time. That is a Liskov substitution violation: every caller now needs to know which subtype it has. “Is-a” in the real world (a read-only store is a store) does not make a good subtype; split the abstraction (`IFileReader` and `IFileWriter`) so read-only stores never claim they can save.',
      },
      {
        key: 'stronger-precondition',
        code: `Discount[] discounts = [new Discount(), new StudentDiscount()];
foreach (var discount in discounts)
{
    try
    {
        Console.WriteLine(discount.Apply(8m));
    }
    catch (Exception e)
    {
        Console.WriteLine(e.GetType().Name);
    }
}

class Discount
{
    public virtual decimal Apply(decimal amount)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(amount);
        return amount * 0.9m;
    }
}

class StudentDiscount : Discount
{
    public override decimal Apply(decimal amount)
    {
        if (amount < 10m)
            throw new ArgumentOutOfRangeException(nameof(amount), "students need a total of 10 or more");
        return amount * 0.8m;
    }
}`,
        output: '7.2\nArgumentOutOfRangeException',
        why: 'The base accepts any non-negative amount; the subclass demands at least 10, a stronger precondition. Code that was correct for `Discount` (applying it to 8) fails for `StudentDiscount`, even though both compile against the same signature. A subtype may accept more and promise more, never accept less or promise less. Model the minimum as a separate eligibility check the caller can see, instead of hiding it in an override.',
      },
    ],
  ),
  ...csCodeChoiceFamily(
    'cs-solid-interface-segregation',
    4,
    'If an implementer has to throw `NotImplementedException`, the interface asks for more than some clients need.',
    [
      {
        key: 'archive-store',
        question:
          'Archives are read-only, and most callers only read documents. What is the best fix for this design?',
        code: `IDocumentStore archive = new ArchiveStore();
Console.WriteLine(archive.Read("2019/report.pdf"));

interface IDocumentStore
{
    string Read(string path);
    void Write(string path, string content);
    void Delete(string path);
    long UsageInBytes();
}

class ArchiveStore : IDocumentStore
{
    public string Read(string path) => $"archived copy of {path}";
    public void Write(string path, string content) => throw new NotImplementedException();
    public void Delete(string path) => throw new NotImplementedException();
    public long UsageInBytes() => throw new NotImplementedException();
}`,
        correct:
          'Split it into role interfaces such as `IDocumentReader` and `IDocumentWriter`; `ArchiveStore` implements only the reader, and callers depend only on what they use',
        wrong: [
          'Make the unused methods do nothing and return `0` instead of throwing',
          'Add default interface implementations that throw, so `ArchiveStore` can leave them out',
          'Catch `NotImplementedException` in every caller that writes or deletes',
        ],
        why: 'A fat interface forces implementers to fake members they cannot support and forces callers to depend on members they never call. Smaller, client-focused interfaces make the capabilities explicit: a method that needs to delete asks for an `IDocumentWriter`, and the compiler then stops you passing an archive. Silent no-ops lie (a “deleted” file still exists), and default methods that throw only move the trap.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-di-scope-validation',
    5,
    [
      '`ValidateScopes` checks each resolve; `ValidateOnBuild` checks every registration when the provider is built, and reports all problems together.',
    ],
    [
      {
        key: 'validate-scopes',
        code: `${DI}

var services = new ServiceCollection();
services.AddScoped<RequestContext>();
services.AddSingleton<AuditLog>();
using var provider = services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true });
Console.WriteLine("built");

using var scope = provider.CreateScope();
try
{
    scope.ServiceProvider.GetRequiredService<AuditLog>();
    Console.WriteLine("resolved");
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}

class RequestContext { }
class AuditLog(RequestContext context)
{
    public RequestContext Context { get; } = context;
}`,
        output: 'built\nInvalidOperationException',
        why: 'With only `ValidateScopes`, building succeeds; the check happens when the singleton is first resolved. The container sees a singleton that would capture a scoped `RequestContext` and throws `InvalidOperationException` instead of silently handing out a stale context. ASP.NET Core turns this on in the Development environment, which is why a captive dependency often shows up only on a developer’s machine.',
      },
      {
        key: 'validate-on-build',
        code: `${DI}

var services = new ServiceCollection();
services.AddScoped<RequestContext>();
services.AddSingleton<AuditLog>();
try
{
    using var provider = services.BuildServiceProvider(
        new ServiceProviderOptions { ValidateScopes = true, ValidateOnBuild = true });
    Console.WriteLine("built");
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
    Console.WriteLine(e.InnerException?.GetType().Name);
}

class RequestContext { }
class AuditLog(RequestContext context)
{
    public RequestContext Context { get; } = context;
}`,
        output: 'AggregateException\nInvalidOperationException',
        why: '`ValidateOnBuild` walks every registration while building the provider, so the captive dependency fails at startup, before any request. Because there may be several broken registrations, they are collected into an `AggregateException` whose inner exceptions are the individual `InvalidOperationException`s. Catching only `InvalidOperationException` around `Build` would miss it; failing fast at startup is the point.',
      },
    ],
  ),
  ...csCodeChoiceFamily(
    'cs-solid-over-engineering',
    5,
    'An abstraction earns its place when there is a real second implementation, or something nondeterministic or slow to isolate.',
    [
      {
        key: 'wrapper-interface',
        question:
          'A reviewer asks whether `IDecimalRounder` earns its place. What is the best judgment?',
        code: `var formatter = new PriceFormatter(new DecimalRounder());
Console.WriteLine(formatter.Format(12.345m));

interface IDecimalRounder
{
    decimal Round(decimal value, int digits);
}

class DecimalRounder : IDecimalRounder
{
    public decimal Round(decimal value, int digits) => Math.Round(value, digits);
}

class PriceFormatter(IDecimalRounder rounder)
{
    public string Format(decimal price) => $"EUR {rounder.Round(price, 2)}";
}`,
        correct:
          'It does not: rounding is pure, fast and deterministic with no plausible second implementation; call `Math.Round` directly and test `PriceFormatter` with real values',
        wrong: [
          'It does: every class should depend only on interfaces so that it can be registered in DI',
          'It does: dependency inversion requires an abstraction for every call into the framework',
          'It does: without it, tests of `PriceFormatter` cannot control the result of rounding',
        ],
        why: 'Interfaces are seams for things you need to vary or isolate: I/O, time, randomness, external services. Wrapping a pure function adds a type, a registration and indirection, and tests that mock it only prove that the formatter calls the mock. A test with real rounding checks the actual behavior (including that `Math.Round` defaults to banker’s rounding, so 12.345 becomes 12.34). DI can inject concrete classes too; add the interface when a second implementation actually appears.',
      },
      {
        key: 'which-seam',
        question:
          '`OrderService` takes a `TimeProvider` and an `ITaxCalculator` (one implementation, pure arithmetic). Its tests mock both. Which abstraction is worth keeping?',
        code: `var service = new OrderService(TimeProvider.System, new TaxCalculator());
Console.WriteLine(service.Summary(100m).Length > 0);

interface ITaxCalculator
{
    decimal Tax(decimal net);
}

class TaxCalculator : ITaxCalculator
{
    public decimal Tax(decimal net) => Math.Round(net * 0.21m, 2);
}

class OrderService(TimeProvider clock, ITaxCalculator tax)
{
    public string Summary(decimal net) =>
        $"{clock.GetUtcNow():yyyy-MM-dd}: {net + tax.Tax(net)}";
}`,
        correct:
          'Keep the `TimeProvider` seam (time is nondeterministic) and use the real `TaxCalculator`, so tests check the actual tax',
        wrong: [
          'Keep `ITaxCalculator` and use the real clock: tax rules matter more than dates',
          'Keep both: mocking every dependency is what makes a test a unit test',
          'Remove both and call `DateTime.UtcNow` and the tax arithmetic inline',
        ],
        why: 'The clock is an external, changing input; without a seam the summary cannot be tested for a known date. The tax calculator is pure and fast, so mocking it adds nothing: the test would assert that the service adds whatever the mock returns, and a wrong tax rate would pass. A “unit” is a unit of behavior, not necessarily one class; mock what is slow, nondeterministic or external, and use real collaborators otherwise. Introduce `ITaxCalculator` later if tax rules really start to vary by country.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Refactoring and readable code

export const refactoringFamilies: readonly QuestionSource[] = [
  ...csCodeChoiceFamily(
    'cs-refactor-code-smells',
    1,
    'A code smell is a surface sign that the code will be hard to read or change. Name it, then pick the refactoring that removes it.',
    [
      {
        key: 'magic-numbers',
        question: 'What is the main readability problem here, and the usual fix?',
        code: `Console.WriteLine(LateFee(120m, 20));

static decimal LateFee(decimal amount, int daysLate)
{
    if (daysLate > 14) return amount * 0.15m;
    return amount * 0.05m + 2.5m;
}`,
        correct:
          'Magic numbers: 14, 0.15, 0.05 and 2.5 are business rules without names; replace them with named constants such as `GracePeriodDays`',
        wrong: [
          'The method is too long and should be split into several methods',
          'Money should be calculated with `double`, not `decimal`',
          'The `if` must be rewritten as a switch expression',
        ],
        why: 'A reader cannot tell what 14 or 2.5 mean, or whether the two 14s in different files are the same rule. Named constants (`const int GracePeriodDays = 14;`, `const decimal AdministrationFee = 2.5m;`) document the intent and give one place to change a rule. The method is short and `decimal` is the right type for money; a switch would not fix the naming.',
      },
      {
        key: 'deep-nesting',
        question: 'What is the main readability problem here, and the usual fix?',
        code: `Console.WriteLine(CanShip(new Order(true, true, "NL")));

static string CanShip(Order? order)
{
    if (order != null)
    {
        if (order.IsPaid)
        {
            if (order.InStock)
            {
                if (order.Country != "")
                    return "ship";
                else
                    return "missing country";
            }
            else
                return "out of stock";
        }
        else
            return "unpaid";
    }
    else
        return "no order";
}

record Order(bool IsPaid, bool InStock, string Country);`,
        correct:
          'Deep nesting: each `else` sits far from its `if`; use guard clauses that return early for each failure, leaving the happy path at the end',
        wrong: [
          'Too many `return` statements: a method should have a single exit point',
          'Primitive obsession: `Country` should be an enum',
          'Magic strings: the messages must move to a resource file first',
        ],
        why: 'Arrow-shaped code makes the reader keep every condition in mind to find which `else` belongs where. Inverting each check into a guard (`if (order is null) return "no order";`, then `if (!order.IsPaid) return "unpaid";`, …) gives a flat list of rules followed by the happy path. “Single exit point” is an old rule from languages without automatic cleanup; in C# early returns are usually clearer.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-refactor-guard-clause-order',
    2,
    ['Guard clauses run top to bottom; the first one whose condition holds decides the result.'],
    [
      {
        key: 'flattened',
        code: `Console.WriteLine(CanShip(null));
Console.WriteLine(CanShip(new Order(false, false, "")));
Console.WriteLine(CanShip(new Order(true, false, "NL")));
Console.WriteLine(CanShip(new Order(true, true, "")));

static string CanShip(Order? order)
{
    if (order is null) return "no order";
    if (!order.IsPaid) return "unpaid";
    if (!order.InStock) return "out of stock";
    if (order.Country == "") return "missing country";
    return "ship";
}

record Order(bool IsPaid, bool InStock, string Country);`,
        output: 'no order\nunpaid\nout of stock\nmissing country',
        why: 'The second order fails three checks, but the first matching guard (`unpaid`) wins. This flat version gives the same answers as the nested `if`/`else` original because the guards are in the same order as the nesting: the order of guards is the priority of the rules.',
      },
      {
        key: 'reordered',
        code: `Console.WriteLine(CanShip(new Order(false, false, "")));
Console.WriteLine(CanShip(new Order(false, true, "NL")));
Console.WriteLine(CanShip(new Order(true, false, "")));

static string CanShip(Order? order)
{
    if (order is null) return "no order";
    if (order.Country == "") return "missing country";
    if (!order.InStock) return "out of stock";
    if (!order.IsPaid) return "unpaid";
    return "ship";
}

record Order(bool IsPaid, bool InStock, string Country);`,
        output: 'missing country\nunpaid\nmissing country',
        why: 'Someone “tidied” the guards by moving the country check up. For orders that fail several checks, the message changes: an unpaid, out-of-stock order without a country now says “missing country” instead of “unpaid”. Reordering guard clauses is a behavior change whenever conditions can overlap; it needs a test, not just a glance.',
      },
    ],
  ),
  ...csCodeChoiceFamily(
    'cs-refactor-naming',
    2,
    'A good name says what something means in the problem, not how it is computed or what type it has.',
    [
      {
        key: 'days-between',
        question: 'Which renaming makes this code clearest?',
        code: `var d = Calc(new DateOnly(2026, 3, 1), new DateOnly(2026, 3, 15));
Console.WriteLine(d);

static int Calc(DateOnly a, DateOnly b) => b.DayNumber - a.DayNumber;`,
        correct:
          '`var rentalDays = DaysBetween(pickUp, dropOff);` with `int DaysBetween(DateOnly start, DateOnly end)`',
        wrong: [
          '`var d1 = CalcDiff(date1, date2);` with `int CalcDiff(DateOnly d1, DateOnly d2)`',
          '`var intResult = SubtractDayNumberProperties(x, y);` with `int SubtractDayNumberProperties(DateOnly x, DateOnly y)`',
          '`var tmp = Helper(a, b);` with `int Helper(DateOnly a, DateOnly b)`',
        ],
        why: '`DaysBetween(start, end)` states what the method means and which argument goes first, and `rentalDays` tells the reader why the value exists. `CalcDiff` and `Helper` are vague, numbered names (`d1`, `date2`) hide the order, and a name that spells out the implementation (`SubtractDayNumberProperties`) goes stale when the implementation changes and repeats what the body already shows.',
      },
    ],
  ),
  ...csCodeChoiceFamily(
    'cs-refactor-comments',
    2,
    'The code already says what it does. A comment earns its place when it says why, something the code cannot.',
    [
      {
        key: 'why-not-what',
        question: 'Which comment is worth keeping?',
        code: `Console.WriteLine(ShippingCost(1.2m));

static decimal ShippingCost(decimal weightKg)
{
    // A: multiply the weight by 2 and round it up
    // B: the carrier bills per started half kilo (2026 contract), so round up first
    // C: declare a variable for the half kilos
    var halfKilos = Math.Ceiling(weightKg * 2);
    // D: return the price
    return halfKilos * 1.2m;
}`,
        correct: 'B: it explains the business reason for rounding up, which the code cannot show',
        wrong: [
          'A: it describes the calculation in words for readers who do not know C#',
          'C: every variable declaration should be explained',
          'D: it marks where the method ends',
        ],
        why: 'Comments A, C and D repeat the code, so they add reading time and go stale when the code changes (A already would if the multiplier became 4). Comment B records a fact from outside the code, the carrier contract, that stops someone from “simplifying” the rounding away. Better still, also name the constant (`PricePerHalfKilo`) so the code explains the what by itself.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-refactor-behaviour-preserving',
    3,
    [
      'A refactoring changes the structure, not the behavior: the before and after versions must print the same results for the same inputs.',
    ],
    [
      {
        key: 'named-constants',
        code: `foreach (var (kg, express) in new[] { (0.4m, false), (2.1m, true), (12m, false) })
    Console.WriteLine($"{Before(kg, express)} {After(kg, express)}");

static decimal Before(decimal kg, bool express)
{
    decimal p = 3.5m + Math.Ceiling(kg) * 1.25m;
    if (express) p = p * 1.5m;
    if (p > 15m) p = 15m;
    return p;
}

static decimal After(decimal kg, bool express)
{
    var price = Pricing.BasePrice + Math.Ceiling(kg) * Pricing.PricePerKg;
    if (express) price *= Pricing.ExpressFactor;
    return Math.Min(price, Pricing.MaxPrice);
}

static class Pricing
{
    public const decimal BasePrice = 3.5m;
    public const decimal PricePerKg = 1.25m;
    public const decimal ExpressFactor = 1.5m;
    public const decimal MaxPrice = 15m;
}`,
        output: '4.75 4.75\n10.875 10.875\n15 15',
        why: 'Replacing magic numbers with named constants, the cap with `Math.Min`, and `p = p * x` with `*=` changes nothing a caller can observe: 0.4 kg rounds up to 1 kg (3.5 + 1.25), 2.1 kg rounds up to 3 kg and express multiplies 7.25 by 1.5, and 12 kg (18.50) is capped at 15. Printing both versions side by side for chosen inputs is a cheap way to check a refactoring; tests do it permanently.',
      },
      {
        key: 'switch-expression',
        code: `int[] scores = [95, 80, 79, 50, 100];
Console.WriteLine(string.Join(" ", scores.Select(Before)));
Console.WriteLine(string.Join(" ", scores.Select(After)));

static string Before(int score)
{
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 60) return "C";
    return "F";
}

static string After(int score) => score switch
{
    >= 90 => "A",
    >= 80 => "B",
    >= 60 => "C",
    _ => "F",
};`,
        output: 'A B C F A\nA B C F A',
        why: 'An `if` chain of early returns maps directly to a switch expression whose arms are tested top to bottom, so 80 is still a B and 79 a C. The switch version is shorter and the compiler checks it: it would report an arm that can never match (for example `>= 90` placed after `>= 80`), a mistake an `if` chain lets through silently.',
      },
    ],
  ),
  ...csCompilesFamily(
    'cs-refactor-primitive-obsession',
    3,
    'Two parameters of the same type can be swapped without any complaint from the compiler. Two different types cannot.',
    [
      {
        key: 'strings-swapped',
        code: `var booking = Book("Room 12", "ada@example.com", 3);
Console.WriteLine(booking);

static string Book(string guestEmail, string roomCode, int nights) =>
    $"{roomCode} for {guestEmail}, {nights} nights";`,
        compiles: true,
        why: 'It compiles: both parameters are `string`, so passing the room code as the email is not an error, and the bug shows up later as “ada@example.com for Room 12”. That is primitive obsession: domain concepts (email address, room code) represented as raw primitives that the compiler cannot tell apart.',
      },
      {
        key: 'value-types-swapped',
        code: `var email = new EmailAddress("ada@example.com");
var room = new RoomCode("Room 12");
Console.WriteLine(Book(room, email, 3));

static string Book(EmailAddress guest, RoomCode room, int nights) =>
    $"{room.Value} for {guest.Value}, {nights} nights";

readonly record struct EmailAddress(string Value);
readonly record struct RoomCode(string Value);`,
        compiles: false,
        why: 'It does not compile: a `RoomCode` cannot be passed where an `EmailAddress` is expected. Small value types (here `readonly record struct`s) turn a silent mix-up into a compile error, and give validation one home (the constructor can reject an address without `@`). They cost little and pay off most at boundaries where many same-typed values travel together.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-refactor-pure-functions',
    3,
    [
      'A pure function’s result depends only on its arguments, and it changes nothing outside itself. Look for hidden state and mutated inputs.',
    ],
    [
      {
        key: 'mutated-input',
        code: `var prices = new List<decimal> { 30m, 10m, 20m };
var cheapest = CheapestTwo(prices);
Console.WriteLine(string.Join(",", cheapest));
Console.WriteLine(string.Join(",", prices));

static List<decimal> CheapestTwo(List<decimal> items)
{
    items.Sort();
    return items.GetRange(0, 2);
}`,
        output: '10,20\n10,20,30',
        why: '`List<T>.Sort` sorts in place, so asking for the two cheapest prices also reorders the caller’s list, a side effect nobody expects from a query-like method. A pure version, `items.Order().Take(2).ToList()`, leaves the input alone; accepting `IReadOnlyList<decimal>` would make the intent explicit and stop the mutation at compile time.',
      },
      {
        key: 'hidden-state',
        code: `var calculator = new PriceCalculator();
Console.WriteLine(calculator.Total(100m));
Console.WriteLine(calculator.Total(100m));

class PriceCalculator
{
    private decimal _discount = 0.1m;

    public decimal Total(decimal amount)
    {
        var total = amount * (1 - _discount);
        _discount = 0m;
        return total;
    }
}`,
        output: '90.0\n100',
        why: 'The same call with the same argument gives two different answers, because `Total` changes a field (the first-order discount is “used up”). Code like this is hard to test (results depend on which tests ran before) and to reason about. Make the discount an explicit input, such as `Total(amount, isFirstOrder)`, and keep the “first order” bookkeeping where orders are stored. (Note that `decimal` keeps scale: 100 × 0.9 prints as `90.0`.)',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-refactor-subtle-change',
    4,
    [
      'Each program prints the result of the original and of a “refactored” version. Check them for the same inputs: are they really equal?',
    ],
    [
      {
        key: 'integer-division',
        code: `int done = 3, total = 4;
Console.WriteLine(Before(done, total));
Console.WriteLine(After(done, total));

static decimal Before(int done, int total) => done * 100m / total;

static decimal After(int done, int total) => Percent(done, total);

static decimal Percent(int part, int whole) => part / whole * 100;`,
        output: '75\n0',
        why: 'The extracted `Percent` method looks equivalent but changed the types in the expression: in `Before`, `done * 100m` is `decimal`, so the division is decimal (300 / 4 = 75). In `Percent`, `part / whole` is integer division of two `int`s (3 / 4 = 0), converted to `decimal` only at the end. Extract Method must keep the evaluation order and types; a test with a non-whole ratio would have caught it.',
      },
      {
        key: 'tier-table-order',
        code: `decimal[] totals = [50m, 500m, 5000m];
foreach (var t in totals)
    Console.WriteLine($"{Before(t)} {After(t)}");

static decimal Before(decimal total)
{
    if (total >= 1000m) return 0.10m;
    if (total >= 100m) return 0.05m;
    return 0m;
}

static decimal After(decimal total) =>
    Discounts.Tiers.FirstOrDefault(t => total >= t.Min).Rate;

static class Discounts
{
    public static readonly (decimal Min, decimal Rate)[] Tiers = [(100m, 0.05m), (1000m, 0.10m)];
}`,
        output: '0 0\n0.05 0.05\n0.10 0.05',
        why: 'Turning the `if` chain into a data table is a fine refactoring, but the table lists tiers from low to high and `FirstOrDefault` takes the first match, so 5000 matches the 100 tier first and gets 5% instead of 10%. For 50, no tier matches and the default tuple gives a rate of `0`, which happens to be right. The original checked the highest tier first; the table must be ordered (or searched) the same way.',
      },
    ],
  ),
  ...csConceptFamily(
    'cs-refactor-safe-order',
    4,
    'Refactor in small steps behind a safety net, and never mix structure changes with behavior changes.',
    [
      {
        key: 'legacy-method',
        question:
          'You must change a 300-line `CalculateInvoice` method that has no tests and whose exact rules nobody remembers. Which order of work is safest?',
        correct:
          'Write characterization tests that pin its current outputs for representative inputs, refactor in small steps running them after each step, then make the behavior change as a separate commit',
        wrong: [
          'Rewrite it from scratch from the specification, then compare a few invoices by hand',
          'Refactor it and fix the bugs you notice along the way, then add tests for the cleaned-up version',
          'Make the behavior change first, since it is what was asked for, and refactor in a later sprint',
        ],
        why: 'Without tests you cannot tell whether a refactoring changed behavior. Characterization tests record what the code does now (not what it should do), giving a safety net. Small steps, each verified and committed, make any mistake easy to find and revert. Mixing bug fixes or new behavior into the refactoring means a changed output could be intended or accidental, and nobody can tell which.',
      },
      {
        key: 'odd-current-behaviour',
        question:
          'While writing characterization tests for legacy pricing code, you find that a price of 2.5 is rounded to 2, where you expected 3 (it uses banker’s rounding). What should the test assert?',
        correct:
          'That it returns 2, the current behavior; raise the rounding as a possible bug and change it, with the business’s agreement, in a separate step',
        wrong: [
          'That it returns 3, since that is clearly the correct answer',
          'Nothing for this input: leave out cases whose results look wrong',
          'That it returns either 2 or 3, so the test survives whichever choice is made later',
        ],
        why: 'A characterization test documents the system as it is, so refactoring can prove it changed nothing. Asserting 3 would make the safety net red before you have touched anything, and leaving the case out hides exactly the behavior most likely to be changed by accident. Whether 2 is a bug is a business question: customers or reports may rely on it. Decide it explicitly, then change the test and the code together in their own commit.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-refactor-side-effect-change',
    5,
    [
      '`&&` skips its right operand when the left one is false, and `Single` insists on exactly one match. Pulling a call out of a condition, or swapping a loop for LINQ, can change what runs.',
    ],
    [
      {
        key: 'short-circuit',
        code: `var db = new List<string>();
string[] names = ["ada", "", "linus"];
Console.WriteLine(Before(names, db) + " [" + string.Join(",", db) + "]");
db.Clear();
Console.WriteLine(After(names, db) + " [" + string.Join(",", db) + "]");

static int Before(string[] names, List<string> db)
{
    int count = 0;
    foreach (var name in names)
        if (name != "" && Save(name, db)) count++;
    return count;
}

static int After(string[] names, List<string> db)
{
    int count = 0;
    foreach (var name in names)
    {
        bool saved = Save(name, db);
        bool valid = name != "";
        if (valid && saved) count++;
    }
    return count;
}

static bool Save(string name, List<string> db)
{
    db.Add(name);
    return true;
}`,
        output: '2 [ada,linus]\n2 [ada,,linus]',
        why: '“Extract variable” moved `Save` out of the `&&`. In `Before`, `&&` short-circuits: for the empty name `Save` is never called. In `After`, `Save` runs for every name before validation, so an empty name is stored. The returned count is still 2, so a test that only checks the count passes. Extracting a call with side effects out of a short-circuiting condition is not behavior-preserving.',
      },
      {
        key: 'single-vs-loop',
        code: `var users = new List<(int Id, string Name)> { (1, "ada"), (2, "linus"), (1, "ada (duplicate)") };
Console.WriteLine(Before(users, 2) + " " + After(users, 2));
try
{
    Console.WriteLine(Before(users, 1) + " " + After(users, 1));
}
catch (Exception e)
{
    Console.WriteLine(Before(users, 1) + " " + e.GetType().Name);
}

static string Before(List<(int Id, string Name)> users, int id)
{
    foreach (var user in users)
        if (user.Id == id) return user.Name;
    return "?";
}

static string After(List<(int Id, string Name)> users, int id) =>
    users.Single(u => u.Id == id).Name;`,
        output: 'linus linus\nada InvalidOperationException',
        why: 'The loop returns the first match; `Single` throws `InvalidOperationException` when more than one element matches (and when none does, where the loop returned “?”). For clean data they agree, so the change slips through tests that only use unique ids. A faithful translation keeps the first-match semantics (`FirstOrDefault`); switching to `Single` may be a good idea, but it is a behavior change to make deliberately.',
      },
    ],
  ),
  ...csCodeChoiceFamily(
    'cs-refactor-design-smells',
    5,
    'Ask whose data the code uses, and how many places hold the same rule.',
    [
      {
        key: 'feature-envy',
        question: 'Which smell is this, and what is the best refactoring?',
        code: `var customer = new Customer("Ada", 3, true);
Console.WriteLine(new InvoicePrinter().DiscountLine(customer));

record Customer(string Name, int YearsActive, bool IsPremium);

class InvoicePrinter
{
    public string DiscountLine(Customer c)
    {
        decimal rate = c.IsPremium ? 0.10m : 0m;
        if (c.YearsActive >= 3) rate += 0.05m;
        return $"{c.Name}: {rate * 100}% off";
    }
}`,
        correct:
          'Feature envy: the discount rule uses only `Customer` data, so move it to `Customer` (a `DiscountRate` property) and let the printer only print',
        wrong: [
          'Long parameter list: introduce a parameter object for `DiscountLine`',
          'Primitive obsession: replace `bool IsPremium` with a `string` tier name',
          'Shotgun surgery: split `InvoicePrinter` into one class per line of the invoice',
        ],
        why: 'A method that reaches into another object’s data more than its own is envious of that class. The discount rule is a customer rule; in the printer it will be duplicated the first time the web shop or an email needs the same rate. Moving it to `Customer` puts the rule next to its data, makes it testable without a printer, and leaves the printer with one job: formatting.',
      },
      {
        key: 'drifted-duplicates',
        question:
          'A customer complains that a quote and the checkout differ by one cent for the same items. What is the root cause, and the best fix?',
        code: `Console.WriteLine(Checkout.Gross(0.50m));
Console.WriteLine(Quote.Gross(0.50m));

static class Checkout
{
    public static decimal Gross(decimal net) => Math.Round(net * 1.21m, 2);
}

static class Quote
{
    public static decimal Gross(decimal net) => Math.Round(net * 1.21m, 2, MidpointRounding.AwayFromZero);
}`,
        correct:
          'Duplicated logic: the VAT rule exists twice and the copies drifted apart (different rounding); extract one `Vat.Gross` used by both, with tests for midpoint cases',
        wrong: [
          'Magic numbers: replace `1.21m` with a constant in each class, and the totals will match',
          'Floating-point error: switch both calculations to `double`',
          'Make `Checkout.Gross` call `Quote.Gross` only when the amount ends in 5',
        ],
        why: '0.50 × 1.21 = 0.605: `Checkout` rounds half to even (0.60), `Quote` rounds away from zero (0.61). The real problem is that one business rule lives in two places, so a fix to one copy did not reach the other. Naming the constant in each class still leaves two rules; `double` adds real floating-point error. One shared function, tested at the midpoint, removes the drift for good.',
      },
    ],
  ),
];
