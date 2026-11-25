import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Control flow, functions (arguments, defaults, scope, lambda) and comprehensions.
 */

const b = programBuilders('python');

// ---------------------------------------------------------------- Control flow

export const controlFlowFamilies: readonly QuestionSource[] = [
  ...b.output(
    'py-range',
    1,
    [
      '`range(stop)` starts at 0; `range(start, stop, step)` never includes `stop`.',
      'A negative step counts down, still stopping before `stop`.',
    ],
    [
      {
        key: 'basic',
        code: `print(list(range(4)))
print(list(range(2, 10, 3)))`,
        output: '[0, 1, 2, 3]\n[2, 5, 8]',
        why: '`range(4)` gives four numbers starting at 0 and stops before 4. `range(2, 10, 3)` starts at 2 and adds 3 while the value stays below 10: 2, 5, 8.',
      },
      {
        key: 'countdown',
        code: `for n in range(5, 0, -2):
    print(n, end=" ")
print()
print(len(range(10, 0)))`,
        output: '5 3 1 \n0',
        why: 'With step `-2` the range counts down from 5 and stops before reaching 0. `range(10, 0)` has the default step `+1`, so it is empty: it does not count down automatically.',
      },
      {
        key: 'sum',
        code: `total = 0
for i in range(1, 5):
    total += i
print(total)`,
        output: '10',
        why: '`range(1, 5)` is 1, 2, 3, 4 (5 is excluded), which sums to 10. Use `range(1, n + 1)` to include `n`.',
      },
    ],
  ),
  ...b.outputChoice(
    'py-break-continue',
    1,
    '`continue` skips to the next iteration; `break` leaves the loop entirely.',
    [
      {
        key: 'both',
        code: `for n in range(1, 8):
    if n % 2 == 0:
        continue
    if n > 5:
        break
    print(n, end=" ")`,
        correct: '1 3 5',
        wrong: ['1 3 5 7', '1 2 3 4 5', '2 4'],
        why: 'Even numbers are skipped by `continue`. Odd numbers up to 5 are printed; at 7 the `break` ends the loop before printing.',
      },
      {
        key: 'while',
        code: `count = 0
while True:
    count += 1
    if count == 3:
        continue
    if count > 4:
        break
    print(count, end=" ")`,
        correct: '1 2 4',
        wrong: ['1 2 3 4', '1 2', '1 2 4 5'],
        why: 'At `count == 3` the `continue` jumps back to the top without printing. At 5 the `break` ends the loop. `while True` with an explicit `break` is the usual Python form of a do-while loop.',
      },
    ],
  ),
  ...b.output(
    'py-enumerate-zip',
    2,
    [
      '`enumerate` yields `(index, item)` pairs and accepts a `start` value.',
      '`zip` pairs items position by position and stops at the shortest input.',
    ],
    [
      {
        key: 'enumerate-start',
        code: `for rank, name in enumerate(["ana", "ben", "cai"], start=1):
    print(f"{rank}. {name}")`,
        output: '1. ana\n2. ben\n3. cai',
        why: '`enumerate` produces a counter alongside each item; `start=1` makes the counter begin at 1 instead of 0. This replaces `range(len(...))` indexing.',
      },
      {
        key: 'zip-shortest',
        code: `names = ["ana", "ben", "cai"]
scores = [90, 85]
for name, score in zip(names, scores):
    print(name, score)
print(dict(zip(names, scores)))`,
        output: "ana 90\nben 85\n{'ana': 90, 'ben': 85}",
        why: '`zip` stops when the shortest input runs out, so `"cai"` is silently dropped. `dict(zip(keys, values))` is a common way to build a dict from two lists.',
      },
      {
        key: 'unzip',
        code: `pairs = [("x", 1), ("y", 2), ("z", 3)]
letters, numbers = zip(*pairs)
print(letters, sum(numbers))`,
        output: "('x', 'y', 'z') 6",
        why: '`zip(*pairs)` passes each pair as a separate argument, so `zip` regroups the first items and the second items: it transposes the data. The results are tuples.',
      },
    ],
  ),
  ...b.outputChoice(
    'py-loop-variable-rebinding',
    2,
    'The loop variable is a name bound to each item in turn; reassigning it does not touch the iterable.',
    [
      {
        key: 'double-items',
        code: `prices = [10, 20, 30]
for p in prices:
    p = p * 2
print(prices)`,
        correct: '[10, 20, 30]',
        wrong: ['[20, 40, 60]', '[10, 20, 60]', 'TypeError'],
        why: '`p = p * 2` rebinds the local name `p` to a new int; the list still holds the original objects. Build a new list (`[p * 2 for p in prices]`) or assign by index with `enumerate`.',
      },
      {
        key: 'skip-ahead',
        code: `for i in range(4):
    print(i, end=" ")
    i += 10`,
        correct: '0 1 2 3',
        wrong: ['0 11', '0', '0 10 20 30'],
        why: 'Each iteration rebinds `i` to the next value from the range, discarding whatever the body did to it. To skip items, use `continue` or a `while` loop with a manual counter.',
      },
      {
        key: 'mutate-dicts',
        code: `rows = [{"qty": 1}, {"qty": 2}]
for row in rows:
    row["qty"] *= 10
print(rows)`,
        correct: "[{'qty': 10}, {'qty': 20}]",
        wrong: ["[{'qty': 1}, {'qty': 2}]", "[{'qty': 10}, {'qty': 2}]", 'TypeError'],
        why: 'Here the loop variable refers to each dict, and `row["qty"] *= 10` mutates that dict, so the change is visible in `rows`. Rebinding a name has no effect outside, but mutating the object it refers to does.',
      },
    ],
  ),
  ...b.blank(
    'py-while-loop',
    2,
    'A `while` loop repeats as long as its condition is true; the body must move toward ending it.',
    [
      {
        key: 'halve',
        prompt: 'Complete the loop so it counts how many times `n` can be halved (integer division) before it reaches 1.',
        template: `n = 40
steps = 0
while n {{blank:op}} 1:
    n {{blank:upd}} 2
    steps += 1
print(steps)
assert steps == 5`,
        blanks: { op: ['>'], upd: ['//='] },
        why: '40, 20, 10, 5, 2, 1: five halvings. The loop runs while `n > 1` and `n //= 2` keeps `n` an int. `/=` would turn `n` into a float (5.0, 2.5, 1.25, 0.625…) and count 6 steps, and `>=` would run one extra pass (1 becomes 0), counting 6.',
      },
      {
        key: 'retry',
        prompt: 'Complete the retry loop so it stops after a success or after three attempts.',
        template: `results = iter([False, False, True, True])
attempts = 0
ok = False
while not ok {{blank:kw}} attempts < 3:
    ok = next(results)
    attempts += 1
print(attempts, ok)
assert (attempts, ok) == (3, True)`,
        blanks: { kw: ['and'] },
        why: 'The loop must continue only while both conditions hold: not yet successful and attempts remaining. With `or`, it would keep going after a success until three attempts were used, or keep retrying forever while failing.',
      },
    ],
  ),
  ...b.output(
    'py-for-else',
    3,
    [
      'A loop’s `else` block runs when the loop ends without `break`.',
      'It runs even if the loop body never executed.',
    ],
    [
      {
        key: 'search-found',
        code: `for n in [3, 7, 12, 5]:
    if n % 2 == 0:
        print("first even:", n)
        break
else:
    print("no even number")`,
        output: 'first even: 12',
        why: 'The loop breaks at 12, so the `else` block is skipped. `for`/`else` reads as "if no break".',
      },
      {
        key: 'search-missing',
        code: `for n in [3, 7, 5]:
    if n % 2 == 0:
        print("first even:", n)
        break
else:
    print("no even number")`,
        output: 'no even number',
        why: 'The loop ran to the end without `break`, so the `else` block runs. It is not related to the `if` inside the loop.',
      },
      {
        key: 'empty',
        code: `attempts = 0
while attempts > 0:
    attempts -= 1
else:
    print("else ran")
for item in []:
    break
else:
    print("else ran again")`,
        output: 'else ran\nelse ran again',
        why: 'Neither loop body ever runs, so neither loop can `break`, and both `else` blocks run. `while` supports `else` the same way as `for`.',
      },
    ],
  ),
  ...b.codeChoice(
    'py-loop-bugs',
    3,
    'Check where the loop starts, where it stops and what changes on every pass.',
    [
      {
        key: 'pairs-off-by-one',
        question:
          'The function should return the differences between consecutive readings: `[2, 5, -3]` for `[10, 12, 17, 14]`. It prints only two values. What is the fix?',
        code: `def deltas(readings):
    result = []
    for i in range(1, len(readings) - 1):
        result.append(readings[i] - readings[i - 1])
    return result

print(deltas([10, 12, 17, 14]))`,
        correct:
          'Use `range(1, len(readings))`, or iterate over `zip(readings, readings[1:])`',
        wrong: [
          'Use `range(0, len(readings) - 1)` so the first pair is included',
          'Use `range(1, len(readings) + 1)` so the last pair is included',
          'Use `readings[i + 1] - readings[i]` with the same range',
        ],
        why: '`range` already excludes its end, so `- 1` drops the last pair. `+ 1` would index past the end (`IndexError`), and starting at 0 makes `readings[-1]` wrap around to the last item. `zip(readings, readings[1:])` avoids index arithmetic altogether.',
      },
      {
        key: 'while-no-progress',
        question:
          'This loop should print the digits of `n` from right to left, but in the original code the `n //= 10` line was indented one level less, outside the loop. What would happen?',
        code: `n = 472
while n > 0:
    print(n % 10, end=" ")
    n //= 10
print()`,
        correct: 'The loop would never end, printing `2` forever, because `n` never changes inside the loop',
        wrong: [
          'It would print `2 7 4` and then the update would run once',
          'Python would raise `IndentationError` because the loop body must end with an assignment',
          'It would print nothing because the condition is checked after the body',
        ],
        why: 'Indentation defines the loop body. With the update outside, the condition `n > 0` stays true forever and the body prints `2` endlessly. The corrected code shown prints `2 7 4`.',
      },
    ],
  ),
  ...b.fails(
    'py-zip-strict',
    4,
    '`zip` silently truncates to the shortest input unless you ask it not to.',
    [
      {
        key: 'strict',
        question: 'Why does this program fail, and why is that useful?',
        code: `skus = ["A1", "B2", "C3"]
prices = [9.5, 4.0]
catalog = dict(zip(skus, prices, strict=True))
print(catalog)`,
        error: 'ValueError',
        correct:
          '`strict=True` makes `zip` raise `ValueError` when the inputs have different lengths, instead of silently dropping `"C3"`',
        wrong: [
          '`zip` cannot be passed to `dict`; a dict comprehension is required',
          '`strict=True` requires all values to have the same type',
          'Without `strict`, the missing price would be filled with `None`',
        ],
        why: 'Since Python 3.10, `zip(..., strict=True)` checks that all inputs end together and raises `ValueError` otherwise. Without it, `zip` stops at the shortest input. Padding with a fill value is `itertools.zip_longest`, not plain `zip`.',
      },
      {
        key: 'unpack-mismatch',
        question: 'Why does this loop fail?',
        code: `rows = [("ana", 90), ("ben", 85, "late")]
for name, score in rows:
    print(name, score)`,
        error: 'ValueError',
        correct:
          'The second tuple has three items and cannot be unpacked into two names, so it raises `ValueError: too many values to unpack`',
        wrong: [
          'The extra item is ignored and both rows print',
          'It raises `IndexError` because the tuple is too long',
          'It raises `TypeError` because tuples cannot be unpacked in a loop header',
        ],
        why: 'Unpacking requires exactly as many targets as items. Use `name, score, *rest = row` when records may carry extra fields. The first row prints before the error.',
      },
    ],
  ),
  ...b.output(
    'py-walrus-loops',
    4,
    [
      '`:=` assigns and returns the value in the same expression.',
      'It is handy in `while` conditions that read the next chunk or line.',
    ],
    [
      {
        key: 'read-chunks',
        code: `import io
stream = io.StringIO("abcdefgh")
chunks = []
while chunk := stream.read(3):
    chunks.append(chunk)
print(chunks)`,
        output: "['abc', 'def', 'gh']",
        why: '`stream.read(3)` returns up to three characters and an empty string at the end. The walrus assigns the chunk and tests it in one step; the empty string is falsy and ends the loop.',
      },
      {
        key: 'comprehension',
        code: `def parse(text):
    return int(text) if text.isdigit() else None

raw = ["3", "x", "10"]
values = [v for t in raw if (v := parse(t)) is not None]
print(values)`,
        output: '[3, 10]',
        why: 'The walrus stores each parsed value in `v` while the filter checks it, so `parse` runs once per item instead of once in the filter and again in the expression.',
      },
    ],
  ),
  ...b.output(
    'py-nested-loop-break',
    5,
    [
      '`break` leaves only the innermost loop.',
      'An `else` on the inner loop runs only when the inner loop did not break.',
    ],
    [
      {
        key: 'inner-only',
        code: `for i in range(3):
    for j in range(3):
        if j == 1:
            break
        print(i, j)`,
        output: '0 0\n1 0\n2 0',
        why: 'The `break` exits the inner loop only, so the outer loop moves on to the next `i` each time. Python has no labeled break.',
      },
      {
        key: 'else-continue',
        code: `grid = [[1, 2], [3, 0], [5, 6]]
for r, row in enumerate(grid):
    for value in row:
        if value == 0:
            break
    else:
        continue
    print("zero in row", r)
    break`,
        output: 'zero in row 1',
        why: 'When the inner loop finishes without `break`, its `else: continue` moves to the next row. When it breaks (a zero was found), execution falls through to the `print` and the outer `break`. A helper function with `return` is usually clearer.',
      },
      {
        key: 'leak',
        code: `for i in range(3):
    pass
print(i)
try:
    for k in []:
        pass
    print(k)
except NameError:
    print("NameError")`,
        output: '2\nNameError',
        why: 'A `for` loop does not create its own scope, so `i` keeps its last value after the loop. If the iterable is empty, the loop variable is never assigned, and reading it raises `NameError`.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Functions

export const functionsFamilies: readonly QuestionSource[] = [
  ...b.outputChoice(
    'py-return-none',
    1,
    'A function without a `return` statement returns `None`.',
    [
      {
        key: 'print-not-return',
        code: `def add(a, b):
    print(a + b)

result = add(2, 3)
print(result)`,
        correct: '5\nNone',
        wrong: ['5\n5', '5', 'None'],
        why: '`add` prints `5` but returns nothing, so the call evaluates to `None`. Printing is output for a human; `return` gives a value back to the caller.',
      },
      {
        key: 'early-return',
        code: `def sign(n):
    if n > 0:
        return "positive"
    elif n < 0:
        return "negative"

print(sign(4), sign(0))`,
        correct: 'positive None',
        wrong: ['positive negative', 'positive zero', 'positive'],
        why: 'For `0` neither branch returns, so the function falls off the end and returns `None`. Make every path return a value.',
      },
      {
        key: 'bare-return',
        code: `def first_negative(values):
    for v in values:
        if v < 0:
            return v
    return

print(first_negative([3, -2, -5]), first_negative([1, 2]))`,
        correct: '-2 None',
        wrong: ['-5 None', '-2 0', '[-2, -5] None'],
        why: '`return v` ends the function at the first negative value. A bare `return` returns `None`, just like reaching the end of the body.',
      },
    ],
  ),
  ...b.output(
    'py-keyword-arguments',
    1,
    [
      'Keyword arguments are matched by name, so their order does not matter.',
      'Parameters with defaults can be skipped.',
    ],
    [
      {
        key: 'reorder',
        code: `def describe(name, role="dev", level=1):
    return f"{name}/{role}/{level}"

print(describe("ana"))
print(describe("ben", level=3))
print(describe(level=2, name="cai", role="ops"))`,
        output: 'ana/dev/1\nben/dev/3\ncai/ops/2',
        why: 'Missing arguments take their defaults. Keyword arguments can skip `role` and set `level` directly, and when every argument is named, their order is irrelevant.',
      },
      {
        key: 'mixed',
        code: `def price(amount, tax=0.2, discount=0):
    return round(amount * (1 + tax) - discount, 2)

print(price(100, 0.1))
print(price(100, discount=5))`,
        output: '110.0\n115.0',
        why: 'The second positional argument fills `tax` (0.1). In the second call `tax` keeps its default 0.2 and only `discount` is set by name.',
      },
    ],
  ),
  ...b.output(
    'py-lambda',
    2,
    [
      'A `lambda` is a small anonymous function whose body is a single expression.',
      '`sorted`, `min` and `max` accept a `key` function.',
    ],
    [
      {
        key: 'sort-key',
        code: `people = [("ana", 31), ("ben", 25), ("cai", 31)]
print(sorted(people, key=lambda p: p[1]))`,
        output: "[('ben', 25), ('ana', 31), ('cai', 31)]",
        why: 'The key extracts the age. Python’s sort is stable, so the two people aged 31 stay in their original order.',
      },
      {
        key: 'dispatch',
        code: `ops = {
    "add": lambda a, b: a + b,
    "pow": lambda a, b: a ** b,
}
print(ops["pow"](2, 5), ops["add"]("a", "b"))`,
        output: '32 ab',
        why: 'Lambdas are ordinary function objects and can be stored in a dict. `ops["pow"]` is the function; `(2, 5)` calls it.',
      },
      {
        key: 'max-key',
        code: `words = ["kiwi", "banana", "fig", "cherry"]
print(max(words, key=len), min(words, key=lambda w: w[-1]))`,
        output: 'banana banana',
        why: '`max` with `key=len` returns the first longest word (`banana`, 6 letters, ahead of `cherry`). `min` by last letter compares `i`, `a`, `g`, `y`, so `banana` wins again. The key decides the comparison, but the original item is returned.',
      },
    ],
  ),
  ...b.output(
    'py-args-kwargs',
    2,
    [
      '`*args` collects extra positional arguments into a tuple; `**kwargs` collects extra keyword arguments into a dict.',
      'At the call site, `*` and `**` unpack a sequence and a mapping into arguments.',
    ],
    [
      {
        key: 'collect',
        code: `def log(level, *args, **kwargs):
    print(level, args, kwargs)

log("info", 1, 2, user="ana")
log("debug")`,
        output: "info (1, 2) {'user': 'ana'}\ndebug () {}",
        why: '`level` takes the first argument, `args` gets the remaining positional ones as a tuple and `kwargs` gets keyword arguments as a dict. With no extras, they are an empty tuple and an empty dict.',
      },
      {
        key: 'unpack-call',
        code: `def area(width, height, unit="cm"):
    return f"{width * height} {unit}"

size = (3, 4)
options = {"unit": "m"}
print(area(*size, **options))`,
        output: '12 m',
        why: '`*size` passes `3` and `4` as positional arguments and `**options` passes `unit="m"` as a keyword argument.',
      },
      {
        key: 'forward',
        code: `def greet(name, punctuation="!"):
    return "Hi " + name + punctuation

def shout(*args, **kwargs):
    return greet(*args, **kwargs).upper()

print(shout("ana", punctuation="?"))`,
        output: 'HI ANA?',
        why: 'A wrapper that accepts `*args, **kwargs` and passes them on with the same syntax forwards every argument unchanged. Decorators rely on this pattern.',
      },
    ],
  ),
  ...b.fails(
    'py-call-errors',
    2,
    'Read the last line of the traceback: it names the parameter that could not be bound.',
    [
      {
        key: 'multiple-values',
        question: 'Why does this call fail?',
        code: `def connect(host, port=5432):
    return f"{host}:{port}"

print(connect(5433, host="db"))`,
        error: 'TypeError',
        correct:
          '`5433` is bound to `host` by position, and `host="db"` tries to bind it again: `TypeError: got multiple values for argument \'host\'`',
        wrong: [
          'Keyword arguments must come before positional ones',
          '`5433` is assigned to `port` because it is a number',
          '`port` has a default, so it cannot be passed by position',
        ],
        why: 'Positional arguments fill parameters left to right, so `5433` goes to `host`, not `port`; the keyword then conflicts. Call `connect("db", 5433)` or `connect(host="db", port=5433)`.',
      },
      {
        key: 'unexpected-keyword',
        question: 'Why does this call fail?',
        code: `def create_user(name, email):
    return {"name": name, "email": email}

print(create_user(name="ana", mail="a@x.io"))`,
        error: 'TypeError',
        correct:
          'There is no parameter called `mail`, so Python raises `TypeError: create_user() got an unexpected keyword argument \'mail\'`',
        wrong: [
          '`mail` is silently ignored and `email` defaults to `None`',
          'It raises `NameError` because `mail` is not defined',
          'It raises `KeyError` because the dict has no `mail` key',
        ],
        why: 'Keyword names must match parameter names exactly (or be collected by `**kwargs`). Unknown names are a `TypeError`, and `email` has no default, so it would also be missing.',
      },
      {
        key: 'missing',
        question: 'Why does this method call fail?',
        code: `class Cart:
    def add(self, item, qty):
        return f"{qty} x {item}"

cart = Cart()
print(cart.add("pen"))`,
        error: 'TypeError',
        correct:
          '`qty` has no default and was not passed: `TypeError: Cart.add() missing 1 required positional argument: \'qty\'`',
        wrong: [
          '`self` must be passed explicitly: `cart.add(cart, "pen")`',
          '`qty` defaults to `None` and the f-string fails',
          'Methods cannot take more than one parameter besides `self`',
        ],
        why: 'Calling through the instance passes `self` automatically, so `"pen"` fills `item` and `qty` is missing. Give it a default (`qty=1`) or pass it.',
      },
    ],
  ),
  ...b.outputChoice(
    'py-mutable-default',
    3,
    'Default values are evaluated once, when the `def` statement runs.',
    [
      {
        key: 'list',
        code: `def add(item, items=[]):
    items.append(item)
    return items

add(1)
print(add(2))`,
        correct: '[1, 2]',
        wrong: ['[2]', '[1]', '[]'],
        why: 'The default list is created once, when `def` runs, and the same list is reused by every call that omits `items`. The first call left `1` in it.',
      },
      {
        key: 'dict-cache',
        code: `def tag(name, tags={}):
    tags[name] = len(tags)
    return tags

a = tag("x")
b = tag("y")
print(a is b, b)`,
        correct: "True {'x': 0, 'y': 1}",
        wrong: ["False {'y': 0}", "True {'y': 0}", "False {'x': 0, 'y': 1}"],
        why: 'Both calls return the same default dict object, so `a is b` and it accumulates entries across calls.',
      },
      {
        key: 'evaluated-once',
        code: `counter = 0
def next_id():
    global counter
    counter += 1
    return counter

def make(name, id=next_id()):
    return f"{name}#{id}"

print(make("a"), make("b"), make("c", next_id()))`,
        correct: 'a#1 b#1 c#2',
        wrong: ['a#1 b#2 c#3', 'a#2 b#3 c#4', 'a#1 b#1 c#1'],
        why: '`next_id()` in the default is called once, when `def make` runs, so every call without an `id` gets `1`. The explicit `next_id()` in the last call runs at call time and returns `2`.',
      },
    ],
  ),
  ...b.blank(
    'py-none-default-idiom',
    3,
    'Use a sentinel default and create the mutable object inside the function.',
    [
      {
        key: 'list',
        prompt: 'Fix the mutable default so every call without `items` starts with a fresh list.',
        template: `def add(item, items={{blank:default}}):
    if items is None:
        items = []
    items.append(item)
    return items

add(1)
print(add(2))
assert add(3) == [3]`,
        blanks: { default: ['None'] },
        why: '`None` is immutable, so it is safe as a default. The function creates a new list on each call that needs one. Callers who pass their own list still get it extended.',
      },
      {
        key: 'condition',
        prompt: 'Complete the check so an explicitly passed empty dict is kept, and only a missing argument gets a new dict.',
        template: `def with_defaults(options=None):
    if {{blank:cond}}:
        options = {}
    options.setdefault("retries", 3)
    return options

shared = {}
with_defaults(shared)
print(shared)
assert shared == {"retries": 3}
assert with_defaults() is not with_defaults()`,
        blanks: { cond: ['options is None'] },
        why: '`if not options:` would also replace the caller’s empty dict with a new one, so the caller would never see `"retries"`. `options is None` replaces only the missing argument.',
      },
    ],
  ),
  ...b.output(
    'py-global-nonlocal',
    3,
    [
      '`global` binds a name at module level; `nonlocal` binds a name in the nearest enclosing function.',
      'Without either, assignment inside a function creates a local name.',
    ],
    [
      {
        key: 'nonlocal-counter',
        code: `def make_counter():
    count = 0
    def increment():
        nonlocal count
        count += 1
        return count
    return increment

c1 = make_counter()
c2 = make_counter()
c1()
c1()
print(c1(), c2())`,
        output: '3 1',
        why: '`nonlocal count` lets `increment` rebind the `count` of its enclosing call. Each `make_counter()` call creates a new `count`, so `c1` and `c2` count independently.',
      },
      {
        key: 'local-shadow',
        code: `total = 100

def reset():
    total = 0
    return total

def really_reset():
    global total
    total = 0

reset()
print(total)
really_reset()
print(total)`,
        output: '100\n0',
        why: 'Assignment inside `reset` creates a local `total` that shadows the global one, so the module-level value is unchanged. `global total` makes the assignment target the module-level name.',
      },
      {
        key: 'mutation-no-keyword',
        code: `events = []

def record(name):
    events.append(name)

record("start")
record("stop")
print(events)`,
        output: "['start', 'stop']",
        why: 'No keyword is needed to mutate a global object: `events.append` only reads the name `events`. `global` and `nonlocal` matter only when you rebind the name with `=` or `+=`.',
      },
    ],
  ),
  ...b.fails(
    'py-unbound-local',
    4,
    'If a function assigns to a name anywhere in its body, that name is local everywhere in the function.',
    [
      {
        key: 'counter',
        question: 'Why does this program fail?',
        code: `count = 0

def increment():
    count += 1
    return count

print(increment())`,
        error: 'UnboundLocalError',
        correct:
          '`count += 1` makes `count` local to `increment`, and the local is read before it has a value; declare `global count` or, better, pass and return the value',
        wrong: [
          'Functions cannot read module-level variables at all',
          '`count` is an int, and ints cannot be incremented',
          'It prints `1` because Python falls back to the global `count`',
        ],
        why: 'Python decides scope at compile time: an assignment anywhere in the function makes the name local for the whole function. Reading it before the assignment raises `UnboundLocalError` (a subclass of `NameError`).',
      },
      {
        key: 'later-assignment',
        question: 'This used to work until someone added the last two lines. Why does it fail now?',
        code: `rate = 0.2

def tax(amount):
    result = amount * rate
    if amount > 1000:
        rate = 0.3
    return result

print(tax(50))`,
        error: 'UnboundLocalError',
        correct:
          'The new `rate = 0.3` makes `rate` local in the whole function, so the first line reads an unassigned local even though that branch never runs',
        wrong: [
          'The `if` branch runs first and sets `rate` to the wrong type',
          'Module-level names are copied into the function only when it is defined',
          'It fails because `rate` is reassigned to a float',
        ],
        why: 'Scope is not decided by which lines execute. Any assignment to `rate` in the body, even in an unreached branch, makes it local, so `amount * rate` raises `UnboundLocalError`. Use a different local name such as `effective_rate`.',
      },
      {
        key: 'closure',
        question: 'Why does calling `add` fail?',
        code: `def make_accumulator():
    total = 0
    def add(n):
        total = total + n
        return total
    return add

acc = make_accumulator()
print(acc(5))`,
        error: 'UnboundLocalError',
        correct:
          'The assignment makes `total` local to `add`; add `nonlocal total` so it rebinds the enclosing function’s variable',
        wrong: [
          'Inner functions cannot read variables of the enclosing function',
          '`total` was deleted when `make_accumulator` returned',
          'It needs `global total` because `total` is not inside `add`',
        ],
        why: 'Inner functions can read enclosing variables (closures keep them alive), but rebinding requires `nonlocal`. `global` would look for a module-level `total`, which does not exist.',
      },
    ],
  ),
  ...b.fails(
    'py-positional-keyword-only',
    4,
    'Parameters before `/` are positional-only; parameters after `*` (or `*args`) are keyword-only.',
    [
      {
        key: 'keyword-only',
        question: 'Why does this call fail?',
        code: `def transfer(amount, *, source, target):
    return f"{amount} from {source} to {target}"

print(transfer(100, "checking", "savings"))`,
        error: 'TypeError',
        correct:
          'After the bare `*`, `source` and `target` are keyword-only, so they must be passed as `source="checking", target="savings"`',
        wrong: [
          'A bare `*` collects the extra arguments into a tuple named `*`',
          '`amount` must also be passed by keyword',
          'Keyword-only parameters must have default values',
        ],
        why: 'A bare `*` ends the positional parameters without collecting anything, so `transfer` accepts exactly one positional argument. Keyword-only parameters prevent mixing up `source` and `target`; they may or may not have defaults.',
      },
      {
        key: 'positional-only',
        question: 'Why does this call fail?',
        code: `def clamp(value, low, high, /):
    return max(low, min(value, high))

print(clamp(15, 0, 10))
print(clamp(value=15, low=0, high=10))`,
        error: 'TypeError',
        correct:
          'Parameters before `/` are positional-only, so passing them by name raises `TypeError`',
        wrong: [
          '`/` means the function returns a float, and `max` returns an int',
          'The first call fails because `15` is out of range',
          'The `/` makes every parameter keyword-only',
        ],
        why: 'The first call prints `10`. Positional-only parameters (Python 3.8+) let a library rename them later without breaking callers, as many built-ins do. The second call names them, which is not allowed.',
      },
      {
        key: 'after-args',
        question: 'Why does this call fail?',
        code: `def join_words(*words, sep):
    return sep.join(words)

print(join_words("a", "b", "-"))`,
        error: 'TypeError',
        correct:
          '`*words` collects all three positional arguments, so the keyword-only `sep` is missing; call `join_words("a", "b", sep="-")`',
        wrong: [
          'The last positional argument is bound to `sep` automatically',
          '`*words` must be the last parameter',
          '`sep.join` needs a list, and `words` is a tuple',
        ],
        why: 'Parameters after `*args` can only be passed by keyword, and `sep` has no default, so `TypeError: missing 1 required keyword-only argument: \'sep\'`. `str.join` accepts any iterable of strings, including a tuple.',
      },
    ],
  ),
  ...b.output(
    'py-argument-binding',
    5,
    [
      'Positional arguments fill normal parameters left to right, then the rest go to `*args`.',
      'Keyword arguments that match no parameter go to `**kwargs`; unfilled parameters take defaults.',
    ],
    [
      {
        key: 'full-signature',
        code: `def f(a, b=2, *args, c, d=4, **kw):
    return a, b, args, c, d, kw

print(f(1, 3, 5, 6, c=7, e=8))`,
        output: "(1, 3, (5, 6), 7, 4, {'e': 8})",
        why: '`1` and `3` fill `a` and `b`; the remaining positionals `5, 6` go to `args`. `c` is keyword-only and set to `7`, `d` keeps its default, and the unknown keyword `e` lands in `kw`.',
      },
      {
        key: 'kwargs-overlap',
        code: `def build(name, **attrs):
    return name, sorted(attrs)

print(build("div", id="main", name_hint="x"))
print(build(**{"name": "span", "cls": "big"}))`,
        output: "('div', ['id', 'name_hint'])\n('span', ['cls'])",
        why: 'Unpacking a dict with `**` passes `name="span"` as a keyword, which binds to the `name` parameter; only `cls` is left over for `attrs`. `name_hint` is a different name, so it goes to `attrs`.',
      },
      {
        key: 'default-skip',
        code: `def f(a, b=10, *args, c=20):
    return a + b + c + sum(args)

print(f(1), f(1, 2), f(1, 2, 3), f(1, c=0))`,
        output: '31 23 26 11',
        why: '`f(1)` is 1+10+20. `f(1, 2)` overrides `b`: 1+2+20. `f(1, 2, 3)` puts `3` in `args` (not `c`, which is keyword-only): 1+2+20+3. `f(1, c=0)` is 1+10+0.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Comprehensions

export const comprehensionsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'py-list-comprehension',
    1,
    [
      '`[expression for item in iterable if condition]` builds a new list.',
      'The `if` at the end filters; the expression at the start transforms.',
    ],
    [
      {
        key: 'squares',
        code: `print([n * n for n in range(1, 6)])`,
        output: '[1, 4, 9, 16, 25]',
        why: 'The expression `n * n` is evaluated for each `n` from 1 to 5 and collected into a new list.',
      },
      {
        key: 'filter',
        code: `words = ["Apple", "kiwi", "Banana", "fig"]
print([w.lower() for w in words if len(w) > 3])`,
        output: "['apple', 'kiwi', 'banana']",
        why: 'The condition keeps only words longer than three letters (`fig` is dropped), and the expression lowercases the ones that remain.',
      },
      {
        key: 'strings',
        code: `print([c for c in "a1b2c3" if c.isdigit()])`,
        output: "['1', '2', '3']",
        why: 'A string is iterable, so the comprehension visits each character and keeps the digits. The result is a list of one-character strings, not ints.',
      },
    ],
  ),
  ...b.outputChoice(
    'py-comprehension-if-else',
    2,
    'A trailing `if` filters items out; `x if cond else y` at the front transforms every item.',
    [
      {
        key: 'transform',
        code: `values = [4, -2, 0, 7]
print([v if v > 0 else 0 for v in values])`,
        correct: '[4, 0, 0, 7]',
        wrong: ['[4, 7]', '[4, -2, 0, 7]', 'SyntaxError'],
        why: 'The conditional expression is part of the output expression, so every item produces a value: negatives and zero become `0`. Nothing is removed.',
      },
      {
        key: 'filter',
        code: `values = [4, -2, 0, 7]
print([v for v in values if v > 0])`,
        correct: '[4, 7]',
        wrong: ['[4, 0, 0, 7]', '[4, 0, 7]', '[True, False, False, True]'],
        why: 'A trailing `if` filters: items failing the condition are left out, so the result is shorter than the input.',
      },
      {
        key: 'both',
        code: `values = [3, 8, 5, 10]
print(["big" if v > 6 else "small" for v in values if v % 2 == 0])`,
        correct: "['big', 'big']",
        wrong: ["['small', 'big', 'small', 'big']", "['big', 'small', 'big']", "['small', 'big']"],
        why: 'The filter runs first and keeps only even numbers (8 and 10); then the conditional expression labels each kept value. Both are above 6.',
      },
    ],
  ),
  ...b.output(
    'py-dict-set-comprehension',
    2,
    [
      '`{k: v for ...}` builds a dict; `{x for ...}` builds a set.',
      'A later duplicate key in a dict comprehension overwrites the earlier value.',
    ],
    [
      {
        key: 'invert',
        code: `codes = {"us": 1, "ca": 1, "fr": 33}
by_code = {v: k for k, v in codes.items()}
print(by_code)`,
        output: "{1: 'ca', 33: 'fr'}",
        why: 'Inverting a dict maps each value to its key. Two countries share code `1`, so the later one (`"ca"`) overwrites the earlier one: inverting loses data when values are not unique.',
      },
      {
        key: 'set-lengths',
        code: `words = ["to", "be", "or", "not", "to", "be"]
lengths = {len(w) for w in words}
print(sorted(lengths), len(lengths))`,
        output: '[2, 3] 2',
        why: 'A set comprehension keeps unique values only, so the six words yield two distinct lengths.',
      },
      {
        key: 'filter-dict',
        code: `stock = {"pen": 0, "ink": 4, "pad": 2}
print({item: qty * 2 for item, qty in stock.items() if qty})`,
        output: "{'ink': 8, 'pad': 4}",
        why: 'The comprehension iterates over key-value pairs, skips items whose quantity is falsy (0), and doubles the rest. Insertion order follows the original dict.',
      },
    ],
  ),
  ...b.blank(
    'py-comprehension-blank',
    2,
    'The parts go in this order: expression, `for` clause, optional `if` clause.',
    [
      {
        key: 'emails',
        prompt: 'Complete the comprehension so it collects the lowercase emails of active users.',
        template: `users = [
    {"email": "Ana@X.io", "active": True},
    {"email": "ben@x.io", "active": False},
    {"email": "CAI@x.io", "active": True},
]
emails = [u["email"].{{blank:method}}() for u in users {{blank:kw}} u["active"]]
print(emails)
assert emails == ["ana@x.io", "cai@x.io"]`,
        blanks: { method: ['lower', 'casefold'], kw: ['if'] },
        why: 'The expression transforms each kept item and the trailing `if` filters out inactive users. `casefold()` also works and is more thorough for non-ASCII text.',
      },
      {
        key: 'lookup',
        prompt: 'Complete the dict comprehension that maps each product id to its product.',
        template: `products = [("p1", "pen"), ("p2", "ink")]
by_id = {{{blank:pair}} for pid, name in products}
print(by_id["p2"])
assert by_id == {"p1": "pen", "p2": "ink"}`,
        blanks: { pair: ['pid: name', 'pid:name'] },
        why: 'A dict comprehension uses `key: value` before the `for`. Writing just `pid` would make a set comprehension, and `(pid, name)` would make a set of tuples.',
      },
    ],
  ),
  ...b.output(
    'py-nested-comprehension',
    3,
    [
      'Multiple `for` clauses are read left to right, like nested loops written in the same order.',
      'A comprehension inside the expression creates a nested list.',
    ],
    [
      {
        key: 'flatten',
        code: `matrix = [[1, 2], [3, 4], [5]]
print([n for row in matrix for n in row])`,
        output: '[1, 2, 3, 4, 5]',
        why: 'The first `for` is the outer loop over rows and the second is the inner loop over each row’s numbers, so this flattens the matrix in order.',
      },
      {
        key: 'pairs',
        code: `print([(x, y) for x in "ab" for y in range(2) if x != "b" or y == 1])`,
        output: "[('a', 0), ('a', 1), ('b', 1)]",
        why: 'The rightmost `for` varies fastest, like the inner loop. The filter applies to each `(x, y)` combination and drops `("b", 0)`.',
      },
      {
        key: 'transpose',
        code: `m = [[1, 2, 3], [4, 5, 6]]
print([[row[i] for row in m] for i in range(3)])`,
        output: '[[1, 4], [2, 5], [3, 6]]',
        why: 'Here the inner comprehension is the output expression: for each column index `i`, it collects `row[i]` from every row, which transposes the matrix. `list(zip(*m))` does the same with tuples.',
      },
    ],
  ),
  ...b.codeChoice(
    'py-loop-to-comprehension',
    3,
    'An equivalent comprehension must keep the same items, in the same order, with the same values.',
    [
      {
        key: 'if-else-append',
        question: 'Which comprehension builds exactly the same `labels` list as this loop?',
        code: `scores = [72, 45, 90, 60]
labels = []
for s in scores:
    if s >= 60:
        labels.append("pass")
    else:
        labels.append("fail")
print(labels)`,
        correct: '`labels = ["pass" if s >= 60 else "fail" for s in scores]`',
        wrong: [
          '`labels = ["pass" for s in scores if s >= 60 else "fail"]`',
          '`labels = ["pass" for s in scores if s >= 60]`',
          '`labels = [s >= 60 and "pass" for s in scores]`',
        ],
        why: 'Every score produces a label, so the choice belongs in the expression as a conditional expression. A trailing `if ... else` is a syntax error, a trailing `if` alone drops the failing scores, and `s >= 60 and "pass"` yields `False` instead of `"fail"`.',
      },
      {
        key: 'when-not-to',
        question: 'A colleague proposes replacing this loop with `[send(e) for e in emails if e]`. What is the best response?',
        code: `sent = []
def send(address):
    sent.append(address)

emails = ["a@x.io", "", "b@x.io"]
for e in emails:
    if e:
        send(e)
print(sent)`,
        correct:
          'Keep the loop: a comprehension for side effects builds a throwaway list of `None` values and hides the intent',
        wrong: [
          'Use the comprehension: it is required for performance with any list',
          'Use the comprehension: plain `for` loops cannot call functions on filtered items',
          'Use `map(send, emails)` alone, which sends the emails immediately',
        ],
        why: 'Comprehensions are for building collections. Used for side effects they create a list of `None` that nobody needs. `map` is lazy, so `map(send, emails)` on its own line sends nothing until something iterates it (and it would not skip the empty address).',
      },
    ],
  ),
  ...b.outputChoice(
    'py-generator-expression',
    4,
    'A generator expression is lazy and can be iterated only once.',
    [
      {
        key: 'exhausted',
        code: `squares = (n * n for n in range(4))
print(sum(squares))
print(sum(squares))`,
        correct: '14\n0',
        wrong: ['14\n14', '14\nTypeError', '[0, 1, 4, 9]\n0'],
        why: 'The first `sum` consumes the generator completely. The second `sum` gets an already-exhausted generator, which yields nothing, so the sum is `0` and no error is raised. Use a list if you need the values twice.',
      },
      {
        key: 'lazy-evaluation',
        code: `def load(n):
    print("load", n)
    return n

gen = (load(n) for n in [1, 2, 3])
print("created")
print(next(gen))`,
        correct: 'created\nload 1\n1',
        wrong: ['load 1\nload 2\nload 3\ncreated\n1', 'created\n1', 'load 1\ncreated\n1'],
        why: 'Creating a generator expression runs nothing (apart from evaluating the first iterable). Each `next` runs the body for one item, so `load(1)` happens only after `"created"` is printed. A list comprehension would load all three immediately.',
      },
      {
        key: 'in-check',
        code: `gen = (n for n in [1, 2, 3, 4])
print(3 in gen)
print(list(gen))`,
        correct: 'True\n[4]',
        wrong: ['True\n[1, 2, 3, 4]', 'True\n[]', 'False\n[4]'],
        why: '`in` consumes items from the generator until it finds `3`, so only `4` is left for `list(gen)`. Membership tests on iterators have side effects.',
      },
    ],
  ),
  ...b.output(
    'py-comprehension-scope',
    4,
    [
      'The iteration variable of a comprehension does not leak into the surrounding scope.',
      'Comprehensions see names from the enclosing function at the time they run.',
    ],
    [
      {
        key: 'no-leak',
        code: `x = "outer"
values = [x for x in range(3)]
print(x, values)`,
        output: 'outer [0, 1, 2]',
        why: 'In Python 3 the comprehension’s `x` is local to the comprehension, so the outer `x` is untouched. A plain `for x in ...` loop would have rebound it.',
      },
      {
        key: 'late-name',
        code: `factor = 2
make = lambda: [n * factor for n in range(3)]
factor = 10
print(make())`,
        output: '[0, 10, 20]',
        why: 'The comprehension reads `factor` when it runs (when `make()` is called), not when the lambda is defined, so it sees `10`.',
      },
    ],
  ),
  ...b.fails(
    'py-class-body-comprehension',
    5,
    'A class body is not an enclosing scope for functions (or most of a comprehension) defined inside it.',
    [
      {
        key: 'class-attr',
        question: 'Why does this class definition fail?',
        code: `class Pricing:
    rate = 3
    tiers = [rate * n for n in range(1, 4)]

print(Pricing.tiers)`,
        error: 'NameError',
        correct:
          'The comprehension’s expression cannot see class-body names like `rate`, so it raises `NameError`; compute it with a plain loop, or move it into a method or module-level code',
        wrong: [
          '`rate` must be written as `self.rate` inside the class body',
          'Class attributes cannot be lists',
          'The comprehension runs before `rate` is assigned',
        ],
        why: 'Names defined in a class body are not visible in nested scopes, and a comprehension behaves like a nested scope for everything except its first iterable. There is no `self` while the class body runs. A plain `for` loop in the class body would work.',
      },
      {
        key: 'method',
        question: 'Why does calling `label` fail?',
        code: `class Badge:
    prefix = "ID-"

    def label(self, n):
        return prefix + str(n)

print(Badge().label(7))`,
        error: 'NameError',
        correct:
          'Methods do not see class-body names directly; write `self.prefix` (or `Badge.prefix`)',
        wrong: [
          '`prefix` is private because it is defined in the class',
          '`str(n)` fails because `n` is an int',
          'Class attributes are deleted after the class is created',
        ],
        why: 'Name lookup inside a method goes local, enclosing functions, global, built-in: the class body is skipped. Class attributes are reached through `self` or the class name.',
      },
    ],
  ),
];
