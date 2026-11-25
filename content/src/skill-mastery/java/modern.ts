import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Modern Java (up to Java 21): records, enums, var, text blocks, switch
 * expressions, pattern matching for instanceof and switch, record patterns
 * and sealed types.
 */
const b = programBuilders('java');

// ---------------------------------------------------------------- Records, enums, var, text blocks

export const recordsEnumsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'java-record-basics',
    1,
    [
      'A record generates a constructor, accessor methods named like the components, `equals`, `hashCode` and `toString`.',
    ],
    [
      {
        key: 'accessors',
        code: `public class Main {
    public static void main(String[] args) {
        OrderLine line = new OrderLine("pen", 3, 250);
        System.out.println(line.product() + " " + line.total());
        System.out.println(line);
    }
}

record OrderLine(String product, int quantity, int unitCents) {
    int total() {
        return quantity * unitCents;
    }
}`,
        output: 'pen 750\nOrderLine[product=pen, quantity=3, unitCents=250]',
        why: 'Accessors are named after the components (`product()`, not `getProduct()`). Records can declare extra methods such as `total()`. The generated `toString` lists the components in declaration order.',
      },
      {
        key: 'equality',
        code: `import java.util.Set;

public class Main {
    public static void main(String[] args) {
        Money a = new Money(500, "EUR");
        Money b = new Money(500, "EUR");
        System.out.println(a.equals(b) + " " + (a == b));
        System.out.println(Set.of(a).contains(b));
    }
}

record Money(long cents, String currency) {}`,
        output: 'true false\ntrue',
        why: 'Records are value carriers: `equals` and `hashCode` compare all components, so two records with the same data are equal (but they are still different objects for `==`). That makes them work correctly in sets and as map keys.',
      },
      {
        key: 'with-copy',
        code: `public class Main {
    public static void main(String[] args) {
        Customer c = new Customer("Ada", "ada@old.example");
        Customer updated = c.withEmail("ada@new.example");
        System.out.println(c.email());
        System.out.println(updated.email());
    }
}

record Customer(String name, String email) {
    Customer withEmail(String newEmail) {
        return new Customer(name, newEmail);
    }
}`,
        output: 'ada@old.example\nada@new.example',
        why: 'Record fields are `final`, so you cannot change a record. A “wither” method returns a new record with one component replaced; the original stays unchanged.',
      },
    ],
  ),
  ...b.output(
    'java-compact-constructors',
    2,
    [
      'A compact constructor has no parameter list; it runs before the fields are assigned from the (possibly reassigned) parameters.',
      'Extra constructors must delegate to the canonical constructor with `this(...)`.',
    ],
    [
      {
        key: 'normalize',
        code: `public class Main {
    public static void main(String[] args) {
        Email email = new Email("  Ada@Example.COM ");
        System.out.println("[" + email.value() + "]");
    }
}

record Email(String value) {
    Email {
        value = value.strip().toLowerCase();
    }
}`,
        output: '[ada@example.com]',
        why: 'In a compact constructor, the parameters are reassignable local variables. The field is assigned from the parameter after the body runs, so normalizing the parameter normalizes the stored value.',
      },
      {
        key: 'default-constructor',
        code: `public class Main {
    public static void main(String[] args) {
        Page first = new Page();
        Page custom = new Page(3, 50);
        System.out.println(first + " " + custom);
    }
}

record Page(int number, int size) {
    Page() {
        this(0, 20);
    }
}`,
        output: 'Page[number=0, size=20] Page[number=3, size=50]',
        why: 'A record may declare additional constructors, but each must start by calling another constructor with `this(...)`, eventually reaching the canonical one. This is a common way to provide defaults.',
      },
      {
        key: 'factory',
        code: `public class Main {
    public static void main(String[] args) {
        Percentage p = Percentage.of("15%");
        System.out.println(p.value() + " " + p.applyTo(200));
    }
}

record Percentage(int value) {
    static Percentage of(String text) {
        return new Percentage(Integer.parseInt(text.replace("%", "")));
    }

    int applyTo(int amount) {
        return amount * value / 100;
    }
}`,
        output: '15 30',
        why: 'Static factory methods are allowed in records and are a readable way to parse input into a value object. `200 * 15 / 100` is `30`.',
      },
    ],
  ),
  ...b.fails(
    'java-record-validation',
    3,
    'Validation in a compact constructor runs for every instance created, so an invalid record can never exist.',
    [
      {
        key: 'negative',
        question: 'Creating this order line fails. What does that tell you about the design?',
        code: `public class Main {
    public static void main(String[] args) {
        OrderLine ok = new OrderLine("pen", 2);
        System.out.println(ok);
        OrderLine bad = new OrderLine("ink", -1);
        System.out.println(bad);
    }
}

record OrderLine(String product, int quantity) {
    OrderLine {
        if (quantity <= 0) {
            throw new IllegalArgumentException("quantity must be positive: " + quantity);
        }
    }
}`,
        error: 'IllegalArgumentException: quantity must be positive: -1',
        correct: 'The compact constructor validates every new `OrderLine`, so an invalid line is rejected at creation and the rest of the code can rely on positive quantities.',
        wrong: [
          'Records cannot throw exceptions from constructors; the exception comes from `println`.',
          'The validation only runs for the first record created from a class.',
          'The record was created with `quantity = 0` and the exception was thrown later, by the accessor.',
        ],
        why: 'All construction goes through the canonical constructor, so the compact constructor is the right place for invariants. The invalid record is never created, and the message says exactly which value was wrong.',
      },
      {
        key: 'null-check',
        question: 'Why does this record reject the second customer?',
        code: `import java.util.Objects;

public class Main {
    public static void main(String[] args) {
        System.out.println(new Customer("c-1", "Ada"));
        System.out.println(new Customer("c-2", null));
    }
}

record Customer(String id, String name) {
    Customer {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(name, "name");
    }
}`,
        error: 'NullPointerException: name',
        correct: '`Objects.requireNonNull(name, "name")` throws `NullPointerException` with the message `name`, because the second customer has no name.',
        wrong: [
          'Record components cannot be `null`; the JVM rejects `null` for every record field.',
          '`toString` throws because it cannot print a `null` component.',
          '`requireNonNull` returns a default value and the record is created.',
        ],
        why: 'Records allow `null` components by default; the explicit `requireNonNull` checks in the compact constructor reject them with a clear message. The generated `toString` would print `null` happily.',
      },
    ],
  ),
  ...b.compiles(
    'java-record-rules',
    3,
    'Records are implicitly `final`, extend `java.lang.Record`, and their components become `private final` fields. What else may a record declare?',
    [
      {
        key: 'instance-field',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(new Product("pen").name());
    }
}

record Product(String name) {
    private int views = 0;
}`,
        compiles: false,
        why: 'A record cannot declare instance fields besides its components: “field declaration must be static”. All state must be in the record header, which keeps `equals`, `hashCode` and `toString` complete.',
      },
      {
        key: 'static-and-interface',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(new Version(1, 2).compareTo(Version.INITIAL) > 0);
    }
}

record Version(int major, int minor) implements Comparable<Version> {
    static final Version INITIAL = new Version(1, 0);

    @Override
    public int compareTo(Version other) {
        return major != other.major ? Integer.compare(major, other.major) : Integer.compare(minor, other.minor);
    }
}`,
        compiles: true,
        why: 'Records may implement interfaces and declare static fields, static methods and instance methods. It prints `true`.',
      },
      {
        key: 'setter',
        code: `public class Main {
    public static void main(String[] args) {
        Address a = new Address("Main St");
        a.setStreet("High St");
        System.out.println(a.street());
    }
}

record Address(String street) {
    void setStreet(String street) {
        this.street = street;
    }
}`,
        compiles: false,
        why: 'Record component fields are `final`: “cannot assign a value to final variable street”. Return a new record instead (`withStreet`).',
      },
      {
        key: 'extends',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(new Invoice("i-1").id());
    }
}

