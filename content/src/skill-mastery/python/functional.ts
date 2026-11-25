import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Functional programming: higher-order functions, map/filter, sort keys,
 * closures, decorators and functools.
 */

const b = programBuilders('python');

export const functionalFamilies: readonly QuestionSource[] = [
  ...b.output(
    'py-first-class-functions',
    1,
    [
      'Functions are objects: they can be passed as arguments, stored and returned.',
      'Writing a function name without parentheses refers to the function; adding `()` calls it.',
    ],
    [
      {
        key: 'pass-function',
        code: `def apply_twice(fn, value):
    return fn(fn(value))

def double(n):
    return n * 2

print(apply_twice(double, 3), apply_twice(str.upper, "hi"))`,
        output: '12 HI',
        why: '`apply_twice` receives a function and calls it twice. `str.upper` is also just a function that takes the string as its argument.',
      },
      {
        key: 'store-functions',
        code: `def tax(x):
    return x * 1.2

def ship(x):
    return x + 5

steps = [tax, ship]
price = 100
for step in steps:
    price = step(price)
print(price)`,
        output: '125.0',
        why: 'The list holds function objects, and the loop calls each in order: `100 * 1.2 = 120.0`, then `+ 5`. Changing the order of `steps` changes the result.',
      },
    ],
  ),
  ...b.output(
    'py-map-filter',
    2,
    [
      '`map(fn, iterable)` applies `fn` to every item; `filter(fn, iterable)` keeps items for which `fn` is truthy.',
      'Both return lazy iterators; `filter(None, ...)` keeps truthy items.',
    ],
    [
      {
        key: 'basic',
        code: `prices = ["3.50", "10", "0.99"]
print(list(map(float, prices)))
print(list(filter(lambda p: float(p) >= 1, prices)))`,
        output: "[3.5, 10.0, 0.99]\n['3.50', '10']",
        why: '`map(float, ...)` converts each string. `filter` keeps the original items (still strings) whose test is true; it does not transform them.',
      },
      {
        key: 'filter-none',
        code: `values = [0, "a", "", None, [], [0], 7]
print(list(filter(None, values)))`,
        output: "['a', [0], 7]",
        why: 'With `None` as the function, `filter` keeps the truthy items, dropping `0`, `""`, `None` and `[]`. `[0]` is a non-empty list, so it stays.',
      },
      {
        key: 'two-iterables',
        code: `qty = [2, 3, 1]
unit = [5, 4, 10, 99]
print(sum(map(lambda q, u: q * u, qty, unit)))`,
        output: '32',
        why: 'With several iterables, `map` passes one item from each to the function and stops at the shortest: `2*5 + 3*4 + 1*10 = 32`. The extra `99` is ignored.',
      },
    ],
  ),
  ...b.output(
    'py-sort-keys',
    2,
    [
      'A `key` function maps each item to the value that is compared; a tuple key sorts by several fields.',
      'To reverse just one numeric field, negate it in the key.',
    ],
    [
      {
        key: 'tuple-key',
        code: `people = [("ana", "dev", 31), ("ben", "ops", 25), ("cai", "dev", 25)]
for p in sorted(people, key=lambda p: (p[1], p[2])):
    print(p[0], end=" ")`,
        output: 'cai ana ben',
        why: 'Tuples compare element by element: first by team (`dev` before `ops`), then by age within a team. `cai` (25) comes before `ana` (31).',
      },
      {
        key: 'mixed-direction',
        code: `scores = [("ana", 90), ("ben", 95), ("cai", 90)]
ranked = sorted(scores, key=lambda s: (-s[1], s[0]))
print([name for name, _ in ranked])`,
        output: "['ben', 'ana', 'cai']",
        why: 'Negating the score sorts it from highest to lowest while names still sort ascending as a tie-breaker. `reverse=True` would reverse both fields.',
      },
      {
        key: 'itemgetter',
        code: `from operator import itemgetter

rows = [{"sku": "B", "qty": 2}, {"sku": "A", "qty": 2}, {"sku": "C", "qty": 1}]
rows.sort(key=itemgetter("qty", "sku"))
print([r["sku"] for r in rows])`,
        output: "['C', 'A', 'B']",
        why: '`itemgetter("qty", "sku")` returns a function that extracts a `(qty, sku)` tuple, equivalent to `lambda r: (r["qty"], r["sku"])`.',
      },
    ],
  ),
  ...b.output(
    'py-closures',
    3,
    [
      'An inner function remembers the variables of the enclosing call that created it.',
      'Each call of the outer function creates new variables and therefore a new closure.',
    ],
    [
      {
        key: 'multiplier',
        code: `def multiplier(factor):
    def apply(n):
        return n * factor
    return apply

double = multiplier(2)
triple = multiplier(3)
print(double(5), triple(5), double.__closure__[0].cell_contents)`,
        output: '10 15 2',
        why: '`double` and `triple` each close over their own `factor`. The captured value is stored in a cell, which `__closure__` exposes.',
      },
      {
        key: 'shared-cell',
        code: `def make_account():
    balance = 0
    def deposit(n):
        nonlocal balance
        balance += n
        return balance
    def read():
        return balance
    return deposit, read

deposit, read = make_account()
deposit(30)
deposit(20)
print(read())`,
        output: '50',
        why: 'Both inner functions were created by the same call, so they share the same `balance` cell. `deposit` rebinds it (with `nonlocal`) and `read` sees the change.',
      },
    ],
  ),
  ...b.outputChoice(
    'py-late-binding-closures',
    4,
    'Closures look up a variable when they are called, not when they are created.',
    [
      {
        key: 'lambdas-in-loop',
        code: `handlers = []
for i in range(3):
    handlers.append(lambda: i * 10)
print([h() for h in handlers])`,
        correct: '[20, 20, 20]',
        wrong: ['[0, 10, 20]', '[0, 0, 0]', 'NameError'],
        why: 'All three lambdas refer to the same variable `i`, which is `2` after the loop. Capture the current value with a default argument (`lambda i=i: i * 10`) or `functools.partial`.',
      },
      {
        key: 'default-fix',
        code: `handlers = []
for i in range(3):
    handlers.append(lambda i=i: i * 10)
print([h() for h in handlers])`,
        correct: '[0, 10, 20]',
        wrong: ['[20, 20, 20]', '[0, 0, 0]', 'TypeError'],
        why: 'A default value is evaluated when the lambda is created, so each lambda stores the value of `i` at that moment.',
      },
      {
        key: 'comprehension',
        code: `buttons = {name: (lambda: name.upper()) for name in ["ok", "cancel"]}
print(buttons["ok"]())`,
        correct: 'CANCEL',
        wrong: ['OK', 'ok', 'NameError'],
        why: 'The comprehension’s `name` is one variable that ends as `"cancel"`; every lambda reads it when called. Late binding happens in comprehensions too.',
      },
    ],
  ),
  ...b.output(
    'py-decorators',
    3,
    [
      '`@decorator` above `def f` means `f = decorator(f)`.',
      'Stacked decorators apply bottom-up: the one closest to `def` wraps first.',
    ],
    [
      {
        key: 'logging',
        code: `def logged(fn):
    def wrapper(*args, **kwargs):
        print("calling", fn.__name__, args)
        return fn(*args, **kwargs)
    return wrapper

@logged
def add(a, b):
    return a + b

print(add(2, 3))`,
        output: 'calling add (2, 3)\n5',
        why: '`add` now names `wrapper`, which prints and then calls the original function with the same arguments, returning its result.',
      },
      {
        key: 'stacked',
        code: `def bold(fn):
    return lambda: "<b>" + fn() + "</b>"

def italic(fn):
    return lambda: "<i>" + fn() + "</i>"

@bold
@italic
def title():
    return "Hi"

print(title())`,
        output: '<b><i>Hi</i></b>',
        why: 'The stack means `title = bold(italic(title))`: `italic` wraps first, and `bold` wraps the result, so bold is the outer tag.',
      },
      {
        key: 'forgot-return',
        code: `def timed(fn):
    def wrapper(*args):
        fn(*args)
    return wrapper

@timed
def square(n):
    return n * n

print(square(4))`,
        output: 'None',
        why: 'The wrapper calls `fn` but does not return its result, so every decorated call returns `None`. Always `return fn(*args, **kwargs)` in a wrapper.',
      },
    ],
  ),
  ...b.fails(
    'py-decorator-bugs',
    3,
    'Work out what the decorated name refers to after decoration, then what the call passes to it.',
    [
      {
        key: 'wrapper-signature',
        question: 'Why does calling `greet("ana")` fail?',
        code: `def announce(fn):
    def wrapper():
        print("about to run")
        return fn()
    return wrapper

@announce
def greet(name):
    return "hi " + name

print(greet("ana"))`,
        error: 'TypeError',
        correct:
          '`greet` is now `wrapper`, which accepts no arguments; define it as `def wrapper(*args, **kwargs)` and call `fn(*args, **kwargs)`',
        wrong: [
          'Decorated functions cannot take parameters',
          '`fn()` is called before `print`, so the order is wrong',
          '`announce` must be defined after `greet`',
        ],
        why: 'After decoration, the call `greet("ana")` is a call to `wrapper("ana")`, which takes 0 positional arguments. A generic wrapper forwards `*args, **kwargs` so it fits any function.',
      },
      {
        key: 'factory-without-call',
        question: 'The decorator works with `@repeat(2)`. Why does this version fail?',
        code: `def repeat(times):
    def decorator(fn):
        def wrapper(*args):
            return [fn(*args) for _ in range(times)]
        return wrapper
    return decorator

@repeat
def roll():
    return 4

print(roll())`,
        error: 'TypeError',
        correct:
          'Without parentheses, `repeat` receives `roll` as `times` and returns `decorator`, so `roll()` calls `decorator()` without its `fn` argument',
        wrong: [
          '`times` defaults to 1 when the decorator is used without parentheses',
          '`roll` takes no arguments, so `wrapper(*args)` fails',
          'A decorator factory must be a class',
        ],
        why: '`@repeat` means `roll = repeat(roll)`, which is the inner `decorator` function. Calling it with no arguments raises `TypeError: missing 1 required positional argument: \'fn\'`. Use `@repeat(2)`.',
      },
    ],
  ),
  ...b.blank(
    'py-functools-wraps',
    4,
    'Without help, the wrapper replaces the original function’s name and docstring.',
    [
      {
        key: 'wraps',
        prompt: 'Complete the decorator so the decorated function keeps its name and docstring.',
        template: `import functools

def retry(fn):
    @functools.{{blank:helper}}(fn)
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs)
    return wrapper

@retry
def fetch_orders():
    """Load orders from the API."""
    return []

print(fetch_orders.__name__, "-", fetch_orders.__doc__)
assert fetch_orders.__name__ == "fetch_orders"`,
        blanks: { helper: ['wraps'] },
        why: '`functools.wraps(fn)` copies `__name__`, `__doc__`, `__qualname__` and more onto the wrapper and sets `__wrapped__`. Without it, the function would report the name `wrapper`, confusing logs, debuggers and tools.',
      },
      {
        key: 'counter',
        prompt: 'Complete the call-counting decorator: return the wrapper and keep the original metadata.',
        template: `from functools import wraps

def count_calls(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        wrapper.calls += 1
        return fn(*args, **kwargs)
    wrapper.calls = 0
    return {{blank:ret}}

@count_calls
def ping():
    return "pong"

ping()
ping()
print(ping.__name__, ping.calls)
assert ping.calls == 2`,
        blanks: { ret: ['wrapper'] },
        why: 'A decorator must return the replacement function. Returning `fn` would undo the decoration, and returning `wrapper()` would call it immediately. Function attributes like `calls` are a simple place to keep per-function state.',
      },
    ],
  ),
  ...b.output(
    'py-functools-tools',
    4,
    [
      '`partial` fixes some arguments of a function; `reduce` folds an iterable into one value.',
      '`lru_cache` remembers results per argument combination.',
    ],
    [
      {
        key: 'partial',
        code: `from functools import partial

def price(amount, rate, currency="EUR"):
    return f"{amount * rate:.2f} {currency}"

to_usd = partial(price, rate=1.1, currency="USD")
print(to_usd(10), to_usd(20, currency="CAD"))`,
        output: '11.00 USD 22.00 CAD',
        why: '`partial` stores the given keyword arguments; calls can still override them, as the second call does for `currency`.',
      },
      {
        key: 'reduce',
        code: `from functools import reduce

merged = reduce(lambda acc, d: acc | d, [{"a": 1}, {"b": 2}, {"a": 3}], {})
print(merged)`,
        output: "{'a': 3, 'b': 2}",
        why: '`reduce` starts from `{}` and merges each dict into the accumulator left to right, so the later `"a": 3` wins while `"a"` keeps its first position.',
      },
      {
        key: 'lru-cache',
        code: `from functools import lru_cache

@lru_cache(maxsize=None)
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)

print(fib(30))
info = fib.cache_info()
print(info.misses, info.hits)`,
        output: '832040\n31 28',
        why: 'Each `n` from 0 to 30 is computed once (31 misses); the other recursive calls are answered from the cache (28 hits). Without the cache, `fib(30)` makes more than a million calls.',
      },
    ],
  ),
  ...b.output(
    'py-decorator-factories',
    5,
    [
      '`@retry(times=3)` first calls `retry(times=3)`, which must return the actual decorator.',
      'Decorators run once, when the `def` statement executes, not on every call.',
    ],
    [
      {
        key: 'factory',
        code: `import functools

def retry(times):
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args):
            for attempt in range(1, times + 1):
                try:
                    return fn(*args)
                except ConnectionError:
                    print("attempt", attempt, "failed")
            raise RuntimeError("gave up")
        return wrapper
    return decorator

calls = iter([ConnectionError, ConnectionError, "ok"])

@retry(times=3)
def fetch():
    result = next(calls)
    if result is ConnectionError:
        raise ConnectionError
    return result

print(fetch())`,
        output: 'attempt 1 failed\nattempt 2 failed\nok',
        why: 'Three levels: `retry(3)` returns `decorator`, which receives `fetch` and returns `wrapper`. The wrapper retries on `ConnectionError` and returns as soon as a call succeeds.',
      },
      {
        key: 'definition-time',
        code: `registry = {}

def route(path):
    print("registering", path)
    def decorator(fn):
        registry[path] = fn
        return fn
    return decorator

@route("/home")
def home():
    return "home page"

print("defined")
print(registry["/home"](), home())`,
        output: 'registering /home\ndefined\nhome page home page',
        why: 'The decorator code runs when `def home` is executed, before anything calls `home`. Returning `fn` unchanged (instead of a wrapper) registers the function without altering it, which is how web routing decorators work.',
      },
      {
        key: 'class-decorator',
        code: `def singleton(cls):
    instances = {}
    def get(*args):
        if cls not in instances:
            instances[cls] = cls(*args)
        return instances[cls]
    return get

@singleton
class Settings:
    def __init__(self, env):
        self.env = env

a = Settings("prod")
b = Settings("test")
print(a is b, b.env, type(Settings).__name__)`,
        output: 'True prod function',
        why: 'Decorators work on classes too: `Settings` is replaced by the `get` function, so the name no longer refers to a class. The second call returns the cached instance and ignores `"test"`.',
      },
    ],
  ),
];
