import type { QuestionSource } from '@pracstack/content-model';
import { plain } from '../helpers';
import { programBuilders } from '../program-builders';

/*
 * Testing: JUnit 5 tests run in-process with the JUnit Platform launcher
 * (the program prints only a deterministic pass/fail summary), AssertJ,
 * parameterized tests and Mockito.
 *
 * Mockito's inline mock maker prints a self-attach warning on the runner's
 * JDK, so Mockito snippets are used in questions that check failures or
 * reasoning, never exact output.
 */
const b = programBuilders('java');

/**
 * A program whose `main` runs the given JUnit test classes and prints
 * "<n> passed, <m> failed". `imports` are extra import lines.
 */
function junit(testClasses: readonly string[], rest: string, imports: readonly string[] = []): string {
  const selectors = testClasses.map((c) => `selectClass(${c}.class)`).join(', ');
  return `import org.junit.jupiter.api.*;
import org.junit.platform.launcher.core.LauncherDiscoveryRequestBuilder;
import org.junit.platform.launcher.core.LauncherFactory;
import org.junit.platform.launcher.listeners.SummaryGeneratingListener;
${imports.map((i) => `${i}\n`).join('')}import static org.junit.jupiter.api.Assertions.*;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectClass;

public class Main {
    public static void main(String[] args) {
        var listener = new SummaryGeneratingListener();
        LauncherFactory.create().execute(
            LauncherDiscoveryRequestBuilder.request().selectors(${selectors}).build(), listener);
        var summary = listener.getSummary();
        System.out.println(summary.getTestsSucceededCount() + " passed, " + summary.getTestsFailedCount() + " failed");
    }
}

${rest}`;
}

const RUNNER_NOTE =
  'The `main` method runs the test class with the JUnit Platform launcher and prints a summary. What does it print?';

