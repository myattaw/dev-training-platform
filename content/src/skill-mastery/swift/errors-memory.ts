import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Error handling and memory management (ARC). Every snippet is compiled and
 * run by the real Swift runner. Deallocation examples release objects
 * explicitly (assigning nil) so the order of `deinit` output is deterministic.
 */

const b = programBuilders('swift');
const sw = String.raw;

// ---------------------------------------------------------------- Error handling

export const errorsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'swift-throwing-basics',
    1,
    [
      'When a function throws, the rest of the `do` block is skipped and the first matching `catch` runs.',
    ],
    [
      {
        key: 'withdraw',
        code: sw`enum BankError: Error { case insufficientFunds(needed: Int) }
func withdraw(_ amount: Int, from balance: Int) throws -> Int {
    guard amount <= balance else {
        throw BankError.insufficientFunds(needed: amount - balance)
    }
    return balance - amount
}
do {
    print(try withdraw(30, from: 100))
    print(try withdraw(80, from: 50))
    print("not reached")
} catch BankError.insufficientFunds(let needed) {
    print("short by \(needed)")
}`,
        output: '70\nshort by 30',
        why: 'The first call succeeds. The second throws, so the remaining statements in `do` are skipped and the `catch` pattern binds the associated value `30`.',
      },
      {
        key: 'propagate',
        code: sw`struct ParseError: Error { let line: Int }
func parse(_ lines: [String]) throws -> [Int] {
    var result: [Int] = []
    for (i, l) in lines.enumerated() {
        guard let n = Int(l) else { throw ParseError(line: i + 1) }
        result.append(n)
    }
    return result
}
func load() throws -> Int {
    let values = try parse(["4", "5", "six"])
    return values.reduce(0, +)
}
do {
    print(try load())
} catch let e as ParseError {
    print("bad line \(e.line)")
}`,
        output: 'bad line 3',
        why: '`load` does not catch the error, so `try parse(...)` propagates it to the caller. Any type conforming to `Error` can be thrown, including a struct carrying details such as the line number.',
      },
    ],
  ),
  ...b.compiles(
    'swift-try-required',
    1,
    'Every call that can throw must be marked with `try`, and the error must be handled or propagated.',
    [
      {
        key: 'missing-try',
        code: sw`enum NetError: Error { case offline }
func fetch() throws -> String { throw NetError.offline }
do {
    let page = fetch()
    print(page)
} catch {
    print("failed")
}`,
        compiles: false,
        why: 'A call to a throwing function must be written `try fetch()`. The `try` marks every point where control can jump to a `catch`, which makes error paths visible when reading the code.',
      },
      {
        key: 'not-propagated',
        code: sw`enum NetError: Error { case offline }
func fetch() throws -> String { throw NetError.offline }
func show() {
    let page = try fetch()
    print(page)
}
show()`,
        compiles: false,
        why: '`show` is not marked `throws` and does not catch the error, so `try fetch()` is not allowed there ("errors thrown from here are not handled"). Mark `show` as `throws`, wrap the call in `do`-`catch`, or use `try?`.',
      },
      {
        key: 'try-optional',
        code: sw`enum NetError: Error { case offline }
func fetch() throws -> String { throw NetError.offline }
func show() {
    let page = try? fetch()
    print(page ?? "no page")
}
show()`,
        compiles: true,
        why: '`try?` converts any error into `nil`, so `show` does not need to throw. The trade-off is that the error itself is lost.',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-try-variants',
    2,
    '`try?` turns an error into `nil`; a successful result becomes an Optional.',
    [
      {
        key: 'try-optional',
        code: sw`enum AgeError: Error { case negative }
func validate(_ age: Int) throws -> Int {
    if age < 0 { throw AgeError.negative }
    return age
}
let a = try? validate(30)
let b = try? validate(-1)
print(a as Any, b as Any)`,
        correct: 'Optional(30) nil',
        wrong: ['30 nil', 'Optional(30) negative', '30 AgeError.negative'],
        why: '`try?` wraps a successful result in an Optional and replaces any thrown error with `nil`. The error value (`negative`) is discarded, which is why `try?` should be used only when the reason for failure does not matter.',
      },
      {
        key: 'flattening',
        code: sw`func lookup(_ key: String) throws -> Int? {
    ["a": 1][key]
}
let found = try? lookup("a")
let missing = try? lookup("z")
print(found as Any, missing as Any)`,
        correct: 'Optional(1) nil',
        wrong: ['Optional(Optional(1)) Optional(nil)', '1 nil', 'Optional(1) Optional(nil)'],
        why: 'Since Swift 5, `try?` on an expression that is already Optional does not add another layer: the result is `Int?`, not `Int??`. So both "threw" and "returned nil" become plain `nil`.',
      },
    ],
  ),
  ...b.output(
    'swift-catch-clauses',
    3,
    [
      'Catch clauses are tried in order; a clause without a pattern catches everything and binds `error`.',
    ],
    [
      {
        key: 'order',
        code: sw`enum FormError: Error { case empty, tooShort(min: Int) }
struct ServerError: Error { let code: Int }
func submit(_ step: Int) throws {
    switch step {
    case 0: throw FormError.empty
    case 1: throw FormError.tooShort(min: 8)
    default: throw ServerError(code: 503)
    }
}
for step in 0...2 {
    do {
        try submit(step)
    } catch FormError.tooShort(let min) {
        print("at least \(min)")
    } catch is FormError {
        print("form error")
    } catch {
        print("other: \(error)")
    }
}`,
        output: 'form error\nat least 8\nother: ServerError(code: 503)',
        why: '`.empty` does not match the `tooShort` pattern but matches `is FormError`. `.tooShort` matches the first clause. `ServerError` falls to the final `catch`, where `error` is bound implicitly and prints its default description.',
      },
      {
        key: 'rethrow',
        code: sw`enum DBError: Error { case locked }
func save() throws { throw DBError.locked }
func saveWithLog() throws {
    do {
        try save()
    } catch {
        print("logging \(error)")
        throw error
    }
}
do {
    try saveWithLog()
    print("saved")
} catch DBError.locked {
    print("retry later")
}`,
        output: 'logging locked\nretry later',
        why: 'The inner `catch` logs and rethrows the same error, so the caller still sees `DBError.locked` and can match it. `saved` is never printed.',
      },
    ],
  ),
  ...b.fails(
    'swift-try-bang-crash',
    3,
    '`try!` is a promise that no error will be thrown; when one is, the program stops.',
    [
      {
        key: 'config',
        question: 'This program crashes. What is the cause, and the better fix?',
        code: sw`enum ConfigError: Error { case missing(String) }
func value(for key: String, in config: [String: String]) throws -> String {
    guard let v = config[key] else { throw ConfigError.missing(key) }
    return v
}
let config = ["host": "localhost"]
let host = try! value(for: "host", in: config)
let port = try! value(for: "port", in: config)
print(host, port)`,
        error: "Fatal error: 'try!' expression unexpectedly raised an error",
        correct:
          '`"port"` is missing, so the function throws and `try!` traps; handle it with `do`-`catch`, or `(try? ...) ?? "8080"` if a default is acceptable',
        wrong: [
          '`try!` converts the error to `nil`, and printing `nil` crashes',
          'The first `try!` fails because `"host"` is a `let` constant',
          'A function that throws cannot return a `String`',
        ],
        why: '`try!` disables error propagation and traps if an error is thrown at run time. Reserve it for errors that truly cannot happen (for example, a hard-coded valid input); for external data, handle the error.',
      },
      {
        key: 'parse',
        question: 'This program crashes. What is the cause?',
        code: sw`struct ValidationError: Error { let field: String }
func requirePositive(_ n: Int, _ field: String) throws -> Int {
    if n <= 0 { throw ValidationError(field: field) }
    return n
}
let quantities = [("apples", 3), ("pears", 0)]
for (name, qty) in quantities {
    print(name, try! requirePositive(qty, name))
}`,
        error: "Fatal error: 'try!' expression unexpectedly raised an error",
        correct: 'The quantity for `"pears"` is `0`, so `requirePositive` throws, and `try!` turns that into a crash',
        wrong: [
          '`try!` cannot be used inside a loop',
          'Tuples cannot be destructured in a `for` loop',
          '`ValidationError` must be an enum to be thrown',
        ],
        why: 'Any thrown error under `try!` is a fatal error that includes the error’s description. Use `do`-`catch` to report the invalid row and continue.',
      },
    ],
  ),
  ...b.compiles(
    'swift-typed-throws',
    4,
    'With typed throws, `throws(E)` declares the exact error type, and the compiler checks what is thrown.',
    [
      {
        key: 'exhaustive-catch',
        code: sw`enum ParseError: Error { case empty, notANumber(String) }
func parse(_ s: String) throws(ParseError) -> Int {
    if s.isEmpty { throw .empty }
    guard let n = Int(s) else { throw .notANumber(s) }
    return n
}
do {
    print(try parse("x"))
} catch {
    switch error {
    case .empty: print("empty")
    case .notANumber(let s): print("not a number: \(s)")
    }
}`,
        compiles: true,
        why: 'Because `parse` declares `throws(ParseError)`, the `error` in the `catch` block has type `ParseError` rather than `any Error`, so the `switch` can be exhaustive without a `default`, and `throw .empty` can use the short case syntax.',
      },
      {
        key: 'wrong-type',
        code: sw`enum ParseError: Error { case empty }
struct IOError: Error {}
func parse(_ s: String) throws(ParseError) -> Int {
    if s.isEmpty { throw IOError() }
    return s.count
}
print((try? parse("ab")) ?? 0)`,
        compiles: false,
        why: 'A function declared `throws(ParseError)` can only throw `ParseError`. Throwing `IOError` is a type mismatch. Use plain `throws` (which means `throws(any Error)`) or convert the error.',
      },
      {
        key: 'untyped-switch',
        code: sw`enum ParseError: Error { case empty, invalid }
func parse(_ s: String) throws -> Int {
    if s.isEmpty { throw ParseError.empty }
    return s.count
}
do {
    print(try parse(""))
} catch {
    switch error {
    case .empty: print("empty")
    case .invalid: print("invalid")
    }
}`,
        compiles: false,
        why: 'With an untyped `throws`, `error` is `any Error`, so `.empty` cannot be resolved and the switch could never be exhaustive. Either declare `throws(ParseError)` or cast: `catch let e as ParseError`.',
      },
    ],
  ),
  ...b.output(
    'swift-result-type',
    4,
    [
      '`Result<Success, Failure>` stores either a value or an error, so it can be passed around and handled later.',
      '`get()` turns a `Result` back into a throwing call.',
    ],
    [
      {
        key: 'switch-map',
        code: sw`enum LookupError: Error { case notFound }
func find(_ id: Int) -> Result<String, LookupError> {
    id == 1 ? .success("ana") : .failure(.notFound)
}
for id in [1, 2] {
    switch find(id).map({ $0.uppercased() }) {
    case .success(let name): print("found \(name)")
    case .failure(let error): print("error \(error)")
    }
}`,
        output: 'found ANA\nerror notFound',
        why: '`map` transforms only the success value; a failure passes through unchanged. Switching over the `Result` handles both cases explicitly.',
      },
      {
        key: 'catching-get',
        code: sw`struct TooLarge: Error {}
func check(_ n: Int) throws -> Int {
    if n > 10 { throw TooLarge() }
    return n * 2
}
let results = [3, 20].map { n in Result { try check(n) } }
var total = 0
for r in results {
    do { total += try r.get() } catch { print("skipped: \(error)") }
}
print(total)`,
        output: 'skipped: TooLarge()\n6',
        why: '`Result { try ... }` (the `catching` initializer) captures either the value or the thrown error. Later, `get()` returns the value or rethrows the stored error, so `20` is skipped and only `6` is added.',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-defer',
    5,
    '`defer` blocks run when the scope exits, by any path, in reverse order of declaration.',
    [
      {
        key: 'order-on-throw',
        code: sw`enum StepError: Error { case failed }
func process(_ log: inout [String]) throws {
    log.append("open")
    defer { log.append("close") }
    defer { log.append("flush") }
    throw StepError.failed
}
var log: [String] = []
do { try process(&log) } catch { log.append("caught") }
print(log.joined(separator: " "))`,
        correct: 'open flush close caught',
        wrong: ['open close flush caught', 'open caught', 'open caught flush close'],
        why: 'When `process` exits, even by throwing, its `defer` blocks run in reverse order (`flush` before `close`), before the caller’s `catch` runs. This makes `defer` the place for cleanup.',
      },
      {
        key: 'return-value',
        code: sw`struct Ticketer {
    var counter = 0
    mutating func next() -> Int {
        defer { counter += 1 }
        return counter
    }
}
var tickets = Ticketer()
let first = tickets.next()
let second = tickets.next()
print(first, second, tickets.counter)`,
        correct: '0 1 2',
        wrong: ['1 2 2', '0 0 2', '1 1 2'],
        why: 'The return value is evaluated before the `defer` block runs, so `next()` returns the old value and then increments. This is a handy (if subtle) way to write "return then advance".',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Memory management

export const memoryFamilies: readonly QuestionSource[] = [
  ...b.output(
    'swift-arc-deinit',
    1,
    [
      'ARC frees a class instance as soon as the last strong reference to it goes away, and then runs `deinit`.',
    ],
    [
      {
        key: 'nil',
        code: sw`final class FileHandle {
    let name: String
    init(_ name: String) { self.name = name; print("open \(name)") }
    deinit { print("close \(name)") }
}
var handle: FileHandle? = FileHandle("a.txt")
print("working")
handle = nil
print("done")`,
        output: 'open a.txt\nworking\nclose a.txt\ndone',
        why: 'Setting the only strong reference to `nil` drops the reference count to zero, so `deinit` runs immediately, before `done` is printed. Unlike garbage collection, ARC releases objects at a predictable point.',
      },
      {
        key: 'reassign',
        code: sw`final class Token {
    let id: Int
    init(_ id: Int) { self.id = id }
    deinit { print("free \(id)") }
}
var current: Token? = Token(1)
current = Token(2)
print("swapped")
current = nil`,
        output: 'free 1\nswapped\nfree 2',
        why: 'Assigning a new object releases the old one, so token `1` is freed as soon as the variable points to token `2`.',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-strong-references',
    2,
    'An object stays alive while any strong reference to it exists.',
    [
      {
        key: 'two-refs',
        code: sw`final class Log { var lines: [String] = [] }
final class Image {
    let log: Log
    init(log: Log) { self.log = log }
    deinit { log.lines.append("freed") }
}
let log = Log()
var a: Image? = Image(log: log)
var b = a
a = nil
log.lines.append("a cleared")
b = nil
log.lines.append("b cleared")
print(log.lines.joined(separator: ", "))`,
        correct: 'a cleared, freed, b cleared',
        wrong: ['freed, a cleared, b cleared', 'a cleared, b cleared, freed', 'a cleared, b cleared'],
        why: '`b` holds a second strong reference, so clearing `a` only lowers the count to one. The object is freed when `b` is cleared too.',
      },
      {
        key: 'array',
        code: sw`final class Log { var lines: [String] = [] }
final class Job {
    let n: Int
    let log: Log
    init(_ n: Int, log: Log) { self.n = n; self.log = log }
    deinit { log.lines.append("job \(n) freed") }
}
let log = Log()
var queue = [Job(1, log: log), Job(2, log: log)]
var running: Job? = queue[0]
queue.removeAll()
log.lines.append("queue empty")
running = nil
print(log.lines.joined(separator: ", "))`,
        correct: 'job 2 freed, queue empty, job 1 freed',
        wrong: [
          'queue empty, job 1 freed, job 2 freed',
          'job 1 freed, job 2 freed, queue empty',
          'queue empty, job 1 freed',
        ],
        why: 'An array holds strong references to its elements. Emptying it frees job 2, but job 1 is still referenced by `running`, so it is freed only when `running` is cleared.',
      },
    ],
  ),
  ...b.compiles(
    'swift-weak-unowned-rules',
    2,
    '`weak` references must be optional variables of a class type; `unowned` references are non-optional.',
    [
      {
        key: 'weak-non-optional',
        code: sw`final class Owner {}
final class Pet {
    weak var owner: Owner
    init(owner: Owner) { self.owner = owner }
}
print(Pet(owner: Owner()).owner)`,
        compiles: false,
        why: 'A `weak` reference is set to `nil` automatically when the object is freed, so it must be an Optional `var`: `weak var owner: Owner?`.',
      },
      {
        key: 'weak-struct',
        code: sw`struct Settings { var dark = false }
final class Screen {
    weak var settings: Settings?
}
print(Screen().settings == nil)`,
        compiles: false,
        why: '`weak` only applies to class (reference) types. A struct is stored by value, so there is no shared object to reference weakly.',
      },
      {
        key: 'unowned',
        code: sw`final class Customer {
    var card: Card?
    deinit { print("customer freed") }
}
final class Card {
    unowned let holder: Customer
    init(holder: Customer) { self.holder = holder }
}
var c: Customer? = Customer()
c!.card = Card(holder: c!)
c = nil`,
        compiles: true,
        why: '`unowned` is non-optional and can be a `let`; it does not keep the customer alive, so clearing `c` frees the customer (and its card). Use `unowned` when the other object always outlives this one.',
      },
    ],
  ),
  ...b.output(
    'swift-retain-cycle',
    3,
    [
      'Two objects holding strong references to each other keep each other alive.',
      'Making one side `weak` breaks the cycle.',
    ],
    [
      {
        key: 'cycle',
        code: sw`final class Person {
    var apartment: Apartment?
    deinit { print("person freed") }
}
final class Apartment {
    var tenant: Person?
    deinit { print("apartment freed") }
}
var p: Person? = Person()
var a: Apartment? = Apartment()
p!.apartment = a
a!.tenant = p
p = nil
a = nil
print("end")`,
        output: 'end',
        why: 'After both variables are cleared, the person and the apartment still reference each other strongly, so neither count reaches zero and neither `deinit` runs: a memory leak.',
      },
      {
        key: 'weak-breaks',
        code: sw`final class Person {
    var apartment: Apartment?
    deinit { print("person freed") }
}
final class Apartment {
    weak var tenant: Person?
    deinit { print("apartment freed") }
}
var p: Person? = Person()
var a: Apartment? = Apartment()
p!.apartment = a
a!.tenant = p
p = nil
a = nil
print("end")`,
        output: 'person freed\napartment freed\nend',
        why: 'The tenant reference is `weak`, so clearing `p` frees the person. Its `apartment` reference goes away with it, leaving only `a`, and clearing `a` frees the apartment.',
      },
    ],
  ),
  ...b.outputChoice(
    'swift-weak-becomes-nil',
    3,
    'A `weak` reference does not keep its object alive and becomes `nil` when the object is freed.',
    [
      {
        key: 'observer',
        code: sw`final class Listener { let id = 7 }
final class Button { weak var listener: Listener? }
let button = Button()
var listener: Listener? = Listener()
button.listener = listener
let before = button.listener?.id
listener = nil
print(before as Any, button.listener as Any)`,
        correct: 'Optional(7) nil',
        wrong: ['Optional(7) Optional(Listener)', '7 7', 'nil nil'],
        why: 'While `listener` holds the object, the weak property can reach it. Once the last strong reference is cleared, the object is freed and the weak reference is set to `nil` automatically.',
      },
      {
        key: 'weak-only',
        code: sw`final class Log { var lines: [String] = [] }
final class Cache {
    let log: Log
    init(log: Log) { self.log = log }
    deinit { log.lines.append("cache freed") }
}
final class Service { weak var cache: Cache? }
let log = Log()
let s = Service()
s.cache = Cache(log: log)
log.lines.append("is nil: \(s.cache == nil)")
print(log.lines.joined(separator: ", "))`,
        correct: 'cache freed, is nil: true',
        wrong: ['is nil: false', 'is nil: false, cache freed', 'is nil: true'],
        why: 'The new `Cache` is only referenced weakly, so it is freed right after the assignment (the compiler even warns about this) and the property is already `nil`. A weak reference alone never keeps an object alive.',
      },
    ],
  ),
  ...b.output(
    'swift-closure-capture-cycle',
    4,
    [
      'A closure stored by an object that captures `self` strongly creates a cycle.',
      '`[weak self]` captures a weak reference instead.',
    ],
    [
      {
        key: 'strong-self',
        code: sw`final class Timer {
    var onTick: (() -> Void)?
    var ticks = 0
    func start() {
        onTick = { self.ticks += 1 }
    }
    deinit { print("timer freed") }
}
var t: Timer? = Timer()
t!.start()
t!.onTick!()
print(t!.ticks)
t = nil
print("end")`,
        output: '1\nend',
        why: 'The timer stores the closure, and the closure captures `self` strongly. Clearing `t` leaves that cycle in place, so `deinit` never runs.',
      },
      {
        key: 'weak-self',
        code: sw`final class Timer {
    var onTick: (() -> Void)?
    var ticks = 0
    func start() {
        onTick = { [weak self] in
            guard let self else { return }
            self.ticks += 1
        }
    }
    deinit { print("timer freed") }
}
var t: Timer? = Timer()
t!.start()
t!.onTick!()
print(t!.ticks)
t = nil
print("end")`,
        output: '1\ntimer freed\nend',
        why: 'With `[weak self]` the closure does not keep the timer alive, so clearing `t` frees it. `guard let self` upgrades to a strong reference only for the duration of each call.',
      },
      {
        key: 'non-escaping',
        code: sw`final class Report {
    var rows = [3, 1, 2]
    func sortedRows() -> [Int] {
        rows.sorted { a, b in self.rows.count > 0 && a < b }
    }
    deinit { print("report freed") }
}
var r: Report? = Report()
print(r!.sortedRows())
r = nil
print("end")`,
        output: '[1, 2, 3]\nreport freed\nend',
        why: 'The closure passed to `sorted` is non-escaping: it is not stored and finishes before `sortedRows` returns. Capturing `self` in it cannot create a lasting cycle, so `[weak self]` is unnecessary.',
      },
    ],
  ),
  ...b.multi(
    'swift-arc-concepts',
    4,
    'ARC counts references to class instances only.',
    [
      {
        key: 'statements',
        question: 'Select every true statement about ARC in Swift.',
        correct: [
          'Structs and enums are not reference counted themselves, although class instances they store are',
          'A retain cycle between two objects is not collected automatically',
          '`unowned` is appropriate only when the referenced object is guaranteed to outlive the reference',
        ],
        wrong: [
          'ARC periodically scans memory to find unreachable cycles, like a tracing garbage collector',
          '`weak` references keep an object alive until all weak references are also cleared',
          'Marking a class `final` prevents retain cycles',
        ],
        why: 'ARC is plain reference counting performed at compile-inserted retain and release points; it has no cycle collector, so cycles must be broken with `weak` or `unowned`. `weak` does not count toward keeping an object alive. `final` only affects subclassing.',
      },
      {
        key: 'choosing',
        question: 'Select every reasonable choice for avoiding leaks.',
        correct: [
          'A child view model referencing its parent coordinator with `weak var parent`',
          'A stored completion handler using `[weak self]` when it refers to its owner',
          'A delegate property declared `weak var delegate: SomeDelegate?` with a class-constrained protocol',
        ],
        wrong: [
          'Adding `[weak self]` to every closure, including `map` and `filter` calls',
          'Declaring a parent’s array of children as `weak`',
          'Using `unowned` for a reference that may outlive its target, to avoid unwrapping',
        ],
        why: 'Break cycles on the back-reference (child to parent, delegate to owner, stored closure to owner). Non-escaping closures such as `map` cannot form cycles. Parents usually own children strongly. `unowned` to an object that may already be gone crashes when accessed.',
      },
    ],
  ),
  ...b.fails(
    'swift-unowned-crash',
    5,
    'Reading an `unowned` reference after its object was freed is a runtime error.',
    [
      {
        key: 'outlived',
        question: 'This program crashes. What is the cause?',
        code: sw`final class Session {
    let user = "kim"
}
final class Request {
    unowned let session: Session
    init(session: Session) { self.session = session }
    func describe() -> String { "request for \(session.user)" }
}
var session: Session? = Session()
let request = Request(session: session!)
print(request.describe())
session = nil
print(request.describe())`,
        error: 'Fatal error: Attempted to read an unowned reference but object',
        correct:
          'The request outlives the session; after the session is freed, reading the `unowned` reference traps. Use `weak var session: Session?` instead',
        wrong: [
          '`unowned` keeps the session alive, so `session = nil` fails',
          'The `let` constant `request` cannot call a method twice',
          'Reading a freed `unowned` reference returns `nil`, and string interpolation of `nil` crashes',
        ],
        why: '`unowned` promises the object will outlive the reference. When that promise is broken, Swift traps deterministically rather than reading freed memory. `weak` is the safe choice when the lifetime is not guaranteed; it becomes `nil` instead.',
      },
      {
        key: 'closure-unowned',
        question: 'This program crashes. What is the cause?',
        code: sw`final class Downloader {
    let url = "a.zip"
    func makeLabel() -> () -> String {
        return { [unowned self] in "downloading \(self.url)" }
    }
}
var d: Downloader? = Downloader()
let label = d!.makeLabel()
print(label())
d = nil
print(label())`,
        error: 'Fatal error: Attempted to read an unowned reference but object',
        correct:
          'The closure outlives the downloader; `[unowned self]` does not keep it alive, so calling the closure after `d = nil` traps',
        wrong: [
          '`[unowned self]` creates a retain cycle that prevents `d = nil`',
          'Closures cannot be called twice',
          '`self.url` is a `let`, which `unowned` cannot read',
        ],
        why: 'Use `[unowned self]` only when the closure cannot outlive `self`. Here it is returned and called later, so `[weak self]` (with an explicit fallback when `self` is gone) is the right capture.',
      },
    ],
  ),
];
