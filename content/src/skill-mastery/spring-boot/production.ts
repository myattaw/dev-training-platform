import type { QuestionSource } from '@pracstack/content-model';
import { plain } from '../helpers';
import { programBuilders } from '../program-builders';

/*
 * Testing, operations and architecture. Tests run in-process with the JUnit
 * Platform launcher. A full Spring Boot web application with Actuator does not
 * start reliably within the runner's time limit when several programs run at
 * once, so the endpoint questions show compiled (not executed) code; their
 * answers were verified against a running application. Health indicators,
 * availability state and logging levels run for real.
 */

const b = programBuilders('java');

// ---------------------------------------------------------------- Testing

const JUNIT_IMPORTS = `import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.platform.launcher.core.*;
import org.junit.platform.launcher.listeners.SummaryGeneratingListener;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectClass;`;

/** A main method that runs one test class with the JUnit Platform and prints a summary. */
function runTests(testClass: string, failureNames = true): string {
  const names = failureNames
    ? `
        summary.getFailures().stream()
            .map(f -> "failed: " + f.getTestIdentifier().getDisplayName())
            .sorted()
            .forEach(System.out::println);`
    : '';
  return `public class Main {
    // Runs the test class like a build tool would and prints a summary.
    public static void main(String[] args) {
        var listener = new SummaryGeneratingListener();
        LauncherFactory.create().execute(LauncherDiscoveryRequestBuilder.request()
            .selectors(selectClass(${testClass}.class)).build(), listener);
        var summary = listener.getSummary();
        System.out.println(summary.getTestsSucceededCount() + " passed, " + summary.getTestsFailedCount() + " failed");${names}
    }
}`;
}