class Entity {
    String auditInfo() { return "created"; }
}

record Invoice(String id) extends Entity {}`,
        compiles: false,
        why: 'A record implicitly extends `java.lang.Record` and cannot extend any other class. Share behavior through interfaces (with default methods) or composition.',
      },
    ],
  ),
  ...b.output(
    'java-enum-basics',
    1,
    [
      'Enum constants are objects with a `name()` and an `ordinal()` (their position, starting at 0).',
      'Enums can have fields, constructors and methods.',
    ],
    [
      {
        key: 'values',
        code: `public class Main {
    public static void main(String[] args) {
        OrderStatus s = OrderStatus.valueOf("PAID");
        System.out.println(s + " " + s.ordinal() + " " + OrderStatus.values().length);
        System.out.println(s == OrderStatus.PAID);
    }
}

enum OrderStatus { NEW, PAID, SHIPPED, CANCELLED }`,
        output: 'PAID 1 4\ntrue',
        why: '`valueOf` looks up a constant by its exact name. `ordinal()` is the zero-based position, and `values()` returns all constants. Each constant is a single instance, so `==` is a correct way to compare enums.',
      },
      {
        key: 'fields',
        code: `public class Main {
    public static void main(String[] args) {
        int total = 0;
        for (Plan p : Plan.values()) total += p.monthlyPrice();
        System.out.println(total + " " + Plan.TEAM.label());
    }
}

enum Plan {
    FREE(0), PRO(20), TEAM(50);

    private final int monthlyPrice;

    Plan(int monthlyPrice) {
        this.monthlyPrice = monthlyPrice;
    }

    int monthlyPrice() { return monthlyPrice; }

    String label() { return name().charAt(0) + name().substring(1).toLowerCase(); }
}`,
        output: '70 Team',
        why: 'Each constant passes its price to the private constructor. `values()` iterates in declaration order. `label()` builds `Team` from the constant name `TEAM`.',
      },
      {
        key: 'switch',
        code: `public class Main {
    static int shippingDays(Region r) {
        return switch (r) {
            case LOCAL -> 1;
            case NATIONAL -> 3;
            case INTERNATIONAL -> 10;
        };
    }

    public static void main(String[] args) {
        System.out.println(shippingDays(Region.NATIONAL) + shippingDays(Region.LOCAL));
    }
}

