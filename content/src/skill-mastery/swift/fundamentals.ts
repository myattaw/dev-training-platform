import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Swift fundamentals: constants and variables, types, operators, strings and
 * characters. Every snippet is compiled and run by the real Swift runner
 * (Swift 6.4 on Linux). Code uses String.raw so Swift escapes such as `\(x)`
 * and `\n` reach the compiler unchanged.
 */

const b = programBuilders('swift');
const sw = String.raw;

// ---------------------------------------------------------------- Constants, variables and types

export const basicsFamilies: readonly QuestionSource[] = [
  ...b.compiles(
    'swift-let-var',
    1,
    'A `let` constant can be given a value exactly once; a `var` can be changed later.',
    [
      {
        key: 'reassign-let',
        code: sw`let maxUsers = 10
maxUsers = 20
print(maxUsers)`,
        compiles: false,
        why: '`maxUsers` is declared with `let`, so assigning it again is a compile error ("cannot assign to value: maxUsers is a let constant"). Use `var` when a value must change, and keep `let` as the default so the compiler catches accidental changes.',
      },
      {
        key: 'var-mutation',
        code: sw`var score = 10
score += 5
print(score)`,
        compiles: true,
        why: '`score` is a `var`, so `+=` is allowed. Swift infers its type as `Int` from the literal `10`.',
      },
      {
        key: 'deferred-let',
        code: sw`let label: String
let count = 3
if count > 1 {
    label = "items"
} else {
    label = "item"
}
print(label)`,
        compiles: true,
        why: 'A `let` does not have to be initialized where it is declared: it must be assigned exactly once before it is read. Each path through the `if` assigns `label` once, so this compiles. A type annotation is required because there is no initial value to infer from.',
      },
      {
        key: 'let-array-append',
        code: sw`let names = ["Ana", "Ben"]
names.append("Cy")
print(names.count)`,
        compiles: false,
        why: 'Arrays are values in Swift. A `let` array is immutable as a whole, so mutating methods such as `append` are compile errors ("cannot use mutating member on immutable value"). Declare it with `var` to add elements.',
      },
    ],
  ),
  ...b.blank(
    'swift-type-annotation',
    1,
    'Swift never converts between numeric types on its own: convert explicitly with the target type’s initializer.',
    [
      {
        key: 'average',
        prompt:
          'Complete the code so `average` is the `Double` average of two `Int` values and the program prints `3.5`.',
        template: sw`let total = 7
let count = 2
let average = Double(total) / {{blank:b}}
print(average)`,
        blanks: { b: ['Double(count)', '2.0', '2'] },
        why: 'Both operands of `/` must have the same type. `Double(count)` converts the `Int` explicitly; a literal such as `2` or `2.0` also works because literals take their type from context. Writing `count` alone does not compile: Swift never mixes `Double` and `Int` implicitly.',
      },
      {
        key: 'annotation',
        prompt:
          'Fill in the type annotation so `ratio` is a floating-point value even though it is written as an integer literal.',
        template: sw`let ratio: {{blank:t}} = 1
print(ratio / 4)`,
        blanks: { t: ['Double', 'Float'] },
        why: 'Without an annotation, `1` is inferred as `Int` and `ratio / 4` would be integer division (`0`). Annotating `Double` (or `Float`) makes the literal a floating-point value, so the result is `0.25`.',
      },
    ],
  ),
  ...b.output(
    'swift-integer-division',
    2,
    [
      'When both operands are integers, `/` is integer division.',
      'Integer division truncates toward zero, and `%` keeps the sign of the left operand.',
    ],
    [
      {
        key: 'positive',
        code: sw`let pages = 7
let perSheet = 2
print(pages / perSheet)
print(pages % perSheet)`,
        output: '3\n1',
        why: 'Both values are `Int`, so `7 / 2` is integer division and gives `3` (the fraction is dropped, not rounded). `7 % 2` is the remainder, `1`.',
      },
      {
        key: 'negative',
        code: sw`let delta = -7
print(delta / 2)
print(delta % 3)`,
        output: '-3\n-1',
        why: 'Swift integer division truncates toward zero, so `-7 / 2` is `-3`, not `-4` as floor division would give. The remainder takes the sign of the dividend: `-7 % 3` is `-1`.',
      },
      {
        key: 'mixed-literal',
        code: sw`let a = 7 / 2
let b = 7.0 / 2
print(a)
print(b)`,
        output: '3\n3.5',
        why: '`7 / 2` uses two integer literals, so `a` is an `Int` with value `3`. In `7.0 / 2` the literal `2` takes the type `Double` from the other operand, so `b` is `3.5`.',
      },
    ],
  ),
  ...b.whichCompile(
    'swift-no-implicit-conversion',
    2,
    'Literals adapt to the type around them; variables of different numeric types never mix without an explicit conversion.',
    [
      {
        key: 'int-double',
        question: 'Which of these lines compile after the declarations shown?',
        prelude: sw`let count: Int = 3
let price: Double = 2.5`,
        options: [
          'let total = count * price',
          'let total = Double(count) * price',
          'let total = price * 2',
          'let total: Int = price',
          'let total = count * Int(price)',
        ],
        correct: [
          'let total = Double(count) * price',
          'let total = price * 2',
          'let total = count * Int(price)',
        ],
        why: '`count * price` mixes `Int` and `Double`, and `let total: Int = price` assigns a `Double` to an `Int`: both are compile errors because Swift has no implicit numeric conversions. `Double(count)` and `Int(price)` convert explicitly (the latter truncates to `2`), and the literal `2` simply becomes a `Double`.',
      },
      {
        key: 'int-sizes',
        question: 'Which of these lines compile after the declarations shown?',
        prelude: sw`let small: Int8 = 5
let big: Int = 1000`,
        options: [
          'let sum = small + big',
          'let sum = Int(small) + big',
          'let sum = small + 100',
          'let sum: Int64 = big',
          'let sum = small + Int8(3)',
        ],
        correct: [
          'let sum = Int(small) + big',
          'let sum = small + 100',
          'let sum = small + Int8(3)',
        ],
        why: '`Int8` and `Int` are different types, so `small + big` and assigning an `Int` to an `Int64` do not compile. Converting with `Int(small)` works, and the literal `100` is typed as `Int8` from context (it fits in `-128...127`).',
      },
    ],
  ),
  ...b.compiles(
    'swift-operator-habits',
    2,
    'Some operators from C-family languages were deliberately left out of Swift.',
    [
      {
        key: 'plus-plus',
        code: sw`var attempts = 0
attempts++
print(attempts)`,
        compiles: false,
        why: 'Swift removed `++` and `--` (Swift 3). Write `attempts += 1` instead. This is one of the most common habits carried over from C, Java or JavaScript.',
      },
      {
        key: 'assign-in-if',
        code: sw`var level = 1
if level = 5 {
    print("max")
}`,
        compiles: false,
        why: 'In Swift, assignment does not return a value, so `if level = 5` is a compile error rather than a silent bug. The comparison is `level == 5`.',
      },
      {
        key: 'ternary',
        code: sw`let stock = 0
let label = stock > 0 ? "In stock" : "Sold out"
print(label)`,
        compiles: true,
        why: 'The ternary conditional operator `condition ? a : b` exists in Swift; both branches must have the same type, here `String`.',
      },
      {
        key: 'int-as-bool',
        code: sw`let flags = 1
if flags {
    print("set")
}`,
        compiles: false,
        why: 'Conditions must be `Bool`. An `Int` is never treated as true or false, so `if flags` does not compile; write `if flags != 0`.',
      },
    ],
  ),
  ...b.output(
    'swift-overflow-operators',
    3,
    [
      'The operators with a leading `&` wrap around instead of trapping.',
      '`UInt8` holds `0...255` and `Int8` holds `-128...127`.',
    ],
    [
      {
        key: 'uint8-add',
        code: sw`let level: UInt8 = 250
print(level &+ 10)`,
        output: '4',
        why: '`&+` is the overflow addition operator: `250 + 10 = 260` wraps modulo 256 to `4`. A plain `+` with the same values would trap at run time (or be rejected at compile time when the compiler can see the constants).',
      },
      {
        key: 'int8-max',
        code: sw`let top = Int8.max
print(top)
print(top &+ 1)`,
        output: '127\n-128',
        why: '`Int8.max` is `127`. Adding `1` with `&+` wraps to the minimum value, `-128` (two’s complement).',
      },
      {
        key: 'uint-subtract',
        code: sw`let zero: UInt8 = 0
print(zero &- 1)
print(UInt8.min, UInt8.max)`,
        output: '255\n0 255',
        why: '`&-` wraps below zero to the top of the range: `0 &- 1` is `255` for `UInt8`. Without the `&`, subtracting below zero in an unsigned type traps.',
      },
    ],
  ),
  ...b.fails(
    'swift-overflow-trap',
    4,
    'Swift checks integer arithmetic and conversions at run time and stops the program instead of producing a wrong value.',
    [
      {
        key: 'loop',
        question: 'This program crashes. Why?',
        code: sw`func total(_ values: [Int8]) -> Int8 {
    var sum: Int8 = 0
    for v in values { sum += v }
    return sum
}
print(total([100, 20, 10]))`,
        error: 'The program crashed',
        correct:
          '`100 + 20 + 10` is `130`, which does not fit in `Int8` (max `127`); Swift traps on overflow instead of wrapping',
        wrong: [
          'The sum silently wraps to `-126`, and `print` cannot print negative `Int8` values',
          '`for v in values` cannot iterate an array of `Int8`',
          '`Int8` values must be converted to `Int` before `+=` can be used',
        ],
        why: 'Plain arithmetic operators trap on overflow: the program stops with a runtime error rather than continuing with a wrapped value. Fix it by accumulating in a wider type (`var sum = 0` as `Int`, adding `Int(v)`), or use `&+=` only if wrapping is really what you want.',
      },
      {
        key: 'narrowing',
        question: 'This program crashes. Why?',
        code: sw`let readings = [120, 300, 80]
var bytes: [UInt8] = []
for r in readings {
    bytes.append(UInt8(r))
}
print(bytes)`,
        error: 'Fatal error: Not enough bits to represent the passed value',
        correct:
          '`UInt8(300)` traps because `300` does not fit in `UInt8`; use `UInt8(exactly:)` or `UInt8(clamping:)` to handle out-of-range values',
        wrong: [
          '`UInt8(r)` returns an Optional, which cannot be appended to `[UInt8]`',
          '`bytes` is empty, so `append` is out of range',
          '`UInt8(300)` silently becomes `44`, and printing the array fails',
        ],
        why: 'Converting with `UInt8(_:)` requires the value to fit; otherwise it is a runtime trap ("Not enough bits to represent the passed value"). `UInt8(exactly: r)` returns `nil` instead, `UInt8(clamping: r)` saturates to `255`, and `UInt8(truncatingIfNeeded: r)` keeps the low 8 bits.',
      },
      {
        key: 'unsigned-subtract',
        question: 'This program crashes. Why?',
        code: sw`func remaining(stock: UInt, ordered: UInt) -> UInt {
    return stock - ordered
}
print(remaining(stock: 5, ordered: 2))
print(remaining(stock: 2, ordered: 5))`,
        error: 'The program crashed',
        correct:
          '`2 - 5` is negative, which `UInt` cannot represent, so the subtraction traps at run time',
        wrong: [
          '`UInt` parameters cannot have argument labels',
          'The result wraps to a very large number and `print` overflows',
          'The first call fails because `UInt` cannot be returned from a function',
        ],
        why: 'Unsigned arithmetic below zero is an overflow, and Swift traps on overflow. Prefer `Int` for quantities that can be compared or subtracted, and check `ordered <= stock` before subtracting.',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-numeric-conversion',
    4,
    'Converting a `Double` to an `Int` truncates toward zero; converting a `String` to a number can fail.',
    [
      {
        key: 'truncate',
        code: sw`print(Int(3.99), Int(-3.99))`,
        correct: '3 -3',
        wrong: ['4 -4', '3 -4', '4 -3'],
        why: '`Int(_:)` from a `Double` truncates toward zero: `3.99` becomes `3` and `-3.99` becomes `-3`. It does not round (that would be `Int(x.rounded())`), and it does not floor negative values.',
      },
      {
        key: 'from-string',
        code: sw`let a = Int("42")
let b = Int("4.2")
print(a ?? -1, b ?? -1)`,
        correct: '42 -1',
        wrong: ['42 4', '42 4.2', '-1 -1'],
        why: '`Int(String)` is a failable initializer that returns `Int?`. `"42"` parses, but `"4.2"` is not a valid integer, so it returns `nil` and `?? -1` supplies the fallback. It never truncates a decimal string.',
      },
      {
        key: 'exactly',
        code: sw`let x = Int(exactly: 3.0)
let y = Int(exactly: 3.5)
print(x as Any, y as Any)`,
        correct: 'Optional(3) nil',
        wrong: ['3 3', 'Optional(3) Optional(3)', '3 nil'],
        why: '`Int(exactly:)` returns `nil` when the value cannot be represented exactly, so `3.5` gives `nil` instead of being truncated. The results are optionals, so a present value prints as `Optional(3)`.',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-floating-point',
    5,
    'Binary floating point cannot represent most decimal fractions exactly.',
    [
      {
        key: 'point-one',
        code: sw`let total = 0.1 + 0.2
print(total == 0.3, total)`,
        correct: 'false 0.30000000000000004',
        wrong: ['true 0.3', 'false 0.3', 'true 0.30000000000000004'],
        why: '`0.1` and `0.2` are stored as the nearest binary `Double` values, and their sum is slightly larger than the `Double` nearest to `0.3`. Swift prints the shortest decimal that round-trips, which shows the difference. Compare floating-point values with a tolerance, or use integer cents for money.',
      },
      {
        key: 'nan',
        code: sw`let ratio = 0.0 / 0.0
print(ratio == ratio, ratio.isNaN)`,
        correct: 'false true',
        wrong: ['true true', 'true false', 'The program crashes: division by zero'],
        why: 'Floating-point division by zero does not trap: `0.0 / 0.0` is NaN. NaN is not equal to anything, including itself, so `ratio == ratio` is `false`; use `isNaN` to test for it. Only integer division by zero traps.',
      },
      {
        key: 'float-precision',
        code: sw`let f: Float = 16_777_217
let d: Double = 16_777_217
print(f == 16_777_216, d == 16_777_216)`,
        correct: 'true false',
        wrong: ['false false', 'true true', 'false true'],
        why: '`Float` has a 24-bit significand, so `16_777_217` (2^24 + 1) cannot be represented and rounds to `16_777_216`. `Double` has 53 bits and stores it exactly. Underscores in numeric literals are only for readability.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Strings and characters

export const stringsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'swift-string-interpolation',
    1,
    ['Anything inside `\\(...)` in a string literal is evaluated and inserted.'],
    [
      {
        key: 'expression',
        code: sw`let item = "apple"
let count = 3
print("\(count) \(item)s cost \(count * 2) dollars")`,
        output: '3 apples cost 6 dollars',
        why: 'String interpolation evaluates any expression inside `\\(...)`, including `count * 2`, and inserts its description. Text outside the parentheses, such as the `s` after `item`, is kept literally.',
      },
      {
        key: 'concatenation',
        code: sw`var greeting = "Hello"
greeting += ", " + "Swift"
let name = greeting + "!"
print(name, greeting.count)`,
        output: 'Hello, Swift! 12',
        why: '`+` and `+=` concatenate strings. `greeting` becomes `"Hello, Swift"` (12 characters), and `name` adds the `!` to a new string without changing `greeting`.',
      },
      {
        key: 'multiline',
        code: sw`let user = "Kim"
let message = """
    Hi \(user),
      welcome!
    """
print(message)`,
        output: 'Hi Kim,\n  welcome!',
        why: 'In a multi-line string literal, the indentation of the closing `"""` is removed from every line, so `Hi Kim,` starts at column 0 while the extra two spaces before `welcome!` are kept. Interpolation works inside multi-line literals too.',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-interpolating-optionals',
    2,
    'Interpolating an Optional shows the Optional wrapper, not just the value.',
    [
      {
        key: 'dictionary-lookup',
        code: sw`let prices = ["tea": 3]
let price = prices["tea"]
print("Tea costs \(String(describing: price))")`,
        correct: 'Tea costs Optional(3)',
        wrong: ['Tea costs 3', 'Tea costs nil', 'Tea costs Optional<Int>'],
        why: 'A dictionary subscript returns an Optional (`Int?`), and its description is `Optional(3)`. Unwrap it first (`if let price`, or `price ?? 0`) to show just `3`. The compiler also warns when an Optional is interpolated directly.',
      },
      {
        key: 'unwrapped',
        code: sw`let prices = ["tea": 3]
let price = prices["coffee"] ?? 0
print("Coffee costs \(price)")`,
        correct: 'Coffee costs 0',
        wrong: ['Coffee costs nil', 'Coffee costs Optional(0)', 'Coffee costs Optional(nil)'],
        why: '`prices["coffee"]` is `nil`, so `??` supplies `0`. The result of `??` here is a plain `Int`, so it interpolates as `0` with no Optional wrapper.',
      },
    ],
  ),
  ...b.whichCompile(
    'swift-string-subscript',
    2,
    'Strings are indexed with `String.Index` values, not integers.',
    [
      {
        key: 'first-char',
        question: 'Which of these lines compile after the declaration shown?',
        prelude: sw`let word = "swift"`,
        options: [
          'let c = word[0]',
          'let c = word[word.startIndex]',
          'let c = word.first',
          'let c = word[word.index(word.startIndex, offsetBy: 1)]',
          'let c = word.characters[0]',
        ],
        correct: [
          'let c = word[word.startIndex]',
          'let c = word.first',
          'let c = word[word.index(word.startIndex, offsetBy: 1)]',
        ],
        why: '`String` has no integer subscript, because characters have variable width (a `Character` can be several Unicode scalars). Use `String.Index` values (`startIndex`, `index(_:offsetBy:)`) or collection APIs such as `first`. The old `characters` view was deprecated in Swift 4 and is no longer available.',
      },
      {
        key: 'character-type',
        question: 'Which of these lines compile after the declaration shown?',
        prelude: sw`let initial: Character = "K"`,
        options: [
          'let s: String = initial',
          'let s = String(initial)',
          'let c: Character = "ab"',
          'let s = "Mr. " + String(initial)',
          'let s = "Mr. " + initial',
        ],
        correct: ['let s = String(initial)', 'let s = "Mr. " + String(initial)'],
        why: '`Character` and `String` are different types: a `Character` is not implicitly a `String`, and `String + Character` has no overload. Convert with `String(initial)`. A `Character` literal must contain exactly one extended grapheme cluster, so `"ab"` cannot be a `Character`.',
      },
    ],
  ),
  ...b.blank(
    'swift-string-index-blank',
    3,
    'Indices are computed from `startIndex` (or `endIndex`) with `index(_:offsetBy:)`.',
    [
      {
        key: 'third',
        prompt: 'Complete the code so it prints the third character of `code`, `C`.',
        template: sw`let code = "ABCDE"
let i = code.index(code.startIndex, offsetBy: {{blank:n}})
print(code[i])`,
        blanks: { n: ['2'] },
        why: 'Offsets are zero-based like array indices: `startIndex` is the first character, so the third is at offset `2`.',
      },
      {
        key: 'last',
        prompt: 'Complete the code so it prints the last character of `code`, `E`.',
        template: sw`let code = "ABCDE"
let i = code.index(before: code.{{blank:end}})
print(code[i])`,
        blanks: { end: ['endIndex'] },
        why: '`endIndex` is the position just past the last character, so it is not a valid subscript itself. `index(before: endIndex)` is the last character. (`code.last` is an easier way to read it.)',
      },
      {
        key: 'prefix',
        prompt: 'Complete the code so it prints the first three characters, `ABC`.',
        template: sw`let code = "ABCDE"
let end = code.index(code.startIndex, offsetBy: 3)
print(code[code.startIndex{{blank:op}}end])`,
        blanks: { op: ['..<'] },
        why: 'A half-open range of indices `startIndex..<end` selects the characters before `end`, giving the `Substring` `"ABC"`. A closed range `...` would include the character at `end` too. `code.prefix(3)` does the same thing more readably.',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-character-count',
    3,
    '`count` counts user-perceived characters (extended grapheme clusters), not bytes.',
    [
      {
        key: 'accent',
        code: sw`let city = "Zürich"
print(city.count, city.utf8.count)`,
        correct: '6 7',
        wrong: ['7 7', '6 6', '7 6'],
        why: '`count` counts `Character`s, so `Zürich` has 6. Its UTF-8 encoding needs 2 bytes for `ü`, so `utf8.count` is 7. Use `utf8.count` when you need the byte size, for example for a storage limit.',
      },
      {
        key: 'combining',
        code: sw`let precomposed = "caf\u{E9}"
let combining = "cafe\u{301}"
print(precomposed == combining, combining.count)`,
        correct: 'true 4',
        wrong: ['false 5', 'true 5', 'false 4'],
        why: '`\\u{E9}` is `é` as one scalar; `e` followed by the combining acute accent `\\u{301}` is the same character drawn from two scalars. Swift compares strings by canonical equivalence and counts grapheme clusters, so they are equal and both have 4 characters.',
      },
      {
        key: 'emoji',
        code: sw`let flag = "🇨🇦"
print(flag.count, flag.unicodeScalars.count)`,
        correct: '1 2',
        wrong: ['2 2', '1 1', '2 1'],
        why: 'A flag emoji is one user-perceived character made of two regional-indicator scalars. `count` is `1`; `unicodeScalars.count` is `2`. This is why Swift cannot offer cheap integer subscripting of strings.',
      },
    ],
  ),
  ...b.output(
    'swift-string-value-semantics',
    2,
    ['`String` is a value type: assigning it copies the value.'],
    [
      {
        key: 'copy',
        code: sw`var original = "draft"
var copy = original
copy += " v2"
print(original)
print(copy)`,
        output: 'draft\ndraft v2',
        why: 'Strings are structs, so `copy` is an independent value. Appending to it does not change `original`. (Swift shares the storage until one copy is modified, so copying is cheap.)',
      },
      {
        key: 'function-param',
        code: sw`func shout(_ text: String) -> String {
    var t = text
    t = t.uppercased()
    return t + "!"
}
let quiet = "hello"
let loud = shout(quiet)
print(quiet, loud)`,
        output: 'hello HELLO!',
        why: 'Parameters are constants holding a copy of the value. The function makes a local `var`, changes it and returns a new string; the caller’s `quiet` is unchanged.',
      },
    ],
  ),
  ...b.fails(
    'swift-string-index-bugs',
    4,
    'An index must be a valid position in the string it is used with.',
    [
      {
        key: 'offset-past-end',
        question: 'This program crashes. What is the bug?',
        code: sw`func initials(_ name: String) -> String {
    let second = name.index(name.startIndex, offsetBy: 1)
    return String(name[name.startIndex]) + String(name[second])
}
print(initials("Al"))
print(initials("J"))`,
        error: 'Fatal error',
        correct:
          'For `"J"`, offset 1 is `endIndex`, which is not a valid subscript, so `name[second]` traps',
        wrong: [
          '`String(name[...])` cannot convert a `Character` to a `String`',
          '`index(_:offsetBy:)` returns `nil` past the end and the force unwrap fails',
          'Strings cannot be subscripted at all, only iterated',
        ],
        why: '`index(_:offsetBy:)` does not return an Optional: moving to `endIndex` is allowed, but subscripting `endIndex` traps. Check `name.count` first, or use the safe variant `index(_:offsetBy:limitedBy:)`, which returns `nil` when the limit would be passed.',
      },
      {
        key: 'too-short',
        question: 'This program crashes. What is the bug?',
        code: sw`let codes = ["AB-1", "C"]
for code in codes {
    let dash = code.index(code.startIndex, offsetBy: 2)
    print(code[dash])
}`,
        error: 'Fatal error',
        correct:
          '`"C"` has only one character, so offsetting by 2 moves past `endIndex`, which traps',
        wrong: [
          'The loop variable `code` is a `Character`, not a `String`',
          '`print` cannot print a `Character`',
          'Offsets are one-based, so offset 2 is the dash for `"AB-1"` but not for `"C"`',
        ],
        why: 'An offset that moves an index beyond `endIndex` is a runtime trap. Use `code.index(code.startIndex, offsetBy: 2, limitedBy: code.endIndex)`, which returns `nil` when the string is too short, and check the result before subscripting.',
      },
    ],
  ),
  ...b.compiles(
    'swift-substring',
    5,
    'Slicing a `String` gives a `Substring`, a different type that shares the original storage.',
    [
      {
        key: 'assign-substring',
        code: sw`let email = "kim@example.com"
let at = email.firstIndex(of: "@")!
let user: String = email[..<at]
print(user)`,
        compiles: false,
        why: 'Slicing a `String` with a range produces a `Substring`, not a `String`, so the annotation `String` is a type mismatch. Write `String(email[..<at])`. Swift keeps them separate so that a long-lived small slice does not silently keep a large original string alive.',
      },
      {
        key: 'convert-substring',
        code: sw`let email = "kim@example.com"
let at = email.firstIndex(of: "@")!
let user = String(email[..<at])
let domain = email[email.index(after: at)...]
print(user, domain)`,
        compiles: true,
        why: '`String(...)` copies the `Substring` into a new `String`. `domain` is left as a `Substring` (inferred), which is fine for short-lived use: it supports the same string operations and prints the same way.',
      },
      {
        key: 'substring-param',
        code: sw`func greet(_ name: String) -> String { "Hi, " + name }
let full = "Ada Lovelace"
let first = full.split(separator: " ")[0]
print(greet(first))`,
        compiles: false,
        why: '`split(separator:)` returns `[Substring]`, so `first` is a `Substring` and cannot be passed where a `String` is expected. Write `greet(String(first))`, or make the function generic over `StringProtocol`.',
      },
    ],
  ),
];
