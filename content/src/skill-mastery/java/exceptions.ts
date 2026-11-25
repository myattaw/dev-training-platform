import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Exceptions: checked and unchecked exceptions, try/catch/finally, custom
 * exceptions, try-with-resources and suppressed exceptions, reading failures.
 */
const b = programBuilders('java');

export const exceptionsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'java-try-catch-flow',
    1,
    [
      'When an exception is thrown, the rest of the `try` block is skipped and the first matching `catch` runs.',
      '`finally` runs whether or not an exception was thrown.',
    ],
    [
      {
        key: 'caught',
        code: `public class Main {
    public static void main(String[] args) {
        try {
            System.out.println("start");
            Integer.parseInt("abc");
            System.out.println("parsed");
        } catch (NumberFormatException e) {
            System.out.println("bad number");
        } finally {
            System.out.println("done");
        }
        System.out.println("after");
    }
}`,
        output: 'start\nbad number\ndone\nafter',
        why: '`parseInt("abc")` throws, so `parsed` is never printed. The `catch` handles the exception, `finally` runs, and execution continues after the statement.',
      },
      {
        key: 'no-exception',
        code: `public class Main {
    public static void main(String[] args) {
        try {
            System.out.println(Integer.parseInt("42") + 1);
        } catch (NumberFormatException e) {
            System.out.println("bad number");
        } finally {
            System.out.println("done");
        }
    }
}`,
        output: '43\ndone',
        why: 'No exception is thrown, so the `catch` block is skipped. `finally` still runs.',
      },
      {
        key: 'first-match',
        code: `public class Main {
    public static void main(String[] args) {
        try {
            Object value = "text";
            Integer number = (Integer) value;
            System.out.println(number);
        } catch (ClassCastException e) {
            System.out.println("cast");
        } catch (RuntimeException e) {
            System.out.println("runtime");
        }
    }
}`,
        output: 'cast',
        why: 'Catch clauses are checked in order and only the first matching one runs. `ClassCastException` matches the first clause; the `RuntimeException` clause would only catch other unchecked exceptions.',
      },
    ],
  ),
  ...b.compiles(
    'java-checked-exceptions',
    2,
    'Checked exceptions (subclasses of `Exception` but not of `RuntimeException`) must be caught or declared with `throws`. The compiler also checks that each catch clause is reachable.',
    [
      {
        key: 'undeclared',
        code: `import java.io.IOException;

public class Main {
    static String readConfig() throws IOException {
        throw new IOException("missing file");
    }

    public static void main(String[] args) {
        System.out.println(readConfig());
    }
}`,
        compiles: false,
        why: '`readConfig` declares the checked `IOException`, so the caller must catch it or declare it: “unreported exception java.io.IOException; must be caught or declared to be thrown”. Adding `throws IOException` to `main` or a `try`/`catch` fixes it.',
      },
      {
        key: 'unchecked',
        code: `public class Main {
    static int parsePort(String raw) {
        if (raw.isBlank()) throw new IllegalArgumentException("port is blank");
        return Integer.parseInt(raw);
    }

    public static void main(String[] args) {
        System.out.println(parsePort("8080"));
    }
}`,
        compiles: true,
        why: '`IllegalArgumentException` and `NumberFormatException` are unchecked (they extend `RuntimeException`), so neither has to be declared or caught. It prints `8080`.',
      },
      {
        key: 'unreachable-catch',
        code: `import java.io.IOException;

public class Main {
    public static void main(String[] args) {
        try {
            System.out.println("no I/O here");
        } catch (IOException e) {
            System.out.println("failed");
        }
    }
}`,
        compiles: false,
        why: 'The compiler knows the `try` block cannot throw the checked `IOException`: “exception java.io.IOException is never thrown in body of corresponding try statement”. (Catching `Exception` or an unchecked exception would be allowed.)',
      },
      {
        key: 'catch-order',
        code: `import java.io.FileNotFoundException;
import java.io.IOException;

public class Main {
    static void open() throws IOException {
        throw new FileNotFoundException("data.csv");
    }

    public static void main(String[] args) {
        try {
            open();
        } catch (IOException e) {
            System.out.println("io");
        } catch (FileNotFoundException e) {
            System.out.println("not found");
        }
    }
}`,
        compiles: false,
        why: '`FileNotFoundException` is a subclass of `IOException`, so the first clause already catches it and the second is unreachable: “exception FileNotFoundException has already been caught”. Put the more specific clause first.',
      },
      {
        key: 'multi-catch',
        code: `import java.io.FileNotFoundException;
import java.io.IOException;

public class Main {
    static void open() throws IOException {
        throw new FileNotFoundException("data.csv");
    }

    public static void main(String[] args) {
        try {
            open();
        } catch (FileNotFoundException | IOException e) {
            System.out.println("failed");
        }
    }
}`,
        compiles: false,
        why: 'The alternatives in a multi-catch must not be subclasses of each other: “Alternatives in a multi-catch statement cannot be related by subclassing”. Catching `IOException` alone already covers `FileNotFoundException`.',
      },
    ],
  ),
  ...b.output(
    'java-custom-exceptions',
    2,
    [
      'A custom exception passes its message (and optionally a cause) to the superclass constructor.',
      '`getCause()` returns the exception that was wrapped.',
    ],
    [
      {
        key: 'not-found',
        code: `import java.util.Map;

public class Main {
    public static void main(String[] args) {
        OrderService service = new OrderService();
        try {
            service.find("o-9");
        } catch (OrderNotFoundException e) {
            System.out.println(e.getMessage());
            System.out.println(e instanceof RuntimeException);
        }
    }
}

class OrderNotFoundException extends RuntimeException {
    OrderNotFoundException(String id) {
        super("Order " + id + " not found");
    }
}

class OrderService {
    private final Map<String, String> orders = Map.of("o-1", "PAID");

    String find(String id) {
        String status = orders.get(id);
        if (status == null) throw new OrderNotFoundException(id);
        return status;
    }
}`,
        output: 'Order o-9 not found\ntrue',
        why: 'The constructor builds a meaningful message and passes it to `RuntimeException`. Extending `RuntimeException` makes it unchecked, which is the usual choice for business errors that callers cannot recover from locally (Spring maps such exceptions to HTTP responses).',
      },
      {
        key: 'cause',
        code: `public class Main {
    public static void main(String[] args) {
        try {
            new PaymentClient().charge("12x");
        } catch (PaymentException e) {
            System.out.println(e.getMessage());
            System.out.println(e.getCause().getClass().getSimpleName());
            System.out.println(e.getCause().getMessage());
        }
    }
}

class PaymentException extends Exception {
    PaymentException(String message, Throwable cause) {
        super(message, cause);
    }
}

class PaymentClient {
    void charge(String amount) throws PaymentException {
        try {
            Integer.parseInt(amount);
        } catch (NumberFormatException e) {
            throw new PaymentException("Charge failed for amount " + amount, e);
        }
    }
}`,
        output: 'Charge failed for amount 12x\nNumberFormatException\nFor input string: "12x"',
        why: 'The low-level `NumberFormatException` is wrapped in a domain exception with a clearer message, and passed as the cause. The cause keeps the original type, message and stack trace for debugging (logged as “Caused by:”).',
      },
      {
        key: 'hierarchy',
        code: `public class Main {
    public static void main(String[] args) {
        for (String code : new String[] {"stock", "limit", "other"}) {
            try {
                check(code);
            } catch (OutOfStockException e) {
                System.out.println("stock: " + e.getMessage());
            } catch (OrderException e) {
                System.out.println("order: " + e.getMessage());
            } catch (RuntimeException e) {
                System.out.println("other: " + e.getMessage());
            }
        }
    }

    static void check(String code) {
        switch (code) {
            case "stock" -> throw new OutOfStockException("pen");
            case "limit" -> throw new OrderException("limit exceeded");
            default -> throw new IllegalStateException("unexpected");
        }
    }
}

class OrderException extends RuntimeException {
    OrderException(String message) { super(message); }
}

class OutOfStockException extends OrderException {
    OutOfStockException(String item) { super(item + " is out of stock"); }
}`,
        output: 'stock: pen is out of stock\norder: limit exceeded\nother: unexpected',
        why: 'A small hierarchy lets callers catch specific or general failures. The most specific matching clause runs first; `IllegalStateException` is not an `OrderException`, so it reaches the `RuntimeException` clause.',
      },
    ],
  ),
  ...b.output(
    'java-try-with-resources',
    3,
    [
      'Resources declared in `try (...)` are closed automatically, in reverse order of creation.',
      'They are closed before any `catch` or `finally` block runs.',
    ],
    [
      {
        key: 'order',
        code: `public class Main {
    public static void main(String[] args) {
        try (Resource db = new Resource("db"); Resource file = new Resource("file")) {
            System.out.println("work");
            throw new IllegalStateException("boom");
        } catch (IllegalStateException e) {
            System.out.println("caught " + e.getMessage());
        } finally {
            System.out.println("finally");
        }
    }
}

class Resource implements AutoCloseable {
    private final String name;

    Resource(String name) {
        this.name = name;
        System.out.println("open " + name);
    }

    @Override
    public void close() {
        System.out.println("close " + name);
    }
}`,
        output: 'open db\nopen file\nwork\nclose file\nclose db\ncaught boom\nfinally',
        why: 'Resources are opened in declaration order and closed in reverse order, like nested `try`/`finally` blocks. The closing happens before the `catch` and `finally` clauses of the statement run.',
      },
      {
        key: 'failed-open',
        code: `public class Main {
    public static void main(String[] args) {
        try (Resource db = new Resource("db", false); Resource cache = new Resource("cache", true)) {
            System.out.println("work");
        } catch (IllegalStateException e) {
            System.out.println("caught " + e.getMessage());
        }
    }
}

class Resource implements AutoCloseable {
    private final String name;

    Resource(String name, boolean fail) {
        if (fail) throw new IllegalStateException(name + " unavailable");
        this.name = name;
        System.out.println("open " + name);
    }

    @Override
    public void close() {
        System.out.println("close " + name);
    }
}`,
        output: 'open db\nclose db\ncaught cache unavailable',
        why: 'Creating `cache` throws, so the body never runs. Only resources that were successfully initialized are closed (`db`); `cache` was never created, so there is nothing to close.',
      },
      {
        key: 'null-resource',
        code: `public class Main {
    static Resource connect(boolean available) {
        return available ? new Resource() : null;
    }

    public static void main(String[] args) {
        try (Resource r = connect(false)) {
            System.out.println("body runs, r is " + r);
        }
        System.out.println("end");
    }
}

class Resource implements AutoCloseable {
    @Override
    public void close() {
        System.out.println("closed");
    }
}`,
        output: 'body runs, r is null\nend',
        why: 'A resource variable may be `null`: try-with-resources only calls `close()` on non-null resources, so there is no `NullPointerException` and nothing is closed.',
      },
    ],
  ),
  ...b.fails(
    'java-exception-root-cause',
    2,
    'In a wrapped exception, the top line says what failed; the cause (“Caused by:”) says why.',
    [
      {
        key: 'wrapped-config',
        question:
          'The application stops with `IllegalStateException: Invalid configuration`. Where is the actual problem?',
        code: `import java.util.Map;

public class Main {
    static int port(Map<String, String> config) {
        try {
            return Integer.parseInt(config.get("server.port"));
        } catch (NumberFormatException e) {
            throw new IllegalStateException("Invalid configuration", e);
        }
    }

    public static void main(String[] args) {
        System.out.println(port(Map.of("server.port", "80a")));
    }
}`,
        error: 'IllegalStateException: Invalid configuration',
        correct:
          'In the cause: a `NumberFormatException` for input string `"80a"`, so the `server.port` value is not a number.',
        wrong: [
          'The configuration map is `null`, because `IllegalStateException` means an object was not initialized.',
          'The key `server.port` is missing from the map.',
          'There is no more information: wrapping an exception discards the original one.',
        ],
        why: 'The code wraps the `NumberFormatException` and passes it as the cause, so the stack trace shows `Caused by: java.lang.NumberFormatException: For input string: "80a"`. A missing key would make `parseInt(null)` fail with a different message (`Cannot parse null string`). Always read down to the deepest cause.',
      },
      {
        key: 'swallowed',
        question: 'This service fails with a `NullPointerException`. What is the root cause?',
        code: `import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.Properties;

public class Main {
    static Properties read(String path) throws IOException {
        throw new FileNotFoundException(path + " (No such file or directory)");
    }

    static Properties load() {
        try {
            return read("app.properties");
        } catch (IOException e) {
            return null;
        }
    }

    public static void main(String[] args) {
        Properties config = load();
        System.out.println(config.getProperty("db.url"));
    }
}`,
        error: 'NullPointerException',
        correct:
          '`load` swallows the `FileNotFoundException` and returns `null`, so the failure surfaces later as an NPE; let the exception propagate (or wrap it) instead of returning `null`.',
        wrong: [
          '`getProperty` throws `NullPointerException` when the key does not exist.',
          '`Properties` must be created with `new Properties()` before `getProperty` can be called on it.',
          '`FileNotFoundException` is unchecked, so it skipped the `catch` block.',
        ],
        why: 'The real problem (a missing file) was caught and replaced with `null`, so the error shows up somewhere else with no trace of the cause. `getProperty` returns `null` for a missing key rather than throwing. Swallowing exceptions is one of the most expensive debugging traps in production code.',
      },
    ],
  ),
  ...b.codeChoice(
    'java-exception-handling-design',
    4,
    'A good handler either recovers, or adds context and rethrows with the original exception as the cause.',
    [
      {
        key: 'lost-cause',
        question: 'What is wrong with this exception translation?',
        code: `public class Main {
    public static void main(String[] args) {
        try {
            new InvoiceService().total("x");
        } catch (InvoiceException e) {
            System.out.println(e.getMessage());
        }
    }
}

class InvoiceException extends RuntimeException {
    InvoiceException(String message) { super(message); }
}

class InvoiceService {
    int total(String raw) {
        try {
            return Integer.parseInt(raw);
        } catch (NumberFormatException e) {
            throw new InvoiceException("Could not compute total: " + e.getMessage());
        }
    }
}`,
        correct:
          'It copies only the message and drops the original exception, so its type and stack trace are lost; add a `(String, Throwable)` constructor and pass `e` as the cause.',
        wrong: [
          'Translating exceptions is always wrong; the `NumberFormatException` should reach the controller unchanged.',
          '`InvoiceException` must extend `Exception`, because custom exceptions must be checked.',
          '`e.getMessage()` may throw, so it must be wrapped in another `try`/`catch`.',
        ],
        why: 'Translating low-level exceptions into domain exceptions is a good practice, but the cause must be preserved: `super(message, cause)`. Without it, logs show only the new stack trace. Custom exceptions may be checked or unchecked; unchecked is common in Spring applications.',
      },
      {
        key: 'catch-all',
        question: 'A reviewer flags this repository method. Which comment is right?',
        code: `import java.util.Map;
import java.util.Optional;

public class Main {
    public static void main(String[] args) {
        System.out.println(new CustomerRepository().findEmail(7));
    }
}

class CustomerRepository {
    private final Map<Integer, String> emails = Map.of(7, "ada@example.com");

    String findEmail(int id) {
        try {
            return emails.get(id).toLowerCase();
        } catch (Exception e) {
            return "";
        }
    }
}`,
        correct:
          'Catching `Exception` turns every failure, including bugs such as a `NullPointerException` for an unknown id, into an empty email; handle the missing case explicitly (for example return `Optional<String>`) and let unexpected exceptions propagate.',
        wrong: [
          'The method should catch `Throwable` instead, so that errors such as `OutOfMemoryError` are handled too.',
          'The `try` block is fine but should also log the exception with `e.printStackTrace()` and continue.',
          'Nothing: returning an empty string is the standard way to report errors in Java.',
        ],
        why: 'A broad `catch (Exception e)` with a default value hides both expected situations (an unknown id) and real bugs. Model absence explicitly with `Optional` and let unexpected failures propagate to a central handler. Catching `Throwable` is worse, and printing then continuing still hides the failure from callers.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-finally-semantics',
    4,
    'The value of a `return` expression is computed before `finally` runs. A `return` inside `finally` replaces whatever was being returned or thrown.',
    [
      {
        key: 'finally-return',
        code: `public class Main {
    static int status() {
        try {
            return 200;
        } finally {
            return 500;
        }
    }

    public static void main(String[] args) {
        System.out.println(status());
    }
}`,
        correct: '500',
        wrong: ['200', 'It does not compile: unreachable return', '200 then 500'],
        why: '`finally` runs after the `return 200` value is computed, and its own `return 500` replaces it. Returning from `finally` is legal but a bad idea: it also discards exceptions.',
      },
      {
        key: 'primitive-copy',
        code: `public class Main {
    static int retries() {
        int count = 1;
        try {
            return count;
        } finally {
            count = 5;
        }
    }

    public static void main(String[] args) {
        System.out.println(retries());
    }
}`,
        correct: '1',
        wrong: ['5', '6', 'It does not compile: count is not effectively final'],
        why: 'The return value `1` is computed and saved before `finally` runs. Changing the local variable afterwards does not change the saved value.',
      },
      {
        key: 'mutable-object',
        code: `public class Main {
    static StringBuilder log() {
        StringBuilder sb = new StringBuilder("start");
        try {
            return sb;
        } finally {
            sb.append("+finally");
        }
    }

    public static void main(String[] args) {
        System.out.println(log());
    }
}`,
        correct: 'start+finally',
        wrong: ['start', '+finally', 'It does not compile: sb is returned twice'],
        why: 'The saved return value is a reference to the builder. `finally` mutates the same object, so the caller sees the change. Only reassigning the variable would be invisible.',
      },
      {
        key: 'swallows-exception',
        code: `public class Main {
    static String load() {
        try {
            throw new IllegalStateException("database down");
        } finally {
            return "cached";
        }
    }

    public static void main(String[] args) {
        System.out.println(load());
    }
}`,
        correct: 'cached',
        wrong: [
          'IllegalStateException: database down',
          'database down',
          'It does not compile: missing return',
        ],
        why: 'A `return` in `finally` completes the method normally and discards the pending exception without a trace. This is why `return` (and `throw`) in `finally` blocks should be avoided.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-suppressed-exceptions',
    5,
    'If the body of a try-with-resources throws and then `close()` throws too, which exception is propagated, and where does the other one go?',
    [
      {
        key: 'twr',
        code: `public class Main {
    public static void main(String[] args) {
        try (Connection c = new Connection()) {
            throw new IllegalStateException("query failed");
        } catch (RuntimeException e) {
            System.out.println(e.getMessage());
            for (Throwable s : e.getSuppressed()) {
                System.out.println("suppressed: " + s.getMessage());
            }
        }
    }
}

class Connection implements AutoCloseable {
    @Override
    public void close() {
        throw new IllegalArgumentException("close failed");
    }
}`,
        correct: 'query failed\nsuppressed: close failed',
        wrong: ['close failed\nsuppressed: query failed', 'close failed', 'query failed'],
        why: 'The body’s exception is the primary one; the exception from `close()` is attached to it with `addSuppressed` instead of replacing it. Nothing is lost, and stack traces show it under “Suppressed:”.',
      },
      {
        key: 'manual-finally',
        code: `public class Main {
    public static void main(String[] args) {
        Connection c = new Connection();
        try {
            try {
                throw new IllegalStateException("query failed");
            } finally {
                c.close();
            }
        } catch (RuntimeException e) {
            System.out.println(e.getMessage() + " / suppressed: " + e.getSuppressed().length);
        }
    }
}

class Connection implements AutoCloseable {
    @Override
    public void close() {
        throw new IllegalArgumentException("close failed");
    }
}`,
        correct: 'close failed / suppressed: 0',
        wrong: [
          'query failed / suppressed: 1',
          'query failed / suppressed: 0',
          'close failed / suppressed: 1',
        ],
        why: 'With a hand-written `finally`, the exception thrown by `close()` replaces the one in flight: the original `query failed`, the real problem, is lost. try-with-resources exists to avoid exactly this.',
      },
      {
        key: 'close-only',
        code: `public class Main {
    public static void main(String[] args) {
        try (Connection c = new Connection()) {
            System.out.println("query ok");
        } catch (RuntimeException e) {
            System.out.println("caught " + e.getMessage() + " / suppressed: " + e.getSuppressed().length);
        }
    }
}

class Connection implements AutoCloseable {
    @Override
    public void close() {
        throw new IllegalArgumentException("close failed");
    }
}`,
        correct: 'query ok\ncaught close failed / suppressed: 0',
        wrong: [
          'query ok',
          'caught close failed / suppressed: 0',
          'query ok\ncaught close failed / suppressed: 1',
        ],
        why: 'When the body completes normally, an exception from `close()` is simply thrown by the statement and can be caught. Suppression only happens when there already is a primary exception.',
      },
    ],
  ),
];