enum Region { LOCAL, NATIONAL, INTERNATIONAL }`,
        output: '4',
        why: 'A switch expression over an enum uses the bare constant names. It covers all constants, so no `default` is needed. `3 + 1 = 4`.',
      },
    ],
  ),
  ...b.fails(
    'java-enum-parsing',
    2,
    '`Enum.valueOf` needs the exact constant name, including case.',
    [
      {
        key: 'case',
        question: 'Parsing a status from a request fails. Why?',
        code: `public class Main {
    public static void main(String[] args) {
        String fromRequest = "paid";
        OrderStatus status = OrderStatus.valueOf(fromRequest);
        System.out.println(status);
    }
}

enum OrderStatus { NEW, PAID, SHIPPED }`,
        error: 'IllegalArgumentException: No enum constant OrderStatus.paid',
        correct: '`valueOf` is case-sensitive and throws `IllegalArgumentException` for any name that is not exactly a constant; normalize the input (`toUpperCase()`) and handle invalid values.',
        wrong: [
          '`valueOf` returns `null` for unknown names, and `println(null)` throws.',
          'Enums can only be created with `new OrderStatus("paid")`.',
          '`valueOf` matches by ordinal, so it needs a number.',
        ],
        why: '`valueOf` never returns `null`: it throws `IllegalArgumentException: No enum constant OrderStatus.paid`. Enum constructors are private and cannot be called with `new`. Validate external input before converting it.',
      },
      {
        key: 'null',
        question: 'This import job fails for one row. Why?',
        code: `public class Main {
    public static void main(String[] args) {
        String[] column = {"NEW", null};
        for (String value : column) {
            System.out.println(OrderStatus.valueOf(value));
        }
    }
}

enum OrderStatus { NEW, PAID }`,
        error: 'NullPointerException',
        correct: 'The second value is `null`, and `valueOf(null)` throws `NullPointerException` (“Name is null”); handle empty cells before converting.',
        wrong: [
          '`valueOf(null)` returns the first constant, `NEW`.',
          '`valueOf(null)` throws `IllegalArgumentException: No enum constant OrderStatus.null`.',
          'An enum cannot be printed with `println`.',
        ],
        why: 'For a `null` name, `Enum.valueOf` throws `NullPointerException: Name is null`, a different exception from an unknown name. An import must decide what a missing value means before parsing it.',
      },
    ],
  ),
  ...b.output(
    'java-enum-behavior',
    3,
    [
      'Each enum constant can have its own body that implements an abstract method.',
      '`EnumMap` and `compareTo` use the declaration order of the constants.',
    ],
    [
      {
        key: 'constant-body',
        code: `public class Main {
    public static void main(String[] args) {
        for (Fee fee : Fee.values()) {
            System.out.println(fee + " " + fee.on(1000));
        }
    }
}

enum Fee {
    FLAT {
        int on(int amount) { return 25; }
    },
    PERCENT {
        int on(int amount) { return amount * 3 / 100; }
    };

    abstract int on(int amount);
}`,
        output: 'FLAT 25\nPERCENT 30',
        why: 'An enum can declare an abstract method that every constant implements in its own body. Calls dispatch per constant, which often replaces a `switch` on the enum.',
      },
      {
        key: 'enum-map',
        code: `import java.util.EnumMap;
import java.util.Map;

public class Main {
    public static void main(String[] args) {
        Map<Priority, Integer> open = new EnumMap<>(Priority.class);
        open.put(Priority.LOW, 7);
        open.put(Priority.CRITICAL, 1);
        open.put(Priority.HIGH, 3);
        System.out.println(open);
        System.out.println(Priority.HIGH.compareTo(Priority.LOW) > 0);
    }
}

enum Priority { LOW, MEDIUM, HIGH, CRITICAL }`,
        output: '{LOW=7, HIGH=3, CRITICAL=1}\ntrue',
        why: '`EnumMap` keeps its keys in declaration order, whatever the insertion order, and it is very compact. Enums implement `Comparable` by ordinal, so `HIGH` compares greater than `LOW`.',
      },
      {
        key: 'transitions',
        code: `import java.util.Set;

public class Main {
    public static void main(String[] args) {
        System.out.println(Status.NEW.canMoveTo(Status.PAID));
        System.out.println(Status.SHIPPED.canMoveTo(Status.NEW));
    }
}

enum Status {
    NEW, PAID, SHIPPED;

    boolean canMoveTo(Status next) {
        return switch (this) {
            case NEW -> Set.of(PAID).contains(next);
            case PAID -> Set.of(SHIPPED).contains(next);
            case SHIPPED -> false;
        };
    }
}`,
        output: 'true\nfalse',
        why: 'Enums are a natural place for business rules such as allowed state transitions. The switch on `this` covers every constant, so the compiler checks that no state was forgotten.',
      },
    ],
  ),
  ...b.compiles(
    'java-var-inference',
    4,
    '`var` infers the static type of a local variable from its initializer, once. It is still statically typed.',
    [
      {
        key: 'no-initializer',
        code: `public class Main {
    public static void main(String[] args) {
        var total;
        total = 10;
        System.out.println(total);
    }
}`,
        compiles: false,
        why: '`var` needs an initializer to infer the type from: “cannot infer type for local variable total (cannot use var on variable without initializer)”.',
      },
      {
        key: 'diamond-object',
        code: `import java.util.ArrayList;

