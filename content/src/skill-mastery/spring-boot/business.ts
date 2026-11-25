import type { QuestionSource } from '@pracstack/content-model';
import { plain } from '../helpers';
import { programBuilders } from '../program-builders';
import { optimisticLockingFamilies } from './data-jpa';

/*
 * Service layer and transactions. Transaction programs use a plain Spring
 * context with an in-memory H2 database and `JdbcClient`, so rollbacks and
 * commits are real. Spring Data JPA lives in data-jpa.ts.
 */

const b = programBuilders('java');

const MVC = `import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;`;

// ---------------------------------------------------------------- Transactions: shared setup

const TX_IMPORTS = `import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.embedded.*;
import org.springframework.transaction.annotation.*;
import javax.sql.DataSource;`;

/** An H2 database with two accounts (1: 100, 2: 50), a transaction manager and `JdbcClient`. */
const TX_DB = `@Configuration
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
        jdbc.sql("create table account (id int primary key, balance int)").update();
        jdbc.sql("insert into account values (1, 100), (2, 50)").update();
        return jdbc;
    }
}`;

/** Prints both balances. */
const BALANCES = `    static void balances(JdbcClient jdbc) {
        System.out.println(jdbc.sql("select balance from account order by id").query(Integer.class).list());
    }`;

// ---------------------------------------------------------------- Service layer

