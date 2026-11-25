import type { QuestionSource } from '@pracstack/content-model';
import { plain } from '../helpers';
import { programBuilders } from '../program-builders';

/*
 * Modules and packages; type hints. Module questions create their modules in a
 * fresh temporary directory first, so every import is real and checked.
 */

const b = programBuilders('python');

/** Setup lines that create a temporary import root; the snippet then writes modules into it. */
const SETUP = `import pathlib, sys, tempfile
root = pathlib.Path(tempfile.mkdtemp())
sys.path.insert(0, str(root))
# ---- setup above: create the module files ----`;

// ---------------------------------------------------------------- Modules and packages

export const modulesFamilies: readonly QuestionSource[] = [
  ...b.output(
    'py-name-main',
    1,
    [
      'A module’s `__name__` is `"__main__"` when it is run as a script, and its module name when it is imported.',
      'Code under `if __name__ == "__main__":` runs only when the file is executed directly.',
    ],
    [
      {
        key: 'imported',
        code: `${SETUP}
(root / "greetings.py").write_text('''
def hello(name):
    return "hello " + name

print("module name:", __name__)

if __name__ == "__main__":
    print("running demo")
''')

import greetings
print(greetings.hello("ana"))
print(__name__)`,
        output: 'module name: greetings\nhello ana\n__main__',
        why: 'When `greetings` is imported, its top-level code runs with `__name__ == "greetings"`, so the demo block is skipped. The script that was run directly has `__name__ == "__main__"`.',
      },
      {
        key: 'guard',
        code: `def main():
    print("tool started")

print("defining things")

if __name__ == "__main__":
    main()`,
        output: 'defining things\ntool started',
        why: 'Run as a script, the module’s `__name__` is `"__main__"`, so `main()` is called. If another module imported this file, only `"defining things"` would print and `main` would wait to be called.',
      },
    ],
  ),
  ...b.output(
    'py-import-forms',
    1,
    [
      '`import math` binds the name `math`; `from math import sqrt` binds only `sqrt`.',
      '`as` binds the imported object under another name.',
    ],
    [
      {
        key: 'three-forms',
        code: `import math
from statistics import mean as average
from os import path

print(math.sqrt(16), average([1, 2, 3]), path.basename("/data/report.csv"))`,
        output: '4.0 2 report.csv',
        why: '`math.sqrt` is reached through the module name, `average` is `statistics.mean` under an alias, and `path` is the `os.path` module bound directly. `mean` of ints that divides evenly returns an int (`2`).',
      },
      {
        key: 'module-object',
        code: `import json as j
print(type(j).__name__, j.__name__)
print(j.dumps({"ok": True}))`,
        output: 'module json\n{"ok": true}',
        why: 'An imported module is an ordinary object of type `module`, here bound to the alias `j`. Its `__name__` is still `json`. `json.dumps` writes `True` as `true`.',
      },
    ],
  ),
  ...b.fails(
    'py-import-errors',
    2,
    'Read the error class: `ModuleNotFoundError` means the module was not found, `ImportError` means a name inside it was not found, `NameError` means the name was never bound.',
    [
      {
        key: 'from-import-only',
        question: 'Why does this program fail?',
        code: `from math import sqrt

print(sqrt(25))
print(math.pi)`,
        error: 'NameError',
        correct:
          '`from math import sqrt` binds only `sqrt`; the name `math` is not defined, so add `import math` (or `from math import pi`)',
        wrong: [
          '`math.pi` was removed in Python 3',
          'A module can be imported only once per program',
          '`sqrt(25)` fails because it returns a float',
        ],
        why: "The `from` form loads the whole module but binds only the listed names in the current namespace. The first line prints `5.0`, then `math.pi` raises `NameError: name 'math' is not defined`.",
      },
      {
        key: 'missing-package',
        question:
          'This script works on the developer’s laptop but fails on the build server. What is the most likely cause?',
        code: `import pracstack_reports

print(pracstack_reports.render())`,
        error: 'ModuleNotFoundError',
        correct:
          'The package is not installed in the environment that runs the script; install it there (ideally from a pinned requirements file into the project’s virtual environment)',
        wrong: [
          'Module names cannot contain underscores',
          'The build server needs `from pracstack_reports import *` instead',
          'Python caches failed imports, so clearing `__pycache__` will fix it',
        ],
        why: '`ModuleNotFoundError` (a subclass of `ImportError`) means no module with that name is on `sys.path` for this interpreter. The usual cause is a different environment: another virtual environment, Python version or missing install step.',
      },
      {
        key: 'missing-name',
        question: 'Why does this import fail?',
        code: `${SETUP}
(root / "pricing.py").write_text('''
def net_price(gross):
    return round(gross / 1.2, 2)
''')

from pricing import gross_price
print(gross_price(10))`,
        error: 'ImportError',
        correct:
          'The module `pricing` exists but defines no `gross_price`, so `from pricing import gross_price` raises `ImportError: cannot import name`',
        wrong: [
          'It raises `ModuleNotFoundError` because `pricing` is not a package',
          'The function is created on first use, so the import should be `import pricing.gross_price`',
          'Modules written at run time cannot be imported',
        ],
        why: "The module was found and executed; only the requested name is missing. That gives `ImportError` with the message \"cannot import name 'gross_price' from 'pricing'\", unlike `ModuleNotFoundError` for a missing module.",
      },
    ],
  ),
  ...b.output(
    'py-module-caching',
    3,
    [
      'A module’s top-level code runs once, on the first import; later imports reuse the object cached in `sys.modules`.',
      'Every importer sees the same module object and its state.',
    ],
    [
      {
        key: 'runs-once',
        code: `${SETUP}
(root / "settings.py").write_text('''
print("loading settings")
values = {"debug": False}
''')

import settings
import settings
from settings import values
values["debug"] = True
print(settings.values["debug"], "settings" in sys.modules)`,
        output: 'loading settings\nTrue True',
        why: 'Only the first import executes the file; the second `import` and the `from` import reuse the cached module. `values` is the same dict object as `settings.values`, so the change is visible through both names.',
      },
      {
        key: 'registry',
        code: `${SETUP}
(root / "registry.py").write_text('''
handlers = []

def register(fn):
    handlers.append(fn.__name__)
    return fn
''')
(root / "plugins.py").write_text('''
import registry

@registry.register
def export_csv():
    pass
''')

import registry
import plugins
print(registry.handlers)`,
        output: "['export_csv']",
        why: 'Importing `plugins` runs its top-level code, which registers the function in the shared `registry` module. Both modules refer to the same cached `registry` object, a common plugin pattern.',
      },
    ],
  ),
  ...b.output(
    'py-packages',
    3,
    [
      'A package is a directory of modules; its `__init__.py` runs when the package is imported.',
      'Inside a package, `from .module import name` is a relative import from the same package.',
    ],
    [
      {
        key: 'init-exports',
        code: `${SETUP}
pkg = root / "shop"
pkg.mkdir()
(pkg / "cart.py").write_text('''
from .pricing import with_tax

def total(prices):
    return with_tax(sum(prices))
''')
(pkg / "pricing.py").write_text('''
def with_tax(amount):
    return round(amount * 1.2, 2)
''')
(pkg / "__init__.py").write_text('''
from .cart import total

__all__ = ["total"]
''')

import shop
print(shop.total([10, 5]))
print(shop.pricing.with_tax(1))`,
        output: '18.0\n1.2',
        why: 'Importing `shop` runs `__init__.py`, which imports `shop.cart`, which in turn imports `shop.pricing` with a relative import. Importing a submodule also sets it as an attribute of the package, so `shop.pricing` is available.',
      },
      {
        key: 'submodule-not-loaded',
        code: `${SETUP}
pkg = root / "tools"
pkg.mkdir()
(pkg / "__init__.py").write_text("")
(pkg / "text.py").write_text('''
def shout(s):
    return s.upper() + "!"
''')

import tools
try:
    tools.text.shout("hi")
except AttributeError:
    print("not loaded yet")
import tools.text
print(tools.text.shout("hi"))`,
        output: 'not loaded yet\nHI!',
        why: 'Importing a package does not import its submodules unless `__init__.py` does it. After `import tools.text`, the submodule is loaded and bound as an attribute of the package.',
      },
    ],
  ),
  ...b.output(
    'py-from-import-binding',
    4,
    [
      '`from module import name` copies the current binding into your namespace.',
      'Rebinding the name in the module later does not update your copy; mutating the shared object does.',
    ],
    [
      {
        key: 'rebind',
        code: `${SETUP}
(root / "config.py").write_text('''
DEBUG = False

def enable_debug():
    global DEBUG
    DEBUG = True
''')

import config
from config import DEBUG, enable_debug
enable_debug()
print(DEBUG, config.DEBUG)`,
        output: 'False True',
        why: '`from config import DEBUG` bound the local name to the object `False` at import time. `enable_debug` rebinds the module’s global, which only `config.DEBUG` sees. Read changing module state through the module (`config.DEBUG`).',
      },
      {
        key: 'patching',
        code: `${SETUP}
(root / "clock.py").write_text('''
def today():
    return "2026-11-25"
''')
(root / "report.py").write_text('''
from clock import today

def header():
    return "Report " + today()
''')

import clock
import report
clock.today = lambda: "1999-01-01"
print(report.header())
report.today = lambda: "2000-01-01"
print(report.header())`,
        output: 'Report 2026-11-25\nReport 2000-01-01',
        why: '`report` looks up `today` in its own namespace, where `from clock import today` stored the original function. Replacing `clock.today` does not affect it; replacing `report.today` does. This is why mocks must patch the name where it is looked up.',
      },
    ],
  ),
  ...b.fails(
    'py-circular-import',
    5,
    'While a module is being imported, its partially initialized object is already in `sys.modules`.',
    [
      {
        key: 'cannot-import',
        question: 'Why does importing `orders` fail?',
        code: `${SETUP}
(root / "orders.py").write_text('''
from customers import Customer

class Order:
    pass
''')
(root / "customers.py").write_text('''
from orders import Order

class Customer:
    pass
''')

import orders`,
        error: 'ImportError',
        correct:
          '`orders` imports `customers`, which imports `Order` from the partially initialized `orders` before `Order` is defined: a circular import',
        wrong: [
          'Two modules cannot define classes with related names',
          '`from ... import` cannot be used for classes, only for functions',
          'The modules must be in a package for imports between them to work',
        ],
        why: 'Python registers `orders` in `sys.modules` and starts running it; its first line imports `customers`, whose first line asks the half-loaded `orders` for `Order`, which does not exist yet. The message says "most likely due to a circular import". Move shared code to a third module, import the module instead of the name, or import inside the function that needs it.',
      },
    ],
  ),
  ...b.concept(
    'py-environments-dependencies',
    2,
    'Think about isolation per project and reproducible installs.',
    [
      {
        key: 'venv',
        question: 'Why create a virtual environment for each Python project?',
        snippet: plain(`python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt`),
        correct:
          'Each project gets its own interpreter environment and installed packages, so projects can depend on different versions without conflicts',
        wrong: [
          'A virtual environment makes the code run faster by compiling it ahead of time',
          'A virtual environment sandboxes the program so it cannot access the network or files',
          'Packages can only be imported from inside a virtual environment',
        ],
        why: '`venv` creates an isolated `site-packages` and a Python executable bound to it. It is about dependency isolation, not speed or security sandboxing.',
      },
      {
        key: 'pinning',
        question:
          'A deployment broke because a dependency released a new major version. Which practice prevents this?',
        snippet: plain(`# requirements.txt
django>=5.0
requests`),
        correct:
          'Pin exact versions for deployments (for example `django==5.2.19`, generated by a lock tool or `pip freeze`) and upgrade deliberately',
        wrong: [
          'Remove the version specifiers entirely so pip always picks a compatible version',
          'Install packages globally instead of in a virtual environment',
          'List dependencies in a comment at the top of the main module',
        ],
        why: 'Open ranges like `>=5.0` or no specifier at all install whatever is newest at install time, so two builds can differ. A lock file or fully pinned requirements make installs reproducible; upgrades then happen on purpose and are tested.',
      },
      {
        key: 'entry-point',
        question: 'What does this `pyproject.toml` section do when the package is installed?',
        snippet: plain(`[project.scripts]
invoice-cli = "invoices.cli:main"`),
        correct:
          'It creates an `invoice-cli` command that imports `invoices.cli` and calls its `main()` function',
        wrong: [
          'It runs `invoices.cli.main()` once during installation',
          'It renames the `invoices` package to `invoice-cli`',
          'It marks `main` as the only public function of the package',
        ],
        why: 'Console-script entry points generate a small executable wrapper on install. Because `main()` is called explicitly, the module does not need an `if __name__ == "__main__":` block for this to work.',
      },
    ],
  ),
  ...b.multi(
    'py-module-organization',
    4,
    'Consider what runs on import and what callers should rely on.',
    [
      {
        key: 'practices',
        question: 'Select every good practice for organizing a Python package.',
        correct: [
          'Keep module top-level code free of side effects such as network calls; put them in functions',
          'Use an `if __name__ == "__main__":` block (or an entry point) for code that should run only as a script',
          'Expose the public API from the package’s `__init__.py` and keep helpers in internal modules',
        ],
        wrong: [
          'Use `from module import *` in library code so callers get every name',
          'Name a local module `json.py` so it overrides the standard library one in your project',
          'Put all code in `__init__.py` so imports are shorter',
        ],
        why: 'Imports should be cheap and predictable, scripts should be guarded, and a deliberate public API makes refactoring safe. Star imports hide where names come from, and shadowing a standard library module breaks every import of it in that directory.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Type hints

export const typeHintsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'py-hints-not-enforced',
    1,
    [
      'The interpreter does not check type hints when code runs.',
      'Hints are for readers, editors and static checkers such as mypy or pyright.',
    ],
    [
      {
        key: 'add-strings',
        code: `def add(a: int, b: int) -> int:
    return a + b

print(add("py", "thon"))
print(add(1.5, 2))`,
        output: 'python\n3.5',
        why: 'Python runs the function with whatever it receives; `+` on strings concatenates and on floats adds. A static type checker would flag both calls, but the interpreter does not.',
      },
      {
        key: 'variable',
        code: `count: int = 0
count = "zero"
print(count, type(count).__name__)`,
        output: 'zero str',
        why: 'A variable annotation documents intent for tools; it does not create a typed variable. The reassignment succeeds at run time.',
      },
    ],
  ),
  ...b.blank(
    'py-collection-annotations',
    2,
    'Built-in collections are subscripted directly: `list[int]`, `dict[str, float]`, `tuple[int, ...]`.',
    [
      {
        key: 'dict',
        prompt: 'Annotate the return type: a dict mapping product names to prices.',
        template: `def price_list(names: list[str], prices: list[float]) -> {{blank:ret}}:
    return dict(zip(names, prices))

print(price_list(["pen"], [1.5]))`,
        blanks: { ret: ['dict[str, float]'] },
        why: 'Since Python 3.9, `dict[str, float]` works directly; `typing.Dict` is no longer needed. The key type comes first, then the value type.',
      },
      {
        key: 'optional',
        prompt:
          'Annotate the return type: the function returns a `str`, or `None` when nothing is found.',
        template: `def find_email(users: dict[str, str], name: str) -> {{blank:ret}}:
    return users.get(name)

print(find_email({"ana": "a@x.io"}, "ben"))`,
        blanks: { ret: ['str | None', 'None | str'] },
        why: '`str | None` (Python 3.10+) is the modern spelling of `Optional[str]`, which would also need `from typing import Optional`. `dict.get` returns `None` for a missing key, so the annotation must allow it.',
      },
      {
        key: 'tuple',
        prompt: 'Annotate `scores` as a tuple of any number of ints.',
        template: `def best(scores: {{blank:ann}}) -> int:
    return max(scores)

print(best((3, 9, 4)))`,
        blanks: { ann: ['tuple[int, ...]'] },
        why: '`tuple[int, ...]` means a tuple of ints of any length. `tuple[int]` would mean exactly one int, and `tuple[int, int]` exactly two.',
      },
    ],
  ),
  ...b.codeChoice(
    'py-optional-narrowing',
    2,
    'A value annotated `X | None` must be checked for `None` before you use it as an `X`.',
    [
      {
        key: 'find-user',
        question:
          'A type checker reports an error on the line marked `# here`. Why, and what is the fix?',
        code: `def find(users: dict[int, str], user_id: int) -> str | None:
    return users.get(user_id)

def greet(users: dict[int, str], user_id: int) -> str:
    name = find(users, user_id)
    if name is None:
        return "Hello, guest"
    return "Hello, " + name.title()  # here (before the check was added)

print(greet({1: "ana"}, 2))`,
        correct:
          'Without the check, `name` could be `None`, and `None` has no `title()`; the `if name is None` branch narrows `name` to `str` for the code after it',
        wrong: [
          'Type checkers reject any string concatenation with `+`',
          '`str | None` is not valid syntax in a return annotation',
          'The checker complains because `dict.get` always returns `None`',
        ],
        why: 'Static checkers track narrowing: after `if name is None: return ...`, the remaining code knows `name` is `str`. At run time the unchecked version would raise `AttributeError` for a missing user.',
      },
      {
        key: 'which-call',
        question: 'Which call would a static type checker such as mypy reject?',
        code: `def total(prices: list[float], discount: float | None = None) -> float:
    subtotal = sum(prices)
    return subtotal - (discount or 0)

print(total([9.5, 0.5]))
print(total([10.0], 2))`,
        correct: '`total(["9.5"], None)`, because a `str` is not a `float`',
        wrong: [
          '`total([10.0], 2)`, because `2` is an `int`, not a `float`',
          '`total([9.5, 0.5])`, because `discount` is not passed',
          '`total([1.0], None)`, because `None` is passed explicitly',
        ],
        why: 'Type checkers accept an `int` where a `float` is expected (numeric promotion), defaults make `discount` optional, and `None` is allowed by `float | None`. A list of strings does not match `list[float]`.',
      },
    ],
  ),
  ...b.multi('py-type-hint-facts', 3, 'Separate what the interpreter does from what tools do.', [
    {
      key: 'facts',
      question: 'Select every true statement about type hints in Python 3.14.',
      correct: [
        'A function with wrong argument types still runs; only static checkers or explicit runtime validation catch the mismatch',
        '`X | None` and `Optional[X]` mean the same thing',
        'Type hints are stored as metadata and can be read at run time, for example with `annotationlib.get_annotations` or `typing.get_type_hints`',
      ],
      wrong: [
        'Adding type hints makes CPython run the function faster',
        '`list[int]` makes the list reject non-int items at run time',
        'Type hints are required for functions in modules that are imported',
      ],
      why: 'CPython does not use hints for speed or enforcement. Libraries such as dataclasses, Pydantic or FastAPI read them at run time for their own purposes. Hints are always optional.',
    },
    {
      key: 'any-object',
      question: 'Select every true statement about `Any` and `object` as annotations.',
      code: `from typing import Any

def show_any(value: Any) -> str:
    return value.upper()

def show_object(value: object) -> str:
    return str(value)

print(show_any("ok"), show_object(42))`,
      correct: [
        'A type checker allows any operation on an `Any` value, such as `value.upper()`, without complaint',
        'With `object`, a type checker only allows operations every object supports, so `value.upper()` would be rejected',
      ],
      wrong: [
        '`Any` makes the interpreter check the argument at run time',
        '`object` and `Any` are treated identically by type checkers',
      ],
      why: '`Any` switches type checking off for that value, while `object` is the most general type that still gets checked. Neither affects run time.',
    },
  ]),
  ...b.output(
    'py-generic-syntax',
    4,
    [
      'Python 3.12 added type parameter syntax: `def f[T](x: T) -> T`, `class Box[T]` and the `type` statement.',
      'Type parameters exist at run time as objects, but they still do not enforce anything.',
    ],
    [
      {
        key: 'generic-function',
        code: `def first[T](items: list[T]) -> T:
    return items[0]

print(first([3, 1, 2]), first(["b", "a"]))
print([p.__name__ for p in first.__type_params__])`,
        output: "3 b\n['T']",
        why: '`[T]` after the function name declares a type parameter scoped to the function, replacing a module-level `T = TypeVar("T")`. It ties the return type to the element type for checkers, and is recorded in `__type_params__`.',
      },
      {
        key: 'generic-class',
        code: `class Stack[T]:
    def __init__(self) -> None:
        self.items: list[T] = []

    def push(self, item: T) -> None:
        self.items.append(item)

    def pop(self) -> T:
        return self.items.pop()

s = Stack[int]()
s.push(1)
s.push("two")
print(s.pop(), len(s.items))`,
        output: 'two 1',
        why: '`Stack[int]()` documents the element type for checkers, but at run time it creates an ordinary `Stack`, so pushing a string works. A type checker would reject `s.push("two")`.',
      },
      {
        key: 'type-alias',
        code: `type Point = tuple[float, float]
type Path = list[Point]

def length(path: Path) -> int:
    return len(path)

print(length([(0, 0), (1, 1)]), Point.__value__, type(Point).__name__)`,
        output: '2 tuple[float, float] TypeAliasType',
        why: 'The `type` statement (3.12+) creates a `TypeAliasType` whose value is evaluated lazily. It names a type for readability; using it does not convert or check values.',
      },
    ],
  ),
  ...b.fails(
    'py-isinstance-generics',
    4,
    'Parameterized generics like `list[int]` describe types for checkers; `isinstance` needs a plain class.',
    [
      {
        key: 'list-int',
        question: 'A developer tries to validate input at run time. Why does this fail?',
        code: `def validate(values):
    if not isinstance(values, list[int]):
        raise TypeError("expected a list of ints")
    return values

print(validate([1, 2]))`,
        error: 'TypeError',
        correct:
          '`isinstance` cannot check a parameterized generic such as `list[int]`; check `isinstance(values, list)` and then each item, for example `all(isinstance(v, int) for v in values)`',
        wrong: [
          'The `TypeError` raised is the one from `validate`, because `[1, 2]` is not a `list[int]`',
          '`list[int]` must be imported from `typing` as `List[int]`',
          '`isinstance` only accepts built-in types, never generics or classes',
        ],
        why: 'The error comes from `isinstance` itself: "isinstance() argument 2 cannot be a parameterized generic". Checking element types requires looking at the elements; validation libraries do this based on the hints.',
      },
      {
        key: 'typeddict',
        question:
          'A developer expects `TypedDict` to protect against bad data. Why does the program fail where it does?',
        code: `from typing import TypedDict

class User(TypedDict):
    name: str
    age: int

user = User(name="ana", age="unknown")
print(user["age"] + 1)`,
        error: 'TypeError',
        correct:
          'A `TypedDict` is a plain dict at run time, so `age="unknown"` is accepted, and the error appears only later when `"unknown" + 1` is computed',
        wrong: [
          '`User(...)` raises `TypeError` because `age` must be an int',
          '`TypedDict` classes cannot be instantiated with keyword arguments',
          'Dict values cannot be used in arithmetic',
        ],
        why: 'Creating a `TypedDict` builds an ordinary `dict` without checking values; only static checkers know the declared keys and types. The failure surfaces far from the bad input, which is why external data needs explicit validation.',
      },
    ],
  ),
  ...b.output(
    'py-deferred-annotations',
    5,
    [
      'In Python 3.14, annotations are evaluated lazily, only when something asks for them.',
      '`annotationlib.get_annotations(obj, format=Format.STRING)` reads them without evaluating names.',
    ],
    [
      {
        key: 'forward-reference',
        code: `class Node:
    def __init__(self, value: int, next: Node | None = None):
        self.value = value
        self.next = next

    def append(self, value: int) -> Node:
        return Node(value, self)

head = Node(1).append(2)
print(head.value, head.next.value)`,
        output: '2 1',
        why: 'Inside its own body, `Node` is not yet defined, which used to require quoting it (`"Node"`) or `from __future__ import annotations`. Since annotations are deferred in Python 3.14, the forward reference simply works.',
      },
      {
        key: 'undefined-name',
        code: `import annotationlib

def handler(event: Event) -> Response:
    return None

print("defined")
print(annotationlib.get_annotations(handler, format=annotationlib.Format.STRING))
try:
    handler.__annotations__
except NameError as e:
    print("NameError:", e)`,
        output:
          "defined\n{'event': 'Event', 'return': 'Response'}\nNameError: name 'Event' is not defined",
        why: 'Defining the function does not evaluate its annotations, so the undefined names cause no error. Asking for the values via `__annotations__` evaluates them and raises `NameError`; the `STRING` format returns the source text instead.',
      },
    ],
  ),
];
