import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Functional Java: lambdas and functional interfaces, method references,
 * streams and collectors, and Optional.
 */
const b = programBuilders('java');

// ---------------------------------------------------------------- Lambdas

export const lambdasFamilies: readonly QuestionSource[] = [
  ...b.output(
    'java-functional-interfaces',
    1,
    [
      '`Predicate<T>` tests (`test`), `Function<T, R>` transforms (`apply`), `Consumer<T>` accepts (`accept`) and `Supplier<T>` provides (`get`).',
    ],
    [
      {
        key: 'four-basics',
        code: `import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.function.Supplier;

public class Main {
    public static void main(String[] args) {
        Predicate<String> isEmail = s -> s.contains("@");
        Function<String, Integer> length = s -> s.length();
        Consumer<String> print = s -> System.out.println("> " + s);
        Supplier<String> fallback = () -> "none";

        System.out.println(isEmail.test("ada@example.com"));
        System.out.println(length.apply("pracstack"));
        print.accept(fallback.get());
    }
}`,
        output: 'true\n9\n> none',
        why: 'Each functional interface has one abstract method, and a lambda implements it. The method names differ (`test`, `apply`, `accept`, `get`), which is why the calls look different.',
      },
      {
        key: 'bi-unary',
        code: `import java.util.function.BiFunction;
import java.util.function.BinaryOperator;
import java.util.function.UnaryOperator;

public class Main {
    public static void main(String[] args) {
        BiFunction<Integer, Integer, Integer> lineTotal = (qty, price) -> qty * price;
        UnaryOperator<String> normalize = s -> s.strip().toLowerCase();
        BinaryOperator<Integer> larger = (a, b) -> a >= b ? a : b;

        System.out.println(lineTotal.apply(3, 250));
        System.out.println(normalize.apply("  SKU-9 "));
        System.out.println(larger.apply(7, 12));
    }
}`,
        output: '750\nsku-9\n12',
        why: '`BiFunction` takes two arguments. `UnaryOperator<T>` is a `Function<T, T>`, and `BinaryOperator<T>` is a `BiFunction<T, T, T>`: same input and output types.',
      },
      {
        key: 'pass-behavior',
        code: `import java.util.List;
import java.util.function.Predicate;

public class Main {
    static int countMatching(List<Integer> amounts, Predicate<Integer> rule) {
        int n = 0;
        for (int a : amounts) if (rule.test(a)) n++;
        return n;
    }

    public static void main(String[] args) {
        List<Integer> amounts = List.of(50, 120, 900, 15);
        System.out.println(countMatching(amounts, a -> a > 100));
        System.out.println(countMatching(amounts, a -> a % 2 == 1));
    }
}`,
        output: '2\n1',
        why: 'The same method counts different things depending on the behavior passed in. `120` and `900` are above 100; only `15` is odd.',
      },
    ],
  ),
  ...b.output(
    'java-method-references',
    2,
    [
      '`Type::instanceMethod` uses the first argument as the receiver; `object::method` binds a specific object.',
      '`Type::new` refers to a constructor.',
    ],
    [
      {
        key: 'unbound-bound',
        code: `import java.util.List;
import java.util.function.Function;

public class Main {
    public static void main(String[] args) {
        Function<String, String> upper = String::toUpperCase;
        String prefix = "SKU-";
        Function<String, String> withPrefix = prefix::concat;
        List.of("a1", "b2").stream()
            .map(upper.andThen(withPrefix))
            .forEach(System.out::println);
    }
}`,
        output: 'SKU-A1\nSKU-B2',
        why: '`String::toUpperCase` calls the method on the argument (`s -> s.toUpperCase()`). `prefix::concat` is bound to the `prefix` object (`s -> prefix.concat(s)`). `System.out::println` is bound to `System.out`.',
      },
      {
        key: 'constructor',
        code: `import java.util.List;
import java.util.function.Function;

public class Main {
    public static void main(String[] args) {
        Function<String, Customer> create = Customer::new;
        List<Customer> customers = List.of("Ada", "Linus").stream().map(create).toList();
        System.out.println(customers);
    }
}

record Customer(String name) {}`,
        output: '[Customer[name=Ada], Customer[name=Linus]]',
        why: '`Customer::new` refers to the constructor that matches the function shape: one `String` in, a `Customer` out.',
      },
      {
        key: 'static',
        code: `import java.util.List;
import java.util.function.BinaryOperator;

public class Main {
    public static void main(String[] args) {
        BinaryOperator<Integer> max = Math::max;
        int best = List.of(4, 19, 7).stream().reduce(Integer.MIN_VALUE, max);
        System.out.println(best);
        System.out.println(List.of("10", "5").stream().mapToInt(Integer::parseInt).sum());
    }
}`,
        output: '19\n15',
        why: '`Math::max` and `Integer::parseInt` are static method references: the arguments are passed straight through, like `(a, b) -> Math.max(a, b)` and `s -> Integer.parseInt(s)`.',
      },
    ],
  ),
  ...b.compiles(
    'java-effectively-final-captures',
    2,
    'A lambda can use local variables from the enclosing method only if they are final or effectively final (never reassigned).',
    [
      {
        key: 'reassigned',
        code: `import java.util.List;

public class Main {
    public static void main(String[] args) {
        int total = 0;
        List.of(1, 2, 3).forEach(n -> total += n);
        System.out.println(total);
    }
}`,
        compiles: false,
        why: '`total` is modified inside the lambda, so it is not effectively final: “local variables referenced from a lambda expression must be final or effectively final”. Use a stream reduction (`mapToInt(...).sum()`) instead of mutating a captured variable.',
      },
      {
        key: 'later-change',
        code: `import java.util.function.Supplier;

public class Main {
    public static void main(String[] args) {
        String region = "eu";
        Supplier<String> url = () -> "https://" + region + ".api.example.com";
        region = "us";
        System.out.println(url.get());
    }
}`,
        compiles: false,
        why: 'Even a reassignment after the lambda makes `region` not effectively final, so the capture is rejected. Captured values are copied when the lambda is created, and the rule guarantees that the copy and the variable can never differ.',
      },
      {
        key: 'field',
        code: `import java.util.List;

public class Main {
    private int total = 0;

    void run() {
        List.of(1, 2, 3).forEach(n -> total += n);
        System.out.println(total);
    }

    public static void main(String[] args) {
        new Main().run();
    }
}`,
        compiles: true,
        why: 'The rule applies only to local variables. A lambda can read and modify fields, because it captures `this`, not a copy of the field. It prints `6` (but shared mutable state is not thread-safe in parallel code).',
      },
      {
        key: 'for-each-variable',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Runnable> tasks = new ArrayList<>();
        for (String name : List.of("ada", "linus")) {
            tasks.add(() -> System.out.println("hello " + name));
        }
        tasks.forEach(Runnable::run);
    }
}`,
        compiles: true,
        why: 'In an enhanced `for` loop, each iteration has a fresh, effectively final variable, so capturing `name` is allowed. (A classic `for (int i = ...; i++)` index is reassigned and cannot be captured.) It prints `hello ada` and `hello linus`.',
      },
    ],
  ),
  ...b.blank(
    'java-choose-functional-interface',
    3,
    'Look at what goes in and what comes out: nothing in and a value out, a value in and a boolean out, a value in and nothing out, and so on.',
    [
      {
        key: 'supplier',
        prompt: 'Complete the declaration with the right `java.util.function` interface.',
        template: `import java.util.function.*;

public class Main {
    public static void main(String[] args) {
        {{blank:type}}<String> newOrderId = () -> "ORD-" + 1001;
        System.out.println(newOrderId.get());
    }
}`,
        blanks: { type: ['Supplier'] },
        why: 'The lambda takes no arguments and returns a value, and the code calls `get()`: that is a `Supplier<String>`.',
      },
      {
        key: 'predicate',
        prompt: 'Complete the declaration with the right `java.util.function` interface.',
        template: `import java.util.function.*;

public class Main {
    public static void main(String[] args) {
        {{blank:type}}<Integer> isValidQuantity = q -> q > 0 && q <= 100;
        System.out.println(isValidQuantity.test(42));
    }
}`,
        blanks: { type: ['Predicate'] },
        why: 'One argument in, a `boolean` out, called with `test`: a `Predicate<Integer>`. A `Function<Integer, Boolean>` would also hold the lambda, but it has `apply`, not `test`.',
      },
      {
        key: 'and-then',
        prompt: 'Complete the code so that the discount is applied first and the tax second.',
        template: `import java.util.function.Function;

public class Main {
    public static void main(String[] args) {
        Function<Integer, Integer> discount = price -> price - 10;
        Function<Integer, Integer> tax = price -> price * 2;
        Function<Integer, Integer> pipeline = discount.{{blank:op}}(tax);
        System.out.println(pipeline.apply(100));
    }
}`,
        blanks: { op: ['andThen'] },
        why: '`discount.andThen(tax)` runs `discount` first and passes its result to `tax`: `(100 - 10) * 2 = 180`. `discount.compose(tax)` would run `tax` first and give `190`.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-function-composition',
    3,
    '`f.andThen(g)` runs `f` then `g`; `f.compose(g)` runs `g` then `f`. Predicates combine with `and`, `or` and `negate`.',
    [
      {
        key: 'compose-vs-andthen',
        code: `import java.util.function.Function;

public class Main {
    public static void main(String[] args) {
        Function<Integer, Integer> addFee = x -> x + 5;
        Function<Integer, Integer> doubleIt = x -> x * 2;
        System.out.println(addFee.andThen(doubleIt).apply(10) + " " + addFee.compose(doubleIt).apply(10));
    }
}`,
        correct: '30 25',
        wrong: ['25 30', '30 30', '25 25'],
        why: '`addFee.andThen(doubleIt)` computes `(10 + 5) * 2 = 30`. `addFee.compose(doubleIt)` first doubles, then adds the fee: `10 * 2 + 5 = 25`.',
      },
      {
        key: 'predicates',
        code: `import java.util.List;
import java.util.function.Predicate;

public class Main {
    public static void main(String[] args) {
        Predicate<String> blank = String::isBlank;
        Predicate<String> tooLong = s -> s.length() > 5;
        Predicate<String> valid = blank.negate().and(tooLong.negate());
        System.out.println(List.of("", "ada", "verylongname", " ").stream().filter(valid).toList());
    }
}`,
        correct: '[ada]',
        wrong: ['[, ada,  ]', '[ada, verylongname]', '[verylongname]'],
        why: '`valid` means “not blank and not too long”. The empty string and `" "` are blank, `verylongname` is too long, so only `ada` passes.',
      },
      {
        key: 'identity-chain',
        code: `import java.util.List;
import java.util.function.Function;

public class Main {
    public static void main(String[] args) {
        List<Function<String, String>> steps = List.of(String::strip, String::toLowerCase, s -> s.replace(' ', '-'));
        Function<String, String> slug = Function.identity();
        for (Function<String, String> step : steps) slug = slug.andThen(step);
        System.out.println(slug.apply("  Spring Boot Basics "));
    }
}`,
        correct: 'spring-boot-basics',
        wrong: ['--spring-boot-basics-', 'Spring-Boot-Basics', '  Spring Boot Basics '],
        why: 'Starting from `Function.identity()`, each `andThen` appends a step. The input is stripped first, then lowercased, then spaces become hyphens. Because stripping comes first, there are no leading or trailing hyphens.',
      },
    ],
  ),
  ...b.compiles(
    'java-lambda-checked-exceptions',
    4,
    'The standard functional interfaces do not declare checked exceptions, so a lambda implementing them cannot throw one.',
    [
      {
        key: 'for-each-io',
        code: `import java.io.IOException;
import java.util.List;

public class Main {
    static void upload(String file) throws IOException {
        System.out.println("uploading " + file);
    }

    public static void main(String[] args) throws IOException {
        List.of("a.csv", "b.csv").forEach(f -> upload(f));
    }
}`,
        compiles: false,
        why: '`forEach` takes a `Consumer`, whose `accept` method does not declare `IOException`. Declaring `throws IOException` on `main` does not help, because the exception would be thrown inside the lambda body: “unreported exception java.io.IOException”. Catch it inside the lambda (often wrapping it in `UncheckedIOException`) or use a loop.',
      },
      {
        key: 'wrapped',
        code: `import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;

public class Main {
    static void upload(String file) throws IOException {
        System.out.println("uploading " + file);
    }

    public static void main(String[] args) {
        List.of("a.csv", "b.csv").forEach(f -> {
            try {
                upload(f);
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        });
    }
}`,
        compiles: true,
        why: 'The checked exception is caught inside the lambda and rethrown as the unchecked `UncheckedIOException`, which keeps the original as its cause. This is the standard workaround.',
      },
      {
        key: 'custom-interface',
        code: `import java.io.IOException;

public class Main {
    @FunctionalInterface
    interface IoAction<T> {
        T run() throws IOException;
    }

    static <T> T withRetry(IoAction<T> action) throws IOException {
        try {
            return action.run();
        } catch (IOException first) {
            return action.run();
        }
    }

    public static void main(String[] args) throws IOException {
        System.out.println(withRetry(() -> "downloaded"));
    }
}`,
        compiles: true,
        why: 'A custom functional interface may declare checked exceptions, and then lambdas implementing it may throw them. It prints `downloaded`.',
      },
      {
        key: 'two-abstract',
        code: `public class Main {
    @FunctionalInterface
    interface Validator {
        boolean validate(String value);
        String message();
    }

    public static void main(String[] args) {
        Validator notBlank = v -> !v.isBlank();
        System.out.println(notBlank.validate("x"));
    }
}`,
        compiles: false,
        why: 'A functional interface must have exactly one abstract method. With two, `@FunctionalInterface` is an error (“multiple non-overriding abstract methods found”), and a lambda cannot implement it. Making `message()` a default method would fix it.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-comparator-pitfalls',
    4,
    'A comparator must return negative, zero or positive consistently. What happens to `a - b` when the values are large or of different signs?',
    [
      {
        key: 'subtraction-overflow',
        code: `import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Integer> balances = new ArrayList<>(List.of(2_000_000_000, -2_000_000_000, 0));
        balances.sort((a, b) -> a - b);
        System.out.println(balances);
        balances.sort(Comparator.naturalOrder());
        System.out.println(balances);
    }
}`,
        correct: '[2000000000, -2000000000, 0]\n[-2000000000, 0, 2000000000]',
        wrong: [
          '[-2000000000, 0, 2000000000]\n[-2000000000, 0, 2000000000]',
          '[0, 2000000000, -2000000000]\n[-2000000000, 0, 2000000000]',
          'ArithmeticException: integer overflow',
        ],
        why: '`2_000_000_000 - (-2_000_000_000)` overflows to a positive number, so the comparator claims that `-2_000_000_000` is greater than `2_000_000_000`. With these answers the sort believes the list is already in order and leaves it unchanged. `Integer.compare(a, b)`, `Comparator.naturalOrder()` or `Comparator.comparingInt` never overflow.',
      },
      {
        key: 'reversed-scope',
        code: `import java.util.Comparator;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Employee> staff = List.of(new Employee("ops", 50), new Employee("dev", 70), new Employee("dev", 90));
        Comparator<Employee> byDeptThenSalaryDesc = Comparator.comparing(Employee::dept)
            .thenComparing(Employee::salary).reversed();
        System.out.println(staff.stream().sorted(byDeptThenSalaryDesc).map(Employee::salary).toList());
    }
}

