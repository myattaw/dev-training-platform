import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Exceptions and resource management; iterators and generators.
 */

const b = programBuilders('python');

// ---------------------------------------------------------------- Exceptions and context managers

export const exceptionsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'py-try-flow',
    1,
    [
      '`else` runs only when the `try` block raised nothing; `finally` always runs.',
      'After an exception, the rest of the `try` block is skipped.',
    ],
    [
      {
        key: 'error',
        code: `try:
    print("start")
    value = int("x")
    print("parsed")
except ValueError:
    print("bad input")
else:
    print("else")
finally:
    print("done")`,
        output: 'start\nbad input\ndone',
        why: '`int("x")` raises `ValueError`, so `"parsed"` is skipped, the handler runs, `else` is skipped (it is only for success) and `finally` runs.',
      },
      {
        key: 'success',
        code: `try:
    value = int("42")
except ValueError:
    print("bad input")
else:
    print("got", value)
finally:
    print("done")`,
        output: 'got 42\ndone',
        why: 'No exception occurs, so the handler is skipped, `else` runs and then `finally`. Putting the follow-up code in `else` keeps the `try` block small, so the handler only covers the call that can fail.',
      },
      {
        key: 'continue-after',
        code: `results = []
for raw in ["1", "two", "3"]:
    try:
        results.append(int(raw))
    except ValueError:
        results.append(0)
print(results)`,
        output: '[1, 0, 3]',
        why: 'The handler deals with the error for that item and the loop carries on. Handling the exception inside the loop keeps one bad value from stopping the whole batch.',
      },
    ],
  ),
  ...b.outputChoice(
    'py-except-order',
    2,
    'Handlers are checked top to bottom, and an `except` clause also catches subclasses of the named exception.',
    [
      {
        key: 'broad-first',
        code: `try:
    {}["missing"]
except LookupError:
    print("lookup")
except KeyError:
    print("key")`,
        correct: 'lookup',
        wrong: ['key', 'lookup\nkey', 'KeyError'],
        why: '`KeyError` is a subclass of `LookupError`, so the first handler matches and the second can never run for a `KeyError`. Order handlers from most specific to most general.',
      },
      {
        key: 'tuple',
        code: `def parse(value):
    try:
        return 10 / int(value)
    except (ValueError, ZeroDivisionError) as e:
        return type(e).__name__

print(parse("0"), parse("x"), parse("5"))`,
        correct: 'ZeroDivisionError ValueError 2.0',
        wrong: ['ValueError ValueError 2.0', 'ZeroDivisionError ValueError 2', 'ArithmeticError ValueError 2.0'],
        why: 'A tuple of exception types catches any of them, and `as e` binds the actual exception, whose type name is reported. `10 / 5` is the float `2.0`.',
      },
      {
        key: 'index-not-key',
        code: `items = ["a"]
try:
    items[3]
except KeyError:
    print("key")
except LookupError as e:
    print(type(e).__name__)`,
        correct: 'IndexError',
        wrong: ['key', 'LookupError', 'KeyError'],
        why: 'A list raises `IndexError`, not `KeyError`. Both are subclasses of `LookupError`, which catches it; `type(e).__name__` shows the actual class.',
      },
    ],
  ),
  ...b.blank(
    'py-custom-exceptions',
    2,
    'Custom exceptions subclass `Exception` (or one of its subclasses) and are thrown with `raise`.',
    [
      {
        key: 'withdraw',
        prompt: 'Complete the custom exception and raise it when the balance is too low.',
        template: `class InsufficientFunds({{blank:base}}):
    pass

def withdraw(balance, amount):
    if amount > balance:
        {{blank:kw}} InsufficientFunds(f"need {amount - balance} more")
    return balance - amount

try:
    withdraw(50, 80)
except InsufficientFunds as e:
    print("refused:", e)`,
        blanks: { base: ['Exception', 'ValueError', 'ArithmeticError'], kw: ['raise'] },
        why: 'Subclassing `Exception` (or a fitting built-in such as `ValueError`) lets callers catch this specific error. Python uses `raise`, not `throw`. `str(e)` is the message passed to the constructor.',
      },
      {
        key: 'hierarchy',
        prompt: 'Make `NotFound` a kind of `AppError`, so one handler can catch every application error.',
        template: `class AppError(Exception):
    pass

class NotFound({{blank:base}}):
    def __init__(self, resource):
        super().__init__(f"{resource} not found")
        self.resource = resource

try:
    raise NotFound("order 7")
except AppError as e:
    print(type(e).__name__, "-", e, "-", e.resource)`,
        blanks: { base: ['AppError'] },
        why: 'A small hierarchy lets callers choose: catch `NotFound` specifically, or `AppError` for all application errors. Calling `super().__init__(message)` sets the text shown by `str(e)`, and extra attributes carry structured data.',
      },
    ],
  ),
  ...b.fails(
    'py-uncaught-exception',
    2,
    'An `except` clause catches only the exception types it names (and their subclasses).',
    [
      {
        key: 'wrong-type',
        question: 'The developer expected the handler to deal with bad input. Why does the program still crash?',
        code: `def average(values):
    try:
        return sum(values) / len(values)
    except ValueError:
        return 0

print(average([]))`,
        error: 'ZeroDivisionError',
        correct:
          'An empty list makes `len(values)` 0, which raises `ZeroDivisionError`, and the handler only catches `ValueError`',
        wrong: [
          '`sum([])` raises `ValueError`, which escapes because it happens before the division',
          'Exceptions raised inside a `return` statement cannot be caught',
          'The handler runs and returns 0, but `print` cannot print it',
        ],
        why: '`sum([])` is `0`, and `0 / 0` raises `ZeroDivisionError`, which is not a subclass of `ValueError`. Better than a broader handler: check `if not values: return 0` before dividing.',
      },
      {
        key: 'raise-in-handler',
        question: 'Why does this program still end with an error?',
        code: `config = {"port": "80a"}
try:
    port = int(config["port"])
except ValueError:
    port = int(config["fallback_port"])
print(port)`,
        error: 'KeyError',
        correct:
          'The handler itself raises `KeyError` because `"fallback_port"` is missing, and nothing catches exceptions raised inside a handler',
        wrong: [
          'The original `ValueError` is re-raised automatically after the handler',
          '`int("80a")` returns `80`, so the `print` fails',
          'An `except` block cannot assign variables',
        ],
        why: 'A new exception inside an `except` block propagates normally; the traceback shows both, joined by "During handling of the above exception, another exception occurred". Use `config.get("fallback_port", 8080)`.',
      },
    ],
  ),
  ...b.codeChoice(
    'py-overbroad-except',
    3,
    'Catch the narrowest exception you can actually handle, and never hide errors silently.',
    [
      {
        key: 'swallow',
        question:
          'This function returns `None` for every user, and nobody noticed for weeks. What is the real problem and the best fix?',
        code: `def load_user(users, user_id):
    try:
        return users[user_id]["name"].titel()
    except Exception:
        return None

print(load_user({1: {"name": "ana"}}, 1))`,
        correct:
          'The broad `except Exception` hides the `AttributeError` from the typo `titel`; catch only `KeyError` (the case that is expected) and let real bugs surface',
        wrong: [
          'User 1 does not exist, so `None` is correct',
          'Replace `except Exception` with a bare `except:` to catch even more errors',
          'Add `finally: return None` so the function always returns',
        ],
        why: 'The expected failure is a missing user (`KeyError`). Catching every `Exception` also catches programming errors like the misspelled method and turns them into a silent `None`. A bare `except:` is worse: it also catches `KeyboardInterrupt` and `SystemExit`.',
      },
      {
        key: 'too-much-in-try',
        question: 'Which version handles a missing price correctly without hiding other bugs?',
        code: `prices = {"pen": 2}

def total(item, qty):
    if item not in prices:
        raise LookupError(f"no price for {item}")
    return prices[item] * qty

try:
    print(total("ink", 2))
except LookupError as e:
    print("skipped:", e)`,
        correct:
          'The version shown: it checks for the missing price, raises a specific exception with a message, and the caller handles only that exception',
        wrong: [
          'Wrapping the whole program in `try: ... except: pass`',
          'Returning `-1` from `total` for a missing price, so no exception is needed',
          'Catching `Exception` in `total` and printing the error there',
        ],
        why: 'Raising a specific exception keeps errors explicit, and the caller decides what to do. Magic return values like `-1` are easily used as real totals, and catching inside `total` hides the failure from callers who need to know.',
      },
    ],
  ),
  ...b.output(
    'py-context-managers',
    3,
    [
      '`with` calls `__enter__` at the start and `__exit__` at the end, even if the block raises.',
      'With `@contextmanager`, code before `yield` is the setup and code after it (in `finally`) is the cleanup.',
    ],
    [
      {
        key: 'class-based',
        code: `class Resource:
    def __init__(self, name):
        self.name = name

    def __enter__(self):
        print("open", self.name)
        return self

    def __exit__(self, exc_type, exc, tb):
        print("close", self.name, exc_type.__name__ if exc_type else None)

try:
    with Resource("db") as r:
        print("using", r.name)
        raise RuntimeError("boom")
except RuntimeError:
    print("handled")`,
        output: 'open db\nusing db\nclose db RuntimeError\nhandled',
        why: '`__exit__` receives the exception details and runs before the exception reaches the outer `except`. It returns `None` (falsy), so the exception is not suppressed.',
      },
      {
        key: 'generator-based',
        code: `from contextlib import contextmanager

@contextmanager
def transaction(log):
    log.append("begin")
    try:
        yield log
        log.append("commit")
    except ValueError:
        log.append("rollback")
        raise

log = []
with transaction(log):
    log.append("insert")
try:
    with transaction(log):
        raise ValueError("bad row")
except ValueError:
    pass
print(log)`,
        output: "['begin', 'insert', 'commit', 'begin', 'rollback']",
        why: 'The block runs at the `yield`. On success, execution continues after the `yield` and commits. When the block raises, the exception is raised at the `yield`, so the handler rolls back and re-raises it.',
      },
      {
        key: 'file-closed',
        code: `with open("/tmp/notes.txt", "w") as f:
    f.write("hello")
print(f.closed)
with open("/tmp/notes.txt") as f:
    print(f.read())`,
        output: 'True\nhello',
        why: 'A file object is a context manager: leaving the `with` block closes it (and flushes the write), even though the name `f` still exists afterwards. Without `with`, you must remember to call `close()` in a `finally`.',
      },
    ],
  ),
  ...b.output(
    'py-finally-return',
    4,
    [
      '`finally` runs while a `return` is on its way out.',
      'The value of a `return` expression is computed before `finally` runs.',
    ],
    [
      {
        key: 'cleanup-order',
        code: `def fetch():
    try:
        print("fetching")
        return "data"
    finally:
        print("cleanup")

print(fetch())`,
        output: 'fetching\ncleanup\ndata',
        why: 'The `return` value is ready, but `finally` runs before the function actually returns, so `"cleanup"` is printed before the caller prints the result.',
      },
      {
        key: 'value-captured',
        code: `def build():
    items = ["a"]
    count = 1
    try:
        return items, count
    finally:
        items.append("b")
        count = 99

print(build())`,
        output: "(['a', 'b'], 1)",
        why: 'The return expression was evaluated before `finally`: the tuple holds the list object and the int `1`. Rebinding `count` afterwards has no effect, but mutating the list does show, because the tuple refers to the same list.',
      },
      {
        key: 'exception-passes',
        code: `def risky():
    try:
        raise KeyError("id")
    finally:
        print("finally runs")

try:
    risky()
except KeyError as e:
    print("caught", e)`,
        output: "finally runs\ncaught 'id'",
        why: '`finally` runs and the `KeyError` keeps propagating to the caller. `str()` of a `KeyError` shows the key with quotes because it uses `repr` of the key.',
      },
    ],
  ),
  ...b.output(
    'py-exception-chaining',
    4,
    [
      '`raise New(...) from original` sets `__cause__`; raising inside a handler without `from` sets `__context__`.',
      '`from None` hides the original exception from the traceback.',
    ],
    [
      {
        key: 'from-cause',
        code: `class ConfigError(Exception):
    pass

def load(text):
    try:
        return int(text)
    except ValueError as e:
        raise ConfigError(f"invalid port {text!r}") from e

try:
    load("http")
except ConfigError as e:
    print(e)
    print(type(e.__cause__).__name__)`,
        output: "invalid port 'http'\nValueError",
        why: '`raise ... from e` translates a low-level error into a domain error while keeping the original as `__cause__`, so the traceback shows both ("The above exception was the direct cause of the following exception").',
      },
      {
        key: 'implicit-context',
        code: `try:
    try:
        1 / 0
    except ZeroDivisionError:
        raise RuntimeError("report failed")
except RuntimeError as e:
    print(e.__cause__, type(e.__context__).__name__)`,
        output: 'None ZeroDivisionError',
        why: 'Without `from`, Python still records the exception being handled as `__context__`, but `__cause__` stays `None`. The traceback then says "During handling of the above exception, another exception occurred".',
      },
      {
        key: 'from-none',
        code: `def lookup(table, key):
    try:
        return table[key]
    except KeyError:
        raise LookupError(f"unknown code {key}") from None

try:
    lookup({}, "X1")
except LookupError as e:
    print(e, e.__cause__, e.__suppress_context__)`,
        output: 'unknown code X1 None True',
        why: '`from None` sets `__suppress_context__`, so the traceback shows only the new exception. Use it when the original error is an implementation detail that adds nothing.',
      },
    ],
  ),
  ...b.output(
    'py-exit-suppression',
    5,
    [
      'An `__exit__` that returns a truthy value suppresses the exception.',
      'A `@contextmanager` generator needs `try`/`finally` around `yield` for its cleanup to run on errors.',
    ],
    [
      {
        key: 'suppress',
        code: `from contextlib import suppress

with suppress(FileNotFoundError):
    open("/tmp/does-not-exist.txt")
    print("not reached")
print("after")

class Ignore:
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc, tb):
        return exc_type is KeyError

with Ignore():
    {}["x"]
print("still running")`,
        output: 'after\nstill running',
        why: '`contextlib.suppress` swallows the listed exceptions; the rest of the block is skipped. The custom `__exit__` returns `True` for a `KeyError`, which tells Python the exception was handled.',
      },
      {
        key: 'missing-finally',
        code: `from contextlib import contextmanager

events = []

@contextmanager
def lock():
    events.append("acquire")
    yield
    events.append("release")

try:
    with lock():
        raise ValueError
except ValueError:
    pass
print(events)`,
        output: "['acquire']",
        why: 'The exception is raised at the `yield`, and with no `try`/`finally` the code after `yield` never runs, so the lock is never released. Wrap the `yield` in `try: yield` / `finally: release`.',
      },
      {
        key: 'exitstack',
        code: `from contextlib import ExitStack

class Step:
    def __init__(self, name):
        self.name = name
    def __enter__(self):
        print("enter", self.name)
    def __exit__(self, *args):
        print("exit", self.name)

with ExitStack() as stack:
    for name in ["a", "b", "c"]:
        stack.enter_context(Step(name))
    print("work")`,
        output: 'enter a\nenter b\nenter c\nwork\nexit c\nexit b\nexit a',
        why: '`ExitStack` manages a dynamic number of context managers and exits them in reverse order, like nested `with` statements would.',
      },
    ],
  ),
  ...b.output(
    'py-exception-groups',
    5,
    [
      'An `ExceptionGroup` bundles several exceptions; `except*` handles the matching part of a group.',
      'Each `except*` clause can run, and unmatched exceptions keep propagating.',
    ],
    [
      {
        key: 'except-star',
        code: `def validate(row):
    errors = []
    if not row.get("email"):
        errors.append(ValueError("email missing"))
    if row.get("age", 0) < 0:
        errors.append(ValueError("age negative"))
    if "id" not in row:
        errors.append(KeyError("id"))
    if errors:
        raise ExceptionGroup("invalid row", errors)

try:
    validate({"age": -1})
except* ValueError as group:
    print("values:", [str(e) for e in group.exceptions])
except* KeyError as group:
    print("keys:", len(group.exceptions))`,
        output: "values: ['email missing', 'age negative']\nkeys: 1",
        why: 'Unlike `except`, several `except*` clauses can run for one group: each receives a sub-group with the exceptions it matches. Exception groups (Python 3.11+) let validation report every problem at once.',
      },
      {
        key: 'split',
        code: `group = ExceptionGroup("batch", [ValueError("a"), TypeError("b"), ValueError("c")])
values, rest = group.split(ValueError)
print(len(values.exceptions), [type(e).__name__ for e in rest.exceptions])
print(isinstance(group, Exception))`,
        output: "2 ['TypeError']\nTrue",
        why: '`split` divides a group into the matching part and the rest, preserving structure. `ExceptionGroup` is itself an `Exception`, so a plain `except Exception` would catch the whole group at once.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Iterators and generators

export const iteratorsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'py-generator-function',
    1,
    [
      'A function containing `yield` returns a generator; each `yield` produces one value.',
      '`list()` runs the generator to the end and collects the values.',
    ],
    [
      {
        key: 'countdown',
        code: `def countdown(n):
    while n > 0:
        yield n
        n -= 1

print(list(countdown(3)))
for x in countdown(2):
    print(x)`,
        output: '[3, 2, 1]\n2\n1',
        why: 'Each `yield` hands out one value and pauses the function; the loop resumes it. When the function ends, iteration stops. Every call creates a new, independent generator.',
      },
      {
        key: 'evens',
        code: `def evens(values):
    for v in values:
        if v % 2 == 0:
            yield v * 10

print(sum(evens([1, 2, 3, 4])))`,
        output: '60',
        why: 'The generator yields `20` and `40`, and `sum` consumes it. Generators compose naturally with functions that accept any iterable.',
      },
    ],
  ),
  ...b.outputChoice(
    'py-generator-laziness',
    2,
    'Calling a generator function runs none of its body; `next()` runs it up to the next `yield`.',
    [
      {
        key: 'nothing-runs',
        code: `def numbers():
    print("start")
    yield 1
    print("middle")
    yield 2

gen = numbers()
print("created")
print(next(gen))`,
        correct: 'created\nstart\n1',
        wrong: ['start\ncreated\n1', 'start\nmiddle\ncreated\n1', 'created\nstart\n1\nmiddle'],
        why: 'The call `numbers()` only creates the generator. The first `next` runs the body until the first `yield`; `"middle"` would only print on the next `next`.',
      },
      {
        key: 'infinite',
        code: `def naturals():
    n = 1
    while True:
        yield n
        n += 1

gen = naturals()
print([next(gen) for _ in range(3)], next(gen))`,
        correct: '[1, 2, 3] 4',
        wrong: ['[1, 2, 3] 1', 'The program never ends', '[1, 2, 3] 3'],
        why: 'An infinite generator is fine as long as you only ask for a finite number of values. The generator remembers its position between calls, so the next value after three is `4`.',
      },
    ],
  ),
  ...b.fails(
    'py-iterator-protocol-errors',
    2,
    'An iterable can produce an iterator with `iter()`; only an iterator supports `next()`.',
    [
      {
        key: 'next-on-list',
        question: 'Why does this program fail?',
        code: `tasks = ["build", "test", "deploy"]
print(next(tasks))`,
        error: 'TypeError',
        correct:
          'A list is iterable but not an iterator; call `next(iter(tasks))` (or just use `tasks[0]`)',
        wrong: [
          '`next` works only on generator functions, not generator objects',
          'The list is empty, so it raises `StopIteration`',
          '`next` requires a default value as its second argument',
        ],
        why: '`for` loops call `iter()` for you. `next()` needs an iterator, so it raises `TypeError: \'list\' object is not an iterator`. The optional default is only used when an iterator is exhausted.',
      },
      {
        key: 'stop-iteration',
        question: 'Why does this program fail?',
        code: `rows = iter(["header", "a,1"])
header = next(rows)
first = next(rows)
second = next(rows)
print(second)`,
        error: 'StopIteration',
        correct:
          'The iterator has only two items, so the third `next` raises `StopIteration`; use `next(rows, None)` to get a default instead',
        wrong: [
          'It prints `None` because the iterator is exhausted',
          'It starts again from `"header"`',
          'It raises `IndexError` because there is no third row',
        ],
        why: '`next` signals the end by raising `StopIteration`; a `for` loop catches it for you, but a direct call does not. `next(iterator, default)` returns the default instead.',
      },
    ],
  ),
  ...b.output(
    'py-iterable-vs-iterator',
    3,
    [
      'A list can be iterated any number of times; each `for` gets a fresh iterator.',
      'An iterator (including a generator, `map` or `zip` object) is consumed once; `iter(it)` returns the same iterator.',
    ],
    [
      {
        key: 'map-twice',
        code: `prices = map(float, ["1.5", "2.5"])
print(sum(prices))
print(list(prices))`,
        output: '4.0\n[]',
        why: '`map` returns a lazy iterator. `sum` consumes it, so `list(prices)` finds nothing left. Wrap it in `list(...)` once if you need the values again.',
      },
      {
        key: 'same-iterator',
        code: `nums = [1, 2, 3, 4]
it = iter(nums)
print(iter(it) is it, iter(nums) is iter(nums))
for n in it:
    if n == 2:
        break
print(list(it))`,
        output: 'True False\n[3, 4]',
        why: 'An iterator returns itself from `iter()`, while each `iter(list)` creates a new iterator. After the `break`, the iterator remembers its position, so the remaining items are `3` and `4`.',
      },
      {
        key: 'zip-pairs',
        code: `it = iter([1, 2, 3, 4, 5, 6])
print(list(zip(it, it)))`,
        output: '[(1, 2), (3, 4), (5, 6)]',
        why: 'Both arguments are the same iterator, so `zip` takes alternate items for each position in the pair. This idiom groups a flat sequence into pairs (`itertools.batched` is the clearer modern form).',
      },
    ],
  ),
  ...b.codeChoice(
    'py-exhaustion-bug',
    3,
    'Code that loops over its input twice needs a re-iterable collection, not a one-shot iterator.',
    [
      {
        key: 'normalize',
        question:
          '`normalize` returns an empty list when it is given a generator, but works for a list. What is the most robust fix?',
        code: `def normalize(values):
    total = sum(values)
    return [v / total for v in values]

print(normalize([1, 3]))
print(normalize(v for v in [1, 3]))`,
        correct: 'Materialize the input first: `values = list(values)` at the start of the function',
        wrong: [
          'Call `values.reset()` after `sum`',
          'Replace the comprehension with a generator expression',
          'Use `len(values)` instead of `sum(values)`',
        ],
        why: '`sum` consumes the generator, so the comprehension sees nothing. Iterators have no `reset`, and generators have no `len`. Converting to a list once makes two passes possible.',
      },
      {
        key: 'csv-reader',
        question: 'The second report is always empty. Why?',
        code: `import csv
import io

reader = csv.reader(io.StringIO("ana,3\\nben,5\\n"))
names = [row[0] for row in reader]
total = sum(int(row[1]) for row in reader)
print(names, total)`,
        correct:
          '`csv.reader` is an iterator over the input; the first comprehension consumed every row, so the sum sees no rows and is `0`',
        wrong: [
          '`csv.reader` caches rows only for the first loop over it',
          'The second loop fails silently because `row[1]` is a string',
          '`io.StringIO` can only be read by one `csv.reader`',
        ],
        why: 'Readers, files and generators are single-pass. Read the rows once (`rows = list(reader)`) and loop over the list as often as needed. The program prints `[\'ana\', \'ben\'] 0`.',
      },
    ],
  ),
  ...b.output(
    'py-yield-from',
    3,
    [
      '`yield from iterable` yields every item of the iterable in turn.',
      'It makes recursive generators (trees, nested lists) short.',
    ],
    [
      {
        key: 'chain',
        code: `def all_items(*groups):
    for group in groups:
        yield from group

print(list(all_items([1, 2], (3,), "ab")))`,
        output: "[1, 2, 3, 'a', 'b']",
        why: '`yield from group` yields each element of each group, so the result is flat. A string is iterated character by character.',
      },
      {
        key: 'recursive',
        code: `def flatten(items):
    for item in items:
        if isinstance(item, list):
            yield from flatten(item)
        else:
            yield item

print(list(flatten([1, [2, [3, 4]], [], 5])))`,
        output: '[1, 2, 3, 4, 5]',
        why: 'For nested lists, the generator delegates to a recursive call; `yield from` passes the inner values through. An empty list yields nothing.',
      },
    ],
  ),
  ...b.blank(
    'py-custom-iterator',
    4,
    'An iterator class needs `__iter__` returning `self` and `__next__` that raises `StopIteration` at the end.',
    [
      {
        key: 'range-like',
        prompt: 'Complete the iterator so it stops after the last step.',
        template: `class Steps:
    def __init__(self, start, stop, step):
        self.current = start
        self.stop = stop
        self.step = step

    def __iter__(self):
        return self

    def __next__(self):
        if self.current >= self.stop:
            raise {{blank:exc}}
        value = self.current
        self.current += self.step
        return value

print(list(Steps(0, 10, 4)))
assert list(Steps(0, 10, 4)) == [0, 4, 8]`,
        blanks: { exc: ['StopIteration', 'StopIteration()'] },
        why: 'Raising `StopIteration` from `__next__` is how an iterator signals the end; `for` loops and `list()` catch it. Returning `None` would just produce `None` values forever.',
      },
      {
        key: 'generator-iter',
        prompt: 'Make `Playlist` iterable by turning `__iter__` into a generator.',
        template: `class Playlist:
    def __init__(self, *songs):
        self.songs = list(songs)

    def __iter__(self):
        for song in self.songs:
            {{blank:kw}} song.title()

p = Playlist("intro", "outro")
print(list(p), list(p))
assert list(p) == ["Intro", "Outro"]`,
        blanks: { kw: ['yield'] },
        why: 'When `__iter__` is a generator function, every `for` loop over the object gets a new generator, so the playlist can be iterated repeatedly. That makes it an iterable rather than a one-shot iterator.',
      },
    ],
  ),
  ...b.output(
    'py-itertools',
    4,
    [
      '`itertools` functions return lazy iterators; `islice` takes a finite slice of any iterator.',
      '`chain` concatenates iterables, `accumulate` produces running totals, `batched` groups items.',
    ],
    [
      {
        key: 'count-islice',
        code: `from itertools import count, islice

ids = count(start=100, step=5)
print(list(islice(ids, 3)))
print(next(ids))`,
        output: '[100, 105, 110]\n115',
        why: '`count` never ends, so `islice` takes the first three values lazily. The underlying iterator continues from where `islice` left off.',
      },
      {
        key: 'chain-accumulate',
        code: `from itertools import accumulate, chain

q1 = [100, 50]
q2 = [-30, 80]
print(list(accumulate(chain(q1, q2))))`,
        output: '[100, 150, 120, 200]',
        why: '`chain` yields the items of `q1` then `q2` without building a new list; `accumulate` yields running sums by default.',
      },
      {
        key: 'batched-pairwise',
        code: `from itertools import batched, pairwise

print(list(batched("abcdefg", 3)))
print([b - a for a, b in pairwise([3, 7, 12])])`,
        output: "[('a', 'b', 'c'), ('d', 'e', 'f'), ('g',)]\n[4, 5]",
        why: '`batched` (3.12+) yields tuples of up to `n` items, with a shorter last batch. `pairwise` (3.10+) yields overlapping consecutive pairs.',
      },
    ],
  ),
  ...b.outputChoice(
    'py-groupby-unsorted',
    5,
    '`itertools.groupby` groups only consecutive items with the same key.',
    [
      {
        key: 'unsorted',
        code: `from itertools import groupby

orders = ["books", "toys", "books", "books"]
print([(k, len(list(g))) for k, g in groupby(orders)])`,
        correct: "[('books', 1), ('toys', 1), ('books', 2)]",
        wrong: ["[('books', 3), ('toys', 1)]", "[('toys', 1), ('books', 3)]", "[('books', 4)]"],
        why: '`groupby` starts a new group whenever the key changes, like the Unix `uniq` command. Sort by the same key first (or use a dict / `Counter`) to get one group per key.',
      },
      {
        key: 'consumed-group',
        code: `from itertools import groupby

data = sorted(["ant", "bee", "bat", "ape"])
groups = groupby(data, key=lambda w: w[0])
saved = {k: g for k, g in groups}
print({k: list(g) for k, g in saved.items()})`,
        correct: "{'a': [], 'b': []}",
        wrong: [
          "{'a': ['ant', 'ape'], 'b': ['bat', 'bee']}",
          "{'a': ['ape'], 'b': ['bee']}",
          "{'a': ['ant', 'ape'], 'b': []}",
        ],
        why: 'Each group is a view into the shared underlying iterator. Advancing to the next key invalidates the previous group, so groups stored for later are empty. Convert each group to a list immediately: `{k: list(g) for k, g in groups}`.',
      },
    ],
  ),
  ...b.output(
    'py-generator-return-close',
    5,
    [
      'A generator’s `return value` ends iteration; the value is carried by `StopIteration` and returned by `yield from`.',
      'Closing a generator (or letting it be garbage-collected) raises `GeneratorExit` at the paused `yield`, so `finally` blocks run.',
    ],
    [
      {
        key: 'return-value',
        code: `def reader(lines):
    count = 0
    for line in lines:
        yield line.upper()
        count += 1
    return count

def pipeline(lines):
    total = yield from reader(lines)
    yield f"{total} lines"

print(list(pipeline(["a", "b"])))`,
        output: "['A', 'B', '2 lines']",
        why: '`yield from` passes the inner values through and then evaluates to the inner generator’s return value. `list()` ignores return values, so the outer generator yields the count explicitly.',
      },
      {
        key: 'close-finally',
        code: `def stream():
    try:
        for i in range(10):
            yield i
    finally:
        print("stream closed")

gen = stream()
for value in gen:
    if value == 2:
        break
print("after loop")
gen.close()
print("end")`,
        output: 'after loop\nstream closed\nend',
        why: '`break` only stops pulling values; the generator stays paused at its `yield`. `close()` raises `GeneratorExit` there, which runs the `finally` block. Without an explicit `close`, cleanup would wait until the generator is garbage-collected.',
      },
    ],
  ),
];