export const serviceLayerFamilies: readonly QuestionSource[] = [
  ...b.codeChoice(
    'sb-svc-thin-controller',
    1,
    'Ask which parts of the method are about HTTP and which are business rules.',
    [
      {
        key: 'discount-in-controller',
        question: 'This controller works. Which refactoring improves its design the most?',
        code: `${MVC}

record OrderRequest(String customer, int amount) {}

@RestController
class OrderController {
    private final java.util.List<String> saved = new java.util.ArrayList<>();

    @PostMapping("/orders")
    String create(@RequestBody OrderRequest request) {
        int total = request.amount();
        if (request.customer().startsWith("vip-") && total > 100) {
            total = total * 90 / 100;
        }
        saved.add(request.customer() + ":" + total);
        return "total " + total;
    }
}`,
        correct:
          'Move the discount rule and the saving into an `OrderService` that the controller calls; the controller only maps the request and response.',
        wrong: [
          'Move the discount rule into the `OrderRequest` record, so the controller has fewer lines.',
          'Split `create` into two endpoints, one for VIP customers and one for others.',
          'Keep it: putting business rules in controllers makes them easier to find.',
        ],
        why: 'Business rules in a controller cannot be reused by other entry points (a batch job, a message listener) and can only be tested through HTTP. A service holds the rule once; the controller stays a thin adapter between HTTP and the service. A request DTO should describe input, not pricing policy.',
      },
      {
        key: 'repository-in-controller',
        question: 'Which statement about this controller is most accurate?',
        code: `${MVC}
import java.util.*;

class AccountRepository {
    private final Map<Long, Integer> balances = new HashMap<>(Map.of(1L, 100, 2L, 0));
    int balance(long id) { return balances.get(id); }
    void setBalance(long id, int value) { balances.put(id, value); }
}

@RestController
class TransferController {
    private final AccountRepository accounts;
    TransferController(AccountRepository accounts) { this.accounts = accounts; }

    @PostMapping("/transfers")
    String transfer(@RequestParam long from, @RequestParam long to, @RequestParam int amount) {
        accounts.setBalance(from, accounts.balance(from) - amount);
        accounts.setBalance(to, accounts.balance(to) + amount);
        return "ok";
    }
}`,
        correct:
          'The transfer logic (including the missing balance check) belongs in a service method, which is also the natural transaction boundary for the two updates.',
        wrong: [
          'Controllers may never have constructor parameters; the repository must be a static field.',
          'The code is fine because the repository is injected.',
          'The logic should move into `AccountRepository`, since repositories own all business rules.',
        ],
        why: 'A transfer is a business operation: it needs validation (enough money) and both updates must succeed or fail together. A service method expresses that and can be `@Transactional`. Repositories should stay focused on persistence, and controllers on HTTP.',
      },
    ],
  ),
  ...b.blank(
    'sb-svc-constructor-blank',
    1,
    'A service receives its collaborators through its constructor and keeps them in `final` fields.',
    [
      {
        key: 'inject-repository',
        prompt:
          'Complete the service so that it receives the repository through constructor injection.',
        template: `import org.springframework.context.annotation.*;
import org.springframework.stereotype.Service;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(CustomerRepository.class, CustomerService.class);
        System.out.println(ctx.getBean(CustomerService.class).displayName(7));
    }
}

class CustomerRepository {
    String findName(long id) { return "customer-" + id; }
}

@Service
class CustomerService {
    private {{blank:modifier}} CustomerRepository customers;

    CustomerService(CustomerRepository customers) {
        {{blank:assign}}
    }

    String displayName(long id) { return customers.findName(id).toUpperCase(); }
}`,
        blanks: { modifier: ['final'], assign: ['this.customers = customers;'] },
        why: 'A `final` field assigned in the constructor makes the dependency mandatory and immutable. `@Service` is a `@Component` stereotype that component scanning picks up; here the class is registered explicitly, which works the same.',
      },
    ],
  ),
  ...b.multi(
    'sb-svc-layer-responsibilities',
    2,
    'Each layer has one reason to change: HTTP, business rules or persistence.',
    [
      {
        key: 'where-it-belongs',
        question:
          'Which statements describe a good split between controller, service and repository?',
        correct: [
          'The controller translates HTTP (paths, status codes, DTOs) into service calls.',
          'The service enforces business rules and defines transaction boundaries.',
          'The repository hides how data is stored and queried.',
        ],
        wrong: [
          'The repository decides which HTTP status code to return when an entity is missing.',
          'The service reads request headers directly from `HttpServletRequest` to stay flexible.',
        ],
        why: 'Keeping HTTP concerns in controllers and storage concerns in repositories lets the service be reused by any entry point and tested without a web server or a database. Status codes and request headers are web concerns.',
      },
      {
        key: 'service-testing',
        question:
          'Which benefits come from keeping business logic in services behind small interfaces?',
        correct: [
          'The logic can be unit tested with plain objects or fakes, without starting Spring.',
          'Other entry points such as scheduled jobs or message listeners can reuse the same rules.',
        ],
        wrong: [
          'Services make the application faster because Spring caches every service method result.',
          'Services make transactions unnecessary.',
          'An interface per service is mandatory, otherwise Spring cannot inject it.',
        ],
        why: 'The value is reuse and testability. Spring does not cache method results unless you configure caching, transactions are still needed for consistency, and Spring injects classes without interfaces just fine (it subclasses them when it needs a proxy).',
      },
    ],
  ),
  ...b.output(
    'sb-svc-reused-rule',
    2,
    ['Both entry points call the same service, so they apply the same rule.'],
    [
      {
        key: 'controller-and-job',
        code: `${MVC}
import java.util.List;

public class Main {
    public static void main(String[] args) throws Exception {
        PricingService pricing = new PricingService();
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new QuoteController(pricing)).build();
        System.out.println(mvc.perform(get("/quotes?amount=200&vip=true")).andReturn().getResponse().getContentAsString());
        new InvoiceJob(pricing).run(List.of(50, 200));
    }
}

class PricingService {
    int price(int amount, boolean vip) {
        return vip && amount > 100 ? amount * 90 / 100 : amount;
    }
}

@RestController
class QuoteController {
    private final PricingService pricing;
    QuoteController(PricingService pricing) { this.pricing = pricing; }

    @GetMapping("/quotes")
    String quote(@RequestParam int amount, @RequestParam boolean vip) {
        return "quote " + pricing.price(amount, vip);
    }
}

class InvoiceJob {
    private final PricingService pricing;
    InvoiceJob(PricingService pricing) { this.pricing = pricing; }

    void run(List<Integer> amounts) {
        amounts.forEach(a -> System.out.println("invoice " + pricing.price(a, true)));
    }
}`,
        output: 'quote 180\ninvoice 50\ninvoice 180',
        why: 'The VIP discount applies only above 100, and both the HTTP endpoint and the batch job get it from the same `PricingService`. If the rule lived in the controller, the job would have to duplicate it and the two could drift apart.',
      },
      {
        key: 'fake-in-test',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        WeatherService sunny = city -> 25;
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new AdviceController(sunny)).build();
        System.out.println(mvc.perform(get("/advice/Oslo")).andReturn().getResponse().getContentAsString());

        WeatherService cold = city -> -3;
        mvc = MockMvcBuilders.standaloneSetup(new AdviceController(cold)).build();
        System.out.println(mvc.perform(get("/advice/Oslo")).andReturn().getResponse().getContentAsString());
    }
}

interface WeatherService {
    int temperature(String city);
}

@RestController
class AdviceController {
    private final WeatherService weather;
    AdviceController(WeatherService weather) { this.weather = weather; }

    @GetMapping("/advice/{city}")
    String advice(@PathVariable String city) {
        return weather.temperature(city) < 5 ? "take a coat" : "t-shirt weather";
    }
}`,
        output: 't-shirt weather\ntake a coat',
        why: 'The controller depends on the `WeatherService` abstraction, so a test can pass a lambda instead of a real HTTP client and control the scenario exactly. Constructor injection is what makes this swap trivial.',
      },
    ],
  ),
  ...b.output(
    'sb-svc-injected-clock',
    3,
    ['The service does not read the system time itself; it asks the `Clock` it was given.'],
    [
      {
        key: 'fixed-clock-bean',
        code: `import org.springframework.context.annotation.*;
import java.time.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(TestClockConfig.class, ShopHours.class);
        System.out.println(ctx.getBean(ShopHours.class).status());
    }
}

@Configuration
class TestClockConfig {
    @Bean
    Clock clock() {
        return Clock.fixed(Instant.parse("2026-03-14T21:30:00Z"), ZoneOffset.UTC);
    }
}

class ShopHours {
    private final Clock clock;
    ShopHours(Clock clock) { this.clock = clock; }

    String status() {
        int hour = LocalTime.now(clock).getHour();
        return hour >= 9 && hour < 20 ? "open" : "closed at " + hour + "h";
    }
}`,
        output: 'closed at 21h',
        why: 'The service gets time from an injected `Clock`. Production configuration provides `Clock.systemDefaultZone()`; tests provide a fixed clock, so time-dependent rules give the same answer on every run. Calling `LocalTime.now()` directly would make the rule untestable.',
      },
      {
        key: 'two-scenarios',
        code: `import java.time.*;