record Employee(String dept, int salary) {}`,
        correct: '[50, 90, 70]',
        wrong: ['[90, 70, 50]', '[70, 90, 50]', '[50, 70, 90]'],
        why: '`reversed()` reverses the whole comparator built so far, so departments are sorted descending too (`ops` before `dev`). To reverse only the salary, write `.thenComparing(Employee::salary, Comparator.reverseOrder())` (or `thenComparing(Comparator.comparingInt(Employee::salary).reversed())`).',
      },
    ],
  ),
  ...b.outputChoice(
    'java-lambda-this',
    5,
    'A lambda does not introduce a new scope for `this`; an anonymous class creates a new object, and `this` refers to it.',
    [
      {
        key: 'lambda-vs-anonymous',
        code: `public class Main {
    public static void main(String[] args) {
        new ReportJob().schedule();
    }
}

class ReportJob {
    @Override
    public String toString() { return "ReportJob"; }

    void schedule() {
        Runnable lambda = () -> System.out.println("lambda: " + this);
        Runnable anonymous = new Runnable() {
            @Override
            public void run() { System.out.println("anonymous: " + this); }

            @Override
            public String toString() { return "AnonymousTask"; }
        };
        lambda.run();
        anonymous.run();
    }
}`,
        correct: 'lambda: ReportJob\nanonymous: AnonymousTask',
        wrong: [
          'lambda: AnonymousTask\nanonymous: AnonymousTask',
          'lambda: ReportJob\nanonymous: ReportJob',
          'It does not compile: this cannot be used in a lambda',
        ],
        why: 'Inside a lambda, `this` means the same as in the enclosing method: the `ReportJob`. An anonymous class is a new object with its own `this`, so the second line prints its overridden `toString`.',
      },
      {
        key: 'captured-state',
        code: `import java.util.function.Supplier;

