import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Advanced (difficulty 4 and 5) families for skills whose base files are
 * mostly introductory: strings, collections, control flow, functions and
 * generics. Every snippet is compiled (Swift 6 language mode) and run by the
 * real Swift runner.
 */

const b = programBuilders('swift');
const sw = String.raw;

// ---------------------------------------------------------------- Strings

export const stringsAdvancedFamilies: readonly QuestionSource[] = [
  ...b.outputChoice(
    'swift-string-ordering-splitting',
    4,
    'String comparison is by Unicode order, not dictionary order, and `split` has options for empty pieces.',
    [
      {
        key: 'case-order',
        code: sw`let names = ["banana", "Apple", "cherry"]
print("apple" < "Banana", names.sorted())`,
        correct: 'false ["Apple", "banana", "cherry"]',
        wrong: [
          'true ["Apple", "banana", "cherry"]',
          'true ["apple", "banana", "cherry"]',
          'false ["banana", "Apple", "cherry"]',
        ],
        why: 'String `<` compares Unicode scalar values, and every uppercase ASCII letter comes before every lowercase one, so `"Banana"` sorts before `"apple"`. That is why `"Apple"` comes first. For a case-insensitive order, sort with `{ $0.lowercased() < $1.lowercased() }`.',
      },
      {
        key: 'split-empty',
        code: sw`let csv = "a,,b,"
let parts = csv.split(separator: ",")
let all = csv.split(separator: ",", omittingEmptySubsequences: false)
print(parts.count, all.count)`,
        correct: '2 4',
        wrong: ['4 4', '3 4', '2 3'],
        why: '`split` drops empty pieces by default, leaving only `"a"` and `"b"`. With `omittingEmptySubsequences: false` you get `"a"`, `""`, `"b"` and `""` (after the trailing comma). For CSV-like data, the default silently shifts columns.',
      },
      {
        key: 'reversed',
        code: sw`let word = "stressed"
let backwards = String(word.reversed())
let lazy = word.reversed()
print(backwards, backwards == "desserts", lazy.first!)`,
        correct: 'desserts true d',
        wrong: ['desserts false d', 'stressed true s', 'desserts true s'],
        why: '`reversed()` returns a lazy `ReversedCollection<String>` view, not a `String`; wrap it in `String(...)` to get a string you can compare. Its `first` is the original string’s last character, `d`.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Collections

export const collectionsAdvancedFamilies: readonly QuestionSource[] = [
  ...b.outputChoice(
    'swift-slice-indices',
    4,
    'An `ArraySlice` keeps the indices of the array it came from.',
    [
      {
        key: 'start-index',
        code: sw`let scores = [10, 20, 30, 40, 50]
let top = scores[2...]
print(top.startIndex, top[2], top.first!, top.count)`,
        correct: '2 30 30 3',
        wrong: ['0 30 30 3', '0 10 30 3', '2 30 30 5'],
        why: 'A slice shares its base array’s indices, so `top` starts at index 2 and `top[2]` is `30`. Use `first`, `startIndex` or `Array(top)` rather than assuming slices start at 0.',
      },
      {
        key: 'first-index',
        code: sw`let readings = [5, 8, -1, 7, -3, 9]
let afterFirstError = readings[(readings.firstIndex(of: -1)! + 1)...]
let next = afterFirstError.firstIndex { $0 < 0 }!
print(next, afterFirstError.distance(from: afterFirstError.startIndex, to: next))`,
        correct: '4 1',
        wrong: ['1 1', '4 4', '1 4'],
        why: '`firstIndex` on a slice returns an index of the original array (`4`), not a position within the slice. The position inside the slice is the distance from its `startIndex` (3), which is `1`.',
      },
    ],
  ),
  ...b.fails('swift-slice-index-crash', 5, 'Slices do not re-number their elements from zero.', [
    {
      key: 'drop-first',
      question: 'This program crashes. What is the bug?',
      code: sw`let lines = ["header", "ann,31", "bob,25"]
let rows = lines.dropFirst()
print(rows.count)
print(rows[0])`,
      error: 'Fatal error',
      correct:
        '`rows` is an `ArraySlice` whose indices start at 1, so index 0 is out of bounds; use `rows.first` or `Array(lines.dropFirst())`',
      wrong: [
        '`dropFirst()` returns an Optional that must be unwrapped first',
        '`dropFirst()` mutates `lines`, which is a `let` constant',
        'Slices cannot be subscripted at all, only iterated',
      ],
      why: '`dropFirst()` on an array returns an `ArraySlice` sharing the original indices `1..<3`. Subscripting with `0` traps. Converting to `Array` re-indexes from zero, or you can use `first`, `indices` or iteration.',
    },
    {
      key: 'page-loop',
      question: 'This program crashes. What is the bug?',
      code: sw`let items = Array(1...10)
let page = items[3..<6]
var shown: [Int] = []
for i in 0..<page.count {
    shown.append(page[i])
}
print(shown)`,
      error: 'Fatal error',
      correct:
        '`page` has indices `3..<6`, so `page[0]` is out of bounds; loop over `page.indices` or the elements themselves',
      wrong: [
        '`3..<6` is empty because ranges in subscripts are inclusive',
        '`page.count` is `6`, one past the end',
        '`shown.append` cannot be used inside a `for` loop over a range',
      ],
      why: 'The slice keeps indices 3, 4 and 5 from `items`. A loop over `0..<page.count` assumes zero-based indices and traps on the first access. `for value in page` or `for i in page.indices` is always correct.',
    },
  ]),
];

// ---------------------------------------------------------------- Control flow

export const controlFlowAdvancedFamilies: readonly QuestionSource[] = [
  ...b.outputChoice(
    'swift-advanced-patterns',
    4,
    'Type-casting patterns (`is`, `as`) and optional patterns (`x?`, `nil`) can be combined with `where` in a `switch`.',
    [
      {
        key: 'type-casting',
        code: sw`let values: [Any] = [42, "hi", 3.5, [1, 2], 7]
var out: [String] = []
for v in values {
    switch v {
    case let n as Int where n > 40: out.append("big int")
    case is Int: out.append("int")
    case let s as String: out.append("string \(s.count)")
    case let d as Double: out.append("double \(d)")
    case let a as [Int]: out.append("array \(a.count)")
    default: out.append("other")
    }
}
print(out.joined(separator: ", "))`,
        correct: 'big int, string 2, double 3.5, array 2, int',
        wrong: [
          'int, string 2, double 3.5, array 2, int',
          'big int, string 2, double 3.5, other, int',
          'big int, string 2, int, array 2, int',
        ],
        why: '`case let n as Int where n > 40` casts and filters, so `42` is a big int while `7` falls to `case is Int`. A `3.5` stored as `Any` is a `Double`, never converted to `Int`. Casting patterns also work for collection types such as `[Int]`.',
      },
      {
        key: 'optional-tuple',
        code: sw`let entries: [(String, Int?)] = [("a", 1), ("b", nil), ("c", 30)]
var out: [String] = []
for entry in entries {
    switch entry {
    case (let key, nil): out.append("\(key): missing")
    case (let key, let value?) where value > 10: out.append("\(key): high \(value)")
    case (let key, .some(let value)): out.append("\(key): \(value)")
    }
}
print(out.joined(separator: "; "))`,
        correct: 'a: 1; b: missing; c: high 30',
        wrong: [
          'a: Optional(1); b: missing; c: high Optional(30)',
          'a: 1; b: nil; c: high 30',
          'a: 1; b: missing; c: 30',
        ],
        why: '`nil` matches the missing value, `value?` binds an unwrapped `Int` (with a `where` filter), and `.some(let value)` is the long form of the same optional pattern. Together the three cases are exhaustive, so no `default` is needed.',
      },
      {
        key: 'while-let',
        code: sw`var stack = [1, 2, 3, 4]
var popped: [Int] = []
while let top = stack.popLast(), top > 1 {
    popped.append(top)
}
print(popped, stack)`,
        correct: '[4, 3, 2] []',
        wrong: ['[4, 3, 2] [1]', '[4, 3, 2, 1] []', '[4] [1, 2, 3]'],
        why: 'Each iteration pops first, then checks `top > 1`. When `1` is popped the condition fails and the loop ends, but the element has already been removed, so `stack` is empty. Conditions in a `while let` list run in order every time.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Functions

export const functionsAdvancedFamilies: readonly QuestionSource[] = [
  ...b.output(
    'swift-autoclosure',
    4,
    [
      'An `@autoclosure` parameter wraps the argument expression in a closure, so it is evaluated only if and when the function calls it.',
    ],
    [
      {
        key: 'logging',
        code: sw`func expensive(_ n: Int) -> Int {
    print("computing \(n)")
    return n * 2
}
func debugLog(_ enabled: Bool, _ value: @autoclosure () -> Int) {
    if enabled { print("value \(value())") }
}
debugLog(false, expensive(1))
debugLog(true, expensive(2))`,
        output: 'computing 2\nvalue 4',
        why: 'With `@autoclosure`, `expensive(1)` is not evaluated at the call site: it is wrapped and never called because logging is disabled. This is how `assert` and `??` avoid evaluating their messages and defaults unnecessarily.',
      },
      {
        key: 'short-circuit',
        code: sw`func check(_ name: String, _ result: Bool) -> Bool {
    print("check \(name)")
    return result
}
func both(_ a: Bool, _ b: @autoclosure () -> Bool) -> Bool {
    a ? b() : false
}
func eager(_ a: Bool, _ b: Bool) -> Bool { a && b }
print(both(check("x", false), check("y", true)))
print(eager(check("p", false), check("q", true)))`,
        output: 'check x\nfalse\ncheck p\ncheck q\nfalse',
        why: '`both` short-circuits like `&&` because its second argument is an autoclosure: `check("y", ...)` never runs. `eager` takes a plain `Bool`, so both arguments are evaluated before the call, even though `&&` inside the function would short-circuit.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Generics

export const genericsAdvancedFamilies: readonly QuestionSource[] = [
  ...b.output(
    'swift-conditional-conformance',
    4,
    [
      'An extension with a `where` clause can make a generic type conform to a protocol only when its type parameters do.',
    ],
    [
      {
        key: 'describable',
        code: sw`protocol Describable { func describe() -> String }
extension Int: Describable {
    func describe() -> String { "#\(self)" }
}
extension Array: Describable where Element: Describable {
    func describe() -> String { "[" + map { $0.describe() }.joined(separator: " ") + "]" }
}
extension Optional: Describable where Wrapped: Describable {
    func describe() -> String {
        switch self {
        case .some(let value): return value.describe()
        case .none: return "none"
        }
    }
}
let nested: [[Int]] = [[1, 2], [3]]
let maybe: Int? = nil
print(nested.describe(), maybe.describe())`,
        output: '[[#1 #2] [#3]] none',
        why: '`[Int]` conforms because `Int` does, and therefore `[[Int]]` conforms too: conditional conformances compose. `Int?` conforms through the `Optional` extension. A `[String]` would not have `describe()` at all.',
      },
      {
        key: 'pair',
        code: sw`struct Pair<T> {
    let a: T
    let b: T
}
extension Pair: Equatable where T: Equatable {}
extension Pair where T: Numeric {
    var sum: T { a + b }
}
print(Pair(a: 1, b: 2) == Pair(a: 1, b: 2), Pair(a: 1.5, b: 2).sum, Pair(a: "x", b: "y").a)`,
        output: 'true 3.5 x',
        why: '`==` is synthesized for `Pair` only where `T` is `Equatable`, and `sum` exists only where `T` is `Numeric`. `Pair(a: 1.5, b: 2)` infers `T` as `Double`, so the sum is `3.5`. `Pair<String>` has neither `sum` nor anything numeric, but still works as a plain generic struct.',
      },
    ],
  ),
  ...b.compiles(
    'swift-primary-associated-types',
    5,
    'Protocols such as `Collection` have a primary associated type, so `some Collection<Int>` constrains the element type.',
    [
      {
        key: 'unconstrained-element',
        code: sw`func total(_ values: some Collection) -> Int {
    values.reduce(0, +)
}
print(total([1, 2, 3]))`,
        compiles: false,
        why: '`some Collection` says nothing about the element type, so `reduce(0, +)` cannot know that the elements are `Int`s. Write `some Collection<Int>` (using the primary associated type) or a generic with `where C.Element == Int`.',
      },
      {
        key: 'constrained-element',
        code: sw`func total(_ values: some Collection<Int>) -> Int {
    values.reduce(0, +)
}
let source: any Sequence<Int> = [4, 5]
print(total([1, 2, 3]), total(Set([10])), total(1...4), Array(source).count)`,
        compiles: true,
        why: '`some Collection<Int>` accepts any concrete collection of `Int` (an array, a set, a range), and `any Sequence<Int>` is an existential that still knows its element type. Both rely on primary associated types declared by the standard library protocols.',
      },
    ],
  ),
];
