import type { QuestionSource } from '@pracstack/content-model';
import { csCompilesFamily, csOutputFamily } from './builders';

/*
 * C# fundamentals: value and reference semantics, nullable types, pattern
 * matching. Every snippet is compiled and run by the real C# runner.
 */

// ---------------------------------------------------------------- Value and reference types

export const valueReferenceFamilies: readonly QuestionSource[] = [
  ...csOutputFamily(
    'cs-default-values',
    1,
    ['Fields that are not assigned get their type’s default value.'],
    [
      {
        key: 'int-and-string',
        code: `var box = new Box();
Console.WriteLine(box.Count);
Console.WriteLine(box.Name is null);

class Box
{
    public int Count;
    public string? Name;
}`,
        output: '0\nTrue',
        why: 'An unassigned `int` field is `0` and an unassigned reference-type field is `null`. Fields are always initialised to their default; only local variables must be assigned before use.',
      },
      {
        key: 'bool-and-array',
        code: `var flags = new Flags();
Console.WriteLine(flags.Enabled);
Console.WriteLine(flags.Values is null);

class Flags
{
    public bool Enabled;
    public int[]? Values;
}`,
        output: 'False\nTrue',
        why: '`bool` defaults to `false`. Arrays are reference types, so an unassigned array field is `null`, not an empty array.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-copy-semantics',
    1,
    [
      'Assigning a struct copies the whole value; assigning a class instance copies a reference to the same object.',
    ],
    [
      {
        key: 'struct',
        code: `var a = new Point(1);
var b = a;
b.X = 5;
Console.WriteLine(a.X);

struct Point
{
    public int X;
    public Point(int x) => X = x;
}`,
        output: '1',
        why: '`Point` is a struct (a value type), so `var b = a` copies it. Changing `b.X` leaves `a` unchanged.',
      },
      {
        key: 'class',
        code: `var a = new Point(1);
var b = a;
b.X = 5;
Console.WriteLine(a.X);

class Point
{
    public int X;
    public Point(int x) => X = x;
}`,
        output: '5',
        why: '`Point` is a class (a reference type), so `a` and `b` refer to the same object. Changing it through `b` is visible through `a`.',
      },
      {
        key: 'array',
        code: `int[] a = [1, 2, 3];
var b = a;
b[0] = 9;
Console.WriteLine(a[0]);`,
        output: '9',
        why: 'Arrays are reference types even when their elements are value types: `a` and `b` are the same array.',
      },
      {
        key: 'string',
        code: `string a = "hi";
var b = a;
b += "!";
Console.WriteLine(a);`,
        output: 'hi',
        why: 'Strings are reference types but immutable. `b += "!"` creates a new string and points `b` at it; `a` still refers to `"hi"`.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-parameter-passing',
    2,
    [
      'Arguments are passed by value unless the parameter is `ref`, `out` or `in`. For a class, the value passed is the reference.',
    ],
    [
      {
        key: 'class-mutation',
        code: `var counter = new Counter();
Bump(counter);
Console.WriteLine(counter.Value);

static void Bump(Counter c) => c.Value++;

class Counter { public int Value; }`,
        output: '1',
        why: 'The method receives a copy of the reference, which points to the same object, so changing `c.Value` changes the caller’s object.',
      },
      {
        key: 'struct-mutation',
        code: `var counter = new Counter();
Bump(counter);
Console.WriteLine(counter.Value);

static void Bump(Counter c) => c.Value++;

struct Counter { public int Value; }`,
        output: '0',
        why: 'A struct argument is copied. `Bump` increments its own copy; the caller’s `counter` is unchanged.',
      },
      {
        key: 'struct-ref',
        code: `var counter = new Counter();
Bump(ref counter);
Console.WriteLine(counter.Value);

static void Bump(ref Counter c) => c.Value++;

struct Counter { public int Value; }`,
        output: '1',
        why: 'With `ref`, the method works on the caller’s variable itself, so the struct is changed in place.',
      },
      {
        key: 'class-reassign',
        code: `var counter = new Counter { Value = 3 };
Reset(counter);
Console.WriteLine(counter.Value);

static void Reset(Counter c)
{
    c = new Counter();
    c.Value = 10;
}

class Counter { public int Value; }`,
        output: '3',
        why: 'Assigning `c = new Counter()` only changes the method’s copy of the reference. The caller still refers to the original object, which was never modified.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-equality',
    3,
    [
      '`==` on classes compares references unless the type overloads it. Records and strings compare by value.',
    ],
    [
      {
        key: 'record',
        code: `var a = new Money(5m, "EUR");
var b = new Money(5m, "EUR");
Console.WriteLine(a == b);

record Money(decimal Amount, string Currency);`,
        output: 'True',
        why: 'Records generate value-based equality: two records with equal properties are equal, even though they are different objects.',
      },
      {
        key: 'class',
        code: `var a = new Money(5m, "EUR");
var b = new Money(5m, "EUR");
Console.WriteLine(a == b);

class Money(decimal amount, string currency)
{
    public decimal Amount { get; } = amount;
    public string Currency { get; } = currency;
}`,
        output: 'False',
        why: 'A plain class uses reference equality: `a` and `b` are two different objects, so `==` is `false` even though their properties match.',
      },
      {
        key: 'record-reference',
        code: `var a = new Money(5m, "EUR");
var b = new Money(5m, "EUR");
Console.WriteLine(ReferenceEquals(a, b));

record Money(decimal Amount, string Currency);`,
        output: 'False',
        why: 'Records are equal by value, but they are still separate objects: `ReferenceEquals` checks identity, not equality.',
      },
      {
        key: 'string',
        code: `var a = "data";
var b = new string(['d', 'a', 't', 'a']);
Console.WriteLine(a == b);`,
        output: 'True',
        why: '`string` overloads `==` to compare the characters, so two different string objects with the same text are equal.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-boxing',
    4,
    [
      'Converting a value type to `object` boxes it: the box holds a copy, and `==` on two `object`s compares references.',
    ],
    [
      {
        key: 'copy',
        code: `int n = 1;
object boxed = n;
n++;
Console.WriteLine(boxed);`,
        output: '1',
        why: 'Boxing copies the value into a new object. Incrementing `n` afterwards does not change the box.',
      },
      {
        key: 'reference-equality',
        code: `object a = 5;
object b = 5;
Console.WriteLine(a == b);
Console.WriteLine(a.Equals(b));`,
        output: 'False\nTrue',
        why: 'Each assignment boxes `5` into a separate object. `==` on `object` compares references (different boxes), while `Equals` is overridden by `int` to compare values.',
      },
      {
        key: 'nullable',
        code: `int? missing = null;
object? box = missing;
int? three = 3;
object other = three;
Console.WriteLine(box is null);
Console.WriteLine(other.GetType().Name);`,
        output: 'True\nInt32',
        why: 'Boxing a `Nullable<int>` without a value gives a `null` reference, and boxing one with a value boxes the underlying `int`. There is never a boxed `Nullable<int>`.',
      },
      {
        key: 'interface',
        code: `ICounter counter = new Counter();
counter.Increment();
counter.Increment();
var copy = (Counter)counter;
copy.Increment();
Console.WriteLine(((Counter)counter).Value);

interface ICounter { void Increment(); }

struct Counter : ICounter
{
    public int Value;
    public void Increment() => Value++;
}`,
        output: '2',
        why: 'Assigning the struct to an interface variable boxes it once; calls through the interface change that box, so it reaches `2`. The cast `(Counter)counter` unboxes a *copy*, and incrementing the copy leaves the box at `2`. Mutable structs behind interfaces are a classic source of “lost” updates.',
      },
    ],
  ),
  ...csCompilesFamily(
    'cs-struct-in-collection',
    5,
    'Indexing a `List<T>` returns a copy of a struct element; indexing an array gives the element itself.',
    [
      {
        key: 'list',
        code: `var points = new List<Point> { new Point() };
points[0].X = 7;

struct Point { public int X; }`,
        compiles: false,
        why: 'The list indexer returns a copy of the struct, so changing a field of that temporary copy would be lost. The compiler rejects it (CS1612). Replace the element instead: `points[0] = points[0] with { X = 7 }` or `var p = points[0]; p.X = 7; points[0] = p;`.',
      },
      {
        key: 'array',
        code: `Point[] points = [new Point()];
points[0].X = 7;
Console.WriteLine(points[0].X);

struct Point { public int X; }`,
        compiles: true,
        why: 'An array element is a variable, so `points[0].X = 7` changes the element in place. Only indexers (like `List<T>`’s) return copies.',
      },
      {
        key: 'readonly-struct',
        code: `var p = new Point(1);
p.X = 2;

readonly struct Point(int x)
{
    public int X { get; } = x;
}`,
        compiles: false,
        why: 'A `readonly struct` cannot be modified after construction, and `X` has only a getter. Create a new value instead.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Nullable types

export const nullableFamilies: readonly QuestionSource[] = [
  ...csOutputFamily(
    'cs-null-coalescing',
    1,
    [
      '`a ?? b` is `a` unless `a` is `null`, then `b`. `x?.Member` is `null` when `x` is `null` instead of throwing.',
    ],
    [
      {
        key: 'int-null',
        code: `int? quantity = null;
Console.WriteLine(quantity ?? 10);`,
        output: '10',
        why: '`quantity` has no value, so `??` uses the right-hand side, `10`.',
      },
      {
        key: 'int-value',
        code: `int? quantity = 3;
Console.WriteLine(quantity ?? 10);`,
        output: '3',
        why: '`quantity` has a value, so `??` returns it and ignores `10`.',
      },
      {
        key: 'string-null',
        code: `string? name = null;
Console.WriteLine(name?.Length ?? -1);`,
        output: '-1',
        why: '`name?.Length` is `null` because `name` is `null` (no exception), and `??` then gives `-1`.',
      },
      {
        key: 'string-value',
        code: `string? name = "Ada";
Console.WriteLine(name?.Length ?? -1);`,
        output: '3',
        why: '`name` is not `null`, so `name?.Length` is `3`, and `??` keeps it.',
      },
    ],
  ),
  ...csCompilesFamily(
    'cs-nullable-value-compile',
    2,
    'A value type such as `int` can never be `null`; `int?` (`Nullable<int>`) can. Converting `int?` to `int` must be explicit.',
    [
      {
        key: 'null-to-int',
        code: 'int count = null;',
        compiles: false,
        why: '`int` is a non-nullable value type, so `null` cannot be assigned to it (CS0037). Use `int?` when “no value” is meaningful.',
      },
      {
        key: 'nullable-to-int',
        code: `int? stock = 4;
int available = stock;`,
        compiles: false,
        why: 'There is no implicit conversion from `int?` to `int`, because the value might be missing (CS0266). Use `stock ?? 0`, `stock.Value` or `(int)stock`.',
      },
      {
        key: 'coalesce',
        code: `int? stock = 4;
int available = stock ?? 0;`,
        compiles: true,
        why: '`stock ?? 0` is always an `int`, so the assignment compiles.',
      },
      {
        key: 'nullable-reference',
        code: 'string name = null;',
        compiles: true,
        why: 'It compiles, with a warning (CS8600). Nullable reference types are a compile-time analysis that produces warnings, not errors, unless a project treats warnings as errors. At run time a `string` can still be `null`.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-nullable-members',
    2,
    [
      '`HasValue` tells whether a `Nullable<T>` holds a value. `GetValueOrDefault()` returns the value, or the type’s default (or the default you pass).',
    ],
    [
      {
        key: 'null',
        code: `int? discount = null;
Console.WriteLine(discount.HasValue);
Console.WriteLine(discount.GetValueOrDefault());`,
        output: 'False\n0',
        why: 'Without a value, `HasValue` is `false` and `GetValueOrDefault()` returns `default(int)`, which is `0`. It does not throw, unlike `.Value`.',
      },
      {
        key: 'value',
        code: `int? discount = 4;
Console.WriteLine(discount.HasValue);
Console.WriteLine(discount.GetValueOrDefault(9));`,
        output: 'True\n4',
        why: 'With a value, `GetValueOrDefault(9)` returns that value; the `9` is used only when there is none.',
      },
      {
        key: 'custom-default',
        code: `int? discount = null;
Console.WriteLine(discount.GetValueOrDefault(9));`,
        output: '9',
        why: 'No value, so the default passed in (`9`) is returned.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-lifted-operators',
    3,
    [
      'Arithmetic with a `null` operand gives `null`. Comparisons such as `<` and `>=` are `false` when either side is `null`.',
    ],
    [
      {
        key: 'arithmetic',
        code: `int? a = null;
int? b = 5;
Console.WriteLine(a + b is null);`,
        output: 'True',
        why: 'Operators on nullable values are “lifted”: if any operand is `null`, the result is `null`.',
      },
      {
        key: 'comparisons',
        code: `int? a = null;
int? b = 5;
Console.WriteLine(a < b);
Console.WriteLine(a >= b);`,
        output: 'False\nFalse',
        why: 'With a `null` operand, `<`, `>`, `<=` and `>=` are all `false`. So `a < b` and `a >= b` are both `false`: the usual “one of them must be true” rule does not hold.',
      },
      {
        key: 'equality',
        code: `int? a = null;
int? b = null;
Console.WriteLine(a == b);
Console.WriteLine(a == 0);`,
        output: 'True\nFalse',
        why: 'Unlike `<` and `>`, `==` treats two `null`s as equal; `null` is not equal to `0`.',
      },
      {
        key: 'bool',
        code: `bool? approved = null;
Console.WriteLine(approved == true ? "yes" : "no");`,
        output: 'no',
        why: '`approved == true` is `false` when `approved` is `null`, so the condition picks `"no"`. Writing `if (approved)` would not compile, because `bool?` is not `bool`.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-null-coalescing-assignment',
    3,
    ['`x ??= value` assigns only when `x` is `null`.'],
    [
      {
        key: 'list',
        code: `List<int>? items = null;
items ??= new List<int>();
items.Add(1);
items ??= new List<int> { 99 };
Console.WriteLine(items.Count);`,
        output: '1',
        why: 'The first `??=` creates the list because `items` is `null`. The second does nothing, because `items` already refers to a list with one element.',
      },
      {
        key: 'string',
        code: `string? role = null;
role ??= "guest";
role ??= "admin";
Console.WriteLine(role);`,
        output: 'guest',
        why: 'Only the first `??=` assigns; after that `role` is not `null`.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-null-forgiving',
    4,
    [
      'The `!` operator only silences the compiler’s nullable warning. It adds no check at run time.',
    ],
    [
      {
        key: 'throws',
        code: `string? code = null;
try
{
    Console.WriteLine(code!.Length);
}
catch (NullReferenceException)
{
    Console.WriteLine("NullReferenceException");
}`,
        output: 'NullReferenceException',
        why: '`code!` tells the compiler “trust me, this is not null”, but nothing checks it. Accessing `.Length` on `null` still throws `NullReferenceException`.',
      },
      {
        key: 'chain',
        code: `var order = new Order(null);
Console.WriteLine(order.Customer?.Name ?? "unknown");

record Customer(string Name);
record Order(Customer? Customer);`,
        output: 'unknown',
        why: '`order.Customer` is `null`, so `?.Name` short-circuits to `null` without evaluating `.Name`, and `??` supplies `"unknown"`.',
      },
      {
        key: 'chain-value',
        code: `var order = new Order(new Customer("Ada"));
Console.WriteLine(order.Customer?.Name ?? "unknown");

record Customer(string Name);
record Order(Customer? Customer);`,
        output: 'Ada',
        why: 'The customer exists, so `?.Name` returns `"Ada"` and `??` keeps it.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-generic-nullable',
    5,
    [
      'For an unconstrained type parameter, `T?` means “may be null if T is a reference type”; for a value type it is just `T`.',
    ],
    [
      {
        key: 'unconstrained',
        code: `int first = FirstOrDefault(Array.Empty<int>());
Console.WriteLine(first);

static T? FirstOrDefault<T>(T[] items) => items.Length > 0 ? items[0] : default;`,
        output: '0',
        why: 'With no constraint, `T?` for `T = int` is plain `int`, not `int?`, so `default` is `0`. That is why “not found” and “found 0” look the same here.',
      },
      {
        key: 'struct-constraint',
        code: `int? first = FirstOrNull(Array.Empty<int>());
Console.WriteLine(first.HasValue);

static T? FirstOrNull<T>(T[] items) where T : struct => items.Length > 0 ? items[0] : null;`,
        output: 'False',
        why: 'With `where T : struct`, `T?` really is `Nullable<T>`, so an empty array gives `null` and `HasValue` is `false`.',
      },
      {
        key: 'reference-type',
        code: `string? first = FirstOrDefault(Array.Empty<string>());
Console.WriteLine(first is null);

static T? FirstOrDefault<T>(T[] items) => items.Length > 0 ? items[0] : default;`,
        output: 'True',
        why: 'For a reference type such as `string`, `default` is `null`, so the same unconstrained method that returned `0` for `int` returns `null` here. `T?` only promises “may be null” for reference types.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-nullable-value-access',
    4,
    ['A `Nullable<T>` is a struct that may or may not hold a value; it is never a null reference.'],
    [
      {
        key: 'value',
        code: `int? stock = null;
try
{
    Console.WriteLine(stock.Value);
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}`,
        output: 'InvalidOperationException',
        why: '`Nullable<T>.Value` throws `InvalidOperationException` (“Nullable object must have a value”), not `NullReferenceException`: `stock` is a struct, so there is no null reference to dereference.',
      },
      {
        key: 'cast',
        code: `int? stock = null;
try
{
    int count = (int)stock;
    Console.WriteLine(count);
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}`,
        output: 'InvalidOperationException',
        why: 'The explicit cast `(int)stock` reads `.Value`, so it throws the same `InvalidOperationException`. Use `stock ?? 0` or `GetValueOrDefault()` when a default is acceptable.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Pattern matching

export const patternMatchingFamilies: readonly QuestionSource[] = [
  ...csOutputFamily(
    'cs-switch-relational',
    1,
    ['A switch expression checks its arms from top to bottom and uses the first one that matches.'],
    ([5, 42, 100] as const).map((n) => ({
      key: `n${n}`,
      code: `Console.WriteLine(Size(${n}));

static string Size(int n) => n switch
{
    < 10 => "small",
    < 100 => "medium",
    _ => "large",
};`,
      output: n < 10 ? 'small' : n < 100 ? 'medium' : 'large',
      why:
        n === 100
          ? '`100` is not `< 100`, so neither of the first two arms match and the discard `_` gives `"large"`. Boundaries are a common source of off-by-one bugs.'
          : `The first arm that matches ${n} wins: ${n < 10 ? '`< 10`' : '`< 100` (it is not `< 10`)'}.`,
    })),
  ),
  ...csOutputFamily(
    'cs-type-patterns',
    2,
    ['Type patterns test the run-time type and, with a name, give you a typed variable.'],
    [
      {
        key: 'mixed',
        code: `object?[] items = [1, "two", 3.0, null];
foreach (var item in items)
{
    Console.WriteLine(item switch
    {
        int i => $"int {i}",
        string s => $"string {s}",
        null => "null",
        _ => "other",
    });
}`,
        output: 'int 1\nstring two\nother\nnull',
        why: '`3.0` is a `double`, which matches neither `int` nor `string`, so it falls through to `_`. The `null` arm handles `null` (a type pattern never matches `null`).',
      },
      {
        key: 'is',
        code: `object value = "pattern";
if (value is string { Length: > 5 } text)
{
    Console.WriteLine(text.ToUpperInvariant());
}
else
{
    Console.WriteLine("no");
}`,
        output: 'PATTERN',
        why: '`value` is a `string` whose `Length` (7) is greater than 5, so the pattern matches and declares `text` as a `string`.',
      },
    ],
  ),
  ...csCompilesFamily(
    'cs-switch-compile',
    3,
    'Arms are checked in order. An arm that can never be reached is an error; a switch expression that might not match is only a warning.',
    [
      {
        key: 'unreachable',
        code: `static string Describe(object o) => o switch
{
    _ => "anything",
    int => "int",
};`,
        compiles: false,
        why: 'The discard `_` matches everything, so the `int` arm after it can never be reached. The compiler reports it as an error (CS8510).',
      },
      {
        key: 'non-exhaustive',
        code: `static string Sign(int n) => n switch
{
    > 0 => "positive",
    < 0 => "negative",
};`,
        compiles: true,
        why: 'It compiles with a warning (CS8509): `0` matches no arm. At run time `Sign(0)` throws `SwitchExpressionException`. Add a `0 =>` or `_ =>` arm.',
      },
      {
        key: 'exhaustive',
        code: `static string Sign(int n) => n switch
{
    > 0 => "positive",
    < 0 => "negative",
    0 => "zero",
};`,
        compiles: true,
        why: 'Every `int` is positive, negative or zero, so the switch is exhaustive: no warning and no exception.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-switch-no-match',
    3,
    ['A switch expression must always produce a value.'],
    [
      {
        key: 'sign',
        code: `try
{
    Console.WriteLine(Sign(0));
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}

static string Sign(int n) => n switch
{
    > 0 => "+",
    < 0 => "-",
};`,
        output: 'SwitchExpressionException',
        why: 'A switch expression must produce a value. When no arm matches, it throws `SwitchExpressionException`, which is why the compiler warns about non-exhaustive switches.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-property-patterns',
    3,
    ['Property patterns match on the values of properties; arms are still checked in order.'],
    [
      {
        key: 'member',
        total: '250m',
        country: '"NL"',
        member: 'true',
        output: '0',
        why: 'The first arm matches every member, before the order total or country are looked at.',
      },
      {
        key: 'nl-large',
        total: '250m',
        country: '"NL"',
        member: 'false',
        output: '2.5',
        why: 'Not a member; the second arm matches because the total is at least 100 and the country is `"NL"`.',
      },
      {
        key: 'nl-small',
        total: '50m',
        country: '"NL"',
        member: 'false',
        output: '5',
        why: 'The total is below 100, so the second arm fails, and the third arm (any `"NL"` order) matches.',
      },
      {
        key: 'other-country',
        total: '250m',
        country: '"DE"',
        member: 'false',
        output: '15',
        why: 'Neither `"NL"` arm matches, so the discard gives the default of `15`.',
      },
    ].map((v) => ({
      key: v.key,
      code: `var order = new Order(${v.total}, ${v.country}, ${v.member});
Console.WriteLine(Shipping(order));

static decimal Shipping(Order o) => o switch
{
    { IsMember: true } => 0m,
    { Total: >= 100m, Country: "NL" } => 2.5m,
    { Country: "NL" } => 5m,
    _ => 15m,
};

record Order(decimal Total, string Country, bool IsMember);`,
      output: v.output,
      why: v.why,
    })),
  ),
  ...csOutputFamily(
    'cs-logical-patterns',
    4,
    ['In patterns, `not` binds tightest, then `and`, then `or`, like `!`, `&&` and `||`.'],
    [
      {
        key: 'and-or',
        code: `int[] values = [-3, 0, 7, 12, 40];
foreach (var v in values)
{
    if (v is > 0 and < 10 or 40) Console.WriteLine(v);
}`,
        output: '7\n40',
        why: '`and` binds tighter than `or`, so the pattern is `(> 0 and < 10) or 40`: `7` matches the first part and `40` the second.',
      },
      {
        key: 'not-group',
        code: `int[] values = [-3, 0, 7, 12, 40];
foreach (var v in values)
{
    if (v is not (> 0 and < 10)) Console.WriteLine(v);
}`,
        output: '-3\n0\n12\n40',
        why: 'The parentheses make `not` apply to the whole range: every value outside 1–9 matches.',
      },
      {
        key: 'not-and',
        code: `int[] values = [-3, 0, 7, 12, 40];
foreach (var v in values)
{
    if (v is not 0 and not 12) Console.WriteLine(v);
}`,
        output: '-3\n7\n40',
        why: '`not 0 and not 12` excludes exactly those two values.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-list-patterns',
    5,
    [
      'List patterns match on length and elements: `[]` is empty, `[var x]` one element, `..` any number of elements.',
    ],
    [
      {
        key: 'many',
        input: '[1, 2, 3]',
        output: 'starts with 1',
        why: 'Three elements whose ends differ: `[var first, .., var last] when first == last` fails its `when` clause, so the last arm matches.',
      },
      {
        key: 'same-ends',
        input: '[4, 9, 4]',
        output: 'same ends',
        why: 'The first and last elements are both `4`, so the guarded arm matches.',
      },
      {
        key: 'single',
        input: '[7]',
        output: 'one: 7',
        why: 'Exactly one element matches `[var only]`. (It is checked before `[var first, .., var last]`, which would otherwise match a single element too, with `first` and `last` both `7`.)',
      },
      { key: 'empty', input: '[]', output: 'empty', why: 'An empty array matches `[]`.' },
    ].map((v) => ({
      key: v.key,
      code: `Console.WriteLine(Classify(${v.input}));

static string Classify(int[] xs) => xs switch
{
    [] => "empty",
    [var only] => $"one: {only}",
    [var first, .., var last] when first == last => "same ends",
    [var first, ..] => $"starts with {first}",
};`,
      output: v.output,
      why: v.why,
    })),
  ),
];