public class Main {
    public static void main(String[] args) {
        Clock monday = Clock.fixed(Instant.parse("2026-03-16T10:00:00Z"), ZoneOffset.UTC);
        Clock saturday = Clock.fixed(Instant.parse("2026-03-21T10:00:00Z"), ZoneOffset.UTC);
        System.out.println(new DeliveryService(monday).promise());
        System.out.println(new DeliveryService(saturday).promise());
    }
}

class DeliveryService {
    private final Clock clock;
    DeliveryService(Clock clock) { this.clock = clock; }

    String promise() {
        DayOfWeek today = LocalDate.now(clock).getDayOfWeek();
        boolean weekend = today == DayOfWeek.SATURDAY || today == DayOfWeek.SUNDAY;
        return today + ": " + (weekend ? "ships Monday" : "ships today");
    }
}`,
        output: 'MONDAY: ships today\nSATURDAY: ships Monday',
        why: 'Because the clock is a constructor dependency, the same service class can be exercised for any day without Spring and without waiting for a weekend. Hidden dependencies such as `LocalDate.now()` or static helpers make business rules hard to test.',
      },
    ],
  ),
  ...b.output(
    'sb-svc-stateful-singleton',
    4,
    ['A service bean is a singleton shared by all requests. Where is the per-request data stored?'],
    [
      {
        key: 'field-leak',
        question:
          'Two different users call the API one after another. What does this program print?',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new CartController(new CartService())).build();
        mvc.perform(post("/cart?user=ann&item=pen"));
        mvc.perform(post("/cart?user=bob&item=cup"));
        System.out.println(mvc.perform(get("/cart?user=bob")).andReturn().getResponse().getContentAsString());
    }
}

class CartService {
    private final java.util.List<String> items = new java.util.ArrayList<>();

    void add(String user, String item) { items.add(item); }
    java.util.List<String> items(String user) { return items; }
}

@RestController
class CartController {
    private final CartService carts;
    CartController(CartService carts) { this.carts = carts; }

    @PostMapping("/cart")
    void add(@RequestParam String user, @RequestParam String item) { carts.add(user, item); }

    @GetMapping("/cart")
    java.util.List<String> items(@RequestParam String user) { return carts.items(user); }
}`,
        output: '["pen","cup"]',
        why: 'There is one `CartService` for the whole application, so its `items` field collects every user’s items: Bob sees Ann’s pen. Per-user data must be keyed by user (and thread-safe) or stored elsewhere, such as a database or the session; singleton services should keep no conversational state.',
      },
      {
        key: 'last-caller-field',
        question:
          'A service remembers the current user in a field to avoid passing it around. What does this program print?',
        code: `import java.util.concurrent.*;

public class Main {
    public static void main(String[] args) throws Exception {
        GreetingService service = new GreetingService();
        CountDownLatch annSet = new CountDownLatch(1);
        CountDownLatch bobSet = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        Future<String> ann = pool.submit(() -> {
            service.setCurrentUser("ann");
            annSet.countDown();
            bobSet.await();
            return service.greet();
        });
        Future<String> bob = pool.submit(() -> {
            annSet.await();
            service.setCurrentUser("bob");
            bobSet.countDown();
            return service.greet();
        });
        System.out.println(ann.get());
        System.out.println(bob.get());
        pool.shutdown();
    }
}

// Imagine this is a singleton @Service handling concurrent requests.
class GreetingService {
    private volatile String currentUser;

    void setCurrentUser(String user) { currentUser = user; }
    String greet() { return "Hello " + currentUser; }
}`,
        output: 'Hello bob\nHello bob',
        why: 'The latches force the interleaving that happens under load: Ann’s request sets the field, Bob’s request overwrites it, and then Ann’s request reads Bob’s name. A singleton field is shared by all threads; pass per-request values as method parameters instead.',
      },
    ],
  ),
  ...b.output(
    'sb-svc-transaction-boundary',
    4,
    [
      'Each `@Transactional` call is its own unit of work. Which calls are inside the same transaction?',
    ],
    [
      {
        key: 'controller-calls-two',
        question: 'The second step fails. What does this program print?',
        code: `${TX_IMPORTS}

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(Db.class, AccountRepository.class);
        AccountRepository accounts = ctx.getBean(AccountRepository.class);
        // Orchestration in the caller: two separate transactions.
        try {
            accounts.add(1, -30);
            accounts.add(3, 30);
        } catch (IllegalStateException e) {
            System.out.println(e.getMessage());
        }
        balances(ctx.getBean(JdbcClient.class));
    }

${BALANCES}
}

class AccountRepository {
    private final JdbcClient jdbc;
    AccountRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Transactional
    void add(int id, int amount) {
        int rows = jdbc.sql("update account set balance = balance + ? where id = ?").params(amount, id).update();
        if (rows == 0) throw new IllegalStateException("no account " + id);
    }
}

${TX_DB}`,
        output: 'no account 3\n[70, 50]',
        why: 'The debit ran in its own transaction and committed before the credit failed, so 30 is lost from account 1. When several writes must succeed or fail together, one service method has to own the transaction around all of them.',
      },
      {
        key: 'service-owns-transaction',
        question: 'Now a service method wraps both steps. What does this program print?',
        code: `${TX_IMPORTS}

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(Db.class, AccountRepository.class, TransferService.class);
        try {
            ctx.getBean(TransferService.class).transfer(1, 3, 30);
        } catch (IllegalStateException e) {
            System.out.println(e.getMessage());
        }
        balances(ctx.getBean(JdbcClient.class));
    }

${BALANCES}
}

class AccountRepository {
    private final JdbcClient jdbc;
    AccountRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Transactional
    void add(int id, int amount) {
        int rows = jdbc.sql("update account set balance = balance + ? where id = ?").params(amount, id).update();
        if (rows == 0) throw new IllegalStateException("no account " + id);
    }
}

class TransferService {
    private final AccountRepository accounts;
    TransferService(AccountRepository accounts) { this.accounts = accounts; }

    @Transactional
    void transfer(int from, int to, int amount) {
        accounts.add(from, -amount);
        accounts.add(to, amount);
    }
}

${TX_DB}`,
        output: 'no account 3\n[100, 50]',
        why: 'The repository methods join the transaction the service started (the default propagation is `REQUIRED`). The exception rolls the whole unit back, so the debit is undone. The service method is the right transaction boundary because it represents one business operation.',
      },
    ],
  ),
  ...b.codeChoice(
    'sb-svc-web-free-service',
    5,
    'Could this service be called from a scheduled job or a message listener, where there is no HTTP request?',
    [
      {
        key: 'response-entity-in-service',
        question: 'What is the main design problem of this service?',
        code: `import org.springframework.http.*;

class ReportService {
    ResponseEntity<String> monthlyReport(int month) {
        if (month < 1 || month > 12) {
            return ResponseEntity.badRequest().body("invalid month");
        }
        return ResponseEntity.ok("report for month " + month);
    }
}

class ReportJob {
    private final ReportService reports;
    ReportJob(ReportService reports) { this.reports = reports; }

    void run() {
        ResponseEntity<String> r = reports.monthlyReport(13);
        if (r.getStatusCode().is2xxSuccessful()) System.out.println(r.getBody());
    }
}`,
        correct:
          'The service speaks HTTP: callers such as `ReportJob` must interpret status codes. It should return the report (or throw a domain exception) and let the controller choose the HTTP response.',
        wrong: [
          '`ResponseEntity` cannot be created outside a controller, so the code fails at run time.',
          'The job should catch `HttpClientErrorException` instead of checking the status.',
          'The service should be annotated `@RestController` so that it can return `ResponseEntity`.',
        ],
        why: '`ResponseEntity` is a plain object, so this compiles and runs, but it couples business logic to the web layer. The job now reasons about HTTP status codes it never received over HTTP. Return domain results, throw domain exceptions, and map them to HTTP in the controller or in an advice.',
      },
      {
        key: 'response-status-exception-in-service',
        question:
          'The nightly job has to inspect HTTP status codes to understand the service. What is the best fix?',
        code: `import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class CouponService {
    int discountFor(String code) {
        if (code.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "missing code");
        if (code.equals("EXPIRED10")) throw new ResponseStatusException(HttpStatus.GONE, "coupon expired");
        return 10;
    }
}

class NightlyCouponReport {
    private final CouponService coupons;
    NightlyCouponReport(CouponService coupons) { this.coupons = coupons; }

    void check(String code) {
        try {
            coupons.discountFor(code);
        } catch (ResponseStatusException e) {
            if (e.getStatusCode().value() == 410) System.out.println("expired: " + code);
        }
    }
}`,
        correct:
          'Throw domain exceptions such as `CouponExpiredException` from the service, catch those in the job, and map them to 400/410 in a `@RestControllerAdvice`.',
        wrong: [
          'Keep `ResponseStatusException`, but compare `e.getReason()` instead of the status code.',
          'Return `-1` for an expired coupon and `-2` for a missing code, so no exceptions are needed.',
          'Annotate `CouponService` with `@RestController` so the exceptions are translated automatically.',
        ],
        why: 'The service’s failure modes are business facts (“expired”, “missing”), not HTTP responses. Domain exceptions let every caller react by type, and the web layer alone decides on 410 Gone or 400. Comparing reason strings is brittle, and magic return values are easy to ignore.',
      },
      {
        key: 'servlet-request-in-service',
        question: 'Which change makes this service easiest to reuse and test?',
        code: `import jakarta.servlet.http.HttpServletRequest;

class DiscountService {
    int discountPercent(HttpServletRequest request) {
        String tier = request.getHeader("X-Customer-Tier");
        return "gold".equals(tier) ? 15 : 0;
    }
}`,
        correct:
          'Pass the tier itself (`discountPercent(String tier)`); the controller reads the header and calls the service.',
        wrong: [
          'Inject `HttpServletRequest` into the service’s constructor instead of passing it as a parameter.',
          'Make the method `static` so it can be called without Spring.',
          'Read the header in a servlet filter and store it in a static field the service reads.',
        ],
        why: 'The rule only needs a tier, not the whole request. Taking plain values decouples the service from the Servlet API, so jobs and tests can call it directly. Static fields shared across requests would leak data between users, and constructor injection still ties the service to a web request.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Spring Data JPA

// ---------------------------------------------------------------- Transactions

export const transactionFamilies: readonly QuestionSource[] = [
  ...optimisticLockingFamilies,
  ...b.output(
    'sb-tx-rollback-unchecked',
    1,
    [
      'A `@Transactional` method that throws a `RuntimeException` rolls back everything it changed.',
    ],
    [
      {
        key: 'transfer-fails',
        code: `${TX_IMPORTS}

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(Db.class, TransferService.class);
        try {
            ctx.getBean(TransferService.class).transfer(1, 2, 120);
        } catch (IllegalStateException e) {
            System.out.println(e.getMessage());
        }
        balances(ctx.getBean(JdbcClient.class));
    }

${BALANCES}
}

class TransferService {
    private final JdbcClient jdbc;
    TransferService(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Transactional
    void transfer(int from, int to, int amount) {
        jdbc.sql("update account set balance = balance + ? where id = ?").params(amount, to).update();
        jdbc.sql("update account set balance = balance - ? where id = ?").params(amount, from).update();
        int left = jdbc.sql("select balance from account where id = ?").param(from).query(Integer.class).single();
        if (left < 0) throw new IllegalStateException("insufficient funds");
    }
}

${TX_DB}`,
        output: 'insufficient funds\n[100, 50]',
        why: 'Both updates ran, then the check threw an unchecked exception. The transaction proxy rolls back on `RuntimeException`, so neither update is visible afterwards: the transfer is all or nothing.',
      },
      {
        key: 'success-commits',
        code: `${TX_IMPORTS}

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(Db.class, TransferService.class);
        ctx.getBean(TransferService.class).transfer(1, 2, 30);
        balances(ctx.getBean(JdbcClient.class));
    }

${BALANCES}
}

class TransferService {
    private final JdbcClient jdbc;
    TransferService(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Transactional
    void transfer(int from, int to, int amount) {
        jdbc.sql("update account set balance = balance + ? where id = ?").params(amount, to).update();
        jdbc.sql("update account set balance = balance - ? where id = ?").params(amount, from).update();
        int left = jdbc.sql("select balance from account where id = ?").param(from).query(Integer.class).single();
        if (left < 0) throw new IllegalStateException("insufficient funds");
    }
}

${TX_DB}`,
        output: '[70, 80]',
        why: 'The method returns normally, so the transaction commits both updates: 100 - 30 and 50 + 30.',
      },
    ],
  ),
  ...b.output(
    'sb-tx-checked-exceptions',
    2,
    ['By default Spring rolls back on unchecked exceptions and errors only.'],
    [
      {
        key: 'checked-commits',
        question:
          'The method throws a checked exception after the update. What does this program print?',
        code: `${TX_IMPORTS}

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(Db.class, PayoutService.class);
        try {
            ctx.getBean(PayoutService.class).payout(1, 40);
        } catch (Exception e) {
            System.out.println("failed: " + e.getMessage());
        }
        balances(ctx.getBean(JdbcClient.class));
    }

${BALANCES}
}

class ReceiptException extends Exception {
    ReceiptException(String message) { super(message); }
}

class PayoutService {
    private final JdbcClient jdbc;
    PayoutService(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Transactional
    void payout(int id, int amount) throws ReceiptException {
        jdbc.sql("update account set balance = balance - ? where id = ?").params(amount, id).update();
        throw new ReceiptException("printer offline");
    }
}

${TX_DB}`,
        output: 'failed: printer offline\n[60, 50]',
        why: 'A checked exception does not trigger a rollback by default (a rule inherited from EJB, where checked exceptions were “business outcomes”), so the debit commits even though the caller sees a failure. Use `@Transactional(rollbackFor = Exception.class)` or throw an unchecked exception when the work must be undone.',
      },
      {
        key: 'rollback-for',
        question: 'The same method with `rollbackFor`. What does this program print?',
        code: `${TX_IMPORTS}

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(Db.class, PayoutService.class);
        try {
            ctx.getBean(PayoutService.class).payout(1, 40);
        } catch (Exception e) {
            System.out.println("failed: " + e.getMessage());
        }
        balances(ctx.getBean(JdbcClient.class));
    }

${BALANCES}
}

class ReceiptException extends Exception {
    ReceiptException(String message) { super(message); }
}

class PayoutService {
    private final JdbcClient jdbc;
    PayoutService(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Transactional(rollbackFor = ReceiptException.class)
    void payout(int id, int amount) throws ReceiptException {
        jdbc.sql("update account set balance = balance - ? where id = ?").params(amount, id).update();
        throw new ReceiptException("printer offline");
    }
}

${TX_DB}`,
        output: 'failed: printer offline\n[100, 50]',
        why: '`rollbackFor = ReceiptException.class` adds a rollback rule for that checked exception, so the debit is undone. The opposite rule, `noRollbackFor`, keeps changes for selected unchecked exceptions.',
      },
    ],
  ),
  ...b.output(
    'sb-tx-proxy-pitfalls',
    3,
    [
      '`@Transactional` works through a proxy around the bean. Does this call go through the proxy?',
    ],
    [
      {
        key: 'self-invocation',
        question:
          'The public method calls a `@Transactional` method of the same class. What does this program print?',
        code: `${TX_IMPORTS}

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(Db.class, TransferService.class);
        try {
            ctx.getBean(TransferService.class).transferAll();
        } catch (IllegalStateException e) {
            System.out.println(e.getMessage());
        }
        balances(ctx.getBean(JdbcClient.class));
    }

${BALANCES}
}

class TransferService {
    private final JdbcClient jdbc;
    TransferService(JdbcClient jdbc) { this.jdbc = jdbc; }

    void transferAll() {
        transfer(1, 2, 30);
    }

    @Transactional
    void transfer(int from, int to, int amount) {
        jdbc.sql("update account set balance = balance - ? where id = ?").params(amount, from).update();
        throw new IllegalStateException("credit failed");
    }
}

${TX_DB}`,
        output: 'credit failed\n[70, 50]',
        why: 'The caller enters through `transferAll`, which is not transactional, and `transfer(...)` is a plain `this` call that bypasses the proxy. No transaction exists, each statement auto-commits, and the debit survives the exception. Put the annotation on the method called from outside, or move the transactional method into another bean.',
      },
      {
        key: 'created-with-new',
        question: 'This service is created with `new`. What does this program print?',
        code: `${TX_IMPORTS}

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(Db.class);
        JdbcClient jdbc = ctx.getBean(JdbcClient.class);
        TransferService service = new TransferService(jdbc);
        try {
            service.transfer(1, 2, 30);
        } catch (IllegalStateException e) {
            System.out.println(e.getMessage());
        }
        balances(jdbc);
    }

${BALANCES}
}

class TransferService {
    private final JdbcClient jdbc;
    TransferService(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Transactional
    void transfer(int from, int to, int amount) {
        jdbc.sql("update account set balance = balance - ? where id = ?").params(amount, from).update();
        throw new IllegalStateException("credit failed");
    }
}

${TX_DB}`,
        output: 'credit failed\n[70, 50]',
        why: '`@Transactional` is just metadata; only a Spring-created proxy acts on it. An object built with `new` has no proxy, so the update auto-commits and is not rolled back.',
      },
      {
        key: 'via-other-bean',
        question:
          'Here the transactional method is called from another bean. What does this program print?',
        code: `${TX_IMPORTS}

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(Db.class, TransferService.class, BatchRunner.class);
        try {
            ctx.getBean(BatchRunner.class).runAll();
        } catch (IllegalStateException e) {
            System.out.println(e.getMessage());
        }
        balances(ctx.getBean(JdbcClient.class));
    }

${BALANCES}
}

class TransferService {
    private final JdbcClient jdbc;
    TransferService(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Transactional
    void transfer(int from, int to, int amount) {
        jdbc.sql("update account set balance = balance - ? where id = ?").params(amount, from).update();
        throw new IllegalStateException("credit failed");
    }
}

class BatchRunner {
    private final TransferService transfers;
    BatchRunner(TransferService transfers) { this.transfers = transfers; }

    void runAll() { transfers.transfer(1, 2, 30); }
}

${TX_DB}`,
        output: 'credit failed\n[100, 50]',
        why: '`BatchRunner` received the transactional proxy of `TransferService`, so the call starts a transaction and the exception rolls the debit back. Calls between beans go through proxies; calls inside one object do not.',
      },
    ],
  ),
  ...b.output(
    'sb-tx-caught-exception',
    3,
    [
      'A rollback is triggered by an exception leaving the transactional method, not by an exception that was caught inside it.',
    ],
    [
      {
        key: 'swallowed',
        code: `${TX_IMPORTS}

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(Db.class, TransferService.class);
        ctx.getBean(TransferService.class).transfer(1, 3, 30);
        balances(ctx.getBean(JdbcClient.class));
    }

${BALANCES}
}

class TransferService {
    private final JdbcClient jdbc;
    TransferService(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Transactional
    void transfer(int from, int to, int amount) {
        jdbc.sql("update account set balance = balance - ? where id = ?").params(amount, from).update();
        try {
            int rows = jdbc.sql("update account set balance = balance + ? where id = ?").params(amount, to).update();
            if (rows == 0) throw new IllegalStateException("no account " + to);
        } catch (IllegalStateException e) {
            System.out.println("logged: " + e.getMessage());
        }
    }
}

${TX_DB}`,
        output: 'logged: no account 3\n[70, 50]',
        why: 'The exception is caught inside the method, which then returns normally, so the transaction commits and 30 disappears. Catching and logging is not handling: rethrow, or call `TransactionAspectSupport.currentTransactionStatus().setRollbackOnly()` if you must not throw.',
      },
    ],
  ),
  ...b.output(
    'sb-tx-requires-new',
    4,
    [
      '`REQUIRES_NEW` suspends the caller’s transaction and runs in a separate one that commits on its own.',
    ],
    [
      {
        key: 'audit-survives',
        code: `${TX_IMPORTS}

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(Db.class, AuditLog.class, TransferService.class);
        JdbcClient jdbc = ctx.getBean(JdbcClient.class);
        jdbc.sql("create table audit (message varchar(100))").update();
        try {
            ctx.getBean(TransferService.class).transfer(1, 2, 500);
        } catch (IllegalStateException e) {
            System.out.println(e.getMessage());
        }
        balances(jdbc);
        System.out.println(jdbc.sql("select message from audit").query(String.class).list());
    }

${BALANCES}
}

class AuditLog {
    private final JdbcClient jdbc;
    AuditLog(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void record(String message) {
        jdbc.sql("insert into audit values (?)").param(message).update();
    }
}

class TransferService {
    private final JdbcClient jdbc;
    private final AuditLog audit;
    TransferService(JdbcClient jdbc, AuditLog audit) { this.jdbc = jdbc; this.audit = audit; }

    @Transactional
    void transfer(int from, int to, int amount) {
        audit.record("transfer of " + amount + " requested");
        jdbc.sql("update account set balance = balance - ? where id = ?").params(amount, from).update();
        throw new IllegalStateException("limit exceeded");
    }
}

${TX_DB}`,
        output: 'limit exceeded\n[100, 50]\n[transfer of 500 requested]',
        why: 'The audit entry is written in its own transaction, which commits when `record` returns. The outer transaction then rolls back the debit, but the audit row stays: exactly what you want for an audit trail of failed attempts.',
      },
      {
        key: 'required-joins',
        code: `${TX_IMPORTS}

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(Db.class, AuditLog.class, TransferService.class);
        JdbcClient jdbc = ctx.getBean(JdbcClient.class);
        jdbc.sql("create table audit (message varchar(100))").update();
        try {
            ctx.getBean(TransferService.class).transfer(1, 2, 500);
        } catch (IllegalStateException e) {
            System.out.println(e.getMessage());
        }
        balances(jdbc);
        System.out.println(jdbc.sql("select message from audit").query(String.class).list());
    }

${BALANCES}
}

class AuditLog {
    private final JdbcClient jdbc;
    AuditLog(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Transactional
    void record(String message) {
        jdbc.sql("insert into audit values (?)").param(message).update();
    }
}

class TransferService {
    private final JdbcClient jdbc;
    private final AuditLog audit;
    TransferService(JdbcClient jdbc, AuditLog audit) { this.jdbc = jdbc; this.audit = audit; }

    @Transactional
    void transfer(int from, int to, int amount) {
        audit.record("transfer of " + amount + " requested");
        jdbc.sql("update account set balance = balance - ? where id = ?").params(amount, from).update();
        throw new IllegalStateException("limit exceeded");
    }
}

${TX_DB}`,
        output: 'limit exceeded\n[100, 50]\n[]',
        why: 'With the default propagation `REQUIRED`, `record` joins the caller’s transaction, so the rollback removes the audit row together with the debit.',
      },
    ],
  ),
  ...b.fails(
    'sb-tx-rollback-only',
    5,
    'An inner `@Transactional` method that throws marks the shared transaction, even if the caller catches the exception.',
    [
      {
        key: 'unexpected-rollback',
        question:
          'The outer method catches the validation error and wants to commit the rest. Why does the call still fail?',
        code: `${TX_IMPORTS}

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(Db.class, Validator.class, ImportService.class);
        ctx.getBean(ImportService.class).importAll();
    }
}

class Validator {
    @Transactional
    void check(int amount) {
        if (amount < 0) throw new IllegalArgumentException("negative amount");
    }
}

class ImportService {
    private final JdbcClient jdbc;
    private final Validator validator;
    ImportService(JdbcClient jdbc, Validator validator) { this.jdbc = jdbc; this.validator = validator; }

    @Transactional
    void importAll() {
        jdbc.sql("update account set balance = balance + 10 where id = 1").update();
        try {
            validator.check(-5);
        } catch (IllegalArgumentException e) {
            System.out.println("skipped: " + e.getMessage());
        }
    }
}

${TX_DB}`,
        error: 'UnexpectedRollbackException',
        correct:
          '`check` joined the outer transaction and its exception marked that transaction rollback-only; at commit Spring rolls back and throws `UnexpectedRollbackException`. Remove `@Transactional` from the validator (it needs none) or validate without throwing through a transactional proxy.',
        wrong: [
          'Catching an exception inside a transactional method is not allowed; Spring rethrows it.',
          '`check` started a second transaction that conflicts with the first one.',
          'The update and the validation use different connections, so the commit fails.',
        ],
        why: 'With `REQUIRED`, both methods share one physical transaction. When the exception leaves the inner proxy, Spring marks it rollback-only. The outer method swallows the exception and returns normally, but the commit cannot happen, so Spring rolls back and reports it instead of failing silently.',
      },
      {
        key: 'repository-style',
        question: 'A batch import skips invalid rows. Why does the whole batch fail at the end?',
        code: `${TX_IMPORTS}
import java.util.List;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(Db.class, AccountWriter.class, BatchImport.class);
        ctx.getBean(BatchImport.class).run(List.of(10, 999, 20));
    }
}

class AccountWriter {
    private final JdbcClient jdbc;
    AccountWriter(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Transactional
    void credit(int id, int amount) {
        if (amount > 500) throw new IllegalStateException("suspicious amount " + amount);
        jdbc.sql("update account set balance = balance + ? where id = ?").params(amount, id).update();
    }
}

class BatchImport {
    private final AccountWriter writer;
    BatchImport(AccountWriter writer) { this.writer = writer; }

    @Transactional
    void run(List<Integer> amounts) {
        for (int amount : amounts) {
            try {
                writer.credit(1, amount);
            } catch (IllegalStateException e) {
                System.out.println("skipped " + amount);
            }
        }
    }
}

${TX_DB}`,
        error: 'Transaction rolled back because it has been marked as rollback-only',
        correct:
          'The failing `credit` call shares the batch transaction and marks it rollback-only, so the final commit is turned into a rollback; run each row in its own transaction (`REQUIRES_NEW`) if rows must succeed independently.',
        wrong: [
          'Only the last row is committed; the exception comes from the first row.',
          '`List.of` is immutable, so the loop throws when it iterates.',
          'A `@Transactional` method may only be called once per transaction.',
        ],
        why: 'The 999 row throws through the `AccountWriter` proxy, which marks the shared transaction rollback-only. The loop continues, but at the end of `run` the commit is impossible and `UnexpectedRollbackException` reports that nothing was saved. Per-row transactions (or validating before calling the transactional method) make skipping work.',
      },
    ],
  ),
  ...b.multi(
    'sb-tx-placement',
    2,
    'Transactions are applied by proxies around Spring beans, and define the unit of work of a use case.',
    [
      {
        key: 'where-to-annotate',
        question: 'Which statements about placing `@Transactional` are true?',
        correct: [
          'Service methods that implement one use case are the usual transaction boundary.',
          '`@Transactional(readOnly = true)` suits query methods and lets the persistence provider skip dirty checking.',
          'Calling a `@Transactional` method from another method of the same object does not start a transaction.',
        ],
        wrong: [
          'Every repository call should start and commit its own transaction, even inside a use case.',
          '`@Transactional` on a `private` method is applied when it is called from a public method of the same class.',
        ],
        why: 'One use case should be one transaction so that it is atomic; Spring Data repositories already join an existing transaction. Proxy-based transactions only intercept calls that come from outside the bean, so self-calls and private methods are not transactional. `readOnly` is a hint that also lets Hibernate skip flushing and dirty checks.',
      },
      {
        key: 'long-transactions',
        question: 'Which practices keep transactions healthy under load?',
        correct: [
          'Call slow external services (payment APIs, email) outside the database transaction where possible.',
          'Keep transactions short so locks and connections are released quickly.',
        ],
        wrong: [
          'Wrap the whole HTTP request, including remote calls, in one transaction to be safe.',
          'Use `REQUIRES_NEW` everywhere so that every statement commits immediately.',
          'Disable transactions for writes because they slow the database down.',
        ],
        why: 'A transaction holds a connection and possibly locks for its whole duration; waiting for a remote API inside it exhausts the pool under load. `REQUIRES_NEW` everywhere destroys atomicity, and writes without transactions lose consistency. Keep the unit of work small and focused.',
      },
    ],
  ),
  ...b.concept(
    'sb-tx-consistency',
    5,
    'A database transaction cannot include a message broker or a remote service.',
    [
      {
        key: 'dual-write',
        question:
          'An order service saves the order and then publishes an `OrderPlaced` message to a broker inside the same `@Transactional` method. Sometimes customers get a confirmation for an order that does not exist. Why, and what is the robust fix?',
        snippet: plain(`@Transactional
void placeOrder(Order order) {
    orders.save(order);
    broker.publish(new OrderPlaced(order.id()));   // sent immediately
    inventory.reserve(order);                       // may throw -> rollback
}`),
        correct:
          'The message is sent before the transaction commits and is not rolled back; write the event to an outbox table in the same transaction and publish it after commit (transactional outbox).',
        wrong: [
          'The broker is too slow; publish the message asynchronously in a new thread inside the method.',
          'Use `@Transactional(isolation = Isolation.SERIALIZABLE)` so that the broker joins the transaction.',
          'Move `broker.publish` before `orders.save` so that the message is always first.',
        ],
        why: 'The database transaction covers only the database. If `reserve` throws, the order is rolled back but the message is already out (a dual write). The outbox pattern stores the event atomically with the order; a relay publishes committed events. `@TransactionalEventListener(phase = AFTER_COMMIT)` is a lighter option inside one service, but a crash after commit can still lose the message.',
      },
      {
        key: 'isolation-read',
        question:
          'Two requests check “stock > 0” and then decrement it in separate transactions at the same time. Both succeed and stock becomes -1. Which fix addresses the cause?',
        snippet: plain(`@Transactional
void buy(long productId) {
    Product p = products.findById(productId).orElseThrow();
    if (p.getStock() > 0) {
        p.setStock(p.getStock() - 1);
    }
}`),
        correct:
          'Prevent the lost update with optimistic locking (`@Version`) and a retry, or a pessimistic lock / conditional `update ... where stock > 0`.',
        wrong: [
          'Mark the method `synchronized`; that protects all instances in all servers.',
          'Add `@Transactional(readOnly = true)` so that the read cannot be stale.',
          'Call `products.flush()` after the decrement.',
        ],
        why: 'Both transactions read stock 1 before either writes, a classic check-then-act race. `@Version` makes the second commit fail (retry or report 409); a pessimistic lock or an atomic conditional update makes the database serialize the check. `synchronized` only works inside one JVM, and flushing or read-only flags do not stop the race.',
      },
    ],
  ),
];
