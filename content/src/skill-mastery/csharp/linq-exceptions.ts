import type { QuestionSource } from '@pracstack/content-model';
import { csCodeChoiceFamily, csCompilesFamily, csConceptFamily, csOutputFamily } from './builders';

/*
 * C# LINQ (queries, deferred execution and performance) and exceptions with
 * resource cleanup. Every snippet is compiled and run by the real C# runner.
 */

// ---------------------------------------------------------------- LINQ queries

export const linqBasicsFamilies: readonly QuestionSource[] = [
  ...csOutputFamily(
    'cs-linq-where-select',
    1,
    [
      '`Where` keeps the elements that pass the test, in their original order; `Select` transforms each element.',
    ],
    [
      {
        key: 'filter-then-project',
        code: `int[] prices = [12, 5, 30, 8, 21];
var doubled = prices.Where(p => p > 10).Select(p => p * 2);
Console.WriteLine(string.Join(", ", doubled));`,
        output: '24, 60, 42',
        why: '`Where` keeps 12, 30 and 21 in the order they appear (it does not sort), and `Select` doubles each one. A common mistake is to expect the result sorted, or to expect `Select` to run on the elements that were filtered out.',
      },
      {
        key: 'select-with-index',
        code: `string[] runners = ["Ines", "Tom", "Mia"];
foreach (var line in runners.Select((name, i) => $"{i + 1}. {name}"))
{
    Console.WriteLine(line);
}`,
        output: '1. Ines\n2. Tom\n3. Mia',
        why: 'The two-parameter overload of `Select` passes each element’s position as the second argument. The index starts at 0, which is why the code adds 1 to number the runners from 1.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-linq-any-all-count',
    2,
    [
      '`Any` asks “is there at least one?”, `All` asks “is there no counter-example?”, and `Count(predicate)` counts the matches.',
    ],
    [
      {
        key: 'empty-sequence',
        code: `List<int> scores = [];
Console.WriteLine(scores.Any());
Console.WriteLine(scores.All(s => s >= 50));
Console.WriteLine(scores.Count(s => s >= 50));`,
        output: 'False\nTrue\n0',
        why: 'An empty list has no elements, so `Any()` is `false`. `All` is `true` because there is no element that fails the test (it is “vacuously true”), even though no score is actually 50 or more. Assuming `All` on an empty sequence is `false` is a classic bug in validation code.',
      },
      {
        key: 'with-predicates',
        code: `string[] tags = ["urgent", "bug", "ui", "urgent-fix"];
Console.WriteLine(tags.Count(t => t.StartsWith("urgent")));
Console.WriteLine(tags.Any(t => t.Length > 8));
Console.WriteLine(tags.All(t => t.Length >= 2));`,
        output: '2\nTrue\nTrue',
        why: '`"urgent"` and `"urgent-fix"` start with `"urgent"`, so the count is 2. `"urgent-fix"` has 10 characters, so `Any` is `true`. The shortest tag, `"ui"`, has 2 characters, so every tag passes `Length >= 2` and `All` is `true`.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-linq-chunk-skip-take',
    2,
    [
      '`Skip` and `Take` never throw when you ask for more elements than exist. `Chunk` splits a sequence into arrays of a fixed size; the last one may be shorter.',
    ],
    [
      {
        key: 'distinct-chunks',
        code: `int[] readings = [4, 4, 7, 1, 7, 9, 2];
foreach (int[] batch in readings.Distinct().Chunk(2))
{
    Console.WriteLine($"[{string.Join(",", batch)}]");
}
Console.WriteLine(readings.Skip(5).Take(10).Count());`,
        output: '[4,7]\n[1,9]\n[2]\n2',
        why: '`Distinct` drops the repeated 4 and 7 and yields the rest in order of first appearance: 4, 7, 1, 9, 2. `Chunk(2)` groups them in pairs, and the last chunk holds the single leftover element. `Skip(5)` leaves two readings, and `Take(10)` simply returns both: asking for more than exists is not an error.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-linq-element-operators',
    3,
    [
      '`First` and `Single` throw when there is no suitable element. The `OrDefault` versions return a default instead, but `SingleOrDefault` still throws when there is more than one match.',
    ],
    [
      {
        key: 'first-on-empty',
        code: `int[] backlog = [];
Console.WriteLine(backlog.FirstOrDefault());
try
{
    Console.WriteLine(backlog.First());
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}`,
        output: '0\nInvalidOperationException',
        why: '`FirstOrDefault` on an empty `int[]` returns `default(int)`, which is `0`: you cannot tell “empty” from “the first item is 0”. `First` on an empty sequence throws `InvalidOperationException` (not `IndexOutOfRangeException` or `NullReferenceException`).',
      },
      {
        key: 'single-or-default-two-matches',
        code: `string[] users = ["ana", "ben", "bea"];
Console.WriteLine(users.SingleOrDefault(u => u.StartsWith('a')));
try
{
    Console.WriteLine(users.SingleOrDefault(u => u.StartsWith('b')) ?? "none");
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}`,
        output: 'ana\nInvalidOperationException',
        why: 'Exactly one user starts with `a`, so the first call returns `"ana"`. Two users start with `b`, and `SingleOrDefault` throws `InvalidOperationException` in that case: the “OrDefault” only covers *zero* matches. Use it when more than one match means corrupt data, and `FirstOrDefault` when any match will do.',
      },
      {
        key: 'reference-default',
        code: `Item[] stock = [new("A1", 0), new("B2", 4)];
var big = stock.FirstOrDefault(i => i.Qty > 10);
Console.WriteLine(big is null);
Console.WriteLine(stock.FirstOrDefault(i => i.Qty > 10, new Item("none", 0)).Sku);
Console.WriteLine(stock.Single(i => i.Qty > 0).Sku);

record Item(string Sku, int Qty);`,
        output: 'True\nnone\nB2',
        why: 'For a reference type the default is `null`, so the first lookup gives `null`. The overload with a default value returns that value instead. `Single` succeeds because exactly one item has a positive quantity.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-linq-ordering-grouping',
    4,
    [
      'Each `OrderBy` starts a brand-new sort; `ThenBy` adds a tie-breaker to the previous one. `GroupBy` yields groups in the order their keys first appear.',
    ],
    [
      {
        key: 'then-by',
        code: `Person[] people = [new("Zoe", 30), new("Adam", 25), new("Mia", 30), new("Bo", 25)];
foreach (var p in people.OrderByDescending(p => p.Age).ThenBy(p => p.Name))
{
    Console.WriteLine($"{p.Name} {p.Age}");
}

record Person(string Name, int Age);`,
        output: 'Mia 30\nZoe 30\nAdam 25\nBo 25',
        why: 'People are sorted by age, oldest first, and `ThenBy` orders people of the same age by name: Mia before Zoe, Adam before Bo. `ThenBy` only breaks ties; it never overrides the first key.',
      },
      {
        key: 'order-by-twice',
        code: `Person[] people = [new("Zoe", 30), new("Adam", 25), new("Mia", 30), new("Bo", 25)];
foreach (var p in people.OrderByDescending(p => p.Age).OrderBy(p => p.Name))
{
    Console.WriteLine($"{p.Name} {p.Age}");
}

record Person(string Name, int Age);`,
        output: 'Adam 25\nBo 25\nMia 30\nZoe 30',
        why: 'A second `OrderBy` does not add a tie-breaker: it re-sorts the whole sequence by name, and the age order is lost (it would only survive between people with the same name, because LINQ sorts are stable). To sort by age and then name, use `ThenBy`.',
      },
      {
        key: 'group-by',
        code: `string[] orders = ["music", "games", "books", "games", "books", "books"];
foreach (var g in orders.GroupBy(o => o))
{
    Console.WriteLine($"{g.Key}: {g.Count()}");
}
var ranked = orders
    .GroupBy(o => o)
    .OrderByDescending(g => g.Count())
    .ThenBy(g => g.Key)
    .Select(g => g.Key);
Console.WriteLine(string.Join(",", ranked));`,
        output: 'music: 1\ngames: 2\nbooks: 3\nbooks,games,music',
        why: '`GroupBy` does not sort: groups come out in the order each key is first seen (music, games, books). Each group is a sequence with a `Key`, so `Count()` gives its size. To rank categories you must sort the groups yourself, here by size and then by key.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-linq-empty-aggregates',
    4,
    [
      'On an empty sequence, `Sum` and `Count` return 0, but `Min`, `Max` and `Average` of a non-nullable type have no answer and throw.',
    ],
    [
      {
        key: 'sum-versus-max',
        code: `decimal[] refunds = [];
Console.WriteLine(refunds.Sum());
try
{
    Console.WriteLine(refunds.Max());
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}`,
        output: '0\nInvalidOperationException',
        why: 'The sum of no numbers is well defined: 0. The largest of no numbers is not, and `Max` on an empty sequence of a non-nullable type throws `InvalidOperationException` rather than returning 0, so “no refunds” is not silently reported as a refund of 0.',
      },
      {
        key: 'safe-alternatives',
        code: `int[] none = [];
int? best = none.Select(x => (int?)x).Max();
Console.WriteLine(best is null);
Console.WriteLine(none.DefaultIfEmpty(-1).Max());
Console.WriteLine(none.Aggregate(1, (product, x) => product * x));`,
        output: 'True\n-1\n1',
        why: 'For a sequence of `int?`, `Max` returns `null` when it is empty instead of throwing. `DefaultIfEmpty(-1)` turns an empty sequence into one containing `-1`. `Aggregate` with a seed returns the seed (here 1) when there is nothing to fold; only the overload without a seed throws on an empty sequence.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-linq-join-selectmany',
    5,
    [
      '`SelectMany` flattens one sequence per element into a single sequence. `Join` is an inner join; `GroupJoin` keeps every outer element with its (possibly empty) matches.',
    ],
    [
      {
        key: 'select-many',
        code: `Order[] orders = [new(1, ["pen", "ink"]), new(2, []), new(3, ["pad", "tape"])];
Console.WriteLine(orders.Select(o => o.Lines).Count());
Console.WriteLine(orders.SelectMany(o => o.Lines).Count());
Console.WriteLine(string.Join(",", orders.SelectMany(o => o.Lines, (o, line) => $"{o.Id}-{line}")));

record Order(int Id, string[] Lines);`,
        output: '3\n4\n1-pen,1-ink,3-pad,3-tape',
        why: '`Select` maps each order to its array, giving a sequence of 3 arrays (one per order, including the empty one). `SelectMany` flattens them into the 4 lines. The overload with a result selector still sees the parent order, so each line can be labeled with its order id; order 2 contributes nothing.',
      },
      {
        key: 'join-and-group-join',
        code: `Customer[] customers = [new(1, "Ada"), new(2, "Linus"), new(3, "Grace")];
Order[] orders = [new(1, 50m), new(3, 20m), new(1, 5m), new(9, 99m)];
var rows = customers.Join(orders, c => c.Id, o => o.CustomerId, (c, o) => $"{c.Name}:{o.Total}");
Console.WriteLine(string.Join(" ", rows));
var totals = customers.GroupJoin(orders, c => c.Id, o => o.CustomerId,
    (c, matches) => $"{c.Name}={matches.Sum(o => o.Total)}");
Console.WriteLine(string.Join(" ", totals));

record Customer(int Id, string Name);
record Order(int CustomerId, decimal Total);`,
        output: 'Ada:50 Ada:5 Grace:20\nAda=55 Linus=0 Grace=20',
        why: '`Join` is an inner join: Ada appears once per matching order (in the outer sequence’s order, then the inner one’s), Linus has no orders and disappears, and the order for customer 9 has no customer and disappears too. `GroupJoin` is the building block for a left join: every customer appears once with the collection of their orders, so Linus shows up with an empty collection whose sum is 0.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-linq-query-syntax',
    5,
    [
      'The compiler translates query syntax into method calls: `where` → `Where`, a second `from` → `SelectMany`, `orderby … descending` → `OrderByDescending`.',
    ],
    [
      {
        key: 'second-from',
        code: `int[] a = [1, 2, 3];
int[] b = [10, 20];
var query =
    from x in a
    where x != 2
    from y in b
    let sum = x + y
    orderby sum descending
    select sum;
var methods = a
    .Where(x => x != 2)
    .SelectMany(x => b, (x, y) => x + y)
    .OrderByDescending(sum => sum);
Console.WriteLine(string.Join(",", query));
Console.WriteLine(query.SequenceEqual(methods));`,
        output: '23,21,13,11\nTrue',
        why: 'The `where` runs before the second `from`, so only 1 and 3 are paired with 10 and 20, giving the sums 11, 21, 13 and 23, which `orderby … descending` sorts. The second `from` is translated to `SelectMany`, so the method chain produces the same sequence: query syntax is only a different way to write the same calls, not a different (or faster) engine.',
      },
      {
        key: 'group-into',
        code: `string[] words = ["fig", "kiwi", "plum", "pear", "date", "lime", "apple"];
var query =
    from w in words
    group w by w.Length into g
    where g.Count() > 1
    orderby g.Key
    select $"{g.Key}:{string.Join("/", g)}";
foreach (var line in query)
{
    Console.WriteLine(line);
}`,
        output: '4:kiwi/plum/pear/date/lime',
        why: '`group … by … into g` becomes `GroupBy`, and `into` continues the query over the groups. Only words of length 4 form a group with more than one member (`fig` and `apple` are alone), and inside a group the words keep their original order.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Deferred execution and performance

export const linqExecutionFamilies: readonly QuestionSource[] = [
  ...csOutputFamily(
    'cs-linq-deferred-source',
    1,
    [
      'A LINQ query is a recipe, not a result: it reads the source when you enumerate it, unless you materialize it with `ToList()` or `ToArray()`.',
    ],
    [
      {
        key: 'add-after-query',
        code: `var queue = new List<int> { 3, 8, 1 };
var large = queue.Where(n => n > 2);
queue.Add(9);
Console.WriteLine(string.Join(",", large));`,
        output: '3,8,9',
        why: 'Defining `large` runs nothing. `string.Join` enumerates it after `9` was added, so the filter sees the current list. Thinking of a query variable as a stored result is the root of many deferred-execution bugs.',
      },
      {
        key: 'to-list-snapshot',
        code: `var queue = new List<int> { 3, 8, 1 };
var large = queue.Where(n => n > 2).ToList();
queue.Add(9);
Console.WriteLine(string.Join(",", large));`,
        output: '3,8',
        why: '`ToList()` runs the query immediately and copies the results into a new list. Adding to `queue` afterwards does not change that copy.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-linq-captured-variable',
    2,
    ['A lambda captures the variable itself, not its value at the time the lambda was written.'],
    [
      {
        key: 'threshold-changed',
        code: `int minimum = 5;
int[] stock = [2, 6, 9, 4];
var reorder = stock.Where(s => s < minimum);
minimum = 3;
Console.WriteLine(string.Join(",", reorder));`,
        output: '2',
        why: 'The query runs when `string.Join` enumerates it, and at that moment `minimum` is 3, so only 2 passes. The value 5 that `minimum` had when the query was written is irrelevant.',
      },
      {
        key: 'foreach-filters',
        code: `IEnumerable<char> letters = "banana split";
foreach (char c in "an ")
{
    letters = letters.Where(ch => ch != c);
}
Console.WriteLine(string.Concat(letters));`,
        output: 'bsplit',
        why: 'Each `Where` is deferred, but a `foreach` loop variable is a fresh variable on every iteration (since C# 5), so the three lambdas capture `a`, `n` and the space separately and all three filters apply. (A `for` loop counter, by contrast, is one shared variable.)',
      },
    ],
  ),
  ...csCodeChoiceFamily(
    'cs-linq-short-circuit',
    2,
    'Think about how many elements each operator must look at before it can answer.',
    [
      {
        key: 'count-versus-any',
        question: 'This works, but how should the check be written?',
        code: `var hasErrors = ReadLog().Count(line => line.StartsWith("ERROR")) > 0;
Console.WriteLine(hasErrors);

static IEnumerable<string> ReadLog()
{
    yield return "ERROR disk full";
    for (int i = 0; i < 100_000; i++) yield return $"INFO tick {i}";
}`,
        correct:
          'As `ReadLog().Any(line => line.StartsWith("ERROR"))`, which stops at the first match instead of reading every line',
        wrong: [
          'It is already optimal: the compiler rewrites `Count(...) > 0` into `Any(...)`',
          'As `ReadLog().Where(line => line.StartsWith("ERROR")).ToList().Count > 0`, because a list knows its count',
          'As `ReadLog().Count() > 0`, because counting without a predicate is free',
        ],
        why: '`Count` must enumerate the whole sequence to know the total, here 100,001 lines, only to compare it with 0. `Any` returns as soon as it finds one match: after the first line. Nothing rewrites one into the other, and `ToList()` does even more work, because it also stores every match.',
      },
      {
        key: 'where-then-first',
        question: 'How does `ids.Where(predicate).First()` compare with `ids.First(predicate)`?',
        code: `int checks = 0;
int[] ids = [4, 8, 15, 16, 23, 42];
int found = ids.Where(id => { checks++; return id > 10; }).First();
Console.WriteLine($"{found} after {checks} checks");`,
        correct:
          'Both return the same element and stop at the first match (here after 3 checks); `First(predicate)` is just shorter',
        wrong: [
          '`Where` filters the whole array first, so this version always checks all 6 elements',
          '`Where(...).First()` builds a temporary list of the matches; `First(predicate)` does not',
          '`Where(...).First()` returns 0 when nothing matches, while `First(predicate)` throws',
        ],
        why: '`Where` is lazy: `First` pulls one element at a time and stops at 15, so the predicate runs only 3 times (the program prints `15 after 3 checks`). Both forms behave the same, including throwing `InvalidOperationException` when nothing matches. Prefer `First(predicate)` for readability, not for speed.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-linq-multiple-enumeration',
    3,
    [
      'Every time a deferred query is enumerated, the whole pipeline runs again, including any side effects in its lambdas.',
    ],
    [
      {
        key: 'enumerate-twice',
        code: `int calls = 0;
int[] prices = [10, 20, 30];
var doubled = prices.Select(p => { calls++; return p * 2; });
foreach (var p in doubled) { }
Console.WriteLine(doubled.Sum());
Console.WriteLine(calls);`,
        output: '120\n6',
        why: 'The `foreach` runs the selector 3 times and `Sum` enumerates the query again, running it 3 more times. With an expensive selector (a web call, a database lookup) multiple enumeration silently multiplies the cost.',
      },
      {
        key: 'materialise-once',
        code: `int calls = 0;
int[] prices = [10, 20, 30];
var doubled = prices.Select(p => { calls++; return p * 2; }).ToList();
foreach (var p in doubled) { }
Console.WriteLine(doubled.Sum());
Console.WriteLine(calls);`,
        output: '120\n3',
        why: '`ToList()` runs the selector once per element and stores the results. The `foreach` and `Sum` then read the list, so the selector never runs again.',
      },
      {
        key: 'first-twice',
        code: `int calls = 0;
int[] prices = [10, 20, 30, 40];
var doubled = prices.Select(p => { calls++; return p * 2; });
Console.WriteLine(doubled.First(d => d > 30));
Console.WriteLine(doubled.First(d => d > 30));
Console.WriteLine(calls);`,
        output: '40\n40\n4',
        why: '`First` stops as soon as it finds a match, so each call runs the selector only for 10 and 20: 2 calls. But nothing is cached between the two `First` calls, so the work is done twice, for 4 calls in total.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-linq-deferred-exceptions',
    4,
    [
      'Work inside the lambdas happens during enumeration. Argument checks of the built-in LINQ operators happen when you call them; the body of an iterator method (with `yield`) runs only when it is enumerated.',
    ],
    [
      {
        key: 'divide-at-enumeration',
        code: `int[] divisors = [4, 2, 0, 5];
var parts = divisors.Select(d => 100 / d);
Console.WriteLine("query ready");
try
{
    foreach (var p in parts) Console.WriteLine(p);
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}`,
        output: 'query ready\n25\n50\nDivideByZeroException',
        why: 'Defining the query divides nothing, so `"query ready"` prints. The divisions happen one at a time during the `foreach`: 25 and 50 are printed before `100 / 0` throws. A `try` around only the query definition would not catch this exception.',
      },
      {
        key: 'null-source-eager',
        code: `List<string>? names = null;
try
{
    var upper = names!.Select(n => n.ToUpper());
    Console.WriteLine("query ready");
    Console.WriteLine(upper.Count());
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}`,
        output: 'ArgumentNullException',
        why: 'LINQ operators are deferred, but they validate their arguments eagerly: `Select` checks that the source is not `null` as soon as it is called, so `"query ready"` never prints. The `!` only silences the compiler warning.',
      },
      {
        key: 'iterator-guard-deferred',
        code: `var evens = Evens(null);
Console.WriteLine("query ready");
try
{
    Console.WriteLine(evens.Count());
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}

static IEnumerable<int> Evens(int[]? source)
{
    ArgumentNullException.ThrowIfNull(source);
    foreach (var n in source)
    {
        if (n % 2 == 0) yield return n;
    }
}`,
        output: 'query ready\nArgumentNullException',
        why: 'In an iterator method the *whole* body, including the guard clause, runs only when enumeration starts, so the bad argument is reported far from the call that passed it. The built-in operators avoid this by checking arguments in a normal method and then returning a separate iterator; do the same in your own iterators.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-linq-loop-counter-capture',
    4,
    ['A `for` loop has one counter variable for the whole loop. When does each lambda read it?'],
    [
      {
        key: 'for-counter',
        code: `IEnumerable<int> ids = [1, 2, 3, 4, 5, 6];
int[] excluded = [2, 4];
for (int i = 0; i < excluded.Length; i++)
{
    ids = ids.Where(id => id != excluded[i]);
}
try
{
    Console.WriteLine(string.Join(",", ids));
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}`,
        output: 'IndexOutOfRangeException',
        why: 'Both lambdas capture the same variable `i`, and they only run when `string.Join` enumerates the query. By then the loop has finished and `i` is 2, so `excluded[i]` is out of range. Copy the value inside the loop (`var value = excluded[i];`) or use `foreach`, whose variable is fresh on every iteration.',
      },
    ],
  ),
  ...csCodeChoiceFamily(
    'cs-linq-performance',
    5,
    'Count how much work is done per element, and how many elements reach each operator.',
    [
      {
        key: 'contains-in-where',
        question: 'This gets slow as both lists grow. Why, and what is the fix?',
        code: `var blocked = Enumerable.Range(0, 5_000).Select(i => i * 7).ToList();
var userIds = Enumerable.Range(0, 20_000);
var allowed = userIds.Where(id => !blocked.Contains(id)).ToList();
Console.WriteLine(allowed.Count);`,
        correct:
          '`List.Contains` scans the list for every id, O(n × m); build a `HashSet<int>` from `blocked` once so each lookup is O(1)',
        wrong: [
          '`Where` is deferred, so it re-runs for every element; calling `ToList()` earlier fixes it',
          '`Enumerable.Range` allocates every number up front; a `for` loop would fix it',
          'The final `ToList()` copies every result; returning the `IEnumerable` instead fixes it',
        ],
        why: 'For each of the 20,000 ids, `blocked.Contains` walks up to 5,000 elements: up to 100 million comparisons. A `HashSet<int>` (`blocked.ToHashSet()`) answers `Contains` in constant time on average, making the whole filter linear. Deferred execution is not the problem here: the query is enumerated once.',
      },
      {
        key: 'sort-before-filter',
        question: 'What is the better order of these operators, and why?',
        code: `var orders = Enumerable.Range(1, 50_000).Select(i => new Order(i, i % 100)).ToList();
var recentBig = orders
    .OrderByDescending(o => o.Id)
    .Where(o => o.Total > 95)
    .Take(10)
    .ToList();
Console.WriteLine(recentBig[0].Id);

record Order(int Id, int Total);`,
        correct:
          '`Where` before `OrderByDescending`: the result is the same, but only the few orders that pass the filter have to be sorted',
        wrong: [
          'It makes no difference: LINQ to Objects reorders operators so that filters run first',
          '`Take(10)` before `Where`, so that only 10 orders are filtered',
          'The current order is required: `Where` would lose the sort order if it came first',
        ],
        why: 'Sorting costs O(n log n), so sorting all 50,000 orders and then throwing 96% of them away wastes work. `Where` keeps the relative order of what it lets through, so filtering first gives the same result while sorting only about 2,000 orders. LINQ to Objects runs operators exactly in the order you write them. Moving `Take` before `Where` would change the meaning.',
      },
    ],
  ),
  ...csConceptFamily(
    'cs-linq-iqueryable',
    5,
    'Ask what the `Where` method receives: code it can only call, or a description of the code it can inspect.',
    [
      {
        key: 'as-enumerable',
        question:
          '`db.Orders` is an `IQueryable<Order>` from a database provider such as Entity Framework. What is the difference between `db.Orders.Where(o => o.Total > 100).ToList()` and `db.Orders.AsEnumerable().Where(o => o.Total > 100).ToList()`?',
        correct:
          'The first sends the filter to the database, so only matching rows are loaded; the second loads every order and filters in memory',
        wrong: [
          'None: both call the same `Where` method',
          'The second is faster, because filtering in memory avoids work on the database server',
          'The first runs immediately, while the second is deferred until `ToList()`',
        ],
        why: 'On an `IQueryable<T>`, `Where` is `Queryable.Where`, which adds the condition to the query the provider translates to SQL. After `AsEnumerable()` the static type is `IEnumerable<T>`, so `Enumerable.Where` is chosen: every row is fetched and the lambda runs in your process. Both are deferred until `ToList()`.',
      },
      {
        key: 'expression-trees',
        question:
          'Why can a query provider translate `IQueryable<T>.Where(o => o.Total > 100)` into SQL, but not `IEnumerable<T>.Where(o => o.Total > 100)`?',
        correct:
          '`Queryable.Where` takes an `Expression<Func<T, bool>>`, a data structure describing the lambda that the provider can inspect; `Enumerable.Where` takes a compiled `Func<T, bool>` delegate it can only call',
        wrong: [
          '`IQueryable<T>` executes eagerly, so the SQL is generated before the lambda runs',
          'Lambdas passed to `IEnumerable<T>` are translated to SQL only when the source is a `List<T>`',
          'Only `IQueryable<T>` supports deferred execution, which translation requires',
        ],
        why: 'The same lambda syntax compiles to two different things depending on the parameter type: to an expression tree for `Expression<Func<…>>`, or to executable code for `Func<…>`. A provider walks the expression tree to produce SQL; a delegate is opaque. Both interfaces are deferred.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Exceptions and resource cleanup

export const exceptionsFamilies: readonly QuestionSource[] = [
  ...csOutputFamily(
    'cs-try-catch-finally-order',
    1,
    [
      'A `catch` block runs only when a matching exception is thrown; `finally` always runs, after `try` (and `catch`, if one ran).',
    ],
    [
      {
        key: 'no-exception',
        code: `try
{
    Console.WriteLine("open");
    Console.WriteLine("read");
}
catch (Exception)
{
    Console.WriteLine("error");
}
finally
{
    Console.WriteLine("close");
}
Console.WriteLine("done");`,
        output: 'open\nread\nclose\ndone',
        why: 'Nothing is thrown, so the `catch` block is skipped. `finally` runs after the `try` block whether or not an exception occurred, and execution then continues after the statement.',
      },
      {
        key: 'with-exception',
        code: `try
{
    Console.WriteLine("open");
    int[] data = [1, 2];
    Console.WriteLine(data[2]);
    Console.WriteLine("read");
}
catch (IndexOutOfRangeException)
{
    Console.WriteLine("error");
}
finally
{
    Console.WriteLine("close");
}
Console.WriteLine("done");`,
        output: 'open\nerror\nclose\ndone',
        why: '`data[2]` throws, so the rest of the `try` block (`"read"`) is skipped: execution does not resume after the failing line. The `catch` handles the exception, then `finally` runs, and because the exception was handled the program continues with `"done"`.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-finally-on-return',
    2,
    [
      '`return` inside `try` does not skip `finally`. The return value is decided when `return` executes.',
    ],
    [
      {
        key: 'return-in-try',
        code: `Console.WriteLine(Load());

static string Load()
{
    try
    {
        Console.WriteLine("loading");
        return "data";
    }
    finally
    {
        Console.WriteLine("cleanup");
    }
}`,
        output: 'loading\ncleanup\ndata',
        why: '`return "data"` leaves the `try` block, but `finally` runs before the method actually returns, so `"cleanup"` is printed before the caller prints the result.',
      },
      {
        key: 'value-already-taken',
        code: `Console.WriteLine(Next());

static int Next()
{
    int counter = 1;
    try
    {
        return counter;
    }
    finally
    {
        counter = 99;
        Console.WriteLine($"finally sees {counter}");
    }
}`,
        output: 'finally sees 99\n1',
        why: '`return counter` evaluates `counter` (1) and stores that value before `finally` runs. Changing the local variable in `finally` does not change the value already being returned.',
      },
    ],
  ),
  ...csCompilesFamily(
    'cs-catch-clause-order',
    2,
    'Catch clauses are tried from top to bottom. Can any exception ever reach a clause placed after `catch (Exception)`?',
    [
      {
        key: 'general-first',
        code: `try
{
    Console.WriteLine(int.Parse("x"));
}
catch (Exception)
{
    Console.WriteLine("failed");
}
catch (FormatException)
{
    Console.WriteLine("not a number");
}`,
        compiles: false,
        why: '`catch (Exception)` catches every exception, so the `FormatException` clause after it could never run. The compiler rejects this (CS0160). Order catch clauses from most specific to most general.',
      },
      {
        key: 'filtered-general-first',
        code: `try
{
    Console.WriteLine(int.Parse("x"));
}
catch (Exception e) when (e is OverflowException)
{
    Console.WriteLine("too big");
}
catch (FormatException)
{
    Console.WriteLine("not a number");
}`,
        compiles: true,
        why: 'With a `when` filter, the general clause does not catch everything, so a later clause can still be reached and there is no error. Here the filter is `false` for a `FormatException`, which falls through to the second clause.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-exception-filters-custom',
    3,
    [
      'A `catch` clause matches when the exception is of that type or a derived type, and its `when` filter (if any) is `true`.',
    ],
    [
      {
        key: 'status-filter',
        code: `foreach (var status in new[] { 404, 503 })
{
    try
    {
        throw new ApiException(status);
    }
    catch (ApiException e) when (e.Status >= 500)
    {
        Console.WriteLine($"retry {e.Status}");
    }
    catch (ApiException e)
    {
        Console.WriteLine($"give up {e.Status}");
    }
}

class ApiException(int status) : Exception($"HTTP {status}")
{
    public int Status { get; } = status;
}`,
        output: 'give up 404\nretry 503',
        why: 'For 404 the filter is `false`, so the first clause is skipped (not entered and left) and the next clause handles it. For 503 the filter is `true`. A custom exception type can carry data, such as the status code, that filters and handlers use.',
      },
      {
        key: 'derived-type',
        code: `try
{
    Withdraw(balance: 50m, amount: 80m);
}
catch (ArgumentException)
{
    Console.WriteLine("bad argument");
}
catch (InvalidOperationException e)
{
    Console.WriteLine($"{e.GetType().Name}: {e.Message}");
}

static void Withdraw(decimal balance, decimal amount)
{
    if (amount > balance) throw new InsufficientFundsException(amount - balance);
    Console.WriteLine("ok");
}

class InsufficientFundsException(decimal shortBy)
    : InvalidOperationException($"short by {shortBy}");`,
        output: 'InsufficientFundsException: short by 30',
        why: '`InsufficientFundsException` derives from `InvalidOperationException`, so `catch (InvalidOperationException e)` handles it, and `GetType()` still reports the real, derived type. Deriving custom exceptions from a fitting base type lets general handlers catch them too.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-using-dispose',
    3,
    [
      '`using` calls `Dispose` when the variable goes out of scope, even when an exception is thrown. Several `using` declarations are disposed in reverse order.',
    ],
    [
      {
        key: 'reverse-order',
        code: `Process();
Console.WriteLine("after");

static void Process()
{
    using var db = new Resource("db");
    using var file = new Resource("file");
    Console.WriteLine("working");
}

class Resource(string name) : IDisposable
{
    public void Dispose() => Console.WriteLine($"dispose {name}");
}`,
        output: 'working\ndispose file\ndispose db\nafter',
        why: 'A `using` declaration disposes its variable at the end of the enclosing scope, here the end of `Process`. Resources are disposed in reverse order of declaration, like a stack, so `file` (which might depend on `db`) is released first.',
      },
      {
        key: 'statement-with-exception',
        code: `try
{
    using (var tx = new Transaction())
    {
        Console.WriteLine("begin");
        throw new InvalidOperationException("conflict");
    }
}
catch (InvalidOperationException e)
{
    Console.WriteLine($"caught {e.Message}");
}

class Transaction : IDisposable
{
    public void Dispose() => Console.WriteLine("rollback");
}`,
        output: 'begin\nrollback\ncaught conflict',
        why: 'A `using` statement is a `try`/`finally` that calls `Dispose`. The exception leaves the `using` block, `Dispose` runs on the way out, and only then does the outer `catch` handle the exception.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-guard-clauses',
    4,
    [
      '`ThrowIfNull` and `ThrowIfNegative` fill in the parameter name for you. Both exception types derive from `ArgumentException`.',
    ],
    [
      {
        key: 'param-name',
        code: `try
{
    Register(null, 3);
}
catch (ArgumentNullException e)
{
    Console.WriteLine($"{e.GetType().Name} {e.ParamName}");
}

static void Register(string? email, int seats)
{
    ArgumentNullException.ThrowIfNull(email);
    ArgumentOutOfRangeException.ThrowIfNegative(seats);
    Console.WriteLine("registered");
}`,
        output: 'ArgumentNullException email',
        why: '`ThrowIfNull(email)` throws before anything else runs. You do not pass `nameof(email)`: the parameter name is captured from the argument expression at compile time (`CallerArgumentExpression`), so `ParamName` is `"email"`.',
      },
      {
        key: 'base-class',
        code: `Console.WriteLine(TryRegister("a@b.c", 2));
Console.WriteLine(TryRegister("a@b.c", -1));
Console.WriteLine(TryRegister(null, -1));

static string TryRegister(string? email, int seats)
{
    try
    {
        ArgumentNullException.ThrowIfNull(email);
        ArgumentOutOfRangeException.ThrowIfNegative(seats);
        return "ok";
    }
    catch (ArgumentException e)
    {
        return $"{e.GetType().Name}({e.ParamName})";
    }
}`,
        output: 'ok\nArgumentOutOfRangeException(seats)\nArgumentNullException(email)',
        why: 'Both guard exceptions derive from `ArgumentException`, so one clause catches them, and `GetType()` still shows the specific type. With both arguments invalid, only the first guard fires: guards run in order and the first failure stops the method.',
      },
    ],
  ),
  ...csCodeChoiceFamily(
    'cs-rethrow',
    4,
    'Compare what the caller can learn about where the error happened.',
    [
      {
        key: 'throw-ex',
        question: 'The `catch` in `Import` logs and rethrows. What is wrong with `throw ex;`?',
        code: `try
{
    Import();
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}

static void Import()
{
    try
    {
        ParseRow("x");
    }
    catch (FormatException ex)
    {
        Console.WriteLine("logging");
        throw ex;
    }
}

static int ParseRow(string row) => int.Parse(row);`,
        correct:
          'It resets the stack trace to `Import`, hiding that the error came from `ParseRow`; `throw;` rethrows with the original stack trace',
        wrong: [
          'It converts the exception to a plain `Exception`, so the caller sees the wrong type',
          'It throws a copy of the exception, so the outer `catch` cannot catch it',
          'Nothing: `throw ex;` and `throw;` behave the same',
        ],
        why: '`throw ex;` throws the same object (the caller still sees `FormatException`, as the program prints), but the stack trace now starts at the `throw ex;` line, so the frames inside `ParseRow` and `int.Parse` are lost. `throw;` keeps them. To add context, throw a new exception and pass the original as `innerException`.',
      },
    ],
  ),
  ...csCompilesFamily(
    'cs-exception-statement-rules',
    4,
    'Think about which statements could make the outcome of a `try` ambiguous or have nothing to work on.',
    [
      {
        key: 'return-in-finally',
        code: `Console.WriteLine(Parse("12"));

static int Parse(string s)
{
    try
    {
        return int.Parse(s);
    }
    finally
    {
        return -1;
    }
}`,
        compiles: false,
        why: 'Control cannot leave a `finally` block with `return`, `break`, `continue` or `goto` (CS0157): it would silently replace the result or swallow an exception. Some other languages allow this; C# does not.',
      },
      {
        key: 'rethrow-outside-catch',
        code: `Report(new InvalidOperationException("boom"));

static void Report(Exception e)
{
    Console.WriteLine(e.Message);
    throw;
}`,
        compiles: false,
        why: 'A bare `throw;` rethrows the exception currently being handled, so it is only allowed inside a `catch` block (CS0156). Here there is nothing being handled; to throw the parameter you would write `throw e;`.',
      },
      {
        key: 'throw-expression',
        code: `Console.WriteLine(Describe("C#"));

static string Describe(string? name) =>
    (name ?? throw new ArgumentNullException(nameof(name))).ToUpperInvariant();`,
        compiles: true,
        why: 'Since C# 7, `throw` can be used as an expression in `??`, the conditional operator and expression-bodied members, so this is a valid one-line guard.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-async-dispose',
    4,
    [
      '`await using` calls `DisposeAsync` and awaits it. All `using` and `await using` declarations in a scope are disposed in reverse order.',
    ],
    [
      {
        key: 'mixed-using',
        code: `await RunAsync();
Console.WriteLine("after");

static async Task RunAsync()
{
    await using var connection = new Connection();
    using var log = new Log();
    Console.WriteLine("query");
    await Task.Yield();
}

class Connection : IAsyncDisposable
{
    public async ValueTask DisposeAsync()
    {
        await Task.Yield();
        Console.WriteLine("close connection");
    }
}

class Log : IDisposable
{
    public void Dispose() => Console.WriteLine("flush log");
}`,
        output: 'query\nflush log\nclose connection\nafter',
        why: 'At the end of `RunAsync`, the declarations are disposed in reverse order: `log` (synchronously) first, then `connection`, whose `DisposeAsync` is awaited. Because it is awaited, `RunAsync` does not complete until the connection is closed, so `"after"` comes last.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-finally-replaces-exception',
    5,
    [
      'If a `finally` block (or a `Dispose` method) throws while an exception is already propagating, which exception does the caller see?',
    ],
    [
      {
        key: 'finally-throws',
        code: `try
{
    try
    {
        throw new InvalidOperationException("save failed");
    }
    finally
    {
        throw new TimeoutException("close failed");
    }
}
catch (Exception e)
{
    Console.WriteLine(e.Message);
    Console.WriteLine(e.InnerException is null);
}`,
        output: 'close failed\nTrue',
        why: 'The exception thrown in `finally` replaces the one that was propagating: the original `"save failed"` is lost entirely; it is not attached as `InnerException`. This is why cleanup code should not throw, or should catch its own failures.',
      },
      {
        key: 'dispose-throws',
        code: `try
{
    using var reader = new Reader();
    throw new FormatException("bad header");
}
catch (Exception e)
{
    Console.WriteLine($"{e.GetType().Name}: {e.Message}");
}

class Reader : IDisposable
{
    public void Dispose() => throw new InvalidOperationException("dispose failed");
}`,
        output: 'InvalidOperationException: dispose failed',
        why: '`using` disposes in a hidden `finally` block, so an exception from `Dispose` replaces the `FormatException` that caused the block to exit, and the real cause is lost. `Dispose` implementations should not throw.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-exception-filter-timing',
    5,
    [
      'The runtime first searches for a matching handler (evaluating `when` filters) and only then unwinds the stack, running `finally` blocks.',
    ],
    [
      {
        key: 'filter-before-finally',
        code: `try
{
    try
    {
        throw new InvalidOperationException();
    }
    finally
    {
        Console.WriteLine("inner finally");
    }
}
catch (Exception) when (Log("filter"))
{
    Console.WriteLine("handler");
}

static bool Log(string message)
{
    Console.WriteLine(message);
    return true;
}`,
        output: 'filter\ninner finally\nhandler',
        why: 'Exception handling has two passes. First the runtime looks for a handler, running `when` filters while the throwing frame is still intact, which is why filters are useful for logging the original state. Then it unwinds, running the inner `finally`, and finally enters the handler. Expecting `finally` to run before the filter is the common mistake.',
      },
    ],
  ),
];