public class Main {
    public static void main(String[] args) {
        Counter counter = new Counter();
        Supplier<Integer> next = counter::next;
        Supplier<Integer> later = () -> counter.next();
        System.out.println(next.get() + " " + later.get() + " " + next.get());
    }
}

class Counter {
    private int value = 0;
    int next() { return ++value; }
}`,
        correct: '1 2 3',
        wrong: ['1 1 2', '1 1 1', '1 2 2'],
        why: 'Both the bound method reference and the lambda refer to the same `Counter` object; neither copies its state. Each call increments the shared field.',
      },
    ],
  ),
  ...b.fails(
    'java-lambda-debugging',
    3,
    'A lambda runs when it is called, not when it is created. What do the captured values look like at that moment?',
    [
      {
        key: 'deferred-null',
        question: 'A validation rule built at startup fails at run time. Why?',
        code: `import java.util.function.Predicate;

public class Main {
    static class Config {
        String allowedDomain;
    }

    public static void main(String[] args) {
        Config config = new Config();
        Predicate<String> allowed = email -> email.endsWith(config.allowedDomain);
        System.out.println(allowed.test("ada@example.com"));
    }
}`,
        error: 'NullPointerException',
        correct: 'The lambda reads `config.allowedDomain` only when `test` is called, and the field is still `null` then; `endsWith(null)` throws.',
        wrong: [
          'Lambdas cannot read fields of captured objects; copy the value into a local variable first.',
          '`config` is not effectively final, so the lambda sees `null` instead of the object.',
          '`Predicate.test` throws `NullPointerException` whenever the predicate is false.',
        ],
        why: 'Capturing `config` captures the reference; the field is read at call time. Here nobody set `allowedDomain`, so `email.endsWith(null)` throws `NullPointerException`. `config` is effectively final (never reassigned), and lambdas may read any field.',
      },
      {
        key: 'mapper-null',
        question: 'This mapping step fails for one customer. What is the cause?',
        code: `import java.util.List;
import java.util.Map;
import java.util.function.Function;

public class Main {
    public static void main(String[] args) {
        Map<String, String> countryByCity = Map.of("Berlin", "DE", "Paris", "FR");
        Function<String, String> country = countryByCity::get;
        Function<String, String> label = country.andThen(code -> code.toLowerCase());
        for (String city : List.of("Berlin", "Oslo")) {
            System.out.println(label.apply(city));
        }
    }
}`,
        error: 'NullPointerException',
        correct: '`countryByCity.get("Oslo")` returns `null`, and the next function in the chain calls `toLowerCase()` on it.',
        wrong: [
          '`Map::get` cannot be used as a method reference because it takes `Object`.',
          '`andThen` skips the second function when the first returns `null`, so `println(null)` throws.',
          'Function chains are evaluated lazily, so the first city is never processed.',
        ],
        why: 'The first city prints `de`. For `Oslo`, `Map.of(...).get` returns `null` (it only rejects `null` keys), and `andThen` passes that `null` to `code -> code.toLowerCase()`. Functions do not skip `null`; use `Optional` or a default (`getOrDefault`) to handle missing values.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Streams

export const streamsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'java-stream-pipelines',
    1,
    [
      'A stream pipeline has a source, zero or more intermediate operations (`filter`, `map`) and one terminal operation (`toList`, `count`, `sum`).',
    ],
    [
      {
        key: 'filter-map',
        code: `import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<String> emails = List.of("ada@example.com", "invalid", "linus@example.org");
        List<String> domains = emails.stream()
            .filter(e -> e.contains("@"))
            .map(e -> e.substring(e.indexOf('@') + 1))
            .toList();
        System.out.println(domains);
    }
}`,
        output: '[example.com, example.org]',
        why: '`filter` keeps only the strings that contain `@`, `map` turns each email into its domain, and `toList()` collects the results in encounter order.',
      },
      {
        key: 'sum-count',
        code: `import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Order> orders = List.of(new Order("PAID", 120), new Order("NEW", 40), new Order("PAID", 60));
        int paidTotal = orders.stream()
            .filter(o -> o.status().equals("PAID"))
            .mapToInt(Order::total)
            .sum();
        long open = orders.stream().filter(o -> o.status().equals("NEW")).count();
        System.out.println(paidTotal + " " + open);
    }
}

record Order(String status, int total) {}`,
        output: '180 1',
        why: '`mapToInt` produces an `IntStream`, which has `sum()`. `count()` returns a `long`. Each statement creates its own stream from the list.',
      },
      {
        key: 'any-all',
        code: `import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Integer> stock = List.of(5, 0, 12);
        System.out.println(stock.stream().anyMatch(q -> q == 0));
        System.out.println(stock.stream().allMatch(q -> q >= 0));
        System.out.println(stock.stream().noneMatch(q -> q > 100));
        System.out.println(List.<Integer>of().stream().allMatch(q -> q > 100));
    }
}`,
        output: 'true\ntrue\ntrue\ntrue',
        why: '`anyMatch` finds the `0`; every quantity is non-negative; none is above 100. `allMatch` on an empty stream is `true` (there is no counterexample), which surprises many people in validation code.',
      },
    ],
  ),
  ...b.output(
    'java-flatmap-distinct-sorted',
    2,
    [
      '`flatMap` replaces each element with a stream and concatenates the results.',
      '`distinct` removes duplicates using `equals`; `sorted` uses natural order unless you pass a comparator.',
    ],
    [
      {
        key: 'order-lines',
        code: `import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Order> orders = List.of(
            new Order(List.of("pen", "ink")),
            new Order(List.of("paper", "pen")),
            new Order(List.of()));
        List<String> products = orders.stream()
            .flatMap(o -> o.products().stream())
            .distinct()
            .sorted()
            .toList();
        System.out.println(products);
    }
}

record Order(List<String> products) {}`,
        output: '[ink, paper, pen]',
        why: '`flatMap` turns three orders into one stream of four product names (the empty order contributes nothing). `distinct` drops the second `pen`, and `sorted` orders the names alphabetically.',
      },
      {
        key: 'map-vs-flatmap',
        code: `import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<String> lines = List.of("a b", "c");
        System.out.println(lines.stream().map(l -> l.split(" ")).count());
        System.out.println(lines.stream().flatMap(l -> List.of(l.split(" ")).stream()).count());
    }
}`,
        output: '2\n3',
        why: '`map` produces one element (an array) per line, so there are 2 elements. `flatMap` flattens the words of all lines into a single stream of 3 words.',
      },
      {
        key: 'sorted-comparator',
        code: `import java.util.Comparator;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<String> skus = List.of("b-10", "a-2", "c-1", "a-2");
        System.out.println(skus.stream()
            .distinct()
            .sorted(Comparator.comparing(String::length).thenComparing(Comparator.reverseOrder()))
            .toList());
    }
}`,
        output: '[c-1, a-2, b-10]',
        why: '`distinct` removes the duplicate `a-2`. Shorter strings come first; among the three-character strings, `reverseOrder()` puts `c-1` before `a-2`.',
      },
    ],
  ),
  ...b.output(
    'java-stream-reduce',
    2,
    [
      '`reduce(identity, accumulator)` returns a value; `reduce(accumulator)` returns an `Optional` because the stream may be empty.',
      '`max`, `min` and `average` also return optionals.',
    ],
    [
      {
        key: 'identity',
        code: `import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Integer> amounts = List.of(20, 30, 50);
        System.out.println(amounts.stream().reduce(0, Integer::sum));
        System.out.println(List.<Integer>of().stream().reduce(0, Integer::sum));
        System.out.println(amounts.stream().reduce(Integer::sum));
    }
}`,
        output: '100\n0\nOptional[100]',
        why: 'With an identity, an empty stream returns the identity (`0`). Without one, the result is an `Optional`, which prints as `Optional[100]` (or `Optional.empty` for an empty stream).',
      },
      {
        key: 'max-average',
        code: `import java.util.Comparator;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Product> products = List.of(new Product("pen", 3), new Product("desk", 120), new Product("lamp", 45));
        System.out.println(products.stream().max(Comparator.comparingInt(Product::price)).map(Product::name).orElse("none"));
        System.out.println(products.stream().mapToInt(Product::price).average().orElse(0));
        System.out.println(products.stream().filter(p -> p.price() > 500).findFirst().isPresent());
    }
}

