import type { QuestionSource } from '@pracstack/content-model';
import {
  csCodeChoiceFamily,
  csCompilesFamily,
  csConceptFamily,
  csOutputFamily,
  csWhichCompileFamily,
} from './builders';

/*
 * C# async/await, methods and generics, delegates/lambdas/events. Every snippet
 * is compiled and run by the real C# runner. Async programs only print orders
 * that the language and the Task APIs guarantee: they never rely on which of two
 * concurrent operations happens to finish first.
 */

// ---------------------------------------------------------------- async and await

export const asyncFamilies: readonly QuestionSource[] = [
  ...csOutputFamily(
    'cs-async-task-basics',
    1,
    [
      'A `Task<T>` represents one operation that eventually produces a `T`. `await` waits for it and unwraps the value.',
    ],
    [
      {
        key: 'await-result',
        code: `Task<int> pending = AddAsync(2, 3);
int total = await pending;
Console.WriteLine(total);
Console.WriteLine(pending.IsCompletedSuccessfully);

static async Task<int> AddAsync(int a, int b)
{
    await Task.Delay(10);
    return a + b;
}`,
        output: '5\nTrue',
        why: '`AddAsync` returns a `Task<int>`; `await pending` waits for it and gives the `int` inside. Once the await has finished, the task has completed successfully. Inside an `async Task<int>` method you `return` the plain `int`, and the compiler wraps it in the task.',
      },
      {
        key: 'await-twice',
        code: `int calls = 0;
Task<int> price = LoadPriceAsync();
Console.WriteLine(await price + await price);
Console.WriteLine(calls);

async Task<int> LoadPriceAsync()
{
    calls++;
    await Task.Delay(10);
    return 10;
}`,
        output: '20\n1',
        why: 'Calling `LoadPriceAsync()` starts the work once and returns a task. Awaiting that task does not run the method again: the second `await` sees an already completed task and simply reads the stored result. So the method ran once (`calls` is 1) and both awaits give `10`.',
      },
    ],
  ),
  ...csCompilesFamily(
    'cs-async-return-type-compile',
    2,
    'An `async Task` method returns no value; an `async Task<T>` method returns a `T`. `await` is only allowed inside an `async` method (or top-level code).',
    [
      {
        key: 'value-from-task',
        code: `Console.WriteLine(await CountAsync());

static async Task CountAsync()
{
    await Task.Delay(1);
    return 3;
}`,
        compiles: false,
        why: 'An `async Task` method is the async version of a `void` method, so `return 3;` is an error (CS1997), and there is no value to print either. To produce a value, declare it as `async Task<int>`.',
      },
      {
        key: 'await-in-sync-method',
        code: `Console.WriteLine(Load());

static string Load()
{
    var text = await Task.FromResult("data");
    return text;
}`,
        compiles: false,
        why: '`await` can only be used in a method marked `async` (CS4032/CS4033). Making `Load` async also changes its return type to `Task<string>`, and its callers then await it in turn: async tends to spread up the call chain.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-async-execution-order',
    2,
    [
      'An async method runs synchronously, on the caller’s thread, until it reaches an `await` on a task that has not completed yet. Only then does it return to the caller.',
    ],
    [
      {
        key: 'completed-task',
        code: `Console.WriteLine("start");
Task work = LogAsync();
Console.WriteLine("after call");
await work;
Console.WriteLine("end");

static async Task LogAsync()
{
    Console.WriteLine("in method");
    await Task.CompletedTask;
    Console.WriteLine("after await");
}`,
        output: 'start\nin method\nafter await\nafter call\nend',
        why: 'Awaiting a task that has already completed does not suspend anything: the method just keeps running. So `LogAsync` runs to the end before it returns to the caller, and `"after await"` comes before `"after call"`. `async` by itself does not make code run in the background.',
      },
      {
        key: 'pending-task',
        code: `var gate = new TaskCompletionSource();
Console.WriteLine("start");
Task work = WaitForGateAsync(gate.Task);
Console.WriteLine("caller continues");
gate.SetResult();
await work;
Console.WriteLine("end");

static async Task WaitForGateAsync(Task gate)
{
    Console.WriteLine("before await");
    await gate;
    Console.WriteLine("after await");
}`,
        output: 'start\nbefore await\ncaller continues\nafter await\nend',
        why: 'The method prints `"before await"` synchronously, then reaches `await gate` on a task that is not complete, so it returns an incomplete task to the caller, which prints `"caller continues"`. Only after `gate.SetResult()` can the rest of the method run, and `await work` waits for it before `"end"`.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-async-combinators',
    3,
    [
      '`Task.WhenAll` finishes when every task has finished; `Task.WhenAny` finishes as soon as one of them has, and returns that task.',
    ],
    [
      {
        key: 'whenall-order',
        code: `int[] results = await Task.WhenAll(
    DelayedAsync(30, 1),
    DelayedAsync(1, 2),
    DelayedAsync(15, 3));
Console.WriteLine(string.Join(",", results));

static async Task<int> DelayedAsync(int ms, int value)
{
    await Task.Delay(ms);
    return value;
}`,
        output: '1,2,3',
        why: 'The tasks run concurrently and finish in the order 2, 3, 1, but `WhenAll` returns the results in the order the tasks were passed in, not the order they completed. That is what lets you match each result to its request.',
      },
      {
        key: 'whenany-timeout',
        code: `Task<string> download = new TaskCompletionSource<string>().Task;
Task timeout = Task.Delay(20);

Task finished = await Task.WhenAny(download, timeout);
Console.WriteLine(finished == timeout ? "timed out" : "downloaded");
Console.WriteLine(download.IsCompleted);`,
        output: 'timed out\nFalse',
        why: '`download` never completes, so after 20 ms the delay task is the first to finish and `WhenAny` returns it. `WhenAny` does not cancel or stop the other tasks: `download` is still incomplete afterwards. To really stop the losing work, pass a `CancellationToken` and cancel it.',
      },
    ],
  ),
  ...csCodeChoiceFamily(
    'cs-async-pitfalls',
    3,
    'Ask what the caller can observe: is there a task to await, and does each `await` wait before the next call starts?',
    [
      {
        key: 'async-void',
        question:
          'If `SaveAsync` throws after its `await` (for example when `name` is empty), what happens?',
        code: `var store = new Store();
try
{
    store.SaveAsync("draft");
}
catch (Exception e)
{
    Console.WriteLine($"Save failed: {e.Message}");
}
Console.WriteLine("Saved");

class Store
{
    public async void SaveAsync(string name)
    {
        await Task.Yield();
        if (name.Length == 0) throw new ArgumentException("empty name");
    }
}`,
        correct:
          'The `try`/`catch` never sees it: the exception is rethrown on the captured SynchronizationContext, or on the thread pool when there is none, which normally crashes the process',
        wrong: [
          'The `catch` block prints `Save failed: empty name`',
          'The exception is stored in the returned task and silently ignored',
          'The compiler rejects `async void` methods that are not event handlers',
        ],
        why: 'An `async void` method returns nothing the caller can await, so the call returns at the first `await` and the `try` block is already left when the exception happens. With no task to store it in, the exception is raised directly on the SynchronizationContext (or the thread pool), where nothing catches it. The caller also prints `"Saved"` before the save has finished. Use `async Task` and await it; keep `async void` for event handlers, which have to return `void`.',
      },
      {
        key: 'sequential-awaits',
        question:
          '`GetPriceAsync` and `GetStockAsync` are independent and each take about a second in production. Which change lets them run at the same time?',
        code: `decimal price = await GetPriceAsync();
int stock = await GetStockAsync();
Console.WriteLine($"{price} {stock}");

static async Task<decimal> GetPriceAsync()
{
    await Task.Delay(20);
    return 9.5m;
}

static async Task<int> GetStockAsync()
{
    await Task.Delay(20);
    return 3;
}`,
        correct:
          'Start both first (`var priceTask = GetPriceAsync(); var stockTask = GetStockAsync();`), then await the two tasks',
        wrong: [
          'Add `.ConfigureAwait(false)` to both awaits',
          'Wrap each call as `await Task.Run(() => GetPriceAsync())`',
          'Replace each `await` with `.Result`',
        ],
        why: 'Each `await` waits for its task before the next line runs, so the second call does not even start until the first has finished: about two seconds in total. Calling both methods first starts both operations, and awaiting afterwards (or `await Task.WhenAll(priceTask, stockTask)`) takes about as long as the slower one. `Task.Run` plus an immediate `await` is still sequential, `ConfigureAwait` only affects where the code resumes, and `.Result` blocks a thread on top of being sequential.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-async-cancellation',
    4,
    [
      'Cancelling a `CancellationTokenSource` only sets a flag; code that receives the token decides when to stop, by throwing `OperationCanceledException`.',
    ],
    [
      {
        key: 'cancel-after',
        code: `using var cts = new CancellationTokenSource();
cts.CancelAfter(20);
try
{
    await Task.Delay(5000, cts.Token);
    Console.WriteLine("finished");
}
catch (OperationCanceledException e)
{
    Console.WriteLine(e.GetType().Name);
}
Console.WriteLine(cts.IsCancellationRequested);`,
        output: 'TaskCanceledException\nTrue',
        why: 'After 20 ms the token is cancelled, `Task.Delay` stops waiting and its task ends in the Canceled state. Awaiting a canceled task throws `TaskCanceledException`, which derives from `OperationCanceledException`, so the `catch` handles it. Catch `OperationCanceledException` rather than the more specific type, because other APIs throw the base class.',
      },
      {
        key: 'throw-if-requested',
        code: `using var cts = new CancellationTokenSource();
var processed = new List<int>();
try
{
    foreach (var id in new[] { 1, 2, 3, 4, 5 })
    {
        cts.Token.ThrowIfCancellationRequested();
        await Task.Yield();
        processed.Add(id);
        if (id == 2) cts.Cancel();
    }
}
catch (OperationCanceledException e)
{
    Console.WriteLine(e.GetType().Name);
}
Console.WriteLine(string.Join(",", processed));`,
        output: 'OperationCanceledException\n1,2',
        why: '`Cancel()` does not interrupt anything by itself; item 2 still finishes. The loop notices the request at its next check, `ThrowIfCancellationRequested()` before item 3, which throws `OperationCanceledException` (the base type, not `TaskCanceledException`). Cancellation is cooperative: code that never checks the token is never cancelled.',
      },
    ],
  ),
  ...csConceptFamily(
    'cs-async-concepts',
    4,
    'Think about which thread the code after an `await` needs, and what is allocated per call.',
    [
      {
        key: 'blocking-result',
        question:
          'A WPF button handler calls `LoadAsync().Result`, and `LoadAsync` contains `await httpClient.GetStringAsync(url)` without `ConfigureAwait(false)`. The window freezes forever. Why?',
        correct:
          'The UI thread is blocked waiting for the task, while the code after the `await` is queued to run on that same UI thread, so each waits for the other',
        wrong: [
          '`.Result` starts `LoadAsync` a second time, and the two calls wait for each other',
          '`HttpClient` cannot be used on a UI thread',
          'The task faults with an `AggregateException`, and WPF swallows it',
        ],
        why: 'A UI app (and classic ASP.NET) has a SynchronizationContext, and `await` captures it so the rest of the method resumes on the UI thread. `.Result` blocks exactly that thread, so the continuation can never run: a deadlock. Console apps and ASP.NET Core have no SynchronizationContext, so the continuation runs on the thread pool and this deadlock does not happen there, but `.Result`/`.Wait()` still block a thread-pool thread for the whole wait; under load that starves the pool and the app stalls. The fix is to be async all the way: `await LoadAsync()`.',
      },
      {
        key: 'configure-await',
        question: 'What does `await task.ConfigureAwait(false)` change?',
        correct:
          'The code after the `await` does not have to resume on the captured SynchronizationContext, so it may continue on a thread-pool thread',
        wrong: [
          'The awaited task is started on a background thread instead of the current one',
          'The `await` no longer waits for the task to finish',
          'Exceptions from the task are no longer rethrown at the `await`',
        ],
        why: '`ConfigureAwait(false)` only changes where the method continues: it tells `await` not to post the rest of the method back to the captured context (such as the UI thread). It does not change how or where the task itself runs, it still waits, and exceptions still propagate. Library code uses it to avoid needless thread switches and to be safe when a caller blocks; UI code that touches controls after the `await` must not use it.',
      },
      {
        key: 'value-task',
        question: 'When is returning `ValueTask<T>` instead of `Task<T>` worthwhile?',
        correct:
          'When the method usually completes synchronously, for example from a cache, so it can return the result without allocating a `Task`',
        wrong: [
          'For every async method, because `ValueTask<T>` is always faster',
          'When several callers need to await the same result',
          'When the caller needs to read `.Result` before the operation completes',
        ],
        why: '`ValueTask<T>` is a struct that can hold either a ready result or a task, so a method that often has the answer already avoids a `Task` allocation. It comes with rules: await it once, do not await it concurrently, and do not block on it before it completes. If several consumers need it, call `.AsTask()`. For most methods `Task<T>` remains the simpler default.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-async-exceptions',
    5,
    [
      '`await` on a faulted `WhenAll` task rethrows one exception; the task’s `Exception` property is an `AggregateException` holding all of them.',
    ],
    [
      {
        key: 'whenall-faults',
        code: `Task all = Task.WhenAll(FailAsync("disk", 30), FailAsync("network", 1));
int caught = 0;
try
{
    await all;
}
catch (InvalidOperationException)
{
    caught++;
}
Console.WriteLine(caught);
Console.WriteLine(all.Exception!.GetType().Name);
Console.WriteLine(string.Join(",", all.Exception.InnerExceptions.Select(e => e.Message).Order()));

static async Task FailAsync(string name, int ms)
{
    await Task.Delay(ms);
    throw new InvalidOperationException(name);
}`,
        output: '1\nAggregateException\ndisk,network',
        why: '`WhenAll` waits for both tasks and its task holds both failures in an `AggregateException`. But `await` rethrows only one of them, the first inner exception, so the `catch` runs once and the other failure is easy to miss. Inspect `all.Exception.InnerExceptions` (here sorted, since which failure is listed first is not something to rely on) to see every failure.',
      },
      {
        key: 'wait-vs-await',
        code: `Task failed = Task.FromException(new FormatException("bad input"));
try
{
    failed.Wait();
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}
try
{
    await failed;
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}
try
{
    failed.GetAwaiter().GetResult();
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}`,
        output: 'AggregateException\nFormatException\nFormatException',
        why: 'The task stores its exception inside an `AggregateException`. The old blocking APIs, `.Wait()` and `.Result`, throw that wrapper, so `catch (FormatException)` would miss it. `await` unwraps it and rethrows the original exception with its stack trace, and so does `GetAwaiter().GetResult()` (which still blocks). Code written for `await` therefore cannot switch to `.Wait()` without changing its `catch` blocks.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Methods and generics

export const genericsMethodsFamilies: readonly QuestionSource[] = [
  ...csOutputFamily(
    'cs-method-optional-named',
    1,
    [
      'Arguments without a name fill parameters from left to right; a named argument goes to that parameter, and skipped optional parameters use their default.',
    ],
    [
      {
        key: 'named-skip',
        code: `Console.WriteLine(Greet("Ada"));
Console.WriteLine(Greet("Ada", suffix: "!"));
Console.WriteLine(Greet(suffix: "?", name: "Lin", greeting: "Hi"));

static string Greet(string name, string greeting = "Hello", string suffix = ".") =>
    $"{greeting}, {name}{suffix}";`,
        output: 'Hello, Ada.\nHello, Ada!\nHi, Lin?',
        why: 'The first call uses both defaults. The second skips `greeting` by naming `suffix`, so `greeting` keeps `"Hello"`. With named arguments the order at the call site does not matter: the third call sets all three parameters by name.',
      },
      {
        key: 'positional-and-named',
        code: `Console.WriteLine(Area(3));
Console.WriteLine(Area(3, 4));
Console.WriteLine(Area(height: 2, width: 5));

static int Area(int width, int height = 1) => width * height;`,
        output: '3\n12\n10',
        why: '`Area(3)` leaves `height` at its default `1`. `Area(3, 4)` fills both positionally. In the last call the names, not the order, decide: `width` is 5 and `height` is 2. Named arguments written in a different order are not swapped.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-method-overloads',
    2,
    [
      'The compiler picks the overload whose parameter type is the best implicit conversion from the argument; a more specific type (such as `int` over `long` over `object`) wins.',
    ],
    [
      {
        key: 'literals',
        code: `Printer.Show(5);
Printer.Show(5L);
Printer.Show(5f);
Printer.Show('A');

static class Printer
{
    public static void Show(int x) => Console.WriteLine("int");
    public static void Show(long x) => Console.WriteLine("long");
    public static void Show(double x) => Console.WriteLine("double");
    public static void Show(object x) => Console.WriteLine("object");
}`,
        output: 'int\nlong\ndouble\nint',
        why: "`5` is an `int` and `5L` a `long`, so each matches exactly. There is no `float` overload; `float` converts implicitly to both `double` and `object`, and `double` is the better (more specific) conversion. A `char` converts implicitly to `int`, which beats `long` and `double`, so `'A'` picks the `int` overload rather than `object`.",
      },
      {
        key: 'decimal-and-nullable',
        code: `short small = 3;
int? maybe = 4;
Printer.Show(small);
Printer.Show(2.5m);
Printer.Show(maybe);

static class Printer
{
    public static void Show(int x) => Console.WriteLine("int");
    public static void Show(long x) => Console.WriteLine("long");
    public static void Show(double x) => Console.WriteLine("double");
    public static void Show(object x) => Console.WriteLine("object");
}`,
        output: 'int\nobject\nobject',
        why: 'A `short` widens to `int`, the best of the numeric overloads. But `decimal` has no implicit conversion to `double` (it would lose precision), and `int?` has none to `int` (it might be null), so for both the only applicable overload is `object`, through boxing. “It is a number, so it picks a numeric overload” is the trap.',
      },
    ],
  ),
  ...csCompilesFamily(
    'cs-method-ref-out-in',
    3,
    'An `out` parameter must be assigned on every path before the method returns; an `in` parameter is read-only inside the method.',
    [
      {
        key: 'out-not-assigned',
        code: `Console.WriteLine(TryFirst("", out var c));

static bool TryFirst(string s, out char first)
{
    if (s.Length == 0) return false;
    first = s[0];
    return true;
}`,
        compiles: false,
        why: 'On the early `return false` path, `first` is never assigned, which is an error for an `out` parameter (CS0177). The `Try...` pattern assigns a default first: `first = default;` before returning `false`.',
      },
      {
        key: 'in-modified',
        code: `var total = 10;
AddTax(in total);

static void AddTax(in int amount)
{
    amount += 2;
}`,
        compiles: false,
        why: 'An `in` parameter is passed by reference but read-only, so assigning to it is an error (CS8331). Use `ref` if the method should change the caller’s variable, or a plain parameter (a copy) if it only needs a local value.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-method-params',
    3,
    [
      'A `params` parameter collects separate arguments into an array, but an argument that already is the right array type is passed as the array itself.',
    ],
    [
      {
        key: 'array-vs-object',
        code: `object[] items = ["a", "b", "c"];
Console.WriteLine(Count(items));
Console.WriteLine(Count((object)items));
Console.WriteLine(Count());
Console.WriteLine(Count(1, "two", 3.0));

static int Count(params object[] values) => values.Length;`,
        output: '3\n1\n0\n3',
        why: '`items` is already an `object[]`, so it becomes `values` directly (3 elements). Cast to `object`, it is a single argument and gets wrapped in a new one-element array. With no arguments, `values` is an empty array, not `null`. Separate arguments are collected into an array of their count.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-generic-methods',
    2,
    [
      'The compiler infers a generic method’s type argument from the arguments. `default` for a type parameter is `null` for reference types and zero-like for value types.',
    ],
    [
      {
        key: 'inferred-max',
        code: `Console.WriteLine(Max(3, 7));
Console.WriteLine(Max("pear", "apple"));
Console.WriteLine(Max(2.5, -1.0));

static T Max<T>(T a, T b) where T : IComparable<T> => a.CompareTo(b) >= 0 ? a : b;`,
        output: '7\npear\n2.5',
        why: 'No type arguments are written: `T` is inferred as `int`, `string` and `double` from the arguments, and each call uses that type’s own `CompareTo`. For strings that is alphabetical order, so `"pear"` is greater than `"apple"`. The `IComparable<T>` constraint is what allows calling `CompareTo` on a `T`.',
      },
      {
        key: 'default-of-t',
        code: `Console.WriteLine(Fallback<int>());
Console.WriteLine(Fallback<bool>());
Console.WriteLine(Fallback<string>() is null);

static T? Fallback<T>() => default;`,
        output: '0\nFalse\nTrue',
        why: '`default` produces the default value of whatever `T` is: `0` for `int`, `false` for `bool`, and `null` for a reference type like `string`. Here the type cannot be inferred (there are no arguments), so it has to be written explicitly.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-generic-classes',
    4,
    [
      'Each set of type arguments creates a separate closed type, such as `List<int>` and `List<string>`, with its own static fields.',
    ],
    [
      {
        key: 'static-per-closed-type',
        code: `_ = new Tracker<int>();
_ = new Tracker<int>();
_ = new Tracker<string>();
Console.WriteLine(Tracker<int>.Created);
Console.WriteLine(Tracker<string>.Created);
Console.WriteLine(Tracker<double>.Created);

class Tracker<T>
{
    public static int Created { get; private set; }

    public Tracker() => Created++;
}`,
        output: '2\n1\n0',
        why: 'Static members belong to each closed generic type, not to the generic definition: `Tracker<int>` and `Tracker<string>` are different types with their own `Created` counter. `Tracker<double>` was never constructed, so its counter is still `0`. A generic class is not a shared singleton across its type arguments.',
      },
    ],
  ),
  ...csWhichCompileFamily(
    'cs-generic-constraints',
    4,
    'Check each type argument against the constraint: `struct` means a non-nullable value type, `class` a reference type, `new()` a public parameterless constructor.',
    [
      {
        key: 'struct-new-comparable',
        question: 'Which of these calls compile?',
        prelude: `static T Create<T>() where T : new() => new T();
static void Require<T>(T value) where T : struct { }
static void Rank<T>(T a, T b) where T : IComparable<T> { }`,
        options: [
          'Create<List<int>>();',
          'Create<string>();',
          'Require(42);',
          'Require<int?>(null);',
          'Rank(1.5, 2.5);',
          'Rank(new object(), new object());',
        ],
        correct: ['Create<List<int>>();', 'Require(42);', 'Rank(1.5, 2.5);'],
        why: '`List<int>` has a public parameterless constructor, `string` does not (CS0310). `int` satisfies `struct`, but `int?` does not: `Nullable<T>` is excluded from the `struct` constraint (CS0453). `double` implements `IComparable<double>`, while `object` implements no `IComparable<object>` (CS0311). Violating a constraint is always a compile error, never a run-time one.',
      },
      {
        key: 'class-notnull',
        question: 'Which of these calls compile?',
        prelude: `static void RefOnly<T>(T value) where T : class { }
static void NotNull<T>(T value) where T : notnull { }`,
        options: [
          'RefOnly("text");',
          'RefOnly(5);',
          'RefOnly<int[]>([1, 2]);',
          'NotNull(3);',
          'NotNull<string?>(null);',
        ],
        correct: [
          'RefOnly("text");',
          'RefOnly<int[]>([1, 2]);',
          'NotNull(3);',
          'NotNull<string?>(null);',
        ],
        why: '`class` requires a reference type: `string` and arrays (even `int[]`) qualify, `int` does not (CS0452). `notnull` accepts any non-nullable type, including `int`. `NotNull<string?>(null)` compiles: nullable annotations are only checked by the nullable analysis, so it produces a warning (CS8714), not an error.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-extension-methods',
    3,
    [
      'An extension method is a static method whose first parameter has `this`; `x.Method()` is just shorthand for `Class.Method(x)`.',
    ],
    [
      {
        key: 'null-receiver',
        code: `string? nickname = null;
Console.WriteLine(nickname.OrDefault("anonymous"));
Console.WriteLine("Ada".OrDefault("anonymous"));

static class StringExtensions
{
    public static string OrDefault(this string? value, string fallback) =>
        string.IsNullOrEmpty(value) ? fallback : value;
}`,
        output: 'anonymous\nAda',
        why: '`nickname.OrDefault(...)` compiles to `StringExtensions.OrDefault(nickname, ...)`, a normal static call with `null` as the first argument. Nothing is dereferenced, so there is no `NullReferenceException`; the method handles `null` itself. An instance method call on `null` would throw.',
      },
      {
        key: 'interface',
        code: `IReadOnlyList<int> scores = [3, 4];
int[] more = [1, 2, 2];
Console.WriteLine(scores.SumOfSquares());
Console.WriteLine(Stats.SumOfSquares(more));

static class Stats
{
    public static int SumOfSquares(this IEnumerable<int> values) => values.Sum(v => v * v);
}`,
        output: '25\n9',
        why: 'An extension on an interface works for every type that implements it: both the list and the array are `IEnumerable<int>`. It can also be called like the static method it is, `Stats.SumOfSquares(more)`. LINQ’s `Sum`, `Where` and friends are themselves extension methods on `IEnumerable<T>`.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-overload-generic-methods',
    5,
    [
      'A generic method competes with ordinary overloads: an exact match through `T` beats a conversion, and on a tie the non-generic method wins.',
    ],
    [
      {
        key: 'generic-vs-object',
        code: `Printer.Show(5);
Printer.Show("hi");
Printer.Show((object)3.5);

static class Printer
{
    public static void Show(object value) => Console.WriteLine("object");
    public static void Show<T>(T value) => Console.WriteLine($"generic {typeof(T).Name}");
}`,
        output: 'generic Int32\ngeneric String\nobject',
        why: 'For `5`, `T` is inferred as `int`, an exact match, while `Show(object)` needs a boxing conversion, so the generic method wins; the same holds for the string (an identity conversion beats a conversion to `object`). Only when the argument already is an `object` are both exact matches, and then the tie-breaker prefers the non-generic method. “An `object` overload catches everything first” is the misconception.',
      },
      {
        key: 'specific-vs-generic',
        code: `Printer.Show(5);
Printer.Show(5L);
Printer.Show<int>(5);

static class Printer
{
    public static void Show(int value) => Console.WriteLine("int");
    public static void Show<T>(T value) => Console.WriteLine($"generic {typeof(T).Name}");
}`,
        output: 'int\ngeneric Int64\ngeneric Int32',
        why: '`Show(5)` matches `Show(int)` and `Show<int>` equally well, and the tie goes to the non-generic method. A `long` does not convert implicitly to `int`, so only the generic method applies, with `T = long`. Writing `<int>` explicitly rules out the non-generic overload altogether.',
      },
    ],
  ),
  ...csCompilesFamily(
    'cs-extension-method-compile',
    5,
    'Classic extension methods must be declared in a non-nested, non-generic static class.',
    [
      {
        key: 'non-static-class',
        code: `Console.WriteLine("a b c".WordCount());

class TextExtensions
{
    public static int WordCount(this string text) => text.Split(' ').Length;
}`,
        compiles: false,
        why: 'The method is static, but the class is not, and extension methods must be defined in a static class (CS1106). Add `static` to the class.',
      },
      {
        key: 'generic-static-class',
        code: `Console.WriteLine("a b c".WordCount());

static class TextExtensions<T>
{
    public static int WordCount(this string text) => text.Split(' ').Length;
}`,
        compiles: false,
        why: 'The class is static but generic, and extension methods must live in a non-generic static class (CS1106), so `"a b c".WordCount()` cannot be found either. Make the method generic instead of the class: `static class TextExtensions { public static int Count<T>(this IEnumerable<T> xs) ... }`.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Delegates, lambdas and events

export const delegatesFamilies: readonly QuestionSource[] = [
  ...csOutputFamily(
    'cs-delegate-func-action',
    1,
    [
      '`Func<..., TResult>` returns its last type argument, `Action<...>` returns nothing, and `Predicate<T>` takes a `T` and returns `bool`.',
    ],
    [
      {
        key: 'func-and-action',
        code: `Func<int, int, int> add = (a, b) => a + b;
Action<string> log = message => Console.WriteLine($"[log] {message}");
log(add(2, 3).ToString());`,
        output: '[log] 5',
        why: '`Func<int, int, int>` takes two `int`s and returns an `int` (the last type argument is the result). `Action<string>` takes a `string` and returns nothing. Calling a delegate looks like calling a method.',
      },
      {
        key: 'predicate',
        code: `Predicate<int> isEven = n => n % 2 == 0;
var numbers = new List<int> { 1, 3, 4, 6, 8 };
Console.WriteLine(numbers.FindAll(isEven).Count);
Console.WriteLine(numbers.Find(isEven));
Console.WriteLine(isEven(7));`,
        output: '3\n4\nFalse',
        why: '`FindAll` returns every element the predicate accepts (4, 6 and 8), `Find` returns the first one (4), and calling the predicate directly on 7 gives `False`.',
      },
    ],
  ),
  ...csWhichCompileFamily(
    'cs-delegate-conversions',
    2,
    'A method group or lambda converts to a delegate type only when the parameter and return types fit; `var` needs a lambda or method whose type is fully known.',
    [
      {
        key: 'method-groups',
        question: 'Which of these method group conversions compile?',
        prelude: `static int Square(int x) => x * x;
static void Log(string message) => Console.WriteLine(message);
static bool IsBlank(string s) => s.Trim().Length == 0;`,
        options: [
          'Func<int, int> f = Square;',
          'Action<string> a = Log;',
          'Func<string> g = Log;',
          'Predicate<string> p = IsBlank;',
          'Predicate<int> q = Square;',
          'Func<string, bool> r = IsBlank;',
        ],
        correct: [
          'Func<int, int> f = Square;',
          'Action<string> a = Log;',
          'Predicate<string> p = IsBlank;',
          'Func<string, bool> r = IsBlank;',
        ],
        why: 'A method name without parentheses converts to any delegate type with a matching signature. `Log` takes a `string` and returns nothing, so it fits `Action<string>` but not `Func<string>` (no parameter, returns a string). `Square` returns `int`, not `bool`, so it is no `Predicate<int>`. `IsBlank` fits both `Predicate<string>` and `Func<string, bool>`: same shape, different delegate types.',
      },
      {
        key: 'natural-type',
        question: 'Which of these lambda declarations compile?',
        options: [
          'var twice = (int x) => x * 2;',
          'var inc = x => x + 1;',
          'Func<int, int> inc = x => x + 1;',
          'Action done = () => 42;',
          'var write = Console.WriteLine;',
        ],
        correct: ['var twice = (int x) => x * 2;', 'Func<int, int> inc = x => x + 1;'],
        why: 'With `var`, the lambda needs a “natural type”: `(int x) => x * 2` has one (`Func<int, int>`), but `x => x + 1` does not say what `x` is (CS8917), so give the variable a delegate type instead. `Action` returns nothing, and `42` is not a statement (CS0201). `Console.WriteLine` has many overloads, so `var` cannot pick one (CS8917).',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-lambda-closures',
    3,
    [
      'A lambda captures the variable itself, not a copy of its value at the time the lambda was created.',
    ],
    [
      {
        key: 'for-loop',
        code: `var actions = new List<Action>();
for (int i = 0; i < 3; i++)
{
    actions.Add(() => Console.Write(i));
}
foreach (var action in actions) action();
Console.WriteLine();`,
        output: '333',
        why: 'A `for` loop has one variable `i` for the whole loop. All three lambdas capture that same variable, and by the time they run the loop has finished with `i == 3`. Copying it into a variable declared inside the loop body (`int copy = i;`) gives each lambda its own.',
      },
      {
        key: 'foreach-loop',
        code: `var actions = new List<Action>();
foreach (var i in new[] { 0, 1, 2 })
{
    actions.Add(() => Console.Write(i));
}
foreach (var action in actions) action();
Console.WriteLine();`,
        output: '012',
        why: 'Unlike `for`, a `foreach` loop declares a fresh variable for each iteration (since C# 5), so every lambda captures a different `i`.',
      },
      {
        key: 'changed-after',
        code: `int rate = 1;
Func<int, int> price = amount => amount * rate;
rate = 5;
Console.WriteLine(price(10));`,
        output: '50',
        why: 'The lambda reads `rate` when it is called, not when it is created. `rate` was changed to 5 before the call, so the result is 50, not 10.',
      },
    ],
  ),
  ...csCompilesFamily(
    'cs-event-access-compile',
    3,
    'Outside the declaring class, an `event` only allows `+=` and `-=`; a plain delegate field allows anything.',
    [
      {
        key: 'external-invoke',
        code: `var button = new Button();
button.Clicked += (sender, e) => Console.WriteLine("clicked");
button.Clicked(button, EventArgs.Empty);

class Button
{
    public event EventHandler? Clicked;
}`,
        compiles: false,
        why: 'The `event` keyword restricts code outside `Button` to subscribing and unsubscribing. Raising it (or assigning it with `=`) from outside is an error (CS0070). Only the class itself raises its events, typically from a method such as `OnClicked()`.',
      },
      {
        key: 'plain-delegate-field',
        code: `var button = new Button();
button.Clicked += (sender, e) => Console.WriteLine("clicked");
button.Clicked(button, EventArgs.Empty);

class Button
{
    public EventHandler? Clicked;
}`,
        compiles: true,
        why: 'Without `event`, `Clicked` is an ordinary public field of a delegate type, so any code can invoke it, or even replace all subscribers with `button.Clicked = null`. That is exactly what the `event` keyword prevents. (It also gives a nullable warning, because the field may be `null`.)',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-multicast-delegates',
    4,
    [
      'Combining delegates with `+=` builds an invocation list that is called in order; `-=` removes the last matching entry.',
    ],
    [
      {
        key: 'last-return-value',
        code: `Func<int, int> steps = x =>
{
    Console.WriteLine($"double {x}");
    return x * 2;
};
steps += x =>
{
    Console.WriteLine($"square {x}");
    return x * x;
};
Console.WriteLine(steps(3));`,
        output: 'double 3\nsquare 3\n9',
        why: 'Both handlers run, in the order they were added, and each receives the original argument `3`; the results are not chained into a pipeline. The value of the whole call is the return value of the last handler, `9`; the `6` is discarded.',
      },
      {
        key: 'remove-last',
        code: `Action steps = Ping;
steps += Pong;
steps += Ping;
steps -= Ping;
steps();

static void Ping() => Console.WriteLine("ping");
static void Pong() => Console.WriteLine("pong");`,
        output: 'ping\npong',
        why: 'The list is Ping, Pong, Ping. `-=` removes only the last occurrence of `Ping`, not every one, leaving Ping, Pong.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-event-handler-pattern',
    4,
    [
      '`EventHandler<TEventArgs>` handlers receive the sender and the event data. `-=` must be given the same delegate that was added.',
    ],
    [
      {
        key: 'subscribe-unsubscribe',
        code: `var account = new Account();
account.BalanceChanged += (sender, e) => Console.WriteLine($"now {e.Balance}");
account.Deposit(50);

EventHandler<BalanceEventArgs> audit = (sender, e) => Console.WriteLine("audit");
account.BalanceChanged += audit;
account.Deposit(25);
account.BalanceChanged -= audit;
account.Deposit(5);

class BalanceEventArgs(decimal balance) : EventArgs
{
    public decimal Balance { get; } = balance;
}

class Account
{
    public decimal Balance { get; private set; }
    public event EventHandler<BalanceEventArgs>? BalanceChanged;

    public void Deposit(decimal amount)
    {
        Balance += amount;
        BalanceChanged?.Invoke(this, new BalanceEventArgs(Balance));
    }
}`,
        output: 'now 50\nnow 75\naudit\nnow 80',
        why: 'The first deposit has one subscriber. `audit` is added for the second deposit, so both run in subscription order. Removing it with the same delegate instance works, so the last deposit only prints the balance. `?.Invoke` means a deposit with no subscribers at all would not throw.',
      },
      {
        key: 'remove-new-lambda',
        code: `var sensor = new Sensor();
sensor.Reading += (sender, value) => Console.WriteLine($"logged {value}");
sensor.Reading -= (sender, value) => Console.WriteLine($"logged {value}");
sensor.Report(7);

class Sensor
{
    public event EventHandler<int>? Reading;

    public void Report(int value) => Reading?.Invoke(this, value);
}`,
        output: 'logged 7',
        why: 'The two lambdas look identical, but each lambda expression is its own method, so the delegate passed to `-=` does not match the one that was added and nothing is removed. To unsubscribe later, keep the handler in a variable or use a named method.',
      },
    ],
  ),
  ...csCompilesFamily(
    'cs-static-lambda-compile',
    5,
    'A `static` lambda promises not to capture anything from the enclosing scope.',
    [
      {
        key: 'captures-local',
        code: `int factor = 3;
Func<int, int> scale = static x => x * factor;
Console.WriteLine(scale(2));`,
        compiles: false,
        why: '`factor` is a local variable, so using it would capture it, which a `static` lambda forbids (CS8820). That is the point of `static`: it guarantees no closure object is allocated and no state is captured by accident. Pass the value as a parameter instead.',
      },
      {
        key: 'uses-const',
        code: `const int Factor = 3;
Func<int, int> scale = static x => x * Factor;
Console.WriteLine(scale(2));`,
        compiles: true,
        why: 'A constant is substituted by its value at compile time, so using it captures nothing and a `static` lambda may refer to it. Static members of types are allowed too.',
      },
    ],
  ),
  ...csConceptFamily(
    'cs-local-function-vs-lambda',
    5,
    'Compare what each can declare (type parameters) and when each can be called.',
    [
      {
        key: 'capabilities',
        question:
          'Which statement correctly compares a local function with a lambda stored in a `Func` variable?',
        correct:
          'A local function can be generic and can be called before the line that declares it; a lambda in a variable can do neither',
        wrong: [
          'A local function cannot use the local variables of the enclosing method; only a lambda can capture them',
          'A local function is converted to a new delegate on every call, so it always allocates more than a lambda',
          'A lambda can be recursive, but a local function cannot call itself',
        ],
        why: 'A local function is a real method declared inside another one: it can have type parameters, call itself, and be called anywhere in its scope. A lambda has no type parameters, and its variable must be assigned before use. Both can capture enclosing variables (unless marked `static`). A local function only becomes a delegate when you convert it to one; called directly it needs no delegate allocation, which makes it a good default for helpers inside a method.',
      },
    ],
  ),
];
