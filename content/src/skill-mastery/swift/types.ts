import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Structs and classes, enumerations, protocols and generics. Every snippet is
 * compiled and run by the real Swift runner.
 */

const b = programBuilders('swift');
const sw = String.raw;

// ---------------------------------------------------------------- Structs and classes

export const structsClassesFamilies: readonly QuestionSource[] = [
  ...b.output(
    'swift-value-vs-reference',
    1,
    [
      'Assigning a struct copies it; assigning a class instance copies a reference to the same object.',
    ],
    [
      {
        key: 'struct',
        code: sw`struct Point { var x: Int }
var a = Point(x: 1)
var b = a
b.x = 5
print(a.x, b.x)`,
        output: '1 5',
        why: '`Point` is a struct (a value type), so `var b = a` makes an independent copy. Changing `b.x` does not affect `a`.',
      },
      {
        key: 'class',
        code: sw`final class Point {
    var x: Int
    init(x: Int) { self.x = x }
}
let a = Point(x: 1)
let b = a
b.x = 5
print(a.x, b.x)`,
        output: '5 5',
        why: '`Point` is a class (a reference type), so `a` and `b` refer to the same object. Note that `let` only fixes the reference: the object’s `var` properties can still change.',
      },
      {
        key: 'function',
        code: sw`struct Wallet { var cash = 10 }
final class Account { var balance = 10 }
func spend(_ w: Wallet, _ a: Account) {
    var w = w
    w.cash -= 5
    a.balance -= 5
}
let wallet = Wallet()
let account = Account()
spend(wallet, account)
print(wallet.cash, account.balance)`,
        output: '10 5',
        why: 'The function gets a copy of the struct, so only its local copy loses cash. The class parameter refers to the caller’s object, so the balance change is visible outside.',
      },
    ],
  ),
  ...b.whichCompile(
    'swift-initializers',
    2,
    'Structs get a memberwise initializer; classes get only a no-argument initializer, and only when every stored property has a default value.',
    [
      {
        key: 'memberwise',
        question: 'Which lines compile after the declaration shown?',
        prelude: sw`struct User {
    var name: String
    var isAdmin = false
}`,
        options: [
          'let u = User(name: "ana")',
          'let u = User(name: "ana", isAdmin: true)',
          'let u = User(isAdmin: true, name: "ana")',
          'let u = User()',
          'let u = User("ana")',
        ],
        correct: ['let u = User(name: "ana")', 'let u = User(name: "ana", isAdmin: true)'],
        why: 'The memberwise initializer takes the stored properties in declaration order, with labels. Properties with a default value (`isAdmin`) become optional arguments. `name` has no default, so `User()` fails, and the labels cannot be dropped or reordered.',
      },
      {
        key: 'classes',
        question: 'Which of these declarations compile?',
        options: [
          'class A { var x = 0 }; print(A().x)',
          'class B { var x: Int }',
          'struct C { var x: Int }; print(C(x: 1).x)',
          'class D { var x: Int; init(x: Int) { self.x = x } }; print(D(x: 2).x)',
          'class E { let x: Int }; print(E(x: 1).x)',
        ],
        correct: [
          'class A { var x = 0 }; print(A().x)',
          'struct C { var x: Int }; print(C(x: 1).x)',
          'class D { var x: Int; init(x: Int) { self.x = x } }; print(D(x: 2).x)',
        ],
        why: 'Classes never get a memberwise initializer. A class whose stored properties all have defaults gets `init()`; otherwise you must write an initializer (`B` and `E` fail with "class has no initializers"). Structs like `C` get the memberwise one automatically.',
      },
    ],
  ),
  ...b.compiles(
    'swift-mutating',
    2,
    'Methods of a struct cannot change its properties unless they are marked `mutating`, and mutating methods cannot be called on a `let` value.',
    [
      {
        key: 'missing-mutating',
        code: sw`struct Counter {
    var value = 0
    func increment() { value += 1 }
}
var c = Counter()
c.increment()
print(c.value)`,
        compiles: false,
        why: 'In a non-mutating struct method, `self` is immutable, so `value += 1` fails ("left side of mutating operator isn\'t mutable: \'self\' is immutable"). Mark the method `mutating func increment()`.',
      },
      {
        key: 'let-instance',
        code: sw`struct Counter {
    var value = 0
    mutating func increment() { value += 1 }
}
let c = Counter()
c.increment()
print(c.value)`,
        compiles: false,
        why: 'A mutating method changes the whole value, which a `let` constant forbids. Declare `var c`.',
      },
      {
        key: 'class-method',
        code: sw`final class Counter {
    var value = 0
    func increment() { value += 1 }
}
let c = Counter()
c.increment()
print(c.value)`,
        compiles: true,
        why: 'Class methods can change `var` properties without `mutating`: the method changes the shared object, not the reference stored in `c`.',
      },
      {
        key: 'assign-self',
        code: sw`struct Point {
    var x = 0, y = 0
    mutating func reset() { self = Point() }
}
var p = Point(x: 3, y: 4)
p.reset()
print(p.x, p.y)`,
        compiles: true,
        why: 'A mutating method can replace `self` entirely with a new value. This is common in enums and structs that move between states.',
      },
    ],
  ),
  ...b.codeChoice(
    'swift-struct-copy-bug',
    3,
    'Changing a copy of a struct does not change the original stored in a collection.',
    [
      {
        key: 'for-var',
        question:
          'This program should increase every quantity by one, but it prints `[1, 2]`. What is the fix?',
        code: sw`struct Item { var name: String; var qty: Int }
var cart = [Item(name: "pen", qty: 1), Item(name: "ink", qty: 2)]
for var item in cart {
    item.qty += 1
}
print(cart.map { $0.qty })`,
        correct: 'Modify the elements through the array, for example `for i in cart.indices { cart[i].qty += 1 }`',
        wrong: [
          'Change `for var item` to `for let item`',
          'Mark `qty` as `mutating`',
          'Declare `cart` with `let` so the loop works on references',
        ],
        why: '`for var item` gives the loop body a mutable copy of each element; changing it does not write back into `cart`. Index into the array (or rebuild it with `map`) to change the stored structs.',
      },
      {
        key: 'dictionary-copy',
        question: 'This program should make Ann a year older, but it prints `30`. What is the fix?',
        code: sw`struct Person { var age: Int }
var people = ["ann": Person(age: 30)]
if var ann = people["ann"] {
    ann.age += 1
}
print(people["ann"]!.age)`,
        correct: 'Mutate through the dictionary: `people["ann"]?.age += 1`',
        wrong: [
          'Use `if let ann` instead of `if var ann`',
          'Make `age` a `let` property',
          'Call `people.updateValue(ann, forKey: "ann")` before `ann.age += 1`',
        ],
        why: '`if var ann` binds a copy of the struct. Optional chaining on the subscript, `people["ann"]?.age += 1`, changes the value stored in the dictionary. Writing the copy back after changing it would also work; writing it back before does not.',
      },
    ],
  ),
  ...b.output(
    'swift-properties',
    3,
    [
      '`willSet` and `didSet` run when a stored property is set, but not during the type’s own initializer.',
      'A `lazy` property is computed once, on first access.',
    ],
    [
      {
        key: 'observers',
        code: sw`struct Thermostat {
    var target = 20 {
        willSet { print("will \(target) -> \(newValue)") }
        didSet {
            if target > 30 { target = 30 }
            print("did \(oldValue) -> \(target)")
        }
    }
}
var t = Thermostat()
t.target = 25
t.target = 40
print(t.target)`,
        output: 'will 20 -> 25\ndid 20 -> 25\nwill 25 -> 40\ndid 25 -> 30\n30',
        why: '`willSet` sees the incoming `newValue`; `didSet` sees `oldValue`. Assigning the property inside its own `didSet` clamps it without triggering the observers again.',
      },
      {
        key: 'init-no-observer',
        code: sw`struct Tracked {
    var value: Int {
        didSet { print("changed \(oldValue) -> \(value)") }
    }
    init(value: Int) {
        self.value = value
        self.value += 1
    }
}
var x = Tracked(value: 1)
x.value = 10
print(x.value)`,
        output: 'changed 2 -> 10\n10',
        why: 'Property observers are not called while the type’s own initializer sets its properties, so neither assignment in `init` prints. The later assignment from outside does.',
      },
      {
        key: 'lazy',
        code: sw`struct Report {
    var title: String
    lazy var header: String = {
        print("building header")
        return "== \(title) =="
    }()
}
var r = Report(title: "Q1")
print("created")
print(r.header)
r.title = "Q2"
print(r.header)`,
        output: 'created\nbuilding header\n== Q1 ==\n== Q1 ==',
        why: 'The lazy initializer runs on first access, after `created`, and its result is stored. Changing `title` later does not recompute it; use a computed property (`var header: String { "== \\(title) ==" }`) if it must stay in sync.',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-identity',
    3,
    '`==` compares values as the type defines; `===` checks whether two references point to the same object.',
    [
      {
        key: 'equatable-class',
        code: sw`final class Tag: Equatable {
    let name: String
    init(_ name: String) { self.name = name }
    static func == (a: Tag, b: Tag) -> Bool { a.name == b.name }
}
let a = Tag("x")
let b = Tag("x")
let c = a
print(a == b, a === b, a === c)`,
        correct: 'true false true',
        wrong: ['true true true', 'false false true', 'true false false'],
        why: '`a == b` uses the custom `==`, which compares names. `===` is identity: `a` and `b` are two separate objects, while `c` refers to the same object as `a`.',
      },
      {
        key: 'contains',
        code: sw`final class Session { var user: String; init(_ u: String) { user = u } }
let current = Session("kim")
let open = [Session("kim"), Session("lee")]
let isOpen = open.contains { $0 === current }
let sameUser = open.contains { $0.user == current.user }
print(isOpen, sameUser)`,
        correct: 'false true',
        wrong: ['true true', 'false false', 'true false'],
        why: '`current` is a different object from the one in the array, even though it has the same `user`, so the identity check is `false`. Comparing properties finds the match. `Session` is not `Equatable`, so `open.contains(current)` would not compile.',
      },
    ],
  ),
  ...b.compiles(
    'swift-class-init-rules',
    4,
    'Every stored property must be initialized before the initializer finishes, and a subclass initializes its own properties before calling `super.init`.',
    [
      {
        key: 'missing-property',
        code: sw`class Account {
    let id: Int
    var balance: Double
    init(id: Int) {
        self.id = id
    }
}
print(Account(id: 1).id)`,
        compiles: false,
        why: '`balance` has no default and is not set in `init`, so the compiler reports "return from initializer without initializing all stored properties". Give it a default (`= 0`) or assign it.',
      },
      {
        key: 'convenience',
        code: sw`class Temperature {
    var celsius: Double
    init(celsius: Double) { self.celsius = celsius }
    convenience init(fahrenheit: Double) {
        self.init(celsius: (fahrenheit - 32) * 5 / 9)
    }
}
print(Temperature(fahrenheit: 212).celsius)`,
        compiles: true,
        why: 'A convenience initializer must delegate to another initializer of the same class with `self.init(...)`; this one converts and delegates to the designated initializer.',
      },
      {
        key: 'convenience-no-delegation',
        code: sw`class Temperature {
    var celsius: Double
    init(celsius: Double) { self.celsius = celsius }
    convenience init() {
        celsius = 0
    }
}
print(Temperature().celsius)`,
        compiles: false,
        why: 'A convenience initializer must call `self.init(...)` before using `self`; it cannot initialize stored properties itself. Write `self.init(celsius: 0)`.',
      },
      {
        key: 'subclass-order',
        code: sw`class Animal {
    let name: String
    init(name: String) { self.name = name }
}
class Dog: Animal {
    let breed: String
    init(name: String, breed: String) {
        super.init(name: name)
        self.breed = breed
    }
}
print(Dog(name: "Rex", breed: "lab").breed)`,
        compiles: false,
        why: 'Two-phase initialization requires a subclass to initialize its own stored properties before calling `super.init`. Swap the two lines: `self.breed = breed` first, then `super.init(name: name)`.',
      },
    ],
  ),
  ...b.output(
    'swift-inheritance',
    4,
    [
      'Calls to overridden methods are dispatched on the object’s runtime class, whatever the variable’s declared type.',
    ],
    [
      {
        key: 'dynamic-dispatch',
        code: sw`class Shape {
    func name() -> String { "shape" }
    func describe() -> String { "I am a \(name())" }
}
class Circle: Shape {
    override func name() -> String { "circle" }
}
let shapes: [Shape] = [Shape(), Circle()]
for s in shapes { print(s.describe()) }`,
        output: 'I am a shape\nI am a circle',
        why: '`describe` is inherited unchanged, but its call to `name()` is dispatched dynamically, so for a `Circle` it uses the override even though the array is typed `[Shape]`.',
      },
      {
        key: 'super',
        code: sw`class Logger {
    func log(_ m: String) -> String { "[log] \(m)" }
}
class TimestampLogger: Logger {
    override func log(_ m: String) -> String {
        "t=0 " + super.log(m)
    }
}
final class ErrorLogger: TimestampLogger {
    override func log(_ m: String) -> String {
        super.log(m.uppercased())
    }
}
let logger: Logger = ErrorLogger()
print(logger.log("disk full"))`,
        output: 't=0 [log] DISK FULL',
        why: '`ErrorLogger.log` uppercases and calls its superclass, which adds `t=0 ` and calls `Logger.log`. `final` only prevents further subclassing; it does not change how these calls chain.',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-struct-with-reference',
    5,
    'Copying a struct copies its stored properties; a class-typed property is a reference, so the copy shares the object.',
    [
      {
        key: 'shared-storage',
        code: sw`final class Storage { var items: [String] = [] }
struct Inventory {
    var storage = Storage()
    var count = 0
}
let a = Inventory()
var b = a
b.storage.items.append("bolt")
b.count += 1
print(a.storage.items, a.count)`,
        correct: '["bolt"] 0',
        wrong: ['[] 0', '["bolt"] 1', '[] 1'],
        why: '`b` is a copy of `a`, so `count` is independent. But both copies hold a reference to the same `Storage` object, so appending through `b` is visible through `a`. A struct is only fully a value type if its properties are values too; copy-on-write types implement this by copying their storage before mutation.',
      },
      {
        key: 'let-struct',
        code: sw`final class Cache { var hits = 0 }
struct Config {
    let name: String
    let cache: Cache
}
let config = Config(name: "prod", cache: Cache())
config.cache.hits += 1
let copy = config
copy.cache.hits += 1
print(config.cache.hits)`,
        correct: '2',
        wrong: ['1', '0', 'It does not compile: config is a let constant'],
        why: '`let` makes the struct and its `cache` reference constant, but the `Cache` object itself is a class instance with a `var` property, so it can still be changed. The copy shares the same object, so both increments land on it.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Enumerations

export const enumsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'swift-enum-raw-values',
    1,
    [
      'Integer raw values count up from the previous case; `String` raw values default to the case name.',
      '`init(rawValue:)` returns an Optional.',
    ],
    [
      {
        key: 'implicit',
        code: sw`enum Priority: Int { case low = 1, medium, high }
enum Planet: String { case mercury, venus }
print(Priority.high.rawValue, Planet.venus.rawValue)
print(Priority(rawValue: 2) == .medium, Priority(rawValue: 9) == nil)`,
        output: '3 venus\ntrue true',
        why: '`medium` and `high` get `2` and `3` after `low = 1`. A `String` enum uses the case name as the raw value. `Priority(rawValue: 9)` has no matching case, so it returns `nil`.',
      },
      {
        key: 'describe',
        code: sw`enum Direction: String {
    case north = "N", south = "S"
}
let d = Direction.north
print(d, d.rawValue)
print(Direction(rawValue: "S").map { "\($0)" } ?? "none")`,
        output: 'north N\nsouth',
        why: 'Printing a case shows its name, not its raw value. `rawValue` gives `"N"`. `Direction(rawValue: "S")` is `.south`, which `map` turns into its name.',
      },
    ],
  ),
  ...b.blank(
    'swift-case-iterable',
    1,
    'The `CaseIterable` protocol gives an enum a static `allCases` collection.',
    [
      {
        key: 'count',
        prompt: 'Complete the code so it prints the number of sizes, `3`.',
        template: sw`enum Size: CaseIterable { case small, medium, large }
print(Size.{{blank:all}}.count)`,
        blanks: { all: ['allCases'] },
        why: '`CaseIterable` synthesizes `static var allCases`, listing the cases in declaration order. It only works automatically for enums without associated values.',
      },
      {
        key: 'conformance',
        prompt: 'Complete the declaration so the program prints `["mon", "tue", "wed"]`.',
        template: sw`enum Weekday: String, {{blank:p}} { case mon, tue, wed }
print(Weekday.allCases.map(\.rawValue))`,
        blanks: { p: ['CaseIterable'] },
        why: 'Declaring `CaseIterable` provides `allCases`. The raw type `String` comes first in the inheritance list, then the protocols. `\\.rawValue` is a key path used as a function.',
      },
    ],
  ),
  ...b.output(
    'swift-associated-values',
    2,
    [
      'Each case can carry its own associated values; a `switch` extracts them with `let`.',
    ],
    [
      {
        key: 'payment',
        code: sw`enum Payment {
    case cash
    case card(last4: String)
    case transfer(iban: String, amount: Int)
}
let payments: [Payment] = [.card(last4: "4242"), .cash, .transfer(iban: "DE01", amount: 50)]
for p in payments {
    switch p {
    case .cash: print("cash")
    case .card(let last4): print("card ending \(last4)")
    case let .transfer(iban, amount) where amount > 100: print("large transfer \(iban)")
    case .transfer(let iban, _): print("transfer \(iban)")
    }
}`,
        output: 'card ending 4242\ncash\ntransfer DE01',
        why: 'The associated values are bound in each case. The transfer amount is `50`, so the `where amount > 100` case does not match and the next transfer case does.',
      },
      {
        key: 'shape',
        code: sw`enum Shape {
    case circle(radius: Double)
    case rect(width: Double, height: Double)
    var area: Double {
        switch self {
        case .circle(let r): return 3 * r * r
        case .rect(let w, let h): return w * h
        }
    }
}
print(Shape.circle(radius: 2).area, Shape.rect(width: 2, height: 5).area)`,
        output: '12.0 10.0',
        why: 'A computed property on the enum switches over `self` and uses the associated values. The results are `Double`, so they print with `.0`.',
      },
    ],
  ),
  ...b.compiles(
    'swift-enum-exhaustive',
    2,
    'A `switch` over an enum must handle every case, unless it has a `default`.',
    [
      {
        key: 'missing-case',
        code: sw`enum Status { case active, suspended, closed }
func label(_ s: Status) -> String {
    switch s {
    case .active: return "Active"
    case .suspended: return "Suspended"
    }
}
print(label(.closed))`,
        compiles: false,
        why: '`.closed` is not handled, so the compiler reports "switch must be exhaustive". This is a feature: when a case is added, every `switch` without a `default` points to the code that must be updated.',
      },
      {
        key: 'if-case',
        code: sw`enum Status { case active, suspended(reason: String), closed }
let s = Status.suspended(reason: "billing")
if case .suspended(let reason) = s {
    print("suspended: \(reason)")
}`,
        compiles: true,
        why: '`if case` tests a single pattern, so it does not need to be exhaustive.',
      },
      {
        key: 'default',
        code: sw`enum Status { case active, suspended, closed }
func isUsable(_ s: Status) -> Bool {
    switch s {
    case .active: return true
    default: return false
    }
}
print(isUsable(.closed))`,
        compiles: true,
        why: '`default` covers the remaining cases. The trade-off: a new case added later silently falls into `default` instead of producing a compile error.',
      },
    ],
  ),
  ...b.fails(
    'swift-raw-value-crash',
    3,
    '`init(rawValue:)` returns `nil` for any value that does not match a case exactly.',
    [
      {
        key: 'case-sensitive',
        question: 'This program crashes. What is the cause?',
        code: sw`enum Role: String { case admin, editor, viewer }
let inputs = ["admin", "Viewer"]
for input in inputs {
    let role = Role(rawValue: input)!
    print(role)
}`,
        error: 'Fatal error: Unexpectedly found nil while unwrapping an Optional value',
        correct: 'Raw-value matching is case-sensitive, so `"Viewer"` gives `nil`, and `!` traps',
        wrong: [
          '`Role` has no raw values because none were written explicitly',
          'Enums cannot be created from strings inside a loop',
          '`print(role)` fails because enums cannot be printed',
        ],
        why: 'The raw value of `viewer` is `"viewer"`. Normalize input (`input.lowercased()`) and handle the `nil` case, for example with `guard let role = Role(rawValue: ...) else { ... }`.',
      },
      {
        key: 'int-code',
        question: 'This program crashes. What is the best fix?',
        code: sw`enum Level: Int { case debug = 10, info = 20, error = 40 }
let codes = [10, 40, 30]
var names: [String] = []
for code in codes {
    names.append("\(Level(rawValue: code)!)")
}
print(names)`,
        error: 'Fatal error: Unexpectedly found nil while unwrapping an Optional value',
        correct: 'Handle unknown codes, for example `Level(rawValue: code).map { "\\($0)" } ?? "unknown"`',
        wrong: [
          'Add `case warning` without a value; it automatically gets `30`',
          'Use `Level(code)` instead of `Level(rawValue: code)`',
          'Declare `codes` as `[Level]`',
        ],
        why: '`30` matches no case, so the initializer returns `nil`. An added case without a value would get `41` (one more than the previous case), not `30`. Treat external data as untrusted and handle the `nil`.',
      },
    ],
  ),
  ...b.output(
    'swift-enum-methods',
    3,
    [
      'Enums can have computed properties and methods; a `mutating` method can assign a new case to `self`.',
    ],
    [
      {
        key: 'traffic-light',
        code: sw`enum Light {
    case red, yellow, green
    var canGo: Bool { self == .green }
    mutating func next() {
        switch self {
        case .red: self = .green
        case .green: self = .yellow
        case .yellow: self = .red
        }
    }
}
var light = Light.red
light.next()
print(light, light.canGo)
light.next()
light.next()
print(light)`,
        output: 'green true\nred',
        why: '`next()` replaces `self` with the following case. Enums without associated values are automatically `Equatable`, so `self == .green` works.',
      },
      {
        key: 'static-factory',
        code: sw`enum Temperature {
    case celsius(Double)
    static func fromFahrenheit(_ f: Double) -> Temperature {
        .celsius((f - 32) * 5 / 9)
    }
    var isFreezing: Bool {
        if case .celsius(let c) = self { return c <= 0 }
        return false
    }
}
print(Temperature.fromFahrenheit(212).isFreezing, Temperature.fromFahrenheit(14).isFreezing)`,
        output: 'false true',
        why: 'A static factory method converts the input and returns a case. `212`°F is `100`°C and `14`°F is `-10`°C, so only the second is freezing.',
      },
    ],
  ),
  ...b.codeChoice(
    'swift-enum-state-modeling',
    4,
    'Think about which combinations of values each design allows.',
    [
      {
        key: 'load-state',
        question:
          'Compared with a struct holding `isLoading: Bool`, `items: [String]?` and `error: String?`, what is the main advantage of this enum?',
        code: sw`enum LoadState {
    case idle
    case loading
    case loaded([String])
    case failed(String)
}
func render(_ state: LoadState) -> String {
    switch state {
    case .idle: return "Tap to load"
    case .loading: return "Loading"
    case .loaded(let items) where items.isEmpty: return "No results"
    case .loaded(let items): return items.joined(separator: ", ")
    case .failed(let message): return "Error: " + message
    }
}
print(render(.loaded([])), render(.failed("offline")))`,
        correct:
          'Impossible combinations (loading with an error and items at once) cannot be represented, and every `switch` must handle each state',
        wrong: [
          'Enums with associated values are automatically `Equatable`, so states can be compared with `==`',
          'New states can be added later without updating `render`',
          'The enum lets `items` and `error` be read without unwrapping in any state',
        ],
        why: 'With three independent properties there are many invalid combinations to guard against. The enum makes each state carry exactly its own data, and exhaustive switches make the compiler list every place to update when a state is added. Associated-value enums are only `Equatable` if you declare it.',
      },
      {
        key: 'result-shape',
        question: 'A teammate proposes adding a `.refreshing([String])` case. What happens to `render`?',
        code: sw`enum FeedState {
    case loading
    case loaded([String])
    case failed(String)
}
func render(_ state: FeedState) -> String {
    switch state {
    case .loading: return "spinner"
    case .loaded(let posts): return "\(posts.count) posts"
    case .failed(let reason): return "error: \(reason)"
    }
}
print(render(.loaded(["a", "b"])))`,
        correct: 'It stops compiling until `render` handles `.refreshing`, because the `switch` has no `default`',
        wrong: [
          'It keeps compiling, and `.refreshing` is rendered as `"spinner"`',
          'It crashes at run time when a `.refreshing` value reaches the `switch`',
          'It keeps compiling, and `.refreshing` is treated as `.loaded` because the associated types match',
        ],
        why: 'An exhaustive `switch` without `default` turns a new case into a compile error at every place that must decide how to handle it. This is why a `default` in a switch over your own enum often hides bugs.',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-enum-patterns',
    4,
    'Enum case patterns also work in `if case`, `for case`, and on Optionals.',
    [
      {
        key: 'for-case',
        code: sw`enum Event { case tap(x: Int, y: Int), key(Character), scroll(Int) }
let events: [Event] = [.tap(x: 1, y: 2), .scroll(-3), .key("q"), .scroll(5)]
var total = 0
for case .scroll(let delta) in events { total += delta }
let quit = events.contains { event in
    if case .key("q") = event { return true }
    return false
}
print(total, quit)`,
        correct: '2 true',
        wrong: ['8 true', '2 false', '-3 true'],
        why: '`for case .scroll(let delta)` visits only the scroll events: `-3 + 5 = 2`. `if case .key("q")` matches a key event whose associated value equals `"q"`.',
      },
      {
        key: 'optional-enum',
        code: sw`enum Theme { case light, dark }
func pick(_ saved: Theme?) -> String {
    switch saved {
    case .light?: return "light"
    case .dark?: return "dark"
    case nil: return "system"
    }
}
print(pick(.dark), pick(nil))`,
        correct: 'dark system',
        wrong: ['dark nil', 'Optional(dark) system', 'system system'],
        why: '`.dark?` matches an Optional holding `.dark`, and `case nil` handles the missing value, so the switch is exhaustive without a `default`.',
      },
    ],
  ),
  ...b.compiles(
    'swift-indirect-enums',
    5,
    'An enum that contains itself directly needs `indirect` storage.',
    [
      {
        key: 'not-indirect',
        code: sw`enum Expr {
    case number(Int)
    case add(Expr, Expr)
}
let e = Expr.add(.number(1), .number(2))
print(e)`,
        compiles: false,
        why: 'A value of `Expr` would have to contain two `Expr` values inline, which has no finite size. The compiler reports "recursive enum \'Expr\' is not marked \'indirect\'". Mark the case or the enum `indirect` to store the payload in a box.',
      },
      {
        key: 'indirect',
        code: sw`indirect enum Expr {
    case number(Int)
    case add(Expr, Expr)
    case multiply(Expr, Expr)
}
func eval(_ e: Expr) -> Int {
    switch e {
    case .number(let n): return n
    case let .add(a, b): return eval(a) + eval(b)
    case let .multiply(a, b): return eval(a) * eval(b)
    }
}
print(eval(.multiply(.add(.number(2), .number(3)), .number(4))))`,
        compiles: true,
        why: '`indirect` makes the recursive payloads heap-allocated, so the enum has a finite size. This is a natural way to model trees such as expressions.',
      },
      {
        key: 'through-array',
        code: sw`enum Node {
    case leaf(String)
    case folder([Node])
}
let tree = Node.folder([.leaf("a"), .folder([.leaf("b")])])
func count(_ n: Node) -> Int {
    switch n {
    case .leaf: return 1
    case .folder(let children): return children.map(count).reduce(0, +)
    }
}
print(count(tree))`,
        compiles: true,
        why: 'The recursion goes through an `Array`, whose elements are already stored on the heap, so the enum has a finite size without `indirect`.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Protocols

export const protocolsFamilies: readonly QuestionSource[] = [
  ...b.compiles(
    'swift-protocol-conformance',
    1,
    'A type conforms only if it satisfies every requirement, with matching names, types and mutability.',
    [
      {
        key: 'missing-method',
        code: sw`protocol Describable {
    var title: String { get }
    func summary() -> String
}
struct Book: Describable {
    let title: String
}
print(Book(title: "Dune").title)`,
        compiles: false,
        why: '`Book` does not implement `summary()`, so it does not conform ("type \'Book\' does not conform to protocol \'Describable\'"). Add the method, or give the protocol a default implementation in an extension.',
      },
      {
        key: 'get-with-let',
        code: sw`protocol Identified { var id: Int { get } }
struct Order: Identified { let id: Int }
let o: any Identified = Order(id: 7)
print(o.id)`,
        compiles: true,
        why: 'A `{ get }` requirement only promises that the property can be read, so a `let` constant (or a computed property) satisfies it.',
      },
      {
        key: 'get-set-with-let',
        code: sw`protocol Renamable { var name: String { get set } }
struct Tag: Renamable { let name: String }
var t = Tag(name: "old")
print(t.name)`,
        compiles: false,
        why: 'A `{ get set }` requirement must be settable, which a `let` property is not. Declare `var name`.',
      },
    ],
  ),
  ...b.output(
    'swift-protocol-extensions',
    2,
    [
      'A protocol extension can provide default implementations; a conforming type can replace them.',
    ],
    [
      {
        key: 'default-impl',
        code: sw`protocol Greeter {
    var name: String { get }
    func greet() -> String
}
extension Greeter {
    func greet() -> String { "Hello, \(name)" }
}
struct English: Greeter { let name: String }
struct French: Greeter {
    let name: String
    func greet() -> String { "Bonjour, \(name)" }
}
let all: [any Greeter] = [English(name: "Ann"), French(name: "Luc")]
for g in all { print(g.greet()) }`,
        output: 'Hello, Ann\nBonjour, Luc',
        why: '`English` uses the default from the extension. `French` provides its own `greet()`, which is used even through `any Greeter` because `greet()` is a protocol requirement.',
      },
      {
        key: 'extend-existing',
        code: sw`extension Collection {
    var isNotEmpty: Bool { !isEmpty }
}
extension Int {
    var squared: Int { self * self }
}
print([1].isNotEmpty, "".isNotEmpty, 7.squared)`,
        output: 'true false 49',
        why: 'Extensions add functionality to existing types and protocols, including standard library ones. Every `Collection` (arrays, strings, dictionaries) gains `isNotEmpty`.',
      },
    ],
  ),
  ...b.whichCompile(
    'swift-synthesized-conformances',
    2,
    'Swift synthesizes `Equatable` and `Hashable` for structs and enums whose stored values all conform, and `Comparable` for enums without associated values.',
    [
      {
        key: 'usage',
        question: 'Which lines compile after the declarations shown?',
        prelude: sw`struct Point: Hashable { var x: Int; var y: Int }
final class Node { var id = 0 }
enum Size: Comparable { case small, medium, large }`,
        options: [
          'print(Point(x: 1, y: 2) == Point(x: 1, y: 2))',
          'let s: Set<Point> = [Point(x: 0, y: 0)]; print(s.count)',
          'print(Node() == Node())',
          'print(Size.small < Size.large)',
          'print(Point(x: 1, y: 1) < Point(x: 2, y: 2))',
        ],
        correct: [
          'print(Point(x: 1, y: 2) == Point(x: 1, y: 2))',
          'let s: Set<Point> = [Point(x: 0, y: 0)]; print(s.count)',
          'print(Size.small < Size.large)',
        ],
        why: '`Point` gets synthesized `==` and hashing, so it works in a `Set`. `Comparable` is synthesized for the enum in declaration order, but not for structs, so `Point < Point` fails. `Node` is a class that did not declare `Equatable`, so `==` is unavailable.',
      },
      {
        key: 'declarations',
        question: 'Which declarations compile?',
        prelude: sw`final class Node { var id = 0 }`,
        options: [
          'struct Wrapper: Equatable { var node: Node }',
          'struct Pair: Equatable { var a: Int; var b: String }',
          'class Box: Equatable { var v = 0 }',
          'enum Outcome: Equatable { case ok(Int), fail(String) }',
          'struct Tagged: Hashable { var tags: [String] }',
        ],
        correct: [
          'struct Pair: Equatable { var a: Int; var b: String }',
          'enum Outcome: Equatable { case ok(Int), fail(String) }',
          'struct Tagged: Hashable { var tags: [String] }',
        ],
        why: 'Synthesis needs every stored property or associated value to conform: `Node` is not `Equatable`, so `Wrapper` fails. Classes never get synthesized `==`, so `Box` must implement it. Arrays of `Hashable` elements are themselves `Hashable`, so `Tagged` works.',
      },
    ],
  ),
  ...b.blank(
    'swift-implementing-comparable',
    3,
    'Implement `<` for `Comparable` (and keep `==` and hashing consistent with each other).',
    [
      {
        key: 'version',
        prompt:
          'Complete `<` so versions sort by major, then minor, and the program prints `["0.9", "1.2", "1.10"]`.',
        template: sw`struct Version: Comparable {
    let major: Int
    let minor: Int
    static func < (lhs: Version, rhs: Version) -> Bool {
        {{blank:body}}
    }
}
let versions = [Version(major: 1, minor: 10), Version(major: 1, minor: 2), Version(major: 0, minor: 9)]
print(versions.sorted().map { "\($0.major).\($0.minor)" })`,
        blanks: {
          body: [
            '(lhs.major, lhs.minor) < (rhs.major, rhs.minor)',
            'return (lhs.major, lhs.minor) < (rhs.major, rhs.minor)',
            'lhs.major != rhs.major ? lhs.major < rhs.major : lhs.minor < rhs.minor',
          ],
        },
        why: 'Tuples of comparable values compare element by element, which is exactly a lexicographic version order. Comparing as numbers (not strings) puts `1.2` before `1.10`. `Comparable` only requires `<`; `==` is synthesized for the struct.',
      },
      {
        key: 'hashable',
        prompt:
          'Complete `==` so it is consistent with the custom hashing, and the program prints `2`.',
        template: sw`struct Email: Hashable {
    let address: String
    static func == (lhs: Email, rhs: Email) -> Bool {
        {{blank:body}}
    }
    func hash(into hasher: inout Hasher) {
        hasher.combine(address.lowercased())
    }
}
let emails = [Email(address: "Kim@x.io"), Email(address: "kim@x.io"), Email(address: "lee@x.io")]
print(Set(emails).count)`,
        blanks: {
          body: [
            'lhs.address.lowercased() == rhs.address.lowercased()',
            'return lhs.address.lowercased() == rhs.address.lowercased()',
          ],
        },
        why: 'Values that are equal must have the same hash. Hashing uses the lowercased address, so equality must ignore case too; then the two `kim` addresses collapse into one set element.',
      },
    ],
  ),
  ...b.compiles(
    'swift-some-any',
    4,
    '`some P` is one specific concrete type chosen by the implementation; `any P` is a box that can hold any conforming type.',
    [
      {
        key: 'some-two-types',
        code: sw`protocol Shape { func area() -> Double }
struct Square: Shape { var side: Double; func area() -> Double { side * side } }
struct Circle: Shape { var r: Double; func area() -> Double { 3 * r * r } }
func makeShape(big: Bool) -> some Shape {
    if big { return Square(side: 10) }
    return Circle(r: 1)
}
print(makeShape(big: true).area())`,
        compiles: false,
        why: 'An opaque `some Shape` return type must be the same concrete type on every path; here it is `Square` on one and `Circle` on the other. Return `any Shape` instead, or make both paths return the same type.',
      },
      {
        key: 'any-two-types',
        code: sw`protocol Shape { func area() -> Double }
struct Square: Shape { var side: Double; func area() -> Double { side * side } }
struct Circle: Shape { var r: Double; func area() -> Double { 3 * r * r } }
func makeShape(big: Bool) -> any Shape {
    if big { return Square(side: 10) }
    return Circle(r: 1)
}
let shapes: [any Shape] = [makeShape(big: true), makeShape(big: false)]
print(shapes.map { $0.area() })`,
        compiles: true,
        why: '`any Shape` is an existential: a box that can hold any conforming value, so different branches and a heterogeneous array are fine, at the cost of dynamic dispatch.',
      },
      {
        key: 'some-parameter',
        code: sw`protocol Shape { func area() -> Double }
struct Square: Shape { var side: Double; func area() -> Double { side * side } }
func describe(_ s: some Shape) -> String { "area \(s.area())" }
print(describe(Square(side: 3)))`,
        compiles: true,
        why: '`some Shape` in parameter position is shorthand for a generic parameter (`<S: Shape>(_ s: S)`): the caller chooses the concrete type.',
      },
      {
        key: 'associated-type-existential',
        code: sw`let a: any Equatable = 1
let b: any Equatable = 1
print(a == b)`,
        compiles: false,
        why: '`==` requires both operands to be the same concrete `Equatable` type, but two `any Equatable` boxes could hold different types (an `Int` and a `String`), so the compiler rejects the comparison. Use a concrete type or a generic `<T: Equatable>` when values must be compared.',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-extension-dispatch',
    4,
    'Only methods declared in the protocol itself are dynamically dispatched through the protocol type.',
    [
      {
        key: 'existential',
        code: sw`protocol Animal { func sound() -> String }
extension Animal {
    func sound() -> String { "..." }
    func describe() -> String { "generic animal" }
}
struct Cat: Animal {
    func sound() -> String { "meow" }
    func describe() -> String { "a cat" }
}
let pet: any Animal = Cat()
print(pet.sound(), pet.describe(), Cat().describe())`,
        correct: 'meow generic animal a cat',
        wrong: ['meow a cat a cat', '... generic animal a cat', 'meow generic animal generic animal'],
        why: '`sound()` is a requirement, so the call through `any Animal` uses `Cat`’s version. `describe()` exists only in the extension, so through the protocol type the call is resolved statically to the extension’s version; `Cat().describe()` on the concrete type uses `Cat`’s. Declare `describe()` in the protocol to make it overridable.',
      },
      {
        key: 'generic',
        code: sw`protocol Animal { func sound() -> String }
extension Animal {
    func intro() -> String { "I say " + sound() }
    func name() -> String { "animal" }
}
struct Dog: Animal {
    func sound() -> String { "woof" }
    func name() -> String { "dog" }
}
func show<T: Animal>(_ a: T) -> String { a.name() + ": " + a.intro() }
print(show(Dog()))`,
        correct: 'animal: I say woof',
        wrong: ['dog: I say woof', 'animal: I say ...', 'dog: I say ...'],
        why: 'Inside the generic function, `name()` is looked up on the protocol `Animal`, where only the extension version exists, so it returns `"animal"`. `intro()` calls `sound()`, a requirement, which dispatches to `Dog`.',
      },
    ],
  ),
  ...b.multi(
    'swift-protocol-oriented',
    5,
    'Consider what is a requirement, what is a default, and what the existential array allows.',
    [
      {
        key: 'discounts',
        question: 'Select every true statement about this program.',
        code: sw`protocol Discountable {
    var price: Double { get }
    func discounted(by percent: Double) -> Double
}
extension Discountable {
    func discounted(by percent: Double) -> Double { price * (1 - percent / 100) }
}
struct Book: Discountable { let price: Double }
struct GiftCard: Discountable {
    let price: Double
    func discounted(by percent: Double) -> Double { price }
}
let items: [any Discountable] = [Book(price: 20), GiftCard(price: 10)]
print(items.map { $0.discounted(by: 50) })`,
        correct: [
          'It prints `[10.0, 10.0]`',
          '`GiftCard` replaces the default because `discounted(by:)` is a protocol requirement',
          'A new type can conform by providing only `price`',
        ],
        wrong: [
          'If `discounted(by:)` were declared only in the extension, `GiftCard`’s version would still be used through `any Discountable`',
          '`[any Discountable]` requires every element to have the same concrete type',
          'The extension could add a stored property such as `var currency = "EUR"` to every conforming type',
        ],
        why: 'The book uses the default (20 at 50% off is 10.0); the gift card overrides it and stays 10.0. Requirements are dynamically dispatched; extension-only methods are not. Existential arrays hold mixed types. Extensions cannot add stored properties.',
      },
      {
        key: 'composition',
        question: 'Select every true statement about this design.',
        code: sw`protocol Named { var name: String { get } }
protocol Priced { var price: Int { get } }
struct Product: Named, Priced { let name: String; let price: Int }
func label(_ item: some Named & Priced) -> String { "\(item.name): \(item.price)" }
func total(_ items: [any Priced]) -> Int { items.reduce(0) { $0 + $1.price } }
let p = Product(name: "Mug", price: 8)
print(label(p), total([p, Product(name: "Pen", price: 2)]))`,
        correct: [
          '`some Named & Priced` accepts any single concrete type that conforms to both protocols',
          'Small protocols can be composed where needed instead of building a class hierarchy',
          'It prints `Mug: 8 10`',
        ],
        wrong: [
          '`Product` must inherit from a base class to conform to two protocols',
          '`total` can only accept `Product` values',
          'Protocol composition with `&` is only allowed for class-constrained protocols',
        ],
        why: 'Swift types can conform to any number of protocols, and `&` composes them for a parameter. `total` takes `[any Priced]`, so any conforming type works. This is the core of protocol-oriented design: small capabilities, composed and given defaults through extensions.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Generics

export const genericsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'swift-generic-functions',
    1,
    [
      'A generic function works for any type; the compiler infers the type parameter from the arguments.',
    ],
    [
      {
        key: 'first-or',
        code: sw`func firstOr<T>(_ items: [T], _ fallback: T) -> T {
    items.first ?? fallback
}
print(firstOr([3, 4], 0), firstOr([String](), "none"), firstOr([true], false))`,
        output: '3 none true',
        why: '`T` is inferred as `Int`, `String` and `Bool` in the three calls. One implementation serves every type while keeping full type safety.',
      },
      {
        key: 'two-params',
        code: sw`func swapped<A, B>(_ pair: (A, B)) -> (B, A) {
    (pair.1, pair.0)
}
let result = swapped((1, "one"))
print(result.0, result.1 + 1)`,
        output: 'one 2',
        why: 'With two type parameters, `A` is `Int` and `B` is `String`, so the result is `(String, Int)`. `result.1 + 1` compiles because the compiler knows `result.1` is an `Int`.',
      },
    ],
  ),
  ...b.compiles(
    'swift-generic-constraints',
    2,
    'Inside a generic function you can only use what the constraints promise about `T`.',
    [
      {
        key: 'max-unconstrained',
        code: sw`func largest<T>(_ items: [T]) -> T? {
    items.max()
}
print(largest([3, 9, 2]) ?? 0)`,
        compiles: false,
        why: '`max()` needs elements that can be compared, but an unconstrained `T` could be any type. Add a constraint: `func largest<T: Comparable>`.',
      },
      {
        key: 'max-comparable',
        code: sw`func largest<T: Comparable>(_ items: [T]) -> T? {
    items.max()
}
print(largest([3, 9, 2]) ?? 0, largest(["b", "a"]) ?? "")`,
        compiles: true,
        why: 'With `T: Comparable`, `max()` is available, and the function works for `Int`, `String` and any other comparable type.',
      },
      {
        key: 'equals-unconstrained',
        code: sw`func occurrences<T>(of value: T, in items: [T]) -> Int {
    items.filter { $0 == value }.count
}
print(occurrences(of: 2, in: [1, 2, 2]))`,
        compiles: false,
        why: '`==` requires `Equatable`. Even though every call might pass `Int`, the generic body is checked once for all possible `T`. Write `<T: Equatable>`.',
      },
    ],
  ),
  ...b.output(
    'swift-generic-types',
    2,
    [
      'A generic type is written once and specialized with a concrete type, such as `Stack<String>`.',
    ],
    [
      {
        key: 'stack',
        code: sw`struct Stack<Element> {
    private var items: [Element] = []
    mutating func push(_ x: Element) { items.append(x) }
    mutating func pop() -> Element? { items.popLast() }
    var top: Element? { items.last }
}
var s = Stack<String>()
s.push("a")
s.push("b")
let popped = s.pop()
print(popped!, s.top!, s.pop()!, s.pop() == nil)`,
        output: 'b a a true',
        why: '`pop` removes the last pushed element (`"b"`), leaving `"a"` on top. The next `pop` returns `"a"`, and popping an empty stack returns `nil` instead of crashing because `popLast()` is optional.',
      },
      {
        key: 'box-map',
        code: sw`struct Box<T> {
    let value: T
    func map<U>(_ transform: (T) -> U) -> Box<U> {
        Box<U>(value: transform(value))
    }
}
let b = Box(value: 21).map { $0 * 2 }.map { "\($0)!" }
print(b.value, type(of: b))`,
        output: '42! Box<String>',
        why: '`map` introduces its own type parameter `U`, so each call can change the contained type: the first `map` returns a `Box<Int>` holding `42`, the second a `Box<String>` holding `"42!"`.',
      },
    ],
  ),
  ...b.whichCompile(
    'swift-generic-constraint-fixes',
    3,
    'The compiler error "requires that \'T\' conform to \'Equatable\'" is fixed by constraining `T`, either in angle brackets or in a `where` clause.',
    [
      {
        key: 'contains',
        question: 'Which of these declarations of a generic `contains` function compile?',
        options: [
          'func contains<T>(_ items: [T], _ x: T) -> Bool { items.contains(x) }',
          'func contains<T: Equatable>(_ items: [T], _ x: T) -> Bool { items.contains(x) }',
          'func contains<T>(_ items: [T], _ x: T) -> Bool where T: Equatable { items.contains(x) }',
          'func contains<T: Hashable>(_ items: [T], _ x: T) -> Bool { Set(items).contains(x) }',
          'func contains(_ items: [some Equatable], _ x: some Equatable) -> Bool { items.contains(x) }',
        ],
        correct: [
          'func contains<T: Equatable>(_ items: [T], _ x: T) -> Bool { items.contains(x) }',
          'func contains<T>(_ items: [T], _ x: T) -> Bool where T: Equatable { items.contains(x) }',
          'func contains<T: Hashable>(_ items: [T], _ x: T) -> Bool { Set(items).contains(x) }',
        ],
        why: 'An unconstrained `T` cannot be compared. `T: Equatable` and `where T: Equatable` are equivalent; `Hashable` implies `Equatable` and also allows a `Set`. Two separate `some Equatable` parameters are two different hidden type parameters, so `x` need not have the array’s element type, and `contains(x)` fails.',
      },
      {
        key: 'where-extensions',
        question: 'Which lines compile after the extensions shown?',
        prelude: sw`extension Array where Element: Numeric {
    func total() -> Element { reduce(0, +) }
}
extension Sequence where Element == String {
    func lines() -> String { joined(separator: "|") }
}`,
        options: [
          'print([1, 2, 3].total())',
          'print([1.5, 2.5].total())',
          'print(["a"].total())',
          'print(["a", "b"].lines())',
          'print([1, 2].lines())',
        ],
        correct: ['print([1, 2, 3].total())', 'print([1.5, 2.5].total())', 'print(["a", "b"].lines())'],
        why: 'A constrained extension only adds methods to the types that meet its `where` clause. `total()` exists on arrays of numbers (`Int`, `Double`), and `lines()` only on sequences of `String`.',
      },
    ],
  ),
  ...b.blank(
    'swift-associated-types',
    4,
    'A protocol declares a placeholder type with `associatedtype`; each conforming type decides what it is.',
    [
      {
        key: 'keyword',
        prompt: 'Complete the protocol so each queue can choose its own element type.',
        template: sw`protocol Queue {
    {{blank:kw}} Element
    mutating func enqueue(_ e: Element)
    mutating func dequeue() -> Element?
}
struct IntQueue: Queue {
    var storage: [Int] = []
    mutating func enqueue(_ e: Int) { storage.append(e) }
    mutating func dequeue() -> Int? { storage.isEmpty ? nil : storage.removeFirst() }
}
var q = IntQueue()
q.enqueue(1)
q.enqueue(2)
print(q.dequeue()!)`,
        blanks: { kw: ['associatedtype'] },
        why: 'Protocols use `associatedtype`, not generic parameters. `IntQueue` never writes `typealias Element = Int`: the compiler infers it from the method signatures.',
      },
      {
        key: 'where-associated',
        prompt: 'Complete the constraint so `total` only accepts containers of `Int`.',
        template: sw`protocol Container {
    associatedtype Item
    var items: [Item] { get }
}
struct Shelf: Container { var items: [String] }
struct Scores: Container { var items: [Int] }
func total<C: Container>(_ c: C) -> Int where C.{{blank:a}} == Int {
    c.items.reduce(0, +)
}
print(total(Scores(items: [3, 4])))`,
        blanks: { a: ['Item'] },
        why: '`C.Item` names the associated type of the concrete container. Constraining it to `Int` lets the body use `+`, and calling `total(Shelf(...))` would be a compile error.',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-generic-overloads',
    5,
    'Overloads are chosen at compile time from what the compiler knows at the call site.',
    [
      {
        key: 'int-overload',
        code: sw`func describe<T>(_ value: T) -> String { "generic" }
func describe(_ value: Int) -> String { "Int" }
func wrapper<T>(_ value: T) -> String { describe(value) }
print(describe(5), wrapper(5))`,
        correct: 'Int generic',
        wrong: ['Int Int', 'generic generic', 'generic Int'],
        why: 'At the direct call the argument is known to be `Int`, so the more specific overload wins. Inside `wrapper`, the value has type `T`, and the call is resolved once for all `T`, so only the generic overload applies, even when `T` is `Int` at run time.',
      },
      {
        key: 'constrained-overload',
        code: sw`protocol Named { var name: String { get } }
struct User: Named { let name: String }
func label<T>(_ x: T) -> String { "thing" }
func label<T: Named>(_ x: T) -> String { "named \(x.name)" }
func show<T>(_ x: T) -> String { label(x) }
print(label(User(name: "A")), show(User(name: "A")))`,
        correct: 'named A thing',
        wrong: ['named A named A', 'thing thing', 'thing named A'],
        why: 'The direct call picks the more constrained overload because `User` is `Named`. Inside `show`, `T` has no `Named` constraint, so only the unconstrained `label` can be chosen. Generics are not specialized by re-running overload resolution at run time.',
      },
    ],
  ),
];