record Product(String name, int price) {}`,
        output: 'desk\n56.0\nfalse',
        why: '`max` returns an `Optional<Product>`; mapping it to the name gives `desk`. `average()` on an `IntStream` returns an `OptionalDouble`: `(3 + 120 + 45) / 3 = 56.0`. No product costs more than 500, so `findFirst` is empty.',
      },
      {
        key: 'string-join',
        code: `import java.util.List;
import java.util.stream.Collectors;

public class Main {
    public static void main(String[] args) {
        List<String> tags = List.of("java", "spring", "sql");
        System.out.println(tags.stream().reduce("", (a, b) -> a + "," + b));
        System.out.println(tags.stream().collect(Collectors.joining(",", "[", "]")));
    }
}`,
        output: ',java,spring,sql\n[java,spring,sql]',
        why: 'The identity `""` is combined with the first element too, so the reduction starts with a comma. `Collectors.joining` handles separators, prefix and suffix correctly (and efficiently).',
      },
    ],
  ),
  ...b.output(
    'java-collectors-grouping',
    3,
    [
      '`groupingBy(classifier)` builds a `Map<K, List<T>>`; a second collector (`counting`, `summingInt`, `mapping`) changes what each group holds.',
      'Pass `TreeMap::new` as the map factory when the key order matters.',
    ],
    [
      {
        key: 'counting',
        code: `import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

public class Main {
    public static void main(String[] args) {
        List<Order> orders = List.of(new Order("EU", 100), new Order("US", 250), new Order("EU", 40));
        Map<String, Long> counts = orders.stream().collect(
            Collectors.groupingBy(Order::region, TreeMap::new, Collectors.counting()));
        Map<String, Integer> sums = orders.stream().collect(
            Collectors.groupingBy(Order::region, TreeMap::new, Collectors.summingInt(Order::total)));
        System.out.println(counts);
        System.out.println(sums);
    }
}

record Order(String region, int total) {}`,
        output: '{EU=2, US=1}\n{EU=140, US=250}',
        why: 'The downstream collector decides each group’s value: `counting()` gives a `Long` count and `summingInt` adds the totals. `TreeMap::new` sorts the keys, so the output order is deterministic.',
      },
      {
        key: 'mapping',
        code: `import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

public class Main {
    public static void main(String[] args) {
        List<Employee> staff = List.of(new Employee("Ada", "dev"), new Employee("Grace", "ops"), new Employee("Linus", "dev"));
        Map<String, String> namesByTeam = staff.stream().collect(Collectors.groupingBy(
            Employee::team,
            TreeMap::new,
            Collectors.mapping(Employee::name, Collectors.joining("+"))));
        System.out.println(namesByTeam);
    }
}

record Employee(String name, String team) {}`,
        output: '{dev=Ada+Linus, ops=Grace}',
        why: '`mapping` transforms each element before handing it to the next collector, here `joining`. Without it, each group would be a list of `Employee` records.',
      },
      {
        key: 'partitioning',
        code: `import java.util.List;
import java.util.stream.Collectors;

public class Main {
    public static void main(String[] args) {
        List<Integer> totals = List.of(15, 220, 90, 1000);
        System.out.println(totals.stream().collect(Collectors.partitioningBy(t -> t >= 100)));
        System.out.println(List.<Integer>of().stream().collect(Collectors.partitioningBy(t -> t >= 100)));
    }
}`,
        output: '{false=[15, 90], true=[220, 1000]}\n{false=[], true=[]}',
        why: '`partitioningBy` always produces a map with exactly the keys `false` and `true`, even when one (or both) partitions are empty, unlike `groupingBy`, which only has keys that occurred.',
      },
    ],
  ),
  ...b.fails(
    'java-tomap-duplicates',
    3,
    '`Collectors.toMap(keyMapper, valueMapper)` assumes every key is unique.',
    [
      {
        key: 'duplicate-key',
        question: 'Building a lookup map from imported customers fails. What is the cause and the fix?',
        code: `import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class Main {
    public static void main(String[] args) {
        List<Customer> customers = List.of(
            new Customer("ada@example.com", "Ada"),
            new Customer("linus@example.com", "Linus"),
            new Customer("ada@example.com", "Ada L."));
        Map<String, String> nameByEmail = customers.stream()
            .collect(Collectors.toMap(Customer::email, Customer::name));
        System.out.println(nameByEmail.size());
    }
}

record Customer(String email, String name) {}`,
        error: 'IllegalStateException: Duplicate key ada@example.com',
        correct: 'Two customers share an email, and two-argument `toMap` throws on a duplicate key; decide which wins with a merge function, for example `toMap(Customer::email, Customer::name, (first, second) -> second)`.',
        wrong: [
          '`toMap` keeps the last value for each key, so the exception comes from `size()`.',
          'Records cannot be used as stream elements with `toMap`; use `groupingBy`.',
          'The map returned by `toMap` is unmodifiable, so the second insert fails.',
        ],
        why: 'Unlike `Map.put`, the two-argument `toMap` refuses duplicates with `IllegalStateException: Duplicate key ...` (the message includes the key). A merge function makes the rule explicit; `groupingBy` is the alternative when all values should be kept.',
      },
      {
        key: 'null-value',
        question: 'This map of optional nicknames fails. Why?',
        code: `import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class Main {
    public static void main(String[] args) {
        List<User> users = List.of(new User("u1", "ace"), new User("u2", null));
        Map<String, String> nicknames = users.stream()
            .collect(Collectors.toMap(User::id, User::nickname));
        System.out.println(nicknames);
    }
}

record User(String id, String nickname) {}`,
        error: 'NullPointerException',
        correct: '`Collectors.toMap` does not accept `null` values (it uses `Map.merge` internally), so the user without a nickname makes it throw; filter those users out or map `null` to a default.',
        wrong: [
          '`HashMap` cannot store `null` values.',
          'Records with `null` components cannot be created.',
          '`User::nickname` cannot be used as a method reference because it may return `null`.',
        ],
        why: '`HashMap` itself allows `null` values, but `Collectors.toMap` rejects them with a `NullPointerException`. Filter (`.filter(u -> u.nickname() != null)`) or substitute a default before collecting.',
      },
    ],
  ),
  ...b.fails(
    'java-stream-reuse',
    2,
    'A stream is a one-shot pipeline: after a terminal operation, it is consumed.',
    [
      {
        key: 'two-terminals',
        question: 'Why does this report fail on the second line?',
        code: `import java.util.List;
import java.util.stream.Stream;

public class Main {
    public static void main(String[] args) {
        Stream<Integer> totals = List.of(120, 40, 300).stream().filter(t -> t > 50);
        System.out.println(totals.count());
        System.out.println(totals.mapToInt(Integer::intValue).sum());
    }
}`,
        error: 'IllegalStateException: stream has already been operated upon or closed',
        correct: 'A stream can be consumed only once; `count()` consumed it, so create a new stream for the sum (or collect to a list first and reuse the list).',
        wrong: [
          '`count()` removes the elements from the source list, so the sum has nothing left.',
          '`filter` returns a new stream each time it is read, so the sum sees unfiltered data.',
          'Streams of `Integer` cannot be converted with `mapToInt`.',
        ],
        why: 'Streams are not collections: they do not store elements and cannot be traversed twice. The source list is unchanged. Keep a `Supplier<Stream<T>>` or reuse the source collection when you need several results.',
      },
      {
        key: 'stored-field',
        question: 'A service caches a stream in a field. Why does the second call fail?',
        code: `import java.util.List;
import java.util.stream.Stream;

public class Main {
    public static void main(String[] args) {
        ProductCatalog catalog = new ProductCatalog(List.of("pen", "ink", "paper"));
        System.out.println(catalog.startingWith("p"));
        System.out.println(catalog.startingWith("i"));
    }
}

