import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Control flow, functions and closures. Every snippet is compiled and run by
 * the real Swift runner.
 */

const b = programBuilders('swift');
const sw = String.raw;

// ---------------------------------------------------------------- Control flow

export const controlFlowFamilies: readonly QuestionSource[] = [
  ...b.output(
    'swift-switch-basics',
    1,
    [
      'A Swift `switch` runs only the first matching case; there is no implicit fallthrough, so no `break` is needed.',
      'One case can list several values separated by commas, or match a range.',
    ],
    [
      {
        key: 'multiple-values',
        code: sw`for day in ["sat", "mon", "sun"] {
    switch day {
    case "sat", "sun":
        print("weekend")
    default:
        print("weekday")
    }
}`,
        output: 'weekend\nweekday\nweekend',
        why: '`case "sat", "sun"` matches either value. After a case body runs, the `switch` ends: unlike C or Java, execution never falls into the next case.',
      },
      {
        key: 'ranges',
        code: sw`func grade(_ score: Int) -> String {
    switch score {
    case 90...100: return "A"
    case 80..<90: return "B"
    case 0..<80: return "C"
    default: return "invalid"
    }
}
print(grade(90), grade(89), grade(120))`,
        output: 'A B invalid',
        why: '`90...100` includes both ends, so `90` is an `A`. `80..<90` excludes `90`, so `89` is a `B`. `120` matches no range and falls to `default`, which an `Int` switch needs to be exhaustive.',
      },
      {
        key: 'no-fallthrough',
        code: sw`let code = 1
switch code {
case 1:
    print("one")
case 2:
    print("two")
default:
    print("other")
}
print("done")`,
        output: 'one\ndone',
        why: 'Only the matching case runs, then control continues after the `switch`. Swift needs no `break` at the end of each case; use the explicit `fallthrough` keyword if you really want C-style behavior.',
      },
    ],
  ),
  ...b.compiles(
    'swift-switch-exhaustive',
    2,
    'Every `switch` must be exhaustive, and every case needs at least one statement.',
    [
      {
        key: 'int-no-default',
        code: sw`let count = 3
switch count {
case 0: print("none")
case 1: print("one")
case 2...: print("many")
}`,
        compiles: false,
        why: 'The cases do not cover negative numbers, so the `switch` is not exhaustive ("switch must be exhaustive"). Add a `default` (or a `case ..<0`) to cover them.',
      },
      {
        key: 'bool-complete',
        code: sw`let isAdmin = false
switch isAdmin {
case true: print("admin")
case false: print("user")
}`,
        compiles: true,
        why: '`true` and `false` cover every `Bool` value, so no `default` is needed. The compiler checks exhaustiveness for `Bool`, enums and tuples of them.',
      },
      {
        key: 'empty-case',
        code: sw`let level = 2
switch level {
case 1:
case 2:
    print("two")
default:
    print("other")
}`,
        compiles: false,
        why: 'A case body cannot be empty: Swift does not let `case 1:` fall into `case 2:`. Combine them as `case 1, 2:` or write `break` in a case that should do nothing.',
      },
      {
        key: 'break-case',
        code: sw`let level = 1
switch level {
case 1:
    break
default:
    print("other")
}
print("end")`,
        compiles: true,
        why: '`break` is a valid statement for a case that intentionally does nothing; it ends the `switch`.',
      },
    ],
  ),
  ...b.codeChoice(
    'swift-case-order-bug',
    2,
    'Cases are tested from top to bottom, and the first match wins.',
    [
      {
        key: 'grades',
        question:
          'This function should return `"excellent"` for scores of 90 or more, but `label(95)` returns `"pass"`. What is the fix?',
        code: sw`func label(_ score: Int) -> String {
    switch score {
    case 50...100: return "pass"
    case 90...100: return "excellent"
    default: return "fail"
    }
}
print(label(95))`,
        correct: 'Move the `90...100` case above the `50...100` case',
        wrong: [
          'Add `fallthrough` at the end of the `50...100` case',
          'Change `90...100` to `90..<100`',
          'Add `break` after `return "pass"`',
        ],
        why: '`95` matches `50...100` first, so the second case is never reached for it. Put the more specific case first. `fallthrough` would run the next body unconditionally, and `break` after `return` is unreachable.',
      },
      {
        key: 'where-order',
        question:
          'This code should print `"even"` for `4`, but it prints `"small"`. What is the fix?',
        code: sw`let n = 4
switch n {
case let x where x < 10:
    print("small")
case let x where x % 2 == 0:
    print("even")
default:
    print("other")
}`,
        correct: 'Put the `x % 2 == 0` case before the `x < 10` case',
        wrong: [
          'Replace `let x` with `var x` in both cases',
          'Add `fallthrough` to the first case so both run',
          'Use `if` conditions inside one `case let x` instead of `where`',
        ],
        why: '`where` clauses are checked in order like everything else in a `switch`: `4` satisfies `x < 10` first. Reorder the cases (or combine the conditions) to get the intended priority.',
      },
    ],
  ),
  ...b.output(
    'swift-ranges-stride',
    2,
    [
      '`a...b` includes `b`; `a..<b` stops before `b`.',
      '`stride(from:to:by:)` excludes the end; `stride(from:through:by:)` includes it when it is reached.',
    ],
    [
      {
        key: 'stride',
        code: sw`var evens: [Int] = []
for i in stride(from: 0, to: 10, by: 4) { evens.append(i) }
var down: [Int] = []
for i in stride(from: 9, through: 0, by: -3) { down.append(i) }
print(evens, down)`,
        output: '[0, 4, 8] [9, 6, 3, 0]',
        why: '`to:` stops before `10`, so the values are 0, 4 and 8. `through:` includes the end value `0` because the sequence reaches it exactly. A negative step counts down.',
      },
      {
        key: 'half-open',
        code: sw`let letters = ["a", "b", "c", "d"]
print(letters[1..<3], letters[2...])
print((1...4).reduce(0, +), (1..<4).count)`,
        output: '["b", "c"] ["c", "d"]\n10 3',
        why: '`1..<3` gives indices 1 and 2. The one-sided range `2...` runs to the end of the array. `1...4` sums to `10`, and `1..<4` has three values.',
      },
      {
        key: 'reversed',
        code: sw`var out = ""
for i in (1...3).reversed() {
    out += "\(i)"
}
for _ in 0..<0 {
    out += "x"
}
print(out)`,
        output: '321',
        why: '`reversed()` iterates a range backwards. `0..<0` is an empty range, so its loop body never runs. (Writing `3...1` instead would crash, because a closed range needs a lower bound not greater than its upper bound.)',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-switch-tuples',
    3,
    'Tuple patterns match each element; `_` matches anything and `let` binds a value.',
    [
      {
        key: 'quadrant',
        code: sw`func describe(_ p: (Int, Int)) -> String {
    switch p {
    case (0, 0): return "origin"
    case (_, 0): return "x-axis"
    case (0, let y): return "y-axis at \(y)"
    case let (x, y) where x == y: return "diagonal"
    default: return "elsewhere"
    }
}
print(describe((0, 5)), describe((3, 3)), describe((2, 0)))`,
        correct: 'y-axis at 5 diagonal x-axis',
        wrong: [
          'origin diagonal x-axis',
          'y-axis at 5 elsewhere x-axis',
          'y-axis at 5 diagonal elsewhere',
        ],
        why: '`(0, 5)` skips the first two cases and binds `y = 5` in the third. `(3, 3)` matches the `where x == y` case. `(2, 0)` matches `(_, 0)`, because `_` accepts any first element.',
      },
      {
        key: 'http',
        code: sw`func handle(_ status: Int, _ cached: Bool) -> String {
    switch (status, cached) {
    case (200, true): return "hit"
    case (200..<300, _): return "ok"
    case (400..<500, _): return "client"
    default: return "server"
    }
}
print(handle(200, false), handle(204, true), handle(503, true))`,
        correct: 'ok ok server',
        wrong: ['hit ok server', 'ok hit server', 'ok ok client'],
        why: '`(200, false)` does not match `(200, true)`, but matches the range case. `(204, true)` is not `200`, so it is `ok`. Ranges inside tuple patterns are matched with the `~=` operator.',
      },
    ],
  ),
  ...b.output(
    'swift-loop-control',
    3,
    [
      '`continue` skips to the next iteration, `break` leaves the loop.',
      'A label lets `break` or `continue` target an outer loop.',
    ],
    [
      {
        key: 'labeled',
        code: sw`let grid = [[1, 2, 3], [4, -1, 6], [7, 8, 9]]
var visited: [Int] = []
rows: for row in grid {
    for value in row {
        if value < 0 { continue rows }
        if value > 7 { break rows }
        visited.append(value)
    }
}
print(visited)`,
        output: '[1, 2, 3, 4, 7]',
        why: 'At `-1`, `continue rows` skips the rest of the second row (`6` is never visited). In the third row, `8` triggers `break rows`, which exits both loops.',
      },
      {
        key: 'for-where',
        code: sw`var total = 0
for n in 1...10 where n.isMultiple(of: 3) {
    total += n
}
var countdown = 3
while countdown > 0 { countdown -= 1 }
repeat { countdown -= 1 } while countdown > 0
print(total, countdown)`,
        output: '18 -1',
        why: '`where` filters the loop to 3, 6 and 9 (sum `18`). The `while` loop stops at `0`. `repeat`-`while` always runs its body at least once, so `countdown` becomes `-1` before the condition is checked.',
      },
    ],
  ),
  ...b.output(
    'swift-pattern-matching',
    4,
    [
      '`if case` and `for case` use the same patterns as `switch`.',
      '`x?` in a pattern matches a non-nil Optional and binds the value.',
    ],
    [
      {
        key: 'for-case',
        code: sw`let answers: [Int?] = [3, nil, 5, nil]
var sum = 0
for case let value? in answers {
    sum += value
}
print(sum)
if case 1...5 = sum {
    print("small")
} else {
    print("large")
}`,
        output: '8\nlarge',
        why: '`for case let value?` iterates only the non-nil elements, binding the unwrapped value. `if case 1...5 = sum` checks the range with pattern matching; `8` is outside it.',
      },
      {
        key: 'tilde',
        code: sw`let age = 17
let teen = 13...19 ~= age
let adult = (18...).contains(age)
switch age {
case ..<13: print("child", teen, adult)
case 13..<18: print("teen", teen, adult)
default: print("adult", teen, adult)
}`,
        output: 'teen true false',
        why: '`~=` is the pattern-match operator that `switch` uses for ranges, so `13...19 ~= 17` is `true`. The one-sided ranges `..<13` and `18...` also work as patterns and values.',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-fallthrough',
    5,
    '`fallthrough` transfers control into the next case body without checking that case’s pattern.',
    [
      {
        key: 'unchecked',
        code: sw`var log: [String] = []
let n = 5
switch n {
case 5:
    log.append("five")
    fallthrough
case 100:
    log.append("hundred")
default:
    log.append("default")
}
print(log)`,
        correct: '["five", "hundred"]',
        wrong: ['["five"]', '["five", "default"]', '["five", "hundred", "default"]'],
        why: '`fallthrough` runs the body of the next case (`case 100`) even though `5` does not match `100`, and stops there; it does not continue into `default`. This is why `fallthrough` is rarely what you want for value checks.',
      },
      {
        key: 'chain',
        code: sw`var perms: [String] = []
let role = "admin"
switch role {
case "admin":
    perms.append("delete")
    fallthrough
case "editor":
    perms.append("edit")
    fallthrough
case "viewer":
    perms.append("view")
default:
    perms.append("none")
}
print(perms)`,
        correct: '["delete", "edit", "view"]',
        wrong: ['["delete"]', '["delete", "edit"]', '["delete", "edit", "view", "none"]'],
        why: 'Each `fallthrough` moves into the next case body, so an admin collects all three permissions. The `viewer` case has no `fallthrough`, so `default` is not run.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Functions

export const functionsFamilies: readonly QuestionSource[] = [
  ...b.whichCompile(
    'swift-argument-labels',
    1,
    'The argument label (or the parameter name if there is no separate label) must be written at the call site; `_` removes it.',
    [
      {
        key: 'labels',
        question: 'Which calls compile against the function shown?',
        prelude: sw`func send(_ message: String, to recipient: String) -> String {
    return message + " -> " + recipient
}`,
        options: [
          'print(send("hi", to: "ana"))',
          'print(send(message: "hi", to: "ana"))',
          'print(send("hi", recipient: "ana"))',
          'print(send("hi", "ana"))',
          'let r = send("hi", to: "bo"); print(r)',
        ],
        correct: ['print(send("hi", to: "ana"))', 'let r = send("hi", to: "bo"); print(r)'],
        why: 'The first parameter has `_` as its label, so it is passed without one. The second has the external label `to` and the internal name `recipient`, so callers must write `to:`. The internal name is only used inside the body.',
      },
      {
        key: 'default-label',
        question: 'Which calls compile against the function shown?',
        prelude: sw`func area(width: Double, height: Double) -> Double {
    return width * height
}`,
        options: [
          'print(area(width: 2, height: 3))',
          'print(area(2, 3))',
          'print(area(height: 3, width: 2))',
          'print(area(width: 2.5, height: 4))',
        ],
        correct: ['print(area(width: 2, height: 3))', 'print(area(width: 2.5, height: 4))'],
        why: 'Without an explicit label, the parameter name is the label, and it is required. Labeled arguments must also stay in declaration order; Swift does not reorder them.',
      },
    ],
  ),
  ...b.codeChoice(
    'swift-parameters-are-constants',
    2,
    'Parameters are constants holding a copy of value-type arguments.',
    [
      {
        key: 'array-param',
        question:
          'This program is meant to add `"done"` to the caller’s array, but it prints `["start"]`. What is the fix?',
        code: sw`func finish(_ steps: [String]) -> [String] {
    var copy = steps
    copy.append("done")
    return copy
}
var steps = ["start"]
finish(steps)
print(steps)`,
        correct:
          'Assign the result: `steps = finish(steps)` (or make the parameter `inout` and call `finish(&steps)`)',
        wrong: [
          'Change the parameter type to `var [String]`',
          'Declare `steps` with `let` so it is passed by reference',
          'Arrays are always passed by reference, so the bug is in `print`',
        ],
        why: 'Arrays are values: `finish` receives a copy and returns a new array, and the call discards the result (the compiler only warns). Either use the returned value or declare `inout` to modify the caller’s variable. `var` parameters were removed in Swift 3.',
      },
      {
        key: 'struct-param',
        question: 'Why does this program print `0`?',
        code: sw`struct Score { var points = 0 }
func reward(_ score: Score) {
    var s = score
    s.points += 10
}
var score = Score()
reward(score)
print(score.points)`,
        correct: '`Score` is a struct, so `reward` changes a local copy that is thrown away',
        wrong: [
          '`s.points += 10` is a compile error that the runner ignores',
          'Struct properties cannot be changed after initialization',
          '`reward` is never called because its result is unused',
        ],
        why: 'Structs are copied when passed. To change the caller’s value, make the parameter `inout` (`func reward(_ score: inout Score)` and call `reward(&score)`), or return the updated value.',
      },
    ],
  ),
  ...b.output(
    'swift-default-variadic',
    2,
    [
      'Default parameter values are used when the argument is omitted.',
      'A variadic parameter (`Int...`) is an array inside the function.',
    ],
    [
      {
        key: 'defaults',
        code: sw`func format(_ value: Double, decimals: Int = 2, prefix: String = "$") -> String {
    let factor = decimals == 0 ? 1.0 : 10.0
    return prefix + "\(Int(value * factor))"
}
print(format(4.56))
print(format(4.56, prefix: "EUR "))
print(format(4.56, decimals: 0))`,
        output: '$45\nEUR 45\n$4',
        why: 'Omitted arguments take their defaults, and you can skip `decimals` while still passing the later `prefix` because it is labeled. With `decimals: 0` the factor is `1.0`, so `Int(4.56)` truncates to `4`.',
      },
      {
        key: 'variadic',
        code: sw`func average(_ values: Double...) -> Double {
    guard !values.isEmpty else { return 0 }
    return values.reduce(0, +) / Double(values.count)
}
print(average(2, 4, 9))
print(average())`,
        output: '5.0\n0.0',
        why: 'The variadic parameter collects any number of arguments into `[Double]`, including none. `(2 + 4 + 9) / 3` is `5.0`; with no arguments the guard returns `0`, printed as `0.0` because it is a `Double`.',
      },
    ],
  ),
  ...b.output(
    'swift-inout',
    3,
    [
      'An `inout` parameter is copied in, can be modified, and is copied back to the caller when the function returns.',
      'The call site must mark it with `&`.',
    ],
    [
      {
        key: 'swap',
        code: sw`func normalize(_ low: inout Int, _ high: inout Int) {
    if low > high {
        let t = low
        low = high
        high = t
    }
}
var a = 9, b = 3
normalize(&a, &b)
print(a, b)`,
        output: '3 9',
        why: 'Both parameters are `inout`, so the function changes the caller’s `a` and `b`. Without `inout`, parameters are constants and could not be assigned at all.',
      },
      {
        key: 'array-element',
        code: sw`func double(_ x: inout Int) { x *= 2 }
var values = [1, 2, 3]
double(&values[1])
var total = 10
double(&total)
print(values, total)`,
        output: '[1, 4, 3] 20',
        why: 'An array element can be passed as `inout` with `&values[1]`; the new value is written back into the array. The same function doubles a plain variable.',
      },
    ],
  ),
  ...b.compiles(
    'swift-inout-rules',
    3,
    'Only a mutable variable (or a mutable property or element) can be passed as `inout`, always with `&`.',
    [
      {
        key: 'missing-ampersand',
        code: sw`func increment(_ n: inout Int) { n += 1 }
var count = 0
increment(count)
print(count)`,
        compiles: false,
        why: 'The call must write `increment(&count)`. The `&` makes it visible at the call site that the function may change the variable.',
      },
      {
        key: 'let-constant',
        code: sw`func increment(_ n: inout Int) { n += 1 }
let count = 0
increment(&count)
print(count)`,
        compiles: false,
        why: '`count` is a `let` constant, so it cannot be passed as `inout` ("cannot pass immutable value as inout argument").',
      },
      {
        key: 'literal',
        code: sw`func increment(_ n: inout Int) { n += 1 }
increment(&5)
print("ok")`,
        compiles: false,
        why: 'A literal is not a variable, so there is nothing to write the result back to.',
      },
      {
        key: 'property',
        code: sw`struct Counter { var value = 0 }
func increment(_ n: inout Int) { n += 1 }
var c = Counter()
increment(&c.value)
print(c.value)`,
        compiles: true,
        why: 'A stored property of a `var` struct is mutable, so `&c.value` is a valid `inout` argument.',
      },
    ],
  ),
  ...b.output(
    'swift-function-types',
    4,
    [
      'Functions are values: they can be stored in variables, passed and returned.',
      'A nested function can use variables from the function that contains it.',
    ],
    [
      {
        key: 'select',
        code: sw`func add(_ a: Int, _ b: Int) -> Int { a + b }
func multiply(_ a: Int, _ b: Int) -> Int { a * b }
let operations: [String: (Int, Int) -> Int] = ["+": add, "*": multiply]
for symbol in ["*", "+"] {
    if let op = operations[symbol] {
        print(symbol, op(3, 4))
    }
}`,
        output: '* 12\n+ 7',
        why: '`add` and `multiply` both have the function type `(Int, Int) -> Int`, so they can be stored in the same dictionary. Calling through a function value omits argument labels.',
      },
      {
        key: 'nested',
        code: sw`func makeFormatter(currency: String) -> (Int) -> String {
    func format(_ cents: Int) -> String {
        return "\(cents / 100).\(cents % 100) \(currency)"
    }
    return format
}
let eur = makeFormatter(currency: "EUR")
print(eur(1250))
print(eur(305))`,
        output: '12.50 EUR\n3.5 EUR',
        why: 'The nested function captures `currency` and is returned as a `(Int) -> String` value. Note the bug for `305`: `cents % 100` is `5`, printed without a leading zero, giving `3.5` rather than `3.05`.',
      },
    ],
  ),
  ...b.compiles(
    'swift-exclusive-access',
    5,
    'Swift forbids two overlapping accesses to the same variable when one of them modifies it.',
    [
      {
        key: 'same-var-twice',
        code: sw`func transfer(_ from: inout Int, _ to: inout Int, amount: Int) {
    from -= amount
    to += amount
}
var balance = 100
transfer(&balance, &balance, amount: 10)
print(balance)`,
        compiles: false,
        why: 'Passing the same variable to two `inout` parameters creates overlapping write accesses, which the law of exclusivity forbids. The compiler reports "overlapping accesses to \'balance\'".',
      },
      {
        key: 'array-elements',
        code: sw`var cards = [1, 2, 3]
swap(&cards[0], &cards[2])
print(cards)`,
        compiles: false,
        why: 'Each `&cards[i]` is a write access to the whole array, so two of them overlap. Use `cards.swapAt(0, 2)`, which is designed for this.',
      },
      {
        key: 'swap-at',
        code: sw`var cards = [1, 2, 3]
cards.swapAt(0, 2)
var a = 1, b = 2
swap(&a, &b)
print(cards, a, b)`,
        compiles: true,
        why: '`swapAt` swaps elements inside one mutation of the array. `swap(&a, &b)` with two different variables has no overlapping access, so both are fine.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Closures

export const closuresFamilies: readonly QuestionSource[] = [
  ...b.output(
    'swift-closure-syntax',
    1,
    [
      'Closures can drop parameter types, `return` and even parameter names (`$0`, `$1`) when the context makes them clear.',
    ],
    [
      {
        key: 'sorted-forms',
        code: sw`let prices = [30, 10, 20]
let a = prices.sorted(by: { (x: Int, y: Int) -> Bool in return x > y })
let b = prices.sorted { $0 > $1 }
let c = prices.sorted(by: >)
print(a, b == a, c == a)`,
        output: '[30, 20, 10] true true',
        why: 'All three sort in descending order. The full closure, the shorthand trailing closure using `$0` and `$1`, and the operator `>` passed as a function are equivalent.',
      },
      {
        key: 'stored-closure',
        code: sw`let greet = { (name: String) -> String in
    "Hello, \(name)"
}
let shout: (String) -> String = { $0.uppercased() + "!" }
print(greet("Ana"))
print(shout(greet("Bo")))`,
        output: 'Hello, Ana\nHELLO, BO!',
        why: 'A closure expression can be stored in a constant and called like a function. A single-expression closure returns its expression implicitly.',
      },
    ],
  ),
  ...b.output(
    'swift-map-filter-reduce',
    2,
    [
      '`map` transforms every element, `filter` keeps matching ones, `reduce` combines them into one value.',
    ],
    [
      {
        key: 'pipeline',
        code: sw`let orders = [12, 5, 40, 8, 25]
let total = orders
    .filter { $0 >= 10 }
    .map { $0 * 2 }
    .reduce(0, +)
print(total)`,
        output: '154',
        why: '`filter` keeps 12, 40 and 25; `map` doubles them to 24, 80 and 50; `reduce(0, +)` sums them to `154`.',
      },
      {
        key: 'strings',
        code: sw`import Foundation

let names = ["ana", "bo", "cyrus"]
let lengths = names.map { $0.count }
let long = names.filter { $0.count > 2 }.map { $0.capitalized }
let joined = names.reduce("") { $0 + $1.prefix(1) }
print(lengths, long, joined)`,
        output: '[3, 2, 5] ["Ana", "Cyrus"] abc',
        why: '`map` can change the element type (`String` to `Int`). `capitalized` (Foundation) uppercases each word’s first letter. `reduce("")` starts from an empty string and appends the first letter of each name.',
      },
      {
        key: 'reduce-into',
        code: sw`let words = ["apple", "avocado", "banana", "blueberry", "cherry"]
let counts = words.reduce(into: [Character: Int]()) { result, word in
    result[word.first!, default: 0] += 1
}
for key in counts.keys.sorted() {
    print(key, counts[key]!)
}`,
        output: 'a 2\nb 2\nc 1',
        why: '`reduce(into:)` gives the closure an `inout` accumulator, which is efficient for building dictionaries. The keys are sorted before printing because dictionary order is not stable.',
      },
    ],
  ),
  ...b.blank(
    'swift-trailing-closures',
    2,
    'When the last argument is a closure, it can be written after the parentheses.',
    [
      {
        key: 'first-where',
        prompt:
          'Complete the code so it prints the first number greater than 10, `12`, using `first(where:)` with a trailing closure.',
        template: sw`let numbers = [4, 12, 7, 30]
let big = numbers.first {{blank:closure}}
print(big ?? 0)`,
        blanks: { closure: ['{ $0 > 10 }', '{ n in n > 10 }', '{ (n: Int) -> Bool in n > 10 }'] },
        why: '`numbers.first { $0 > 10 }` is `first(where:)` with a trailing closure: the `where:` label is dropped. Any closure syntax that returns a `Bool` works, and the result is an Optional because no element might match.',
      },
      {
        key: 'custom',
        prompt:
          'Complete the call so it uses trailing-closure syntax and the program prints `attempt 1`, `attempt 2`, `attempt 3`.',
        template: sw`func repeatTimes(_ n: Int, _ body: (Int) -> Void) {
    for i in 1...n { body(i) }
}
repeatTimes(3) {{blank:closure}}`,
        blanks: { closure: ['{ print("attempt \\($0)") }', '{ i in print("attempt \\(i)") }'] },
        why: 'The closure follows `repeatTimes(3)` directly. Inside it, `$0` (or a named parameter) is the attempt number passed by `body(i)`.',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-compactmap-flatmap',
    3,
    '`compactMap` drops `nil` results; `flatMap` flattens nested sequences.',
    [
      {
        key: 'compact',
        code: sw`let inputs = ["4", "x", "15", ""]
let numbers = inputs.compactMap { Int($0) }
let mapped = inputs.map { Int($0) }
print(numbers, mapped.count)`,
        correct: '[4, 15] 4',
        wrong: ['[4, 15] 2', '[4, nil, 15, nil] 4', '[4, 0, 15, 0] 4'],
        why: '`compactMap` keeps only the non-nil results, so `numbers` is `[4, 15]`. `map` keeps one result per input, including the `nil`s, so `mapped` is an `[Int?]` with 4 elements.',
      },
      {
        key: 'flat',
        code: sw`let teams = [["ana", "bo"], [], ["cy"]]
let everyone = teams.flatMap { $0 }
let sizes = teams.map { $0.count }
print(everyone, sizes)`,
        correct: '["ana", "bo", "cy"] [2, 0, 1]',
        wrong: [
          '[["ana", "bo"], [], ["cy"]] [2, 0, 1]',
          '["ana", "bo", "cy"] [2, 1]',
          '["ana", "bo", "cy"] 3',
        ],
        why: '`flatMap` concatenates the arrays the closure returns into one array. `map` keeps the structure: one count per team, including the empty one.',
      },
    ],
  ),
  ...b.output(
    'swift-capturing-values',
    3,
    [
      'A closure captures variables, not just their values at creation time.',
      'Each call to a function that returns a closure creates new captured variables.',
    ],
    [
      {
        key: 'counter',
        code: sw`func makeCounter() -> () -> Int {
    var count = 0
    return {
        count += 1
        return count
    }
}
let a = makeCounter()
let b = makeCounter()
print(a(), a(), b(), a())`,
        output: '1 2 1 3',
        why: 'Each call to `makeCounter` creates a new `count` variable that lives on in the returned closure. `a` and `b` have separate counters, and `a` keeps its value between calls.',
      },
      {
        key: 'shared',
        code: sw`var total = 0
let addTen = { total += 10 }
let report = { print("total", total) }
addTen()
addTen()
report()
total = 1
report()`,
        output: 'total 20\ntotal 1',
        why: 'Both closures capture the same variable `total` by reference, so changes made by one closure, or by the surrounding code, are seen by the other.',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-capture-lists',
    4,
    'A capture list (`[x]`) copies the value when the closure is created; without one, the closure sees later changes.',
    [
      {
        key: 'with-and-without',
        code: sw`var level = 1
let live = { "live \(level)" }
let snapshot = { [level] in "snapshot \(level)" }
level = 5
print(live(), snapshot())`,
        correct: 'live 5 snapshot 1',
        wrong: ['live 1 snapshot 1', 'live 5 snapshot 5', 'live 1 snapshot 5'],
        why: '`live` captures the variable `level` itself, so it sees `5`. `[level]` in the capture list copies the value `1` when `snapshot` is created.',
      },
      {
        key: 'loop',
        code: sw`var actions: [() -> Int] = []
for i in 1...3 {
    actions.append { i * 10 }
}
var j = 1
var others: [() -> Int] = []
while j <= 3 {
    others.append { j * 10 }
    j += 1
}
print(actions.map { $0() }, others.map { $0() })`,
        correct: '[10, 20, 30] [40, 40, 40]',
        wrong: [
          '[10, 20, 30] [10, 20, 30]',
          '[30, 30, 30] [40, 40, 40]',
          '[40, 40, 40] [40, 40, 40]',
        ],
        why: 'A `for`-`in` loop creates a new `i` constant for each iteration, so each closure has its own value. The `while` loop uses one `j` variable that all closures share, and by the time they run, `j` is `4`.',
      },
    ],
  ),
  ...b.compiles(
    'swift-escaping',
    4,
    'A closure parameter is non-escaping by default: it cannot be stored or used after the function returns unless marked `@escaping`.',
    [
      {
        key: 'store-non-escaping',
        code: sw`final class EventBus {
    var handlers: [(String) -> Void] = []
    func subscribe(_ handler: (String) -> Void) {
        handlers.append(handler)
    }
}
let bus = EventBus()
bus.subscribe { print($0) }`,
        compiles: false,
        why: 'Storing `handler` lets it outlive the call, but the parameter is non-escaping. Mark it `@escaping` (`_ handler: @escaping (String) -> Void`). Non-escaping by default lets the compiler optimize and lets callers use `self` implicitly.',
      },
      {
        key: 'escaping',
        code: sw`final class EventBus {
    var handlers: [(String) -> Void] = []
    func subscribe(_ handler: @escaping (String) -> Void) {
        handlers.append(handler)
    }
    func publish(_ event: String) { handlers.forEach { $0(event) } }
}
let bus = EventBus()
bus.subscribe { print("got", $0) }
bus.publish("saved")`,
        compiles: true,
        why: 'With `@escaping`, the closure may be stored and called later. `forEach` takes a non-escaping closure, which is fine because it is only called during `publish`.',
      },
      {
        key: 'implicit-self',
        code: sw`final class Downloader {
    var completed = 0
    var pending: [() -> Void] = []
    func enqueue(_ work: @escaping () -> Void) { pending.append(work) }
    func start() {
        enqueue {
            completed += 1
        }
    }
}
Downloader().start()`,
        compiles: false,
        why: 'Inside an escaping closure in a class, using a property requires an explicit `self.` (or `[self]` in the capture list), so the strong capture of `self` is visible. Writing `self.completed += 1` compiles.',
      },
    ],
  ),
  ...b.codeChoice(
    'swift-unused-result-bug',
    3,
    'Many collection methods return a new value instead of changing the collection.',
    [
      {
        key: 'sorted',
        question:
          'This program should print the names in alphabetical order, but it does not. Why?',
        code: sw`var names = ["Cy", "Ana", "Bo"]
names.sorted()
print(names)`,
        correct:
          '`sorted()` returns a new sorted array and the result is discarded; use `names.sort()` to sort in place',
        wrong: [
          '`sorted()` needs a closure such as `sorted(by: <)` to do anything',
          '`names` must be declared with `let` for `sorted()` to work',
          'Strings cannot be compared with `<`, so the call does nothing',
        ],
        why: 'Swift names non-mutating methods with -ed/-ing forms (`sorted()`, `reversed()`) and mutating ones with the plain verb (`sort()`, `reverse()`). The compiler warns that the result is unused, but the program still compiles and runs.',
      },
      {
        key: 'filter',
        question:
          'This program should remove negative readings, but it prints all four. What is the fix?',
        code: sw`var readings = [3, -1, 4, -5]
_ = readings.filter { $0 >= 0 }
print(readings)`,
        correct:
          'Use `readings.removeAll { $0 < 0 }`, or assign `readings = readings.filter { $0 >= 0 }`',
        wrong: [
          'Change the closure to `{ $0 < 0 }`',
          'Replace `filter` with `map`',
          'Declare `readings` with `let`',
        ],
        why: '`filter` builds a new array; `_ =` explicitly throws it away. `removeAll(where:)` mutates the array in place and removes the elements for which the closure returns `true`.',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-lazy-sequences',
    5,
    'A lazy sequence computes elements on demand, one at a time, as they are requested.',
    [
      {
        key: 'first',
        code: sw`var log: [String] = []
let result = [1, 2, 3, 4].lazy
    .map { n -> Int in log.append("map \(n)"); return n * 10 }
    .first { $0 > 15 }
print(result!, log.count)`,
        correct: '20 2',
        wrong: ['20 4', '20 3', '30 4'],
        why: 'With `lazy`, `map` runs only for the elements `first(where:)` actually inspects: `1` (10, not enough) and `2` (20, found). Without `lazy`, `map` would transform all four elements first.',
      },
      {
        key: 'eager',
        code: sw`var log: [String] = []
let result = [1, 2, 3, 4]
    .map { n -> Int in log.append("map \(n)"); return n * 10 }
    .first { $0 > 15 }
print(result!, log.count)`,
        correct: '20 4',
        wrong: ['20 2', '10 4', '20 1'],
        why: 'Without `lazy`, `map` produces the whole new array (running the closure four times) before `first(where:)` starts looking. Use `.lazy` when only part of the result is needed or the transform is expensive.',
      },
    ],
  ),
];
