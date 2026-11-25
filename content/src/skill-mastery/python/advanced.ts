import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Advanced (difficulty 4-5) families that complete the skills whose upper tiers
 * needed more depth. Each export is appended to the skill's main family list in track.ts.
 */

const b = programBuilders('python');

/** Setup lines that create a temporary import root; the snippet then writes modules into it. */
const SETUP = `import pathlib, sys, tempfile
sys.dont_write_bytecode = True
root = pathlib.Path(tempfile.mkdtemp())
sys.path.insert(0, str(root))
# ---- setup above: create the module files ----`;

// ---------------------------------------------------------------- Conditionals

export const conditionalsAdvanced: readonly QuestionSource[] = [
  ...b.output(
    'py-match-class-patterns',
    4,
    [
      'A class pattern `Cls(a, b)` matches positionally through `__match_args__`, which dataclasses generate.',
      'A dotted name such as `Status.PAID` is a value pattern; a bare name always captures.',
    ],
    [
      {
        key: 'dataclass-positional',
        code: `from dataclasses import dataclass

@dataclass
class Order:
    status: str
    total: int

def route(order):
    match order:
        case Order("paid", total) if total > 100:
            return "review"
        case Order(status="paid"):
            return "ship"
        case Order(status=s):
            return f"hold ({s})"

print(route(Order("paid", 150)), route(Order("paid", 20)), route(Order("new", 5)))`,
        output: 'review ship hold (new)',
        why: 'The dataclass sets `__match_args__ = ("status", "total")`, so `Order("paid", total)` compares `status` with `"paid"` and captures `total`. The guard sends only the large order to review; the second case matches any other paid order, and the last captures the status of the rest.',
      },
      {
        key: 'value-vs-capture',
        code: `class Status:
    PAID = "paid"

def check(state):
    match state:
        case Status.PAID:
            return "paid"
        case other:
            return f"captured {other}"

PAID = "paid"
def check_bare(state):
    match state:
        case "new":
            return "new"
        case PAID:
            return f"bare name matched {state}"

print(check("paid"), check("new"))
print(check_bare("refunded"), PAID)`,
        output: 'paid captured new\nbare name matched refunded paid',
        why: '`Status.PAID` contains a dot, so it is compared by value. A bare name like `PAID` is a capture pattern: it matches anything and binds a new local variable `PAID` inside `check_bare`, so `"refunded"` matches even though it is not `"paid"`. The module-level `PAID` is untouched. Use dotted constants (an enum or class attribute) in patterns.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Strings

export const stringsAdvanced: readonly QuestionSource[] = [
  ...b.fails(
    'py-format-pitfalls',
    4,
    'Count the placeholders and the values supplied for them.',
    [
      {
        key: 'percent-tuple',
        question: 'A logging helper formats a message with the old `%` operator. Why does it fail for this call?',
        code: `def log(template, value):
    return "LOG: " + template % value

print(log("user %s", "ana"))
print(log("point %s", (3, 4)))`,
        error: 'TypeError',
        correct:
          'With `%`, a tuple on the right is treated as the argument list, so `(3, 4)` supplies two values for one `%s`; wrap it: `template % (value,)`',
        wrong: [
          '`%s` cannot format tuples; only strings and numbers are allowed',
          'The first call fails because `"ana"` is not wrapped in a tuple',
          '`%` formatting was removed in Python 3',
        ],
        why: 'The error is `TypeError: not all arguments converted during string formatting`. A single non-tuple value works (the first call prints), but a tuple is unpacked into the placeholders. f-strings and `str.format` do not have this ambiguity.',
      },
      {
        key: 'format-index',
        question: 'Why does building this message fail?',
        code: `template = "{} ordered {} x {}"
fields = ["ana", 3]
print(template.format(*fields, "pens"))
print(template.format(fields))`,
        error: 'IndexError',
        correct:
          'The second call passes the whole list as one argument, so the template’s second and third `{}` have nothing to fill: `IndexError: Replacement index 1 out of range`',
        wrong: [
          '`str.format` cannot take a list argument at all, so it raises `TypeError`',
          'The first call fails because `*fields` and a positional argument cannot be mixed',
          'Missing values are filled with empty strings',
        ],
        why: 'The first call unpacks the list and adds `"pens"`, giving three arguments and printing `ana ordered 3 x pens`. The second passes one argument (the list), so index 1 is out of range. Unlike `%`, `format` raises `IndexError` for a missing positional field.',
      },
    ],
  ),
  ...b.output(
    'py-escapes-raw-strings',
    5,
    [
      'In a normal string literal, `\\t` and `\\n` are single characters (tab and newline).',
      'A raw string `r"..."` keeps backslashes as they are, which is what regular expressions and Windows paths need.',
    ],
    [
      {
        key: 'windows-path',
        code: `path = "C:\\temp\\new"
raw = r"C:\\temp\\new"
print(len(path), len(raw))
print(path.count("\\\\"), raw.count("\\\\"))`,
        output: '9 11\n0 2',
        why: 'In `path`, `\\t` became a tab and `\\n` a newline, so there are no backslashes left and the length is 9. The raw string keeps both backslashes as characters, giving 11. Prefer `pathlib` or forward slashes over hand-written Windows paths.',
      },
      {
        key: 'regex',
        code: `import re

text = "order 12, order 345"
print(re.findall(r"\\d+", text))
print(re.findall("\\bord", text), re.findall(r"\\bord", text))`,
        output: "['12', '345']\n[] ['ord', 'ord']",
        why: 'In a normal string, `\\b` is the backspace character, so the first pattern searches for a literal backspace and finds nothing. In a raw string, the regex engine receives `\\b`, the word-boundary assertion. Always write regular expressions as raw strings.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Mutability and copying

export const mutabilityAdvanced: readonly QuestionSource[] = [
  ...b.output(
    'py-copy-object-graphs',
    5,
    [
      '`copy.copy` of an object copies its attribute dictionary but shares the attribute values.',
      '`copy.deepcopy` keeps a memo, so objects shared inside the original stay shared (but separate) in the copy.',
    ],
    [
      {
        key: 'shared-reference',
        code: `import copy

shared = [1]
data = [shared, shared]
clone = copy.deepcopy(data)
clone[0].append(2)
print(clone, clone[0] is clone[1])
print(data)`,
        output: '[[1, 2], [1, 2]] True\n[[1], [1]]',
        why: 'Deep copy copies `shared` once and reuses that copy for its second occurrence, preserving the structure: both slots of `clone` refer to one new list. The original is untouched.',
      },
      {
        key: 'object-copy',
        code: `import copy

class Invoice:
    def __init__(self, number, lines):
        self.number = number
        self.lines = lines

original = Invoice(1, ["pen"])
draft = copy.copy(original)
draft.number = 2
draft.lines.append("ink")
print(original.number, original.lines)
deep = copy.deepcopy(original)
deep.lines.clear()
print(original.lines, deep.lines)`,
        output: "1 ['pen', 'ink']\n['pen', 'ink'] []",
        why: 'The shallow copy is a new `Invoice` with its own `number` binding but the same `lines` list, so the append shows in the original. The deep copy has its own list, so clearing it leaves the original alone.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Classes

export const classesAdvanced: readonly QuestionSource[] = [
  ...b.fails(
    'py-attribute-access-traps',
    4,
    'Look at how the attribute name is stored or resolved: name mangling, `__slots__` and properties all change the rules.',
    [
      {
        key: 'name-mangling',
        question: 'Why does reading the balance from outside the class fail?',
        code: `class Account:
    def __init__(self, balance):
        self.__balance = balance

    def balance(self):
        return self.__balance

acct = Account(100)
print(acct.balance())
print(acct.__balance)`,
        error: 'AttributeError',
        correct:
          'Names starting with two underscores are mangled to `_Account__balance` inside the class, so `acct.__balance` does not exist outside it',
        wrong: [
          'Double-underscore attributes are truly private and cannot be read at all, even as `acct._Account__balance`',
          '`balance` the method and `__balance` the attribute clash, so the attribute is deleted',
          'Attributes set in `__init__` are readable only through methods',
        ],
        why: 'Name mangling rewrites `__balance` to `_Account__balance` in code inside the class body; it avoids clashes in subclasses but is not access control. A single underscore is the usual "internal" convention.',
      },
      {
        key: 'slots-typo',
        question: 'Why does this assignment fail, when it would silently work on a regular class?',
        code: `class Point:
    __slots__ = ("x", "y")

    def __init__(self, x, y):
        self.x = x
        self.y = y

p = Point(1, 2)
p.x = 5
p.z = 3
print(p.x, p.z)`,
        error: 'AttributeError',
        correct:
          '`__slots__` fixes the set of instance attributes and removes the per-instance `__dict__`, so assigning the undeclared `z` raises `AttributeError`',
        wrong: [
          '`__slots__` makes all attributes read-only, so `p.x = 5` fails',
          '`__slots__` must be a list, not a tuple',
          'Instances of slotted classes cannot be created with arguments',
        ],
        why: 'Slotted classes save memory and catch typos such as `p.z`, because there is no `__dict__` to accept new names. Declared slots remain writable, so `p.x = 5` succeeds.',
      },
      {
        key: 'property-no-setter',
        question: 'A subclass tries to store a precomputed area. Why does creating a `Square` fail?',
        code: `class Shape:
    @property
    def area(self):
        return 0

class Square(Shape):
    def __init__(self, side):
        self.side = side
        self.area = side * side

print(Square(3).area)`,
        error: 'AttributeError',
        correct:
          '`area` is a read-only property inherited from `Shape`; properties live on the class and take precedence over instance attributes, so the assignment raises `AttributeError`',
        wrong: [
          'Subclasses cannot add attributes in `__init__` without calling `super().__init__()` first',
          'The instance attribute silently shadows the property and the program prints `9`',
          '`side * side` must be wrapped in `int()`',
        ],
        why: 'A property is a data descriptor, so it wins over the instance `__dict__` on both reading and writing; without a setter, assignment fails with "property \'area\' of \'Square\' object has no setter". Override `area` as a property in `Square` instead.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Modules and packages

export const modulesAdvanced: readonly QuestionSource[] = [
  ...b.output(
    'py-module-reload',
    4,
    [
      '`importlib.reload(module)` re-executes the module’s code in the same module object.',
      'Names copied out earlier (with `from ... import`) and objects created earlier still refer to the old objects.',
    ],
    [
      {
        key: 'stale-from-import',
        code: `${SETUP}
import importlib
(root / "limits.py").write_text('''
print("loading limits")
MAX = 1
''')

import limits
from limits import MAX
(root / "limits.py").write_text('''
print("loading limits")
MAX = 20
''')
importlib.reload(limits)
print(MAX, limits.MAX)`,
        output: 'loading limits\nloading limits\n1 20',
        why: '`reload` runs the new code and rebinds `limits.MAX`, but the `MAX` name in this module was copied from the old binding and still holds `1`. This is why hot reloading rarely updates everything.',
      },
      {
        key: 'old-instances',
        code: `${SETUP}
import importlib
(root / "shapes.py").write_text('''
class Circle:
    def __init__(self, r):
        self.r = r
''')

import shapes
c = shapes.Circle(2)
importlib.reload(shapes)
print(isinstance(c, shapes.Circle), type(c) is shapes.Circle, c.r)`,
        output: 'False False 2',
        why: 'Reloading executes the `class` statement again and creates a brand-new `Circle` class. The existing instance still belongs to the old class object, so `isinstance` against the new class is `False`, a classic source of confusing bugs after reloads.',
      },
    ],
  ),
  ...b.output(
    'py-module-resolution',
    5,
    [
      'The script’s own directory (or whatever comes first on `sys.path`) is searched before the standard library.',
      'Relative imports need a package: they work when the module is run as part of one (`python -m package.module`), not as a plain file.',
    ],
    [
      {
        key: 'shadowing',
        code: `${SETUP}
(root / "statistics.py").write_text('''
def median(values):
    return "local median"
''')

import statistics
print(statistics.median([1, 2, 3]), hasattr(statistics, "mean"))
print(pathlib.Path(statistics.__file__).parent == root)`,
        output: 'local median False\nTrue',
        why: 'The local `statistics.py` sits in a directory placed before the standard library on `sys.path`, so it shadows the real module. Code expecting `statistics.mean` breaks. Never name your own files after standard library or installed modules.',
      },
      {
        key: 'run-as-script',
        code: `${SETUP}
import runpy
pkg = root / "tool"
pkg.mkdir()
(pkg / "__init__.py").write_text("")
(pkg / "helpers.py").write_text('''
def version():
    return "1.0"
''')
(pkg / "cli.py").write_text('''
from .helpers import version
print("tool", version())
''')

try:
    runpy.run_path(str(pkg / "cli.py"), run_name="__main__")
except ImportError as e:
    print("as file:", e)
runpy.run_module("tool.cli", run_name="__main__")`,
        output: 'as file: attempted relative import with no known parent package\ntool 1.0',
        why: '`run_path` is what `python tool/cli.py` does: the file runs as a top-level script with no package, so `from .helpers` fails. `run_module` is what `python -m tool.cli` does: the module knows it belongs to `tool`, and the relative import works.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Testing

export const testingAdvanced: readonly QuestionSource[] = [
  ...b.output(
    'py-patch-advanced',
    4,
    [
      'Stacked `@patch` decorators pass their mocks bottom-up: the decorator nearest the function gives the first argument.',
      'A `side_effect` function receives the call’s arguments and its return value becomes the mock’s result.',
    ],
    [
      {
        key: 'decorator-order',
        code: `from unittest.mock import patch
import os

@patch("os.getcwd", return_value="/work")
@patch("os.getpid", return_value=42)
def check(first, second):
    print(first.return_value, second.return_value)
    print(os.getpid(), os.getcwd())

check()`,
        output: '42 /work\n42 /work',
        why: 'Decorators apply from the bottom up, so the `os.getpid` patch is applied first and its mock is the first parameter. Naming parameters after the top decorator first is a common bug that makes assertions check the wrong mock.',
      },
      {
        key: 'side-effect-function',
        code: `from unittest.mock import Mock, call

rates = Mock(side_effect=lambda cur: {"USD": 1.1, "GBP": 0.9}[cur])

def convert_all(amount, currencies, get_rate):
    return [round(amount * get_rate(c), 2) for c in currencies]

print(convert_all(10, ["USD", "GBP"], rates))
rates.assert_has_calls([call("USD"), call("GBP")])
print(rates.call_args_list[-1].args)`,
        output: "[11.0, 9.0]\n('GBP',)",
        why: 'A function as `side_effect` computes a result per call from the arguments, which suits lookups. `assert_has_calls` checks that these calls happened in this order, and `call_args_list` records every call.',
      },
      {
        key: 'patch-object-restore',
        code: `from unittest.mock import patch

class Clock:
    def now(self):
        return "real time"

clock = Clock()
with patch.object(Clock, "now", return_value="frozen") as fake:
    print(clock.now(), Clock().now(), fake.call_count)
print(clock.now())`,
        output: 'frozen frozen 2\nreal time',
        why: '`patch.object` replaces the attribute on the class, so every instance sees the mock inside the block; the mock counts calls from both instances. When the block ends, the original method is restored.',
      },
    ],
  ),
];
