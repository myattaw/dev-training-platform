import type { QuestionSource } from '@pracstack/content-model';
import { csCodeChoiceFamily, csCompilesFamily, csConceptFamily, csOutputFamily } from './builders';

/*
 * C# collections, classes and inheritance, records and immutability. Every
 * snippet is compiled and run by the real C# runner (see builders.ts).
 */

// ---------------------------------------------------------------- Collections

export const collectionsFamilies: readonly QuestionSource[] = [
  ...csOutputFamily(
    'cs-array-list-basics',
    1,
    [
      'An array has a fixed length. A `List<T>` grows as you add items; its `Count` is how many items it holds.',
    ],
    [
      {
        key: 'capacity',
        code: `var list = new List<int>(10);
int[] array = new int[10];
Console.WriteLine(list.Count);
Console.WriteLine(array.Length);`,
        output: '0\n10',
        why: '`new List<int>(10)` only reserves room for 10 items (its capacity); the list is still empty, so `Count` is `0`. `new int[10]` creates 10 elements, all `0`, so `Length` is `10`. Confusing capacity with count is a common mistake.',
      },
      {
        key: 'spread',
        code: `int[] middle = [1, 2];
List<int> all = [0, .. middle, 3];
all.Add(4);
Console.WriteLine(all.Count);
Console.WriteLine(string.Join(",", all));`,
        output: '5\n0,1,2,3,4',
        why: 'The collection expression copies `0`, then every element of `middle` (the `..` spread), then `3` into a new list; `Add` appends `4`. The spread copies the elements, it does not nest the array as one item. An array could not grow like this: it has no `Add`.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-queue-stack-order',
    1,
    [
      'A queue is first in, first out; a stack is last in, first out. `Peek` looks at the next item without removing it.',
    ],
    [
      {
        key: 'both',
        code: `var queue = new Queue<string>();
var stack = new Stack<string>();
foreach (var job in new[] { "a", "b", "c" })
{
    queue.Enqueue(job);
    stack.Push(job);
}
Console.WriteLine(queue.Dequeue() + stack.Pop());
Console.WriteLine(queue.Peek() + stack.Peek());`,
        output: 'ac\nbb',
        why: '`Dequeue` removes the oldest item (`a`) and `Pop` the newest (`c`). After that, the next in the queue is `b`, and the top of the stack is also `b`. `Peek` does not remove anything.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-dictionary-access',
    2,
    [
      'The indexer throws when reading a missing key but overwrites when writing; `Add` throws on an existing key; `TryGetValue` never throws.',
    ],
    [
      {
        key: 'missing-key',
        code: `var prices = new Dictionary<string, decimal> { ["pen"] = 1.5m };
try
{
    Console.WriteLine(prices["ink"]);
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}`,
        output: 'KeyNotFoundException',
        why: 'Reading a key that is not in the dictionary throws `KeyNotFoundException`. It does not return `0` or `null`; use `TryGetValue` or `GetValueOrDefault` when a key may be missing.',
      },
      {
        key: 'try-get-value',
        code: `var prices = new Dictionary<string, decimal> { ["pen"] = 1.5m };
bool found = prices.TryGetValue("ink", out var price);
Console.WriteLine(found);
Console.WriteLine(price);`,
        output: 'False\n0',
        why: '`TryGetValue` reports a missing key by returning `false` and sets the `out` variable to the default of the value type (`0m`, printed as `0`). Check the return value: a default of `0` cannot tell “missing” apart from a real price of `0`.',
      },
      {
        key: 'add-vs-indexer',
        code: `var stock = new Dictionary<string, int>();
stock["pen"] = 1;
stock["pen"] = 5;
Console.WriteLine(stock["pen"]);
try
{
    stock.Add("pen", 9);
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}
Console.WriteLine(stock["pen"]);`,
        output: '5\nArgumentException\n5',
        why: 'Assigning through the indexer adds or overwrites, so `pen` ends up `5`. `Add` refuses an existing key and throws `ArgumentException`, leaving the old value in place.',
      },
    ],
  ),
  ...csConceptFamily(
    'cs-lookup-structure',
    2,
    'Think about how many elements each `Contains` call has to look at.',
    [
      {
        key: 'processed-ids',
        question:
          'An import checks each of 200,000 incoming order ids with `processed.Contains(id)`, where `processed` is a `List<int>` of 50,000 ids. It is slow. What is the best fix?',
        correct:
          'Keep the processed ids in a `HashSet<int>`: its `Contains` is O(1) on average instead of scanning the list',
        wrong: [
          'Sort the list first: `List<T>.Contains` then stops searching early',
          'Use an `int[]` instead of a `List<int>`: arrays have O(1) `Contains`',
          'Use `processed.Any(x => x == id)`, which LINQ turns into a hash lookup',
        ],
        why: '`List<T>.Contains` compares the value with every element until it finds it: O(n), so 200,000 × up to 50,000 comparisons. A `HashSet<T>` (or the keys of a `Dictionary<TKey,TValue>`) finds an item by its hash code in O(1) on average. Sorting does not help `Contains` (only `BinarySearch` uses the order), arrays scan just like lists, and `Any` is also a linear scan.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-set-operations',
    3,
    [
      '`HashSet<T>.Add` returns whether the item was new. Methods such as `IntersectWith` change the set they are called on.',
    ],
    [
      {
        key: 'add-returns-bool',
        code: `int[] ids = [4, 7, 4, 9, 7];
var seen = new HashSet<int>();
foreach (var id in ids)
{
    if (!seen.Add(id)) Console.WriteLine($"duplicate {id}");
}
Console.WriteLine(seen.Count);`,
        output: 'duplicate 4\nduplicate 7\n3',
        why: '`Add` does not throw on a duplicate (unlike `Dictionary.Add`): it returns `false` and leaves the set unchanged. That makes `if (!set.Add(x))` a one-step duplicate check, and the set ends with 3 distinct ids.',
      },
      {
        key: 'intersect-in-place',
        code: `var mine = new HashSet<string> { "csharp", "sql", "go" };
var yours = new HashSet<string> { "sql", "go", "rust" };
mine.IntersectWith(yours);
Console.WriteLine(string.Join(",", mine.Order()));
Console.WriteLine(yours.Count);`,
        output: 'go,sql\n3',
        why: '`IntersectWith` modifies `mine` in place, keeping only the items also in `yours`; `yours` is not changed. LINQ’s `Intersect`, by contrast, returns a new sequence and changes neither. The result is sorted before printing because a hash set’s order is not defined.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-modify-while-iterating',
    3,
    ['A `foreach` over a `List<T>` checks whether the list was changed since the loop started.'],
    [
      {
        key: 'foreach-remove',
        code: `var scores = new List<int> { 50, 80, 30, 90 };
try
{
    foreach (var s in scores)
    {
        if (s < 60) scores.Remove(s);
    }
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}
Console.WriteLine(scores.Count);`,
        output: 'InvalidOperationException\n3',
        why: 'Removing `50` works, but the list’s version changes, so the enumerator’s next `MoveNext` throws `InvalidOperationException` (“collection was modified”). Only one item was removed, so 3 remain. Use `RemoveAll`, iterate over a copy, or loop backwards with an index.',
      },
      {
        key: 'remove-all',
        code: `var scores = new List<int> { 50, 80, 30, 90 };
int removed = scores.RemoveAll(s => s < 60);
Console.WriteLine(removed);
Console.WriteLine(string.Join(",", scores));`,
        output: '2\n80,90',
        why: '`RemoveAll` removes every matching item in one pass and returns how many it removed, with no enumerator to invalidate. It is the safe way to filter a list in place.',
      },
    ],
  ),
  ...csCodeChoiceFamily(
    'cs-collection-parameter-types',
    4,
    'Ask what the method really needs from its argument, and what the caller might pass in.',
    [
      {
        key: 'array-as-collection',
        question: 'What happens when this runs, and why?',
        code: `string[] names = ["Ada", "Linus"];
try
{
    AddGuest(names);
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}

static void AddGuest(ICollection<string> people) => people.Add("guest");`,
        correct:
          'It prints `NotSupportedException`: arrays implement `ICollection<T>`, but they have a fixed size, so `Add` throws at run time',
        wrong: [
          'It does not compile: an array cannot be passed as an `ICollection<string>`',
          'It adds `"guest"` to a copy of the array, so `names` is unchanged and nothing is printed',
          'It resizes the array to three elements, like `Array.Resize`',
        ],
        why: '`T[]` implements `ICollection<T>` and `IList<T>`, so the call compiles, but the mutating members (`Add`, `Remove`, `Insert`) throw `NotSupportedException` because an array cannot change size. Accept `IReadOnlyCollection<T>` or `IEnumerable<T>` when you only read, and `List<T>` (or return a new collection) when you really need to add.',
      },
      {
        key: 'multiple-enumeration',
        question: 'This prints `15` and then `2`. What is the problem, and the best fix?',
        code: `int loads = 0;
Console.WriteLine(Average(LoadPrices()));
Console.WriteLine(loads);

IEnumerable<decimal> LoadPrices()
{
    loads++;
    yield return 10m;
    yield return 20m;
}

static decimal Average(IEnumerable<decimal> prices) => prices.Sum() / prices.Count();`,
        correct:
          '`Average` enumerates the sequence twice (`Sum` and `Count`), re-running the iterator; take an `IReadOnlyCollection<decimal>` (or call `ToList()` once) so the data is produced once',
        wrong: [
          '`Sum` copies the sequence into a list, and `Count` then copies it again; using `Count` before `Sum` fixes it',
          'Local functions run twice when they capture a variable; make `LoadPrices` static',
          'Decimal division evaluates its operands twice; cast to `double` first',
        ],
        why: 'An `IEnumerable<T>` may be lazy: every enumeration runs the producer again. `Sum` enumerates once and `Count()` enumerates again, so `loads` is `2` (with a database query or file read, that is double the work, and the two passes may even see different data). A parameter of type `IReadOnlyCollection<T>` or `IReadOnlyList<T>` says “give me materialized data with a count”, or the method can call `ToList()` once.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-sorting',
    4,
    [
      '`OrderBy` returns a new, stable sequence and leaves the source alone. A second `OrderBy` replaces the first ordering; `ThenBy` refines it.',
    ],
    [
      {
        key: 'stable',
        code: `var people = new List<(string Name, int Age)>
{
    ("Cy", 30), ("Al", 25), ("Bo", 30), ("Di", 25),
};
var byAge = people.OrderBy(p => p.Age);
Console.WriteLine(string.Join(" ", byAge.Select(p => p.Name)));
Console.WriteLine(people[0].Name);`,
        output: 'Al Di Cy Bo\nCy',
        why: '`OrderBy` is a stable sort: people with the same age keep their original order (Al before Di, Cy before Bo). It does not sort `people` itself, so `people[0]` is still Cy; `List<T>.Sort` would sort in place, and it is not guaranteed to be stable.',
      },
      {
        key: 'order-by-twice',
        code: `var people = new List<(string Name, int Age)>
{
    ("Cy", 30), ("Al", 25), ("Bo", 30), ("Di", 25),
};
var sorted = people.OrderBy(p => p.Age).OrderBy(p => p.Name);
Console.WriteLine(string.Join(" ", sorted.Select(p => p.Name)));`,
        output: 'Al Bo Cy Di',
        why: 'The second `OrderBy` sorts the whole sequence again by name, so the age ordering is lost (names are unique here, so it has no effect at all). To sort by age and then by name within an age, write `OrderBy(p => p.Age).ThenBy(p => p.Name)`.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-dictionary-initializers',
    4,
    [
      'A collection initializer `{ { k, v } }` calls `Add`; an index initializer `{ [k] = v }` uses the indexer setter.',
    ],
    [
      {
        key: 'add-form',
        code: `try
{
    var codes = new Dictionary<string, int> { { "nl", 31 }, { "de", 49 }, { "nl", 32 } };
    Console.WriteLine(codes.Count);
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}`,
        output: 'ArgumentException',
        why: 'Each `{ key, value }` pair is compiled into a call to `Add`, and `Add` throws `ArgumentException` for the duplicate `"nl"`. The dictionary is never assigned, so `Count` is never printed. The mistake compiles fine and only fails at run time.',
      },
      {
        key: 'index-form',
        code: `var codes = new Dictionary<string, int> { ["nl"] = 31, ["de"] = 49, ["nl"] = 32 };
Console.WriteLine(codes.Count);
Console.WriteLine(codes["nl"]);`,
        output: '2\n32',
        why: '`[key] = value` uses the indexer, which overwrites silently: the last value for `"nl"` wins and there are two keys. No exception, but a duplicate in the data goes unnoticed, which can hide a bug.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-dictionary-enumeration-mutation',
    5,
    [
      'Since .NET Core 3.0, `Dictionary` lets you remove entries (or overwrite existing keys) while enumerating it, but not add new keys.',
    ],
    [
      {
        key: 'remove',
        code: `var stock = new Dictionary<string, int> { ["apple"] = 0, ["pear"] = 3, ["plum"] = 0 };
try
{
    foreach (var (name, qty) in stock)
    {
        if (qty == 0) stock.Remove(name);
    }
    Console.WriteLine(stock.Count);
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}`,
        output: '1',
        why: 'Unlike `List<T>`, a `Dictionary` on modern .NET allows `Remove` during enumeration: removing does not invalidate the enumerator, so both sold-out items are removed and 1 remains. On the old .NET Framework this threw; do not generalize the rule to other collections.',
      },
      {
        key: 'add',
        code: `var stock = new Dictionary<string, int> { ["apple"] = 0, ["pear"] = 3 };
try
{
    foreach (var name in stock.Keys)
    {
        stock[name + "-spare"] = 1;
    }
}
catch (Exception e)
{
    Console.WriteLine(e.GetType().Name);
}
Console.WriteLine(stock.Count);`,
        output: 'InvalidOperationException\n3',
        why: 'Adding a new key can reorganise the dictionary’s storage, so it invalidates any running enumerator: the first iteration adds `apple-spare`, and the next `MoveNext` throws `InvalidOperationException`. Only one key was added, so `Count` is 3. Collect the new entries first and add them after the loop.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-remove-in-for-loop',
    5,
    ['When `RemoveAt(i)` runs, every later element moves down one index.'],
    [
      {
        key: 'forward',
        code: `var numbers = new List<int> { 2, 4, 5, 6 };
for (int i = 0; i < numbers.Count; i++)
{
    if (numbers[i] % 2 == 0) numbers.RemoveAt(i);
}
Console.WriteLine(string.Join(",", numbers));`,
        output: '4,5',
        why: 'Removing `2` at index 0 shifts `4` to index 0, but `i` moves on to 1, so `4` is never checked. Then `6` (now at index 2) is removed. A forward index loop that removes skips the element after each removal; no exception warns you.',
      },
      {
        key: 'backward',
        code: `var numbers = new List<int> { 2, 4, 5, 6 };
for (int i = numbers.Count - 1; i >= 0; i--)
{
    if (numbers[i] % 2 == 0) numbers.RemoveAt(i);
}
Console.WriteLine(string.Join(",", numbers));`,
        output: '5',
        why: 'Looping backwards means a removal only shifts elements that were already checked, so every even number is removed. (`RemoveAll(n => n % 2 == 0)` does the same more clearly and in one pass.)',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Classes, interfaces and inheritance

export const oopFamilies: readonly QuestionSource[] = [
  ...csOutputFamily(
    'cs-computed-properties',
    1,
    [
      'An expression-bodied property (`=>`) is evaluated on every read; an auto-property initializer (`{ get; } = ...`) runs once.',
    ],
    [
      {
        key: 'computed-vs-stored',
        code: `var rect = new Rectangle(2, 3);
rect.Width = 10;
Console.WriteLine(rect.Area);
Console.WriteLine(rect.InitialArea);

class Rectangle(int width, int height)
{
    public int Width { get; set; } = width;
    public int Height { get; set; } = height;
    public int Area => Width * Height;
    public int InitialArea { get; } = width * height;
}`,
        output: '30\n6',
        why: '`Area => Width * Height` is computed each time it is read, so it sees the new width (10 × 3). `InitialArea { get; } = ...` stores a value once, when the object is created (2 × 3). The two look alike but behave very differently.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-interface-polymorphism',
    1,
    ['A call through an interface runs the implementation of the object’s actual class.'],
    [
      {
        key: 'shapes',
        code: `IShape[] shapes = [new Square(2), new Circle(1)];
foreach (var shape in shapes)
{
    Console.WriteLine($"{shape.Name}: {shape.Area():0.00}");
}

interface IShape
{
    string Name { get; }
    double Area();
}

class Square(double side) : IShape
{
    public string Name => "square";
    public double Area() => side * side;
}

class Circle(double radius) : IShape
{
    public string Name => "circle";
    public double Area() => Math.PI * radius * radius;
}`,
        output: 'square: 4.00\ncircle: 3.14',
        why: 'The loop only knows `IShape`, but each call runs the method of the real object: the square’s and then the circle’s `Area`. Code written against the interface works for any new shape without changes.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-constructor-chaining',
    2,
    [
      'A derived class’s constructor first runs a base constructor (the one named with `: base(...)`, or the parameterless one).',
    ],
    [
      {
        key: 'base-first',
        code: `var manager = new Manager("Ada");
Console.WriteLine(manager.Title);

class Employee
{
    public string Title { get; }

    public Employee(string name, string role)
    {
        Title = $"{name} ({role})";
        Console.WriteLine("Employee");
    }
}

class Manager : Employee
{
    public Manager(string name) : base(name, "manager") => Console.WriteLine("Manager");
}`,
        output: 'Employee\nManager\nAda (manager)',
        why: 'The base constructor runs before the derived constructor’s body, so `Employee` prints first. `: base(name, "manager")` chooses which base constructor runs and passes it arguments; without it, `Employee` would need a parameterless constructor.',
      },
      {
        key: 'primary-constructors',
        code: `var manager = new Manager("Grace");
Console.WriteLine(manager.Title);

class Employee(string name, string role)
{
    public string Title => $"{name} ({role})";
}

class Manager(string name) : Employee(name, "manager");`,
        output: 'Grace (manager)',
        why: 'With primary constructors, the base constructor call goes in the class header: `Manager(string name) : Employee(name, "manager")`. The `name` and `role` parameters are in scope in `Employee`’s members, so `Title` uses them.',
      },
    ],
  ),
  ...csCompilesFamily(
    'cs-access-modifiers',
    2,
    '`private` is visible only inside the declaring type, `protected` also in derived classes, `internal` anywhere in the same assembly.',
    [
      {
        key: 'private-outside',
        code: `var account = new Account();
account.balance = 100m;

class Account
{
    private decimal balance;
    public decimal Balance => balance;
}`,
        compiles: false,
        why: '`balance` is `private`, so only code inside `Account` can use it (CS0122). That is the point: callers go through members such as a `Deposit` method that can enforce the rules.',
      },
      {
        key: 'protected-derived',
        code: `var savings = new Savings();
savings.AddInterest();
Console.WriteLine(savings.Total);

class Account
{
    protected decimal Balance = 100m;
    public decimal Total => Balance;
}

class Savings : Account
{
    public void AddInterest() => Balance *= 1.02m;
}`,
        compiles: true,
        why: 'A `protected` member is accessible in derived classes, so `Savings` can update `Balance`. Code outside the hierarchy (like the top-level statements) still could not.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-static-members',
    2,
    ['A static field belongs to the type: there is one copy, shared by all instances.'],
    [
      {
        key: 'counter',
        code: `var a = new Ticket();
var b = new Ticket();
var c = new Ticket();
Console.WriteLine($"{a.Number} {c.Number} {Ticket.Issued}");

class Ticket
{
    public static int Issued;
    public int Number { get; } = ++Issued;
}`,
        output: '1 3 3',
        why: 'Every `new Ticket()` increments the single shared `Issued` counter and stores the result in that instance’s own `Number`. So the tickets get 1, 2 and 3, and `Ticket.Issued` (accessed through the type, not an instance) is 3.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-virtual-vs-new',
    3,
    [
      '`override` replaces the method for every caller. `new` only hides it: the variable’s compile-time type decides which method runs.',
    ],
    [
      {
        key: 'base-variable',
        code: `Animal pet = new Dog();
Console.WriteLine(pet.Speak());
Console.WriteLine(pet.Kind());

class Animal
{
    public virtual string Speak() => "...";
    public string Kind() => "animal";
}

class Dog : Animal
{
    public override string Speak() => "Woof";
    public new string Kind() => "dog";
}`,
        output: 'Woof\nanimal',
        why: '`Speak` is virtual and overridden, so the call is dispatched on the object’s run-time type: `Woof`. `Kind` is not virtual; `Dog` merely hides it with `new`, so through an `Animal` variable the compiler binds to `Animal.Kind`. Hiding is not polymorphism.',
      },
      {
        key: 'derived-variable',
        code: `Dog dog = new Dog();
Animal pet = dog;
Console.WriteLine(dog.Kind());
Console.WriteLine(pet.Kind());

class Animal
{
    public string Kind() => "animal";
}

class Dog : Animal
{
    public new string Kind() => "dog";
}`,
        output: 'dog\nanimal',
        why: 'The same object gives two answers. Hidden (`new`) methods are chosen by the variable’s declared type: `Dog` sees `Dog.Kind`, `Animal` sees `Animal.Kind`. This surprise is why hiding is rarely what you want.',
      },
      {
        key: 'base-call',
        code: `Animal pet = new Puppy();
Console.WriteLine(pet.Speak());

class Animal
{
    public virtual string Speak() => "...";
}

class Dog : Animal
{
    public override string Speak() => "Woof";
}

class Puppy : Dog
{
    public override string Speak() => base.Speak() + "!";
}`,
        output: 'Woof!',
        why: 'The most derived override (`Puppy.Speak`) runs even through an `Animal` variable. Inside it, `base.Speak()` calls the parent’s version (`Dog`’s), not the original in `Animal`, and is not dispatched virtually again.',
      },
    ],
  ),
  ...csCompilesFamily(
    'cs-abstract-sealed',
    3,
    'An abstract class cannot be instantiated directly; a sealed class cannot be inherited from.',
    [
      {
        key: 'new-abstract',
        code: `var shape = new Shape();

abstract class Shape
{
    public abstract double Area();
}`,
        compiles: false,
        why: 'An `abstract` class is incomplete (`Area` has no body), so `new Shape()` is an error (CS0144). Create a concrete derived class that overrides `Area`.',
      },
      {
        key: 'concrete-derived',
        code: `Shape shape = new Square(2);
Console.WriteLine(shape.Area());

abstract class Shape
{
    public abstract double Area();
}

class Square(double side) : Shape
{
    public override double Area() => side * side;
}`,
        compiles: true,
        why: 'The variable can have the abstract type; the object is a `Square`, which overrides every abstract member. That is how abstract classes are meant to be used.',
      },
      {
        key: 'inherit-sealed',
        code: `sealed class Money
{
    public decimal Amount { get; init; }
}

class Euro : Money
{
}`,
        compiles: false,
        why: '`sealed` forbids inheritance, so `Euro : Money` is an error (CS0509). Sealing is a deliberate design choice: it protects invariants and lets the runtime skip virtual dispatch.',
      },
    ],
  ),
  ...csCompilesFamily(
    'cs-default-interface-members',
    4,
    'A default interface member belongs to the interface, not to the classes that implement it.',
    [
      {
        key: 'through-class',
        code: `var logger = new ConsoleLogger();
logger.LogError("disk full");

interface ILogger
{
    void Log(string message);
    void LogError(string message) => Log($"ERROR: {message}");
}

class ConsoleLogger : ILogger
{
    public void Log(string message) => Console.WriteLine(message);
}`,
        compiles: false,
        why: '`ConsoleLogger` does not inherit the default `LogError`; it is only reachable through the interface. `logger` is typed as `ConsoleLogger`, so the call is an error (CS1061). Declare the variable as `ILogger`, or implement `LogError` in the class.',
      },
      {
        key: 'through-interface',
        code: `ILogger logger = new ConsoleLogger();
logger.LogError("disk full");

interface ILogger
{
    void Log(string message);
    void LogError(string message) => Log($"ERROR: {message}");
}

class ConsoleLogger : ILogger
{
    public void Log(string message) => Console.WriteLine(message);
}`,
        compiles: true,
        why: 'Through an `ILogger` variable the default implementation is available, and it calls the class’s `Log`. Default members let you add methods to an interface without breaking existing implementations.',
      },
    ],
  ),
  ...csConceptFamily(
    'cs-composition-over-inheritance',
    4,
    'Ask whether the relationship is “is a” or “has a / uses a”, and what callers can do through the inherited members.',
    [
      {
        key: 'engine',
        question:
          '`Car` inherits from `Engine` so it can call `Start()`. Now you need electric and petrol cars, and swapping a car’s engine. What is the better design?',
        correct:
          'Give `Car` an `IEngine` (composition): a car has an engine, which can be any implementation and replaced without a new subclass',
        wrong: [
          'Make `Engine` abstract and add `ElectricCar : Engine` and `PetrolCar : Engine`',
          'Mark `Start` as `virtual` so each kind of car can override it',
          'Hide `Start` with `new` in each car class',
        ],
        why: 'A car is not an engine; inheriting just to reuse code couples `Car` to one implementation and forces a subclass per combination. Holding an `IEngine` lets you pass any engine in (even change it at run time), test `Car` with a fake engine, and keeps both classes small.',
      },
      {
        key: 'undo-stack',
        question:
          '`class UndoStack : List<ICommand>` adds `Push` and `Pop` methods on top of the inherited list. What is the main problem?',
        correct:
          'Callers can also use every public `List<T>` member (`Insert`, `Sort`, `RemoveAt`…) and break the last-in-first-out rule; wrap a private list and expose only the stack operations',
        wrong: [
          '`List<T>` is sealed, so the class does not compile',
          'Inheriting from a generic class makes every call slower because of boxing',
          'There is no problem: inheriting from `List<T>` is the recommended way to build a custom collection',
        ],
        why: 'Inheritance exposes the whole public surface of the base class, so the subclass cannot protect its own rules. With composition the class owns a private `List<ICommand>` (or `Stack<ICommand>`) and decides exactly which operations exist. `List<T>` is not sealed, which is why this mistake compiles.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-virtual-call-in-constructor',
    5,
    [
      'Field initializers of the derived class run before the base constructor; the derived constructor body runs after it.',
    ],
    [
      {
        key: 'half-initialised',
        code: `var report = new Report();
report.Describe();

class Document
{
    public Document() => Describe();
    public virtual void Describe() { }
}

class Report : Document
{
    private readonly string _title = "Q3";
    private readonly string? _author;

    public Report() => _author = "Ada";

    public override void Describe() => Console.WriteLine($"{_title} by {_author ?? "null"}");
}`,
        output: 'Q3 by null\nQ3 by Ada',
        why: 'The base constructor calls the virtual `Describe`, which already dispatches to `Report.Describe`. At that moment `_title` is set (field initializers run before the base constructor), but `Report`’s constructor body has not run yet, so `_author` is still `null`. Avoid calling virtual members from constructors.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-interface-mapping',
    5,
    [
      'An interface call goes to the implementation the class mapped to that interface member, which is not always the method a class variable would call.',
    ],
    [
      {
        key: 'explicit',
        code: `IGreeter asInterface = new Robot();
var asRobot = new Robot();
Console.WriteLine(asInterface.Greet());
Console.WriteLine(asRobot.Greet());

interface IGreeter
{
    string Greet();
}

class Robot : IGreeter
{
    public string Greet() => "hello";
    string IGreeter.Greet() => "beep";
}`,
        output: 'beep\nhello',
        why: 'The explicit implementation `IGreeter.Greet` is used for calls through the interface; the public `Greet` is an ordinary class method. The same object answers differently depending on the variable’s type.',
      },
      {
        key: 'reimplemented',
        code: `IGreeter a = new Robot();
IGreeter b = new Droid();
Robot c = new Droid();
Console.WriteLine(a.Greet());
Console.WriteLine(b.Greet());
Console.WriteLine(c.Greet());

interface IGreeter
{
    string Greet();
}

class Robot : IGreeter
{
    public string Greet() => "robot";
}

class Droid : Robot, IGreeter
{
    public new string Greet() => "droid";
}`,
        output: 'robot\ndroid\nrobot',
        why: '`Droid` lists `IGreeter` again, so the interface is re-mapped to `Droid`’s own `Greet`: a call through `IGreeter` on a droid prints `droid`. Through a `Robot` variable the non-virtual `Robot.Greet` is bound at compile time, so it prints `robot`.',
      },
      {
        key: 'not-reimplemented',
        code: `IGreeter b = new Droid();
Droid d = new Droid();
Console.WriteLine(b.Greet());
Console.WriteLine(d.Greet());

interface IGreeter
{
    string Greet();
}

class Robot : IGreeter
{
    public string Greet() => "robot";
}

class Droid : Robot
{
    public new string Greet() => "droid";
}`,
        output: 'robot\ndroid',
        why: 'The interface was mapped to `Robot.Greet` when `Robot` implemented it. `Droid` only hides that method with `new` and does not re-implement `IGreeter`, so interface calls still reach `Robot.Greet`. Make `Greet` virtual and override it if the derived class should take over.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-new-virtual-chain',
    5,
    [
      '`new virtual` starts a new virtual slot; an `override` further down only overrides the slot it inherits.',
    ],
    [
      {
        key: 'four-levels',
        code: `A a = new D();
B b = new D();
C c = new D();
Console.WriteLine($"{a.Name()} {b.Name()} {c.Name()}");

class A { public virtual string Name() => "A"; }
class B : A { public override string Name() => "B"; }
class C : B { public new virtual string Name() => "C"; }
class D : C { public override string Name() => "D"; }`,
        output: 'B B D',
        why: '`C.Name` is `new virtual`: it hides `B.Name` and starts a separate virtual method, which `D` overrides. Calls through `A` or `B` use the original method, whose most derived override is `B.Name`; only a call through `C` (or `D`) reaches `D.Name`.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Records, structs and immutability

export const recordsImmutabilityFamilies: readonly QuestionSource[] = [
  ...csOutputFamily(
    'cs-record-tostring',
    1,
    ['Records generate a `ToString` that lists their public properties.'],
    [
      {
        key: 'point',
        code: `var p = new Point(1, 2);
Console.WriteLine(p);

record Point(int X, int Y);`,
        output: 'Point { X = 1, Y = 2 }',
        why: 'A record’s generated `ToString` prints the type name and its public properties in braces. A plain class would print just its type name, `Point`.',
      },
      {
        key: 'decimal',
        code: `var pen = new Product("Pen", 1.50m);
Console.WriteLine(pen);

record Product(string Name, decimal Price);`,
        output: 'Product { Name = Pen, Price = 1.50 }',
        why: 'Each property is printed with its own `ToString`: strings without quotes, and a `decimal` keeps the scale it was written with (`1.50m` prints as `1.50`).',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-with-expression',
    2,
    ['`with` creates a copy with some properties changed; the original is not modified.'],
    [
      {
        key: 'original-unchanged',
        code: `var original = new Point(1, 2);
var moved = original with { X = 10 };
Console.WriteLine(original);
Console.WriteLine(moved);

record Point(int X, int Y);`,
        output: 'Point { X = 1, Y = 2 }\nPoint { X = 10, Y = 2 }',
        why: '`with` is non-destructive mutation: it copies `original` and then sets `X` on the copy. `original` keeps its values; this is how immutable records are “changed”.',
      },
      {
        key: 'empty-with',
        code: `var a = new Point(1, 2);
var b = a with { };
Console.WriteLine(a == b);
Console.WriteLine(ReferenceEquals(a, b));

record Point(int X, int Y);`,
        output: 'True\nFalse',
        why: '`with { }` still makes a new object, so the references differ. The copy has the same values, and records compare by value, so `==` is `true`.',
      },
    ],
  ),
  ...csCompilesFamily(
    'cs-init-only-readonly',
    2,
    '`init` accessors can be set during object creation only; `readonly` fields only in a constructor or initializer.',
    [
      {
        key: 'set-after',
        code: `var user = new User { Name = "Ada" };
user.Name = "Grace";

class User
{
    public string Name { get; init; } = "";
}`,
        compiles: false,
        why: 'An `init` accessor can only be used in an object initializer, a `with` expression or a constructor. Assigning afterwards is an error (CS8852). Use `user with { Name = "Grace" }` on a record, or make a new object.',
      },
      {
        key: 'initializer',
        code: `var user = new User { Name = "Ada" };
Console.WriteLine(user.Name);

class User
{
    public string Name { get; init; } = "";
}`,
        compiles: true,
        why: 'Setting an `init` property in the object initializer is exactly what `init` allows. After construction the property is read-only.',
      },
      {
        key: 'readonly-field',
        code: `var config = new Config();
config.Reset();

class Config
{
    private readonly int _retries = 3;
    public void Reset() => _retries = 0;
}`,
        compiles: false,
        why: 'A `readonly` field can be assigned only in its initializer or a constructor of the same class. Assigning it in an ordinary method is an error (CS0191).',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-record-struct',
    3,
    [
      'A `record struct` is a value type: assignment copies it. Positional record structs get `get; set;` properties unless declared `readonly`.',
    ],
    [
      {
        key: 'copy',
        code: `var a = new Point(1, 2);
var b = a;
b.X = 5;
Console.WriteLine(a);
Console.WriteLine(b);

record struct Point(int X, int Y);`,
        output: 'Point { X = 1, Y = 2 }\nPoint { X = 5, Y = 2 }',
        why: 'A `record struct` is copied on assignment, so changing `b` does not affect `a`. Its positional properties are settable (unlike a `record class`, whose positional properties are `init`); declare a `readonly record struct` to make it immutable.',
      },
      {
        key: 'list-element',
        code: `var points = new List<Point> { new(1, 2) };
var first = points[0];
first.X = 9;
Console.WriteLine(points[0]);

record struct Point(int X, int Y);`,
        output: 'Point { X = 1, Y = 2 }',
        why: '`points[0]` returns a copy of the struct, so `first` is independent of the element in the list. To change the stored value, assign it back: `points[0] = first;` or `points[0] = points[0] with { X = 9 };`.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-positional-deconstruction',
    3,
    [
      'Positional records get a `Deconstruct` method, which deconstruction and positional patterns use.',
    ],
    [
      {
        key: 'positional-pattern',
        code: `var (name, _) = new Product("Pen", 2.5m);
Console.WriteLine(name);

Product[] items = [new("Pen", 2.5m), new("Book", 12m), new("Bag", 30m), new("Book", 3m)];
foreach (var item in items)
{
    Console.WriteLine(item switch
    {
        (_, < 5m) => "cheap",
        ("Book", _) => "book",
        _ => "other",
    });
}

record Product(string Name, decimal Price);`,
        output: 'Pen\ncheap\nbook\nother\ncheap',
        why: '`var (name, _) = ...` calls the generated `Deconstruct` and discards the price. The positional patterns match in the same order as the record’s parameters, and arms are tried top to bottom: the 3-euro book is caught by `(_, < 5m)` before the `("Book", _)` arm is reached.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-record-mutable-members',
    4,
    [
      'Record equality compares each field with its own `Equals`; a mutable record that is used as a key can get lost.',
    ],
    [
      {
        key: 'list-member',
        code: `var a = new Order(1, new List<string> { "pen" });
var b = new Order(1, new List<string> { "pen" });
Console.WriteLine(a == b);

record Order(int Id, List<string> Lines);`,
        output: 'False',
        why: 'Value equality is only one level deep: the `Lines` fields are compared with `List<string>.Equals`, which is reference equality. Two different lists with the same contents make the records unequal. Use an immutable value-like type, or write your own `Equals`, if contents should count.',
      },
      {
        key: 'mutated-key',
        code: `var item = new Item("pen") { Qty = 1 };
var set = new HashSet<Item> { item };
item.Qty = 2;
Console.WriteLine(set.Contains(item));
Console.WriteLine(set.Count);

record Item(string Sku)
{
    public int Qty { get; set; }
}`,
        output: 'False\n1',
        why: 'The record’s hash code includes `Qty`. After the change, the set looks for `item` under its new hash code and does not find it, even though the very same object is inside (`Count` is still 1). Keep records used as keys immutable.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-with-shallow-copy',
    4,
    [
      '`with` copies each field as it is: for a reference-type field, the copy points to the same object.',
    ],
    [
      {
        key: 'shared-list',
        code: `var a = new Cart("ada", new List<string> { "pen" });
var b = a with { Owner = "grace" };
b.Items.Add("ink");
Console.WriteLine(a.Items.Count);
Console.WriteLine(ReferenceEquals(a.Items, b.Items));

record Cart(string Owner, List<string> Items);`,
        output: '2\nTrue',
        why: '`with` makes a shallow copy: `b.Items` is the same `List` object as `a.Items`, so adding through `b` also changes `a`’s cart. Copying a record does not copy what its fields point to.',
      },
      {
        key: 'copied-list',
        code: `var a = new Cart("ada", new List<string> { "pen" });
var b = a with { Owner = "grace", Items = [.. a.Items] };
b.Items.Add("ink");
Console.WriteLine(a.Items.Count);
Console.WriteLine(b.Items.Count);

record Cart(string Owner, List<string> Items);`,
        output: '1\n2',
        why: 'Setting `Items = [.. a.Items]` in the `with` gives the copy its own new list, so the carts are independent. Without that explicit copy the list would be shared.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-record-inheritance',
    5,
    [
      'Records compare their run-time type (`EqualityContract`) too, and `with` copies the object’s actual type through a virtual clone method.',
    ],
    [
      {
        key: 'equality-contract',
        code: `Animal a = new Animal("Rex");
Animal d = new Dog("Rex");
Console.WriteLine(a == d);
Console.WriteLine(d);

record Animal(string Name);
record Dog(string Name) : Animal(Name);`,
        output: 'False\nDog { Name = Rex }',
        why: 'Both have `Name = "Rex"` and both variables are typed `Animal`, yet they are not equal: record equality also requires the same run-time type, so an `Animal` never equals a `Dog`. `ToString` is virtual, so it prints `Dog`.',
      },
      {
        key: 'with-keeps-type',
        code: `Animal pet = new Dog("Rex", true);
var renamed = pet with { Name = "Max" };
Console.WriteLine(renamed);
Console.WriteLine(renamed.GetType().Name);

record Animal(string Name);
record Dog(string Name, bool Good) : Animal(Name);`,
        output: 'Dog { Name = Max, Good = True }\nDog',
        why: 'Although `pet` is typed `Animal`, `with` clones the real object, a `Dog`, so `Good` is kept. Only properties visible on `Animal` can be set in the `with`, but nothing is sliced off.',
      },
    ],
  ),
  ...csOutputFamily(
    'cs-shallow-immutability',
    5,
    [
      '`readonly`, `IReadOnlyList<T>` and `init` stop reassignment through that member; they do not make the object it points to immutable.',
    ],
    [
      {
        key: 'read-only-view',
        code: `var tags = new List<string> { "csharp" };
var post = new Post("Records", tags);
tags.Add("dotnet");
Console.WriteLine(post.Tags.Count);

record Post(string Title, IReadOnlyList<string> Tags);`,
        output: '2',
        why: '`IReadOnlyList<string>` is only a read-only view: the record stores the caller’s `List`, and the caller can still change it. The “immutable” record changes under you. Copy the data on the way in (for example into an immutable collection).',
      },
      {
        key: 'immutable-copy',
        code: `using System.Collections.Immutable;

var tags = new List<string> { "csharp" };
var post = new Post("Records", [.. tags]);
tags.Add("dotnet");
Console.WriteLine(post.Tags.Length);

record Post(string Title, ImmutableArray<string> Tags);`,
        output: '1',
        why: 'The collection expression copies the tags into a new `ImmutableArray<string>`, which nobody can change afterwards; the later `Add` only affects the original list. Immutable collections (`ImmutableArray`, `ImmutableList`, frozen collections) give real immutability, not just a read-only view.',
      },
      {
        key: 'readonly-field',
        code: `var team = new Team();
team.Members.Add("Ada");
Console.WriteLine(team.Members.Count);

class Team
{
    public readonly List<string> Members = ["Linus"];
}`,
        output: '2',
        why: '`readonly` only stops the field from being assigned a different list. The list itself is mutable, so anyone can `Add` to it. Expose an `IReadOnlyList<string>` over a private list, or an immutable collection, to protect it.',
      },
    ],
  ),
];
