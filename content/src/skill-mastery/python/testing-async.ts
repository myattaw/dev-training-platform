import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Testing and debugging (assert, unittest, unittest.mock, tracebacks) and
 * async programming with asyncio. Test suites run in-process with their
 * report written to a StringIO, so the printed output is deterministic.
 */

const b = programBuilders('python');

/** Runs the TestCase classes of a snippet in-process and prints a summary line. */
const RUN = `import io
import unittest

def run(*cases):
    loader = unittest.defaultTestLoader
    suite = unittest.TestSuite(loader.loadTestsFromTestCase(c) for c in cases)
    result = unittest.TextTestRunner(stream=io.StringIO()).run(suite)
    print("run", result.testsRun, "failures", len(result.failures), "errors", len(result.errors))
    return result`;

// ---------------------------------------------------------------- Testing and debugging

export const testingFamilies: readonly QuestionSource[] = [
  ...b.fails(
    'py-assert-statement',
    1,
    '`assert condition, message` raises `AssertionError` with the message when the condition is false.',
    [
      {
        key: 'message',
        question: 'What happens when this check runs?',
        code: `def apply_discount(price, percent):
    assert 0 <= percent <= 100, f"bad percent: {percent}"
    return price * (100 - percent) / 100

print(apply_discount(80, 25))
print(apply_discount(80, 150))`,
        error: 'AssertionError: bad percent: 150',
        correct:
          'The first call prints `60.0`; the second raises `AssertionError: bad percent: 150`',
        wrong: [
          'Both calls print a value; `assert` only logs a warning',
          'The second call returns `None` because the assertion failed',
          'The second call raises `ValueError: bad percent: 150`',
        ],
        why: 'A failed `assert` raises `AssertionError` with the optional message. Note that `python -O` removes assert statements, so use them for internal invariants and tests, not for validating user input.',
      },
      {
        key: 'tuple-trap',
        question:
          'A developer wrapped the assert in parentheses to split it over lines. What happens?',
        code: `total = 10
assert total == 10, "total ok"
assert (total > 0)
assert total < 5, (
    "total too large"
)
print("all checks passed")`,
        error: 'AssertionError: total too large',
        correct:
          'The last assert fails with `AssertionError: total too large`; the parentheses only wrap the message, which is fine',
        wrong: [
          'All asserts pass and the program prints `all checks passed`',
          'The program raises `SyntaxError` because the message spans lines',
          'The last assert is always true because the message is a non-empty tuple',
        ],
        why: '`10 < 5` is false, so the assertion fails with the message. The real trap is `assert (total < 5, "msg")`: a parenthesized condition plus message is a non-empty tuple, always truthy, and CPython warns about it. Here only the message is parenthesized.',
      },
    ],
  ),
  ...b.output(
    'py-unittest-results',
    2,
    [
      'A test fails when an assertion method fails, and errors when any other exception escapes.',
      '`testsRun`, `failures` and `errors` summarize a run.',
    ],
    [
      {
        key: 'pass-fail-error',
        code: `${RUN}

def slugify(title):
    return title.strip().lower().replace(" ", "-")

class SlugTests(unittest.TestCase):
    def test_spaces(self):
        self.assertEqual(slugify("Hello World"), "hello-world")

    def test_trim(self):
        self.assertEqual(slugify("  Hi "), "hi")

    def test_punctuation(self):
        self.assertEqual(slugify("Hi!"), "hi")

    def test_none(self):
        slugify(None)

run(SlugTests)`,
        output: 'run 4 failures 1 errors 1',
        why: '`test_punctuation` fails (the `!` is kept), which is a failure because `assertEqual` raised. `test_none` raises `AttributeError` from the code under test, which unittest reports as an error, not a failure.',
      },
      {
        key: 'names-matter',
        code: `${RUN}

class MathTests(unittest.TestCase):
    def test_add(self):
        self.assertEqual(1 + 1, 2)

    def check_subtract(self):
        self.assertEqual(3 - 1, 5)

    def testMultiply(self):
        self.assertEqual(2 * 3, 6)

run(MathTests)`,
        output: 'run 2 failures 0 errors 0',
        why: 'The loader collects methods whose names start with `test`. `check_subtract` is never run, so its wrong expectation goes unnoticed. `testMultiply` matches because the prefix is `test`.',
      },
    ],
  ),
  ...b.blank(
    'py-unittest-assertions',
    2,
    'Use the specific assertion method: it gives better failure messages than `assertTrue`.',
    [
      {
        key: 'assert-raises',
        prompt: 'Complete the test so it passes only if `withdraw` raises `ValueError`.',
        template: `${RUN}

def withdraw(balance, amount):
    if amount > balance:
        raise ValueError("insufficient funds")
    return balance - amount

class WithdrawTests(unittest.TestCase):
    def test_overdraw(self):
        with self.{{blank:method}}(ValueError):
            withdraw(10, 50)

    def test_ok(self):
        self.assertEqual(withdraw(50, 10), 40)

result = run(WithdrawTests)
assert result.wasSuccessful()`,
        blanks: { method: ['assertRaises'] },
        why: '`assertRaises` used as a context manager passes when the block raises the given exception and fails if nothing is raised. `assertRaisesRegex` also checks the message.',
      },
      {
        key: 'assert-in',
        prompt: 'Complete the assertion that checks the tag appears in the list.',
        template: `${RUN}

class TagTests(unittest.TestCase):
    def test_contains(self):
        tags = ["python", "testing"]
        self.{{blank:method}}("python", tags)

result = run(TagTests)
assert result.wasSuccessful()`,
        blanks: { method: ['assertIn'] },
        why: '`assertIn(member, container)` reports both values on failure. `assertTrue("python" in tags)` would only say `False is not true`.',
      },
    ],
  ),
  ...b.output(
    'py-setup-isolation',
    3,
    [
      '`setUp` runs before every test method, on a fresh instance of the test class.',
      'Class attributes are shared between tests, so mutating them leaks state.',
    ],
    [
      {
        key: 'setup-each',
        code: `${RUN}

class CartTests(unittest.TestCase):
    def setUp(self):
        print("setUp")
        self.cart = []

    def test_add(self):
        self.cart.append("pen")
        self.assertEqual(len(self.cart), 1)

    def test_empty(self):
        self.assertEqual(self.cart, [])

run(CartTests)`,
        output: 'setUp\nsetUp\nrun 2 failures 0 errors 0',
        why: '`setUp` runs once per test, so each test starts with a new empty cart. The order of tests does not matter because they share nothing.',
      },
      {
        key: 'shared-state',
        code: `${RUN}

class CartTests(unittest.TestCase):
    cart = []

    def test_add(self):
        self.cart.append("pen")
        self.assertEqual(len(self.cart), 1)

    def test_add_two(self):
        self.cart.extend(["ink", "pad"])
        self.assertEqual(len(self.cart), 2)

run(CartTests)`,
        output: 'run 2 failures 1 errors 0',
        why: 'The list is a class attribute, shared by every test instance. Tests run in alphabetical order: `test_add` leaves one item behind, so `test_add_two` sees 3 items and fails. Each test passes on its own, a classic order-dependent test.',
      },
    ],
  ),
  ...b.output(
    'py-mock-basics',
    3,
    [
      'A `Mock` records every call; `return_value` sets what calls return.',
      '`side_effect` can be an exception to raise or an iterable of successive results.',
    ],
    [
      {
        key: 'return-and-assert',
        code: `from unittest.mock import Mock

def notify(sender, user):
    return sender.send(user["email"], "Welcome!")

sender = Mock()
sender.send.return_value = "queued"
print(notify(sender, {"email": "a@x.io"}))
sender.send.assert_called_once_with("a@x.io", "Welcome!")
print(sender.send.call_count, sender.send.call_args.args[0])`,
        output: 'queued\n1 a@x.io',
        why: 'Attributes of a `Mock` are mocks too, so `sender.send` exists automatically. The configured return value is returned, and the call is recorded for `assert_called_once_with`, `call_count` and `call_args`.',
      },
      {
        key: 'side-effect',
        code: `from unittest.mock import Mock

api = Mock()
api.fetch.side_effect = [TimeoutError("slow"), {"id": 1}]

def fetch_with_retry(client):
    try:
        return client.fetch()
    except TimeoutError:
        return client.fetch()

print(fetch_with_retry(api), api.fetch.call_count)`,
        output: "{'id': 1} 2",
        why: 'An iterable `side_effect` provides one result per call; exception instances in it are raised. This makes retry logic easy to test without a real network.',
      },
    ],
  ),
  ...b.output(
    'py-patch-where-used',
    4,
    [
      '`patch("module.name")` replaces the name in that module’s namespace for the duration of the block.',
      'Patch the name where the code under test looks it up.',
    ],
    [
      {
        key: 'main-module',
        code: `from unittest.mock import patch

def get_rate(currency):
    raise ConnectionError("no network in tests")

def convert(amount, currency):
    return round(amount * get_rate(currency), 2)

with patch("__main__.get_rate", return_value=1.1) as fake:
    print(convert(10, "USD"))
    print(fake.call_args.args)
try:
    convert(10, "USD")
except ConnectionError:
    print("restored")`,
        output: "11.0\n('USD',)\nrestored",
        why: '`convert` looks up `get_rate` in this module’s globals at call time, so patching `__main__.get_rate` affects it. When the `with` block ends, the original function is restored.',
      },
      {
        key: 'from-import',
        code: `from unittest.mock import patch
from os.path import basename

def file_label(path):
    return "file: " + basename(path)

with patch("os.path.basename", return_value="PATCHED"):
    print(file_label("/data/a.csv"))
with patch("__main__.basename", return_value="PATCHED"):
    print(file_label("/data/a.csv"))`,
        output: 'file: a.csv\nfile: PATCHED',
        why: '`from os.path import basename` copied the function into this module. Patching `os.path.basename` replaces the attribute on `os.path`, but `file_label` uses its own `basename` name. Patching `__main__.basename` hits the name actually used.',
      },
    ],
  ),
  ...b.fails(
    'py-reading-tracebacks',
    2,
    'Read a traceback from the bottom: the last line is the error, the frame above it is where it happened.',
    [
      {
        key: 'none-from-sort',
        question:
          "The traceback ends with `TypeError: 'NoneType' object is not subscriptable` on the `return` line. What is the bug?",
        code: `def top_scores(scores):
    ranked = scores.sort(reverse=True)
    return ranked[:3]

print(top_scores([50, 90, 70, 80]))`,
        error: "TypeError: 'NoneType' object is not subscriptable",
        correct:
          '`list.sort()` returns `None`, so `ranked` is `None`; use `ranked = sorted(scores, reverse=True)`',
        wrong: [
          'Slicing with `[:3]` is not allowed on lists of ints',
          '`scores` is `None` because it was passed incorrectly',
          '`reverse=True` is not a valid argument for `sort`',
        ],
        why: '"\'NoneType\' object is not subscriptable" means something was `None` where a sequence was expected. The variable being subscripted is `ranked`, which came from an in-place method that returns `None`.',
      },
      {
        key: 'index-off-by-one',
        question: 'Which change fixes the `IndexError`?',
        code: `def pairs(items):
    result = []
    for i in range(len(items)):
        result.append((items[i], items[i + 1]))
    return result

print(pairs(["a", "b", "c"]))`,
        error: 'IndexError: list index out of range',
        correct: 'Loop over `range(len(items) - 1)`, or use `zip(items, items[1:])`',
        wrong: [
          'Loop over `range(1, len(items) + 1)`',
          'Use `items[i - 1]` instead of `items[i + 1]`, keeping the same range',
          'Catch `IndexError` and return the partial result',
        ],
        why: 'On the last iteration `i + 1` equals `len(items)`, one past the end. Stopping one step earlier fixes it. `items[i - 1]` would silently pair the first item with the last one, and catching the error hides the bug.',
      },
      {
        key: 'attribute-on-str',
        question:
          "The traceback shows `AttributeError: 'str' object has no attribute 'get'`. What is the cause?",
        code: `import json

payload = json.dumps({"user": {"name": "ana"}})
data = json.loads(payload)["user"]
user = json.dumps(data)
print(user.get("name"))`,
        error: "AttributeError: 'str' object has no attribute 'get'",
        correct:
          '`json.dumps` turned `data` back into a JSON string; use the dict `data` directly (`data.get("name")`)',
        wrong: [
          '`json.loads` returns a string, so the whole payload must be parsed twice',
          'Dicts loaded from JSON do not support `get`',
          'The key `"name"` is missing',
        ],
        why: 'The error names the actual type: `user` is a `str`. `dumps` serializes to a string and `loads` parses into Python objects; mixing them up is a frequent bug when handling API payloads.',
      },
    ],
  ),
  ...b.concept(
    'py-test-fixtures-concepts',
    3,
    'Think about how much setup each test needs, and how expensive it is.',
    [
      {
        key: 'setupclass',
        question:
          'Tests need an expensive, read-only reference dataset and a fresh shopping cart each. Where should each be created in a `unittest.TestCase`?',
        correct:
          'Load the read-only dataset once in `setUpClass` and create the cart in `setUp`, so tests never share mutable state',
        wrong: [
          'Create both in `setUpClass` for speed; tests can reset the cart themselves',
          'Create both at module level so every test class can use them',
          'Create both inside each test method and never use setup hooks',
        ],
        why: '`setUpClass` runs once per class and suits expensive immutable fixtures; `setUp` runs before each test and gives every test its own mutable objects. Shared mutable state causes order-dependent tests.',
      },
      {
        key: 'pytest-fixture',
        question:
          'What does a pytest fixture with `yield` provide that a plain helper function does not?',
        correct:
          'Setup before the `yield`, the yielded value injected into tests that name it as a parameter, and teardown after the `yield` even when the test fails',
        wrong: [
          'It makes the test run in a separate process',
          'It caches the test result so later runs are skipped',
          'It replaces assertions with automatic comparisons',
        ],
        why: 'Fixtures are dependency injection for tests, with scoping (`function`, `module`, `session`) and guaranteed cleanup after the `yield`. pytest itself must be installed separately; unittest is in the standard library.',
      },
    ],
  ),
  ...b.output(
    'py-mock-pitfalls',
    5,
    [
      'A plain `Mock` accepts any attribute, so typos in the code under test go unnoticed.',
      '`create_autospec` or `spec=` makes the mock follow the real interface.',
    ],
    [
      {
        key: 'typo-passes',
        code: `from unittest.mock import Mock, create_autospec

class Mailer:
    def send(self, to, body):
        raise NotImplementedError

def welcome(mailer, email):
    mailer.sned(email, "hi")
    return "done"

loose = Mock()
print(welcome(loose, "a@x.io"), loose.send.called)

strict = create_autospec(Mailer, instance=True)
try:
    welcome(strict, "a@x.io")
except AttributeError:
    print("caught typo")`,
        output: 'done False\ncaught typo',
        why: 'The plain mock happily creates `sned`, so the test passes while the real code is broken. An autospecced mock only has the attributes of `Mailer` and raises `AttributeError` for the typo.',
      },
      {
        key: 'signature',
        code: `from unittest.mock import create_autospec

def charge(customer_id, amount, currency="EUR"):
    raise NotImplementedError

fake = create_autospec(charge, return_value="ok")
print(fake(7, 10))
try:
    fake(7)
except TypeError:
    print("wrong call caught")`,
        output: 'ok\nwrong call caught',
        why: 'An autospec checks calls against the real signature, so a call missing `amount` raises `TypeError` just as the real function would. A plain `Mock` would accept any arguments.',
      },
      {
        key: 'misspelled-assert',
        code: `from unittest.mock import Mock

m = Mock()
m.save({"id": 1})
try:
    m.save.assert_called_once_wiht({"id": 1})
except AttributeError:
    print("AttributeError")
m.save.assert_called_once_with({"id": 1})
print("verified")`,
        output: 'AttributeError\nverified',
        why: 'Mocks refuse attributes that start with `assert` (and a few misspellings such as `assret`) unless they are real assertion methods, precisely so a typo like `assert_called_once_wiht` cannot silently pass.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Async programming

export const asyncFamilies: readonly QuestionSource[] = [
  ...b.output(
    'py-async-basics',
    1,
    [
      '`async def` defines a coroutine function; `await` runs a coroutine and gives its result.',
      '`asyncio.run(main())` starts the event loop and runs the top-level coroutine.',
    ],
    [
      {
        key: 'await-result',
        code: `import asyncio

async def fetch_price(sku):
    await asyncio.sleep(0)
    return {"A1": 9.5}.get(sku, 0)

async def main():
    price = await fetch_price("A1")
    print("price", price)

asyncio.run(main())`,
        output: 'price 9.5',
        why: '`await fetch_price("A1")` runs the coroutine until it returns and evaluates to its return value. `asyncio.run` drives the whole thing from synchronous code.',
      },
      {
        key: 'sequential',
        code: `import asyncio

async def step(name):
    print("start", name)
    await asyncio.sleep(0)
    print("end", name)

async def main():
    await step("a")
    await step("b")

asyncio.run(main())`,
        output: 'start a\nend a\nstart b\nend b',
        why: 'Awaiting coroutines one after another runs them sequentially: `step("b")` does not start until `step("a")` has finished. Concurrency needs tasks, for example via `asyncio.gather` or a `TaskGroup`.',
      },
    ],
  ),
  ...b.outputChoice(
    'py-coroutine-not-run',
    2,
    'Calling a coroutine function creates a coroutine object; nothing runs until it is awaited or scheduled.',
    [
      {
        key: 'no-await',
        code: `import asyncio

async def save(log):
    log.append("saved")
    return True

async def main():
    log = []
    result = save(log)
    print(type(result).__name__, log)
    result.close()

asyncio.run(main())`,
        correct: 'coroutine []',
        wrong: ["bool ['saved']", "coroutine ['saved']", 'bool []'],
        why: 'Without `await`, `save(log)` only creates a coroutine object; its body never runs, so nothing is appended. Python warns "coroutine was never awaited" for such objects (the example closes it to stay quiet).',
      },
      {
        key: 'truthy-coroutine',
        code: `import asyncio

async def is_admin(user):
    return user == "root"

async def main():
    check = is_admin("guest")
    print("allowed" if check else "denied")
    print("allowed" if await is_admin("guest") else "denied")
    check.close()

asyncio.run(main())`,
        correct: 'allowed\ndenied',
        wrong: ['denied\ndenied', 'allowed\nallowed', 'denied\nallowed'],
        why: 'A coroutine object is truthy, so the check without `await` always "passes" — a dangerous bug in permission logic. With `await`, the real result `False` is used.',
      },
    ],
  ),
  ...b.output(
    'py-gather',
    2,
    [
      '`asyncio.gather` runs awaitables concurrently and returns their results in the order they were passed.',
      'Coroutines take turns at each `await` that suspends.',
    ],
    [
      {
        key: 'order',
        code: `import asyncio

async def work(name, steps):
    for _ in range(steps):
        await asyncio.sleep(0)
    print("finished", name)
    return name.upper()

async def main():
    results = await asyncio.gather(work("slow", 3), work("fast", 1))
    print(results)

asyncio.run(main())`,
        output: "finished fast\nfinished slow\n['SLOW', 'FAST']",
        why: 'Both coroutines run concurrently, so `fast` finishes first. The results list still follows the argument order, not completion order.',
      },
      {
        key: 'return-exceptions',
        code: `import asyncio

async def load(n):
    await asyncio.sleep(0)
    if n == 2:
        raise ValueError(f"bad {n}")
    return n * 10

async def main():
    results = await asyncio.gather(*(load(n) for n in [1, 2, 3]), return_exceptions=True)
    print([r if not isinstance(r, Exception) else repr(r) for r in results])

asyncio.run(main())`,
        output: '[10, "ValueError(\'bad 2\')", 30]',
        why: 'With `return_exceptions=True`, a failing awaitable’s exception is placed in the results list instead of being raised, so the other results are still available.',
      },
    ],
  ),
  ...b.fails(
    'py-forgot-await',
    3,
    'Using the result of an async function without `await` gives you a coroutine object, not the value.',
    [
      {
        key: 'subscript',
        question: 'Why does this program fail?',
        code: `import asyncio

async def get_user(user_id):
    await asyncio.sleep(0)
    return {"id": user_id, "name": "ana"}

async def main():
    user = get_user(1)
    print(user["name"])

asyncio.run(main())`,
        error: 'TypeError',
        correct:
          '`get_user(1)` returns a coroutine object because it is not awaited; write `user = await get_user(1)`',
        wrong: [
          '`asyncio.sleep(0)` returns immediately without a value, so the dict is lost',
          'Async functions cannot return dicts',
          '`asyncio.run` must be called inside `main`',
        ],
        why: 'The coroutine object has no `__getitem__`, so `user["name"]` raises `TypeError: \'coroutine\' object is not subscriptable`. Python also warns that the coroutine was never awaited.',
      },
      {
        key: 'nested-run',
        question: 'Why does this program fail?',
        code: `import asyncio

async def fetch():
    return 42

async def main():
    value = asyncio.run(fetch())
    print(value)

asyncio.run(main())`,
        error: 'RuntimeError',
        correct:
          '`asyncio.run` cannot be called while an event loop is already running; inside a coroutine use `await fetch()`',
        wrong: [
          '`fetch` must contain at least one `await` to be a coroutine',
          '`asyncio.run` returns a task, which cannot be printed',
          'Only one coroutine may exist at a time',
        ],
        why: '`asyncio.run` creates and runs a new event loop; it is meant for the program’s entry point. Nested calls raise `RuntimeError: asyncio.run() cannot be called from a running event loop`.',
      },
    ],
  ),
  ...b.codeChoice(
    'py-blocking-in-async',
    3,
    'Inside a coroutine, a blocking call stops the whole event loop, not just that coroutine.',
    [
      {
        key: 'time-sleep',
        question:
          'These two downloads were supposed to overlap, but the total time is the sum of both. What is the cause and the fix?',
        code: `import asyncio
import time

async def download(name):
    time.sleep(0.01)
    return name

async def main():
    print(await asyncio.gather(download("a"), download("b")))

asyncio.run(main())`,
        correct:
          '`time.sleep` blocks the event loop, so the coroutines cannot overlap; use `await asyncio.sleep(...)` (or run blocking work with `await asyncio.to_thread(...)`)',
        wrong: [
          '`gather` runs coroutines sequentially by design; use a `for` loop instead',
          'The coroutines need `async with` to run concurrently',
          'Concurrency in asyncio requires calling `asyncio.run` once per download',
        ],
        why: 'asyncio is cooperative: coroutines only switch at an `await` that suspends. `time.sleep` (and blocking I/O such as `requests.get`) holds the thread, so nothing else runs. `asyncio.sleep` yields to the loop; `asyncio.to_thread` moves blocking calls to a worker thread.',
      },
      {
        key: 'cpu-bound',
        question:
          'A coroutine computes a large report with a pure Python loop for several seconds. What is the best way to keep the server responsive?',
        code: `import asyncio

def build_report(n):
    return sum(i * i for i in range(n))

async def handler():
    return await asyncio.to_thread(build_report, 1000)

print(asyncio.run(handler()))`,
        correct:
          'Move the work off the event loop, as shown with `asyncio.to_thread` (or a process pool for heavy CPU work), so other coroutines keep running',
        wrong: [
          'Mark `build_report` as `async def`; that makes the loop run in parallel automatically',
          'Add `await asyncio.sleep(0)` before calling `build_report`',
          'Call `build_report` inside `asyncio.gather` with a single argument',
        ],
        why: 'Making a function `async` does not make its loop non-blocking: without suspending `await`s inside, it still monopolizes the event loop. A thread frees the loop; for CPU-heavy work, a process pool also avoids the GIL in standard builds.',
      },
    ],
  ),
  ...b.output(
    'py-task-interleaving',
    4,
    [
      '`asyncio.create_task` schedules a coroutine to run soon; it starts at the next suspension point of the current coroutine.',
      '`await asyncio.sleep(0)` yields control to other ready tasks exactly once.',
    ],
    [
      {
        key: 'create-task',
        code: `import asyncio

async def worker(name):
    print(name, "step 1")
    await asyncio.sleep(0)
    print(name, "step 2")

async def main():
    task = asyncio.create_task(worker("w"))
    print("task created")
    await asyncio.sleep(0)
    print("main resumed")
    await task

asyncio.run(main())`,
        output: 'task created\nw step 1\nmain resumed\nw step 2',
        why: '`create_task` does not run the worker immediately. When `main` awaits `sleep(0)`, the worker runs to its first `await`. Then `main` resumes, and `await task` lets the worker finish.',
      },
      {
        key: 'round-robin',
        code: `import asyncio

async def count(name, n):
    for i in range(n):
        print(name, i)
        await asyncio.sleep(0)

async def main():
    await asyncio.gather(count("a", 2), count("b", 3))

asyncio.run(main())`,
        output: 'a 0\nb 0\na 1\nb 1\nb 2',
        why: 'Each `sleep(0)` hands control to the next ready task, so the two coroutines alternate. When `a` finishes, `b` continues alone.',
      },
    ],
  ),
  ...b.output(
    'py-taskgroup',
    4,
    [
      '`async with asyncio.TaskGroup() as tg:` waits for all tasks created with `tg.create_task` when the block exits.',
      'If a task fails, the group cancels the remaining tasks and raises an `ExceptionGroup`.',
    ],
    [
      {
        key: 'results',
        code: `import asyncio

async def price(sku):
    await asyncio.sleep(0)
    return {"A": 3, "B": 5}[sku]

async def main():
    async with asyncio.TaskGroup() as tg:
        a = tg.create_task(price("A"))
        b = tg.create_task(price("B"))
    print(a.result() + b.result())

asyncio.run(main())`,
        output: '8',
        why: 'Leaving the `async with` block waits for every task, so both results are available afterwards. Task groups (Python 3.11+) are the structured alternative to `gather`.',
      },
      {
        key: 'failure-cancels',
        code: `import asyncio

async def slow(log):
    try:
        await asyncio.sleep(10)
        log.append("slow finished")
    except asyncio.CancelledError:
        log.append("slow canceled")
        raise

async def broken():
    await asyncio.sleep(0)
    raise ValueError("bad data")

async def main():
    log = []
    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(slow(log))
            tg.create_task(broken())
    except* ValueError as group:
        log.append(f"caught {group.exceptions[0]}")
    print(log)

asyncio.run(main())`,
        output: "['slow canceled', 'caught bad data']",
        why: 'When `broken` fails, the task group cancels `slow` (which re-raises `CancelledError` after cleaning up) and then raises an `ExceptionGroup` containing the `ValueError`, handled here with `except*`. The program does not wait 10 seconds.',
      },
    ],
  ),
  ...b.output(
    'py-timeouts',
    4,
    [
      '`asyncio.timeout(seconds)` cancels the work inside the block when time runs out and raises `TimeoutError`.',
      'The awaited coroutine sees a `CancelledError`, so its `finally` blocks run.',
    ],
    [
      {
        key: 'timeout-block',
        code: `import asyncio

async def slow_query():
    try:
        await asyncio.sleep(10)
        return "rows"
    finally:
        print("query cleaned up")

async def main():
    try:
        async with asyncio.timeout(0.05):
            print(await slow_query())
    except TimeoutError:
        print("timed out")

asyncio.run(main())`,
        output: 'query cleaned up\ntimed out',
        why: 'When the deadline passes, the task inside is canceled; `slow_query`’s `finally` runs, and the context manager converts the cancellation into `TimeoutError` (the built-in one, which `asyncio.TimeoutError` aliases since 3.11).',
      },
      {
        key: 'wait-for',
        code: `import asyncio

async def fast():
    await asyncio.sleep(0)
    return "fast result"

async def main():
    print(await asyncio.wait_for(fast(), timeout=5))
    try:
        await asyncio.wait_for(asyncio.sleep(10), timeout=0.05)
    except TimeoutError:
        print("gave up")

asyncio.run(main())`,
        output: 'fast result\ngave up',
        why: '`wait_for` returns the result if the awaitable finishes in time and otherwise cancels it and raises `TimeoutError`.',
      },
    ],
  ),
  ...b.output(
    'py-async-concurrency-limits',
    5,
    [
      'An `asyncio.Semaphore(n)` allows at most `n` holders at once; others wait at `async with`.',
      '`async for` iterates an async generator, which can `await` between items.',
    ],
    [
      {
        key: 'semaphore',
        code: `import asyncio

active = 0
peak = 0

async def call_api(sem, n):
    global active, peak
    async with sem:
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0)
        active -= 1
        return n * 2

async def main():
    sem = asyncio.Semaphore(2)
    results = await asyncio.gather(*(call_api(sem, n) for n in range(5)))
    print(results, "peak", peak)

asyncio.run(main())`,
        output: '[0, 2, 4, 6, 8] peak 2',
        why: 'All five coroutines start, but only two can be inside the `async with sem` block at the same time, so the peak concurrency is 2. Results still come back in argument order.',
      },
      {
        key: 'async-generator',
        code: `import asyncio

async def pages(total):
    for page in range(1, total + 1):
        await asyncio.sleep(0)
        yield [f"item{page}a", f"item{page}b"]

async def main():
    items = []
    async for batch in pages(2):
        items.extend(batch)
    first = [b async for b in pages(3)]
    print(items, len(first))

asyncio.run(main())`,
        output: "['item1a', 'item1b', 'item2a', 'item2b'] 3",
        why: 'A function with both `async def` and `yield` is an async generator; `async for` (also inside comprehensions) awaits each item. It suits paginated APIs where fetching each page is itself asynchronous.',
      },
    ],
  ),
];