export const testingFamilies: readonly QuestionSource[] = [
  ...b.output(
    'sb-test-junit-basics',
    1,
    ['Each `@Test` method is run separately; a failed assertion fails only that test.'],
    [
      {
        key: 'one-failure',
        code: `${JUNIT_IMPORTS}

${runTests('PriceCalculatorTest')}

class PriceCalculator {
    int withTax(int net) { return net + net / 5; }
    int discounted(int price, int percent) { return price - price * percent / 100; }
}

class PriceCalculatorTest {
    PriceCalculator calculator = new PriceCalculator();

    @Test
    void addsTwentyPercentTax() {
        assertEquals(120, calculator.withTax(100));
    }

    @Test
    void appliesDiscount() {
        assertEquals(90, calculator.discounted(100, 10));
    }

    @Test
    void roundsTaxUp() {
        assertEquals(2, calculator.withTax(1));
    }
}`,
        output: '2 passed, 1 failed\nfailed: roundsTaxUp()',
        why: '`withTax(1)` is `1 + 1 / 5`, and integer division makes `1 / 5` zero, so it returns 1, not 2. The other tests pass independently; one failing assertion does not stop the remaining tests.',
      },
      {
        key: 'assert-throws',
        code: `${JUNIT_IMPORTS}

${runTests('AccountTest')}

class Account {
    private int balance;
    Account(int balance) { this.balance = balance; }

    void withdraw(int amount) {
        if (amount > balance) throw new IllegalArgumentException("insufficient funds");
        balance -= amount;
    }

    int balance() { return balance; }
}

class AccountTest {
    @Test
    void rejectsOverdraft() {
        var account = new Account(50);
        var e = assertThrows(IllegalArgumentException.class, () -> account.withdraw(80));
        assertEquals("insufficient funds", e.getMessage());
        assertEquals(50, account.balance());
    }

    @Test
    void withdrawsExactBalance() {
        var account = new Account(50);
        assertThrows(IllegalArgumentException.class, () -> account.withdraw(50));
    }
}`,
        output: '1 passed, 1 failed\nfailed: withdrawsExactBalance()',
        why: '`assertThrows` passes only if the lambda throws the expected type. Withdrawing exactly the balance is allowed (`50 > 50` is false), so nothing is thrown and the second test fails. The first test also checks that a rejected withdrawal leaves the balance unchanged.',
      },
    ],
  ),
  ...b.blank(
    'sb-test-junit-blank',
    1,
    'One annotation marks a test method; one assertion compares an expected value with the actual one.',
    [
      {
        key: 'test-and-assert',
        prompt: 'Complete the test so that it runs and checks the slug.',
        template: `${JUNIT_IMPORTS}

${runTests('SlugTest')}

class Slugs {
    static String of(String title) { return title.trim().toLowerCase().replace(' ', '-'); }
}

class SlugTest {
    @{{blank:annotation}}
    void makesLowercaseSlugs() {
        {{blank:assertion}}("spring-boot-tips", Slugs.of(" Spring Boot Tips "));
    }
}`,
        blanks: { annotation: ['Test'], assertion: ['assertEquals'] },
        why: '`@Test` marks the method for the JUnit engine, and `assertEquals(expected, actual)` compares the values; the expected value comes first, which makes failure messages read correctly.',
      },
    ],
  ),
  ...b.output(
    'sb-test-assertj',
    2,
    ['AssertJ assertions read left to right: `assertThat(actual)` followed by the expectation.'],
    [
      {
        key: 'collections',
        code: `${JUNIT_IMPORTS}
import static org.assertj.core.api.Assertions.assertThat;
import java.util.List;

${runTests('TagServiceTest')}

class TagService {
    List<String> normalize(List<String> tags) {
        return tags.stream().map(String::toLowerCase).distinct().sorted().toList();
    }
}

class TagServiceTest {
    TagService service = new TagService();

    @Test
    void sortsAndDeduplicates() {
        assertThat(service.normalize(List.of("Java", "spring", "java")))
            .containsExactly("java", "spring");
    }

    @Test
    void keepsAllDistinctTags() {
        assertThat(service.normalize(List.of("b", "a", "c")))
            .containsExactly("b", "a", "c");
    }

    @Test
    void containsTheTags() {
        assertThat(service.normalize(List.of("b", "a", "c")))
            .containsExactlyInAnyOrder("b", "a", "c")
            .hasSize(3);
    }
}`,
        output: '2 passed, 1 failed\nfailed: keepsAllDistinctTags()',
        why: '`containsExactly` checks the elements and their order, and the service sorts the tags, so `b, a, c` fails. `containsExactlyInAnyOrder` ignores order. Choose the assertion that states what the behavior actually guarantees.',
      },
      {
        key: 'exceptions-and-strings',
        code: `${JUNIT_IMPORTS}
import static org.assertj.core.api.Assertions.*;

${runTests('UsernameTest')}

class Usernames {
    static String validate(String name) {
        if (name.length() < 3) throw new IllegalArgumentException("too short: " + name);
        return name.toLowerCase();
    }
}

class UsernameTest {
    @Test
    void lowercases() {
        assertThat(Usernames.validate("AdaL")).isEqualTo("adal").startsWith("ad");
    }

    @Test
    void rejectsShortNames() {
        assertThatThrownBy(() -> Usernames.validate("al"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("too short");
    }

    @Test
    void rejectsBlankNames() {
        assertThatThrownBy(() -> Usernames.validate("   "))
            .isInstanceOf(IllegalArgumentException.class);
    }
}`,
        output: '2 passed, 1 failed\nfailed: rejectsBlankNames()',
        why: 'Three spaces have length 3, so `validate` does not throw and the third test fails; the test found a real gap in the validation. AssertJ chains several checks on one value and has expressive exception assertions.',
      },
    ],
  ),
  ...b.output(
    'sb-test-lifecycle',
    3,
    [
      'JUnit creates a new instance of the test class for every test method; static fields are shared.',
    ],
    [
      {
        key: 'instance-per-method',
        code: `${JUNIT_IMPORTS}
import java.util.*;

${runTests('CartTest', false)}

class CartTest {
    List<String> cart = new ArrayList<>();
    static List<String> sharedCart = new ArrayList<>();

    @Test
    void addsPen() {
        cart.add("pen");
        sharedCart.add("pen");
        assertEquals(1, cart.size());
        assertEquals(1, sharedCart.size());
    }

    @Test
    void addsCup() {
        cart.add("cup");
        sharedCart.add("cup");
        assertEquals(1, cart.size());
        assertEquals(1, sharedCart.size());
    }
}`,
        output: '1 passed, 1 failed',
        why: 'Each test gets a fresh `CartTest` instance, so `cart` always starts empty. `sharedCart` is static and survives between tests, so whichever test runs second sees two items and fails. Shared mutable state makes tests depend on their order.',
      },
      {
        key: 'before-each',
        code: `${JUNIT_IMPORTS}
import java.util.*;

${runTests('InventoryTest')}

class Inventory {
    private final Map<String, Integer> stock = new HashMap<>();
    void add(String sku, int n) { stock.merge(sku, n, Integer::sum); }
    int count(String sku) { return stock.getOrDefault(sku, 0); }
}

class InventoryTest {
    static Inventory inventory;

    @BeforeEach
    void freshInventory() {
        inventory = new Inventory();
        inventory.add("pen", 5);
    }

    @Test
    void addsStock() {
        inventory.add("pen", 3);
        assertEquals(8, inventory.count("pen"));
    }

    @Test
    void startsWithFivePens() {
        assertEquals(5, inventory.count("pen"));
    }
}`,
        output: '2 passed, 0 failed',
        why: '`@BeforeEach` runs before every test, so each one starts from a known fixture even though the field is static. Setting up state per test (instead of relying on what earlier tests left behind) keeps tests independent of execution order.',
      },
    ],
  ),
  ...b.codeChoice(
    'sb-test-mockito-stubbing',
    2,
    'A Mockito mock returns what was stubbed for matching arguments, and a default value for everything else.',
    [
      {
        key: 'unmatched-argument',
        question: 'What does the last line print?',
        code: `import static org.mockito.Mockito.*;
import java.util.Optional;

public class Main {
    public static void main(String[] args) {
        PriceRepository prices = mock(PriceRepository.class);
        when(prices.find("pen")).thenReturn(Optional.of(3));

        System.out.println(prices.find("pen"));
        System.out.println(prices.find("PEN"));
    }
}

interface PriceRepository {
    Optional<Integer> find(String sku);
}`,
        correct:
          '`Optional.empty`, because the stub only matches the argument `"pen"` and unstubbed calls return a default.',
        wrong: [
          '`Optional[3]`, because Mockito compares strings case-insensitively.',
          '`null`, because unstubbed methods always return `null`.',
          'It throws `UnnecessaryStubbingException`.',
        ],
        why: 'Stubs match arguments with `equals`, so `"PEN"` is a different call. For unstubbed calls Mockito returns “empty” defaults: `Optional.empty()` for `Optional`, `0` for numbers, empty collections, `false`, and `null` for other objects. Strict-stubbing errors only appear with the JUnit extension.',
      },
      {
        key: 'any-matcher',
        question: 'The test stubs with an argument matcher. What does the program print?',
        code: `import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

public class Main {
    public static void main(String[] args) {
        ExchangeRates rates = mock(ExchangeRates.class);
        when(rates.rate(eq("EUR"), anyString())).thenReturn(2);

        var converter = new Converter(rates);
        System.out.println(converter.convert(10, "EUR", "USD") + " " + converter.convert(10, "GBP", "USD"));
    }
}

interface ExchangeRates {
    int rate(String from, String to);
}

class Converter {
    private final ExchangeRates rates;
    Converter(ExchangeRates rates) { this.rates = rates; }
    int convert(int amount, String from, String to) { return amount * rates.rate(from, to); }
}`,
        correct: '`20 0`',
        wrong: ['`20 20`', '`20 null`', '`0 0`'],
        why: 'The stub matches any target currency when the source is `"EUR"`, so the first conversion uses rate 2. `"GBP"` does not match, so the mock returns the `int` default 0. When one argument uses a matcher, all arguments must be matchers, hence `eq("EUR")`.',
      },
    ],
  ),
  ...b.fails(
    'sb-test-mockito-verify',
    3,
    'Read the Mockito failure: it compares the wanted interaction with the actual ones.',
    [
      {
        key: 'different-arguments',
        question:
          'This interaction test fails. What does the failure say about the code under test?',
        code: `import static org.mockito.Mockito.*;

public class Main {
    public static void main(String[] args) {
        Mailer mailer = mock(Mailer.class);
        new SignupService(mailer).register("ann@example.com");
        verify(mailer).send("ann@example.com", "Welcome");
    }
}

interface Mailer {
    void send(String to, String subject);
}

class SignupService {
    private final Mailer mailer;
    SignupService(Mailer mailer) { this.mailer = mailer; }

    void register(String email) {
        mailer.send(email, "Welcome!");
    }
}`,
        error: 'Argument(s) are different!',
        correct:
          'The mailer was called, but with the subject `"Welcome!"` instead of `"Welcome"`; either the test or the code has the wrong subject.',
        wrong: [
          'The mailer was never called because `register` runs asynchronously.',
          '`verify` cannot be used on interfaces; mock a concrete class instead.',
          'The mock must be reset before `verify` is called.',
        ],
        why: 'Mockito found an invocation of `send` with different arguments and reports both, the wanted one and the actual one. That is far more precise than “not called”. Decide which subject is right and fix the other side.',
      },
      {
        key: 'never-invoked',
        question: 'Why does this test fail?',
        code: `import static org.mockito.Mockito.*;

public class Main {
    public static void main(String[] args) {
        AuditLog audit = mock(AuditLog.class);
        var service = new RefundService(audit);
        service.refund("order-7", 0);
        verify(audit).record("refund order-7");
    }
}

interface AuditLog {
    void record(String message);
}

class RefundService {
    private final AuditLog audit;
    RefundService(AuditLog audit) { this.audit = audit; }

    void refund(String orderId, int amount) {
        if (amount <= 0) return;
        audit.record("refund " + orderId);
    }
}`,
        error: 'Wanted but not invoked',
        correct:
          'A zero refund returns early, so `record` is never called; the test exercises a different branch than the one it verifies.',
        wrong: [
          'Mockito mocks ignore calls with `String` arguments.',
          '`verify` must be called before the method under test.',
          'The message contains a space, which Mockito cannot match.',
        ],
        why: '“Wanted but not invoked … there were zero interactions with this mock” means the code path never reached the collaborator. Here the input `0` hits the guard clause. Use input that reaches the behavior you verify, and add a separate test for the early return.',
      },
    ],
  ),
  ...b.output(
    'sb-test-mockmvc',
    3,
    [
      'A controller test sends a request through MockMvc and asserts the status and body with `andExpect`.',
    ],
    [
      {
        key: 'controller-tests',
        code: `${JUNIT_IMPORTS}
import org.springframework.web.bind.annotation.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.util.Optional;

${runTests('BookControllerTest')}

record Book(long id, String title) {}

interface BookService { Optional<Book> find(long id); }

@RestController
class BookController {
    private final BookService books;
    BookController(BookService books) { this.books = books; }

    @GetMapping("/books/{id}")
    org.springframework.http.ResponseEntity<Book> one(@PathVariable long id) {
        return org.springframework.http.ResponseEntity.of(books.find(id));
    }
}

class BookControllerTest {
    BookService fake = id -> id == 1 ? Optional.of(new Book(1, "Dune")) : Optional.empty();
    MockMvc mvc = MockMvcBuilders.standaloneSetup(new BookController(fake)).build();

    @Test
    void returnsBook() throws Exception {
        mvc.perform(get("/books/1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.title").value("Dune"));
    }

    @Test
    void unknownBookIs404() throws Exception {
        mvc.perform(get("/books/2")).andExpect(status().isNotFound());
    }

    @Test
    void returnsExactJson() throws Exception {
        mvc.perform(get("/books/1")).andExpect(content().string("{\\"title\\":\\"Dune\\",\\"id\\":1}"));
    }
}`,
        output: '2 passed, 1 failed\nfailed: returnsExactJson()',
        why: 'The first two tests match the controller’s behavior. The third compares the body as a string, and Jackson writes record components in declaration order (`id` first), so the comparison fails although the JSON means the same. `jsonPath` (or a JSON-aware comparison) tests the contract without depending on formatting. The fake service keeps the test fast and focused on the web layer.',
      },
    ],
  ),
  ...b.concept(
    'sb-test-slices',
    4,
    'Each test annotation decides how much of the application context is started.',
    [
      {
        key: 'controller-slice',
        question:
          'You want to test a controller’s JSON mapping, validation and status codes with its service mocked, as fast as possible. Which test setup fits best?',
        correct:
          '`@WebMvcTest(OrderController.class)` with the service provided by `@MockitoBean`.',
        wrong: [
          '`@SpringBootTest` with a real database, because only full tests are trustworthy.',
          '`@DataJpaTest`, because the controller eventually reads from the database.',
          'A plain unit test calling the controller method directly, which also checks the JSON and the validation.',
        ],
        why: '`@WebMvcTest` starts only the web layer (controllers, advice, converters, validation) and gives you MockMvc; `@MockitoBean` replaces the service. Calling the method directly skips HTTP mapping, JSON conversion and validation. `@SpringBootTest` starts everything and is slower; keep it for a few end-to-end tests.',
      },
      {
        key: 'repository-slice',
        question:
          'You want to verify a custom `@Query` and a derived query against a real database schema. Which annotation fits best?',
        correct:
          '`@DataJpaTest`, which starts JPA, repositories and an embedded (or Testcontainers) database, and rolls back each test.',
        wrong: [
          '`@WebMvcTest`, because repositories are used by controllers.',
          'Mock the repository with Mockito and assert on the stubbed result.',
          '`@JsonTest`, because the query returns entities that are serialized later.',
        ],
        why: 'Queries can only be verified against a real database: mocking the repository tests nothing of the query. `@DataJpaTest` loads just the persistence slice and wraps each test in a transaction that is rolled back, so tests do not leak data into each other.',
      },
      {
        key: 'full-context',
        question: 'When is `@SpringBootTest` the right choice?',
        correct:
          'For a small number of integration tests that check the wiring of the real application, such as a request flowing through security, controller, service and database.',
        wrong: [
          'For every unit test, so that all tests use the same setup.',
          'When a test needs a mocked collaborator, because only full contexts support Mockito.',
          'For testing a pure function such as a price calculator.',
        ],
        why: '`@SpringBootTest` starts the full application context, which catches wiring and configuration problems but is the slowest kind of test. Most logic is best covered by plain unit tests and slice tests; a few full tests confirm the pieces fit together.',
      },
    ],
  ),
  ...b.output(
    'sb-test-db-fixtures',
    5,
    [
      'A database shared by all tests keeps whatever earlier tests inserted, unless each test resets it.',
    ],
    [
      {
        key: 'leftover-rows',
        code: `${JUNIT_IMPORTS}
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.embedded.*;

${runTests('CustomerRepositoryTest')}

@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class CustomerRepositoryTest {
    static JdbcClient jdbc;

    @BeforeAll
    static void createSchema() {
        jdbc = JdbcClient.create(new EmbeddedDatabaseBuilder().setType(EmbeddedDatabaseType.H2).build());
        jdbc.sql("create table customer (name varchar(20))").update();
    }

    @Test @Order(1)
    void insertsCustomer() {
        jdbc.sql("insert into customer values ('ann')").update();
        assertEquals(1, jdbc.sql("select count(*) from customer").query(Integer.class).single());
    }

    @Test @Order(2)
    void insertsAnotherCustomer() {
        jdbc.sql("insert into customer values ('bob')").update();
        assertEquals(1, jdbc.sql("select count(*) from customer").query(Integer.class).single());
    }
}`,
        output: '1 passed, 1 failed\nfailed: insertsAnotherCustomer()',
        why: 'The schema and the data live as long as the static database. The second test sees Ann from the first test and counts 2. Tests should create and clean their own fixtures (or run in a transaction that is rolled back, as `@DataJpaTest` does), so that they pass in any order.',
      },
      {
        key: 'clean-fixture',
        code: `${JUNIT_IMPORTS}
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.embedded.*;

${runTests('CustomerRepositoryTest')}

@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class CustomerRepositoryTest {
    static JdbcClient jdbc;

    @BeforeAll
    static void createSchema() {
        jdbc = JdbcClient.create(new EmbeddedDatabaseBuilder().setType(EmbeddedDatabaseType.H2).build());
        jdbc.sql("create table customer (name varchar(20))").update();
    }

    @BeforeEach
    void cleanTable() {
        jdbc.sql("delete from customer").update();
        jdbc.sql("insert into customer values ('fixture')").update();
    }

    @Test @Order(1)
    void insertsCustomer() {
        jdbc.sql("insert into customer values ('ann')").update();
        assertEquals(2, jdbc.sql("select count(*) from customer").query(Integer.class).single());
    }

    @Test @Order(2)
    void insertsAnotherCustomer() {
        jdbc.sql("insert into customer values ('bob')").update();
        assertEquals(2, jdbc.sql("select count(*) from customer").query(Integer.class).single());
    }
}`,
        output: '2 passed, 0 failed',
        why: '`@BeforeEach` resets the table to a known fixture before every test, so each test sees exactly one fixture row plus its own insert, whatever ran before. The schema is still created once in `@BeforeAll`, which keeps the setup cheap.',
      },
    ],
  ),
  ...b.codeChoice(
    'sb-test-behavior-not-implementation',
    4,
    'Would the test still pass after a correct refactoring of the code?',
    [
      {
        key: 'clock-dependent',
        question:
          'This test passed for weeks and then started failing without any code change. What is the cause and the fix?',
        code: `import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertFalse;
import java.time.LocalDate;

class TrialService {
    boolean isExpired(LocalDate trialStart) {
        return trialStart.plusDays(30).isBefore(LocalDate.now());
    }
}

class TrialServiceTest {
    @Test
    void freshTrialIsNotExpired() {
        assertFalse(new TrialService().isExpired(LocalDate.of(2026, 1, 1)));
    }
}`,
        correct:
          'The result depends on today’s date, so the test broke once 30 days had passed; inject a `Clock` into `TrialService` and use a fixed clock in the test.',
        wrong: [
          'JUnit caches `LocalDate` values between runs; clear the build cache.',
          '`assertFalse` is unreliable for dates; compare strings instead.',
          'The test needs `@SpringBootTest` so that Spring provides the current date.',
        ],
        why: 'Hidden inputs such as the system clock, random numbers or environment state make tests time bombs. Passing a `Clock` (or the current date) in makes the behavior deterministic: production uses `Clock.systemDefaultZone()`, tests `Clock.fixed(...)`.',
      },
      {
        key: 'over-verification',
        question: 'Which statement best describes this test?',
        code: `import static org.mockito.Mockito.*;
import java.util.*;

public class Main {
    public static void main(String[] args) {
        PriceRepository prices = mock(PriceRepository.class);
        when(prices.find("pen")).thenReturn(Optional.of(2));
        when(prices.find("cup")).thenReturn(Optional.of(5));

        int total = new Basket(prices).total(List.of("pen", "cup", "pen"));

        verify(prices, times(2)).find("pen");
        verify(prices, times(1)).find("cup");
        verifyNoMoreInteractions(prices);
        System.out.println(total);
    }
}

interface PriceRepository { Optional<Integer> find(String sku); }

class Basket {
    private final PriceRepository prices;
    Basket(PriceRepository prices) { this.prices = prices; }

    int total(List<String> skus) {
        return skus.stream().mapToInt(s -> prices.find(s).orElseThrow()).sum();
    }
}`,
        correct:
          'It never checks the total (9) but pins how often the repository is called, so caching the pen price would break it although the behavior is still correct.',
        wrong: [
          'It is a good test because verifying every interaction is the most thorough check.',
          'It fails because `find("pen")` is stubbed only once but called twice.',
          'It should use a real database, because mocks cannot return `Optional`.',
        ],
        why: 'The code prints 9, but the test only asserts interactions. Tests coupled to implementation details break on harmless refactorings and miss real bugs. Assert the outcome (`total == 9`) and verify interactions only when they are the behavior, such as “an email is sent”. A stub answers every matching call, not just the first.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Operations

const LOGGING_IMPORTS = `import org.springframework.boot.*;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.slf4j.*;`;

export const operationsFamilies: readonly QuestionSource[] = [
  ...b.concept(
    'sb-ops-packaging',
    1,
    'A Spring Boot application is usually packaged as one self-contained artifact.',
    [
      {
        key: 'executable-jar',
        question:
          'What does `./mvnw package` produce for a typical Spring Boot web application, and how is it started?',
        correct:
          'An executable “fat” jar containing the application, its dependencies and an embedded server, started with `java -jar app.jar`.',
        wrong: [
          'A WAR file that must be deployed into a separately installed application server.',
          'A jar with only the application classes; dependencies are downloaded on first start.',
          'A native binary that does not need a JVM.',
        ],
        why: 'The Spring Boot Maven/Gradle plugin repackages the jar with all dependencies and a launcher, and the embedded Tomcat starts inside it. WAR deployment and native images (with GraalVM) are possible but are explicit choices.',
      },
      {
        key: 'container-image',
        question: 'Which is a good way to run a Spring Boot service in a container?',
        correct:
          'Build an image with a JRE base (for example with `./mvnw spring-boot:build-image` or a layered Dockerfile), run it as a non-root user, and pass configuration through environment variables.',
        wrong: [
          'Copy the source code into the image and build it when the container starts.',
          'Bake production passwords into `application.properties` inside the image.',
          'Run the JVM as root so that it can bind to any port.',
        ],
        why: 'Images should be immutable and identical across environments: build once, configure per environment from outside, and keep secrets out of the image. Layered images put rarely changing dependencies in lower layers so rebuilds are fast. Running as non-root limits the damage of a compromise.',
      },
    ],
  ),
  ...b.output(
    'sb-ops-logging-levels',
    2,
    [
      '`logging.level.<logger>` sets the minimum level; the most specific configured logger name wins.',
    ],
    [
      {
        key: 'per-logger',
        code: `${LOGGING_IMPORTS}

public class Main {
    public static void main(String[] args) {
        new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .properties("logging.level.root=WARN", "logging.level.com.shop.orders=DEBUG")
            .run();
        Logger orders = LoggerFactory.getLogger("com.shop.orders.OrderService");
        Logger payments = LoggerFactory.getLogger("com.shop.payments.PaymentService");
        orders.debug("order 7 validated");
        orders.trace("order 7 raw payload");
        payments.info("payment 7 authorized");
        payments.warn("payment 8 retried");
    }
}

@SpringBootConfiguration
class App {}`,
        output: 'DEBUG OrderService - order 7 validated\nWARN PaymentService - payment 8 retried',
        why: '`com.shop.orders` is set to DEBUG, so its DEBUG message appears but TRACE does not. The payment logger inherits the root level WARN, so INFO is dropped. (The runner’s log pattern prints the level, the short logger name and the message.)',
      },
      {
        key: 'more-specific-wins',
        code: `${LOGGING_IMPORTS}

public class Main {
    public static void main(String[] args) {
        new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .properties("logging.level.root=ERROR", "logging.level.com.shop=INFO", "logging.level.com.shop.cache=ERROR")
            .run();
        LoggerFactory.getLogger("com.shop.cache.ProductCache").warn("cache miss rate high");
        LoggerFactory.getLogger("com.shop.web.OrderController").info("GET /orders");
        LoggerFactory.getLogger("org.hibernate.SQL").info("select * from orders");
    }
}

@SpringBootConfiguration
class App {}`,
        output: 'INFO OrderController - GET /orders',
        why: 'Levels are inherited along the dotted logger hierarchy and the closest configured ancestor wins: `com.shop.cache` (ERROR) silences the cache warning, `com.shop` (INFO) lets the controller log, and Hibernate falls back to root (ERROR). Turning on DEBUG for one package is how you investigate a production problem without flooding the logs.',
      },
    ],
  ),
  ...b.output(
    'sb-ops-log-placeholders',
    2,
    [
      'SLF4J fills each `{}` with the next argument; the arguments themselves are evaluated before the logger checks its level.',
    ],
    [
      {
        key: 'missing-argument',
        code: `${LOGGING_IMPORTS}

public class Main {
    public static void main(String[] args) {
        new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .properties("logging.level.root=INFO")
            .run();
        Logger log = LoggerFactory.getLogger("com.shop.Checkout");
        log.info("order {} paid {} cents", 7, 4999);
        log.info("order {} shipped to {}", 7);
        log.info("order {} done", 7, "extra");
    }
}

@SpringBootConfiguration
class App {}`,
        output:
          'INFO Checkout - order 7 paid 4999 cents\nINFO Checkout - order 7 shipped to {}\nINFO Checkout - order 7 done',
        why: 'Placeholders are filled from left to right. A placeholder without an argument stays as a literal `{}`, and surplus arguments are ignored (unless the last one is an exception, which is logged with its stack trace). Nothing fails, so such mistakes slip into production logs.',
      },
      {
        key: 'eager-arguments',
        code: `${LOGGING_IMPORTS}

public class Main {
    static String expensiveDump() {
        System.out.println("building dump");
        return "{...}";
    }

    public static void main(String[] args) {
        new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .properties("logging.level.root=INFO")
            .run();
        Logger log = LoggerFactory.getLogger("com.shop.Cart");
        log.debug("cart state {}", expensiveDump());
        if (log.isDebugEnabled()) {
            log.debug("cart state {}", expensiveDump());
        }
        log.atDebug().setMessage("cart state {}").addArgument(Main::expensiveDump).log();
        System.out.println("done");
    }
}

@SpringBootConfiguration
class App {}`,
        output: 'building dump\ndone',
        why: 'DEBUG is disabled, so no message is logged, but Java evaluates `expensiveDump()` before calling `debug` the first time. The `isDebugEnabled()` guard and the fluent API with a supplier (`addArgument(Main::expensiveDump)`) both skip the work. Placeholders only save the string formatting, not the cost of computing the arguments.',
      },
    ],
  ),
  ...b.codeChoice(
    'sb-ops-health',
    3,
    'The overall health is the worst status of its contributors, and a DOWN status is answered with HTTP 503.',
    [
      {
        key: 'down-component',
        question:
          'This application runs with Actuator and default settings, and the payment gateway indicator reports DOWN. What do `GET /actuator/health` and `GET /actuator/health/liveness` return?',
        code: `import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.health.contributor.*;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
class ShopApplication {
    @Bean
    HealthIndicator paymentGateway() {
        return () -> Health.down().withDetail("reason", "timeout").build();
    }
}`,
        correct:
          'Health: 503 with status DOWN (details hidden by default). Liveness: 200 with status UP.',
        wrong: [
          'Health: 200 with status DOWN, because the endpoint itself worked. Liveness: 200 UP.',
          'Health: 503 DOWN. Liveness: 503 DOWN, because liveness includes every indicator.',
          'Health: 200 UP, because custom indicators are only shown in the details.',
        ],
        why: 'The aggregated health is the worst contributor status, and DOWN maps to HTTP 503, which load balancers understand. Details such as `reason` are hidden unless `management.endpoint.health.show-details` allows them. The liveness group does not include custom indicators, so the process is still “alive”: restarting it would not fix a slow payment provider. (Verified with a running Spring Boot 4.1 application.)',
      },
    ],
  ),
  ...b.codeChoice(
    'sb-ops-actuator-exposure',
    3,
    'Over HTTP, only the `health` endpoint is exposed by default; others must be included explicitly.',
    [
      {
        key: 'default-exposure',
        question:
          'This test runs against an application with Actuator, default management settings and no Spring Security. Which tests fail?',
        code: `import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ActuatorExposureTest {
    @Autowired
    MockMvc mvc;

    @Test
    void health() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
    }

    @Test
    void env() throws Exception {
        mvc.perform(get("/actuator/env")).andExpect(status().isOk());
    }

    @Test
    void beans() throws Exception {
        mvc.perform(get("/actuator/beans")).andExpect(status().isOk());
    }
}`,
        correct:
          '`env()` and `beans()`: those endpoints are not exposed over HTTP, so they answer 404.',
        wrong: [
          'None: every Actuator endpoint is exposed over HTTP by default.',
          'Only `beans()`: `env` is exposed by default because its values are masked.',
          'All three: Actuator endpoints are only available on a separate management port.',
        ],
        why: 'Spring Boot exposes only `health` over HTTP unless `management.endpoints.web.exposure.include` lists more. The other endpoints exist but are not mapped, so they answer 404. This secure default is easy to undo with `include=*`, a common production mistake. (Verified with a running Spring Boot 4.1 application.)',
      },
      {
        key: 'include-env',
        question: 'Here `env` is exposed. Which test fails, and why?',
        code: `import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "management.endpoints.web.exposure.include=health,env",
    "payment.api-key=sk_live_123"})
@AutoConfigureMockMvc
class EnvEndpointTest {
    @Autowired
    MockMvc mvc;

    @Test
    void envIsExposed() throws Exception {
        mvc.perform(get("/actuator/env/payment.api-key")).andExpect(status().isOk());
    }

    @Test
    void showsTheKey() throws Exception {
        mvc.perform(get("/actuator/env/payment.api-key"))
            .andExpect(jsonPath("$.property.value").value("sk_live_123"));
    }
}`,
        correct:
          '`showsTheKey()`: the endpoint answers 200, but Spring Boot masks every value by default, so the value is `******`.',
        wrong: [
          '`envIsExposed()`: `env` can never be exposed over HTTP.',
          'Neither: once an endpoint is included it shows all values in clear text.',
          'Both: properties set in a test are not visible to Actuator.',
        ],
        why: 'Including `env` maps the endpoint, but `management.endpoint.env.show-values` defaults to `never`, so values are shown as `******`. Masking reduces the risk, yet exposing `env` publicly still reveals property names and sources; protect it or keep it internal. (Verified with a running Spring Boot 4.1 application.)',
      },
    ],
  ),
  ...b.concept(
    'sb-ops-startup-troubleshooting',
    3,
    'Spring Boot’s failure analyzers print a description and a suggested action. Read both.',
    [
      {
        key: 'port-in-use',
        question:
          'A developer starts a second instance locally and gets this report. What is the simplest fix?',
        snippet: plain(`***************************
APPLICATION FAILED TO START
***************************

Description:

Web server failed to start. Port 8080 was already in use.

Action:

Identify and stop the process that's listening on port 8080 or configure this application to listen on another port.`),
        correct:
          'Stop the other process or start this instance with another port, for example `--server.port=8081`.',
        wrong: [
          'Add `@EnableWebMvc` so that Spring creates a second server.',
          'Delete the `target` folder; a stale build keeps the port locked.',
          'Set `spring.main.web-application-type=none` so the port is shared.',
        ],
        why: 'Only one process can listen on a port. `server.port` (or `SERVER_PORT`, or `server.port=0` for a random port in tests) moves this instance. Disabling the web application type would start it without a web server at all.',
      },
      {
        key: 'missing-bean',
        question:
          'After moving classes into new packages, the application fails with this report. What is the most likely cause?',
        snippet: plain(`***************************
APPLICATION FAILED TO START
***************************

Description:

Parameter 0 of constructor in com.shop.orders.OrderService required a bean of type 'com.shop.payments.PaymentClient' that could not be found.

Action:

Consider defining a bean of type 'com.shop.payments.PaymentClient' in your configuration.`),
        correct:
          '`PaymentClient` is no longer under the package of the `@SpringBootApplication` class (or lost its `@Component`), so component scanning does not register it.',
        wrong: [
          '`OrderService` has too many constructor parameters for Spring to resolve.',
          'The database is unreachable, so the payment client could not be created.',
          '`PaymentClient` is an interface and Spring cannot inject interfaces.',
        ],
        why: 'The report names the injection point and the missing type. After a package move the usual culprit is the scan boundary or a lost stereotype annotation; check that the class is below the application class’s package and annotated, or declare it with `@Bean`.',
      },
    ],
  ),
  ...b.codeChoice(
    'sb-ops-logging-practices',
    4,
    'Good logs are cheap when disabled, searchable, and free of secrets.',
    [
      {
        key: 'log-statements',
        question: 'Which of the logging statements in `charge` follows good practice?',
        code: `import org.slf4j.*;

public class Main {
    public static void main(String[] args) {
        new PaymentService().charge("order-7", "4111111111111111", 4999);
    }
}

class PaymentService {
    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    void charge(String orderId, String cardNumber, int cents) {
        log.debug("Charging " + orderId + " card " + cardNumber);          // A
        log.info("Charging order {} amount {} cents", orderId, cents);     // B
        try {
            throw new IllegalStateException("gateway timeout");
        } catch (IllegalStateException e) {
            log.error("Charge failed: " + e.getMessage());                // C
            log.warn("Charge failed for order {}", orderId, e);            // D
        }
    }
}`,
        correct:
          'B and D: they use placeholders, log no card data, and D passes the exception as the last argument so the stack trace is kept.',
        wrong: [
          'A, because DEBUG statements are never written in production.',
          'C, because the message alone is enough to diagnose the failure.',
          'All of them; logging more is always safer.',
        ],
        why: 'A builds the string even when DEBUG is off and writes the full card number (a compliance violation if DEBUG is ever enabled). C loses the stack trace. SLF4J placeholders defer formatting, and an exception passed as the last argument is logged with its stack trace.',
      },
    ],
  ),
  ...b.multi(
    'sb-ops-production-readiness',
    4,
    'Think about what the platform needs from the application: probes, shutdown, configuration and observability.',
    [
      {
        key: 'checklist',
        question: 'Which settings and practices help a Spring Boot service run well in production?',
        correct: [
          'Graceful shutdown (`server.shutdown=graceful`) so that in-flight requests finish before the process stops.',
          'Liveness and readiness probes wired to `/actuator/health/liveness` and `/actuator/health/readiness`.',
          'Configuration and secrets injected per environment rather than built into the artifact.',
        ],
        wrong: [
          'Running with `debug=true` so that the conditions report is always available.',
          'Exposing all Actuator endpoints on the public port for easier troubleshooting.',
        ],
        why: 'Graceful shutdown and probes let the platform roll out and restart instances without dropping traffic, and externalized configuration lets the same artifact run everywhere. Debug mode floods logs, and public Actuator endpoints are a security risk.',
      },
      {
        key: 'observability',
        question: 'Which statements about observing a Spring Boot service in production are true?',
        correct: [
          'Actuator with Micrometer exposes metrics (request rates, latencies, JVM memory) that a monitoring system can scrape.',
          'A correlation or trace id in every log line lets you follow one request across services.',
        ],
        wrong: [
          'Logging every request body at INFO level is the best way to monitor latency.',
          '`System.out.println` is preferable to a logger because it is faster and always visible.',
          'The `health` endpoint alone tells you how fast the service responds.',
        ],
        why: 'Metrics answer “how much and how fast”, logs “what happened”, and traces “where did the time go”. Logging bodies leaks data and costs storage; `System.out` bypasses levels, formats and appenders; health is a binary signal, not a latency measure.',
      },
    ],
  ),
  ...b.output(
    'sb-ops-custom-health',
    4,
    [
      'A `HealthIndicator` returns a `Health` with a status and optional details; the Actuator endpoint aggregates all indicators.',
    ],
    [
      {
        key: 'threshold',
        code: `import org.springframework.boot.health.contributor.*;

public class Main {
    public static void main(String[] args) {
        System.out.println(new QueueBacklogHealth(() -> 40).health());
        System.out.println(new QueueBacklogHealth(() -> 2500).health());
    }
}

interface QueueClient { int pendingMessages(); }

class QueueBacklogHealth implements HealthIndicator {
    private final QueueClient queue;
    QueueBacklogHealth(QueueClient queue) { this.queue = queue; }

    @Override
    public Health health() {
        int pending = queue.pendingMessages();
        Health.Builder builder = pending > 1000 ? Health.down() : Health.up();
        return builder.withDetail("pending", pending).build();
    }
}`,
        output: 'UP {pending=40}\nDOWN {pending=2500}',
        why: 'The indicator turns a domain-specific signal into a status plus details. As a bean it becomes a component of `/actuator/health` (named `queueBacklog`), and a DOWN status makes the whole endpoint answer 503.',
      },
      {
        key: 'exception',
        code: `import org.springframework.boot.health.contributor.*;

public class Main {
    public static void main(String[] args) {
        System.out.println(new PaymentApiHealth(() -> { }).health());
        System.out.println(new PaymentApiHealth(() -> { throw new IllegalStateException("connection refused"); }).health());
    }
}

interface PaymentApi { void ping(); }

class PaymentApiHealth implements HealthIndicator {
    private final PaymentApi api;
    PaymentApiHealth(PaymentApi api) { this.api = api; }

    @Override
    public Health health() {
        try {
            api.ping();
            return Health.up().build();
        } catch (RuntimeException e) {
            return Health.down(e).build();
        }
    }
}`,
        output: 'UP {}\nDOWN {error=java.lang.IllegalStateException: connection refused}',
        why: '`Health.down(exception)` records the exception as the `error` detail. Keep health checks fast and side-effect free (a ping, not a real payment), and remember that details are only shown to callers allowed by `management.endpoint.health.show-details`.',
      },
    ],
  ),
  ...b.output(
    'sb-ops-availability',
    5,
    [
      'Spring Boot tracks liveness and readiness as application state; the probes report that state.',
    ],
    [
      {
        key: 'refuse-traffic',
        code: `import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.autoconfigure.availability.ApplicationAvailabilityAutoConfiguration;
import org.springframework.boot.availability.*;
import org.springframework.boot.builder.SpringApplicationBuilder;

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .run();
        ApplicationAvailability availability = ctx.getBean(ApplicationAvailability.class);
        System.out.println(availability.getLivenessState() + " " + availability.getReadinessState());

        // For example, a maintenance job starts and the instance should get no new requests:
        AvailabilityChangeEvent.publish(ctx, ReadinessState.REFUSING_TRAFFIC);
        System.out.println(availability.getLivenessState() + " " + availability.getReadinessState());
    }
}

@SpringBootConfiguration
@ImportAutoConfiguration(ApplicationAvailabilityAutoConfiguration.class)
class App {}`,
        output: 'CORRECT ACCEPTING_TRAFFIC\nCORRECT REFUSING_TRAFFIC',
        why: 'After startup the application is live (`CORRECT`) and ready (`ACCEPTING_TRAFFIC`). Publishing `REFUSING_TRAFFIC` makes the readiness probe fail so the platform routes requests elsewhere, while liveness stays `CORRECT`, so the instance is not restarted.',
      },
      {
        key: 'state-changes',
        code: `import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.autoconfigure.availability.ApplicationAvailabilityAutoConfiguration;
import org.springframework.boot.availability.*;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.*;
import org.springframework.context.event.EventListener;

public class Main {
    public static void main(String[] args) {
        new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .run();
    }
}

@SpringBootConfiguration
@ImportAutoConfiguration(ApplicationAvailabilityAutoConfiguration.class)
class App {
    @EventListener
    void onChange(AvailabilityChangeEvent<?> event) {
        System.out.println("state " + event.getState());
    }

    @Bean
    CommandLineRunner loadCache() {
        return args -> System.out.println("loading cache");
    }
}`,
        output: 'state CORRECT\nloading cache\nstate ACCEPTING_TRAFFIC',
        why: 'Spring Boot marks the application live as soon as the context has started, then runs the runners, and only afterwards marks it ready. Work done in a runner (such as warming a cache) therefore happens while liveness is already `CORRECT` but readiness is not yet `ACCEPTING_TRAFFIC`: the instance gets no traffic before it is warm.',
      },
    ],
  ),
  ...b.fails(
    'sb-ops-startup-missing-bean',
    3,
    'The failure names the bean that could not be created and the dependency it was missing.',
    [
      {
        key: 'unregistered-client',
        question:
          'The service refuses to start after a refactoring. What does the failure tell you?',
        code: `import org.springframework.boot.*;
import org.springframework.boot.builder.SpringApplicationBuilder;

public class Main {
    public static void main(String[] args) {
        new SpringApplicationBuilder(App.class, OrderService.class)
            .web(WebApplicationType.NONE)
            .properties("logging.level.root=OFF")
            .run();
    }
}

@SpringBootConfiguration
class App {}

interface PaymentClient { void charge(long orderId); }

class HttpPaymentClient implements PaymentClient {
    public void charge(long orderId) {}
}

class OrderService {
    private final PaymentClient payments;
    OrderService(PaymentClient payments) { this.payments = payments; }
}`,
        error: "No qualifying bean of type 'PaymentClient' available",
        correct:
          '`OrderService` needs a `PaymentClient`, and no bean implements it: `HttpPaymentClient` exists as a class but is not registered (not scanned and not declared with `@Bean`).',
        wrong: [
          'The `PaymentClient` interface needs `@Component` so that Spring can instantiate it.',
          'Spring Boot cannot start without a web server, so `WebApplicationType.NONE` is the cause.',
          '`OrderService` must be declared before `App` in the builder.',
        ],
        why: 'The exception names the consumer (`orderService`) and the missing type. An implementation class only becomes a candidate when it is registered, by component scanning (`@Component` on the class, inside the scanned packages) or a `@Bean` method. Interfaces themselves are never instantiated.',
      },
    ],
  ),
  ...b.concept(
    'sb-ops-probes',
    5,
    'Liveness asks “should this process be restarted?”, readiness “should it receive traffic right now?”.',
    [
      {
        key: 'database-down',
        question:
          'The database is briefly unavailable. Which probe should report a problem, and what should the platform do?',
        correct:
          'Readiness should go DOWN so the instance stops receiving traffic; liveness stays UP, because restarting the process would not fix the database.',
        wrong: [
          'Liveness should go DOWN so the platform restarts every instance until the database is back.',
          'Both probes should stay UP; the clients will retry.',
          'Liveness should include the database check so that failures are detected faster.',
        ],
        why: 'If liveness depended on an external system, a database outage would make the platform restart all instances at once, a cascading failure that slows recovery. Readiness is the right place for dependencies: traffic goes elsewhere until the instance can serve again.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Architecture

export const architectureFamilies: readonly QuestionSource[] = [
  ...b.codeChoice(
    'sb-arch-layering',
    1,
    'Check which way the dependencies point: towards the web layer or towards the domain?',
    [
      {
        key: 'dependency-direction',
        question: 'Which statement about the dependencies in this code is correct?',
        code: `import org.springframework.web.bind.annotation.*;
import java.util.*;

// Domain
record Order(long id, int total) {}

interface OrderRepository {
    Optional<Order> findById(long id);
}

class OrderService {
    private final OrderRepository orders;
    OrderService(OrderRepository orders) { this.orders = orders; }

    int totalOf(long id) { return orders.findById(id).map(Order::total).orElseThrow(); }
}

// Web adapter
@RestController
class OrderController {
    private final OrderService service;
    OrderController(OrderService service) { this.service = service; }

    @GetMapping("/orders/{id}/total")
    int total(@PathVariable long id) { return service.totalOf(id); }
}

// Persistence adapter
class InMemoryOrderRepository implements OrderRepository {
    private final Map<Long, Order> data = Map.of(1L, new Order(1, 42));
    public Optional<Order> findById(long id) { return Optional.ofNullable(data.get(id)); }
}`,
        correct:
          'The web and persistence adapters depend on the domain (`OrderService`, `OrderRepository`), and the domain depends on neither, so either adapter can be replaced.',
        wrong: [
          'The service depends on `InMemoryOrderRepository`, so the persistence choice leaks into the domain.',
          'The domain depends on the controller because it returns values the controller sends.',
          'Layering requires the controller to call the repository directly to avoid an extra hop.',
        ],
        why: 'The service only knows the `OrderRepository` interface it owns; the implementation is wired in from outside. Dependencies point inward, toward the business logic, which keeps the core testable and independent of frameworks. Skipping the service would spread business rules into controllers.',
      },
      {
        key: 'leaky-entity',
        question: 'What is the architectural problem in this design?',
        code: `import jakarta.persistence.*;
import org.springframework.web.bind.annotation.*;

@Entity
class Customer {
    @Id Long id;
    String email;
    String passwordHash;
    String internalRiskScore;
}

@RestController
class CustomerController {
    @GetMapping("/customers/{id}")
    Customer customer(@PathVariable long id) {
        Customer c = new Customer();
        c.id = id;
        return c;
    }
}`,
        correct:
          'The persistence model is the API model: database fields such as `passwordHash` and `internalRiskScore` become part of the public contract and every schema change risks breaking clients.',
        wrong: [
          'Entities cannot be returned from controllers; this does not compile.',
          'The controller should be annotated `@Entity` as well so the mapping is consistent.',
          'There is no problem as long as the fields are package-private.',
        ],
        why: 'It compiles and runs, but it couples three things that change for different reasons: the database schema, the domain and the API. Response DTOs make the contract explicit and keep internal fields internal.',
      },
    ],
  ),
  ...b.multi(
    'sb-arch-separation',
    2,
    'Separation of concerns means each part has one reason to change.',
    [
      {
        key: 'principles',
        question: 'Which statements about structuring a Spring Boot application are true?',
        correct: [
          'Packaging by feature (`orders`, `payments`) keeps related controller, service and repository code together.',
          'Package-private classes can hide a feature’s internals from other features.',
          'Business rules should not depend on web or persistence framework types.',
        ],
        wrong: [
          'Every class must be `public` so that Spring can inject it.',
          'A single `utils` package for shared business logic keeps features decoupled.',
        ],
        why: 'Feature packages make the code base navigable and let package-private visibility enforce boundaries; Spring injects package-private classes fine. Catch-all `utils` packages tend to become hidden coupling between features.',
      },
    ],
  ),
  ...b.output(
    'sb-arch-events',
    2,
    [
      'By default an `@EventListener` runs synchronously, in the publisher’s thread and before `publishEvent` returns.',
    ],
    [
      {
        key: 'synchronous',
        code: `import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.*;
import org.springframework.context.event.EventListener;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(OrderService.class, LoyaltyPoints.class, InvoiceMailer.class);
        ctx.getBean(OrderService.class).place(7);
    }
}

record OrderPlaced(long orderId) {}

class OrderService {
    private final ApplicationEventPublisher events;
    OrderService(ApplicationEventPublisher events) { this.events = events; }

    void place(long id) {
        System.out.println("order " + id + " saved");
        events.publishEvent(new OrderPlaced(id));
        System.out.println("place() returns");
    }
}

class LoyaltyPoints {
    @EventListener
    void on(OrderPlaced event) { System.out.println("points for " + event.orderId()); }
}

class InvoiceMailer {
    @EventListener
    void on(OrderPlaced event) { System.out.println("invoice for " + event.orderId()); }
}`,
        output: 'order 7 saved\npoints for 7\ninvoice for 7\nplace() returns',
        why: 'Events decouple modules: `OrderService` does not know who reacts. But they are still synchronous method calls, so both listeners run before `publishEvent` returns (in registration order here; use `@Order` when order matters).',
      },
      {
        key: 'listener-exception',
        code: `import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.*;
import org.springframework.context.event.EventListener;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(OrderService.class, InvoiceMailer.class);
        try {
            ctx.getBean(OrderService.class).place(7);
        } catch (IllegalStateException e) {
            System.out.println("caller got: " + e.getMessage());
        }
    }
}

record OrderPlaced(long orderId) {}

class OrderService {
    private final ApplicationEventPublisher events;
    OrderService(ApplicationEventPublisher events) { this.events = events; }

    void place(long id) {
        System.out.println("order " + id + " saved");
        events.publishEvent(new OrderPlaced(id));
        System.out.println("order " + id + " confirmed");
    }
}

class InvoiceMailer {
    @EventListener
    void on(OrderPlaced event) { throw new IllegalStateException("mail server down"); }
}`,
        output: 'order 7 saved\ncaller got: mail server down',
        why: 'An exception in a synchronous listener propagates out of `publishEvent` into the publisher, so the order is never confirmed: the modules are decoupled in code but not at run time. Make side effects such as mails resilient (catch and retry, `@Async`, or a transactional outbox) if they must not break the main flow.',
      },
    ],
  ),
  ...b.output(
    'sb-arch-ports-adapters',
    3,
    [
      'The domain defines an interface (a port); configuration decides which implementation (adapter) is plugged in.',
    ],
    [
      {
        key: 'conditional-adapter',
        code: `import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(App.class, ShippingService.class)
            .web(WebApplicationType.NONE)
            .properties("shipping.carrier=parcel-api")
            .run();
        System.out.println(ctx.getBean(ShippingService.class).ship("order-7"));
    }
}

// Port, owned by the domain
interface CarrierGateway { String book(String orderId); }

class ShippingService {
    private final CarrierGateway carrier;
    ShippingService(CarrierGateway carrier) { this.carrier = carrier; }
    String ship(String orderId) { return carrier.book(orderId); }
}

@SpringBootConfiguration
class App {
    @Bean
    @ConditionalOnProperty(name = "shipping.carrier", havingValue = "fake", matchIfMissing = true)
    CarrierGateway fakeCarrier() { return id -> "fake label for " + id; }

    @Bean
    @ConditionalOnProperty(name = "shipping.carrier", havingValue = "parcel-api")
    CarrierGateway parcelApi() { return id -> "parcel-api label for " + id; }
}`,
        output: 'parcel-api label for order-7',
        why: '`ShippingService` only knows the `CarrierGateway` port. The property selects the adapter, so local development can use the fake and production the real API without changing domain code.',
      },
      {
        key: 'default-adapter',
        code: `import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(App.class, ShippingService.class)
            .web(WebApplicationType.NONE)
            .run();
        System.out.println(ctx.getBean(ShippingService.class).ship("order-8"));
        System.out.println(ctx.getBeansOfType(CarrierGateway.class).keySet());
    }
}

// Port, owned by the domain
interface CarrierGateway { String book(String orderId); }

class ShippingService {
    private final CarrierGateway carrier;
    ShippingService(CarrierGateway carrier) { this.carrier = carrier; }
    String ship(String orderId) { return carrier.book(orderId); }
}

@SpringBootConfiguration
class App {
    @Bean
    @ConditionalOnProperty(name = "shipping.carrier", havingValue = "fake", matchIfMissing = true)
    CarrierGateway fakeCarrier() { return id -> "fake label for " + id; }

    @Bean
    @ConditionalOnProperty(name = "shipping.carrier", havingValue = "parcel-api")
    CarrierGateway parcelApi() { return id -> "parcel-api label for " + id; }
}`,
        output: 'fake label for order-8\n[fakeCarrier]',
        why: 'With `shipping.carrier` unset, only the fake matches (`matchIfMissing = true`), so exactly one adapter exists and injection is unambiguous. Mutually exclusive conditions are what keep the port’s implementations from clashing.',
      },
    ],
  ),
  ...b.concept(
    'sb-arch-modular-monolith',
    3,
    'Boundaries inside one deployable can give most of the benefits of separate services at a fraction of the cost.',
    [
      {
        key: 'start-with-modules',
        question:
          'A team of five is starting a new shop backend with orders, payments and catalog. Which architecture is the most sensible starting point?',
        correct:
          'A modular monolith: one deployable Spring Boot application with clear feature modules and narrow interfaces between them, split later if a module needs independent scaling or ownership.',
        wrong: [
          'Three microservices from day one, because splitting later is impossible.',
          'One package with all classes, because boundaries slow a small team down.',
          'One microservice per entity, so every table has its own API.',
        ],
        why: 'Microservices add network calls, distributed data and operational overhead that a small team rarely needs at first. Well-defined modules keep the option of extracting a service later; a big ball of mud makes that hard, and per-entity services create chatty, tightly coupled systems.',
      },
      {
        key: 'module-boundaries',
        question:
          'How should the `orders` module of a modular monolith use data owned by the `catalog` module?',
        snippet:
          plain(`com.shop.catalog       ProductService (public API), ProductRepository, Product (internal)
com.shop.orders        OrderService needs product prices`),
        correct:
          'Call the catalog’s public API (`ProductService`) or react to its events; do not use its repository or entities directly.',
        wrong: [
          'Inject `ProductRepository` into `OrderService`; it is in the same application anyway.',
          'Copy the `Product` entity into the orders package so both modules map the same table.',
          'Make every catalog class `public` so that orders can choose what it needs.',
        ],
        why: 'A module’s repository and entities are internals. If other modules use them, the catalog can no longer change its schema, and the modules are coupled in exactly the way that makes later extraction impossible. Expose a small API and keep the rest package-private.',
      },
    ],
  ),
  ...b.concept(
    'sb-arch-microservices',
    4,
    'Weigh what a separate deployable buys (independent deploys, scaling, ownership) against what it costs.',
    [
      {
        key: 'when-not',
        question: 'Which situation is the weakest reason to split a service into microservices?',
        correct: 'The code base feels messy, so separate repositories should force cleaner code.',
        wrong: [
          'Two teams release independently and keep blocking each other’s deployments.',
          'One component needs to scale to 50 instances while the rest needs two.',
          'A component must be isolated for compliance reasons (for example payment card data).',
        ],
        why: 'Splitting a messy code base usually produces a distributed mess: the same unclear boundaries, now with network failures and data consistency problems. Independent deployment by separate teams, very different scaling needs and isolation requirements are the classic reasons for separate services.',
      },
      {
        key: 'shared-database',
        question:
          'Two microservices read and write the same database tables. What is the main problem?',
        correct:
          'They are coupled through the schema: neither can change its data model or deploy independently, which defeats the purpose of separate services.',
        wrong: [
          'Two connection pools to the same database are not supported.',
          'Shared tables make queries slower because of network latency.',
          'There is no problem as long as both use Spring Data JPA.',
        ],
        why: 'Each service should own its data and expose it through an API or events. A shared schema is a hidden, unversioned contract: one team’s migration breaks the other service at run time.',
      },
    ],
  ),
  ...b.concept(
    'sb-arch-integration',
    4,
    'Remote calls fail, time out and get retried. Design for that.',
    [
      {
        key: 'sync-vs-async',
        question:
          'After an order is placed, the shop must send an email, update analytics and notify the warehouse. The checkout response must stay fast even if those systems are slow. What fits best?',
        correct:
          'Publish an `OrderPlaced` event (for example to a message broker) and let each consumer process it asynchronously.',
        wrong: [
          'Call the three systems synchronously over REST in the checkout request, one after another.',
          'Call them in parallel threads and wait for all three before answering.',
          'Write to their databases directly from the order service.',
        ],
        why: 'Asynchronous messaging decouples the checkout from the availability and speed of downstream systems, and new consumers can be added without changing the order service. Synchronous calls make checkout as slow and as unreliable as the slowest dependency; writing into other services’ databases couples their schemas.',
      },
    ],
  ),
  ...b.output(
    'sb-arch-idempotent-consumer',
    4,
    ['Message brokers usually deliver at least once, so the same message can arrive twice.'],
    [
      {
        key: 'duplicate-charge',
        question: 'The broker redelivers a message after a timeout. What does this consumer print?',
        code: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        var consumer = new PaymentConsumer();
        List<PaymentRequested> delivered = List.of(
            new PaymentRequested("msg-1", "order-7", 50),
            new PaymentRequested("msg-2", "order-8", 20),
            new PaymentRequested("msg-1", "order-7", 50));   // redelivered
        delivered.forEach(consumer::handle);
        System.out.println("charged " + consumer.charged());
    }
}

record PaymentRequested(String messageId, String orderId, int amount) {}

class PaymentConsumer {
    private int charged;

    void handle(PaymentRequested message) {
        charged += message.amount();
    }

    int charged() { return charged; }
}`,
        output: 'charged 120',
        why: 'The redelivered `msg-1` is processed again, so order 7 is charged twice (50 + 20 + 50). With at-least-once delivery every consumer with side effects must be idempotent.',
      },
      {
        key: 'deduplicated',
        question: 'The consumer now remembers processed message ids. What does it print?',
        code: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        var consumer = new PaymentConsumer();
        List<PaymentRequested> delivered = List.of(
            new PaymentRequested("msg-1", "order-7", 50),
            new PaymentRequested("msg-2", "order-8", 20),
            new PaymentRequested("msg-1", "order-7", 50));   // redelivered
        delivered.forEach(consumer::handle);
        System.out.println("charged " + consumer.charged() + ", skipped " + consumer.skipped());
    }
}

record PaymentRequested(String messageId, String orderId, int amount) {}

class PaymentConsumer {
    // In production: a table with a unique key, written in the same transaction as the charge.
    private final Set<String> processed = new HashSet<>();
    private int charged;
    private int skipped;

    void handle(PaymentRequested message) {
        if (!processed.add(message.messageId())) {
            skipped++;
            return;
        }
        charged += message.amount();
    }

    int charged() { return charged; }
    int skipped() { return skipped; }
}`,
        output: 'charged 70, skipped 1',
        why: '`Set.add` returns `false` for an id that was already processed, so the duplicate is skipped and the customer pays once. To survive restarts and multiple instances, the processed ids must be stored durably, ideally in the same database transaction as the business change.',
      },
    ],
  ),
  ...b.output(
    'sb-arch-anti-corruption',
    3,
    [
      'An adapter translates an external system’s model into the domain’s own types at the boundary.',
    ],
    [
      {
        key: 'translate-external',
        code: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        // What the external carrier API returns:
        var external = List.of(
            new CarrierParcel("P-1", "DLVRD", "1999"),
            new CarrierParcel("P-2", "INTRNST", "450"),
            new CarrierParcel("P-3", "XX9", "100"));
        var adapter = new CarrierAdapter();
        external.forEach(p -> System.out.println(adapter.toShipment(p)));
    }
}

// External model: cryptic codes, amounts as strings in cents.
record CarrierParcel(String id, String statusCode, String feeCents) {}

// Domain model, owned by the application.
enum ShipmentStatus { IN_TRANSIT, DELIVERED, UNKNOWN }
record Shipment(String trackingId, ShipmentStatus status, java.math.BigDecimal fee) {}

class CarrierAdapter {
    Shipment toShipment(CarrierParcel parcel) {
        ShipmentStatus status = switch (parcel.statusCode()) {
            case "DLVRD" -> ShipmentStatus.DELIVERED;
            case "INTRNST" -> ShipmentStatus.IN_TRANSIT;
            default -> ShipmentStatus.UNKNOWN;
        };
        var fee = new java.math.BigDecimal(parcel.feeCents()).movePointLeft(2);
        return new Shipment(parcel.id(), status, fee);
    }
}`,
        output:
          'Shipment[trackingId=P-1, status=DELIVERED, fee=19.99]\nShipment[trackingId=P-2, status=IN_TRANSIT, fee=4.50]\nShipment[trackingId=P-3, status=UNKNOWN, fee=1.00]',
        why: 'The adapter is the only place that knows the carrier’s codes and money format; the rest of the application works with `Shipment`. Unknown codes map to `UNKNOWN` instead of crashing, and when the carrier changes its API only the adapter changes.',
      },
    ],
  ),
  ...b.output(
    'sb-arch-transactional-events',
    5,
    [
      '`@TransactionalEventListener` runs, by default, only after the surrounding transaction commits.',
    ],
    [
      {
        key: 'after-commit',
        code: `import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.embedded.*;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.event.TransactionalEventListener;
import javax.sql.DataSource;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(Db.class, OrderService.class, ConfirmationMailer.class);
        OrderService orders = ctx.getBean(OrderService.class);
        orders.place(1, false);
        try {
            orders.place(2, true);
        } catch (IllegalStateException e) {
            System.out.println("order 2 failed: " + e.getMessage());
        }
    }
}

record OrderPlaced(long orderId) {}

class OrderService {
    private final JdbcClient jdbc;
    private final ApplicationEventPublisher events;
    OrderService(JdbcClient jdbc, ApplicationEventPublisher events) { this.jdbc = jdbc; this.events = events; }

    @Transactional
    void place(long id, boolean failAfterPublish) {
        jdbc.sql("insert into orders values (?)").param(id).update();
        events.publishEvent(new OrderPlaced(id));
        System.out.println("published " + id);
        if (failAfterPublish) throw new IllegalStateException("stock check failed");
    }
}

class ConfirmationMailer {
    @TransactionalEventListener
    void on(OrderPlaced event) { System.out.println("mail for order " + event.orderId()); }
}

@Configuration
@EnableTransactionManagement
class Db {
    @Bean
    DataSource dataSource() {
        return new EmbeddedDatabaseBuilder().setType(EmbeddedDatabaseType.H2).build();
    }

    @Bean
    DataSourceTransactionManager transactionManager(DataSource dataSource) {
        return new DataSourceTransactionManager(dataSource);
    }

    @Bean
    JdbcClient jdbc(DataSource dataSource) {
        JdbcClient jdbc = JdbcClient.create(dataSource);
        jdbc.sql("create table orders (id bigint primary key)").update();
        return jdbc;
    }
}`,
        output: 'published 1\nmail for order 1\npublished 2\norder 2 failed: stock check failed',
        why: 'The event is published inside the transaction, but a `@TransactionalEventListener` (phase `AFTER_COMMIT`) waits for the commit. Order 1 commits, so the mail goes out after `place` finishes its work; order 2 rolls back, so its listener never runs and no customer is told about an order that does not exist. A plain `@EventListener` would have mailed both.',
      },
      {
        key: 'no-transaction',
        question:
          'Here the event is published by a method without `@Transactional`. What does this program print?',
        code: `import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.*;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.event.TransactionalEventListener;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(
            TxConfig.class, AccountService.class, WelcomeMailer.class, AuditLog.class);
        ctx.getBean(AccountService.class).register("ann");
    }
}

@Configuration
@EnableTransactionManagement
class TxConfig {}

record AccountCreated(String user) {}

class AccountService {
    private final ApplicationEventPublisher events;
    AccountService(ApplicationEventPublisher events) { this.events = events; }

    void register(String user) {
        events.publishEvent(new AccountCreated(user));
        System.out.println("registered " + user);
    }
}

class WelcomeMailer {
    @TransactionalEventListener
    void on(AccountCreated event) { System.out.println("welcome mail to " + event.user()); }
}

class AuditLog {
    @TransactionalEventListener(fallbackExecution = true)
    void on(AccountCreated event) { System.out.println("audit " + event.user()); }
}`,
        output: 'audit ann\nregistered ann',
        why: 'With no active transaction there is no commit to wait for, so a `@TransactionalEventListener` is silently skipped: the welcome mail is never sent. `fallbackExecution = true` makes the listener run immediately instead, as the audit log shows. Moving such a publisher out of a transaction is a classic way to lose events without any error.',
      },
    ],
  ),
];
