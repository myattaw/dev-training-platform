import type { QuestionSource } from '@pracstack/content-model';
import { plain } from '../helpers';
import { programBuilders } from '../program-builders';

/*
 * Swift concurrency, and testing and debugging. Every Swift snippet is compiled
 * (in the Swift 6 language mode, with strict concurrency checking) and run by
 * the real Swift runner. Concurrent results are sorted or awaited in a fixed
 * order so the output never depends on scheduling.
 *
 * The Swift Testing and XCTest APIs named in the testing questions are not
 * available to single-file programs; they were verified separately with
 * `swift test` on the Swift 6.4.3 toolchain.
 */

const b = programBuilders('swift');
const sw = String.raw;

// ---------------------------------------------------------------- Concurrency

export const concurrencyFamilies: readonly QuestionSource[] = [
  ...b.output(
    'swift-async-await',
    1,
    [
      '`await` marks a point where the function may suspend; the next line runs only after the awaited call returns.',
    ],
    [
      {
        key: 'sequential',
        code: sw`func fetchUser(id: Int) async -> String { "user\(id)" }
func fetchScore(for user: String) async -> Int { user.count * 10 }
let user = await fetchUser(id: 7)
let score = await fetchScore(for: user)
print(user, score)`,
        output: 'user7 50',
        why: 'Each `await` waits for its call to finish, so the second call can use the first result. Code reads top to bottom like synchronous code, without callbacks.',
      },
      {
        key: 'throwing',
        code: sw`enum NetError: Error { case timeout }
func load(_ ok: Bool) async throws -> String {
    if !ok { throw NetError.timeout }
    return "data"
}
do {
    print(try await load(true))
    print(try await load(false))
    print("unreachable")
} catch {
    print("error: \(error)")
}`,
        output: 'data\nerror: timeout',
        why: 'An `async throws` function is called with `try await` (in that order). Errors propagate exactly as in synchronous code, so the second call jumps to `catch`.',
      },
    ],
  ),
  ...b.compiles(
    'swift-await-rules',
    2,
    'Async functions can only be called with `await`, from an asynchronous context.',
    [
      {
        key: 'missing-await',
        code: sw`func download() async -> Int { 42 }
func run() async {
    let size = download()
    print(size)
}
await run()`,
        compiles: false,
        why: "Calling an `async` function requires `await` (\"expression is 'async' but is not marked with 'await'\"). The keyword makes every possible suspension point visible.",
      },
      {
        key: 'sync-context',
        code: sw`func download() async -> Int { 42 }
func onButtonTap() {
    let size = await download()
    print(size)
}
onButtonTap()`,
        compiles: false,
        why: '`onButtonTap` is synchronous, so it cannot suspend: "\'async\' call in a function that does not support concurrency". Make it `async`, or start a `Task { ... }` inside it.',
      },
      {
        key: 'task',
        code: sw`func download() async -> Int { 42 }
func onButtonTap() -> Task<Int, Never> {
    Task {
        await download()
    }
}
let size = await onButtonTap().value
print(size)`,
        compiles: true,
        why: 'A `Task` creates a new asynchronous context from synchronous code. Awaiting its `value` later gives the result.',
      },
    ],
  ),
  ...b.output(
    'swift-async-let',
    3,
    ['`async let` starts a child task immediately; you `await` the value when you need it.'],
    [
      {
        key: 'parallel-prices',
        code: sw`func price(_ item: String) async -> Int { item.count * 100 }
func basketTotal() async -> Int {
    async let tea = price("tea")
    async let coffee = price("coffee")
    return await tea + coffee
}
print(await basketTotal())`,
        output: '900',
        why: 'Both child tasks start right away and can run concurrently. `await tea + coffee` waits for both: `300 + 600`. With plain `let x = await ...` lines, the second call would only start after the first finished.',
      },
      {
        key: 'tuple',
        code: sw`struct Profile { let name: String }
func loadProfile() async -> Profile { Profile(name: "Ana") }
func loadFriends() async -> [String] { ["Bo", "Cy"] }
func screen() async -> String {
    async let profile = loadProfile()
    async let friends = loadFriends()
    let (p, f) = await (profile, friends)
    return "\(p.name) has \(f.count) friends"
}
print(await screen())`,
        output: 'Ana has 2 friends',
        why: 'Several `async let` values can be awaited together as a tuple. The result is the same whichever child task finishes first.',
      },
    ],
  ),
  ...b.output(
    'swift-task-groups',
    3,
    [
      'A task group runs a dynamic number of child tasks and yields results as they finish.',
      'Results arrive in completion order, so sort them (or carry an index) when order matters.',
    ],
    [
      {
        key: 'sorted',
        code: sw`func square(_ n: Int) async -> Int { n * n }
func squares(_ ns: [Int]) async -> [Int] {
    await withTaskGroup(of: Int.self) { group in
        for n in ns {
            group.addTask { await square(n) }
        }
        var results: [Int] = []
        for await r in group { results.append(r) }
        return results.sorted()
    }
}
print(await squares([3, 1, 2]))`,
        output: '[1, 4, 9]',
        why: 'Each `addTask` starts a child task. `for await` collects results in whatever order they complete, so the function sorts them before returning. The group does not return until every child has finished.',
      },
      {
        key: 'indexed',
        code: sw`func shout(_ s: String) async -> String { s.uppercased() + "!" }
func shoutAll(_ words: [String]) async -> [String] {
    await withTaskGroup(of: (Int, String).self) { group in
        for (i, w) in words.enumerated() {
            group.addTask { (i, await shout(w)) }
        }
        var pairs: [(Int, String)] = []
        for await pair in group { pairs.append(pair) }
        return pairs.sorted { $0.0 < $1.0 }.map { $0.1 }
    }
}
print(await shoutAll(["hi", "yo", "ok"]))`,
        output: '["HI!", "YO!", "OK!"]',
        why: 'To keep the input order, each child returns its index with its result, and the results are sorted by index afterwards.',
      },
      {
        key: 'throwing',
        code: sw`struct BadInput: Error { let value: Int }
func validate(_ n: Int) async throws -> Int {
    if n < 0 { throw BadInput(value: n) }
    return n
}
func sum(_ ns: [Int]) async throws -> Int {
    try await withThrowingTaskGroup(of: Int.self) { group in
        for n in ns { group.addTask { try await validate(n) } }
        var total = 0
        for try await v in group { total += v }
        return total
    }
}
do {
    print(try await sum([1, 2, 3]))
    print(try await sum([1, -4, 3]))
} catch let e as BadInput {
    print("bad input \(e.value)")
}`,
        output: '6\nbad input -4',
        why: 'In a throwing task group, `for try await` rethrows a child’s error; the group then cancels the remaining children and the error propagates out of `withThrowingTaskGroup`.',
      },
    ],
  ),
  ...b.compiles(
    'swift-actor-isolation',
    3,
    'Outside an actor, its state can only be reached asynchronously, and its properties cannot be set directly.',
    [
      {
        key: 'read-without-await',
        code: sw`actor BankAccount {
    var balance = 100
    func deposit(_ amount: Int) { balance += amount }
}
let account = BankAccount()
print(account.balance)`,
        compiles: false,
        why: 'Reading actor-isolated state from outside requires `await`, because the caller may have to wait for the actor. `print(await account.balance)` compiles.',
      },
      {
        key: 'await-method',
        code: sw`actor BankAccount {
    var balance = 100
    func deposit(_ amount: Int) { balance += amount }
}
let account = BankAccount()
await account.deposit(50)
print(await account.balance)`,
        compiles: true,
        why: 'From outside the actor, calls and reads are made with `await`. Inside `deposit`, the actor’s own state is used synchronously, without `await`.',
      },
      {
        key: 'mutate-outside',
        code: sw`actor BankAccount {
    var balance = 100
}
func topUp(_ account: BankAccount) async {
    await account.balance += 50
}
let account = BankAccount()
await topUp(account)
print(await account.balance)`,
        compiles: false,
        why: 'Actor properties cannot be mutated from outside the actor, even with `await` ("actor-isolated property \'balance\' can not be mutated from a nonisolated context"). Add a method such as `deposit(_:)` so every change runs inside the actor, one at a time.',
      },
    ],
  ),
  ...b.output(
    'swift-actor-serialization',
    4,
    [
      'An actor runs one piece of its isolated code at a time, so increments from many tasks do not race.',
    ],
    [
      {
        key: 'counter',
        code: sw`actor Counter {
    private(set) var value = 0
    func increment() { value += 1 }
}
let counter = Counter()
await withTaskGroup(of: Void.self) { group in
    for _ in 0..<100 {
        group.addTask { await counter.increment() }
    }
}
print(await counter.value)`,
        output: '100',
        why: 'The 100 child tasks may run in parallel, but each `increment()` runs on the actor exclusively, so no update is lost. With a plain class and no synchronization, concurrent `value += 1` would be a data race.',
      },
      {
        key: 'ledger',
        code: sw`actor Ledger {
    private var balances: [String: Int] = [:]
    func credit(_ name: String, _ amount: Int) { balances[name, default: 0] += amount }
    func report() -> [String] {
        balances.keys.sorted().map { "\($0)=\(balances[$0]!)" }
    }
}
let ledger = Ledger()
await withTaskGroup(of: Void.self) { group in
    for i in 1...10 {
        group.addTask { await ledger.credit(i.isMultiple(of: 2) ? "even" : "odd", i) }
    }
}
print(await ledger.report())`,
        output: '["even=30", "odd=25"]',
        why: 'All credits go through the actor, so the dictionary is never modified concurrently. Even numbers 2 to 10 sum to 30 and odd ones to 25; the keys are sorted because dictionary order is not stable.',
      },
    ],
  ),
  ...b.output(
    'swift-task-cancellation',
    4,
    [
      'Cancellation is cooperative: a task is only marked as cancelled, and code must check for it.',
      '`Task.sleep` throws `CancellationError` when the task is cancelled.',
    ],
    [
      {
        key: 'sleep',
        code: sw`let download = Task {
    try await Task.sleep(for: .seconds(30))
    return "downloaded"
}
download.cancel()
do {
    print(try await download.value)
} catch is CancellationError {
    print("cancelled")
}`,
        output: 'cancelled',
        why: '`cancel()` marks the task as cancelled. `Task.sleep` checks for cancellation and throws `CancellationError` immediately instead of waiting 30 seconds, and awaiting `value` rethrows that error.',
      },
      {
        key: 'is-cancelled',
        code: sw`func export(rows: Int) async -> String {
    try? await Task.sleep(for: .seconds(30))
    return Task.isCancelled ? "partial export" : "exported \(rows) rows"
}
let job = Task { await export(rows: 500) }
job.cancel()
print(await job.value)`,
        output: 'partial export',
        why: '`try?` swallows the `CancellationError` from `sleep`, so the function keeps running, but `Task.isCancelled` is `true`. Code that ignores cancellation keeps going; checking it lets work stop early or return a partial result.',
      },
    ],
  ),
  ...b.multi(
    'swift-task-group-order',
    4,
    'Think about which parts of concurrent code are guaranteed and which depend on scheduling.',
    [
      {
        key: 'statements',
        question: 'Select every true statement about this program.',
        code: sw`func fetch(_ id: Int) async -> String { "item\(id)" }
let ids = [3, 1, 2]
let items = await withTaskGroup(of: String.self) { group in
    for id in ids { group.addTask { await fetch(id) } }
    var collected: [String] = []
    for await item in group { collected.append(item) }
    return collected
}
print(items.sorted())`,
        correct: [
          'Without `.sorted()`, the order of `items` could differ between runs',
          'All three child tasks have finished when `withTaskGroup` returns',
          '`items.count` is always 3',
        ],
        wrong: [
          'Results are always yielded in the order the tasks were added',
          'The child tasks run one after another, never concurrently',
          '`withTaskGroup` returns as soon as the first child finishes',
        ],
        why: 'Task groups yield results in completion order, which depends on scheduling. Structured concurrency guarantees that the group waits for every child before returning, so the count is always 3. Sorting gives a stable result.',
      },
      {
        key: 'async-misconceptions',
        question: 'Select every true statement about `async` and `await` in Swift.',
        correct: [
          'An `async` function can only be called from an asynchronous context, such as another `async` function or a `Task`',
          'At an `await`, the current task may suspend and let other work run on the same thread',
          '`async let` and task groups are ways to run child tasks concurrently',
        ],
        wrong: [
          'Two `await` calls written on consecutive lines run in parallel',
          '`await` blocks the thread until the result is ready',
          'Every `async` function creates a new `Task`',
        ],
        why: 'Consecutive `await`s run sequentially; concurrency comes from `async let`, task groups or new tasks. Suspension releases the thread instead of blocking it. Calling an `async` function does not create a task: it runs as part of the caller’s task, which is why a synchronous function needs a `Task { }` to start async work.',
      },
    ],
  ),
  ...b.compiles(
    'swift-data-race-safety',
    5,
    'Swift 6 rejects shared mutable state that is not protected by an actor, immutability or `Sendable` value semantics.',
    [
      {
        key: 'global-var',
        code: sw`struct Config {
    static var retries = 3
}
func configure() {
    Config.retries = 5
}
configure()
print(Config.retries)`,
        compiles: false,
        why: 'Swift 6 reports "static property \'retries\' is not concurrency-safe because it is nonisolated global shared mutable state": any thread could read and write it. Make it immutable (`static let`), isolate it to a global actor such as `@MainActor`, or, as a last resort, opt out with `nonisolated(unsafe)`. Marking the struct `Sendable` does not help, because the problem is the storage, not the type.',
      },
      {
        key: 'global-let',
        code: sw`struct Config {
    static let retries = 3
}
func describe() -> String {
    "retries: \(Config.retries)"
}
print(describe())`,
        compiles: true,
        why: 'An immutable static of a `Sendable` type (`Int`) can be read from any thread without a race, so Swift 6 accepts it from a nonisolated function.',
      },
      {
        key: 'sendable-class',
        code: sw`final class Stats: Sendable {
    var hits = 0
}
struct Point: Sendable { var x = 0, y = 0 }
print(Stats().hits, Point().x)`,
        compiles: false,
        why: "Swift 6 reports \"stored property 'hits' of 'Sendable'-conforming class 'Stats' is mutable\". A class instance is shared by reference, so a `Sendable` class must be `final` with only immutable, `Sendable` stored properties. `Point` is fine: sending a struct copies it, so `var` properties are safe there.",
      },
      {
        key: 'sending-value',
        code: sw`final class Logger { var lines: [String] = [] }
actor Store {
    func attach(_ l: Logger) {}
}
func setUp() async {
    let store = Store()
    let logger = Logger()
    await store.attach(logger)
    logger.lines.append("ready")
}
await setUp()
print("done")`,
        compiles: false,
        why: 'Swift 6 reports "sending \'logger\' risks causing data races". `Logger` is a non-`Sendable` class: once it is handed to the actor, the function keeps using it, so two isolation domains could touch the same object at once. Sending it without using it afterwards, making `Logger` an actor, or making it `Sendable` removes the error.',
      },
      {
        key: 'sending-unused-after',
        code: sw`final class Logger { var lines: [String] = [] }
actor Store {
    var count = 0
    func attach(_ l: Logger) { count += l.lines.count }
}
func setUp() async {
    let store = Store()
    let logger = Logger()
    logger.lines.append("ready")
    await store.attach(logger)
    print(await store.count)
}
await setUp()`,
        compiles: true,
        why: 'The non-`Sendable` `logger` is created and filled locally, then handed to the actor and never used again by the caller. Swift 6 region-based isolation proves no concurrent access is possible, so this compiles.',
      },
    ],
  ),
  ...b.codeChoice(
    'swift-actor-reentrancy',
    5,
    'An actor runs one task at a time, but only between suspension points.',
    [
      {
        key: 'cache',
        question:
          'Two tasks call `image(for: "a.png")` at the same time on an empty cache. What can happen?',
        code: sw`func fetchImage(_ url: String) async -> String { "image:" + url }
actor ImageCache {
    private var cache: [String: String] = [:]
    private(set) var downloads = 0
    func image(for url: String) async -> String {
        if let cached = cache[url] { return cached }
        downloads += 1
        let image = await fetchImage(url)
        cache[url] = image
        return image
    }
}
let cache = ImageCache()
let a = await cache.image(for: "a.png")
let b = await cache.image(for: "a.png")
print(a == b, await cache.downloads)`,
        correct:
          'Both may miss the cache and download, because while one call is suspended at `await fetchImage`, the actor can start the other call',
        wrong: [
          'That is impossible: an actor runs each method to completion before starting another call',
          'The program deadlocks, because the actor awaits while isolated',
          'The second call waits until the first call returns, so `downloads` is always 1',
        ],
        why: 'Actors are reentrant: at every `await` inside an actor method, other calls may run, and the state may change before the method resumes. Here the sequential calls download once, but concurrent callers could both pass the cache check. A common fix stores an in-flight `Task` in the cache before awaiting, so later callers await the same task.',
      },
      {
        key: 'balance-check',
        question:
          'Why is this `withdraw` unsafe if `approve` is ever called concurrently, even though `Wallet` is an actor?',
        code: sw`func approve(_ amount: Int) async -> Bool { amount < 1_000 }
actor Wallet {
    private(set) var balance = 100
    func withdraw(_ amount: Int) async -> Bool {
        guard balance >= amount else { return false }
        guard await approve(amount) else { return false }
        balance -= amount
        return true
    }
}
let wallet = Wallet()
print(await wallet.withdraw(80), await wallet.withdraw(80), await wallet.balance)`,
        correct:
          'The balance is checked before the `await`, and another withdrawal can run during the suspension, so both could pass the check and overdraw',
        wrong: [
          'Actors cannot call global async functions',
          '`balance -= amount` is a data race that the actor does not protect',
          'The guard statements make the method non-isolated',
        ],
        why: 'Each synchronous stretch of actor code is exclusive, but an `await` splits the method into separate stretches. Re-check state after the `await` (or perform the check and the update without an `await` between them).',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Testing and debugging

export const testingFamilies: readonly QuestionSource[] = [
  ...b.output(
    'swift-print-debugging',
    1,
    [
      '`print` separates items with a space and ends with a newline unless you pass `separator:` or `terminator:`.',
      '`debugPrint` shows the debug description, which quotes strings.',
    ],
    [
      {
        key: 'separator',
        code: sw`let name = "Ann"
let items = ["a", "b"]
print("name:", name, "count:", items.count, separator: " | ")
print("loading", terminator: "...")
print("done")
debugPrint(name)
print(name, items)`,
        output: 'name: | Ann | count: | 2\nloading...done\n"Ann"\nAnn ["a", "b"]',
        why: '`separator:` replaces the space between items; `terminator:` replaces the newline, so `done` continues the same line. `debugPrint` quotes the string, and arrays always show their elements’ debug form, which is why `["a", "b"]` has quotes while `Ann` does not.',
      },
      {
        key: 'description',
        code: sw`struct Money: CustomStringConvertible {
    let cents: Int
    var description: String { "\(cents / 100).\(cents % 100) USD" }
}
let price = Money(cents: 1250)
print(price)
print("Total: \(price)")`,
        output: '12.50 USD\nTotal: 12.50 USD',
        why: 'Conforming to `CustomStringConvertible` controls how `print` and string interpolation show a value. Without it, a struct prints as its type name and stored properties.',
      },
    ],
  ),
  ...b.fails(
    'swift-runtime-checks',
    2,
    '`precondition` and `fatalError` stop the program on purpose when an assumption is broken.',
    [
      {
        key: 'fatal-error',
        question: 'This program stops with a fatal error. What is the best change?',
        code: sw`func title(for path: String) -> String {
    switch path {
    case "/": return "Home"
    case "/settings": return "Settings"
    default: fatalError("unknown path \(path)")
    }
}
print(title(for: "/"))
print(title(for: "/profile"))`,
        error: 'Fatal error: unknown path /profile',
        correct:
          'Unknown paths are valid input here, so return an Optional (or throw) instead of calling `fatalError`',
        wrong: [
          'Wrap the call in `do`-`catch` to catch the fatal error',
          'Replace `fatalError` with `assert(false)` so release builds keep running and return nothing',
          'Use `try?` when calling `title(for:)`',
        ],
        why: '`fatalError` cannot be caught: it always stops the process. It is for states that indicate a programmer error. Input from users or the network should be handled with Optionals or thrown errors.',
      },
      {
        key: 'precondition',
        question: 'This program crashes. What is the cause?',
        code: sw`func withdraw(_ amount: Int, from balance: Int) -> Int {
    precondition(amount > 0, "amount must be positive")
    return balance - amount
}
print(withdraw(20, from: 100))
print(withdraw(-5, from: 100))`,
        error: 'The program crashed',
        correct: 'The second call breaks the precondition `amount > 0`, which stops the program',
        wrong: [
          '`precondition` is only checked in release builds, so the crash comes from the subtraction',
          'The first call fails because `100 - 20` overflows',
          '`precondition` throws an error that `print` cannot handle',
        ],
        why: 'A failed `precondition` traps in debug and optimized builds alike (only `-Ounchecked` removes it). Use it for caller contract violations; if negative amounts can legitimately arrive, validate and throw instead.',
      },
    ],
  ),
  ...b.codeChoice(
    'swift-testable-design',
    2,
    'Code is easy to test when its result depends only on its inputs.',
    [
      {
        key: 'pure',
        question: 'Why is `shippingCost(for:)` easy to unit test?',
        code: sw`struct Order { let subtotal: Int; let isMember: Bool }
func shippingCost(for order: Order) -> Int {
    if order.subtotal >= 50 { return 0 }
    return order.isMember ? 2 : 5
}
let cases: [(Order, Int)] = [
    (Order(subtotal: 60, isMember: false), 0),
    (Order(subtotal: 10, isMember: true), 2),
    (Order(subtotal: 10, isMember: false), 5),
]
for (order, expected) in cases {
    assert(shippingCost(for: order) == expected)
}
print("all passed")`,
        correct:
          'It is a pure function: its result depends only on its argument and it has no side effects, so tests need no setup or fakes',
        wrong: [
          'Because it uses `assert`, which makes any function testable',
          'Because `Order` is a struct, every function that uses it is automatically testable',
          'Because it returns an `Int`; functions that return strings are hard to test',
        ],
        why: 'Pure functions can be tested with a table of inputs and expected outputs. Keeping business rules pure and pushing side effects (network, clock, storage) to the edges is the main design technique for testable Swift code.',
      },
      {
        key: 'hidden-clock',
        question: 'Which version of `greeting` is easier to test, and why?',
        code: sw`import Foundation

func greeting() -> String {
    let hour = Calendar.current.component(.hour, from: Date())
    return hour < 12 ? "Good morning" : "Good afternoon"
}
func greeting(hour: Int) -> String {
    hour < 12 ? "Good morning" : "Good afternoon"
}
print(greeting(hour: 9), greeting(hour: 15))`,
        correct:
          '`greeting(hour:)`, because the hidden dependency on the current time has become an input the test controls',
        wrong: [
          '`greeting()`, because it needs no arguments',
          'Both are equally easy, because tests can run at any time of day',
          '`greeting()`, because Foundation types are automatically mocked in tests',
        ],
        why: 'The first version gives different results depending on when the test runs, so its afternoon branch might never be exercised. Passing the hour (or injecting a clock) makes every branch reachable and the test deterministic.',
      },
    ],
  ),
  ...b.output(
    'swift-dependency-injection',
    3,
    [
      'Depend on a protocol, and pass in a real implementation in production and a fake one in tests.',
    ],
    [
      {
        key: 'clock',
        code: sw`protocol Clock { func now() -> Int }
struct FixedClock: Clock {
    let time: Int
    func now() -> Int { time }
}
struct SessionValidator {
    let clock: any Clock
    func isExpired(startedAt: Int, ttl: Int) -> Bool {
        clock.now() - startedAt > ttl
    }
}
let validator = SessionValidator(clock: FixedClock(time: 1_000))
print(validator.isExpired(startedAt: 900, ttl: 60), validator.isExpired(startedAt: 990, ttl: 60))`,
        output: 'true false',
        why: 'With a fixed clock the result is deterministic: `1000 - 900 = 100` exceeds the TTL, while `10` does not. In production, a real clock conforming to `Clock` is injected instead.',
      },
      {
        key: 'spy',
        code: sw`protocol Mailer { func send(to address: String, body: String) }
final class SpyMailer: Mailer {
    var sent: [String] = []
    func send(to address: String, body: String) { sent.append(address) }
}
struct Signup {
    let mailer: any Mailer
    func register(_ email: String) -> Bool {
        guard email.contains("@") else { return false }
        mailer.send(to: email, body: "Welcome")
        return true
    }
}
let spy = SpyMailer()
let signup = Signup(mailer: spy)
print(signup.register("ann@x.io"), signup.register("bad"), spy.sent)`,
        output: 'true false ["ann@x.io"]',
        why: 'The spy records calls so a test can check that exactly one welcome email was sent, and none for the invalid address. It is a class so that the test and `Signup` share the same recorded list.',
      },
    ],
  ),
  ...b.concept(
    'swift-compiler-diagnostics',
    3,
    'Read the diagnostic literally: it names the type or rule that is violated.',
    [
      {
        key: 'optional-unwrap',
        question: 'What is the best fix for this compiler error?',
        snippet: plain(`let stock = ["pen": 3]
let next: Int = stock["pen"] + 1

error: value of optional type 'Int?' must be unwrapped to a value of type 'Int'`),
        correct: 'Unwrap the lookup explicitly, for example `(stock["pen"] ?? 0) + 1`',
        wrong: [
          'Change the annotation to `let next: Int? = stock["pen"] + 1`',
          'Declare `stock` with `var`',
          'Add `as Int` after `stock["pen"]`',
        ],
        why: 'A dictionary lookup returns `Int?`, and `+` is not defined for Optionals. Changing the annotation does not help, because the addition itself is the problem. Decide what a missing key means and unwrap with `??`, `if let` or `guard let`.',
      },
      {
        key: 'immutable-self',
        question: 'What is the best fix for this compiler error?',
        snippet: plain(`struct Counter {
    var value = 0
    func reset() {
        value = 0
    }
}

error: cannot assign to property: 'self' is immutable`),
        correct: 'Mark the method `mutating func reset()`',
        wrong: [
          'Change `var value` to `let value`',
          'Write `self.value = 0` instead of `value = 0`',
          'Make `reset` a `static func`',
        ],
        why: 'In a struct, `self` is immutable inside non-mutating methods. `mutating` allows the method to change stored properties (and callers must then use a `var`). Adding `self.` changes nothing.',
      },
      {
        key: 'missing-return',
        question: 'What does this compiler error mean?',
        snippet: plain(`func label(for score: Int) -> String {
    if score > 50 {
        return "pass"
    }
}

error: missing return in global function expected to return 'String'`),
        correct:
          'When `score` is 50 or less, the function reaches its end without returning a `String`',
        wrong: [
          'The `return` statement must be outside the `if`',
          'Functions returning `String` must use string interpolation',
          'The function should be marked `throws`',
        ],
        why: 'Every path through a function with a non-`Void` return type must return a value (or throw, or call a function that never returns). Add `return "fail"` after the `if`, or use an `if`-`else` expression.',
      },
    ],
  ),
  ...b.compiles(
    'swift-definite-initialization',
    4,
    'The compiler proves that every constant and variable is assigned before it is read.',
    [
      {
        key: 'one-branch',
        code: sw`let isMember = Bool("true")!
let discount: Int
if isMember { discount = 10 }
print(discount)`,
        compiles: false,
        why: 'When `isMember` is `false`, `discount` is never assigned, so the compiler reports "constant \'discount\' used before being initialized". Even though this run would set it, the compiler checks every path.',
      },
      {
        key: 'both-branches',
        code: sw`let isMember = Bool("true")!
let discount: Int
if isMember { discount = 10 } else { discount = 0 }
print(discount)`,
        compiles: true,
        why: 'Each path assigns `discount` exactly once, so the `let` is definitely initialized before `print` reads it.',
      },
      {
        key: 'compound-assign',
        code: sw`var total: Int
for n in [1, 2, 3] {
    total += n
}
print(total)`,
        compiles: false,
        why: '`total += n` reads `total` before it has a value. Swift has no implicit zero for local variables: write `var total = 0`.',
      },
      {
        key: 'switch-assign',
        code: sw`enum Plan { case free, pro }
let plan = Plan.pro
let limit: Int
switch plan {
case .free: limit = 3
case .pro: limit = 100
}
print(limit)`,
        compiles: true,
        why: 'The `switch` is exhaustive and every case assigns `limit`, so the compiler knows it is initialized.',
      },
    ],
  ),
  ...b.concept(
    'swift-testing-frameworks',
    4,
    'Swift packages run tests with `swift test`; tests can use the Swift Testing library or XCTest.',
    [
      {
        key: 'recognize',
        question:
          'Which test is written with the Swift Testing library (`import Testing`), rather than XCTest?',
        snippet: plain(`// Function under test, in the Pricing module:
public func discounted(_ price: Int, percent: Int) -> Int {
    price - price * percent / 100
}`),
        correct: '`@Test func halfOff() { #expect(discounted(100, percent: 50) == 50) }`',
        wrong: [
          '`final class PricingTests: XCTestCase { func testHalfOff() { XCTAssertEqual(discounted(100, percent: 50), 50) } }`',
          '`@Test public void halfOff() { assertEquals(50, discounted(100, 50)); }`',
          '`func test_halfOff() { assert(discounted(100, percent: 50) == 50) }` in `main.swift`',
        ],
        why: 'Swift Testing marks test functions with the `@Test` macro and checks values with `#expect` (and `#require` to unwrap or stop a test). XCTest uses `XCTestCase` subclasses, methods starting with `test` and `XCTAssert...` functions; both run with `swift test`, also on Linux. The `public void` option with `assertEquals` is Java (JUnit). A plain `assert` in `main.swift` is not a test framework at all.',
      },
      {
        key: 'expect-require',
        question:
          'In Swift Testing, what is the difference between `#expect` and `try #require` when the condition fails?',
        snippet: plain(`@Test func parsesQuantity() throws {
    let quantity = try #require(Int("5"))
    #expect(quantity == 6)
    #expect(quantity > 0)
}`),
        correct:
          '`#expect` records a failure and the test continues; `try #require` records the failure and stops the test by throwing (and also unwraps Optionals)',
        wrong: [
          'Both stop the test immediately; `#require` just prints more detail',
          '`#expect` crashes the test process, like `precondition`',
          '`#require` only works in XCTest test cases',
        ],
        why: 'Use `#require` for preconditions of the test (such as unwrapping a value the rest depends on) and `#expect` for the checks themselves, so one run reports every failed expectation. Here the first `#expect` fails and the second still runs.',
      },
    ],
  ),
  ...b.multi(
    'swift-assertions',
    4,
    'Compare what happens to each check in a debug build and in an optimized (`-O`) build.',
    [
      {
        key: 'build-modes',
        question: 'Select every true statement about Swift’s runtime checks.',
        correct: [
          '`assert` is checked in debug builds but not in optimized (`-O`) builds',
          '`precondition` is still checked in optimized (`-O`) builds',
          '`fatalError` always stops the program, whatever the optimization level',
        ],
        wrong: [
          '`assert` failures can be caught with `do`-`catch`',
          '`precondition` is removed from all release builds, like `assert`',
          'A failed `assert` returns `false` and execution continues',
        ],
        why: 'Use `assert` for internal sanity checks during development, `precondition` for contract checks that must hold in production, and `fatalError` for unreachable states. None of them throw: a failure stops the process, so they are not error handling.',
      },
      {
        key: 'appropriate-use',
        question: 'Select every appropriate use of a runtime check.',
        correct: [
          '`precondition(index >= 0)` at the start of a function documented to require a non-negative index',
          '`assert(items.count <= capacity)` as an internal sanity check while developing a data structure',
          '`fatalError("subclasses must override")` in a base-class method that every subclass must override',
        ],
        wrong: [
          '`precondition(password.count >= 8)` to validate a password typed by a user',
          '`assert(response.status == 200)` to protect production code from failed network calls',
          '`fatalError()` when an optional setting is missing even though a sensible default exists',
        ],
        why: 'Runtime checks are for programmer errors: broken contracts and impossible states. Invalid user input and failed network calls are expected conditions and should be handled with Optionals, thrown errors or defaults. Remember that `assert` disappears in optimized builds, so it cannot protect production.',
      },
    ],
  ),
  ...b.multi(
    'swift-test-case-choice',
    5,
    'Look for boundaries and for inputs from different equivalence classes.',
    [
      {
        key: 'threshold',
        question:
          'Which test inputs are most valuable for `shippingCost(subtotal:)`? Select all that apply.',
        code: sw`func shippingCost(subtotal: Int) -> Int {
    subtotal >= 50 ? 0 : 5
}
print(shippingCost(subtotal: 49), shippingCost(subtotal: 50))`,
        correct: [
          '`49` and `50`, on each side of the free-shipping threshold',
          '`0`, the smallest valid subtotal',
          'A large subtotal such as `10_000`, to confirm shipping stays free',
        ],
        wrong: [
          '`51`, `52` and `53`, to cover more numbers near the threshold',
          'A single call that only checks the function does not crash',
          'No tests are needed once the code reaches 100% line coverage',
        ],
        why: 'Boundary values catch off-by-one mistakes such as `>` versus `>=`. Extra inputs from the same equivalence class add little. Coverage shows which lines ran, not whether the results were checked.',
      },
      {
        key: 'username',
        question:
          'Which test inputs are most valuable for `isValidUsername(_:)`? Select all that apply.',
        code: sw`func isValidUsername(_ s: String) -> Bool {
    (3...12).contains(s.count) && s.allSatisfy { $0.isLetter || $0.isNumber }
}
print(isValidUsername("ab"), isValidUsername("abc"), isValidUsername("ab cd"))`,
        correct: [
          'Strings of length 2, 3, 12 and 13, at both edges of the allowed length',
          'An empty string',
          'A string of valid length that contains a space or a symbol',
        ],
        wrong: [
          'Ten different valid five-letter names',
          'Only one valid name, because the function is a single line',
          'Inputs generated randomly on every run, with no fixed seed or record of the values',
        ],
        why: 'Each rule needs inputs just inside and just outside its limits, plus at least one input that breaks each rule on its own. Many similar valid names test the same path; unreproducible random inputs make failures hard to debug.',
      },
    ],
  ),
];
