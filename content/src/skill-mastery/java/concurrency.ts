import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Concurrency: threads, executors, futures, CompletableFuture, race
 * conditions, atomics, synchronized and concurrent collections.
 *
 * Every program prints only after joining its threads or waiting for its
 * futures, so the output is deterministic. Code that demonstrates a race is
 * used in reasoning questions and never prints the racy value.
 */
const b = programBuilders('java');

export const concurrencyFamilies: readonly QuestionSource[] = [
  ...b.output(
    'java-threads-basics',
    1,
    [
      '`start()` runs the task on a new thread; `join()` waits until that thread has finished.',
      'Calling `run()` directly just calls the method on the current thread.',
    ],
    [
      {
        key: 'join',
        code: `public class Main {
    public static void main(String[] args) throws InterruptedException {
        int[] result = new int[1];
        Thread worker = new Thread(() -> result[0] = 6 * 7);
        System.out.println("before " + result[0]);
        worker.start();
        worker.join();
        System.out.println("after " + result[0]);
    }
}`,
        output: 'before 0\nafter 42',
        why: 'The worker has not been started when the first line prints. `join()` blocks until the worker has finished, and it also guarantees that the worker’s write to `result[0]` is visible to the main thread afterwards.',
      },
      {
        key: 'run-vs-start',
        code: `public class Main {
    public static void main(String[] args) throws InterruptedException {
        Runnable task = () -> System.out.println("running on " + Thread.currentThread().getName());
        Thread t = new Thread(task, "worker-1");
        t.run();
        t.start();
        t.join();
    }
}`,
        output: 'running on main\nrunning on worker-1',
        why: '`t.run()` is an ordinary method call, so the task runs on the calling thread (`main`). Only `start()` creates a new thread, which runs the task under the name `worker-1`. Calling `run()` by mistake silently removes all concurrency.',
      },
      {
        key: 'two-workers',
        code: `public class Main {
    public static void main(String[] args) throws InterruptedException {
        long[] partial = new long[2];
        Thread first = new Thread(() -> { for (int i = 1; i <= 50; i++) partial[0] += i; });
        Thread second = new Thread(() -> { for (int i = 51; i <= 100; i++) partial[1] += i; });
        first.start();
        second.start();
        first.join();
        second.join();
        System.out.println(partial[0] + partial[1]);
    }
}`,
        output: '5050',
        why: 'Each thread writes only its own slot, so there is no shared counter to race on, and both joins happen before the result is read. Splitting work into independent parts and combining the results afterwards is the safest pattern.',
      },
    ],
  ),
  ...b.concept(
    'java-executor-lifecycle',
    2,
    'Threads in a fixed thread pool are not daemon threads, and they wait for new tasks until the executor is shut down.',
    [
      {
        key: 'shutdown',
        question: 'A batch job submits its tasks to `Executors.newFixedThreadPool(4)`, prints the results, and returns from `main`, but the process never exits. What is the most likely cause?',
        correct: 'The executor was never shut down, so its non-daemon worker threads keep waiting for tasks and keep the JVM alive; call `shutdown()` (or use try-with-resources on the `ExecutorService` in Java 19+).',
        wrong: [
          'A deadlock between the four worker threads; the pool size must be 1.',
          'The results were printed with `System.out`, which is not thread-safe and blocks the JVM.',
          'Returning from `main` always terminates every thread immediately, so a task must still be running.',
        ],
        why: 'The JVM exits only when all non-daemon threads have ended. Pool threads wait for more work until `shutdown()` is called. Since Java 19, `ExecutorService` is `AutoCloseable`, and `close()` shuts it down and waits for submitted tasks.',
      },
      {
        key: 'thread-per-request',
        question: 'A service creates a new platform thread (`new Thread(...).start()`) for every incoming request. Under load it fails with `OutOfMemoryError: unable to create native thread`. What is the best fix in Java 21?',
        correct: 'Submit the work to a bounded executor, or to `Executors.newVirtualThreadPerTaskExecutor()` when the tasks mostly wait on I/O.',
        wrong: [
          'Call `System.gc()` after each request so that finished threads are collected.',
          'Increase the thread priority so that threads finish sooner.',
          'Use `Thread.run()` instead of `start()` to reuse the current thread.',
        ],
        why: 'Platform threads are expensive operating-system threads, so unbounded creation exhausts native memory. Executors reuse a bounded number of threads; virtual threads (final in Java 21) are cheap and suit blocking I/O workloads. `run()` would remove the concurrency altogether.',
      },
    ],
  ),
  ...b.output(
    'java-executors-futures',
    2,
    [
      '`submit(Callable)` returns a `Future`; `get()` waits for its result.',
      'Results come back in the order you read the futures, not in the order the tasks finish.',
    ],
    [
      {
        key: 'submit-get',
        code: `import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public class Main {
    static int priceOf(String sku) {
        return sku.length() * 100;
    }

    public static void main(String[] args) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(3);
        try {
            List<Future<Integer>> futures = new ArrayList<>();
            for (String sku : List.of("pen", "lamp", "desk-xl")) {
                futures.add(pool.submit(() -> priceOf(sku)));
            }
            int total = 0;
            for (Future<Integer> f : futures) total += f.get();
            System.out.println(total);
        } finally {
            pool.shutdown();
        }
    }
}`,
        output: '1400',
        why: 'The three lookups may run in parallel and finish in any order, but each `Future` holds its own result and `get()` waits for it: `300 + 400 + 700 = 1400`. `shutdown()` in `finally` lets the pool threads end.',
      },
      {
        key: 'invoke-all',
        code: `import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public class Main {
    public static void main(String[] args) throws Exception {
        List<Callable<String>> checks = List.of(
            () -> "inventory OK",
            () -> "payment OK",
            () -> "shipping OK");
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            for (Future<String> f : pool.invokeAll(checks)) {
                System.out.println(f.get());
            }
        }
    }
}`,
        output: 'inventory OK\npayment OK\nshipping OK',
        why: '`invokeAll` waits until every task is done and returns the futures in the same order as the tasks. The try-with-resources block closes the executor (Java 19+), which shuts it down and waits for running tasks.',
      },
      {
        key: 'virtual-threads',
        code: `import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.IntStream;

public class Main {
    public static void main(String[] args) throws Exception {
        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<Integer>> futures = IntStream.rangeClosed(1, 1000)
                .mapToObj(i -> executor.submit(() -> i % 7 == 0 ? 1 : 0))
                .toList();
            int multiples = 0;
            for (Future<Integer> f : futures) multiples += f.get();
            System.out.println(multiples + " " + Thread.currentThread().isVirtual());
        }
    }
}`,
        output: '142 false',
        why: 'Java 21’s virtual-thread executor starts one cheap virtual thread per task, so a thousand tasks are no problem. There are 142 multiples of 7 up to 1000. `main` itself runs on a platform thread, so `isVirtual()` is `false` there.',
      },
    ],
  ),
  ...b.output(
    'java-atomic-synchronized',
    2,
    [
      '`AtomicInteger.incrementAndGet()` and a `synchronized` method each make the read-modify-write of a counter one indivisible step.',
    ],
    [
      {
        key: 'atomic',
        code: `import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class Main {
    public static void main(String[] args) throws InterruptedException {
        AtomicInteger processed = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(4);
        for (int t = 0; t < 4; t++) {
            pool.submit(() -> {
                for (int i = 0; i < 10_000; i++) processed.incrementAndGet();
            });
        }
        pool.shutdown();
        pool.awaitTermination(10, TimeUnit.SECONDS);
        System.out.println(processed.get());
    }
}`,
        output: '40000',
        why: '`incrementAndGet` is atomic, so no increment is lost even though four threads update the counter at the same time. `awaitTermination` after `shutdown` waits for all tasks before the value is read.',
      },
      {
        key: 'synchronized',
        code: `public class Main {
    public static void main(String[] args) throws InterruptedException {
        Account account = new Account();
        Thread a = new Thread(() -> { for (int i = 0; i < 5_000; i++) account.deposit(2); });
        Thread b = new Thread(() -> { for (int i = 0; i < 5_000; i++) account.deposit(3); });
        a.start();
        b.start();
        a.join();
        b.join();
        System.out.println(account.balance());
    }
}

class Account {
    private int balance;

    synchronized void deposit(int amount) {
        balance += amount;
    }

    synchronized int balance() {
        return balance;
    }
}`,
        output: '25000',
        why: 'Both methods lock the same `Account` object, so only one thread at a time can update `balance`: `5000 * 2 + 5000 * 3 = 25000`. Synchronizing the reader too guarantees it sees the latest value.',
      },
      {
        key: 'long-adder',
        code: `import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.LongAdder;

public class Main {
    public static void main(String[] args) {
        LongAdder hits = new LongAdder();
        try (ExecutorService pool = Executors.newFixedThreadPool(3)) {
            for (int t = 0; t < 3; t++) {
                pool.submit(() -> { for (int i = 0; i < 1_000; i++) hits.increment(); });
            }
        }
        System.out.println(hits.sum());
    }
}`,
        output: '3000',
        why: '`LongAdder` is a counter optimized for many concurrent writers; `sum()` combines its internal cells. Closing the executor at the end of the try-with-resources block waits for all tasks, so the sum is complete.',
      },
    ],
  ),
  ...b.codeChoice(
    'java-race-conditions',
    3,
    'Look for a read-modify-write or a check-then-act sequence on shared data that is not protected as a single step.',
    [
      {
        key: 'counter',
        question: 'This page-view counter is updated from many request threads. It sometimes reports fewer views than requests. Why, and what is the fix?',
        code: `public class Main {
    public static void main(String[] args) {
        PageStats stats = new PageStats();
        stats.recordView();
        System.out.println("recorded");
    }
}

class PageStats {
    private int views;

    void recordView() {
        views++;
    }

    int views() {
        return views;
    }
}`,
        correct: '`views++` is a read, an add and a write; two threads can read the same value and one increment is lost. Use an `AtomicInteger` (`incrementAndGet`) or make the methods `synchronized`.',
        wrong: [
          'Make `views` `volatile`, which makes `++` atomic.',
          'Make `recordView` `static`, so that all threads share one method.',
          'Nothing is wrong: `int` writes are atomic in Java, so increments cannot be lost.',
        ],
        why: 'Single `int` reads and writes are atomic, but `++` combines three steps, and interleaving them loses updates. `volatile` only guarantees visibility, not atomicity. An atomic class or a lock makes the whole update indivisible.',
      },
      {
        key: 'check-then-act',
        question: 'This cache is shared by request threads and uses a `ConcurrentHashMap`. Why can `load` still run twice for the same key, and what is the fix?',
        code: `import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class Main {
    public static void main(String[] args) {
        RateCache cache = new RateCache();
        System.out.println(cache.rate("EUR"));
    }
}

class RateCache {
    private final Map<String, Double> rates = new ConcurrentHashMap<>();

    double rate(String currency) {
        if (!rates.containsKey(currency)) {
            rates.put(currency, load(currency));
        }
        return rates.get(currency);
    }

    private double load(String currency) {
        return currency.equals("EUR") ? 1.0 : 1.1;
    }
}`,
        correct: 'Each map call is thread-safe, but “check, then put” is two calls, and two threads can both see the key missing; use `rates.computeIfAbsent(currency, this::load)`, which is atomic per key.',
        wrong: [
          '`ConcurrentHashMap` does not allow `double` values; use `HashMap`.',
          'Replace `ConcurrentHashMap` with `HashMap` and make the field `volatile`.',
          'Nothing: a `ConcurrentHashMap` makes every sequence of calls atomic.',
        ],
        why: 'Thread-safe collections make individual operations safe, not sequences of operations. `computeIfAbsent` performs the check and the insertion atomically (and runs the loader at most once per key). A plain `HashMap` is not safe for concurrent writes at all, `volatile` or not.',
      },
      {
        key: 'lazy-init',
        question: 'Two threads call `get()` at the same time on a fresh `Lazy` holder. What can go wrong, and what is a simple safe alternative?',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(ConfigHolder.get().get("region"));
    }
}

class ConfigHolder {
    private static java.util.Map<String, String> config;

    static java.util.Map<String, String> get() {
        if (config == null) {
            config = java.util.Map.of("region", "eu-west-1");
        }
        return config;
    }
}`,
        correct: 'Both threads can see `null` and initialize it twice (with an expensive loader, twice the work and two different objects); initialize it in a `static final` field or a holder class, which the JVM initializes exactly once.',
        wrong: [
          'Nothing can go wrong because `Map.of` returns an immutable map.',
          'The method must be `private`, otherwise it is not thread-safe.',
          'Two threads cannot run a static method at the same time, so the check is safe.',
        ],
        why: 'Unsynchronized lazy initialization is a check-then-act race. The JVM guarantees that static initializers run once, safely published, so `private static final Map<String, String> CONFIG = load();` (or the holder-class idiom) is both simple and correct. Static methods have no implicit locking.',
      },
    ],
  ),
  ...b.output(
    'java-completable-future',
    3,
    [
      '`thenApply` transforms the result, `thenCombine` merges two independent results, `thenCompose` chains a call that returns another future.',
      '`join()` waits for the result (like `get()`, but throws unchecked exceptions).',
    ],
    [
      {
        key: 'combine',
        code: `import java.util.concurrent.CompletableFuture;

public class Main {
    public static void main(String[] args) {
        CompletableFuture<Integer> price = CompletableFuture.supplyAsync(() -> 120);
        CompletableFuture<Integer> shipping = CompletableFuture.supplyAsync(() -> 15);
        CompletableFuture<String> label = price
            .thenCombine(shipping, Integer::sum)
            .thenApply(total -> "total: " + total);
        System.out.println(label.join());
    }
}`,
        output: 'total: 135',
        why: 'The two lookups run independently; `thenCombine` waits for both and adds them, and `thenApply` formats the sum. `join()` blocks until the whole chain is complete.',
      },
      {
        key: 'compose',
        code: `import java.util.concurrent.CompletableFuture;

public class Main {
    static CompletableFuture<String> findCustomer(int orderId) {
        return CompletableFuture.supplyAsync(() -> orderId == 7 ? "ada" : "unknown");
    }

    static CompletableFuture<String> findEmail(String customer) {
        return CompletableFuture.supplyAsync(() -> customer + "@example.com");
    }

    public static void main(String[] args) {
        String email = findCustomer(7).thenCompose(Main::findEmail).join();
        CompletableFuture<CompletableFuture<String>> nested = findCustomer(7).thenApply(Main::findEmail);
        System.out.println(email);
        System.out.println(nested.join().join());
    }
}`,
        output: 'ada@example.com\nada@example.com',
        why: '`thenCompose` flattens a function that returns a future (like `flatMap`). With `thenApply`, the result is a future of a future, which needs two `join()` calls.',
      },
      {
        key: 'exceptionally',
        code: `import java.util.concurrent.CompletableFuture;

public class Main {
    static int fetchStock(String sku) {
        if (sku.equals("ink")) throw new IllegalStateException("warehouse timeout");
        return 12;
    }

    public static void main(String[] args) {
        for (String sku : new String[] {"pen", "ink"}) {
            int stock = CompletableFuture.supplyAsync(() -> fetchStock(sku))
                .thenApply(n -> n * 2)
                .exceptionally(e -> -1)
                .join();
            System.out.println(sku + " " + stock);
        }
    }
}`,
        output: 'pen 24\nink -1',
        why: 'For `pen` the chain completes normally. For `ink` the supplier throws, `thenApply` is skipped, and `exceptionally` recovers with a fallback value, so `join()` does not throw.',
      },
    ],
  ),
  ...b.fails(
    'java-concurrency-failures',
    4,
    'An exception inside a task is not thrown in the submitting thread. It is stored and rethrown, wrapped, when someone waits for the result.',
    [
      {
        key: 'execution-exception',
        question: 'The report job fails at `future.get()`. Where is the real error?',
        code: `import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public class Main {
    static int countRows(String file) {
        if (file.isEmpty()) throw new IllegalArgumentException("file name is empty");
        return 100;
    }

    public static void main(String[] args) throws Exception {
        try (ExecutorService pool = Executors.newSingleThreadExecutor()) {
            Future<Integer> future = pool.submit(() -> countRows(""));
            System.out.println(future.get());
        }
    }
}`,
        error: 'ExecutionException',
        correct: 'The task threw `IllegalArgumentException: file name is empty`; `get()` wraps it in an `ExecutionException`, so look at the cause (`e.getCause()`).',
        wrong: [
          'The executor was closed before the task ran, so the task never started.',
          '`get()` always throws `ExecutionException` for tasks that return a value.',
          'The exception was lost inside the pool thread; `get()` throws only because of a timeout.',
        ],
        why: 'The `Future` stores the task’s exception and `get()` rethrows it wrapped in `ExecutionException` (the message repeats the cause). Handling or logging only the wrapper without its cause hides the actual problem.',
      },
      {
        key: 'completion-exception',
        question: 'Why does this `join()` throw `CompletionException` instead of the original exception?',
        code: `import java.util.concurrent.CompletableFuture;

public class Main {
    public static void main(String[] args) {
        CompletableFuture<Integer> quote = CompletableFuture.supplyAsync(() -> {
            throw new IllegalStateException("pricing service unavailable");
        });
        System.out.println(quote.thenApply(p -> p + 5).join());
    }
}`,
        error: 'CompletionException',
        correct: 'The supplier failed asynchronously; `join()` rethrows the failure wrapped in an unchecked `CompletionException`, whose cause is the `IllegalStateException`.',
        wrong: [
          '`thenApply` throws `CompletionException` whenever its argument is a lambda.',
          '`supplyAsync` cannot take a lambda that throws, so the code fails before it starts.',
          '`join()` timed out waiting for the result.',
        ],
        why: '`join()` wraps the original exception in `CompletionException` (`get()` would use the checked `ExecutionException`). Recover inside the chain with `exceptionally` or `handle`, or unwrap the cause when logging.',
      },
      {
        key: 'rejected',
        question: 'A shutdown hook closes the executor, but a late request still submits work. What happens?',
        code: `import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class Main {
    public static void main(String[] args) {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        pool.submit(() -> System.out.println("first task"));
        pool.shutdown();
        pool.submit(() -> System.out.println("late task"));
    }
}`,
        error: 'RejectedExecutionException',
        correct: 'After `shutdown()` the executor accepts no new tasks, so `submit` throws `RejectedExecutionException` (already submitted tasks still complete).',
        wrong: [
          'The late task is queued and runs when the executor is restarted.',
          'The late task runs on the calling thread instead.',
          '`shutdown()` stops the first task immediately, and its interruption causes the error.',
        ],
        why: '`shutdown()` is graceful: queued and running tasks finish, but new submissions are rejected with `RejectedExecutionException`. (`shutdownNow()` additionally interrupts running tasks.) Running on the caller is an explicit `CallerRunsPolicy`, not the default.',
      },
    ],
  ),
  ...b.output(
    'java-concurrent-collections',
    4,
    [
      '`ConcurrentHashMap` methods such as `merge` and `compute` update one key atomically.',
      'Copy the result into a `TreeMap` (or sort it) before printing, because hash map iteration order is not something to rely on.',
    ],
    [
      {
        key: 'merge',
        code: `import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class Main {
    public static void main(String[] args) {
        List<String> events = List.of("login", "view", "view", "login", "buy", "view");
        Map<String, Integer> counts = new ConcurrentHashMap<>();
        try (ExecutorService pool = Executors.newFixedThreadPool(3)) {
            for (int copy = 0; copy < 100; copy++) {
                pool.submit(() -> events.forEach(e -> counts.merge(e, 1, Integer::sum)));
            }
        }
        System.out.println(new TreeMap<>(counts));
    }
}`,
        output: '{buy=100, login=200, view=300}',
        why: 'A hundred tasks each count the six events. `merge` is atomic per key, so no update is lost, and closing the executor waits for every task. Copying into a `TreeMap` gives a sorted, deterministic printout.',
      },
      {
        key: 'compute-if-absent',
        code: `import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

public class Main {
    public static void main(String[] args) {
        Map<String, List<Integer>> byRegion = new ConcurrentHashMap<>();
        AtomicInteger loads = new AtomicInteger();
        try (ExecutorService pool = Executors.newFixedThreadPool(4)) {
            for (int i = 0; i < 40; i++) {
                int order = i;
                pool.submit(() -> byRegion.computeIfAbsent(order % 2 == 0 ? "EU" : "US", r -> {
                    loads.incrementAndGet();
                    return new CopyOnWriteArrayList<>();
                }).add(order));
            }
        }
        System.out.println(loads.get() + " " + byRegion.get("EU").size() + " " + byRegion.get("US").size());
    }
}`,
        output: '2 20 20',
        why: '`computeIfAbsent` on a `ConcurrentHashMap` runs the mapping function at most once per key, so exactly two lists are created. The lists themselves are thread-safe (`CopyOnWriteArrayList`), so all 40 additions arrive.',
      },
      {
        key: 'copy-on-write-iteration',
        code: `import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

public class Main {
    public static void main(String[] args) {
        List<String> listeners = new CopyOnWriteArrayList<>(List.of("audit", "mail"));
        for (String l : listeners) {
            if (l.equals("audit")) listeners.add("metrics");
        }
        System.out.println(listeners);
    }
}`,
        output: '[audit, mail, metrics]',
        why: 'A `CopyOnWriteArrayList` iterator works on a snapshot taken when the loop started, so adding during iteration does not throw `ConcurrentModificationException`, and the new element is not visited by that loop. It suits rarely-changing, often-read lists such as listeners.',
      },
    ],
  ),
  ...b.multi(
    'java-thread-safety-facts',
    5,
    'Distinguish atomicity (an update is indivisible), visibility (other threads see a write) and immutability.',
    [
      {
        key: 'statements',
        question: 'Select every statement that is true about thread safety in Java.',
        correct: [
          '`volatile` makes writes to a field visible to other threads, but does not make `count++` atomic.',
          'An object whose fields are all `final` and refer to immutable values can be shared between threads without locking, once it is safely constructed.',
          'Iterating over a `Collections.synchronizedList` still requires manually synchronizing on the list.',
          'Each `ConcurrentHashMap` operation is thread-safe, but a `get` followed by a `put` is not atomic.',
        ],
        wrong: [
          'A `synchronized` method locks the method code, so two different objects cannot run it at the same time.',
          '`HashMap` is safe for concurrent writes as long as the keys are different.',
        ],
        why: '`volatile` is about visibility only. Immutable objects are inherently thread-safe. Synchronized wrappers lock each call, but iteration spans many calls. `ConcurrentHashMap` offers atomic compound methods (`merge`, `compute`, `putIfAbsent`) for that reason. A `synchronized` instance method locks `this`, so different objects do not block each other, and concurrent writes can corrupt a `HashMap` even with different keys.',
      },
      {
        key: 'choose',
        question: 'Select every appropriate choice for the scenario.',
        correct: [
          'Counting requests from many threads: `AtomicLong` or `LongAdder`.',
          'Running a CPU-bound computation on 8 cores: a fixed thread pool of about 8 threads.',
          'Waiting for several independent remote calls and combining the results: `CompletableFuture` with `thenCombine` or `allOf`.',
        ],
        wrong: [
          'Sharing a cache between request threads: a `HashMap` in a `static` field.',
          'Making a `SimpleDateFormat` shared by all threads safe: declare the field `final`.',
        ],
        why: 'Atomics and adders handle counters without locks; CPU-bound work does not benefit from more threads than cores; `CompletableFuture` composes asynchronous results. A static `HashMap` is not thread-safe, and `final` only makes the reference constant: the mutable `SimpleDateFormat` object is still unsafe (use `DateTimeFormatter`, which is immutable).',
      },
    ],
  ),
];
