import type { QuestionSource } from '@pracstack/content-model';
import { plain } from '../helpers';
import { programBuilders } from '../program-builders';

/*
 * Practical enterprise Java: layered design (DTOs, entities, services,
 * repositories), dependency management, debugging existing applications,
 * JSON with Jackson 3 and Jakarta Bean Validation with Hibernate Validator.
 */
const b = programBuilders('java');

// ---------------------------------------------------------------- Layered design and debugging

export const enterpriseDesignFamilies: readonly QuestionSource[] = [
  ...b.output(
    'java-repository-pattern',
    1,
    [
      'The service depends on the repository interface, not on how the data is stored.',
      '`findById` returns an `Optional`, so the service must decide what happens when nothing is found.',
    ],
    [
      {
        key: 'in-memory',
        code: `import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public class Main {
    public static void main(String[] args) {
        OrderRepository repository = new InMemoryOrderRepository();
        OrderService service = new OrderService(repository);
        service.place("o-1", 120);
        service.place("o-2", 80);
        System.out.println(service.statusOf("o-1"));
        System.out.println(service.statusOf("o-9"));
        System.out.println(repository.findAll().size());
    }
}

record Order(String id, int totalCents, String status) {}

interface OrderRepository {
    Order save(Order order);
    Optional<Order> findById(String id);
    List<Order> findAll();
}

class InMemoryOrderRepository implements OrderRepository {
    private final Map<String, Order> store = new LinkedHashMap<>();

    public Order save(Order order) {
        store.put(order.id(), order);
        return order;
    }

    public Optional<Order> findById(String id) {
        return Optional.ofNullable(store.get(id));
    }

    public List<Order> findAll() {
        return List.copyOf(store.values());
    }
}

class OrderService {
    private final OrderRepository orders;

    OrderService(OrderRepository orders) {
        this.orders = orders;
    }

    void place(String id, int totalCents) {
        orders.save(new Order(id, totalCents, "NEW"));
    }

    String statusOf(String id) {
        return orders.findById(id).map(Order::status).orElse("UNKNOWN");
    }
}`,
        output: 'NEW\nUNKNOWN\n2',
        why: 'The service only knows the `OrderRepository` interface. An in-memory implementation is enough for this program and for tests; in a Spring Data application the same interface shape would be implemented over a database. A missing order maps to `UNKNOWN` through the `Optional`.',
      },
      {
        key: 'save-replaces',
        code: `import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

public class Main {
    public static void main(String[] args) {
        CustomerRepository repository = new InMemoryCustomerRepository();
        repository.save(new Customer(1, "Ada", "ada@old.example"));
        repository.save(new Customer(1, "Ada", "ada@new.example"));
        repository.save(new Customer(2, "Linus", "linus@example.org"));
        System.out.println(repository.count());
        System.out.println(repository.findById(1).map(Customer::email).orElseThrow());
    }
}

record Customer(long id, String name, String email) {}

interface CustomerRepository {
    void save(Customer customer);
    Optional<Customer> findById(long id);
    long count();
}

class InMemoryCustomerRepository implements CustomerRepository {
    private final Map<Long, Customer> store = new HashMap<>();

    public void save(Customer customer) { store.put(customer.id(), customer); }
    public Optional<Customer> findById(long id) { return Optional.ofNullable(store.get(id)); }
    public long count() { return store.size(); }
}`,
        output: '2\nada@new.example',
        why: 'The repository is keyed by id, so saving a customer with an existing id replaces the stored one (an update) instead of adding a second entry. This mirrors the “save is insert or update” semantics of Spring Data repositories.',
      },
    ],
  ),
  ...b.output(
    'java-dto-mapping',
    2,
    [
      'A DTO contains exactly the data an API should expose; a mapping method copies it from the entity.',
    ],
    [
      {
        key: 'hide-fields',
        code: `import java.time.LocalDate;

public class Main {
    public static void main(String[] args) {
        UserEntity entity = new UserEntity(7L, "ada@example.com", "$2a$10$hash", LocalDate.of(2024, 3, 1), 3);
        UserResponse dto = UserResponse.from(entity);
        System.out.println(dto);
    }
}

class UserEntity {
    final Long id;
    final String email;
    final String passwordHash;
    final LocalDate createdOn;
    final int failedLogins;

    UserEntity(Long id, String email, String passwordHash, LocalDate createdOn, int failedLogins) {
        this.id = id;
        this.email = email;
        this.passwordHash = passwordHash;
        this.createdOn = createdOn;
        this.failedLogins = failedLogins;
    }
}

record UserResponse(Long id, String email, LocalDate memberSince) {
    static UserResponse from(UserEntity e) {
        return new UserResponse(e.id, e.email, e.createdOn);
    }
}`,
        output: 'UserResponse[id=7, email=ada@example.com, memberSince=2024-03-01]',
        why: 'The response DTO exposes only what clients need, under API-friendly names. The password hash and the failed-login counter never leave the service, and the entity can change without breaking the API contract.',
      },
      {
        key: 'request-to-entity',
        code: `public class Main {
    public static void main(String[] args) {
        CreateProductRequest request = new CreateProductRequest("  Desk Lamp ", "45.90");
        Product product = request.toEntity(1001L);
        System.out.println(product.id() + " " + product.name() + " " + product.priceCents() + " " + product.active());
    }
}

record CreateProductRequest(String name, String price) {
    Product toEntity(long newId) {
        long cents = new java.math.BigDecimal(price).movePointRight(2).longValueExact();
        return new Product(newId, name.strip(), cents, true);
    }
}

record Product(long id, String name, long priceCents, boolean active) {}`,
        output: '1001 Desk Lamp 4590 true',
        why: 'The request DTO has only the fields a client may send; the id and the `active` flag are set by the server. Mapping is also where input is normalized (trimmed name, price converted exactly from a decimal string to cents).',
      },
    ],
  ),
  ...b.multi(
    'java-dto-vs-entity',
    2,
    'Think about what a client should see, what it may change, and how often each side changes.',
    [
      {
        key: 'reasons',
        question: 'Select every good reason to return DTOs from a REST API instead of JPA entities.',
        correct: [
          'Internal fields such as password hashes or audit data are not exposed by accident.',
          'The database schema can change without breaking the public API.',
          'Serializing entities can trigger lazy loading of relations or infinite recursion between bidirectional associations.',
        ],
        wrong: [
          'DTOs make database queries faster.',
          'Jackson cannot serialize classes that have JPA annotations.',
        ],
        why: 'DTOs decouple the API contract from the persistence model and keep sensitive data in. Entities exposed directly also cause classic serialization problems with lazy associations and back-references. DTOs do not speed up queries by themselves (although projections can), and Jackson can serialize annotated classes.',
      },
      {
        key: 'mass-assignment',
        question: 'An `updateProfile` endpoint binds the request body directly to the `User` entity and saves it. Select every risk.',
        correct: [
          'A client can set fields it should not control, such as `role` or `id` (mass assignment).',
          'Fields missing from the request may overwrite stored values with `null`.',
        ],
        wrong: [
          'The request will be rejected, because entities cannot be deserialized from JSON.',
          'The entity becomes immutable after binding, so the save fails.',
          'Validation annotations on the entity are ignored by Jackson, so the request is always valid.',
        ],
        why: 'Binding requests to entities lets clients write every mapped property, including privileged ones, and partial updates can null out data. A request DTO with only the editable fields (plus explicit mapping) prevents both. Entities can be deserialized; validation is triggered by `@Valid`, not by Jackson.',
      },
    ],
  ),
  ...b.codeChoice(
    'java-service-dependencies',
    3,
    'A class that creates its own collaborators with `new` cannot be given a different implementation for a test or another environment.',
    [
      {
        key: 'new-inside',
        question: 'Which refactoring makes `InvoiceService` easiest to unit test without sending real emails?',
        code: `public class Main {
    public static void main(String[] args) {
        new InvoiceService().send("inv-1", "ada@example.com");
    }
}

class SmtpMailer {
    void mail(String to, String text) {
        System.out.println("SMTP to " + to + ": " + text);
    }
}

class InvoiceService {
    private final SmtpMailer mailer = new SmtpMailer();

    void send(String invoiceId, String to) {
        mailer.mail(to, "Invoice " + invoiceId);
    }
}`,
        correct: 'Introduce a `Mailer` interface, let `SmtpMailer` implement it, and pass a `Mailer` to `InvoiceService` through its constructor; tests pass a fake or mock.',
        wrong: [
          'Make `mail` a `static` method so that `InvoiceService` does not need an instance.',
          'Make the `mailer` field `public` so that tests can read it.',
          'Catch all exceptions in `send` so that tests never fail because of SMTP.',
        ],
        why: 'Constructor injection of an interface is what Spring’s dependency injection builds on: the service declares what it needs, and the caller (or the container) decides the implementation. A static call is even harder to replace, a public field breaks encapsulation without solving the problem, and swallowing exceptions hides real failures.',
      },
      {
        key: 'clock',
        question: 'A test for “invoices are overdue after 30 days” fails depending on the day it runs. Which change fixes the design?',
        code: `import java.time.LocalDate;

public class Main {
    public static void main(String[] args) {
        Invoice invoice = new Invoice(LocalDate.of(2024, 1, 1));
        System.out.println(invoice.isOverdue() ? "overdue" : "open");
    }
}

class Invoice {
    private final LocalDate issuedOn;

    Invoice(LocalDate issuedOn) {
        this.issuedOn = issuedOn;
    }

    boolean isOverdue() {
        return LocalDate.now().isAfter(issuedOn.plusDays(30));
    }
}`,
        correct: 'Pass the current date in (`isOverdue(LocalDate today)`), or inject a `java.time.Clock` and call `LocalDate.now(clock)`; tests then use a fixed date or `Clock.fixed(...)`.',
        wrong: [
          'Run the test only on the first day of each month.',
          'Replace `LocalDate` with `java.util.Date`, which is easier to compare.',
          'Make `issuedOn` mutable so tests can move it back and forth.',
        ],
        why: '`LocalDate.now()` is a hidden dependency on the system clock, which makes the result change over time. Making time an input (a parameter or an injected `Clock`) makes the rule deterministic and testable. `java.util.Date` is the legacy API and has the same problem.',
      },
    ],
  ),
  ...b.concept(
    'java-dependency-management',
    3,
    'Maven and Gradle identify a library by group, artifact and version, and a scope (configuration) decides on which class path it is available.',
    [
      {
        key: 'test-scope',
        question: 'A `pom.xml` declares Mockito as shown. What does `<scope>test</scope>` mean?',
        snippet: plain(`<dependency>
    <groupId>org.mockito</groupId>
    <artifactId>mockito-core</artifactId>
    <version>5.14.2</version>
    <scope>test</scope>
</dependency>`),
        correct: 'Mockito is available to compile and run the code in `src/test/java`, but not to production code, and it is not packaged into the application.',
        wrong: [
          'Mockito is downloaded only when the tests fail.',
          'Mockito is included in the application but disabled in production.',
          'The dependency is a test version of Mockito that should not be used in a real build.',
        ],
        why: 'The `test` scope limits a dependency to the test compile and test run class paths. Production code that accidentally imports Mockito would fail to compile, which is exactly the protection you want. The Gradle equivalent is `testImplementation`.',
      },
      {
        key: 'conflict',
        question: 'Two libraries in a Maven project depend on different versions of `jackson-databind`. How does Maven choose, and what is the usual fix?',
        correct: 'Maven picks the version nearest to the project in the dependency tree (the first declared wins on a tie); pin the version explicitly, for example with `<dependencyManagement>` or an imported BOM.',
        wrong: [
          'Maven always picks the highest version and never needs help.',
          'Maven includes both versions, and the JVM loads the one it needs for each class.',
          'Maven stops the build with an error until one library is removed.',
        ],
        why: 'Maven’s “nearest wins” mediation can silently choose an older version, which then fails at run time with `NoSuchMethodError` or `ClassNotFoundException`. Spring Boot’s dependency management (a BOM) pins consistent versions for you. Gradle, by contrast, selects the highest requested version by default. Only one version of a class can be on the class path.',
      },
      {
        key: 'coordinates',
        question: 'In the Gradle declaration `implementation("com.fasterxml.jackson.core:jackson-annotations:2.20")`, what is `jackson-annotations`?',
        correct: 'The artifact id: the name of the library within the group `com.fasterxml.jackson.core`.',
        wrong: [
          'The Java package that will be imported.',
          'The group id, which must match the folder of your source files.',
          'The configuration name that decides whether it is available in tests.',
        ],
        why: 'Coordinates are `groupId:artifactId:version`. They are unrelated to the Java packages inside the JAR (Jackson 3’s databind classes live in `tools.jackson.databind`, for example, while its annotations stay in `com.fasterxml.jackson.annotation`). The configuration here is `implementation`.',
      },
    ],
  ),
  ...b.fails(
    'java-helpful-npe-messages',
    2,
    'Since Java 14, a `NullPointerException` message names the exact expression that was `null`. Read it carefully.',
    [
      {
        key: 'chain',
        question:
          'The log shows `Cannot invoke "Address.city()" because the return value of "Customer.address()" is null`. What is `null`?',
        code: `public class Main {
    public static void main(String[] args) {
        Order order = new Order("o-1", new Customer("Ada", null));
        System.out.println(order.customer().address().city().toUpperCase());
    }
}

record Address(String city) {}
record Customer(String name, Address address) {}
record Order(String id, Customer customer) {}`,
        error: 'because the return value of "Customer.address()" is null',
        correct: 'The customer’s `address`: `customer()` returned a customer, but its `address()` returned `null`, so calling `city()` on it failed.',
        wrong: [
          'The `city` string: `toUpperCase()` was called on a `null` city.',
          'The order’s `customer`: the chain stopped at `customer()`.',
          'The `order` variable itself.',
        ],
        why: 'The message names both the failed call (`Address.city()`) and the null value (the return value of `Customer.address()`). Without it, any of the four calls on that line could have been the culprit. Long call chains on one line are hard to debug for exactly this reason.',
      },
      {
        key: 'field',
        question:
          'After a refactoring, this service fails with `Cannot invoke "PriceRepository.priceOf(String)" because "this.prices" is null`. What is the cause?',
        code: `public class Main {
    public static void main(String[] args) {
        CheckoutService service = new CheckoutService();
        System.out.println(service.total("pen", 3));
    }
}

interface PriceRepository {
    int priceOf(String sku);
}

class CheckoutService {
    private PriceRepository prices;

    CheckoutService() {
    }

    CheckoutService(PriceRepository prices) {
        this.prices = prices;
    }

    int total(String sku, int quantity) {
        return prices.priceOf(sku) * quantity;
    }
}`,
        error: 'because "this.prices" is null',
        correct: 'The service was created with the no-argument constructor, so its `prices` dependency was never set; remove that constructor, make the field `final`, and always inject the repository.',
        wrong: [
          '`priceOf("pen")` returned `null` and the multiplication failed.',
          'The interface `PriceRepository` has no implementation, so Java sets every reference of that type to `null`.',
          '`total` must be `static` to use the field.',
        ],
        why: '`this.prices` in the message means the field itself is `null`, not a returned value. A `final` field assigned only through the constructor makes this mistake a compile error. The same symptom appears in Spring applications when an object is created with `new` instead of being injected.',
      },
      {
        key: 'unboxing',
        question:
          'What does `Cannot invoke "java.lang.Integer.intValue()" because the return value of "java.util.Map.get(Object)" is null` tell you about this code?',
        code: `import java.util.Map;

public class Main {
    static final Map<String, Integer> STOCK = Map.of("pen", 12);

    static boolean available(String sku, int wanted) {
        int stock = STOCK.get(sku);
        return stock >= wanted;
    }

    public static void main(String[] args) {
        System.out.println(available("pen", 2));
        System.out.println(available("ink", 1));
    }
}`,
        error: 'because the return value of "java.util.Map.get(Object)" is null',
        correct: 'The map has no entry for `ink`; `get` returned `null`, and the hidden `intValue()` call of auto-unboxing failed. Use `getOrDefault(sku, 0)`.',
        wrong: [
          'The `STOCK` map is `null` because it is `static`.',
          '`Integer.intValue()` fails for numbers above 127.',
          '`wanted` is `null`.',
        ],
        why: 'There is no `intValue()` in the source code: it is the unboxing the compiler inserted for `int stock = ...`. The message reveals it, and names `Map.get` as the source of the `null`. A primitive `int` parameter can never be `null`.',
      },
    ],
  ),
  ...b.concept(
    'java-reading-stack-traces',
    4,
    'Read the top line for the exception, then follow “Caused by:” to the deepest cause, then find the first frame in your own code.',
    [
      {
        key: 'caused-by',
        question: 'Production logs show this stack trace. Where should you start debugging?',
        snippet: plain(`java.lang.IllegalStateException: Could not place order 4711
    at com.shop.order.OrderService.place(OrderService.java:42)
    at com.shop.web.OrderController.create(OrderController.java:27)
    ... 87 more
Caused by: java.lang.NumberFormatException: For input string: "12,5"
    at java.base/java.lang.NumberFormatException.forInputString(NumberFormatException.java:67)
    at java.base/java.lang.Integer.parseInt(Integer.java:662)
    at java.base/java.lang.Integer.parseInt(Integer.java:778)
    at com.shop.order.QuantityParser.parse(QuantityParser.java:15)
    at com.shop.order.OrderService.place(OrderService.java:38)
    ... 88 more`),
        correct: '`QuantityParser.parse` at line 15, which passed `"12,5"` to `Integer.parseInt`: the deepest cause’s first frame in application code.',
        wrong: [
          '`OrderController.create` at line 27, because it is where the request entered the application.',
          '`Integer.parseInt` at line 662, because it is the top frame of the cause.',
          '`OrderService.place` at line 42, because the top-level exception was thrown there.',
        ],
        why: 'The top-level exception only reports that placing the order failed. The cause says why: a decimal string reached `parseInt`. JDK frames are rarely the bug; the first frame from your own packages under the deepest cause (`QuantityParser.java:15`) is where the wrong assumption lives.',
      },
      {
        key: 'npe-frame',
        question: 'Which statement about this stack trace is correct?',
        snippet: plain(`java.lang.NullPointerException: Cannot invoke "String.trim()" because "name" is null
    at com.shop.customer.CustomerMapper.toEntity(CustomerMapper.java:21)
    at com.shop.customer.CustomerService.register(CustomerService.java:33)
    at com.shop.web.CustomerController.register(CustomerController.java:19)`),
        correct: 'The exception was thrown at `CustomerMapper.java:21`, where `name` (a local variable or parameter) was `null`; the earlier frames show who called it, which helps find where the `null` came from.',
        wrong: [
          'The exception was thrown in `CustomerController.register`, because the last frame is where it happened.',
          '`String.trim()` has a bug, because it is the method named in the message.',
          'The stack trace is incomplete, because the JDK frames of `String` are missing.',
        ],
        why: 'The first `at` line is where the exception was thrown; lines below it are the callers, ending with the entry point. `String.trim()` was never entered, because the receiver was `null`. With debug information compiled in, the message names local variables such as `name`.',
      },
    ],
  ),
  ...b.codeChoice(
    'java-business-rules-placement',
    4,
    'Where can a rule be enforced so that no caller can bypass it?',
    [
      {
        key: 'cancel',
        question: 'The rule is “a shipped order cannot be cancelled”. Three services currently check it before setting the status. What is the best design?',
        code: `public class Main {
    public static void main(String[] args) {
        Order order = new Order("o-1");
        order.markShipped();
        try {
            order.cancel();
        } catch (IllegalStateException e) {
            System.out.println(e.getMessage());
        }
    }
}

class Order {
    private final String id;
    private String status = "NEW";

    Order(String id) {
        this.id = id;
    }

    void markShipped() {
        status = "SHIPPED";
    }

    void cancel() {
        if (status.equals("SHIPPED")) {
            throw new IllegalStateException("Order " + id + " is already shipped");
        }
        status = "CANCELLED";
    }

    String status() {
        return status;
    }
}`,
        correct: 'Keep the rule inside `Order.cancel()`, as shown, and remove any public `setStatus`; every caller must then go through the method that enforces it.',
        wrong: [
          'Keep a public `setStatus(String)` and repeat the check in each service, so that every service can decide differently.',
          'Move the rule into the REST controller, because that is where requests arrive.',
          'Enforce the rule only in the database with a trigger, so the Java code stays simple.',
        ],
        why: 'Encapsulating state changes in intention-revealing methods keeps the invariant in one place: callers cannot forget the check, and the rule is unit-testable without any infrastructure. Checks in controllers or individual services are easy to bypass (batch jobs, other endpoints), and a database trigger only fails late, after the business code has already run.',
      },
      {
        key: 'transaction-script',
        question: 'A transfer service moves money between accounts. Which version of `transfer` preserves the business rule “balances never go negative” best?',
        code: `public class Main {
    public static void main(String[] args) {
        Account from = new Account(100);
        Account to = new Account(0);
        new TransferService().transfer(from, to, 30);
        System.out.println(from.balance() + " " + to.balance());
    }
}

class Account {
    private long balance;

    Account(long balance) { this.balance = balance; }

    void withdraw(long amount) {
        if (amount <= 0 || amount > balance) throw new IllegalArgumentException("invalid amount " + amount);
        balance -= amount;
    }

    void deposit(long amount) {
        if (amount <= 0) throw new IllegalArgumentException("invalid amount " + amount);
        balance += amount;
    }

    long balance() { return balance; }
}

class TransferService {
    void transfer(Account from, Account to, long amount) {
        from.withdraw(amount);
        to.deposit(amount);
    }
}`,
        correct: 'This one: `withdraw` validates before changing anything, and it runs before `deposit`, so a rejected transfer leaves both balances unchanged (in a real system, both calls also run in one transaction).',
        wrong: [
          'Call `to.deposit(amount)` first, so the receiving account is never short of money.',
          'Remove the checks from `Account` and validate in `TransferService` only, because services own the business logic.',
          'Catch `IllegalArgumentException` in `transfer` and continue, so a transfer never fails.',
        ],
        why: 'The program prints `70 30`. Validating inside the entity protects every caller, and ordering the steps so that the step that can fail comes first avoids half-done updates. Depositing first would credit money that might never be withdrawn, and swallowing the exception would report success for a failed transfer.',
      },
    ],
  ),
  ...b.output(
    'java-repository-aliasing',
    5,
    [
      'An in-memory repository that stores and returns the same mutable object shares it with every caller.',
      'A real database repository returns a fresh copy (or a managed entity), so in-memory fakes can hide or create bugs.',
    ],
    [
      {
        key: 'mutable-entity',
        code: `import java.util.HashMap;
import java.util.Map;

public class Main {
    public static void main(String[] args) {
        ProductRepository repo = new ProductRepository();
        repo.save(new Product("p-1", 1000));

        Product preview = repo.find("p-1");
        preview.priceCents = preview.priceCents * 80 / 100;
        System.out.println("preview " + preview.priceCents);

        System.out.println("stored " + repo.find("p-1").priceCents);
    }
}

class Product {
    final String id;
    int priceCents;
    Product(String id, int priceCents) { this.id = id; this.priceCents = priceCents; }
}

class ProductRepository {
    private final Map<String, Product> store = new HashMap<>();
    void save(Product p) { store.put(p.id, p); }
    Product find(String id) { return store.get(id); }
}`,
        output: 'preview 800\nstored 800',
        why: 'The “preview” discount was never saved, but the repository returned its internal object, so the change went straight into the store. A test using this fake would pass for code that forgets to call `save`, or show changes that a real database would not. Store immutable records, or copy on `save` and `find`.',
      },
      {
        key: 'immutable-record',
        code: `import java.util.HashMap;
import java.util.Map;

public class Main {
    public static void main(String[] args) {
        ProductRepository repo = new ProductRepository();
        repo.save(new Product("p-1", 1000));

        Product preview = repo.find("p-1").withPrice(800);
        System.out.println("preview " + preview.priceCents());
        System.out.println("stored " + repo.find("p-1").priceCents());

        repo.save(preview);
        System.out.println("after save " + repo.find("p-1").priceCents());
    }
}

record Product(String id, int priceCents) {
    Product withPrice(int newPrice) { return new Product(id, newPrice); }
}

class ProductRepository {
    private final Map<String, Product> store = new HashMap<>();
    void save(Product p) { store.put(p.id(), p); }
    Product find(String id) { return store.get(id); }
}`,
        output: 'preview 800\nstored 1000\nafter save 800',
        why: 'With an immutable record, changing the price creates a new object, so the stored product is unaffected until `save` is called explicitly. The repository now behaves like a real one: changes are persisted only through `save`.',
      },
    ],
  ),
  ...b.output(
    'java-entity-identity',
    5,
    [
      'Entities often define `equals` and `hashCode` by their database id, but the id is usually assigned only when the entity is saved.',
      'A hash-based collection places an element using the hash code it had when it was added.',
    ],
    [
      {
        key: 'null-ids',
        code: `import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

public class Main {
    public static void main(String[] args) {
        Set<OrderLine> lines = new HashSet<>();
        lines.add(new OrderLine(null, "pen"));
        lines.add(new OrderLine(null, "ink"));
        System.out.println(lines.size());
    }
}

class OrderLine {
    Long id;
    final String sku;

    OrderLine(Long id, String sku) {
        this.id = id;
        this.sku = sku;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof OrderLine other && Objects.equals(id, other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }
}`,
        output: '1',
        why: 'Both new lines have a `null` id, and `Objects.equals(null, null)` is `true`, so the set treats the second line as a duplicate and drops it: an order silently loses a line before it is ever saved. Id-based equality must treat unsaved entities (null id) as different from each other, for example `id != null && id.equals(other.id)`.',
      },
      {
        key: 'id-assigned-after-add',
        code: `import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

public class Main {
    static long sequence = 100;

    static void save(Customer c) {
        c.id = ++sequence;
    }

    public static void main(String[] args) {
        Set<Customer> pending = new HashSet<>();
        Customer ada = new Customer("ada@example.com");
        pending.add(ada);
        save(ada);
        System.out.println(ada.id + " " + pending.contains(ada) + " " + pending.remove(ada) + " " + pending.size());
    }
}

class Customer {
    Long id;
    final String email;

    Customer(String email) {
        this.email = email;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof Customer other && id != null && id.equals(other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }
}`,
        output: '101 false false 1',
        why: 'The customer was added with a `null` id (hash `0`). Saving assigns id `101`, which changes the hash code, so `contains` and `remove` search the wrong bucket and fail, even for the same object: the entry is stuck in the set. A common remedy is a hash code that does not change when the id is assigned (for example `getClass().hashCode()`), or a natural business key such as the email.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- JSON and validation

export const jsonValidationFamilies: readonly QuestionSource[] = [
  ...b.output(
    'java-jackson-serialization',
    1,
    [
      'Jackson’s `ObjectMapper` turns objects into JSON using their properties: record components, or getters of ordinary classes.',
      'Spring Boot 4 uses Jackson 3, whose classes live in the `tools.jackson` packages.',
    ],
    [
      {
        key: 'record',
        code: `import java.util.List;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

public class Main {
    public static void main(String[] args) {
        ObjectMapper mapper = JsonMapper.builder().build();
        OrderDto order = new OrderDto("o-7", List.of(new LineDto("pen", 2)), null);
        System.out.println(mapper.writeValueAsString(order));
    }
}

record LineDto(String sku, int quantity) {}
record OrderDto(String id, List<LineDto> lines, String note) {}`,
        output: '{"id":"o-7","lines":[{"sku":"pen","quantity":2}],"note":null}',
        why: 'Each record component becomes a JSON property, nested records become nested objects and lists become arrays. A `null` component is written as `null` unless you configure otherwise (for example with `@JsonInclude`).',
      },
      {
        key: 'dates-and-numbers',
        code: `import java.math.BigDecimal;
import java.time.LocalDate;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

public class Main {
    public static void main(String[] args) {
        ObjectMapper mapper = JsonMapper.builder().build();
        System.out.println(mapper.writeValueAsString(new Invoice(LocalDate.of(2024, 3, 1), new BigDecimal("19.90"), true)));
    }
}

record Invoice(LocalDate issuedOn, BigDecimal total, boolean paid) {}`,
        output: '{"issuedOn":"2024-03-01","total":19.90,"paid":true}',
        why: 'Jackson 3 supports `java.time` out of the box and writes a `LocalDate` as an ISO-8601 string. `BigDecimal` is written as a JSON number with its scale preserved, and booleans as `true`/`false`.',
      },
      {
        key: 'getters',
        code: `import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

public class Main {
    public static void main(String[] args) {
        ObjectMapper mapper = JsonMapper.builder().build();
        System.out.println(mapper.writeValueAsString(new Account("ada", 1250)));
    }
}

class Account {
    private final String owner;
    private final long balanceCents;
    private final String internalNote = "vip";

    Account(String owner, long balanceCents) {
        this.owner = owner;
        this.balanceCents = balanceCents;
    }

    public String getOwner() { return owner; }
    public long getBalanceCents() { return balanceCents; }
    public boolean isOverdrawn() { return balanceCents < 0; }
}`,
        output: '{"balanceCents":1250,"overdrawn":false,"owner":"ada"}',
        why: 'For ordinary classes, Jackson uses public getters: `getOwner()` becomes `owner` and `isOverdrawn()` becomes `overdrawn`. The private field without a getter is not serialized. Jackson 3 sorts such properties alphabetically by default (records keep their component order).',
      },
    ],
  ),
  ...b.output(
    'java-jackson-deserialization',
    2,
    [
      '`readValue(json, Type.class)` creates the object; records are created through their canonical constructor.',
      'Generic types such as `List<Order>` need a `TypeReference`, because of type erasure.',
    ],
    [
      {
        key: 'record',
        code: `import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

public class Main {
    public static void main(String[] args) {
        ObjectMapper mapper = JsonMapper.builder().build();
        String json = """
            {"sku": "pen", "quantity": 3, "giftWrap": true}
            """;
        OrderLine line = mapper.readValue(json, OrderLine.class);
        System.out.println(line);
        System.out.println(line.quantity() * 2);
    }
}

record OrderLine(String sku, int quantity, boolean giftWrap) {}`,
        output: 'OrderLine[sku=pen, quantity=3, giftWrap=true]\n6',
        why: 'Jackson matches JSON properties to record components by name and calls the canonical constructor, so the record is fully typed afterwards.',
      },
      {
        key: 'type-reference',
        code: `import java.util.List;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

public class Main {
    public static void main(String[] args) {
        ObjectMapper mapper = JsonMapper.builder().build();
        String json = "[{\\"sku\\":\\"pen\\",\\"quantity\\":3},{\\"sku\\":\\"ink\\",\\"quantity\\":1}]";
        List<OrderLine> lines = mapper.readValue(json, new TypeReference<List<OrderLine>>() {});
        System.out.println(lines.get(1).sku() + " " + lines.stream().mapToInt(OrderLine::quantity).sum());

        List<?> raw = mapper.readValue(json, List.class);
        System.out.println(raw.get(0).getClass().getSimpleName());
    }
}

record OrderLine(String sku, int quantity) {}`,
        output: 'ink 4\nLinkedHashMap',
        why: 'The anonymous `TypeReference` subclass keeps the full generic type, so Jackson creates `OrderLine` records. With only `List.class`, Jackson does not know the element type and produces maps (`LinkedHashMap`), which fail later with a `ClassCastException` if treated as `OrderLine`.',
      },
      {
        key: 'unknown-properties',
        code: `import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

public class Main {
    public static void main(String[] args) {
        String json = "{\\"sku\\":\\"pen\\",\\"quantity\\":3,\\"color\\":\\"blue\\"}";
        ObjectMapper lenient = JsonMapper.builder().build();
        System.out.println(lenient.readValue(json, OrderLine.class));

        ObjectMapper strict = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();
        try {
            strict.readValue(json, OrderLine.class);
        } catch (RuntimeException e) {
            System.out.println(e.getClass().getSimpleName());
        }
    }
}

record OrderLine(String sku, int quantity) {}`,
        output: 'OrderLine[sku=pen, quantity=3]\nUnrecognizedPropertyException',
        why: 'In Jackson 3, unknown properties are ignored by default (Jackson 2’s plain `ObjectMapper` failed on them), which lets clients send extra fields. Enabling `FAIL_ON_UNKNOWN_PROPERTIES` makes the mapper strict. Jackson 3 exceptions are unchecked, so no `throws` clause is needed.',
      },
    ],
  ),
  ...b.output(
    'java-jackson-annotations',
    3,
    [
      '`@JsonProperty` renames a property, `@JsonIgnore` leaves it out, and `@JsonInclude(NON_NULL)` skips `null` values.',
      'In Jackson 3 the annotations are still in the `com.fasterxml.jackson.annotation` package.',
    ],
    [
      {
        key: 'rename-ignore',
        code: `import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

public class Main {
    public static void main(String[] args) {
        ObjectMapper mapper = JsonMapper.builder().build();
        System.out.println(mapper.writeValueAsString(new UserDto(7, "ada@example.com", "s3cret")));
    }
}

record UserDto(
    @JsonProperty("user_id") long id,
    String email,
    @JsonIgnore String password) {}`,
        output: '{"user_id":7,"email":"ada@example.com"}',
        why: '`@JsonProperty("user_id")` sets the JSON name (useful for snake_case APIs), and `@JsonIgnore` keeps the password out of the output entirely.',
      },
      {
        key: 'include-non-null',
        code: `import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

public class Main {
    public static void main(String[] args) {
        ObjectMapper mapper = JsonMapper.builder().build();
        System.out.println(mapper.writeValueAsString(new ErrorResponse(400, "Invalid order", null, List.of())));
    }
}

@JsonInclude(JsonInclude.Include.NON_NULL)
record ErrorResponse(int status, String message, String traceId, List<String> details) {}`,
        output: '{"status":400,"message":"Invalid order","details":[]}',
        why: '`NON_NULL` omits properties whose value is `null` (`traceId`), but an empty list is not `null`, so `details` is still written. `NON_EMPTY` would also skip the empty list.',
      },
      {
        key: 'read-renamed',
        code: `import com.fasterxml.jackson.annotation.JsonProperty;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

public class Main {
    public static void main(String[] args) {
        ObjectMapper mapper = JsonMapper.builder().build();
        String json = "{\\"order_id\\":\\"o-1\\",\\"orderId\\":\\"o-2\\",\\"total_cents\\":990}";
        Payment p = mapper.readValue(json, Payment.class);
        System.out.println(p.orderId() + " " + p.totalCents());
    }
}

record Payment(@JsonProperty("order_id") String orderId, @JsonProperty("total_cents") long totalCents) {}`,
        output: 'o-1 990',
        why: '`@JsonProperty` applies to reading too: only `order_id` maps to `orderId`. The JSON property literally named `orderId` is now an unknown property, which Jackson 3 ignores by default.',
      },
    ],
  ),
  ...b.fails(
    'java-jackson-failures',
    3,
    'Jackson exceptions name the problem and the JSON path; read the exception type first.',
    [
      {
        key: 'wrong-type',
        question: 'An API client sends this payload, and deserialization fails. Why?',
        code: `import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

public class Main {
    public static void main(String[] args) {
        ObjectMapper mapper = JsonMapper.builder().build();
        String json = "{\\"sku\\":\\"pen\\",\\"quantity\\":\\"two\\"}";
        System.out.println(mapper.readValue(json, OrderLine.class));
    }
}

record OrderLine(String sku, int quantity) {}`,
        error: 'InvalidFormatException',
        correct: '`"two"` cannot be converted to the `int` component `quantity`, so Jackson throws `InvalidFormatException`; the API should answer with a 400 Bad Request that names the field.',
        wrong: [
          'Jackson cannot deserialize records; use a class with setters.',
          'The JSON is syntactically invalid, so the parser fails before mapping.',
          'Jackson sets `quantity` to `0` when the value cannot be converted.',
        ],
        why: 'The JSON is well-formed, and records are supported; the value simply has the wrong type for the target. Jackson does not silently substitute a default. (A numeric string such as `"2"` would be coerced to `2` by default.) Spring maps such errors to HTTP 400.',
      },
      {
        key: 'missing-primitive',
        question: 'Deserializing this request fails. What is the cause?',
        code: `import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

public class Main {
    public static void main(String[] args) {
        ObjectMapper mapper = JsonMapper.builder().build();
        System.out.println(mapper.readValue("{\\"sku\\":\\"pen\\"}", OrderLine.class));
    }
}

record OrderLine(String sku, int quantity) {}`,
        error: 'MismatchedInputException',
        correct: '`quantity` is missing and the component is a primitive `int`, which cannot be `null`; Jackson 3 rejects this by default instead of using `0`. Make the field an `Integer` and validate it, or send the value.',
        wrong: [
          'Records require every JSON property to be present, including `String` ones.',
          '`sku` must be the last property in the JSON.',
          'The record needs a no-argument constructor for Jackson.',
        ],
        why: 'A missing value for a primitive creator parameter is reported as a `MismatchedInputException` in Jackson 3 (silently using `0` would hide client errors). Missing reference-type properties such as a `String` are simply `null`. Records do not need a no-argument constructor.',
      },
    ],
  ),
  ...b.output(
    'java-bean-validation',
    2,
    [
      'A `Validator` returns a set of constraint violations; an empty set means valid.',
      'Each built-in constraint has a default message such as `must not be blank`.',
    ],
    [
      {
        key: 'basic',
        code: `import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

public class Main {
    public static void main(String[] args) {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            Validator validator = factory.getValidator();
            var request = new CreateOrderRequest(" ", "not-an-email", 0);
            validator.validate(request).stream()
                .map(v -> v.getPropertyPath() + ": " + v.getMessage())
                .sorted()
                .forEach(System.out::println);
            System.out.println(validator.validate(new CreateOrderRequest("Ada", "ada@example.com", 2)).size());
        }
    }
}

record CreateOrderRequest(
    @NotBlank String customer,
    @Email String email,
    @Positive int quantity) {}`,
        output: 'customer: must not be blank\nemail: must be a well-formed email address\nquantity: must be greater than 0\n0',
        why: 'All three constraints fail and each produces a violation with the property path and a default message. Violations come in a `Set` with no defined order, so the program sorts them before printing. A valid request has no violations.',
      },
      {
        key: 'size-pattern',
        code: `import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public class Main {
    public static void main(String[] args) {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            validator.validate(new Product("X", "abc-12")).stream()
                .map(v -> v.getPropertyPath() + ": " + v.getMessage())
                .sorted()
                .forEach(System.out::println);
        }
    }
}

record Product(
    @Size(min = 2, max = 40) String name,
    @Pattern(regexp = "[A-Z]{3}-\\\\d{2}", message = "must look like ABC-12") String sku) {}`,
        output: 'name: size must be between 2 and 40\nsku: must look like ABC-12',
        why: '`"X"` is shorter than 2 characters. The SKU uses lowercase letters, so the pattern (which must match the whole string) fails, and the custom message replaces the default one.',
      },
      {
        key: 'valid',
        code: `import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public class Main {
    public static void main(String[] args) {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            System.out.println(validator.validate(new Rating(5, "great")).isEmpty());
            validator.validate(new Rating(6, null)).stream()
                .map(v -> v.getPropertyPath() + ": " + v.getMessage())
                .sorted()
                .forEach(System.out::println);
        }
    }
}

record Rating(@Min(1) @Max(5) int stars, @NotNull String comment) {}`,
        output: 'true\ncomment: must not be null\nstars: must be less than or equal to 5',
        why: 'The first rating satisfies every constraint, so the set is empty. The second has too many stars and a `null` comment, which `@NotNull` rejects.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-validation-null-semantics',
    4,
    'Most Bean Validation constraints consider `null` valid; only `@NotNull`, `@NotEmpty` and `@NotBlank` reject it.',
    [
      {
        key: 'size-null',
        code: `import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

public class Main {
    public static void main(String[] args) {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            System.out.println(validator.validate(new Signup(null, null)).size());
        }
    }
}

record Signup(@Size(min = 3) String username, @Email String email) {}`,
        correct: '0',
        wrong: ['2', '1', 'NullPointerException'],
        why: '`@Size` and `@Email` only check non-null values, so a request with both fields missing is valid. Add `@NotNull` or `@NotBlank` for required fields. This split lets the same constraint describe optional fields.',
      },
      {
        key: 'blank-vs-empty',
        code: `import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

public class Main {
    public static void main(String[] args) {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            validator.validate(new Names("   ", "   ", "   ")).stream()
                .map(v -> v.getPropertyPath().toString())
                .sorted()
                .forEach(System.out::println);
        }
    }
}

record Names(@NotNull String a, @NotEmpty String b, @NotBlank String c) {}`,
        correct: 'c',
        wrong: ['b\nc', 'a\nb\nc', 'a'],
        why: 'Three spaces are not `null` (so `@NotNull` passes) and have length 3 (so `@NotEmpty` passes). Only `@NotBlank` trims whitespace and rejects the value. Use `@NotBlank` for required text fields.',
      },
      {
        key: 'min-wrapper',
        code: `import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.constraints.Min;

public class Main {
    public static void main(String[] args) {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            System.out.println(validator.validate(new Page(null, 0)).size());
        }
    }
}

record Page(@Min(1) Integer size, @Min(0) int number) {}`,
        correct: '0',
        wrong: ['1', '2', 'NullPointerException'],
        why: 'A `null` `Integer` passes `@Min` (it is “not present”), and `0` satisfies `@Min(0)`. If a page size is required, the wrapper needs `@NotNull` too; a primitive `int` can never be `null` but would silently default to `0` when it is missing from JSON in a lenient mapper.',
      },
    ],
  ),
  ...b.output(
    'java-cascaded-validation',
    4,
    [
      'Constraints on a nested object are only checked if the field is annotated with `@Valid`.',
      'Constraints can also be placed on type arguments, such as `List<@NotBlank String>`.',
    ],
    [
      {
        key: 'valid-nested',
        code: `import jakarta.validation.Valid;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class Main {
    public static void main(String[] args) {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            Address empty = new Address("", "");
            System.out.println(validator.validate(new Customer("Ada", empty, empty)).stream()
                .map(v -> v.getPropertyPath().toString())
                .sorted()
                .toList());
        }
    }
}

record Address(@NotBlank String street, @NotBlank String city) {}

record Customer(@NotBlank String name, @NotNull @Valid Address billing, @NotNull Address shipping) {}`,
        output: '[billing.city, billing.street]',
        why: '`@Valid` cascades validation into `billing`, so its blank fields are reported with nested paths. `shipping` only has `@NotNull`, which passes, and its own constraints are never checked: a common gap in request DTOs.',
      },
      {
        key: 'container-elements',
        code: `import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            var article = new Article(List.of("java", " ", "spring", "jpa"));
            validator.validate(article).stream()
                .map(v -> v.getPropertyPath() + ": " + v.getMessage())
                .sorted()
                .forEach(System.out::println);
        }
    }
}

record Article(@Size(max = 3) List<@NotBlank String> tags) {}`,
        output: 'tags: size must be between 0 and 3\ntags[1].<list element>: must not be blank',
        why: '`@Size` on the list checks the number of elements (4 is more than 3). `@NotBlank` on the type argument checks every element, and the path identifies the blank element by index.',
      },
      {
        key: 'list-of-dtos',
        code: `import jakarta.validation.Valid;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Positive;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            var order = new OrderRequest(List.of(new Line("pen", 2), new Line("ink", 0), new Line("pad", -1)));
            validator.validate(order).stream()
                .map(v -> v.getPropertyPath().toString())
                .sorted()
                .forEach(System.out::println);
        }
    }
}

record Line(String sku, @Positive int quantity) {}

record OrderRequest(@NotEmpty List<@Valid Line> lines) {}`,
        output: 'lines[1].quantity\nlines[2].quantity',
        why: '`List<@Valid Line>` cascades into every element, and the property paths include the index of each invalid line, which makes precise error responses possible.',
      },
    ],
  ),
  ...b.output(
    'java-cross-field-validation',
    5,
    [
      'An `@AssertTrue` method validates a rule that involves several fields; its property name comes from the getter-style method name.',
      'Validation reports all violations; it does not stop at the first one.',
    ],
    [
      {
        key: 'date-range',
        code: `import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

public class Main {
    public static void main(String[] args) {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            var booking = new Booking(LocalDate.of(2024, 5, 10), LocalDate.of(2024, 5, 3));
            validator.validate(booking).stream()
                .map(v -> v.getPropertyPath() + ": " + v.getMessage())
                .forEach(System.out::println);
        }
    }
}

class Booking {
    @NotNull private final LocalDate from;
    @NotNull private final LocalDate to;

    Booking(LocalDate from, LocalDate to) {
        this.from = from;
        this.to = to;
    }

    @AssertTrue(message = "end date must not be before start date")
    public boolean isDateRangeValid() {
        return from == null || to == null || !to.isBefore(from);
    }
}`,
        output: 'dateRangeValid: end date must not be before start date',
        why: 'Bean Validation treats `isDateRangeValid()` as the getter of a property named `dateRangeValid`, and `@AssertTrue` requires it to return `true`. The method tolerates `null` dates and leaves those to `@NotNull`, so each problem is reported once.',
      },
      {
        key: 'record-method',
        code: `import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.PositiveOrZero;

public class Main {
    public static void main(String[] args) {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            validator.validate(new Discount(120, -5)).stream()
                .map(v -> v.getPropertyPath().toString())
                .sorted()
                .forEach(System.out::println);
        }
    }
}

record Discount(@PositiveOrZero int percent, @PositiveOrZero int minimumOrderCents) {
    @AssertTrue
    public boolean isPercentInRange() {
        return percent <= 100;
    }
}`,
        output: 'minimumOrderCents\npercentInRange',
        why: 'Both the field constraint and the cross-field method are evaluated, and all violations are returned together. `percent` (120) satisfies `@PositiveOrZero` but fails the `@AssertTrue` rule, reported as `percentInRange`.',
      },
    ],
  ),
  ...b.multi(
    'java-validation-strategy',
    3,
    'Distinguish checking the shape of input at the boundary from enforcing business invariants inside the domain.',
    [
      {
        key: 'where',
        question: 'Select every statement that describes a sound validation strategy for a Spring REST service.',
        correct: [
          'Annotate request DTOs with Bean Validation constraints and trigger them with `@Valid` at the controller, so invalid input is rejected with 400 before business code runs.',
          'Enforce invariants that must always hold (such as a positive quantity) in the domain objects too, for example in a record’s compact constructor.',
          'Check rules that need data, such as “email already registered”, in the service layer.',
        ],
        wrong: [
          'Validate only in the browser, because the server receives data from the official client only.',
          'Put `@NotNull` on every field of every class so that `null` can never occur at run time.',
        ],
        why: 'Boundary validation gives clients clear errors, domain invariants protect every code path (batch jobs, messages, tests), and rules that need the database belong in services. Client-side checks are only a convenience and can be bypassed. Annotations do nothing unless a validator runs, so they are not a general null-safety mechanism.',
      },
    ],
  ),
];