class ProductCatalog {
    private final Stream<String> products;

    ProductCatalog(List<String> names) {
        this.products = names.stream();
    }

    List<String> startingWith(String prefix) {
        return products.filter(n -> n.startsWith(prefix)).toList();
    }
}`,
        error: 'IllegalStateException',
        correct: 'The field holds one stream, which the first call consumes; store the `List` and call `stream()` in each method call.',
        wrong: [
          'The `final` field prevents the stream from being filtered twice; remove `final`.',
          '`filter` on a field is not thread-safe, so the second call is rejected.',
          '`List.of` sources can only be streamed once.',
        ],
        why: 'The first call links `filter` to the stream and consumes it with `toList()`; the second call tries to link another operation to the same stream and gets `IllegalStateException: stream has already been operated upon or closed`. Store data, not streams; a list can produce any number of streams.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-sorting-with-comparators',
    3,
    'Build comparators from key extractors: `comparing` for the first key, `thenComparing` for ties, `reversed()` or `reverseOrder()` to flip.',
    [
      {
        key: 'then-comparing',
        code: `import java.util.Comparator;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Ticket> tickets = List.of(
            new Ticket("T3", 2, "2024-03-02"),
            new Ticket("T1", 1, "2024-03-05"),
            new Ticket("T2", 2, "2024-03-01"));
        System.out.println(tickets.stream()
            .sorted(Comparator.comparingInt(Ticket::priority).thenComparing(Ticket::created))
            .map(Ticket::id)
            .toList());
    }
}

record Ticket(String id, int priority, String created) {}`,
        correct: '[T1, T2, T3]',
        wrong: ['[T1, T3, T2]', '[T2, T3, T1]', '[T3, T2, T1]'],
        why: 'Priority `1` comes first (`T1`). `T2` and `T3` tie on priority, so `thenComparing(Ticket::created)` orders them by date string: `2024-03-01` before `2024-03-02`.',
      },
      {
        key: 'nulls',
        code: `import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<String> managers = new ArrayList<>(Arrays.asList("Grace", null, "Ada"));
        managers.sort(Comparator.nullsLast(Comparator.naturalOrder()));
        System.out.println(managers);
    }
}`,
        correct: '[Ada, Grace, null]',
        wrong: ['[null, Ada, Grace]', 'NullPointerException', '[Grace, Ada, null]'],
        why: '`Comparator.naturalOrder()` alone would throw on `null`. `nullsLast` wraps it: `null` values go to the end and the rest are compared normally.',
      },
      {
        key: 'reverse-key',
        code: `import java.util.Comparator;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Product> products = List.of(new Product("pen", 3), new Product("lamp", 45), new Product("ink", 3));
        System.out.println(products.stream()
            .sorted(Comparator.comparing(Product::price, Comparator.reverseOrder()).thenComparing(Product::name))
            .map(Product::name)
            .toList());
    }
}

record Product(String name, int price) {}`,
        correct: '[lamp, ink, pen]',
        wrong: ['[lamp, pen, ink]', '[ink, pen, lamp]', '[pen, ink, lamp]'],
        why: 'Passing `Comparator.reverseOrder()` as the key comparator reverses only the price: most expensive first. The tie between `pen` and `ink` is broken by name, ascending.',
      },
    ],
  ),
  ...b.output(
    'java-stream-laziness',
    4,
    [
      'Intermediate operations do nothing until a terminal operation runs. Then each element flows through the whole pipeline before the next one starts.',
      'Short-circuiting operations (`findFirst`, `anyMatch`, `limit`) stop pulling elements as soon as the result is known.',
    ],
    [
      {
        key: 'no-terminal',
        code: `import java.util.List;
import java.util.stream.Stream;

public class Main {
    public static void main(String[] args) {
        Stream<String> pipeline = List.of("a", "b").stream()
            .peek(s -> System.out.println("peek " + s))
            .map(String::toUpperCase);
        System.out.println("built");
        System.out.println(pipeline.toList());
    }
}`,
        output: 'built\npeek a\npeek b\n[A, B]',
        why: 'Building the pipeline runs nothing; `built` is printed first. The `peek` actions run only when the terminal `toList()` pulls elements through.',
      },
      {
        key: 'vertical',
        code: `import java.util.List;

public class Main {
    public static void main(String[] args) {
        List.of(1, 2, 3).stream()
            .filter(n -> {
                System.out.println("filter " + n);
                return n != 2;
            })
            .map(n -> {
                System.out.println("map " + n);
                return n * 10;
            })
            .forEach(n -> System.out.println("got " + n));
    }
}`,
        output: 'filter 1\nmap 1\ngot 10\nfilter 2\nfilter 3\nmap 3\ngot 30',
        why: 'Streams process element by element, not stage by stage: `1` goes through `filter`, `map` and `forEach` before `2` is even filtered. `2` is rejected by the filter, so it never reaches `map`.',
      },
      {
        key: 'short-circuit',
        code: `import java.util.List;

