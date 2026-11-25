import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Python fundamentals: values, types, operators, conditionals, truthiness,
 * None and identity, and strings. Every snippet runs on CPython 3.14.
 */

const b = programBuilders('python');

// ---------------------------------------------------------------- Variables, types and operators

export const typesOperatorsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'py-division-operators',
    1,
    [
      '`/` is true division and always returns a `float`.',
      '`//` is floor division and `%` is the remainder that goes with it.',
    ],
    [
      {
        key: 'true-division',
        code: `print(7 / 2)
print(6 / 3)`,
        output: '3.5\n2.0',
        why: '`/` always produces a `float` in Python 3, even when the division is exact, so `6 / 3` is `2.0`, not `2`. Python 2 integer division is gone.',
      },
      {
        key: 'floor-and-mod',
        code: `minutes = 135
print(minutes // 60, minutes % 60)`,
        output: '2 15',
        why: '`//` keeps the whole hours (`2`) and `%` gives the remaining minutes (`15`). Both operands are `int`, so both results are `int`.',
      },
      {
        key: 'float-floor',
        code: `print(7.5 // 2)
print(type(9 // 3).__name__)`,
        output: '3.0\nint',
        why: 'Floor division of a `float` returns a `float` (`3.0`), while floor division of two `int`s returns an `int`. `//` never changes the operand type to `int` by itself.',
      },
    ],
  ),
  ...b.output(
    'py-dynamic-typing',
    1,
    [
      'A variable is a name bound to an object; the object has the type, not the name.',
      '`type(x).__name__` gives the type name of the object currently bound to `x`.',
    ],
    [
      {
        key: 'rebind',
        code: `value = 42
print(type(value).__name__)
value = "forty-two"
print(type(value).__name__)`,
        output: 'int\nstr',
        why: 'Python is dynamically typed: assignment rebinds the name `value` to a new object, and the type belongs to that object. There is no declared type that would reject the second assignment.',
      },
      {
        key: 'mixed-arithmetic',
        code: `count = 3
price = 2.5
total = count * price
print(total, type(total).__name__)`,
        output: '7.5 float',
        why: 'Mixing `int` and `float` in arithmetic promotes the result to `float`. The variable `total` simply names the resulting `float` object.',
      },
      {
        key: 'bool-is-int',
        code: `flag = True
print(type(flag).__name__, flag + 1)`,
        output: 'bool 2',
        why: '`bool` is a subclass of `int` with `True == 1`, so `True + 1` is `2`. The type of `flag` is still reported as `bool`.',
      },
    ],
  ),
  ...b.output(
    'py-unpacking-assignment',
    2,
    [
      'The right-hand side is evaluated completely before any name on the left is bound.',
      'A starred name collects the remaining items into a list.',
    ],
    [
      {
        key: 'swap',
        code: `a, b = 1, 2
a, b = b, a + b
print(a, b)`,
        output: '2 3',
        why: 'The tuple `(b, a + b)` is built first from the old values `(2, 3)`, then unpacked into `a` and `b`. There is no intermediate state where `a` is already `2` when `a + b` is computed.',
      },
      {
        key: 'starred',
        code: `first, *middle, last = [10, 20, 30, 40]
print(first, middle, last)`,
        output: '10 [20, 30] 40',
        why: 'The starred target takes everything not claimed by the other targets, and it is always a list, even when unpacking a tuple or string.',
      },
      {
        key: 'chained',
        code: `x = y = 0
x += 5
print(x, y)`,
        output: '5 0',
        why: 'Chained assignment binds both names to the same `int` object `0`. `x += 5` rebinds `x` to a new `int` because ints are immutable, so `y` still names `0`.',
      },
    ],
  ),
  ...b.fails(
    'py-type-conversion-errors',
    2,
    'Python does not convert between `str` and numbers implicitly, and `int()` parses only whole-number text.',
    [
      {
        key: 'str-plus-int',
        question: 'Why does this program fail?',
        code: `quantity = "3"
print("Total: " + quantity * 2 + 1)`,
        error: 'TypeError',
        correct:
          '`quantity * 2` is the string `"33"`, and adding the int `1` to a string raises `TypeError`; convert with `int(quantity)` first',
        wrong: [
          'It prints `Total: 7` because Python converts `"3"` to a number automatically',
          '`quantity * 2` raises `TypeError` because strings cannot be multiplied',
          'It prints `Total: 331` because `+` converts the `1` to text',
        ],
        why: 'Repeating a string with `*` is allowed (`"3" * 2 == "33"`), but `str + int` is not: Python never converts implicitly between text and numbers. Use `int(quantity)` before the arithmetic and `str()` or an f-string to build the message.',
      },
      {
        key: 'int-of-decimal-text',
        question: 'A user typed `3.5` into a form. Why does this program fail?',
        code: `raw = "3.5"
hours = int(raw)
print(hours)`,
        error: 'ValueError',
        correct:
          '`int()` cannot parse text with a decimal point, so it raises `ValueError`; use `float(raw)` (and round or truncate deliberately if an `int` is needed)',
        wrong: [
          'It prints `3` because `int()` truncates the value',
          'It prints `4` because `int()` rounds to the nearest whole number',
          'It raises `TypeError` because `raw` is a string',
        ],
        why: '`int(3.5)` truncates a `float` to `3`, but `int("3.5")` must parse the text as an integer literal and fails with `ValueError: invalid literal for int() with base 10`. The error is `ValueError` (right type, bad value), not `TypeError`.',
      },
      {
        key: 'float-with-comma',
        question: 'Why does this program fail?',
        code: `amounts = ["12.50", "1,200.00", "8"]
print(sum(float(a) for a in amounts))`,
        error: 'ValueError',
        correct:
          '`float("1,200.00")` raises `ValueError` because thousands separators are not accepted; remove them first, for example with `a.replace(",", "")`',
        wrong: [
          '`float("8")` fails because `"8"` has no decimal point',
          '`sum` cannot add floats produced by a generator',
          '`float` reads `"1,200.00"` as `1.2` using the comma as a decimal separator',
        ],
        why: '`float()` accepts optional whitespace, a sign, digits, a decimal point, an exponent, underscores between digits and words like `inf`, but not commas. It is not locale-aware. `float("8")` is fine and `sum` works with any iterable of numbers.',
      },
    ],
  ),
  ...b.outputChoice(
    'py-comparison-operators',
    2,
    'Comparisons can be chained, and `==` between different types is usually just `False`.',
    [
      {
        key: 'chained-range',
        code: `age = 17
print(13 <= age < 18)
print(1 < 3 > 2)`,
        correct: 'True\nTrue',
        wrong: ['True\nFalse', 'False\nTrue', 'TypeError'],
        why: '`a < b < c` means `a < b and b < c`, so `1 < 3 > 2` is `1 < 3 and 3 > 2`, which is `True`. It is not `(1 < 3) > 2`, which would compare `True > 2`.',
      },
      {
        key: 'mixed-types',
        code: `print(10 == 10.0)
print("10" == 10)`,
        correct: 'True\nFalse',
        wrong: ['True\nTrue', 'False\nFalse', 'False\nTypeError'],
        why: '`int` and `float` compare by numeric value, so `10 == 10.0`. A `str` never equals an `int`: `==` across unrelated types returns `False` rather than converting or raising (only ordering comparisons like `<` raise `TypeError`).',
      },
      {
        key: 'string-order',
        code: `print("apple" < "banana")
print("10" < "9")`,
        correct: 'True\nTrue',
        wrong: ['True\nFalse', 'False\nFalse', 'TypeError'],
        why: 'Strings compare character by character by code point. `"1"` comes before `"9"`, so `"10" < "9"` is `True` even though `10 > 9` numerically. Sort numeric text after converting it to numbers.',
      },
    ],
  ),
  ...b.output(
    'py-operator-precedence',
    3,
    [
      '`**` binds tighter than unary minus and is right-associative.',
      '`not` has lower precedence than comparisons.',
    ],
    [
      {
        key: 'negative-power',
        code: `print(-2 ** 2)
print((-2) ** 2)`,
        output: '-4\n4',
        why: '`-2 ** 2` is `-(2 ** 2)` because `**` binds more tightly than the unary minus on its left. Parentheses are needed to square a negative number.',
      },
      {
        key: 'right-associative',
        code: `print(2 ** 3 ** 2)
print(1 + 2 * 3 ** 2)`,
        output: '512\n19',
        why: '`**` groups right to left, so `2 ** 3 ** 2` is `2 ** 9 = 512`, not `8 ** 2 = 64`. In `1 + 2 * 3 ** 2`, the power is evaluated first (`9`), then `* 2` (`18`), then `+ 1`.',
      },
      {
        key: 'not-comparison',
        code: `x = 5
print(not x == 3)
print(not x > 3 and x < 10)`,
        output: 'True\nFalse',
        why: '`not` binds more loosely than comparisons: `not x == 3` is `not (x == 3)`. In the second line `not (x > 3)` is `False`, and `False and ...` is `False`.',
      },
    ],
  ),
  ...b.outputChoice(
    'py-float-and-rounding',
    4,
    'Floats are binary approximations, and `round()` uses round-half-to-even.',
    [
      {
        key: 'point-one',
        code: `import math
total = 0.1 + 0.2
print(total == 0.3, math.isclose(total, 0.3))`,
        correct: 'False True',
        wrong: ['True True', 'False False', 'True False'],
        why: '`0.1` and `0.2` cannot be represented exactly in binary, so the sum is `0.30000000000000004` and `==` fails. `math.isclose` compares with a relative tolerance, which is the right tool for floats. For money, use `decimal.Decimal`.',
      },
      {
        key: 'bankers-rounding',
        code: `print(round(2.5), round(3.5), round(-0.5))`,
        correct: '2 4 0',
        wrong: ['3 4 -1', '3 4 0', '2 3 0'],
        why: 'Python rounds exact halves to the nearest even integer (banker’s rounding): `2.5` becomes `2`, `3.5` becomes `4` and `-0.5` becomes `0`. It does not always round halves up.',
      },
      {
        key: 'int-truncates',
        code: `print(int(-3.7), -7 // 2, round(-3.7))`,
        correct: '-3 -4 -4',
        wrong: ['-4 -4 -4', '-3 -3 -4', '-3 -4 -3'],
        why: '`int()` truncates toward zero (`-3`), `//` floors toward negative infinity (`-4`), and `round()` goes to the nearest integer (`-4`). These three conversions disagree for negative numbers.',
      },
    ],
  ),
  ...b.codeChoice(
    'py-negative-modulo-bug',
    4,
    'Python’s `%` result takes the sign of the divisor, not the dividend.',
    [
      {
        key: 'weekday',
        question:
          'This code moves back 3 days from Monday (index 0). A developer coming from Java expects a negative result and wants to add a fix. What does it print, and is a fix needed?',
        code: `days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
today = 0
print(days[(today - 3) % 7])`,
        correct:
          'It prints `Fri`: `-3 % 7` is `4` in Python, so no fix is needed',
        wrong: [
          'It prints `Thu` because `-3 % 7` is `-3` and `days[-3]` counts from the end',
          'It raises `IndexError` because the index is negative',
          'It prints `Mon` because `%` ignores the sign',
        ],
        why: 'In Python, `a % n` has the sign of `n`, so with a positive `n` the result is always in `0..n-1`. `-3 % 7` is `4`, which is `Fri`. In Java, C or JavaScript the remainder takes the sign of the dividend and would be `-3`; here `days[-3]` would also happen to be `Fri`, but by a different mechanism.',
      },
      {
        key: 'floor-pair',
        question: 'What does `divmod(-17, 5)` return, and why?',
        code: `q, r = divmod(-17, 5)
print(q, r, q * 5 + r)`,
        correct:
          '`(-4, 3)`: the quotient is floored, and `q * 5 + r` gets back `-17`',
        wrong: [
          '`(-3, -2)`: the quotient is truncated toward zero',
          '`(-3, 2)`: the remainder is always the absolute value',
          '`(-4, -3)`: both parts keep the sign of the dividend',
        ],
        why: 'Python keeps the identity `q * n + r == a` with `q = a // n` (floored). `-17 / 5 = -3.4` floors to `-4`, so `r = -17 - (-20) = 3`. Truncating languages give `(-3, -2)`.',
      },
    ],
  ),
  ...b.output(
    'py-bool-int-equality',
    5,
    [
      '`True == 1` and `hash(True) == hash(1)`, and `1 == 1.0` with equal hashes too.',
      'A dict keeps the first key it saw and overwrites the value for an equal key.',
    ],
    [
      {
        key: 'dict-keys',
        code: `d = {1: "int", True: "bool", 1.0: "float"}
print(d)`,
        output: "{1: 'float'}",
        why: '`1`, `True` and `1.0` are equal and hash the same, so they are the same dict key. The key object stays the first one inserted (`1`), and each later assignment replaces only the value, ending with `"float"`.',
      },
      {
        key: 'set-size',
        code: `values = {0, False, 0.0, "", None}
print(len(values))`,
        output: '3',
        why: '`0`, `False` and `0.0` are equal (and hash equally), so the set keeps one of them. `""` and `None` are different values, giving three elements. Falsy is not the same as equal.',
      },
      {
        key: 'sum-bools',
        code: `results = [True, False, True, True]
print(sum(results), results.count(1))`,
        output: '3 3',
        why: 'Because `bool` is a subclass of `int`, `sum` adds `True` as `1`. `count(1)` uses `==`, and `True == 1`, so it counts the three `True` values.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Conditionals, truthiness and identity

export const conditionalsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'py-truthiness',
    1,
    [
      'Empty containers, zero numbers, `None` and `False` are falsy.',
      'Any non-empty string is truthy, whatever its text says.',
    ],
    [
      {
        key: 'containers',
        code: `for value in [[], [0], {}, ""]:
    if value:
        print("truthy")
    else:
        print("falsy")`,
        output: 'falsy\ntruthy\nfalsy\nfalsy',
        why: 'An empty list, dict or string is falsy. `[0]` is a list with one element, so it is truthy even though its element is falsy.',
      },
      {
        key: 'strings',
        code: `for text in ["0", "False", " ", ""]:
    print(bool(text))`,
        output: 'True\nTrue\nTrue\nFalse',
        why: 'A string is falsy only when it is empty. `"0"`, `"False"` and a single space all contain characters, so they are truthy. Convert text explicitly (for example `text == "true"`) when parsing flags.',
      },
      {
        key: 'numbers',
        code: `for n in [0, 0.0, -1, 0.001]:
    print("yes" if n else "no")`,
        output: 'no\nno\nyes\nyes',
        why: 'Only zero (`0`, `0.0`) is falsy among numbers. Negative and tiny non-zero values are truthy.',
      },
    ],
  ),
  ...b.outputChoice(
    'py-elif-order',
    1,
    'Only the first branch whose condition is true runs.',
    [
      {
        key: 'grades',
        code: `score = 92
if score >= 60:
    grade = "D"
elif score >= 90:
    grade = "A"
else:
    grade = "F"
print(grade)`,
        correct: 'D',
        wrong: ['A', 'F', 'DA'],
        why: '`if`/`elif` stops at the first true condition. `92 >= 60` is true, so `grade` is `"D"` and the `elif` is never tested. Order the conditions from the most specific (highest threshold) down.',
      },
      {
        key: 'separate-ifs',
        code: `temp = 35
label = "cold"
if temp > 20:
    label = "warm"
if temp > 30:
    label = "hot"
print(label)`,
        correct: 'hot',
        wrong: ['warm', 'cold', 'warmhot'],
        why: 'These are two independent `if` statements, not an `if`/`elif` chain, so both run. The second assignment overwrites the first and the result is `"hot"`.',
      },
    ],
  ),
  ...b.blank(
    'py-conditional-expression',
    2,
    'The conditional expression reads `value_if_true if condition else value_if_false`.',
    [
      {
        key: 'parity',
        prompt: 'Complete the conditional expression so the program prints `odd`.',
        template: `n = 7
label = "even" {{blank:kw1}} n % 2 == 0 {{blank:kw2}} "odd"
print(label)
assert label == "odd"`,
        blanks: { kw1: ['if'], kw2: ['else'] },
        why: 'Python’s conditional expression puts the condition in the middle: `"even" if n % 2 == 0 else "odd"`. There is no `?:` operator.',
      },
      {
        key: 'default-name',
        prompt:
          'Use `"guest"` when `name` is `None`, otherwise use `name`. Fill in the operator that tests for `None`.',
        template: `def greeting(name):
    shown = "guest" if name {{blank:op}} None else name
    return "Hello, " + shown

print(greeting(None))
print(greeting("Ada"))
assert greeting(None) == "Hello, guest"
assert greeting("") == "Hello, "`,
        blanks: { op: ['is'] },
        why: '`name is None` tests specifically for `None`. An empty string is kept as it is, which a truthiness test (`name or "guest"`) would not do. `== None` also works here but `is None` is the idiomatic, faster and override-proof check.',
      },
    ],
  ),
  ...b.outputChoice(
    'py-is-vs-equals',
    2,
    '`==` compares values; `is` checks whether both names refer to the very same object.',
    [
      {
        key: 'lists',
        code: `a = [1, 2, 3]
b = [1, 2, 3]
c = a
print(a == b, a is b, a is c)`,
        correct: 'True False True',
        wrong: ['True True True', 'False False True', 'True False False'],
        why: '`a` and `b` are two separate lists with equal contents, so `==` is `True` and `is` is `False`. `c = a` does not copy: `c` is another name for the same list.',
      },
      {
        key: 'copy',
        code: `original = {"x": 1}
copied = dict(original)
copied["x"] = 2
print(original == copied, original is copied, original["x"])`,
        correct: 'False False 1',
        wrong: ['True True 2', 'False True 2', 'True False 1'],
        why: '`dict(original)` creates a new dict, so the two are different objects and changing `copied` does not affect `original`. After the change their values differ too.',
      },
      {
        key: 'none',
        code: `result = [].sort()
print(result is None, result == [])`,
        correct: 'True False',
        wrong: ['False True', 'True True', 'False False'],
        why: '`list.sort()` sorts in place and returns `None`. `None` is a singleton, so `is None` is the right test. `None == []` is `False`: `None` is not an empty list.',
      },
    ],
  ),
  ...b.codeChoice(
    'py-falsy-zero-bug',
    3,
    '`x or default` replaces every falsy value, not only `None`.',
    [
      {
        key: 'timeout',
        question:
          'A user sets `timeout` to `0` to disable waiting, but the program prints `30`. What is the correct fix?',
        code: `def effective_timeout(settings):
    return settings.get("timeout") or 30

print(effective_timeout({"timeout": 0}))
print(effective_timeout({}))`,
        correct:
          'Test for a missing value explicitly: `value = settings.get("timeout")` then `return 30 if value is None else value` (or `settings.get("timeout", 30)`)',
        wrong: [
          'Use `and` instead of `or`: `settings.get("timeout") and 30`',
          'Wrap it in `bool()`: `bool(settings.get("timeout")) or 30`',
          'Nothing is wrong: `0` is not a valid timeout, so `30` is correct',
        ],
        why: '`or` returns the right operand whenever the left is falsy, and `0` is falsy, so a deliberate `0` is replaced by `30`. Check for `None` (or use `dict.get` with a default, which applies only when the key is missing). `and` would return `30` for every truthy value and `bool()` would return `True`.',
      },
      {
        key: 'empty-list',
        question:
          'The function should return `"no data"` only when `items` is `None`, but an empty list should give `"0 items"`. Which condition is correct?',
        code: `def describe(items):
    if not items:
        return "no data"
    return f"{len(items)} items"

print(describe(None))
print(describe([]))`,
        correct: '`if items is None:`',
        wrong: ['`if items == False:`', '`if not len(items):`', '`if items is []:`'],
        why: '`not items` is true for both `None` and `[]`. `items is None` separates the two. `[] == False` is `False` (so `None` would not match either), `len(None)` raises `TypeError`, and `items is []` compares against a brand-new list and is always `False`.',
      },
    ],
  ),
  ...b.output(
    'py-and-or-values',
    3,
    [
      '`and` and `or` return one of their operands, not necessarily `True` or `False`.',
      '`or` returns the first truthy operand (or the last one); `and` returns the first falsy operand (or the last one).',
    ],
    [
      {
        key: 'or-chain',
        code: `print(None or 0 or "fallback")
print([] or {} or 0)`,
        output: 'fallback\n0',
        why: '`or` returns the first truthy operand: `"fallback"` in the first line. When every operand is falsy, it returns the last one, which is `0`, not `False`.',
      },
      {
        key: 'and-chain',
        code: `print(3 and 4)
print(3 and 0 and 5)
print([1] and "ok")`,
        output: '4\n0\nok',
        why: '`and` returns the first falsy operand, or the last operand when all are truthy. `3 and 4` is `4`, `3 and 0 and 5` stops at `0`, and `[1] and "ok"` is `"ok"`.',
      },
      {
        key: 'mixed',
        code: `name = ""
nickname = "Ace"
print(name and name.upper() or nickname)`,
        output: 'Ace',
        why: '`and` binds tighter than `or`: `(name and name.upper()) or nickname`. `name` is `""`, so the `and` part is `""`, and `or` moves on to `nickname`.',
      },
    ],
  ),
  ...b.output(
    'py-match-statement',
    4,
    [
      'Cases are tried top to bottom; the first that matches runs.',
      'A bare name in a pattern captures the value; a dotted name like `Color.RED` compares against a constant.',
    ],
    [
      {
        key: 'tuples',
        code: `def where(point):
    match point:
        case (0, 0):
            return "origin"
        case (0, y):
            return f"y-axis at {y}"
        case (x, 0):
            return f"x-axis at {x}"
        case _:
            return "elsewhere"

print(where((0, 5)))
print(where((3, 0)))
print(where((2, 2)))`,
        output: 'y-axis at 5\nx-axis at 3\nelsewhere',
        why: 'Sequence patterns match by position: literals must be equal and names capture. `(0, 5)` matches `(0, y)` with `y = 5`, `(3, 0)` matches `(x, 0)`, and `(2, 2)` falls through to the wildcard `_`.',
      },
      {
        key: 'mapping',
        code: `def handle(event):
    match event:
        case {"type": "click", "x": x}:
            return f"click at {x}"
        case {"type": "key", "key": "Enter" | "Return"}:
            return "submit"
        case {"type": t}:
            return f"ignored {t}"

print(handle({"type": "click", "x": 10, "y": 3}))
print(handle({"type": "key", "key": "Return"}))
print(handle({"type": "scroll"}))`,
        output: 'click at 10\nsubmit\nignored scroll',
        why: 'Mapping patterns check only the listed keys, so extra keys like `"y"` are allowed. `|` combines alternatives. The last case captures the type of any other event.',
      },
      {
        key: 'guard',
        code: `def classify(n):
    match n:
        case int() if n < 0:
            return "negative"
        case 0:
            return "zero"
        case int():
            return "positive"
        case _:
            return "not an int"

print(classify(-4), classify(0), classify(7), classify(2.5))`,
        output: 'negative zero positive not an int',
        why: '`int()` is a class pattern that matches instances of `int`; the guard `if n < 0` must also be true. `2.5` is a `float`, so it matches none of the `int` cases and reaches `_`.',
      },
    ],
  ),
  ...b.output(
    'py-short-circuit',
    5,
    [
      'Python stops evaluating `and`/`or` as soon as the result is known.',
      '`all()` and `any()` also stop early, and their answers for an empty iterable are fixed.',
    ],
    [
      {
        key: 'side-effects',
        code: `def check(x):
    print("check", x)
    return x

result = check(0) and check(1)
print(result)
result = check(2) or check(3)
print(result)`,
        output: 'check 0\n0\ncheck 2\n2',
        why: '`check(0)` returns `0`, which is falsy, so `and` does not call `check(1)`. `check(2)` returns `2`, truthy, so `or` does not call `check(3)`. Only two calls happen.',
      },
      {
        key: 'all-any-empty',
        code: `print(all([]), any([]))
print(all([0, 1]), any([0, ""]))`,
        output: 'True False\nFalse False',
        why: '`all([])` is `True` (no element is falsy) and `any([])` is `False` (no element is truthy). A validation like `all(rule(x) for x in items)` therefore passes on an empty list, which is often a bug.',
      },
      {
        key: 'any-generator',
        code: `def is_big(n):
    print("test", n)
    return n > 10

print(any(is_big(n) for n in [5, 20, 30]))`,
        output: 'test 5\ntest 20\nTrue',
        why: 'With a generator expression, `any` pulls one value at a time and returns `True` at the first truthy result, so `30` is never tested. A list comprehension (`any([is_big(n) for n in ...])`) would test all three first.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Strings

export const stringsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'py-string-slicing',
    1,
    [
      '`s[a:b]` includes index `a` and stops before `b`; negative indexes count from the end.',
      'A third value is the step: `s[::2]` takes every second character, `s[::-1]` reverses.',
    ],
    [
      {
        key: 'basic',
        code: `s = "pracstack"
print(s[0:4], s[4:])`,
        output: 'prac stack',
        why: '`s[0:4]` covers indexes 0 to 3 and `s[4:]` runs from index 4 to the end. Splitting at the same index gives two pieces that rejoin to the original.',
      },
      {
        key: 'negative',
        code: `filename = "report.final.pdf"
print(filename[-3:], filename[:-4])`,
        output: 'pdf report.final',
        why: '`[-3:]` takes the last three characters and `[:-4]` drops the last four (`.pdf`). Negative indexes count from the end, with `-1` being the last character.',
      },
      {
        key: 'step',
        code: `s = "abcdefg"
print(s[::2], s[::-1], s[1:5:2])`,
        output: 'aceg gfedcba bd',
        why: '`[::2]` takes every second character from the start, `[::-1]` walks backward over the whole string, and `[1:5:2]` takes indexes 1 and 3.',
      },
      {
        key: 'out-of-range',
        code: `s = "hi"
print(s[1:100] + "|" + s[5:] + "|")`,
        output: 'i||',
        why: 'Slices clamp out-of-range bounds instead of raising, so `s[1:100]` is `"i"` and `s[5:]` is an empty string. Only single-index access like `s[5]` raises `IndexError`.',
      },
    ],
  ),
  ...b.fails(
    'py-string-immutability',
    2,
    'Strings are immutable: their methods return new strings and item assignment is not allowed.',
    [
      {
        key: 'item-assignment',
        question: 'Why does this program fail?',
        code: `word = "python"
word[0] = "P"
print(word)`,
        error: 'TypeError',
        correct:
          'Strings are immutable, so `word[0] = "P"` raises `TypeError`; build a new string, for example `word = "P" + word[1:]` or `word.capitalize()`',
        wrong: [
          'Index `0` is out of range for a string, so it raises `IndexError`',
          'Single characters must be assigned with `word[0:1]`, the slice form works',
          'It works and prints `Python`',
        ],
        why: 'A `str` object can never change. Item and slice assignment both raise `TypeError: \'str\' object does not support item assignment`. Every string method (`upper`, `replace`, `capitalize`) returns a new string.',
      },
      {
        key: 'append',
        question: 'Why does this program fail?',
        code: `log = "start"
log.append(" done")
print(log)`,
        error: 'AttributeError',
        correct:
          '`str` has no `append` method (strings are immutable); use `log += " done"` or collect parts in a list and `"".join` them',
        wrong: [
          '`append` needs a list argument: `log.append([" done"])`',
          '`append` works only on strings created with `str()`',
          'It fails because `" done"` starts with a space',
        ],
        why: 'Lists have `append` because they are mutable. A string cannot grow in place, so it has no such method and the call raises `AttributeError`. `+=` creates a new string and rebinds the name.',
      },
    ],
  ),
  ...b.outputChoice(
    'py-string-methods-return',
    2,
    'String methods return a new string; the original is unchanged unless you reassign it.',
    [
      {
        key: 'upper-discarded',
        code: `name = "ada"
name.upper()
print(name)`,
        correct: 'ada',
        wrong: ['ADA', 'None', 'Ada'],
        why: '`name.upper()` returns `"ADA"`, but the result is discarded. `name` still refers to the original string. Write `name = name.upper()`.',
      },
      {
        key: 'replace-count',
        code: `s = "banana"
t = s.replace("a", "o", 2)
print(s, t)`,
        correct: 'banana bonona',
        wrong: ['bonona bonona', 'banana bonono', 'banana banana'],
        why: '`replace` returns a new string and leaves `s` alone. The optional third argument limits the number of replacements to the first two occurrences, so the last `a` stays.',
      },
      {
        key: 'strip-split',
        code: `line = "  alice,  bob ,carol  "
names = [n.strip() for n in line.split(",")]
print(names)`,
        correct: "['alice', 'bob', 'carol']",
        wrong: [
          "['  alice', '  bob ', 'carol  ']",
          "['alice,', 'bob', ',carol']",
          "['alice', '', 'bob', 'carol']",
        ],
        why: '`split(",")` cuts at each comma and keeps the surrounding spaces; `strip()` then removes leading and trailing whitespace from each part.',
      },
    ],
  ),
  ...b.output(
    'py-split-variants',
    3,
    [
      '`split()` with no argument splits on runs of whitespace and drops empty strings.',
      '`split(sep)` with an explicit separator keeps empty fields.',
    ],
    [
      {
        key: 'whitespace',
        code: `text = "  one   two\\tthree  "
print(text.split())
print(text.split(" ")[:4])`,
        output: "['one', 'two', 'three']\n['', '', 'one', '']",
        why: 'With no argument, `split()` treats any run of spaces or tabs as one separator and ignores leading and trailing whitespace. `split(" ")` splits at every single space, so consecutive spaces produce empty strings.',
      },
      {
        key: 'csv-empty',
        code: `row = "a,b,,c,"
print(row.split(","), len(row.split(",")))`,
        output: "['a', 'b', '', 'c', ''] 5",
        why: 'An explicit separator keeps empty fields: between the two commas and after the trailing comma. That is important for CSV-like data where position matters, but use the `csv` module for real CSV with quoting.',
      },
      {
        key: 'maxsplit',
        code: `entry = "2026-11-25 ERROR db: connection lost: retrying"
date, level, message = entry.split(" ", 2)
print(level)
print(message)`,
        output: 'ERROR\ndb: connection lost: retrying',
        why: '`maxsplit=2` stops after two splits, so the rest of the line, spaces and all, stays in `message`. Without it the unpacking would fail with too many values.',
      },
    ],
  ),
  ...b.output(
    'py-fstring-formatting',
    3,
    [
      'The format spec after `:` controls width, alignment, precision and grouping.',
      '`!r` uses `repr()`, and `{expr=}` prints the expression text too.',
    ],
    [
      {
        key: 'precision-grouping',
        code: `price = 1234567.891
print(f"{price:.2f}")
print(f"{price:,.2f}")
print(f"{0.256:.1%}")`,
        output: '1234567.89\n1,234,567.89\n25.6%',
        why: '`.2f` rounds to two decimals, `,` adds a comma thousands separator (always a comma, not locale-dependent) and `%` multiplies by 100 and adds a percent sign.',
      },
      {
        key: 'align-pad',
        code: `for name, qty in [("pen", 3), ("notebook", 12)]:
    print(f"{name:<8}|{qty:>4}|{qty:03d}")`,
        output: 'pen     |   3|003\nnotebook|  12|012',
        why: '`<8` left-aligns in 8 characters, `>4` right-aligns in 4, and `03d` pads an integer with zeros to width 3.',
      },
      {
        key: 'repr-debug',
        code: `user = "Ada"
count = 3
print(f"{user!r} has {count=}")`,
        output: "'Ada' has count=3",
        why: '`!r` formats with `repr()`, which adds quotes around strings. The `=` specifier (Python 3.8+) prints the expression text, an equals sign and the value, which is handy for debugging.',
      },
    ],
  ),
  ...b.fails(
    'py-join-non-strings',
    3,
    '`str.join` accepts only an iterable of strings.',
    [
      {
        key: 'ints',
        question: 'Why does this program fail?',
        code: `ids = [101, 102, 103]
print(", ".join(ids))`,
        error: 'TypeError',
        correct:
          '`join` requires strings and the items are ints, so it raises `TypeError`; convert them: `", ".join(str(i) for i in ids)`',
        wrong: [
          'The separator must be a single character',
          '`join` must be called on the list: `ids.join(", ")`',
          'It works and prints `101, 102, 103`',
        ],
        why: '`str.join` never converts its items; the error is `TypeError: sequence item 0: expected str instance, int found`. `join` is a method of the separator string, not of the list (lists have no `join`).',
      },
      {
        key: 'none-in-list',
        question: 'The report builder fails on some records. What is the cause?',
        code: `record = {"first": "Grace", "middle": None, "last": "Hopper"}
parts = [record["first"], record["middle"], record["last"]]
print(" ".join(parts))`,
        error: 'TypeError',
        correct:
          '`record["middle"]` is `None`, and `join` raises `TypeError` on a non-string item; filter it out, for example `" ".join(p for p in parts if p)`',
        wrong: [
          'The dict has no key `"middle"`, so it raises `KeyError`',
          '`join` cannot be used with a list built from dict values',
          '`None` is joined as the text `None`, so the output is just ugly, not an error',
        ],
        why: 'The key exists but its value is `None`. `join` does not call `str()` on items, so `None` makes it raise `TypeError: sequence item 1: expected str instance, NoneType found`.',
      },
    ],
  ),
  ...b.codeChoice(
    'py-strip-character-set',
    4,
    '`strip`, `lstrip` and `rstrip` take a set of characters, not a prefix or suffix.',
    [
      {
        key: 'rstrip-extension',
        question: 'This code should remove the `.csv` extension. What does it print, and what is the right fix?',
        code: `filename = "stats.csv"
print(filename.rstrip(".csv"))
print(filename.removesuffix(".csv"))`,
        correct:
          'The first line prints `stat` because `rstrip` removes any trailing `.`, `c`, `s` or `v` characters; `removesuffix(".csv")` gives `stats`',
        wrong: [
          'Both lines print `stats`: `rstrip` and `removesuffix` do the same thing',
          'The first line prints `stats.csv` because `rstrip` only removes whitespace when given an argument',
          'The first line raises `ValueError` because `.csv` is not a single character',
        ],
        why: 'The argument to `rstrip` is a set of characters to strip from the right, repeated until a character outside the set appears. After `v`, `s`, `c`, `.` it also strips the `s` of `stats`, giving `stat`. `str.removesuffix` and `str.removeprefix` (Python 3.9+) remove an exact substring once.',
      },
      {
        key: 'lstrip-prefix',
        question: 'What does this print?',
        code: `url = "https://shop.example.com"
print(url.lstrip("https://"))`,
        correct: '`op.example.com`: the characters `h`, `t`, `p`, `s`, `:` and `/` are stripped from the left until another character appears',
        wrong: [
          '`shop.example.com`: the prefix is removed exactly once',
          '`https://shop.example.com`: the prefix is longer than one character, so nothing happens',
          '`.example.com`: `lstrip` removes the first word',
        ],
        why: '`lstrip` keeps removing leading characters while they are in the set `{h, t, p, s, :, /}`, so it also eats the `s` and `h` of `shop`. Use `url.removeprefix("https://")` or `urllib.parse` to remove a scheme.',
      },
    ],
  ),
  ...b.output(
    'py-unicode-case-order',
    5,
    [
      'String comparison uses code points: all uppercase ASCII letters sort before lowercase ones.',
      '`casefold()` is the aggressive lowercasing meant for caseless comparison.',
    ],
    [
      {
        key: 'sorting',
        code: `words = ["banana", "apple", "Cherry", "Apple"]
print(sorted(words))
print(sorted(words, key=str.lower))`,
        output: "['Apple', 'Cherry', 'apple', 'banana']\n['apple', 'Apple', 'banana', 'Cherry']",
        why: 'Uppercase letters have smaller code points than all lowercase letters, so the default sort puts `"Apple"` and `"Cherry"` before `"apple"`. With `key=str.lower` the words sort alphabetically; the two apples compare equal and `sorted` is stable, so they keep their original relative order (`"apple"` first).',
      },
      {
        key: 'casefold',
        code: `a = "Straße"
b = "STRASSE"
print(a.upper())
print(a.lower() == b.lower(), a.casefold() == b.casefold())`,
        output: 'STRASSE\nFalse True',
        why: '`"ß".upper()` is `"SS"`, so case conversion can change length. `lower()` keeps `ß`, so the `lower` comparison fails, while `casefold()` maps `ß` to `ss` and is the right choice for caseless matching.',
      },
      {
        key: 'bytes-length',
        code: `word = "café"
data = word.encode("utf-8")
print(len(word), len(data))
print(data.decode("utf-8") == word)`,
        output: '4 5\nTrue',
        why: '`len` of a `str` counts code points (4). Encoded as UTF-8, `é` takes two bytes, so the `bytes` object has length 5. Decoding with the same encoding gives back an equal string.',
      },
    ],
  ),
];