export const testingFamilies: readonly QuestionSource[] = [
  ...b.output(
    'java-junit-basics',
    1,
    [
      'A test passes if it finishes without throwing; a failed assertion throws an `AssertionFailedError`.',
      'Every `@Test` method is a separate test.',
    ],
    [
      {
        key: 'one-fails',
        question: RUNNER_NOTE,
        code: junit(
          ['PriceCalculatorTest'],
          `class PriceCalculator {
    int total(int unitCents, int quantity) {
        return unitCents * quantity;
    }

    int withDiscount(int cents, int percent) {
        return cents - cents * percent / 100;
    }
}

class PriceCalculatorTest {
    private final PriceCalculator calculator = new PriceCalculator();

    @Test
    void multipliesPriceByQuantity() {
        assertEquals(750, calculator.total(250, 3));
    }

    @Test
    void appliesDiscount() {
        assertEquals(900, calculator.withDiscount(1000, 10));
    }

    @Test
    void appliesThirdOff() {
        assertEquals(667, calculator.withDiscount(1000, 33));
    }
}`,
        ),
        output: '2 passed, 1 failed',
        why: '`250 * 3 = 750` and `1000 - 100 = 900` pass. In the third test, `withDiscount(1000, 33)` is `1000 - 330 = 670`, not `667`, so that assertion fails (33% is not exactly one third). Each `@Test` method is counted separately.',
      },
      {
        key: 'no-assertion',
        question: RUNNER_NOTE,
        code: junit(
          ['CartTest'],
          `class Cart {
    private int items;
    void add() { items++; }
    int size() { return items; }
}

class CartTest {
    @Test
    void addIncreasesSize() {
        Cart cart = new Cart();
        cart.add();
        assertEquals(1, cart.size());
    }

    @Test
    void addTwice() {
        Cart cart = new Cart();
        cart.add();
        cart.add();
    }

    @Test
    void emptyCart() {
        assertTrue(new Cart().size() > 0, "a new cart should not be empty");
    }
}`,
        ),
        output: '2 passed, 1 failed',
        why: '`addTwice` has no assertion, so it passes as long as nothing throws: a test without assertions verifies almost nothing. `emptyCart` asserts something false and fails with the given message.',
      },
      {
        key: 'exception-fails',
        question: RUNNER_NOTE,
        code: junit(
          ['ParserTest'],
          `class ParserTest {
    @Test
    void parsesNumber() {
        assertEquals(42, Integer.parseInt("42"));
    }

    @Test
    void parsesWithSpaces() {
        assertEquals(42, Integer.parseInt(" 42 "));
    }
}`,
        ),
        output: '1 passed, 1 failed',
        why: 'An unexpected exception also fails a test: `Integer.parseInt(" 42 ")` throws `NumberFormatException` because of the spaces, so `parsesWithSpaces` fails even though no assertion was violated.',
      },
    ],
  ),
  ...b.blank(
    'java-junit-assertions',
    2,
    'Pick the JUnit 5 assertion that states the expectation: an equal value, a condition, or an expected exception.',
    [
      {
        key: 'assert-throws',
        prompt: 'Complete the test so that it passes only if withdrawing too much throws `IllegalStateException`.',
        template: junit(
          ['AccountTest'],
          `class Account {
    private int balance;
    Account(int balance) { this.balance = balance; }

    void withdraw(int amount) {
        if (amount > balance) throw new IllegalStateException("insufficient funds");
        balance -= amount;
    }
}

class AccountTest {
    @Test
    void rejectsOverdraft() {
        Account account = new Account(100);
        IllegalStateException e = {{blank:method}}(IllegalStateException.class, () -> account.withdraw(150));
        assertEquals("insufficient funds", e.getMessage());
    }
}`,
        ),
        blanks: { method: ['assertThrows'] },
        why: '`assertThrows(type, executable)` runs the lambda, fails if nothing (or a different type) is thrown, and returns the exception so you can assert on its message.',
      },
      {
        key: 'assert-equals-order',
        prompt: 'Complete the assertion following the JUnit convention for the argument order.',
        template: junit(
          ['InvoiceTest'],
          `class Invoice {
    int totalCents() { return 1250; }
}

class InvoiceTest {
    @Test
    void computesTotal() {
        int actual = new Invoice().totalCents();
        assertEquals({{blank:first}}, {{blank:second}});
    }
}`,
        ),
        blanks: { first: ['1250'], second: ['actual'] },
        why: 'JUnit’s `assertEquals(expected, actual)` takes the expected value first. Swapping them still passes or fails the same way, but the failure message (`expected: <...> but was: <...>`) would then be misleading.',
      },
      {
        key: 'assert-all',
        prompt: 'Complete the test so that all three checks are evaluated and reported together, even if the first one fails.',
        template: junit(
          ['AddressTest'],
          `record Address(String street, String city, String zip) {}

class AddressTest {
    @Test
    void parsesAddress() {
        Address a = new Address("Main St 1", "Springfield", "12345");
        {{blank:method}}(
            () -> assertEquals("Main St 1", a.street()),
            () -> assertEquals("Springfield", a.city()),
            () -> assertEquals("12345", a.zip()));
    }
}`,
        ),
        blanks: { method: ['assertAll'] },
        why: '`assertAll` executes every executable and reports all failures at once, instead of stopping at the first failing assertion.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-assertion-messages',
    3,
    'Read how JUnit builds its failure message: `expected: <...> but was: <...>`. Which argument is which?',
    [
      {
        key: 'swapped',
        code: `import org.opentest4j.AssertionFailedError;
import static org.junit.jupiter.api.Assertions.assertEquals;

public class Main {
    static int shippingCents(int weightKg) {
        return weightKg > 5 ? 999 : 499;
    }

    public static void main(String[] args) {
        try {
            assertEquals(shippingCents(6), 1499);
        } catch (AssertionFailedError e) {
            System.out.println(e.getMessage());
        }
    }
}`,
        correct: 'expected: <999> but was: <1499>',
        wrong: ['expected: <1499> but was: <999>', 'expected: <6> but was: <999>', 'assertion failed'],
        why: 'The first argument is reported as “expected”. Here the actual value was passed first, so the message claims the code returned `1499`, which sends whoever debugs the failure in the wrong direction. Write `assertEquals(1499, shippingCents(6))`.',
      },
      {
        key: 'message',
        code: `import org.opentest4j.AssertionFailedError;
import static org.junit.jupiter.api.Assertions.assertEquals;

public class Main {
    public static void main(String[] args) {
        int stock = 3;
        try {
            assertEquals(5, stock, "stock after restock");
        } catch (AssertionFailedError e) {
            System.out.println(e.getMessage());
        }
    }
}`,
        correct: 'stock after restock ==> expected: <5> but was: <3>',
        wrong: ['expected: <5> but was: <3>', 'stock after restock', 'expected: <3> but was: <5> ==> stock after restock'],
        why: 'In JUnit 5 the optional message is the last argument (in JUnit 4 it was the first). It is prefixed to the generated text with `==>`.',
      },
      {
        key: 'doubles',
        code: `import org.opentest4j.AssertionFailedError;
import static org.junit.jupiter.api.Assertions.assertEquals;

public class Main {
    public static void main(String[] args) {
        double total = 0.1 + 0.2;
        try {
            assertEquals(0.3, total, 0.000001);
            System.out.println("within delta");
            assertEquals(0.3, total);
            System.out.println("exact");
        } catch (AssertionFailedError e) {
            System.out.println(e.getMessage());
        }
    }
}`,
        correct: 'within delta\nexpected: <0.3> but was: <0.30000000000000004>',
        wrong: ['within delta\nexact', 'expected: <0.3> but was: <0.30000000000000004>', 'within delta'],
        why: 'The three-argument `assertEquals(expected, actual, delta)` accepts a small difference, so it passes. The exact comparison fails because `0.1 + 0.2` is not exactly `0.3` in binary floating point.',
      },
    ],
  ),
  ...b.output(
    'java-assertj-assertions',
    3,
    [
      'AssertJ reads left to right: `assertThat(actual).isEqualTo(expected)`, and collection assertions state exactly what they require.',
      '`containsExactly` checks order and size; `containsExactlyInAnyOrder` ignores order; `contains` allows extra elements.',
    ],
    [
      {
        key: 'collections',
        question: RUNNER_NOTE,
        code: junit(
          ['TagServiceTest'],
          `class TagService {
    List<String> normalize(List<String> tags) {
        return tags.stream().map(String::toLowerCase).distinct().sorted().toList();
    }
}

class TagServiceTest {
    private final List<String> result = new TagService().normalize(List.of("Java", "SQL", "java"));

    @Test void exact() { assertThat(result).containsExactly("java", "sql"); }
    @Test void anyOrder() { assertThat(result).containsExactlyInAnyOrder("sql", "java"); }
    @Test void wrongOrder() { assertThat(result).containsExactly("sql", "java"); }
    @Test void subset() { assertThat(result).contains("sql"); }
    @Test void size() { assertThat(result).hasSize(3); }
}`,
          ['import java.util.List;', 'import static org.assertj.core.api.Assertions.assertThat;'],
        ),
        output: '3 passed, 2 failed',
        why: 'The result is `[java, sql]`. `containsExactly` requires that order, so `wrongOrder` fails; `containsExactlyInAnyOrder` and `contains` pass. The duplicate `java` was removed, so `hasSize(3)` fails.',
      },
      {
        key: 'extracting',
        question: RUNNER_NOTE,
        code: junit(
          ['OrderQueryTest'],
          `record Order(String id, String status, int total) {}

class OrderQueryTest {
    private final List<Order> orders = List.of(new Order("o-1", "PAID", 120), new Order("o-2", "NEW", 40));

    @Test
    void ids() {
        assertThat(orders).extracting(Order::id).containsExactly("o-1", "o-2");
    }

    @Test
    void filtered() {
        assertThat(orders).filteredOn(o -> o.total() > 100).extracting(Order::status).containsOnly("PAID");
    }

    @Test
    void allPaid() {
        assertThat(orders).allMatch(o -> o.status().equals("PAID"));
    }
}`,
          ['import java.util.List;', 'import static org.assertj.core.api.Assertions.assertThat;'],
        ),
        output: '2 passed, 1 failed',
        why: '`extracting` maps the elements before the assertion, and `filteredOn` narrows them first. `o-2` is `NEW`, so `allMatch` fails.',
      },
      {
        key: 'exceptions',
        question: RUNNER_NOTE,
        code: junit(
          ['TransferTest'],
          `class Transfer {
    static void validate(int amount) {
        if (amount <= 0) throw new IllegalArgumentException("amount must be positive, was " + amount);
    }
}

class TransferTest {
    @Test
    void rejectsZero() {
        assertThatThrownBy(() -> Transfer.validate(0))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("positive");
    }

    @Test
    void rejectsNegativeWithValue() {
        assertThatThrownBy(() -> Transfer.validate(-5)).hasMessageEndingWith("was 5");
    }

    @Test
    void acceptsPositive() {
        assertThatCode(() -> Transfer.validate(10)).doesNotThrowAnyException();
    }
}`,
          ['import static org.assertj.core.api.Assertions.assertThatCode;', 'import static org.assertj.core.api.Assertions.assertThatThrownBy;'],
        ),
        output: '2 passed, 1 failed',
        why: '`assertThatThrownBy` captures the exception for further checks. For `-5` the message ends with `was -5`, not `was 5`, so that test fails. `assertThatCode(...).doesNotThrowAnyException()` passes for a valid amount.',
      },
    ],
  ),
  ...b.output(
    'java-parameterized-tests',
    3,
    [
      'Each argument set of a `@ParameterizedTest` runs as a separate test invocation.',
      '`@CsvSource` splits each string into arguments and converts them to the parameter types.',
    ],
    [
      {
        key: 'value-source',
        question: RUNNER_NOTE,
        code: junit(
          ['EmailValidatorTest'],
          `class EmailValidator {
    static boolean isValid(String email) {
        return email.contains("@") && !email.startsWith("@");
    }
}

class EmailValidatorTest {
    @ParameterizedTest
    @ValueSource(strings = {"ada@example.com", "linus@example.org", "@example.com", "grace.example.com"})
    void acceptsValidEmails(String email) {
        assertTrue(EmailValidator.isValid(email));
    }
}`,
          ['import org.junit.jupiter.params.ParameterizedTest;', 'import org.junit.jupiter.params.provider.ValueSource;'],
        ),
        output: '2 passed, 2 failed',
        why: 'The test runs once per value. Two of the values are invalid emails, so `assertTrue` fails for them: the data set mixes valid and invalid cases under a test named “acceptsValidEmails”. Split it into two tests (or use `@CsvSource` with the expected result).',
      },
      {
        key: 'csv-source',
        question: RUNNER_NOTE,
        code: junit(
          ['ShippingTest'],
          `class Shipping {
    static int cost(int weightKg, String zone) {
        int base = zone.equals("EU") ? 5 : 15;
        return weightKg > 10 ? base * 2 : base;
    }
}

class ShippingTest {
    @ParameterizedTest
    @CsvSource({
        "1, EU, 5",
        "11, EU, 10",
        "10, US, 15",
        "20, US, 25"
    })
    void computesCost(int weight, String zone, int expected) {
        assertEquals(expected, Shipping.cost(weight, zone));
    }
}`,
          ['import org.junit.jupiter.params.ParameterizedTest;', 'import org.junit.jupiter.params.provider.CsvSource;'],
        ),
        output: '3 passed, 1 failed',
        why: 'Each CSV row is one invocation, with values converted to `int` and `String`. The last row expects `25`, but a 20 kg US parcel costs `15 * 2 = 30`, so one invocation fails.',
      },
      {
        key: 'method-source',
        question: RUNNER_NOTE,
        code: junit(
          ['DiscountTest'],
          `class Discount {
    static int percentFor(int orderCount) {
        if (orderCount >= 10) return 15;
        if (orderCount >= 5) return 5;
        return 0;
    }
}

class DiscountTest {
    static Stream<Arguments> tiers() {
        return Stream.of(
            Arguments.of(0, 0),
            Arguments.of(5, 5),
            Arguments.of(9, 5),
            Arguments.of(10, 15));
    }

    @ParameterizedTest
    @MethodSource("tiers")
    void percentForOrderCount(int orders, int expected) {
        assertEquals(expected, Discount.percentFor(orders));
    }
}`,
          [
            'import java.util.stream.Stream;',
            'import org.junit.jupiter.params.ParameterizedTest;',
            'import org.junit.jupiter.params.provider.Arguments;',
            'import org.junit.jupiter.params.provider.MethodSource;',
          ],
        ),
        output: '4 passed, 0 failed',
        why: '`@MethodSource` takes the arguments from a static factory method. Testing the values at the tier boundaries (4/5 and 9/10) is where off-by-one mistakes hide; here all four invocations pass.',
      },
    ],
  ),
  ...b.output(
    'java-test-lifecycle',
    4,
    [
      'By default, JUnit 5 creates a new instance of the test class for every test method.',
      '`@BeforeEach` runs before every test; `@BeforeAll` runs once and must be static (with the default lifecycle).',
    ],
    [
      {
        key: 'fresh-instance',
        question: RUNNER_NOTE,
        code: junit(
          ['CounterTest'],
          `class CounterTest {
    private int calls = 0;

    @Test void first() { calls++; assertEquals(1, calls); }
    @Test void second() { calls++; assertEquals(1, calls); }
    @Test void third() { calls++; assertEquals(1, calls); }
}`,
        ),
        output: '3 passed, 0 failed',
        why: 'Each test method runs on a new `CounterTest` instance, so the instance field `calls` starts at `0` every time and all three tests pass, in any order. A `static` field, by contrast, would be shared by all tests and make them order-dependent.',
      },
      {
        key: 'before-each',
        question: RUNNER_NOTE,
        code: junit(
          ['InventoryTest'],
          `class Inventory {
    private final Map<String, Integer> stock = new HashMap<>();
    void add(String sku, int qty) { stock.merge(sku, qty, Integer::sum); }
    int quantity(String sku) { return stock.getOrDefault(sku, 0); }
}

class InventoryTest {
    private Inventory inventory;

    @BeforeEach
    void setUp() {
        inventory = new Inventory();
        inventory.add("pen", 10);
    }

    @Test void addsToExisting() { inventory.add("pen", 5); assertEquals(15, inventory.quantity("pen")); }
    @Test void startsWithTen() { assertEquals(10, inventory.quantity("pen")); }
    @Test void unknownIsZero() { assertEquals(0, inventory.quantity("ink")); }
}`,
          ['import java.util.HashMap;', 'import java.util.Map;'],
        ),
        output: '3 passed, 0 failed',
        why: '`@BeforeEach` builds a fresh fixture for every test, so `addsToExisting` cannot affect `startsWithTen`, whichever runs first. Independent tests can run in any order.',
      },
      {
        key: 'nested-display',
        question: RUNNER_NOTE,
        code: junit(
          ['OrderStatusTest'],
          `enum Status { NEW, PAID, SHIPPED }

class OrderStatusTest {
    @Nested
    class WhenNew {
        Status status = Status.NEW;

        @Test void canBePaid() { assertTrue(status.ordinal() < Status.PAID.ordinal()); }
        @Test void isNotShipped() { assertNotEquals(Status.SHIPPED, status); }
    }

    @Nested
    class WhenShipped {
        Status status = Status.SHIPPED;

        @Test @Disabled("refunds not implemented yet") void canBeRefunded() { fail(); }
        @Test void isFinal() { assertEquals(Status.values().length - 1, status.ordinal()); }
    }
}`,
        ),
        output: '3 passed, 0 failed',
        why: '`@Nested` inner classes group tests by situation and are discovered with their outer class. The `@Disabled` test is skipped, which counts neither as passed nor as failed.',
      },
    ],
  ),
  ...b.fails(
    'java-mockito-verification',
    3,
    'Mockito records every call on a mock. `verify` fails if the expected interaction did not happen exactly as described.',
    [
      {
        key: 'not-invoked',
        question: 'This check (written directly in `main` for brevity) fails. What does the failure mean?',
        code: `import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

public class Main {
    public static void main(String[] args) {
        EmailGateway gateway = mock(EmailGateway.class);
        SignupService service = new SignupService(gateway);
        service.register("ada@example.com", false);
        verify(gateway).send(any(), any());
    }
}

interface EmailGateway {
    void send(String to, String body);
}

class SignupService {
    private final EmailGateway gateway;

    SignupService(EmailGateway gateway) {
        this.gateway = gateway;
    }

    void register(String email, boolean newsletter) {
        if (newsletter) {
            gateway.send(email, "Welcome!");
        }
    }
}`,
        error: 'WantedButNotInvoked',
        correct: 'The service never called `send`, because the welcome email is only sent when `newsletter` is `true`; either the test expectation or the business rule is wrong.',
        wrong: [
          '`mock` creates a real `EmailGateway`, so the email was sent but not recorded.',
          '`any()` does not match `String` arguments, so the call was not recognized.',
          '`verify` must be called before `register`.',
        ],
        why: 'Mockito reports `Wanted but not invoked: emailGateway.send(<any>, <any>)` and notes that there were zero interactions with the mock. `any()` matches any argument including strings, and `verify` checks interactions that already happened, so it belongs after the call.',
      },
      {
        key: 'too-many',
        question: 'Why does this verification fail?',
        code: `import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.util.List;

public class Main {
    public static void main(String[] args) {
        AuditLog log = mock(AuditLog.class);
        new BatchImporter(log).importAll(List.of("a", "b"));
        verify(log).record("import finished");
    }
}

interface AuditLog {
    void record(String message);
}

class BatchImporter {
    private final AuditLog log;

    BatchImporter(AuditLog log) {
        this.log = log;
    }

    void importAll(List<String> rows) {
        for (String row : rows) {
            log.record("import finished");
        }
    }
}`,
        error: 'TooManyActualInvocations',
        correct: '`verify(mock)` means exactly once by default, and the importer logs “import finished” once per row (twice); the log call belongs after the loop, or the test must use `times(2)`.',
        wrong: [
          '`verify` checks that the method was called at least once, so the failure must come from the list.',
          'The message is compared by reference, so the two literals do not match.',
          '`mock` cannot be used with interfaces that have `void` methods.',
        ],
        why: '`verify(log)` is shorthand for `verify(log, times(1))`, so two invocations fail with `TooManyActualInvocations`. The failure points to a real bug: the “finished” entry is written inside the loop. Arguments are compared with `equals`, and `void` methods can be verified normally.',
      },
    ],
  ),
  ...b.codeChoice(
    'java-mockito-stubbing',
    4,
    'An unstubbed method on a mock returns a default (`null`, `0`, `false`, an empty collection or `Optional.empty()`). Stubbing matches arguments with `equals` unless matchers are used.',
    [
      {
        key: 'argument-mismatch',
        question: 'The test expects a total of `200`, but the service computes `0`. Why?',
        code: `import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

public class Main {
    public static void main(String[] args) {
        PriceRepository prices = mock(PriceRepository.class);
        when(prices.unitPrice("PEN")).thenReturn(100);
        int total = new CheckoutService(prices).total("pen", 2);
        System.out.println(total == 200 ? "as expected" : "unexpected total");
    }
}

interface PriceRepository {
    int unitPrice(String sku);
}

class CheckoutService {
    private final PriceRepository prices;

    CheckoutService(PriceRepository prices) {
        this.prices = prices;
    }

    int total(String sku, int quantity) {
        return prices.unitPrice(sku) * quantity;
    }
}`,
        correct: 'The stub is for `"PEN"`, but the service is called with `"pen"`; the arguments are not equal, so the mock returns the default `0` for an `int` method.',
        wrong: [
          '`thenReturn` only takes effect after `verify` has been called.',
          'Mocks of interfaces always return `0` for primitive methods, whatever is stubbed.',
          '`when` must be called after the service is created.',
        ],
        why: 'Stubbed arguments are compared with `equals`, and `"PEN"` is not equal to `"pen"`. Calls that match no stubbing return defaults instead of failing, which can hide mistakes; Mockito’s strict stubs (with `MockitoExtension`) report such unused stubbings.',
      },
      {
        key: 'what-to-mock',
        question: 'You are writing a unit test for `InvoiceService.total`. Which test design is best?',
        code: `import java.math.BigDecimal;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        InvoiceService service = new InvoiceService(id -> List.of(new Line(new BigDecimal("2.50"), 2)));
        System.out.println(service.total("inv-1"));
    }
}

record Line(BigDecimal unitPrice, int quantity) {
    BigDecimal amount() { return unitPrice.multiply(BigDecimal.valueOf(quantity)); }
}

interface LineRepository {
    List<Line> findByInvoice(String invoiceId);
}

class InvoiceService {
    private final LineRepository lines;

    InvoiceService(LineRepository lines) {
        this.lines = lines;
    }

    BigDecimal total(String invoiceId) {
        return lines.findByInvoice(invoiceId).stream().map(Line::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}`,
        correct: 'Replace only `LineRepository` with a mock or a fake that returns real `Line` records, and assert on the returned total.',
        wrong: [
          'Mock `Line` and `BigDecimal` too, so that the test does not depend on any real class.',
          'Mock `InvoiceService` itself and verify that `total` was called.',
          'Do not use a test double; connect the test to the production database to get realistic data.',
        ],
        why: 'Test doubles replace dependencies at the boundary (repositories, gateways), while value objects such as records and `BigDecimal` should be real: mocking them tests nothing. Mocking the class under test verifies only the mock. A production database makes a unit test slow and fragile; that belongs in integration tests.',
      },
      {
        key: 'then-throw',
        question: 'This stubbing simulates a failing payment provider. What does the program print?',
        code: `import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

public class Main {
    public static void main(String[] args) {
        PaymentGateway gateway = mock(PaymentGateway.class);
        when(gateway.charge(anyLong())).thenThrow(new IllegalStateException("provider down"));
        String status = new CheckoutService(gateway).pay(1999);
        System.out.println("status=" + status);
    }
}

interface PaymentGateway {
    String charge(long cents);
}

class CheckoutService {
    private final PaymentGateway gateway;

    CheckoutService(PaymentGateway gateway) {
        this.gateway = gateway;
    }

    String pay(long cents) {
        try {
            return gateway.charge(cents);
        } catch (IllegalStateException e) {
            return "RETRY_LATER";
        }
    }
}`,
        correct: 'It prints `status=RETRY_LATER`: the stub throws for any amount, and the service handles the failure.',
        wrong: [
          'It prints `status=null`, because `thenThrow` only records the exception for `verify`.',
          'It throws `IllegalStateException` from `when(...)` while the stub is being defined.',
          'It prints `status=provider down`, because the exception message is returned.',
        ],
        why: '`thenThrow` makes every matching call throw the given exception, which lets a unit test exercise error handling without a real provider. During `when(gateway.charge(anyLong()))` the mock is only recording the call, so nothing is thrown there.',
      },
    ],
  ),
  ...b.fails(
    'java-mockito-matchers',
    5,
    'When one argument uses a matcher (`any()`, `eq()`, `anyInt()`), every argument of that call must be a matcher.',
    [
      {
        key: 'mixed',
        question: 'Defining this stub fails. Why?',
        code: `import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;

public class Main {
    public static void main(String[] args) {
        OrderRepository repo = mock(OrderRepository.class);
        when(repo.findByCustomer("ada", anyInt())).thenReturn(List.of("o-1"));
        System.out.println(repo.findByCustomer("ada", 10));
    }
}

interface OrderRepository {
    List<String> findByCustomer(String customer, int limit);
}`,
        error: 'InvalidUseOfMatchersException',
        correct: 'It mixes a raw value (`"ada"`) with a matcher (`anyInt()`); wrap the raw value in `eq("ada")` so that both arguments are matchers.',
        wrong: [
          '`anyInt()` cannot be used for `int` parameters; use `any()`.',
          '`thenReturn` cannot return a `List`.',
          'Interfaces with generic return types cannot be mocked.',
        ],
        why: 'Matchers are recorded on a stack while the call is evaluated, so Mockito needs a matcher for every argument to line them up: “Invalid use of argument matchers! 2 matchers expected, 1 recorded”. `eq("ada")` fixes it. `anyInt()` is the right matcher for an `int`.',
      },
      {
        key: 'verify-mixed',
        question: 'Why does this verification fail before it checks anything?',
        code: `import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

public class Main {
    public static void main(String[] args) {
        Notifier notifier = mock(Notifier.class);
        notifier.alert("ada", "Your order shipped");
        verify(notifier).alert("ada", anyString());
    }
}

interface Notifier {
    void alert(String user, String message);
}`,
        error: 'InvalidUseOfMatchersException',
        correct: 'The same rule applies to `verify`: `"ada"` is a raw value while `anyString()` is a matcher; use `verify(notifier).alert(eq("ada"), anyString())`.',
        wrong: [
          'The call to `alert` was made with different arguments, so Mockito reports a mismatch.',
          '`anyString()` does not match messages with spaces.',
          '`verify` cannot be used with `void` methods; use `when` instead.',
        ],
        why: 'The interaction did happen with matching values, but the verification itself is malformed: mixing raw values and matchers throws `InvalidUseOfMatchersException`. `void` methods are verified exactly like others.',
      },
    ],
  ),
  ...b.concept(
    'java-testing-practices',
    2,
    'A unit test should be fast, independent and focused on behavior that matters to the business.',
    [
      {
        key: 'naming',
        question: 'Which test is the most useful for a rule “orders over 100 EUR ship for free”?',
        snippet: plain(`A: @Test void test1() { assertNotNull(service.shippingCost(order(150))); }

B: @Test void freeShippingAbove100() {
       assertEquals(0, service.shippingCost(order(150)));
       assertEquals(499, service.shippingCost(order(100)));
   }

C: @Test void shippingCostCallsRepository() {
       service.shippingCost(order(150));
       verify(repository).findRates();
   }

D: @Test void freeShipping() { System.out.println(service.shippingCost(order(150))); }`),
        correct: 'B: it names the rule and checks the boundary on both sides with concrete expected values.',
        wrong: [
          'A: it covers the case and cannot fail because of formatting differences.',
          'C: verifying the interaction proves the calculation is right.',
          'D: printing the value lets a developer check it during the build.',
        ],
        why: 'Good tests assert observable behavior with exact expectations, including boundaries (100 versus just above). A only proves something non-null was returned, C tests an implementation detail instead of the result, and D asserts nothing, so it can never fail.',
      },
      {
        key: 'independence',
        question: 'A test suite passes when run in the IDE one class at a time but fails on the build server. What is the most likely cause?',
        correct: 'Tests share mutable state (a static field, a singleton, a database row) and depend on the order in which they run.',
        wrong: [
          'The build server runs JUnit 4 instead of JUnit 5, which uses different assertions.',
          'Tests that pass in the IDE are cached and never run on the build server.',
          'Parameterized tests are not supported on build servers.',
        ],
        why: 'Order-dependent failures almost always come from shared state that one test changes and another relies on. Each test should create its own fixture (for example in `@BeforeEach`) and clean up after itself.',
      },
    ],
  ),
];