public class Main {
    public static void main(String[] args) {
        var names = new ArrayList<>();
        names.add("ada");
        String first = names.get(0);
        System.out.println(first);
    }
}`,
        compiles: false,
        why: 'With `var` there is no target type for the diamond, so `new ArrayList<>()` infers `ArrayList<Object>`. `names.get(0)` returns `Object`, which cannot be assigned to `String`. Write `new ArrayList<String>()` with `var`, or declare `List<String> names`.',
      },
      {
        key: 'reassign-type',
        code: `public class Main {
    public static void main(String[] args) {
        var price = 10;
        price = 12.5;
        System.out.println(price);
    }
}`,
        compiles: false,
        why: '`var price = 10` gives `price` the type `int` for good. Assigning `12.5` is a lossy conversion from `double`. `var` is not dynamic typing.',
      },
      {
        key: 'loop-and-lambda',
        code: `import java.util.List;
import java.util.function.BiFunction;

public class Main {
    public static void main(String[] args) {
        var prices = List.of(10, 20, 30);
        BiFunction<Integer, Integer, Integer> add = (var a, var b) -> a + b;
        var total = 0;
        for (var p : prices) total = add.apply(total, p);
        System.out.println(total);
    }
}`,
        compiles: true,
        why: '`var` works for local variables with initializers, for-each loop variables and lambda parameters (useful when you want to annotate them). `prices` is a `List<Integer>`. It prints `60`.',
      },
    ],
  ),
  ...b.output(
    'java-text-blocks',
    3,
    [
      'A text block starts with `"""` and a line break. Common indentation is removed, using the closing delimiter’s position too.',
      'If the closing `"""` is on its own line, the text ends with a newline.',
    ],
    [
      {
        key: 'json',
        code: `public class Main {
    public static void main(String[] args) {
        String json = """
            {
              "id": 7
            }
            """;
        System.out.println(json.lines().count() + " " + json.endsWith("\\n"));
        System.out.println(json.lines().toList().get(1).replace(' ', '.'));
    }
}`,
        output: '3 true\n.."id":.7',
        why: 'The common indentation (here set by the `{` and the closing delimiter) is stripped, so the second line keeps only its two extra spaces. Because the closing `"""` is on its own line, the block ends with a newline; it has three lines.',
      },
      {
        key: 'closing-indent',
        code: `public class Main {
    public static void main(String[] args) {
        String sql = """
                SELECT *
              FROM orders""";
        System.out.println(sql.replace(' ', '.').replace("\\n", "|"));
    }
}`,
        output: '..SELECT.*|FROM.orders',
        why: 'The least-indented line (`FROM orders`) sets the margin, so `SELECT *` keeps its two extra spaces. The closing delimiter is on the last content line, so there is no trailing newline.',
      },
      {
        key: 'formatted',
        code: `public class Main {
    public static void main(String[] args) {
        String template = """
            Dear %s,
            your order %d has shipped.\\
             Thank you!
            """;
        System.out.print(template.formatted("Ada", 42));
    }
}`,
        output: 'Dear Ada,\nyour order 42 has shipped. Thank you!',
        why: 'A backslash at the end of a line inside a text block joins it with the next line (no newline). The next line keeps one space after the margin, so the sentence reads `shipped. Thank you!`. `formatted` works like `String.format`.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-record-pitfalls',
    5,
    'The generated `equals` and `hashCode` compare the component fields with their own `equals`. What does that mean for arrays and for overridden accessors?',
    [
      {
        key: 'array-component',
        code: `public class Main {
    public static void main(String[] args) {
        Batch a = new Batch("b-1", new int[] {1, 2});
        Batch b = new Batch("b-1", new int[] {1, 2});
        System.out.println(a.equals(b));
    }
}

record Batch(String id, int[] quantities) {}`,
        correct: 'false',
        wrong: ['true', 'It does not compile: records cannot have array components', 'ClassCastException'],
        why: 'The generated `equals` compares each component with its `equals` method, and arrays use identity equality. Two batches with equal array contents are not equal. Use a `List<Integer>` component, or override `equals`/`hashCode` with `Arrays.equals`/`Arrays.hashCode`.',
      },
      {
        key: 'accessor-override',
        code: `public class Main {
    public static void main(String[] args) {
        Username a = new Username("Ada");
        Username b = new Username("ada");
        System.out.println(a.value().equals(b.value()) + " " + a.equals(b));
    }
}

record Username(String value) {
    @Override
    public String value() {
        return value.toLowerCase();
    }
}`,
        correct: 'true false',
        wrong: ['true true', 'false false', 'false true'],
        why: 'Overriding the accessor changes what callers see, but the generated `equals` compares the stored fields, `"Ada"` and `"ada"`. Normalize in the compact constructor instead, so the stored value itself is canonical.',
      },
      {
        key: 'nan',
        code: `public class Main {
    public static void main(String[] args) {
        double unknown = 0.0 / 0;
        Reading a = new Reading(unknown);
        Reading b = new Reading(unknown);
        System.out.println((a.value() == b.value()) + " " + a.equals(b));
    }
}

record Reading(double value) {}`,
        correct: 'false true',
        wrong: ['false false', 'true true', 'true false'],
        why: 'For primitive components, records compare values like the wrapper’s `equals` (`Double.compare` semantics), not with `==`. `NaN == NaN` is false, but `Double.valueOf(NaN).equals(NaN)` is true, so the records are equal.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Switch and pattern matching

export const patternMatchingFamilies: readonly QuestionSource[] = [
  ...b.output(
    'java-switch-expressions',
    1,
    [
      'A switch expression produces a value. Arrow labels do not fall through, and one label can list several constants.',
      'In a block, `yield` provides the value.',
    ],
    [
      {
        key: 'multi-label',
        code: `public class Main {
    static String kind(String day) {
        return switch (day) {
            case "SAT", "SUN" -> "weekend";
            case "FRI" -> "almost weekend";
            default -> "weekday";
        };
    }

    public static void main(String[] args) {
        System.out.println(kind("SUN") + ", " + kind("TUE"));
    }
}`,
        output: 'weekend, weekday',
        why: '`case "SAT", "SUN"` matches either value. Only the matching arm runs, and its value becomes the value of the whole expression.',
      },
      {
        key: 'yield',
        code: `public class Main {
    static int shippingCents(String method, int weightKg) {
        return switch (method) {
            case "standard" -> 499;
            case "express" -> {
                int base = 999;
                yield weightKg > 5 ? base + 500 : base;
            }
            default -> throw new IllegalArgumentException(method);
        };
    }

    public static void main(String[] args) {
        System.out.println(shippingCents("express", 8));
        System.out.println(shippingCents("standard", 8));
    }
}`,
        output: '1499\n499',
        why: 'An arm can be a block; `yield` returns its value from the switch (a `return` would leave the method). An arm may also throw instead of producing a value.',
      },
      {
        key: 'int-ranges',
        code: `public class Main {
    static char grade(int score) {
        return switch (score / 10) {
            case 10, 9 -> 'A';
            case 8 -> 'B';
            case 7 -> 'C';
            default -> 'F';
        };
    }

    public static void main(String[] args) {
        System.out.println("" + grade(95) + grade(80) + grade(79) + grade(12));
    }
}`,
        output: 'ABCF',
        why: '`95 / 10` is `9` (A), `80 / 10` is `8` (B), `79 / 10` is `7` (C), and `12 / 10` is `1`, which falls to `default` (F).',
      },
    ],
  ),
  ...b.output(
    'java-instanceof-patterns',
    2,
    [
      '`x instanceof Type name` tests the type and, if it matches, binds a variable of that type.',
      'The binding is in scope wherever the compiler knows the test succeeded.',
    ],
    [
      {
        key: 'and',
        code: `public class Main {
    static String describe(Object value) {
        if (value instanceof String s && !s.isBlank()) {
            return "text of length " + s.length();
        }
        if (value instanceof Integer i) {
            return "number " + (i + 1);
        }
        return "unsupported";
    }

    public static void main(String[] args) {
        System.out.println(describe("hello"));
        System.out.println(describe(41));
        System.out.println(describe(" "));
    }
}`,
        output: 'text of length 5\nnumber 42\nunsupported',
        why: 'After a successful `instanceof String s`, `s` is a `String` without a cast, and it can be used on the right side of `&&`. A blank string fails the condition, and it is not an `Integer` either.',
      },
      {
        key: 'negated',
        code: `public class Main {
    static int quantity(Object payload) {
        if (!(payload instanceof Integer q)) {
            return 0;
        }
        return q * 2;
    }

    public static void main(String[] args) {
        System.out.println(quantity(5) + " " + quantity("5"));
    }
}`,
        output: '10 0',
        why: 'If the negated test is false, the method returns early, so after the `if` the compiler knows `payload` is an `Integer` and `q` is in scope. The string `"5"` is not an `Integer`, so it returns `0` (no conversion happens).',
      },
      {
        key: 'null',
        code: `public class Main {
    public static void main(String[] args) {
        Object value = null;
        System.out.println(value instanceof String);
        System.out.println(value instanceof Object o ? "object" : "nothing");
    }
}`,
        output: 'false\nnothing',
        why: '`instanceof` is always false for `null`, even with `Object`, so pattern variables are never `null`. That is why `instanceof` checks also act as null checks.',
      },
    ],
  ),
  ...b.output(
    'java-record-patterns',
    3,
    [
      'A record pattern such as `Circle(double r)` tests the type and extracts the components in one step.',
      'Record patterns can be nested, and `var` can be used for component types.',
    ],
    [
      {
        key: 'area',
        code: `public class Main {
    static double area(Shape shape) {
        return switch (shape) {
            case Circle(double r) -> Math.PI * r * r;
            case Rectangle(double w, double h) -> w * h;
            case Square s -> s.side() * s.side();
        };
    }

    public static void main(String[] args) {
        System.out.println(area(new Rectangle(2, 3)) + area(new Square(2)));
    }
}

sealed interface Shape permits Circle, Rectangle, Square {}
record Circle(double radius) implements Shape {}
record Rectangle(double width, double height) implements Shape {}
record Square(double side) implements Shape {}`,
        output: '10.0',
        why: '`Rectangle(double w, double h)` deconstructs the record into its components (the pattern variable names need not match the component names). A type pattern like `Square s` also works. `6.0 + 4.0 = 10.0`. The switch is exhaustive because `Shape` is sealed.',
      },
      {
        key: 'nested',
        code: `public class Main {
    static String route(Shipment s) {
        return switch (s) {
            case Shipment(Address(var city, var country), var weight) when country.equals("DE") -> "domestic to " + city;
            case Shipment(Address(var city, var country), var weight) when weight > 20 -> "freight to " + country;
            case Shipment(var address, var weight) -> "parcel to " + address.country();
        };
    }

    public static void main(String[] args) {
        System.out.println(route(new Shipment(new Address("Berlin", "DE"), 30)));
        System.out.println(route(new Shipment(new Address("Paris", "FR"), 30)));
        System.out.println(route(new Shipment(new Address("Rome", "IT"), 2)));
    }
}

record Address(String city, String country) {}
record Shipment(Address to, int weight) {}`,
        output: 'domestic to Berlin\nfreight to FR\nparcel to IT',
        why: 'Nested record patterns reach into `Address` directly, and `var` infers the component types. Cases are tried in order: Berlin matches the first guard, Paris the second, and Rome only the last, unguarded case.',
      },
      {
        key: 'instanceof-record',
        code: `public class Main {
    public static void main(String[] args) {
        Object event = new Payment("o-7", 1999);
        if (event instanceof Payment(String order, long cents) && cents > 1000) {
            System.out.println(order + " large");
        } else {
            System.out.println("small or other");
        }
    }
}

record Payment(String orderId, long amountCents) {}`,
        output: 'o-7 large',
        why: 'Record patterns also work with `instanceof`: the components are bound to `order` and `cents` when `event` is a `Payment`.',
      },
    ],
  ),
  ...b.compiles(
    'java-switch-exhaustiveness',
    3,
    'Switch expressions, and switches that use patterns, must cover every possible value. Enums and sealed hierarchies let the compiler check this without `default`.',
    [
      {
        key: 'enum-missing',
        code: `public class Main {
    static String label(Status s) {
        return switch (s) {
            case NEW -> "new";
            case PAID -> "paid";
        };
    }

    public static void main(String[] args) {
        System.out.println(label(Status.NEW));
    }
}

enum Status { NEW, PAID, REFUNDED }`,
        compiles: false,
        why: 'The switch expression does not handle `REFUNDED`: “the switch expression does not cover all possible input values”. This is the benefit of omitting `default`: adding a constant makes every incomplete switch fail to compile.',
      },
      {
        key: 'old-statement',
        code: `public class Main {
    static void sendNotice(Status s) {
        switch (s) {
            case NEW:
                System.out.println("welcome");
                break;
            case PAID:
                System.out.println("thanks");
                break;
        }
    }

    public static void main(String[] args) {
        sendNotice(Status.REFUNDED);
        System.out.println("done");
    }
}

enum Status { NEW, PAID, REFUNDED }`,
        compiles: true,
        why: 'A classic switch statement without patterns does not have to be exhaustive, so `REFUNDED` is silently ignored and the program prints only `done`. That is a reason to prefer switch expressions for enums.',
      },
      {
        key: 'sealed',
        code: `public class Main {
    static String handle(Command c) {
        return switch (c) {
            case Create cr -> "create " + cr.name();
            case Delete d -> "delete " + d.id();
        };
    }

    public static void main(String[] args) {
        System.out.println(handle(new Delete(4)));
    }
}

sealed interface Command permits Create, Delete {}
record Create(String name) implements Command {}
record Delete(int id) implements Command {}`,
        compiles: true,
        why: '`Command` is sealed and both permitted subtypes are covered, so the switch is exhaustive without `default`. It prints `delete 4`.',
      },
      {
        key: 'not-sealed',
        code: `public class Main {
    static String handle(Command c) {
        return switch (c) {
            case Create cr -> "create " + cr.name();
            case Delete d -> "delete " + d.id();
        };
    }

    public static void main(String[] args) {
        System.out.println(handle(new Delete(4)));
    }
}

interface Command {}
record Create(String name) implements Command {}
record Delete(int id) implements Command {}`,
        compiles: false,
        why: 'Without `sealed`, any class could implement `Command`, so the compiler cannot prove the two cases are exhaustive: “the switch expression does not cover all possible input values”. Seal the interface or add a `default`.',
      },
    ],
  ),
  ...b.compiles(
    'java-sealed-types',
    4,
    'A sealed type lists its permitted subtypes, and each subtype must be `final`, `sealed` or `non-sealed` (records and enums are implicitly final).',
    [
      {
        key: 'not-permitted',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(new Refund().getClass().getSimpleName());
    }
}

sealed interface PaymentEvent permits Authorized, Captured {}
record Authorized(long cents) implements PaymentEvent {}
record Captured(long cents) implements PaymentEvent {}
final class Refund implements PaymentEvent {}`,
        compiles: false,
        why: '`Refund` is not in the `permits` list, so it may not implement `PaymentEvent`: “class is not allowed to extend sealed class: PaymentEvent”. Add it to `permits` (and handle it in every exhaustive switch).',
      },
      {
        key: 'missing-modifier',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(new Card().getClass().getSimpleName());
    }
}

sealed abstract class PaymentMethod permits Card, Transfer {}
class Card extends PaymentMethod {}
final class Transfer extends PaymentMethod {}`,
        compiles: false,
        why: 'Every permitted subclass must state how it continues the hierarchy: `final`, `sealed` (with its own `permits`) or `non-sealed`. `Card` has none of these modifiers, so it is rejected.',
      },
      {
        key: 'non-sealed',
        code: `public class Main {
    public static void main(String[] args) {
        PaymentMethod m = new VirtualCard();
        System.out.println(m instanceof Card);
    }
}

sealed abstract class PaymentMethod permits Card, Transfer {}
non-sealed class Card extends PaymentMethod {}
final class Transfer extends PaymentMethod {}
class VirtualCard extends Card {}`,
        compiles: true,
        why: '`non-sealed` reopens the hierarchy below `Card`, so `VirtualCard` may extend it. A switch over `PaymentMethod` can still be exhaustive by covering `Card` and `Transfer`. It prints `true`.',
      },
      {
        key: 'records-final',
        code: `public class Main {
    public static void main(String[] args) {
        Result r = new Failure("timeout");
        String text = switch (r) {
            case Success(var value) -> "ok " + value;
            case Failure(var reason) -> "failed: " + reason;
        };
        System.out.println(text);
    }
}

sealed interface Result permits Success, Failure {}
record Success(String value) implements Result {}
record Failure(String reason) implements Result {}`,
        compiles: true,
        why: 'Records are implicitly `final`, so they are valid permitted subtypes without any extra modifier. Sealed interfaces with record implementations model “one of these outcomes” types. It prints `failed: timeout`.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-guarded-patterns',
    4,
    'Pattern cases are tested from top to bottom; a `when` guard adds a condition. `case null` handles a `null` selector.',
    [
      {
        key: 'classify',
        code: `public class Main {
    static String classify(Object o) {
        return switch (o) {
            case null -> "missing";
            case Integer i when i > 1000 -> "large amount";
            case Integer i -> "amount";
            case String s when s.isBlank() -> "blank text";
            case String s -> "text";
            default -> "other";
        };
    }

    public static void main(String[] args) {
        System.out.println(classify(5000) + ", " + classify(" ") + ", " + classify(null) + ", " + classify(2.5));
    }
}`,
        correct: 'large amount, blank text, missing, other',
        wrong: [
          'amount, text, missing, other',
          'large amount, blank text, other, other',
          'NullPointerException',
        ],
        why: '`5000` matches the guarded `Integer` case first. `" "` is blank. With `case null`, a `null` selector is handled instead of throwing. `2.5` is a `Double`, which only `default` covers.',
      },
      {
        key: 'no-case-null',
        code: `public class Main {
    static String classify(Object o) {
        return switch (o) {
            case Integer i -> "amount";
            case String s -> "text";
            default -> "other";
        };
    }

    public static void main(String[] args) {
        try {
            System.out.println(classify(null));
        } catch (NullPointerException e) {
            System.out.println("NPE");
        }
    }
}`,
        correct: 'NPE',
        wrong: ['other', 'text', 'amount'],
        why: 'Without a `case null`, a pattern switch still throws `NullPointerException` for a `null` selector; `default` does not match `null`. Add `case null ->` (or `case null, default ->`) when `null` is a valid input.',
      },
      {
        key: 'order',
        code: `public class Main {
    static String priority(Ticket t) {
        return switch (t) {
            case Ticket(var title, var severity, var vip) when vip -> "P1";
            case Ticket(var title, var severity, var vip) when severity >= 3 -> "P2";
            case Ticket tk -> "P3";
        };
    }

    public static void main(String[] args) {
        System.out.println(priority(new Ticket("login down", 1, true)) + " " + priority(new Ticket("typo", 4, false)) + " " + priority(new Ticket("slow", 2, false)));
    }
}

record Ticket(String title, int severity, boolean vip) {}`,
        correct: 'P1 P2 P3',
        wrong: ['P2 P2 P3', 'P1 P1 P3', 'P3 P3 P3'],
        why: 'The first matching case wins. The VIP ticket matches the first guard even with low severity; the second ticket is not VIP but has severity 4; the last matches only the unguarded `Ticket tk`, which also makes the switch exhaustive.',
      },
    ],
  ),
  ...b.compiles(
    'java-pattern-dominance',
    5,
    'A case label is dominated if an earlier label matches everything it matches; dominated labels are compile errors.',
    [
      {
        key: 'object-first',
        code: `public class Main {
    static String describe(Object o) {
        return switch (o) {
            case Object obj -> "object";
            case String s -> "string";
        };
    }

    public static void main(String[] args) {
        System.out.println(describe("x"));
    }
}`,
        compiles: false,
        why: '`case Object obj` matches every value, so `case String s` can never be reached: “this case label is dominated by a preceding case label”. Put the more specific pattern first.',
      },
      {
        key: 'guard-after-unguarded',
        code: `public class Main {
    static String describe(Object o) {
        return switch (o) {
            case String s -> "string";
            case String s when s.isEmpty() -> "empty";
            default -> "other";
        };
    }

    public static void main(String[] args) {
        System.out.println(describe(""));
    }
}`,
        compiles: false,
        why: 'An unguarded `case String s` matches every string, so the guarded case after it is dominated and rejected. Guarded cases must come before the unguarded case for the same type.',
      },
      {
        key: 'guard-first',
        code: `public class Main {
    static String describe(Object o) {
        return switch (o) {
            case String s when s.isEmpty() -> "empty";
            case String s -> "string";
            case null, default -> "other";
        };
    }

    public static void main(String[] args) {
        System.out.println(describe("") + " " + describe(null));
    }
}`,
        compiles: true,
        why: 'The guarded case comes first, so neither label is dominated. `case null, default` handles both `null` and every other value. It prints `empty other`.',
      },
      {
        key: 'unguarded-exhaustive',
        code: `public class Main {
    static String size(Box b) {
        return switch (b) {
            case Box(Integer n) when n > 10 -> "big";
            case Box(Integer n) when n <= 10 -> "small";
        };
    }

    public static void main(String[] args) {
        System.out.println(size(new Box(4)));
    }
}

record Box(Integer value) {}`,
        compiles: false,
        why: 'The compiler does not analyze guard conditions, so it does not know that `n > 10` and `n <= 10` together cover everything: “the switch expression does not cover all possible input values”. Make the last case unguarded (`case Box(Integer n) -> "small"`).',
      },
    ],
  ),
  ...b.fails(
    'java-switch-debugging',
    3,
    'Look at what the `default` branch is for. Would the compiler have caught this if the switch had no `default`?',
    [
      {
        key: 'new-constant',
        question: 'A new `REFUNDED` status was added last sprint, and now invoices fail. What is the best fix?',
        code: `public class Main {
    static String invoiceLabel(Status s) {
        return switch (s) {
            case NEW -> "Draft";
            case PAID -> "Paid";
            default -> throw new IllegalStateException("Unexpected status: " + s);
        };
    }

    public static void main(String[] args) {
        System.out.println(invoiceLabel(Status.PAID));
        System.out.println(invoiceLabel(Status.REFUNDED));
    }
}

enum Status { NEW, PAID, REFUNDED }`,
        error: 'IllegalStateException: Unexpected status: REFUNDED',
        correct: 'Handle `REFUNDED` and remove the `default` branch, so that the compiler reports every switch expression that misses a newly added constant.',
        wrong: [
          'Change the `default` branch to return `"Paid"`, so that no exception is thrown.',
          'Catch `IllegalStateException` in `main` and print an empty label.',
          'Replace the switch expression with an `if`/`else` chain.',
        ],
        why: 'The `default` branch turned a compile-time check into a run-time failure. Without `default`, a switch expression over an enum must list every constant, so adding `REFUNDED` would have been a compile error in every switch that needs updating. Silently mapping it to another label hides the bug.',
      },
      {
        key: 'yield-missing-case',
        question: 'A payment report crashes for one event. What happened?',
        code: `import java.util.List;

public class Main {
    static long amount(Object event) {
        return switch (event) {
            case Charge c -> c.cents();
            case Refund r -> -r.cents();
            default -> throw new IllegalArgumentException("Unknown event " + event.getClass().getSimpleName());
        };
    }

    public static void main(String[] args) {
        long total = 0;
        for (Object e : List.of(new Charge(1000), new Refund(200), new Chargeback(1000))) {
            total += amount(e);
        }
        System.out.println(total);
    }
}

record Charge(long cents) {}
record Refund(long cents) {}
record Chargeback(long cents) {}`,
        error: 'IllegalArgumentException: Unknown event Chargeback',
        correct: 'The switch takes `Object`, so new event types reach `default` at run time; model events as a sealed interface and switch over it without `default` to get a compile-time error instead.',
        wrong: [
          '`switch` cannot match records, so every event reaches `default`.',
          '`List.of` changed the type of the third element.',
          'Negative values cannot be returned from a switch expression.',
        ],
        why: '`Charge` and `Refund` matched their cases; `Chargeback` is a new type nobody handled. Switching over `Object` forces a `default`, so the compiler cannot help. With `sealed interface PaymentEvent permits Charge, Refund, Chargeback`, the switch would have to cover `Chargeback` to compile.',
      },
    ],
  ),
];