public class Main {
    public static void main(String[] args) {
        String first = List.of("ok", "slow", "fail", "ok").stream()
            .peek(s -> System.out.println("check " + s))
            .filter(s -> s.length() > 2)
            .findFirst()
            .orElse("none");
        System.out.println(first);
    }
}`,
        output: 'check ok\ncheck slow\nslow',
        why: '`findFirst` stops as soon as one element passes the filter. `fail` and the last `ok` are never even looked at, which also makes infinite streams usable with short-circuiting operations.',
      },
    ],
  ),
  ...b.codeChoice(
    'java-stream-side-effects',
    4,
    'Prefer pipelines that compute a result (collect, reduce) over lambdas that modify outside state.',
    [
      {
        key: 'foreach-add',
        question: 'A reviewer suggests changing this code. Which is the best version and reason?',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Integer> totals = List.of(120, 40, 300);
        List<Integer> large = new ArrayList<>();
        totals.stream().filter(t -> t > 100).forEach(t -> large.add(t));
        System.out.println(large);
    }
}`,
        correct: '`List<Integer> large = totals.stream().filter(t -> t > 100).toList();` because the stream should produce the result instead of mutating an external list, which also breaks if the stream is ever made parallel.',
        wrong: [
          'Keep `forEach`, but use `parallelStream()` to make the external `add` calls faster.',
          'Replace `forEach` with `peek(large::add)`, which is the intended way to collect into a list.',
          'Nothing: `forEach` with an external list is the only way to get a `List` from a stream.',
        ],
        why: 'Mutating shared state from a stream lambda is fragile: an `ArrayList` is not thread-safe, so a parallel stream could lose elements or throw. `toList()` (or `collect(Collectors.toList())`) states the intent and is safe. `peek` is meant for debugging, and it may not run at all for some pipelines.',
      },
      {
        key: 'counter',
        question: 'This code needs the number of failed payments. What is the problem and the best fix?',
        code: `import java.util.List;

public class Main {
    static int failures = 0;

    public static void main(String[] args) {
        List<String> results = List.of("OK", "FAILED", "OK", "FAILED");
        results.stream().map(String::toLowerCase).forEach(r -> {
            if (r.equals("failed")) failures++;
        });
        System.out.println(failures);
    }
}`,
        correct: 'It uses a static field as a hidden accumulator; compute it directly with `results.stream().filter("FAILED"::equals).count()`.',
        wrong: [
          'The lambda cannot modify `failures`, so the program prints `0`.',
          '`map` runs after `forEach`, so the comparison is made against uppercase strings.',
          'Make `failures` `volatile` so the stream counts correctly.',
        ],
        why: 'It prints `2` today, but the count lives in shared mutable state: running the method twice, or in parallel, gives wrong results. `filter(...).count()` expresses the calculation as the stream’s result. Fields may be modified from lambdas (only locals must be effectively final), and `volatile` does not make `++` atomic.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-stateful-operations',
    5,
    'Stateless operations pass elements along one at a time. Which operations must see every element before they can emit the first one?',
    [
      {
        key: 'sorted-barrier',
        code: `import java.util.List;

public class Main {
    public static void main(String[] args) {
        List.of("c", "a", "b").stream()
            .peek(s -> System.out.print("p" + s + " "))
            .sorted()
            .forEach(s -> System.out.print("f" + s + " "));
        System.out.println();
    }
}`,
        correct: 'pc pa pb fa fb fc',
        wrong: ['pc fc pa fa pb fb', 'pa fa pb fb pc fc', 'pc pa pb fc fa fb'],
        why: '`sorted()` is a stateful operation: it must receive all elements before it can emit the smallest one. So every `peek` runs first, then `forEach` sees the elements in sorted order.',
      },
      {
        key: 'limit-infinite',
        code: `import java.util.stream.Stream;

public class Main {
    public static void main(String[] args) {
        System.out.println(Stream.iterate(1, n -> n * 3)
            .filter(n -> n % 2 == 1)
            .map(n -> n + 1)
            .limit(4)
            .toList());
    }
}`,
        correct: '[2, 4, 10, 28]',
        wrong: ['It never terminates', '[1, 3, 9, 27]', '[2, 4, 10, 28, 82]'],
        why: '`Stream.iterate` is infinite, but `limit(4)` short-circuits: after four elements pass, no more are generated. Every power of 3 is odd, so the filter keeps them all, and `map` adds 1.',
      },
      {
        key: 'to-list-unmodifiable',
        code: `import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

public class Main {
    public static void main(String[] args) {
        List<String> a = List.of("x").stream().collect(Collectors.toCollection(ArrayList::new));
        a.add("y");
        List<String> b = List.of("x").stream().toList();
        try {
            b.add("y");
            System.out.println(a.size() + " " + b.size());
        } catch (UnsupportedOperationException e) {
            System.out.println(a.size() + " read-only");
        }
    }
}`,
        correct: '2 read-only',
        wrong: ['2 2', '1 read-only', '2 1'],
        why: '`Stream.toList()` (Java 16) returns an unmodifiable list. `Collectors.toCollection(ArrayList::new)` guarantees a mutable `ArrayList`. (`Collectors.toList()` gives no guarantee either way, so do not rely on mutating its result.)',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Optional

export const optionalFamilies: readonly QuestionSource[] = [
  ...b.output(
    'java-optional-basics',
    1,
    [
      '`Optional.of(x)` needs a non-null value; `Optional.ofNullable(x)` is empty for `null`; `Optional.empty()` is always empty.',
      '`orElse` returns the value, or the fallback when empty.',
    ],
    [
      {
        key: 'create',
        code: `import java.util.Optional;

public class Main {
    public static void main(String[] args) {
        Optional<String> nickname = Optional.ofNullable(null);
        Optional<String> name = Optional.of("Ada");
        System.out.println(nickname.isPresent() + " " + name.isPresent());
        System.out.println(nickname.orElse("anonymous") + " " + name.orElse("anonymous"));
    }
}`,
        output: 'false true\nanonymous Ada',
        why: '`ofNullable(null)` is an empty `Optional`, so `orElse` returns the fallback. `name` contains `Ada`, so the fallback is ignored.',
      },
      {
        key: 'repository',
        code: `import java.util.Map;
import java.util.Optional;

public class Main {
    static final Map<Integer, String> EMAILS = Map.of(1, "ada@example.com");

    static Optional<String> findEmail(int customerId) {
        return Optional.ofNullable(EMAILS.get(customerId));
    }

    public static void main(String[] args) {
        System.out.println(findEmail(1).orElse("-"));
        System.out.println(findEmail(2).isEmpty());
        findEmail(1).ifPresent(e -> System.out.println("send to " + e));
        findEmail(2).ifPresent(e -> System.out.println("send to " + e));
    }
}`,
        output: 'ada@example.com\ntrue\nsend to ada@example.com',
        why: 'Returning `Optional` makes “not found” explicit in the method signature. `ifPresent` runs its action only when there is a value, so nothing is printed for customer 2.',
      },
      {
        key: 'print',
        code: `import java.util.Optional;

public class Main {
    public static void main(String[] args) {
        System.out.println(Optional.of(42));
        System.out.println(Optional.empty());
        System.out.println(Optional.of(42).equals(Optional.of(42)));
    }
}`,
        output: 'Optional[42]\nOptional.empty\ntrue',
        why: 'An `Optional` prints as `Optional[value]` or `Optional.empty`, which is a common surprise when an `Optional` ends up in a log message or JSON. Two optionals with equal values are `equals`.',
      },
    ],
  ),
  ...b.output(
    'java-optional-transformations',
    2,
    [
      '`map` transforms the value if present; `filter` keeps it only if a condition holds.',
      'Use `flatMap` when the function itself returns an `Optional`.',
    ],
    [
      {
        key: 'map-filter',
        code: `import java.util.Optional;

public class Main {
    static String discountLabel(Optional<Integer> percent) {
        return percent
            .filter(p -> p > 0)
            .map(p -> p + "% off")
            .orElse("no discount");
    }

    public static void main(String[] args) {
        System.out.println(discountLabel(Optional.of(15)));
        System.out.println(discountLabel(Optional.of(0)));
        System.out.println(discountLabel(Optional.empty()));
    }
}`,
        output: '15% off\nno discount\nno discount',
        why: '`filter` turns `Optional[0]` into an empty optional, and `map` is skipped for empty optionals. Both cases end in the `orElse` fallback.',
      },
      {
        key: 'flat-map',
        code: `import java.util.Map;
import java.util.Optional;

public class Main {
    static final Map<String, String> MANAGER = Map.of("ada", "grace");
    static final Map<String, String> EMAIL = Map.of("grace", "grace@example.com");

    static Optional<String> managerOf(String user) { return Optional.ofNullable(MANAGER.get(user)); }
    static Optional<String> emailOf(String user) { return Optional.ofNullable(EMAIL.get(user)); }

    public static void main(String[] args) {
        System.out.println(managerOf("ada").flatMap(Main::emailOf).orElse("none"));
        System.out.println(managerOf("grace").flatMap(Main::emailOf).orElse("none"));
        System.out.println(managerOf("ada").map(Main::emailOf));
    }
}`,
        output: 'grace@example.com\nnone\nOptional[Optional[grace@example.com]]',
        why: '`flatMap` chains lookups that each return an `Optional` without nesting. Grace has no manager, so the chain is empty. With `map`, the result would be an `Optional<Optional<String>>`.',
      },
      {
        key: 'map-null',
        code: `import java.util.Optional;

public class Main {
    public static void main(String[] args) {
        Optional<Customer> customer = Optional.of(new Customer("Ada", null));
        System.out.println(customer.map(Customer::phone).orElse("no phone"));
        System.out.println(customer.map(Customer::name).map(String::length).orElse(0));
    }
}

record Customer(String name, String phone) {}`,
        output: 'no phone\n3',
        why: 'If the mapping function returns `null`, `map` returns an empty `Optional` instead of throwing. So a chain of `map` calls safely navigates through possibly-null properties.',
      },
    ],
  ),
  ...b.fails(
    'java-optional-failures',
    2,
    'Which `Optional` methods throw, and for what input?',
    [
      {
        key: 'get-empty',
        question: 'This order lookup throws for an unknown id. Why, and what is the better way to write it?',
        code: `import java.util.Map;
import java.util.Optional;

public class Main {
    static final Map<String, Integer> TOTALS = Map.of("o-1", 120);

    static Optional<Integer> findTotal(String id) {
        return Optional.ofNullable(TOTALS.get(id));
    }

    public static void main(String[] args) {
        System.out.println(findTotal("o-1").get());
        System.out.println(findTotal("o-2").get());
    }
}`,
        error: 'NoSuchElementException: No value present',
        correct: '`get()` on an empty `Optional` throws `NoSuchElementException`; use `orElseThrow(() -> new OrderNotFoundException(id))`, `orElse` or `ifPresent` to handle the empty case explicitly.',
        wrong: [
          '`get()` returns `null` for an empty `Optional`, and `println(null)` throws.',
          '`Optional.ofNullable` throws for a missing key, so use `Optional.of`.',
          'Optionals cannot hold `Integer` values; use `OptionalInt`.',
        ],
        why: '`get()` (like the no-argument `orElseThrow()`) throws `NoSuchElementException: No value present` when empty. Calling it without checking defeats the purpose of `Optional`. Prefer methods that force you to say what happens when the value is missing.',
      },
      {
        key: 'of-null',
        question: 'A refactoring introduced `Optional`, and now this code throws. Why?',
        code: `import java.util.Map;
import java.util.Optional;

public class Main {
    static final Map<String, String> CITIES = Map.of("ada", "London");

    static Optional<String> cityOf(String user) {
        return Optional.of(CITIES.get(user));
    }

    public static void main(String[] args) {
        System.out.println(cityOf("ada").orElse("unknown"));
        System.out.println(cityOf("linus").orElse("unknown"));
    }
}`,
        error: 'NullPointerException',
        correct: '`Optional.of` requires a non-null value; `CITIES.get("linus")` is `null`, so use `Optional.ofNullable`.',
        wrong: [
          '`orElse` throws when the `Optional` is empty.',
          '`Map.of` throws `NullPointerException` for a missing key.',
          'An `Optional` returned from a static method cannot be empty.',
        ],
        why: '`Optional.of(null)` throws `NullPointerException` immediately: `of` is for values you know are present. `ofNullable` maps `null` to `Optional.empty()`. `orElse` never throws.',
      },
      {
        key: 'or-else-throw',
        question: 'What does this program report, and is it a good use of `Optional`?',
        code: `import java.util.List;
import java.util.Optional;

public class Main {
    record User(String email, boolean active) {}

    static Optional<User> findActive(List<User> users, String email) {
        return users.stream().filter(u -> u.email().equals(email) && u.active()).findFirst();
    }

    public static void main(String[] args) {
        List<User> users = List.of(new User("ada@example.com", false));
        User user = findActive(users, "ada@example.com")
            .orElseThrow(() -> new IllegalArgumentException("No active user ada@example.com"));
        System.out.println(user);
    }
}`,
        error: 'IllegalArgumentException: No active user ada@example.com',
        correct: 'The only user is inactive, so the `Optional` is empty and `orElseThrow` throws the specified exception with a clear message; this is a good use when a missing value is an error for this caller.',
        wrong: [
          '`orElseThrow` always throws `NoSuchElementException`, whatever supplier is passed.',
          '`findFirst` returns `null` when nothing matches, so `orElseThrow` is never reached.',
          'It prints `null`, because `orElseThrow` only throws for `Optional.of(null)`.',
        ],
        why: '`orElseThrow(supplier)` throws the exception the supplier creates, so the caller can choose a meaningful, domain-specific exception. `findFirst` returns an empty `Optional`, never `null`.',
      },
    ],
  ),
  ...b.output(
    'java-orelse-vs-orelseget',
    3,
    [
      'Arguments are evaluated before a method is called, so the argument of `orElse` is computed even when it is not needed.',
      '`orElseGet` takes a `Supplier` and calls it only when the `Optional` is empty.',
    ],
    [
      {
        key: 'eager',
        code: `import java.util.Optional;

public class Main {
    static String loadDefaultFromDatabase() {
        System.out.println("querying database");
        return "default";
    }

    public static void main(String[] args) {
        Optional<String> cached = Optional.of("cached");
        System.out.println(cached.orElse(loadDefaultFromDatabase()));
        System.out.println(cached.orElseGet(() -> loadDefaultFromDatabase()));
    }
}`,
        output: 'querying database\ncached\ncached',
        why: '`orElse(loadDefaultFromDatabase())` calls the method first, because it is an ordinary argument, even though the `Optional` has a value. `orElseGet` receives a supplier and does not call it. Use `orElseGet` when the fallback is expensive or has side effects.',
      },
      {
        key: 'empty',
        code: `import java.util.Optional;

public class Main {
    static int counter = 0;

    static String newId() {
        counter++;
        return "id-" + counter;
    }

    public static void main(String[] args) {
        Optional<String> none = Optional.empty();
        Optional<String> some = Optional.of("id-0");
        System.out.println(none.orElseGet(Main::newId));
        System.out.println(some.orElseGet(Main::newId));
        System.out.println(some.orElse(newId()));
        System.out.println(counter);
    }
}`,
        output: 'id-1\nid-0\nid-0\n2',
        why: 'The empty optional calls the supplier (`id-1`). `some.orElseGet` does not call it. `some.orElse(newId())` returns `id-0` but still runs `newId()`, so the counter ends at 2: a side effect that happened for nothing.',
      },
      {
        key: 'or',
        code: `import java.util.Optional;

public class Main {
    static Optional<String> fromCache(String key) {
        System.out.println("cache " + key);
        return Optional.empty();
    }

    static Optional<String> fromDatabase(String key) {
        System.out.println("database " + key);
        return Optional.of("value-" + key);
    }

    public static void main(String[] args) {
        String v = fromCache("k1").or(() -> fromDatabase("k1")).orElse("missing");
        System.out.println(v);
    }
}`,
        output: 'cache k1\ndatabase k1\nvalue-k1',
        why: '`or` (Java 9) takes a supplier of another `Optional` and calls it only when the first is empty, which makes lazy fallback chains easy: cache first, then the database.',
      },
    ],
  ),
  ...b.compiles(
    'java-optional-types',
    3,
    'An `Optional<T>` is not a `T`. Check what each method returns.',
    [
      {
        key: 'assign',
        code: `import java.util.Optional;

public class Main {
    static Optional<String> findName(int id) {
        return id == 1 ? Optional.of("Ada") : Optional.empty();
    }

    public static void main(String[] args) {
        String name = findName(1);
        System.out.println(name);
    }
}`,
        compiles: false,
        why: 'An `Optional<String>` cannot be assigned to a `String`. The caller must decide what happens when the value is missing (`orElse`, `orElseThrow`, ...), which is the point of returning `Optional`.',
      },
      {
        key: 'map-nested',
        code: `import java.util.Optional;

public class Main {
    static Optional<String> findEmail(String user) {
        return Optional.of(user + "@example.com");
    }

    public static void main(String[] args) {
        Optional<String> email = Optional.of("ada").map(Main::findEmail);
        System.out.println(email.orElse("none"));
    }
}`,
        compiles: false,
        why: '`map` wraps the function’s result, and the function already returns an `Optional`, so the result is an `Optional<Optional<String>>`, which cannot be assigned to `Optional<String>`. Use `flatMap`.',
      },
      {
        key: 'flat-map',
        code: `import java.util.Optional;

public class Main {
    static Optional<String> findEmail(String user) {
        return Optional.of(user + "@example.com");
    }

    public static void main(String[] args) {
        Optional<String> email = Optional.of("ada").flatMap(Main::findEmail);
        System.out.println(email.orElse("none"));
    }
}`,
        compiles: true,
        why: '`flatMap` expects a function that returns an `Optional` and does not wrap it again. It prints `ada@example.com`.',
      },
      {
        key: 'primitive',
        code: `import java.util.List;
import java.util.OptionalInt;

public class Main {
    public static void main(String[] args) {
        OptionalInt max = List.of(3, 8, 5).stream().mapToInt(Integer::intValue).max();
        int value = max.orElse(0);
        System.out.println(value + max.getAsInt());
    }
}`,
        compiles: true,
        why: 'Primitive streams return primitive optionals such as `OptionalInt`, whose accessors are `getAsInt()` and `orElse(int)`. It prints `16`.',
      },
    ],
  ),
  ...b.codeChoice(
    'java-optional-design',
    4,
    '`Optional` is designed as a return type for “there might be no result”. Is it used that way here?',
    [
      {
        key: 'field',
        question: 'A team stores an optional middle name like this. What is the recommended design?',
        code: `import java.util.Optional;

public class Main {
    public static void main(String[] args) {
        Person p = new Person("Ada", Optional.empty());
        System.out.println(p.middleName().orElse("-"));
    }
}

class Person {
    private final String firstName;
    private final Optional<String> middleName;

    Person(String firstName, Optional<String> middleName) {
        this.firstName = firstName;
        this.middleName = middleName;
    }

    Optional<String> middleName() { return middleName; }
}`,
        correct: 'Store a nullable `String` field and pass a plain `String` (or `null`) to the constructor; return `Optional.ofNullable(middleName)` from the getter.',
        wrong: [
          'Keep the `Optional` field and also make the getter return `Optional<Optional<String>>` for full safety.',
          'Replace `Optional<String>` with `Optional<Object>` so any value can be stored.',
          'The design is ideal: `Optional` is meant for fields and parameters, and is serializable.',
        ],
        why: '`Optional` is intended as a method return type. As a field it adds an allocation, is not `Serializable`, and many frameworks (JPA, older Jackson setups) do not expect it; as a parameter it forces callers to wrap values and can itself be `null`. A nullable field with an `Optional`-returning getter keeps the API explicit.',
      },
      {
        key: 'collection',
        question: 'A repository method returns `Optional<List<Order>>` for “orders of a customer”. What should it return instead?',
        code: `import java.util.List;
import java.util.Map;
import java.util.Optional;

public class Main {
    static final Map<String, List<String>> ORDERS = Map.of("ada", List.of("o-1"));

    static Optional<List<String>> ordersOf(String customer) {
        return Optional.ofNullable(ORDERS.get(customer));
    }

    public static void main(String[] args) {
        System.out.println(ordersOf("linus").map(List::size).orElse(0));
    }
}`,
        correct: 'A plain `List<String>` that is empty when there are no orders, for example `ORDERS.getOrDefault(customer, List.of())`.',
        wrong: [
          '`Optional<Optional<List<String>>>`, to distinguish “no customer” from “no orders”.',
          '`null` when there are no orders, because an empty list wastes memory.',
          '`Optional<String>` with the order ids joined by commas.',
        ],
        why: 'An empty collection already means “nothing”. Wrapping it in `Optional` gives callers two ways to express no results and extra unwrapping work. Return empty collections, never `null`, and keep `Optional` for single results such as `findById`.',
      },
      {
        key: 'is-present-get',
        question: 'Which rewrite of this code is the most idiomatic?',
        code: `import java.util.Optional;

public class Main {
    static Optional<String> findCoupon(String customer) {
        return customer.equals("ada") ? Optional.of("SAVE10") : Optional.empty();
    }

    public static void main(String[] args) {
        Optional<String> coupon = findCoupon("ada");
        String label;
        if (coupon.isPresent()) {
            label = "Coupon: " + coupon.get();
        } else {
            label = "No coupon";
        }
        System.out.println(label);
    }
}`,
        correct: '`String label = findCoupon("ada").map(c -> "Coupon: " + c).orElse("No coupon");`',
        wrong: [
          '`String label = findCoupon("ada").get() != null ? "Coupon: " + findCoupon("ada").get() : "No coupon";`',
          '`String label = "Coupon: " + findCoupon("ada").orElse(null);`',
          '`String label = findCoupon("ada").isPresent() ? "No coupon" : "Coupon: " + findCoupon("ada").get();`',
        ],
        why: '`map` plus `orElse` expresses the transformation and the fallback in one expression without `get()`. The second option throws for an empty optional, the third prints `Coupon: null`, and the fourth inverts the logic and still calls `get()` on an empty optional.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-optional-streams',
    5,
    '`Optional.stream()` turns an optional into a stream of zero or one element, which works well with `flatMap`.',
    [
      {
        key: 'flatmap-stream',
        code: `import java.util.List;
import java.util.Map;
import java.util.Optional;

public class Main {
    static final Map<String, Integer> PRICES = Map.of("pen", 3, "lamp", 45);

    static Optional<Integer> price(String sku) {
        return Optional.ofNullable(PRICES.get(sku));
    }

    public static void main(String[] args) {
        int total = List.of("pen", "unknown", "lamp", "pen").stream()
            .map(Main::price)
            .flatMap(Optional::stream)
            .mapToInt(Integer::intValue)
            .sum();
        System.out.println(total);
    }
}`,
        correct: '51',
        wrong: ['48', 'NoSuchElementException: No value present', '0'],
        why: '`Optional::stream` produces one element for a present value and none for an empty one, so `flatMap` drops the unknown SKU: `3 + 45 + 3 = 51`.',
      },
      {
        key: 'if-present-or-else',
        code: `import java.util.List;
import java.util.Optional;

public class Main {
    public static void main(String[] args) {
        for (Optional<String> o : List.of(Optional.of("ok"), Optional.<String>empty())) {
            o.ifPresentOrElse(
                v -> System.out.println("value " + v),
                () -> System.out.println("empty"));
        }
    }
}`,
        correct: 'value ok\nempty',
        wrong: ['value ok', 'value ok\nvalue null', 'empty\nempty'],
        why: '`ifPresentOrElse` (Java 9) runs the first action with the value, or the second action when the optional is empty.',
      },
      {
        key: 'find-first-null',
        code: `import java.util.Arrays;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<String> middleNames = Arrays.asList(null, "Lovelace");
        try {
            System.out.println(middleNames.stream().findFirst().orElse("none"));
        } catch (NullPointerException e) {
            System.out.println("NPE");
        }
    }
}`,
        correct: 'NPE',
        wrong: ['none', 'null', 'Lovelace'],
        why: '`findFirst` must wrap the first element in an `Optional`, and an `Optional` cannot hold `null`, so it throws `NullPointerException` instead of returning an empty optional. Filter out `null` elements (`.filter(Objects::nonNull)`) before `findFirst`.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-optional-refactoring',
    4,
    'Each `map` step turns a `null` result into an empty `Optional`; `filter`, `or` and `orElse` then decide what remains.',
    [
      {
        key: 'null-chain',
        code: `import java.util.Optional;

public class Main {
    record Address(String city) {}
    record Customer(String name, Address address) {}
    record Order(String id, Customer customer) {}

    static String city(Order order) {
        return Optional.ofNullable(order)
            .map(Order::customer)
            .map(Customer::address)
            .map(Address::city)
            .filter(c -> !c.isBlank())
            .orElse("unknown");
    }

    public static void main(String[] args) {
        System.out.println(city(new Order("o-1", new Customer("Ada", new Address("London")))) + ", "
            + city(new Order("o-2", new Customer("Linus", null))) + ", "
            + city(new Order("o-3", new Customer("Grace", new Address(" ")))) + ", "
            + city(null));
    }
}`,
        correct: 'London, unknown, unknown, unknown',
        wrong: ['London, unknown,  , unknown', 'London, null, unknown, unknown', 'NullPointerException'],
        why: 'The chain replaces nested `null` checks: a `null` order, a missing address or a `null` city all end as an empty `Optional`, because `map` turns a `null` result into `Optional.empty()` instead of throwing. `filter` also empties the blank city, so every case without a usable city falls back to `unknown`.',
      },
      {
        key: 'or-vs-orelseget',
        code: `import java.util.Optional;

public class Main {
    static int lookups = 0;

    static Optional<String> fromCache(String key) {
        lookups++;
        return key.startsWith("c") ? Optional.of("cached-" + key) : Optional.empty();
    }

    static Optional<String> fromDatabase(String key) {
        lookups++;
        return key.startsWith("d") ? Optional.of("db-" + key) : Optional.empty();
    }

    static String find(String key) {
        return fromCache(key)
            .or(() -> fromDatabase(key))
            .map(String::toUpperCase)
            .orElseGet(() -> "missing-" + key);
    }

    public static void main(String[] args) {
        String result = find("c1") + " " + find("d2") + " " + find("x3");
        System.out.println(result + " " + lookups);
    }
}`,
        correct: 'CACHED-C1 DB-D2 missing-x3 5',
        wrong: ['CACHED-C1 DB-D2 MISSING-X3 6', 'CACHED-C1 DB-D2 missing-x3 6', 'cached-c1 db-d2 missing-x3 5'],
        why: '`or` calls the database only when the cache is empty, so `c1` costs one lookup and `d2` and `x3` two each: 5 in total. `map` runs only on a present value, so the fallback from `orElseGet` is not uppercased.',
      },
      {
        key: 'stream-of-optionals',
        code: `import java.util.List;
import java.util.Map;
import java.util.Optional;

public class Main {
    static final Map<String, String> MANAGERS = Map.of("ada", "grace", "linus", "ada");

    static Optional<String> managerOf(String user) {
        return Optional.ofNullable(MANAGERS.get(user));
    }

    public static void main(String[] args) {
        List<String> secondLevel = List.of("linus", "ada", "bob").stream()
            .map(Main::managerOf)
            .flatMap(Optional::stream)
            .map(Main::managerOf)
            .flatMap(Optional::stream)
            .toList();
        System.out.println(secondLevel);
    }
}`,
        correct: '[grace]',
        wrong: ['[grace, null]', '[ada, grace]', '[grace, grace]'],
        why: 'Linus’s manager is Ada, whose manager is Grace. Ada’s manager is Grace, who has no manager, and Bob has none at all. Each `flatMap(Optional::stream)` drops empty results, so only one second-level manager remains, without `get()` or `null` checks.',
      },
    ],
  ),
];
