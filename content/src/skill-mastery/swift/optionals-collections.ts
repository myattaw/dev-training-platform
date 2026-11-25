import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Optionals and collections. Every snippet is compiled and run by the real
 * Swift runner. Dictionaries and sets are always sorted before printing,
 * because their iteration order changes from one run to the next.
 */

const b = programBuilders('swift');
const sw = String.raw;

// ---------------------------------------------------------------- Optionals

export const optionalsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'swift-optional-binding',
    1,
    [
      '`if let` runs its body only when the Optional holds a value, and binds the unwrapped value.',
      'The `else` branch runs when the Optional is `nil`.',
    ],
    [
      {
        key: 'parse',
        code: sw`let inputs = ["12", "abc"]
for input in inputs {
    if let number = Int(input) {
        print("number \(number * 2)")
    } else {
        print("not a number")
    }
}`,
        output: 'number 24\nnot a number',
        why: '`Int("12")` succeeds, so `number` is bound to the plain `Int` `12` and the body prints `24`. `Int("abc")` is `nil`, so the `else` branch runs.',
      },
      {
        key: 'shorthand',
        code: sw`let nickname: String? = "Sam"
let middleName: String? = nil
if let nickname {
    print("Hi \(nickname)")
}
if let middleName {
    print("Middle: \(middleName)")
} else {
    print("No middle name")
}`,
        output: 'Hi Sam\nNo middle name',
        why: '`if let nickname` is the shorthand for `if let nickname = nickname` (Swift 5.7 and later): it shadows the Optional with an unwrapped constant of the same name inside the body.',
      },
      {
        key: 'multiple-conditions',
        code: sw`let width: Int? = 4
let height: Int? = nil
if let width, let height {
    print(width * height)
} else if let width {
    print("only width \(width)")
}`,
        output: 'only width 4',
        why: 'Conditions separated by commas must all succeed. `height` is `nil`, so the first branch is skipped, and the `else if let width` branch runs.',
      },
    ],
  ),
  ...b.whichCompile(
    'swift-optional-types',
    2,
    'An Optional (`T?`) and a non-optional `T` are different types; you must unwrap before using the value as a `T`.',
    [
      {
        key: 'arithmetic',
        question: 'Which of these lines compile after the declaration shown?',
        prelude: sw`let stock: Int? = Int("7")`,
        options: [
          'let next = stock + 1',
          'let next = (stock ?? 0) + 1',
          'let next: Int = stock',
          'let next = stock! + 1',
          'let next: Int? = stock.map { $0 + 1 }',
        ],
        correct: [
          'let next = (stock ?? 0) + 1',
          'let next = stock! + 1',
          'let next: Int? = stock.map { $0 + 1 }',
        ],
        why: '`Int?` has no `+` operator and cannot be assigned to an `Int`. Unwrap it with `??` (safe default), `!` (compiles but traps if `nil`) or transform it with `map`, which keeps the result optional.',
      },
      {
        key: 'nil-and-conditions',
        question: 'Which of these lines compile?',
        options: [
          'let count: Int = nil',
          'let count: Int? = nil',
          'let name: String? = nil; if name { print("set") }',
          'let name: String? = nil; if name != nil { print("set") }',
          'var title: String? = "A"; title = nil',
        ],
        correct: [
          'let count: Int? = nil',
          'let name: String? = nil; if name != nil { print("set") }',
          'var title: String? = "A"; title = nil',
        ],
        why: 'Only Optional types can hold `nil`, so `let count: Int = nil` fails. An Optional is not a `Bool`, so `if name` fails; compare with `!= nil` or use `if let`. Setting an Optional `var` back to `nil` is allowed.',
      },
    ],
  ),
  ...b.blank(
    'swift-guard-let',
    2,
    '`guard` requires its `else` branch to leave the current scope.',
    [
      {
        key: 'early-return',
        prompt:
          'Complete the function so it returns `"guest"` when no name is given, and otherwise the uppercased name.',
        template: sw`func display(_ name: String?) -> String {
    guard let name else {
        {{blank:exit}}
    }
    return name.uppercased()
}
print(display(nil), display("ana"))`,
        blanks: { exit: ['return "guest"'] },
        why: 'The `else` of a `guard` must exit the scope (`return`, `throw`, `break`, `continue` or a call that never returns). After the guard, `name` is unwrapped for the rest of the function, which is what makes `guard` good for early exits.',
      },
      {
        key: 'continue',
        prompt: 'Complete the loop so invalid entries are skipped and the program prints `15`.',
        template: sw`let entries = ["5", "x", "10"]
var total = 0
for entry in entries {
    guard let value = Int(entry) else { {{blank:exit}} }
    total += value
}
print(total)`,
        blanks: { exit: ['continue'] },
        why: 'Inside a loop, `continue` leaves the current iteration, which satisfies `guard`. `break` would also compile but would stop at `"x"` and print `5`, while `continue` moves on to the next entry.',
      },
    ],
  ),
  ...b.output(
    'swift-optional-chaining',
    3,
    [
      'Optional chaining stops at the first `nil` and the whole expression becomes `nil`.',
      'The result of an optional chain is always optional, even if the last property is not.',
    ],
    [
      {
        key: 'nested',
        code: sw`struct Address { var city: String }
struct User { var address: Address? }
let users = [User(address: Address(city: "Oslo")), User(address: nil)]
for user in users {
    let city = user.address?.city
    print(city ?? "unknown", city == nil)
}`,
        output: 'Oslo false\nunknown true',
        why: '`user.address?.city` has type `String?`: it is `"Oslo"` when there is an address and `nil` otherwise. `??` supplies the fallback for printing.',
      },
      {
        key: 'method-count',
        code: sw`let tags: [String]? = ["swift", "ios"]
let none: [String]? = nil
print(tags?.first?.count ?? 0)
print(none?.first?.count ?? 0)
print(tags?.count as Any)`,
        output: '5\n0\nOptional(2)',
        why: '`tags?.first?.count` chains through two optionals and yields `Int?` (`5` for `"swift"`). For `none` the chain stops immediately. Without `??`, `tags?.count` is still an Optional, so it prints `Optional(2)` even though `count` itself is an `Int`.',
      },
      {
        key: 'short-circuit',
        code: sw`final class Logger {
    var lines: [String] = []
    func log(_ s: String) { lines.append(s) }
}
func message(_ n: Int) -> String {
    print("building \(n)")
    return "msg \(n)"
}
var logger: Logger? = nil
logger?.log(message(1))
logger = Logger()
logger?.log(message(2))
print(logger?.lines.count ?? 0)`,
        output: 'building 2\n1',
        why: 'When `logger` is `nil`, optional chaining skips the whole call, including evaluating its arguments, so `message(1)` never runs. After `logger` is set, `message(2)` runs and the line is logged.',
      },
    ],
  ),
  ...b.fails(
    'swift-force-unwrap-crash',
    3,
    '`!` asserts that a value is present; when it is `nil`, the program stops.',
    [
      {
        key: 'parse',
        question: 'This program crashes. What is the best fix?',
        code: sw`let fields = ["3", "4", "five"]
var sum = 0
for f in fields {
    sum += Int(f)!
}
print(sum)`,
        error: 'Fatal error: Unexpectedly found nil while unwrapping an Optional value',
        correct:
          'Handle the failed parse, for example `if let n = Int(f) { sum += n }` or `sum += Int(f) ?? 0`',
        wrong: [
          'Replace `Int(f)!` with `Int(f)?` so the `nil` is skipped',
          'Declare `sum` as `Int?` so it can absorb the `nil`',
          'Use `Int(f)!!` to unwrap twice',
        ],
        why: '`Int("five")` returns `nil`, and force-unwrapping `nil` is a fatal error. Decide what an invalid field means (skip it, default it, or report an error) and write that explicitly with `if let`, `guard let` or `??`. `Int(f)?` alone is not an expression you can add to an `Int`.',
      },
      {
        key: 'dictionary',
        question: 'This program crashes. What is the cause?',
        code: sw`let stock = ["apple": 3, "pear": 0]
let order = ["apple", "plum"]
for item in order {
    let available = stock[item]!
    print(item, available)
}`,
        error: 'Fatal error: Unexpectedly found nil while unwrapping an Optional value',
        correct: '`stock["plum"]` is `nil` because the key is missing, and `!` traps on `nil`',
        wrong: [
          '`stock["pear"]` is `0`, and `!` traps on zero',
          'Dictionary subscripts cannot be used inside a `for` loop',
          'The crash is caused by printing a tuple',
        ],
        why: 'A dictionary subscript returns `nil` for a missing key. `0` is a value, not `nil`, so `"pear"` would be fine. Use `stock[item, default: 0]` or `if let` to handle unknown items.',
      },
      {
        key: 'first-of-empty',
        question: 'This program crashes. What is the cause?',
        code: sw`func cheapest(_ prices: [Int]) -> Int {
    return prices.min()!
}
print(cheapest([4, 2, 9]))
print(cheapest([]))`,
        error: 'Fatal error: Unexpectedly found nil while unwrapping an Optional value',
        correct: '`min()` returns `nil` for an empty array, and the force unwrap traps',
        wrong: [
          '`min()` traps by itself on an empty array, before the `!` is reached',
          '`[]` cannot be passed as `[Int]`',
          '`min()` returns `0` for an empty array, which makes `!` fail',
        ],
        why: '`min()`, `max()`, `first` and `last` return Optionals precisely because the collection may be empty. Return `Int?` from `cheapest`, or supply a default with `??`.',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-nil-coalescing-precedence',
    4,
    '`??` has lower precedence than arithmetic operators.',
    [
      {
        key: 'present',
        code: sw`let bonus: Int? = 5
print(bonus ?? 0 + 10)`,
        correct: '5',
        wrong: ['15', '10', 'Optional(5)'],
        why: '`+` binds tighter than `??`, so the expression is `bonus ?? (0 + 10)`. `bonus` has a value, so the result is `5`. Write `(bonus ?? 0) + 10` to add `10` in both cases.',
      },
      {
        key: 'absent',
        code: sw`let bonus: Int? = nil
print(bonus ?? 0 + 10)`,
        correct: '10',
        wrong: ['0', 'nil', 'Optional(10)'],
        why: 'The expression is `bonus ?? (0 + 10)`. `bonus` is `nil`, so the right-hand side, `10`, is used. The result of `??` with a non-optional right side is a plain `Int`.',
      },
      {
        key: 'chain',
        code: sw`let fromUser: String? = nil
let fromConfig: String? = nil
let fallback = "en"
print(fromUser ?? fromConfig ?? fallback)`,
        correct: 'en',
        wrong: ['nil', 'Optional("en")', 'Optional(nil)'],
        why: '`??` is right-associative, so the chain tries each value in turn and ends with the non-optional `fallback`. The result type is `String`, so no Optional wrapper is printed.',
      },
    ],
  ),
  ...b.output(
    'swift-optional-map',
    4,
    [
      '`map` on an Optional transforms the value if present and keeps `nil` otherwise.',
      '`flatMap` is for transforms that themselves return an Optional.',
    ],
    [
      {
        key: 'map',
        code: sw`let raw: String? = "21"
let doubled = raw.flatMap { Int($0) }.map { $0 * 2 }
let missing: String? = nil
print(doubled ?? -1, missing.map { $0.count } ?? -1)`,
        output: '42 -1',
        why: '`flatMap { Int($0) }` turns `String?` into `Int?` without nesting (a plain `map` would give `Int??`). `.map { $0 * 2 }` doubles the value. For `missing`, `map` does nothing and returns `nil`.',
      },
      {
        key: 'nested',
        code: sw`let raw: String? = "x"
let parsed = raw.map { Int($0) }
print(parsed as Any)
print(parsed == nil)`,
        output: 'Optional(nil)\nfalse',
        why: '`map` wraps the closure’s result, and `Int("x")` is already `Int?`, so `parsed` is `Int??` holding an inner `nil`. The outer Optional is not `nil`, which is why `parsed == nil` is `false`. Use `flatMap` to avoid the double Optional.',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-double-optional',
    5,
    'Some APIs return an Optional of an Optional; unwrapping one level may leave another.',
    [
      {
        key: 'first-of-optionals',
        code: sw`let readings: [Int?] = [nil, 7]
if let first = readings.first {
    print("first is \(String(describing: first))")
} else {
    print("empty")
}`,
        correct: 'first is nil',
        wrong: ['empty', 'first is 7', 'first is Optional(7)'],
        why: '`readings.first` is `Int??`: `nil` would mean the array is empty, while here it is `.some(nil)`. `if let` removes only the outer layer, so `first` is an `Int?` holding `nil`. Use `readings.first ?? nil` or `readings.compactMap { $0 }.first` when you want the first present value.',
      },
      {
        key: 'dictionary-of-optionals',
        code: sw`var settings: [String: String?] = ["theme": nil]
print(settings.count, settings["theme"] == nil, settings["font"] == nil)`,
        correct: '1 false true',
        wrong: ['0 true true', '1 true true', '0 false true'],
        why: 'The value type is `String?`, so the subscript returns `String??`. For `"theme"` the key exists with a `nil` value (`.some(nil)`), which is not equal to `nil`. For `"font"` the key is missing, so the result is `nil`. `count` is `1` because the key is stored.',
      },
      {
        key: 'iuo',
        code: sw`var token: String! = "abc"
let copy = token
let length: Int = token.count
print(copy as Any, length)`,
        correct: 'Optional("abc") 3',
        wrong: ['abc 3', 'Optional("abc") Optional(3)', 'abc Optional(3)'],
        why: 'An implicitly unwrapped optional (`String!`) is an Optional that the compiler force-unwraps only when a non-optional value is required. `let copy = token` infers `String?`, so it prints `Optional("abc")`; `token.count` needs a `String`, so it is unwrapped (and would trap if `token` were `nil`).',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Collections

export const collectionsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'swift-array-basics',
    1,
    [
      '`append` adds at the end, `insert(_:at:)` shifts later elements, `remove(at:)` returns the removed element.',
    ],
    [
      {
        key: 'append-insert',
        code: sw`var queue = ["b", "c"]
queue.append("d")
queue.insert("a", at: 0)
let removed = queue.remove(at: 1)
print(queue, removed)`,
        output: '["a", "c", "d"] b',
        why: 'After `append` and `insert` the array is `["a", "b", "c", "d"]`. `remove(at: 1)` removes and returns `"b"`. Arrays print with their elements’ debug descriptions, so strings appear in quotes.',
      },
      {
        key: 'first-last',
        code: sw`var scores: [Int] = []
print(scores.isEmpty, scores.first == nil)
scores += [70, 95, 88]
print(scores.count, scores.last!, scores.max()!)`,
        output: 'true true\n3 88 95',
        why: 'An empty array has no `first` element, so `first` is `nil` (it is an Optional). `+=` appends all elements of another array. `last` is `88` (the last element), while `max()` is `95`.',
      },
      {
        key: 'slices',
        code: sw`let numbers = [10, 20, 30, 40, 50]
let middle = numbers[1...3]
print(middle, middle.count)
print(numbers.prefix(2), numbers.dropFirst(3))`,
        output: '[20, 30, 40] 3\n[10, 20] [40, 50]',
        why: '`1...3` is a closed range, so the slice has the elements at indices 1, 2 and 3. `prefix(2)` takes the first two, and `dropFirst(3)` skips the first three. Slices print like arrays.',
      },
    ],
  ),
  ...b.compiles(
    'swift-let-collections',
    1,
    'For value types, `let` freezes the whole value, including its elements.',
    [
      {
        key: 'let-dictionary',
        code: sw`let capitals = ["FR": "Paris"]
capitals["DE"] = "Berlin"
print(capitals.count)`,
        compiles: false,
        why: 'Dictionaries are value types. Adding a key mutates the dictionary, which `let` forbids. Declare `var capitals` to modify it.',
      },
      {
        key: 'let-array-element',
        code: sw`let grid = [[0, 0], [0, 0]]
grid[0][1] = 5
print(grid)`,
        compiles: false,
        why: 'Even an element of an element is part of the value: assigning `grid[0][1]` mutates `grid`, which is a constant. Nested arrays are values all the way down.',
      },
      {
        key: 'let-array-of-classes',
        code: sw`final class Counter { var value = 0 }
let counters = [Counter(), Counter()]
counters[0].value += 1
print(counters[0].value)`,
        compiles: true,
        why: 'The array holds references to class instances. `let` makes the array (the references) constant, but the objects they point to are still mutable, so changing `value` compiles. You still could not append or replace an element.',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-dictionary-subscript',
    2,
    'A dictionary lookup returns an Optional; the `default:` subscript supplies a value for missing keys.',
    [
      {
        key: 'word-count',
        code: sw`let words = ["to", "be", "or", "not", "to", "be"]
var counts: [String: Int] = [:]
for w in words {
    counts[w, default: 0] += 1
}
print(counts["to"]!, counts["or"]!, counts["maybe"] ?? 0)`,
        correct: '2 1 0',
        wrong: ['2 1 nil', '1 1 0', 'Optional(2) Optional(1) 0'],
        why: '`counts[w, default: 0] += 1` reads `0` for a new key and stores the incremented value, so `"to"` ends at `2` and `"or"` at `1`. `"maybe"` was never added, so `?? 0` supplies `0`.',
      },
      {
        key: 'assign-nil',
        code: sw`var ages = ["ann": 31, "bob": 25]
ages["bob"] = nil
ages["cat"] = 40
print(ages.keys.sorted())`,
        correct: '["ann", "cat"]',
        wrong: ['["ann", "bob", "cat"]', '["ann", "cat", "bob"]', '["cat", "ann"]'],
        why: 'Assigning `nil` through the subscript removes the key, so `"bob"` is gone. Keys are printed sorted because a dictionary’s own order is not defined (and changes from one run to the next in Swift).',
      },
      {
        key: 'update-value',
        code: sw`var stock = ["pen": 3]
let old = stock.updateValue(5, forKey: "pen")
let none = stock.updateValue(1, forKey: "ink")
print(old ?? -1, none ?? -1, stock["pen"]!)`,
        correct: '3 -1 5',
        wrong: ['5 1 5', '3 1 5', '-1 -1 5'],
        why: '`updateValue(_:forKey:)` stores the new value and returns the old one, or `nil` if the key was not present. So it returns `3` for `"pen"` and `nil` for `"ink"`.',
      },
    ],
  ),
  ...b.output(
    'swift-collection-value-semantics',
    2,
    [
      'Arrays, dictionaries and sets are value types: assignment and passing copy the value.',
      'Copying an array of class instances copies the references, not the objects.',
    ],
    [
      {
        key: 'array-copy',
        code: sw`var original = [1, 2, 3]
var copy = original
copy.append(4)
original[0] = 99
print(original)
print(copy)`,
        output: '[99, 2, 3]\n[1, 2, 3, 4]',
        why: 'Assigning an array gives an independent value (storage is shared only until one side mutates, called copy-on-write). Changes to either array do not affect the other.',
      },
      {
        key: 'dictionary-in-struct',
        code: sw`struct Cart { var items: [String: Int] = [:] }
var a = Cart()
a.items["tea"] = 1
var b = a
b.items["tea"] = 5
print(a.items["tea"]!, b.items["tea"]!)`,
        output: '1 5',
        why: 'Copying a struct copies its dictionary too: `b` gets its own `items`. This is different from languages where collections are always shared references.',
      },
      {
        key: 'array-of-classes',
        code: sw`final class Box { var value: Int; init(_ v: Int) { value = v } }
let first = [Box(1), Box(2)]
var second = first
second[0].value = 10
second.append(Box(3))
print(first[0].value, first.count, second.count)`,
        output: '10 2 3',
        why: 'The array is copied, but its elements are references to the same `Box` objects, so changing `second[0].value` is visible through `first[0]`. Appending changes only `second`’s own array, so the counts differ.',
      },
    ],
  ),
  ...b.output(
    'swift-set-operations',
    3,
    [
      'Sets keep unique elements and support union, intersection and subtraction.',
      'Sort a set before printing it: its order is not defined.',
    ],
    [
      {
        key: 'algebra',
        code: sw`let backend: Set = ["swift", "go", "java"]
let mobile: Set = ["swift", "kotlin"]
print(backend.union(mobile).sorted())
print(backend.intersection(mobile).sorted())
print(backend.subtracting(mobile).sorted())`,
        output: '["go", "java", "kotlin", "swift"]\n["swift"]\n["go", "java"]',
        why: '`union` contains every element once, `intersection` only the shared ones, and `subtracting` the elements of `backend` that are not in `mobile`. Each result is sorted so the output is stable.',
      },
      {
        key: 'insert-result',
        code: sw`var seen: Set<Int> = []
let ids = [3, 1, 3, 2, 1]
var duplicates: [Int] = []
for id in ids {
    if !seen.insert(id).inserted {
        duplicates.append(id)
    }
}
print(seen.count, duplicates)`,
        output: '3 [3, 1]',
        why: '`insert` returns a tuple whose `inserted` flag is `false` when the element was already present. The second `3` and the second `1` are duplicates, recorded in order of appearance.',
      },
      {
        key: 'dedupe-order',
        code: sw`let tags = ["b", "a", "b", "c", "a"]
let unique = Array(Set(tags)).sorted()
var ordered: [String] = []
for t in tags where !ordered.contains(t) {
    ordered.append(t)
}
print(unique, ordered)`,
        output: '["a", "b", "c"] ["b", "a", "c"]',
        why: 'Converting to a `Set` removes duplicates but loses the original order, so it must be sorted to print reliably. Keeping first occurrences in order needs an explicit loop (or a seen-set).',
      },
    ],
  ),
  ...b.fails(
    'swift-collection-crash',
    3,
    'Arrays check every index at run time.',
    [
      {
        key: 'closed-range',
        question: 'This program crashes. What is the bug?',
        code: sw`let temps = [18, 21, 19]
var total = 0
for i in 0...temps.count {
    total += temps[i]
}
print(total)`,
        error: 'Fatal error: Index out of range',
        correct: '`0...temps.count` includes `3`, one past the last index; use `0..<temps.count` or iterate `temps` directly',
        wrong: [
          'Arrays are one-based in Swift, so `temps[0]` is out of range',
          '`total` overflows after three additions',
          '`temps.count` is an Optional and must be unwrapped',
        ],
        why: 'Valid indices are `0..<count`. The closed range `...` adds `count` itself, and reading `temps[3]` traps. Prefer `for t in temps` or `temps.indices` so the bounds are always right.',
      },
      {
        key: 'remove-first',
        question: 'This program crashes. What is the cause?',
        code: sw`var jobs = ["build", "test"]
for _ in 0..<3 {
    let job = jobs.removeFirst()
    print("running \(job)")
}`,
        error: "Fatal error: Can't remove first element from an empty collection",
        correct: 'The third iteration calls `removeFirst()` on an empty array, which traps',
        wrong: [
          '`removeFirst()` returns an Optional that must be unwrapped',
          'You cannot modify an array inside a `for` loop',
          '`jobs` is a constant because it is used in a loop',
        ],
        why: '`removeFirst()` requires a non-empty collection. Use `popFirst()` on a slice or check `isEmpty`, or loop with `while let job = jobs.first` style code. (`popLast()` returns an Optional for arrays.)',
      },
      {
        key: 'stale-index',
        question: 'This program crashes. What is the bug?',
        code: sw`var values = [5, -1, 7, -2]
for i in values.indices {
    if values[i] < 0 {
        values.remove(at: i)
    }
}
print(values)`,
        error: 'Fatal error: Index out of range',
        correct:
          '`values.indices` was computed before the loop, so after removals the later indices no longer exist; use `values.removeAll { $0 < 0 }`',
        wrong: [
          'Removing elements from an array is never allowed while it is a `var`',
          '`values.indices` is recomputed every iteration and skips elements',
          '`remove(at:)` returns `nil` for negative values',
        ],
        why: 'The range `0..<4` is fixed when the loop starts. After removing one element the array has 3 elements, and index 3 is out of range. `removeAll(where:)` (or `filter`) removes matching elements safely.',
      },
    ],
  ),
  ...b.multi(
    'swift-dictionary-order',
    4,
    'Think about which collections promise an order.',
    [
      {
        key: 'statements',
        question: 'Select every true statement about this program and Swift dictionaries.',
        code: sw`let stock = ["pear": 4, "apple": 7, "fig": 1]
for (name, count) in stock.sorted(by: { $0.key < $1.key }) {
    print(name, count)
}
print(stock.values.reduce(0, +))`,
        correct: [
          'Without `sorted`, the loop could print the entries in a different order on another run',
          'The sum printed on the last line does not depend on iteration order',
          '`sorted(by:)` on a dictionary returns an array of `(key, value)` tuples',
        ],
        wrong: [
          'Swift dictionaries keep keys in insertion order, so `sorted` is only for readability',
          'Swift dictionaries keep keys in alphabetical order automatically',
          'Iterating a dictionary directly is a compile error; it must be sorted first',
        ],
        why: '`Dictionary` makes no ordering promise, and Swift randomizes hashing per process, so the order can differ between runs. Sorting gives a stable order and produces an array of `(key: String, value: Int)` tuples. Order-independent operations such as summing are safe without sorting.',
      },
      {
        key: 'grouping',
        question: 'Select every true statement about this program.',
        code: sw`let names = ["ann", "bob", "amy", "ben", "cy"]
let byInitial = Dictionary(grouping: names, by: { $0.first! })
for key in byInitial.keys.sorted() {
    print(key, byInitial[key]!)
}`,
        correct: [
          'It prints `a ["ann", "amy"]` first, because keys are sorted',
          'Within each group, names keep the order they had in `names`',
          '`byInitial` has type `[Character: [String]]`',
        ],
        wrong: [
          'It prints the groups in the order the initials first appear in `names`, without needing `sorted`',
          '`byInitial[key]!` can crash because `key` may not be in the dictionary',
          '`Dictionary(grouping:by:)` sorts the names inside each group',
        ],
        why: '`Dictionary(grouping:by:)` keeps each group in the original sequence order, and the key type is whatever the closure returns, here `Character`. The keys come from the dictionary itself, so the force unwrap is safe. Only sorting the keys makes the group order stable.',
      },
    ],
  ),
  ...b.fails(
    'swift-duplicate-keys',
    5,
    'Some dictionary initializers require every key to be unique.',
    [
      {
        key: 'unique-keys',
        question: 'This program crashes. Which change fixes it while keeping the last price for each SKU?',
        code: sw`let rows = [("A1", 10), ("B2", 5), ("A1", 12)]
let prices = Dictionary(uniqueKeysWithValues: rows)
print(prices["A1"]!)`,
        error: 'Fatal error: Duplicate values for key',
        correct: 'Use `Dictionary(rows, uniquingKeysWith: { _, new in new })`',
        wrong: [
          'Use `Dictionary(grouping: rows, by: { $0.0 })` and read `prices["A1"]!` as before',
          'Declare `rows` with `var` so the initializer can overwrite duplicates',
          'Wrap the initializer in `try?` to ignore the duplicate',
        ],
        why: '`uniqueKeysWithValues:` traps on a duplicate key (it is a precondition, not a thrown error, so `try?` does not apply). `Dictionary(_:uniquingKeysWith:)` lets you resolve conflicts; returning the new value keeps `12`. Grouping produces arrays of rows, not prices.',
      },
      {
        key: 'zip',
        question: 'This program crashes. What is the cause?',
        code: sw`let emails = ["a@x.io", "b@x.io", "a@x.io"]
let ids = [1, 2, 3]
let idByEmail = Dictionary(uniqueKeysWithValues: zip(emails, ids))
print(idByEmail.count)`,
        error: 'Fatal error: Duplicate values for key',
        correct: '`"a@x.io"` appears twice, and `uniqueKeysWithValues:` requires unique keys',
        wrong: [
          '`zip` cannot be used with arrays of different element types',
          '`zip` stops at the shorter sequence, leaving a key without a value',
          'Dictionary keys must be `Int`, not `String`',
        ],
        why: '`zip` pairs the arrays element by element, producing a duplicate email. The initializer traps rather than choosing one value. Deduplicate first or use `uniquingKeysWith:` with an explicit rule.',
      },
    ],
  ),
];
