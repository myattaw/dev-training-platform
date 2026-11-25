import type { QuestionSource } from '@pracstack/content-model';
import { plain } from '../helpers';
import { programBuilders } from '../program-builders';

/*
 * Spring fundamentals: beans, the application context, Spring Boot startup and
 * auto-configuration, dependency injection. Every program runs on the real
 * Java 21 runner with Spring Boot 4.1 on the class path.
 */

const b = programBuilders('java');

// ---------------------------------------------------------------- Beans and the application context

export const beansContextFamilies: readonly QuestionSource[] = [
  ...b.output(
    'sb-ctx-singleton',
    1,
    [
      'Ask the context for the same bean twice and compare what comes back.',
      'The default scope of a Spring bean is `singleton`: one instance per application context.',
    ],
    [
      {
        key: 'same-instance',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(AppConfig.class);
        VisitCounter a = ctx.getBean(VisitCounter.class);
        VisitCounter b = ctx.getBean(VisitCounter.class);
        a.visit();
        b.visit();
        System.out.println(a == b);
        System.out.println(a.count());
    }
}

@Configuration
class AppConfig {
    @Bean
    VisitCounter visitCounter() {
        return new VisitCounter();
    }
}

class VisitCounter {
    private int count;
    void visit() { count++; }
    int count() { return count; }
}`,
        output: 'true\n2',
        why: 'A bean is a singleton by default: the context calls `visitCounter()` once and hands out the same object every time. Both calls to `visit()` change that one object, so the count is 2. Calling `getBean` does not create a new instance.',
      },
      {
        key: 'prototype',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(AppConfig.class);
        ShoppingCart a = ctx.getBean(ShoppingCart.class);
        ShoppingCart b = ctx.getBean(ShoppingCart.class);
        a.add("pen");
        b.add("cup");
        System.out.println(a == b);
        System.out.println(a.size() + " " + b.size());
    }
}

@Configuration
class AppConfig {
    @Bean
    @Scope("prototype")
    ShoppingCart shoppingCart() {
        return new ShoppingCart();
    }
}

class ShoppingCart {
    private final java.util.List<String> items = new java.util.ArrayList<>();
    void add(String item) { items.add(item); }
    int size() { return items.size(); }
}`,
        output: 'false\n1 1',
        why: 'With `@Scope("prototype")` every `getBean` call runs the factory method again and returns a new object, so `a` and `b` are different carts with one item each. Without the scope annotation they would be the same singleton.',
      },
      {
        key: 'two-beans-same-class',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(AppConfig.class);
        Counter orders = ctx.getBean("orderCounter", Counter.class);
        Counter refunds = ctx.getBean("refundCounter", Counter.class);
        orders.increment();
        orders.increment();
        refunds.increment();
        System.out.println(ctx.getBean("orderCounter", Counter.class).value());
        System.out.println(orders == refunds);
    }
}

@Configuration
class AppConfig {
    @Bean Counter orderCounter() { return new Counter(); }
    @Bean Counter refundCounter() { return new Counter(); }
}

class Counter {
    private int value;
    void increment() { value++; }
    int value() { return value; }
}`,
        output: '2\nfalse',
        why: '"Singleton" means one instance per bean definition, not one per class. `orderCounter` and `refundCounter` are two beans of the same class, each a singleton, so looking up `orderCounter` again returns the object that was incremented twice.',
      },
    ],
  ),
  ...b.blank(
    'sb-ctx-config-blank',
    1,
    'One annotation marks the class as a source of bean definitions; the other marks a method whose return value becomes a bean.',
    [
      {
        key: 'config-and-bean',
        prompt: 'Complete the configuration so that the context can create the `Greeter` bean.',
        template: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(AppConfig.class);
        System.out.println(ctx.getBean(Greeter.class).greet("Ada"));
    }
}

{{blank:cls}}
class AppConfig {
    {{blank:method}}
    Greeter greeter() {
        return new Greeter("Hello");
    }
}

record Greeter(String prefix) {
    String greet(String name) { return prefix + ", " + name; }
}`,
        blanks: { cls: ['@Configuration'], method: ['@Bean'] },
        why: '`@Configuration` marks a class that declares beans, and `@Bean` on a method registers its return value as a bean named after the method (`greeter`). `@Component` on a method does not compile, and without `@Bean` the method is just an ordinary method the context never calls.',
      },
      {
        key: 'register-class',
        prompt:
          'Complete the code so that the context registers `PriceCalculator` itself as a bean and prints its result.',
        template: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext({{blank:cls}});
        PriceCalculator calc = ctx.{{blank:lookup}}(PriceCalculator.class);
        System.out.println(calc.withTax(100));
    }
}

class PriceCalculator {
    int withTax(int net) { return net * 120 / 100; }
}`,
        blanks: { cls: ['PriceCalculator.class'], lookup: ['getBean'] },
        why: '`AnnotationConfigApplicationContext` accepts component classes directly: `PriceCalculator.class` becomes a bean named `priceCalculator`. `getBean(Type.class)` looks it up by type. A class does not need `@Component` when it is registered explicitly; the annotation only matters for component scanning.',
      },
    ],
  ),
  ...b.output(
    'sb-ctx-bean-names',
    2,
    [
      'A `@Bean` method’s name becomes the bean name; a registered class gets its simple name with a lowercase first letter.',
    ],
    [
      {
        key: 'method-name',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(AppConfig.class);
        System.out.println(ctx.containsBean("taxPolicy"));
        System.out.println(ctx.containsBean("standardTaxPolicy"));
        System.out.println(ctx.containsBean("appConfig"));
    }
}

@Configuration
class AppConfig {
    @Bean
    TaxPolicy standardTaxPolicy() {
        return new TaxPolicy(20);
    }
}

record TaxPolicy(int percent) {}`,
        output: 'false\ntrue\ntrue',
        why: 'A `@Bean` method registers a bean named after the method (`standardTaxPolicy`), not after the returned type. The configuration class is itself a bean, named `appConfig` from its class name.',
      },
      {
        key: 'registered-class',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(OrderService.class, URLShortener.class);
        System.out.println(ctx.containsBean("orderService") + " " + ctx.containsBean("OrderService"));
        System.out.println(ctx.containsBean("uRLShortener") + " " + ctx.containsBean("URLShortener"));
    }
}

class OrderService {}
class URLShortener {}`,
        output: 'true false\nfalse true',
        why: 'A registered class is named after its simple class name with the first letter lowercased (`orderService`). The rule follows `Introspector.decapitalize`: when the first two letters are both uppercase, the name is kept as is, so `URLShortener` stays `URLShortener`. Bean names are case-sensitive.',
      },
      {
        key: 'explicit-name',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(AppConfig.class);
        System.out.println(ctx.containsBean("fastPayments"));
        System.out.println(ctx.containsBean("stripeGateway"));
        System.out.println(ctx.getBean("fastPayments", PaymentGateway.class).provider());
    }
}

@Configuration
class AppConfig {
    @Bean("fastPayments")
    PaymentGateway stripeGateway() {
        return new PaymentGateway("stripe");
    }
}

record PaymentGateway(String provider) {}`,
        output: 'true\nfalse\nstripe',
        why: '`@Bean("fastPayments")` replaces the default name, so the bean is only known as `fastPayments`; the method name is no longer a bean name. Use explicit names sparingly: they are what `@Qualifier` and `getBean(String)` refer to.',
      },
    ],
  ),
  ...b.output(
    'sb-ctx-lifecycle',
    2,
    [
      'Singletons are created when the context starts, not when they are first requested.',
      'Initialization callbacks run after the constructor; destruction callbacks run when the context closes.',
    ],
    [
      {
        key: 'eager-singletons',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        System.out.println("starting");
        var ctx = new AnnotationConfigApplicationContext(CacheWarmer.class);
        System.out.println("started");
        ctx.getBean(CacheWarmer.class);
        System.out.println("looked up");
    }
}

class CacheWarmer {
    CacheWarmer() {
        System.out.println("warming cache");
    }
}`,
        output: 'starting\nwarming cache\nstarted\nlooked up',
        why: 'Singleton beans are created eagerly while the context starts (in `refresh()`, called by the constructor of `AnnotationConfigApplicationContext`). So "warming cache" is printed before "started", and `getBean` just returns the existing instance. Eager creation is what makes configuration mistakes fail at startup instead of on the first request.',
      },
      {
        key: 'lazy',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        System.out.println("starting");
        var ctx = new AnnotationConfigApplicationContext(ReportEngine.class);
        System.out.println("started");
        ctx.getBean(ReportEngine.class);
        System.out.println("looked up");
    }
}

@Lazy
class ReportEngine {
    ReportEngine() {
        System.out.println("loading templates");
    }
}`,
        output: 'starting\nstarted\nloading templates\nlooked up',
        why: '`@Lazy` defers creating the singleton until it is first needed, here the `getBean` call. That can speed up startup, but configuration errors in the bean then surface later, at the first use.',
      },
      {
        key: 'init-destroy',
        code: `import org.springframework.context.annotation.*;
import jakarta.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(ConnectionPool.class);
        System.out.println("running");
        ctx.close();
    }
}

class ConnectionPool {
    ConnectionPool() { System.out.println("constructor"); }

    @PostConstruct
    void open() { System.out.println("open connections"); }

    @PreDestroy
    void shutdown() { System.out.println("close connections"); }
}`,
        output: 'constructor\nopen connections\nrunning\nclose connections',
        why: 'Spring calls the constructor, injects dependencies, then calls the `@PostConstruct` method, all during startup. `@PreDestroy` runs when the context is closed. Work that needs injected dependencies belongs in `@PostConstruct` (or the constructor with constructor injection), not in a static initializer.',
      },
      {
        key: 'prototype-destroy',
        code: `import org.springframework.context.annotation.*;
import jakarta.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(AppConfig.class);
        ctx.getBean(TempFile.class);
        ctx.getBean(TempFile.class);
        ctx.close();
        System.out.println("closed");
    }
}

@Configuration
class AppConfig {
    @Bean
    @Scope("prototype")
    TempFile tempFile() { return new TempFile(); }
}

class TempFile {
    @PostConstruct
    void create() { System.out.println("create"); }

    @PreDestroy
    void delete() { System.out.println("delete"); }
}`,
        output: 'create\ncreate\nclosed',
        why: 'Spring initializes prototype beans (so `@PostConstruct` runs for each one) but does not track them afterwards, so their `@PreDestroy` methods are never called. The code that requested a prototype is responsible for cleaning it up.',
      },
    ],
  ),
  ...b.fails(
    'sb-ctx-no-such-bean',
    2,
    'Read the exception name and the bean it mentions: what does the context actually contain?',
    [
      {
        key: 'not-registered',
        question: 'This program fails at the `getBean` call. Why?',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(AppConfig.class);
        InvoiceService service = ctx.getBean(InvoiceService.class);
        System.out.println(service.nextNumber());
    }
}

@Configuration
class AppConfig {
    @Bean
    NumberFormatter numberFormatter() {
        return new NumberFormatter();
    }
}

class NumberFormatter {}

class InvoiceService {
    String nextNumber() { return "INV-1"; }
}`,
        error:
          "NoSuchBeanDefinitionException: No qualifying bean of type 'InvoiceService' available",
        correct:
          '`InvoiceService` was never registered: add a `@Bean` method for it or register the class with the context.',
        wrong: [
          '`InvoiceService` needs a public constructor before Spring can create it.',
          '`getBean(Class)` only finds beans that implement an interface; look it up by name instead.',
          'The context has not finished starting; `getBean` must be called after `ctx.refresh()`.',
        ],
        why: 'Spring only manages classes it has been told about: a `@Bean` method, a class passed to the context, or a component found by scanning. A plain class is not a bean, so the lookup throws `NoSuchBeanDefinitionException`. Package-private constructors are fine, lookups by class work for any bean, and this constructor of `AnnotationConfigApplicationContext` already refreshes the context.',
      },
      {
        key: 'wrong-name',
        question: 'A lookup by name fails. What is the cause?',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(AppConfig.class);
        Object repo = ctx.getBean("userRepo");
        System.out.println(repo);
    }
}

@Configuration
class AppConfig {
    @Bean
    UserRepository userRepository() {
        return new UserRepository();
    }
}

class UserRepository {}`,
        error: "No bean named 'userRepo' available",
        correct:
          'The bean is named after its factory method, `userRepository`; look it up with that name or, better, by type.',
        wrong: [
          'Bean names are derived from the class name in uppercase, so the name is `UserRepository`.',
          'Names only work for beans declared with `@Component`; `@Bean` methods can only be looked up by type.',
          'Spring abbreviates long bean names, so the lookup should use `uRepo`.',
        ],
        why: 'A `@Bean` method defines a bean whose name is the method name, here `userRepository`. Looking up by type (`getBean(UserRepository.class)`) avoids depending on names at all, which is why injection by type is the norm.',
      },
    ],
  ),
  ...b.concept(
    'sb-ctx-component-scan',
    3,
    'Component scanning starts at the package of the class that declares it and includes its subpackages only.',
    [
      {
        key: 'sibling-package',
        question:
          'With this layout, a request to `/api/orders` returns 404 and `OrderController` is never created. What is the cause?',
        snippet: plain(`src/main/java/
  com/shop/app/ShopApplication.java    @SpringBootApplication
  com/shop/app/service/OrderService.java    @Service
  com/shop/web/OrderController.java    @RestController  @RequestMapping("/api/orders")`),
        correct:
          '`@SpringBootApplication` scans `com.shop.app` and its subpackages, and `com.shop.web` is outside it; move the application class to `com.shop` (or list the packages to scan).',
        wrong: [
          'Controllers must be in a package named `controller` for Spring MVC to detect them.',
          '`@RestController` classes are only detected when they are also annotated with `@Component`.',
          'Spring scans packages alphabetically and stops at the first one with an application class.',
        ],
        why: 'The component scan that `@SpringBootApplication` turns on starts at the application class’s package. `com.shop.app.service` is a subpackage and is found; `com.shop.web` is a sibling and is not. The usual fix is to put the application class in the root package (`com.shop`). `@RestController` is already a `@Component` stereotype, and package names do not matter to Spring.',
      },
      {
        key: 'library-bean',
        question:
          'A shared library provides `AuditClient` (annotated `@Component`) in package `org.acme.audit`. The application class is in `com.shop`. Injecting `AuditClient` fails with “No qualifying bean”. What is the best fix?',
        snippet: plain(`com.shop.ShopApplication            @SpringBootApplication
com.shop.orders.OrderService        constructor(AuditClient client)
org.acme.audit.AuditClient          @Component (in a library jar)`),
        correct:
          'Declare the bean explicitly with a `@Bean` method (or `@Import(AuditClient.class)`) in a configuration class of the application.',
        wrong: [
          'Move `ShopApplication` to the default package so that every package is scanned.',
          'Mark the constructor parameter `@Autowired(required = true)`.',
          'Annotate `OrderService` with `@ComponentScan` so it can find its own dependencies.',
        ],
        why: 'Scanning does not reach `org.acme.audit`, so the library class is not a bean. Registering it explicitly keeps the scan narrow and makes the dependency visible; libraries meant for Spring Boot usually ship an auto-configuration instead. Scanning the default package would scan every jar on the class path (slow and fragile), and `required = true` is already the default: it changes nothing.',
      },
    ],
  ),
  ...b.outputChoice(
    'sb-ctx-proxy-bean-methods',
    4,
    'In a `@Configuration` class, calls between `@Bean` methods are intercepted by a generated subclass, unless proxying is turned off.',
    [
      {
        key: 'full-mode',
        question: 'Two beans call the same `@Bean` method. What does this program print?',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(AppConfig.class);
        System.out.println(ctx.getBean(OrderRepository.class).pool() == ctx.getBean(CustomerRepository.class).pool());
    }
}

@Configuration
class AppConfig {
    @Bean
    ConnectionPool connectionPool() {
        System.out.println("new pool");
        return new ConnectionPool();
    }

    @Bean
    OrderRepository orderRepository() { return new OrderRepository(connectionPool()); }

    @Bean
    CustomerRepository customerRepository() { return new CustomerRepository(connectionPool()); }
}

class ConnectionPool {}
record OrderRepository(ConnectionPool pool) {}
record CustomerRepository(ConnectionPool pool) {}`,
        correct: 'new pool\ntrue',
        wrong: ['new pool\nnew pool\nnew pool\nfalse', 'new pool\nnew pool\nfalse', 'true'],
        why: 'Spring subclasses a `@Configuration` class (with CGLIB) and intercepts calls to `@Bean` methods: `connectionPool()` called from another bean method returns the existing singleton instead of running the method body again. So the pool is created once and shared. Plain Java semantics would create three pools.',
      },
      {
        key: 'lite-mode',
        question:
          'The same configuration, with `proxyBeanMethods = false`. What does it print now?',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(AppConfig.class);
        System.out.println(ctx.getBean(OrderRepository.class).pool() == ctx.getBean(ConnectionPool.class));
    }
}

@Configuration(proxyBeanMethods = false)
class AppConfig {
    @Bean
    ConnectionPool connectionPool() {
        System.out.println("new pool");
        return new ConnectionPool();
    }

    @Bean
    OrderRepository orderRepository() { return new OrderRepository(connectionPool()); }
}

class ConnectionPool {}
record OrderRepository(ConnectionPool pool) {}`,
        correct: 'new pool\nnew pool\nfalse',
        wrong: ['new pool\ntrue', 'new pool\nfalse', 'new pool\nnew pool\ntrue'],
        why: 'Without the proxy, `connectionPool()` is an ordinary method call: the repository gets a second pool that is not the bean in the context. With `proxyBeanMethods = false` (common in Spring Boot’s own configuration for faster startup), take dependencies as method parameters instead: `orderRepository(ConnectionPool pool)`.',
      },
      {
        key: 'parameter-injection',
        question:
          'This configuration turns proxying off but takes the pool as a parameter. What does it print?',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(AppConfig.class);
        System.out.println(ctx.getBean(OrderRepository.class).pool() == ctx.getBean(ConnectionPool.class));
    }
}

@Configuration(proxyBeanMethods = false)
class AppConfig {
    @Bean
    ConnectionPool connectionPool() {
        System.out.println("new pool");
        return new ConnectionPool();
    }

    @Bean
    OrderRepository orderRepository(ConnectionPool pool) { return new OrderRepository(pool); }
}

class ConnectionPool {}
record OrderRepository(ConnectionPool pool) {}`,
        correct: 'new pool\ntrue',
        wrong: ['new pool\nnew pool\nfalse', 'new pool\nfalse', 'true'],
        why: 'A `@Bean` method parameter is resolved from the context like a constructor argument, so the repository receives the singleton pool. This style works the same with or without the configuration proxy, which is why it is the recommended way to wire beans inside configuration classes.',
      },
    ],
  ),
  ...b.fails(
    'sb-ctx-bean-overriding',
    5,
    'Spring Boot changes one default of the plain Spring container about bean names that appear twice.',
    [
      {
        key: 'boot-disallows',
        question:
          'Two configuration classes (for example one from a library) declare a bean with the same name. Why does Spring Boot refuse to start?',
        code: `import org.springframework.boot.*;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(CoreConfig.class, ReportingConfig.class)
            .web(WebApplicationType.NONE)
            .run();
        System.out.println(ctx.getBean("clock"));
    }
}

@Configuration
class CoreConfig {
    @Bean String clock() { return "system"; }
}

@Configuration
class ReportingConfig {
    @Bean String clock() { return "fixed"; }
}`,
        error: 'BeanDefinitionOverrideException',
        correct:
          'Spring Boot disables bean definition overriding, so the second `clock` definition is rejected instead of silently replacing the first; rename one of the beans.',
        wrong: [
          'Two beans of type `String` are ambiguous; add `@Primary` to one of them.',
          '`String` cannot be a bean type; wrap the value in a class.',
          'Configuration classes passed to `SpringApplicationBuilder` must be annotated `@SpringBootApplication`.',
        ],
        why: 'The plain Spring container lets a later definition with the same name replace an earlier one. Spring Boot sets `spring.main.allow-bean-definition-overriding=false`, so it fails fast with `BeanDefinitionOverrideException` and a message suggesting a rename. This is about names, not types: `@Primary` resolves ambiguity between differently named beans of one type, and any object, including a `String`, can be a bean.',
      },
      {
        key: 'class-and-method',
        question:
          'The application registers the `AuditLog` class and also declares a `@Bean` method for it. Why does startup fail?',
        code: `import org.springframework.boot.*;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(AppConfig.class, AuditLog.class)
            .web(WebApplicationType.NONE)
            .run();
        System.out.println(ctx.getBean(AuditLog.class).target());
    }
}

@Configuration
class AppConfig {
    @Bean
    AuditLog auditLog() { return new AuditLog("database"); }
}

class AuditLog {
    private final String target;
    AuditLog() { this("console"); }
    AuditLog(String target) { this.target = target; }
    String target() { return target; }
}`,
        error: "Invalid bean definition with name 'auditLog'",
        correct:
          'The registered class gets the default name `auditLog`, the same as the `@Bean` method, and Spring Boot rejects the second definition; register the class only once.',
        wrong: [
          '`AuditLog` has two constructors, so Spring cannot decide which one to call.',
          'A class registered directly must not also have a `public` no-argument constructor.',
          'Beans of type `AuditLog` are ambiguous; inject them with `@Qualifier`.',
        ],
        why: 'Registering a class and declaring a `@Bean` method that returns it are two definitions, and both are named `auditLog`. With overriding disabled, Spring Boot fails with `BeanDefinitionOverrideException`. The same clash happens when component scanning finds a class that a configuration also declares. The two constructors are not the problem: the name collision is detected before any instance is created.',
      },
    ],
  ),
  ...b.output(
    'sb-ctx-overriding-plain',
    5,
    [
      'Bean names must be unique in a context. What happens to the first definition when a second one with the same name is registered?',
    ],
    [
      {
        key: 'last-wins',
        question:
          'This uses a plain Spring context (not Spring Boot) with two configuration classes that both define `clock`. What does it print?',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(CoreConfig.class, TestClockConfig.class);
        System.out.println(ctx.getBean("clock"));
        System.out.println(ctx.getBeansOfType(String.class).size());
    }
}

@Configuration
class CoreConfig {
    @Bean String clock() { return "system"; }
}

@Configuration
class TestClockConfig {
    @Bean String clock() { return "fixed"; }
}`,
        output: 'fixed\n1',
        why: 'In the plain Spring container overriding is allowed: the definition registered later (`TestClockConfig`) replaces the earlier one, so there is a single `clock` bean with the value "fixed". This silent replacement is why Spring Boot turns overriding off by default and fails at startup instead.',
      },
      {
        key: 'order-decides',
        question:
          'The same two configuration classes, registered in the opposite order with a plain Spring context. What does it print?',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(TestClockConfig.class, CoreConfig.class);
        System.out.println(ctx.getBean("clock"));
        System.out.println(ctx.getBean(Report.class).clock());
    }
}

@Configuration
class CoreConfig {
    @Bean String clock() { return "system"; }
    @Bean Report report(String clock) { return new Report(clock); }
}

@Configuration
class TestClockConfig {
    @Bean String clock() { return "fixed"; }
}

record Report(String clock) {}`,
        output: 'system\nsystem',
        why: 'Now `CoreConfig` is registered last, so its `clock` replaces the test one, and every injection point sees "system". The result silently depends on registration order, which is exactly the kind of surprise Spring Boot avoids by rejecting duplicate names.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Spring Boot startup and auto-configuration

export const bootStartupFamilies: readonly QuestionSource[] = [
  ...b.multi(
    'sb-boot-application-annotation',
    1,
    'Think about the three annotations `@SpringBootApplication` is made of.',
    [
      {
        key: 'meta-annotations',
        question: 'Which statements about `@SpringBootApplication` are true?',
        correct: [
          'It combines `@SpringBootConfiguration`, `@EnableAutoConfiguration` and `@ComponentScan`.',
          'The annotated class is itself a configuration class and can declare `@Bean` methods.',
          'Component scanning starts at the package of the annotated class.',
        ],
        wrong: [
          'It starts an embedded web server even when no web library is on the class path.',
          'It must be placed on a class named `Application`.',
        ],
        why: '`@SpringBootApplication` is a shortcut for `@SpringBootConfiguration` (a `@Configuration`), `@EnableAutoConfiguration` and `@ComponentScan` from the class’s package. A web server is only auto-configured when a web stack is on the class path, and the class name is free.',
      },
      {
        key: 'main-method',
        question:
          'Which statements about `SpringApplication.run(ShopApplication.class, args)` are true?',
        correct: [
          'It creates and refreshes an application context and returns it.',
          'It passes `args` on, so `--server.port=9090` becomes a property with the highest usual precedence.',
          'It runs `CommandLineRunner` and `ApplicationRunner` beans after the context has started.',
        ],
        wrong: [
          'It returns before any bean has been created; beans are created on first use.',
          'It ignores command-line arguments; properties come only from `application.properties`.',
        ],
        why: '`run` prepares the environment (including command-line arguments as a property source), creates and refreshes the context (eagerly creating singletons), then calls the runners and returns the running context.',
      },
    ],
  ),
  ...b.output(
    'sb-boot-runners',
    2,
    [
      '`CommandLineRunner` and `ApplicationRunner` beans run once, after the context is fully started.',
      'Their order follows `@Order`: lower values run first.',
    ],
    [
      {
        key: 'order',
        code: `import org.springframework.boot.*;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.core.annotation.Order;

public class Main {
    public static void main(String[] args) {
        new SpringApplicationBuilder(App.class, SeedData.class, WarmCache.class)
            .web(WebApplicationType.NONE)
            .run();
        System.out.println("run returned");
    }
}

@SpringBootConfiguration
class App {}

@Order(2)
class SeedData implements CommandLineRunner {
    SeedData() { System.out.println("SeedData created"); }
    public void run(String... args) { System.out.println("seeding"); }
}

@Order(1)
class WarmCache implements CommandLineRunner {
    WarmCache() { System.out.println("WarmCache created"); }
    public void run(String... args) { System.out.println("warming"); }
}`,
        output: 'SeedData created\nWarmCache created\nwarming\nseeding\nrun returned',
        why: 'All singletons are created while the context starts. Only then does Spring Boot call the runners, sorted by `@Order` (1 before 2), and `run` returns after the last one. The registration order of the classes affects creation order, not runner order.',
      },
      {
        key: 'application-arguments',
        code: `import org.springframework.boot.*;
import org.springframework.boot.builder.SpringApplicationBuilder;

public class Main {
    public static void main(String[] args) {
        new SpringApplicationBuilder(App.class, ImportJob.class)
            .web(WebApplicationType.NONE)
            .run("--mode=full", "customers.csv", "--dry-run");
    }
}

@SpringBootConfiguration
class App {}

class ImportJob implements ApplicationRunner {
    public void run(ApplicationArguments args) {
        System.out.println(args.getOptionValues("mode"));
        System.out.println(args.containsOption("dry-run"));
        System.out.println(args.getNonOptionArgs());
    }
}`,
        output: '[full]\ntrue\n[customers.csv]',
        why: '`ApplicationRunner` receives the arguments already parsed: `--name=value` arguments are options (values come back as a list because an option may repeat), `--dry-run` is an option without a value, and everything else is a non-option argument.',
      },
      {
        key: 'runner-sees-beans',
        code: `import org.springframework.boot.*;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .run();
        System.out.println("orders: " + ctx.getBean(OrderBook.class).size());
    }
}

@SpringBootConfiguration
class App {
    @Bean
    OrderBook orderBook() { return new OrderBook(); }

    @Bean
    CommandLineRunner loadDemoOrders(OrderBook book) {
        return args -> {
            book.add("A-1");
            book.add("A-2");
            System.out.println("loaded " + book.size());
        };
    }
}

class OrderBook {
    private final java.util.List<String> orders = new java.util.ArrayList<>();
    void add(String id) { orders.add(id); }
    int size() { return orders.size(); }
}`,
        output: 'loaded 2\norders: 2',
        why: 'A runner can be a lambda returned from a `@Bean` method, with its dependencies as method parameters. It runs before `run` returns and works on the same singleton `OrderBook` the caller looks up afterwards.',
      },
    ],
  ),
  ...b.output(
    'sb-boot-conditional-on-missing-bean',
    3,
    [
      'Auto-configuration is evaluated after the application’s own configuration.',
      '`@ConditionalOnMissingBean` backs off when the application already defines a bean of that type.',
    ],
    [
      {
        key: 'user-bean-wins',
        code: `import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .run();
        System.out.println(ctx.getBean(Greeter.class).greet());
        System.out.println(ctx.getBeansOfType(Greeter.class).size());
    }
}

// What a library would ship as an auto-configuration.
@AutoConfiguration
class GreeterAutoConfiguration {
    @Bean
    @ConditionalOnMissingBean
    Greeter defaultGreeter() { return () -> "Hello from the library"; }
}

@SpringBootConfiguration
@ImportAutoConfiguration(GreeterAutoConfiguration.class)
class App {
    @Bean
    Greeter customGreeter() { return () -> "Hello from the app"; }
}

interface Greeter { String greet(); }`,
        output: 'Hello from the app\n1',
        why: 'Auto-configurations are processed after the user’s configuration, so when the condition is checked `customGreeter` already exists and `defaultGreeter` is skipped. That is how Spring Boot lets you replace any default (an `ObjectMapper`, a `DataSource`…) just by declaring your own bean.',
      },
      {
        key: 'default-used',
        code: `import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .run();
        System.out.println(ctx.getBean(Greeter.class).greet());
        System.out.println(ctx.containsBean("defaultGreeter"));
    }
}

// What a library would ship as an auto-configuration.
@AutoConfiguration
class GreeterAutoConfiguration {
    @Bean
    @ConditionalOnMissingBean
    Greeter defaultGreeter() { return () -> "Hello from the library"; }
}

@SpringBootConfiguration
@ImportAutoConfiguration(GreeterAutoConfiguration.class)
class App {}

interface Greeter { String greet(); }`,
        output: 'Hello from the library\ntrue',
        why: 'The application defines no `Greeter`, so the condition matches and the auto-configured default is registered. Auto-configuration gives sensible defaults that disappear as soon as you provide your own bean.',
      },
    ],
  ),
  ...b.output(
    'sb-boot-conditional-on-property',
    3,
    [
      '`@ConditionalOnProperty(name = ..., havingValue = ...)` compares the property value; `matchIfMissing` decides what happens when the property is not set at all.',
    ],
    [
      {
        key: 'missing-property',
        code: `import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .run();
        System.out.println(ctx.containsBean("auditLog"));
        System.out.println(ctx.containsBean("metrics"));
    }
}

@SpringBootConfiguration
class App {
    @Bean
    @ConditionalOnProperty(name = "shop.audit.enabled", havingValue = "true")
    String auditLog() { return "audit"; }

    @Bean
    @ConditionalOnProperty(name = "shop.metrics.enabled", havingValue = "true", matchIfMissing = true)
    String metrics() { return "metrics"; }
}`,
        output: 'false\ntrue',
        why: 'Neither property is set. `auditLog` requires `shop.audit.enabled=true`, so it is skipped; `metrics` has `matchIfMissing = true`, so it is created unless someone sets the property to something other than `true`. That is the usual pattern for features that are on by default.',
      },
      {
        key: 'explicit-false',
        code: `import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .properties("shop.audit.enabled=yes", "shop.metrics.enabled=false")
            .run();
        System.out.println(ctx.containsBean("auditLog"));
        System.out.println(ctx.containsBean("metrics"));
    }
}

@SpringBootConfiguration
class App {
    @Bean
    @ConditionalOnProperty(name = "shop.audit.enabled", havingValue = "true")
    String auditLog() { return "audit"; }

    @Bean
    @ConditionalOnProperty(name = "shop.metrics.enabled", havingValue = "true", matchIfMissing = true)
    String metrics() { return "metrics"; }
}`,
        output: 'false\nfalse',
        why: '`havingValue = "true"` is a string comparison, so `yes` does not match and `auditLog` is skipped. `matchIfMissing` only applies when the property is absent; here it is present with `false`, so `metrics` is skipped too.',
      },
    ],
  ),
  ...b.fails(
    'sb-boot-startup-failure',
    4,
    'Startup failures name the bean that could not be created; the cause is usually a missing property, a missing bean or an invalid value.',
    [
      {
        key: 'missing-placeholder',
        question:
          'This client needs the payment service URL. The application fails to start. What is the cause and the fix?',
        code: `import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.*;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.support.PropertySourcesPlaceholderConfigurer;

public class Main {
    public static void main(String[] args) {
        new SpringApplicationBuilder(App.class, PaymentClient.class)
            .web(WebApplicationType.NONE)
            .properties("logging.level.root=OFF", "payments.base-url=https://pay.example.com")
            .run();
        System.out.println("started");
    }
}

@SpringBootConfiguration
class App {
    // Registered by Spring Boot's auto-configuration in a full application.
    @Bean
    static PropertySourcesPlaceholderConfigurer placeholders() {
        return new PropertySourcesPlaceholderConfigurer();
    }
}

class PaymentClient {
    PaymentClient(@Value("\${payment.base-url}") String baseUrl) {
        System.out.println("calling " + baseUrl);
    }
}`,
        error: "Error creating bean with name 'paymentClient'",
        correct:
          'The placeholder `payment.base-url` does not match the property `payments.base-url`, so it cannot be resolved; use the same key (or give a default with `${key:default}`).',
        wrong: [
          '`@Value` cannot be used on constructor parameters, only on fields.',
          'URLs must be wrapped in quotes in properties, otherwise the `:` ends the value.',
          '`PaymentClient` needs `@Component`, otherwise its constructor parameters are not injected.',
        ],
        why: 'Spring Boot resolves `${...}` placeholders strictly: an unknown key fails bean creation with “Could not resolve placeholder”, here inside the `paymentClient` creation error. `@Value` works on constructor parameters, a `:` in a property value needs no quotes, and a registered class does not need `@Component`.',
      },
      {
        key: 'runner-fails',
        question: 'The application starts, then fails before `run` returns. What is going on?',
        code: `import org.springframework.boot.*;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .properties("logging.level.root=OFF")
            .run();
        System.out.println("started");
    }
}

@SpringBootConfiguration
class App {
    @Bean
    CommandLineRunner importCustomers() {
        return args -> {
            throw new IllegalStateException("customers.csv not found");
        };
    }
}`,
        error: 'IllegalStateException: customers.csv not found',
        correct:
          'A `CommandLineRunner` threw, and Spring Boot treats that as a failed startup: it closes the context and `run` throws, so the import problem stops the whole application.',
        wrong: [
          'Runner exceptions are logged and ignored; the failure must come from the bean definition.',
          'Runners execute in a background thread, so the exception cannot reach `main`.',
          '`CommandLineRunner` beans must be declared as classes, not lambdas.',
        ],
        why: 'Runners are part of `SpringApplication.run`: an exception there is reported as an application startup failure, the context is closed and `run` rethrows the exception to `main`. That is right for essential initialization, but optional work (such as a demo data import) should handle its own errors or move to a scheduled job so it cannot take the service down.',
      },
      {
        key: 'bind-type',
        question: 'The application refuses to start after an edit to the configuration. Why?',
        code: `import org.springframework.boot.*;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.properties.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .properties("logging.level.root=OFF", "http.client.retries=three", "http.client.timeout-ms=500")
            .run();
        System.out.println(ctx.getBean(HttpClientProperties.class));
    }
}

@SpringBootConfiguration
@EnableConfigurationProperties(HttpClientProperties.class)
class App {}

@ConfigurationProperties("http.client")
record HttpClientProperties(int retries, int timeoutMs) {}`,
        error: "Could not bind properties to 'HttpClientProperties'",
        correct:
          '`http.client.retries=three` cannot be converted to `int`; the binding fails at startup, so the value must be a number such as `3`.',
        wrong: [
          '`timeout-ms` cannot bind to `timeoutMs`; property names must match the Java name exactly.',
          'Records cannot be used for `@ConfigurationProperties`; use a class with setters.',
          'Unknown values are ignored, so the failure must come from a missing property.',
        ],
        why: 'Spring Boot converts property strings to the target types while binding and fails fast when a value cannot be converted: the failure report names the property `http.client.retries`, the value `three` and the target type `int`.Relaxed binding maps `timeout-ms` to `timeoutMs`, and records bind through their constructor.',
      },
    ],
  ),
  ...b.concept(
    'sb-boot-diagnose-autoconfig',
    5,
    'Spring Boot can tell you which auto-configurations applied and why the others did not.',
    [
      {
        key: 'datasource-failure',
        question: 'A new service fails to start with this report. What is the most likely cause?',
        snippet: plain(`***************************
APPLICATION FAILED TO START
***************************

Description:

Failed to configure a DataSource: 'url' attribute is not specified and no embedded datasource could be configured.

Reason: Failed to determine a suitable driver class`),
        correct:
          'A JPA or JDBC starter is on the class path, so Spring Boot tries to configure a `DataSource`, but no `spring.datasource.url` is set and no embedded database driver is available.',
        wrong: [
          'The database server is down; Spring Boot connects to it during startup to read the schema.',
          'The `@Entity` classes are not in a scanned package, so no `DataSource` can be created.',
          'Spring Boot requires a `DataSource` bean in every application, even without a database.',
        ],
        why: 'Auto-configuration reacts to the class path: adding a data starter activates the `DataSource` configuration, which needs a URL unless an embedded database (H2, HSQLDB, Derby) is present. Set the `spring.datasource.*` properties for the intended profile, add the driver, or remove the starter if the service has no database. The message is about configuration, not a failed connection.',
      },
      {
        key: 'conditions-report',
        question:
          'You expected Spring Boot to auto-configure a bean, but it is missing and nothing fails. What is the most direct way to find out why?',
        correct:
          'Start the application with `--debug` (or `debug=true`) and read the conditions evaluation report, which lists positive and negative matches with the reason for each.',
        wrong: [
          'Set the root logging level to `TRACE` and search the log for the bean name.',
          'Add `@ComponentScan` for the auto-configuration package so that it is forced to load.',
          'Remove `@EnableAutoConfiguration` and declare every bean manually to compare.',
        ],
        why: 'The conditions evaluation report shows, for each auto-configuration, which `@Conditional...` checks matched or not (a missing class, an existing bean, a property). The Actuator `conditions` endpoint exposes the same report at run time. Component-scanning auto-configuration classes bypasses their ordering and conditions and causes subtle bugs.',
      },
    ],
  ),
  ...b.output(
    'sb-boot-startup-events',
    5,
    [
      'Spring Boot publishes events at fixed points of `run`: the context is started, then the runners execute, then the application is ready.',
    ],
    [
      {
        key: 'shutdown',
        code: `import org.springframework.boot.*;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.*;
import org.springframework.context.event.*;
import jakarta.annotation.PreDestroy;

public class Main {
    public static void main(String[] args) {
        var ctx = new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .run();
        System.out.println("shutting down");
        ctx.close();
        System.out.println("closed");
    }
}

@SpringBootConfiguration
class App {
    @EventListener(ContextClosedEvent.class)
    void closing() { System.out.println("context closing"); }

    @Bean
    ConnectionPool pool() { return new ConnectionPool(); }
}

class ConnectionPool {
    @PreDestroy
    void close() { System.out.println("pool closed"); }
}`,
        output: 'shutting down\ncontext closing\npool closed\nclosed',
        why: 'Closing the context first publishes `ContextClosedEvent` while all beans are still usable, then destroys the singletons, calling `@PreDestroy` methods. Listeners for the closed event are the place to stop accepting work; resources are released afterwards. Spring Boot also registers a JVM shutdown hook that performs the same close when the process receives SIGTERM.',
      },
      {
        key: 'started-runner-ready',
        code: `import org.springframework.boot.*;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.event.*;
import org.springframework.context.annotation.*;
import org.springframework.context.event.EventListener;

public class Main {
    public static void main(String[] args) {
        new SpringApplicationBuilder(App.class)
            .web(WebApplicationType.NONE)
            .run();
        System.out.println("main continues");
    }
}

@SpringBootConfiguration
class App {
    App() { System.out.println("context starting"); }

    @EventListener(ApplicationReadyEvent.class)
    void ready() { System.out.println("ready"); }

    @EventListener(ApplicationStartedEvent.class)
    void started() { System.out.println("started"); }

    @Bean
    CommandLineRunner runner() {
        return args -> System.out.println("runner");
    }
}`,
        output: 'context starting\nstarted\nrunner\nready\nmain continues',
        why: '`ApplicationStartedEvent` is published once the context is refreshed, before the runners; `ApplicationReadyEvent` after the runners, when the application is ready to serve. Work such as warming caches that must not delay readiness usually listens for `ApplicationReadyEvent`.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Dependency injection

export const dependencyInjectionFamilies: readonly QuestionSource[] = [
  ...b.output(
    'sb-di-constructor-injection',
    1,
    ['Spring calls the only constructor and passes the beans that match its parameter types.'],
    [
      {
        key: 'chain',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(
            PriceRepository.class, TaxCalculator.class, CheckoutService.class);
        System.out.println(ctx.getBean(CheckoutService.class).total("book"));
    }
}

class PriceRepository {
    int priceOf(String item) { return item.equals("book") ? 50 : 10; }
}

class TaxCalculator {
    int withTax(int amount) { return amount + amount / 5; }
}

class CheckoutService {
    private final PriceRepository prices;
    private final TaxCalculator tax;

    CheckoutService(PriceRepository prices, TaxCalculator tax) {
        this.prices = prices;
        this.tax = tax;
    }

    int total(String item) { return tax.withTax(prices.priceOf(item)); }
}`,
        output: '60',
        why: 'A class with a single constructor needs no `@Autowired`: Spring resolves each parameter by type and passes the beans in. The order in which the classes are registered does not matter; Spring creates dependencies first.',
      },
      {
        key: 'shared-dependency',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(
            Inventory.class, OrderService.class, RestockService.class);
        ctx.getBean(OrderService.class).order(3);
        ctx.getBean(RestockService.class).restock(5);
        System.out.println(ctx.getBean(Inventory.class).stock());
    }
}

class Inventory {
    private int stock = 10;
    void change(int delta) { stock += delta; }
    int stock() { return stock; }
}

class OrderService {
    private final Inventory inventory;
    OrderService(Inventory inventory) { this.inventory = inventory; }
    void order(int quantity) { inventory.change(-quantity); }
}

class RestockService {
    private final Inventory inventory;
    RestockService(Inventory inventory) { this.inventory = inventory; }
    void restock(int quantity) { inventory.change(quantity); }
}`,
        output: '12',
        why: 'Both services receive the same singleton `Inventory`, so 10 - 3 + 5 = 12. This also shows why singletons must be thread-safe when they hold state: every request shares them.',
      },
    ],
  ),
  ...b.fails(
    'sb-di-missing-bean',
    2,
    'The message names the constructor parameter whose type has no bean.',
    [
      {
        key: 'forgot-register',
        question: 'The application fails at startup. What is wrong?',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(NotificationService.class);
        ctx.getBean(NotificationService.class).notify("ann");
    }
}

class EmailSender {
    void send(String to) { System.out.println("mail to " + to); }
}

class NotificationService {
    private final EmailSender sender;
    NotificationService(EmailSender sender) { this.sender = sender; }
    void notify(String user) { sender.send(user); }
}`,
        error: "No qualifying bean of type 'EmailSender' available",
        correct:
          '`EmailSender` is not a bean, so the constructor parameter cannot be satisfied; register it (or declare it with `@Bean`).',
        wrong: [
          'Spring needs `@Autowired` on the constructor before it injects anything.',
          'Spring should create `EmailSender` automatically with `new`, so the class must be missing a default constructor.',
          '`notify` clashes with `Object.notify()`, which confuses Spring’s proxying.',
        ],
        why: 'Spring only injects beans it manages; it never instantiates arbitrary parameter types. The `UnsatisfiedDependencyException` says which parameter of which bean failed and that no bean of type `EmailSender` exists. A single constructor is used without `@Autowired`.',
      },
      {
        key: 'interface-without-impl',
        question: 'This service depends on an interface. Why does startup fail?',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(AppConfig.class, ReportService.class);
        System.out.println(ctx.getBean(ReportService.class).report());
    }
}

interface ReportStore {
    String load();
}

class FileReportStore implements ReportStore {
    public String load() { return "from file"; }
}

@Configuration
class AppConfig {
    FileReportStore fileReportStore() {
        return new FileReportStore();
    }
}

class ReportService {
    private final ReportStore store;
    ReportService(ReportStore store) { this.store = store; }
    String report() { return store.load(); }
}`,
        error: "No qualifying bean of type 'ReportStore' available",
        correct:
          'The factory method lacks `@Bean`, so no `ReportStore` implementation is registered.',
        wrong: [
          'Spring cannot inject interfaces; the parameter must be declared as `FileReportStore`.',
          'The configuration class must be registered after `ReportService`.',
          'The `@Bean` method must return the interface type `ReportStore`, not the implementation.',
        ],
        why: 'Without `@Bean`, `fileReportStore()` is an ordinary method that Spring never calls. Injecting by interface is the normal practice and works as soon as one bean implements it, whatever the declared return type of the `@Bean` method. Registration order does not matter.',
      },
    ],
  ),
  ...b.fails('sb-di-ambiguous', 3, 'Count how many beans match the parameter type.', [
    {
      key: 'two-implementations',
      question: 'The application has two payment gateways. Why does startup fail?',
      code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(
            CardGateway.class, PayPalGateway.class, CheckoutService.class);
        System.out.println(ctx.getBean(CheckoutService.class).pay(20));
    }
}

interface PaymentGateway { String charge(int amount); }

class CardGateway implements PaymentGateway {
    public String charge(int amount) { return "card " + amount; }
}

class PayPalGateway implements PaymentGateway {
    public String charge(int amount) { return "paypal " + amount; }
}

class CheckoutService {
    private final PaymentGateway gateway;
    CheckoutService(PaymentGateway gateway) { this.gateway = gateway; }
    String pay(int amount) { return gateway.charge(amount); }
}`,
      error: 'expected single matching bean but found 2: cardGateway,payPalGateway',
      correct:
        'Two beans implement `PaymentGateway`, so Spring cannot choose; mark one `@Primary` or select one with `@Qualifier`.',
      wrong: [
        'Spring picks the first registered implementation, so the error must come from `PayPalGateway`.',
        'Interfaces with more than one implementation cannot be beans at all.',
        '`CheckoutService` must be registered before the gateways.',
      ],
      why: 'Injection by type needs exactly one candidate. With two, Spring throws `NoUniqueBeanDefinitionException` (wrapped in `UnsatisfiedDependencyException`) and lists both bean names. It never picks one silently; `@Primary`, `@Qualifier` or injecting a `List<PaymentGateway>` resolve it.',
    },
    {
      key: 'two-bean-methods',
      question: 'Two `DataSource`-like beans are declared. Why does the repository fail to start?',
      code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(AppConfig.class);
        System.out.println(ctx.getBean(OrderRepository.class).url());
    }
}

record DbConfig(String url) {}

record OrderRepository(DbConfig db) {
    String url() { return db.url(); }
}

@Configuration
class AppConfig {
    @Bean DbConfig primaryDb() { return new DbConfig("jdbc:orders"); }
    @Bean DbConfig reportingDb() { return new DbConfig("jdbc:reports"); }

    @Bean OrderRepository orderRepository(DbConfig db) { return new OrderRepository(db); }
}`,
      error: 'expected single matching bean but found 2: primaryDb,reportingDb',
      correct:
        'The parameter `DbConfig db` matches both beans; annotate it `@Qualifier("primaryDb")` (or mark `primaryDb` as `@Primary`).',
      wrong: [
        'Records cannot be injected; `OrderRepository` must be a class.',
        'Spring matches parameters to beans by position, so the second bean is ambiguous.',
        'Two `@Bean` methods may not return the same type in one configuration class.',
      ],
      why: 'Parameters of `@Bean` methods are resolved by type like constructor parameters. Two `DbConfig` beans exist and the parameter name `db` matches neither bean name, so the lookup is ambiguous. Declaring several beans of one type is fine; you just have to say which one each injection point wants.',
    },
  ]),
  ...b.output(
    'sb-di-primary-qualifier',
    3,
    [
      '`@Primary` sets the default among several candidates; `@Qualifier` at the injection point overrides it.',
    ],
    [
      {
        key: 'primary',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(AppConfig.class, CheckoutService.class);
        System.out.println(ctx.getBean(CheckoutService.class).pay(20));
    }
}

interface PaymentGateway { String charge(int amount); }

@Configuration
class AppConfig {
    @Bean
    PaymentGateway cardGateway() { return amount -> "card " + amount; }

    @Bean
    @Primary
    PaymentGateway walletGateway() { return amount -> "wallet " + amount; }
}

class CheckoutService {
    private final PaymentGateway gateway;
    CheckoutService(PaymentGateway gateway) { this.gateway = gateway; }
    String pay(int amount) { return gateway.charge(amount); }
}`,
        output: 'wallet 20',
        why: 'Two beans match, but `walletGateway` is `@Primary`, so it is injected wherever a single `PaymentGateway` is needed. Declaration order plays no role.',
      },
      {
        key: 'qualifier-beats-primary',
        code: `import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(AppConfig.class, RefundService.class);
        System.out.println(ctx.getBean(RefundService.class).refund(5));
    }
}

interface PaymentGateway { String charge(int amount); }

@Configuration
class AppConfig {
    @Bean
    PaymentGateway cardGateway() { return amount -> "card " + amount; }

    @Bean
    @Primary
    PaymentGateway walletGateway() { return amount -> "wallet " + amount; }
}

class RefundService {
    private final PaymentGateway gateway;
    RefundService(@Qualifier("cardGateway") PaymentGateway gateway) { this.gateway = gateway; }
    String refund(int amount) { return gateway.charge(-amount); }
}`,
        output: 'card -5',
        why: '`@Qualifier("cardGateway")` names the bean explicitly, which takes precedence over `@Primary`. `@Primary` is only the default for injection points that do not say which bean they want.',
      },
      {
        key: 'list-injection',
        code: `import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(
            StockCheck.class, FraudCheck.class, AddressCheck.class, OrderValidator.class);
        System.out.println(ctx.getBean(OrderValidator.class).run());
    }
}

interface OrderCheck { String name(); }

@Order(3) class StockCheck implements OrderCheck { public String name() { return "stock"; } }
@Order(1) class FraudCheck implements OrderCheck { public String name() { return "fraud"; } }
@Order(2) class AddressCheck implements OrderCheck { public String name() { return "address"; } }

class OrderValidator {
    private final List<OrderCheck> checks;
    OrderValidator(List<OrderCheck> checks) { this.checks = checks; }
    List<String> run() { return checks.stream().map(OrderCheck::name).toList(); }
}`,
        output: '[fraud, address, stock]',
        why: 'Injecting `List<OrderCheck>` collects every bean of that type, so several implementations are not ambiguous here. The list is sorted by `@Order` (lowest first), which makes it a clean way to build a pipeline of checks or handlers.',
      },
    ],
  ),
  ...b.output(
    'sb-di-optional-dependencies',
    2,
    [
      'An injection point can say that a dependency is optional instead of failing when no bean exists.',
    ],
    [
      {
        key: 'optional',
        code: `import org.springframework.context.annotation.*;
import java.util.Optional;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(SignupService.class);
        System.out.println(ctx.getBean(SignupService.class).signup("ann"));
    }
}

interface WelcomeMailer { void send(String user); }

class SignupService {
    private final Optional<WelcomeMailer> mailer;
    SignupService(Optional<WelcomeMailer> mailer) { this.mailer = mailer; }

    String signup(String user) {
        mailer.ifPresent(m -> m.send(user));
        return user + " registered, mail " + (mailer.isPresent() ? "sent" : "skipped");
    }
}`,
        output: 'ann registered, mail skipped',
        why: 'An `Optional<T>` parameter is satisfied with `Optional.empty()` when no bean of type `T` exists, so the service starts without a mailer. A plain `WelcomeMailer` parameter would fail with “No qualifying bean”.',
      },
      {
        key: 'object-provider',
        code: `import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(AppConfig.class, PricingService.class);
        System.out.println(ctx.getBean(PricingService.class).price(100));
    }
}

interface DiscountPolicy { int apply(int price); }

@Configuration
class AppConfig {
    @Bean
    DiscountPolicy blackFriday() { return price -> price / 2; }
}

class PricingService {
    private final DiscountPolicy discount;

    PricingService(ObjectProvider<DiscountPolicy> discount) {
        this.discount = discount.getIfAvailable(() -> price -> price);
    }

    int price(int base) { return discount.apply(base); }
}`,
        output: '50',
        why: '`ObjectProvider.getIfAvailable(fallback)` returns the bean when one exists and the fallback otherwise. Here the `blackFriday` policy is registered, so the price is halved; without it the identity fallback would return 100.',
      },
    ],
  ),
  ...b.fails(
    'sb-di-circular',
    4,
    'Follow the chain of constructor parameters: can Spring create either object first?',
    [
      {
        key: 'two-services',
        question: 'Two services need each other. Why does the application fail to start?',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(OrderService.class, CustomerService.class);
        System.out.println("started");
    }
}

class OrderService {
    private final CustomerService customers;
    OrderService(CustomerService customers) { this.customers = customers; }
    String ordersOf(String id) { return "orders of " + id; }
}

class CustomerService {
    private final OrderService orders;
    CustomerService(OrderService orders) { this.orders = orders; }
    String summary(String id) { return orders.ordersOf(id); }
}`,
        error: 'Is there an unresolvable circular reference',
        correct:
          'Each constructor needs the other bean first, a circular dependency; remove the cycle, for example by extracting the shared logic into a third bean.',
        wrong: [
          'Spring creates beans in registration order, so swapping the two classes fixes it.',
          'Spring cannot inject a bean into more than one other bean.',
          'Constructor injection is not allowed between two services; use static fields.',
        ],
        why: 'To build `OrderService` Spring needs `CustomerService`, which needs `OrderService`, which is still being created: `BeanCurrentlyInCreationException`. Changing the order does not help. A cycle usually means the responsibilities are tangled; extracting the shared part into a separate bean breaks it. `@Lazy` on one parameter (a lazy proxy) works too, but hides the design problem.',
      },
      {
        key: 'three-way',
        question: 'This chain of three beans fails at startup. What is the cause?',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(Billing.class, Shipping.class, Notifier.class);
        System.out.println("started");
    }
}

class Billing {
    Billing(Shipping shipping) {}
}

class Shipping {
    Shipping(Notifier notifier) {}
}

class Notifier {
    Notifier(Billing billing) {}
}`,
        error: 'Requested bean is currently in creation',
        correct:
          '`Billing` needs `Shipping`, which needs `Notifier`, which needs `Billing` again: a cycle across three beans; one of the dependencies must go.',
        wrong: [
          'A bean may have at most two levels of dependencies.',
          'The constructors are empty, so Spring cannot tell which beans to inject.',
          'Package-private classes cannot be injected into each other.',
        ],
        why: 'Cycles can span any number of beans. Spring detects the bean that is requested while it is still being created and reports “Requested bean is currently in creation”. Since Spring Boot 2.6 circular references are prohibited by default even with field injection, so fixing the design is the way out.',
      },
    ],
  ),
  ...b.output(
    'sb-di-scope-mismatch',
    4,
    ['A dependency is injected once, when the singleton that needs it is created.'],
    [
      {
        key: 'prototype-in-singleton',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(AppConfig.class, ReportService.class);
        ReportService service = ctx.getBean(ReportService.class);
        service.add("a");
        service.add("b");
        System.out.println(service.lines());
    }
}

class ReportBuilder {
    private final StringBuilder text = new StringBuilder();
    void line(String s) { text.append(s); }
    String text() { return text.toString(); }
}

@Configuration
class AppConfig {
    @Bean
    @Scope("prototype")
    ReportBuilder reportBuilder() { return new ReportBuilder(); }
}

class ReportService {
    private final ReportBuilder builder;
    ReportService(ReportBuilder builder) { this.builder = builder; }

    void add(String line) { builder.line(line); }
    String lines() { return builder.text(); }
}`,
        output: 'ab',
        why: 'The singleton `ReportService` receives one `ReportBuilder` when it is constructed and keeps it. The prototype scope only means a new instance per injection point or lookup, not per method call, so both calls append to the same builder.',
      },
      {
        key: 'scoped-proxy',
        question:
          'The prototype bean is now injected through a scoped proxy. What does this program print?',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(AppConfig.class, ReportService.class);
        ReportService service = ctx.getBean(ReportService.class);
        service.add("a");
        service.add("b");
        System.out.println("[" + service.lines() + "]");
    }
}

class ReportBuilder {
    private final StringBuilder text = new StringBuilder();
    void line(String s) { text.append(s); }
    String text() { return text.toString(); }
}

@Configuration
class AppConfig {
    @Bean
    @Scope(value = "prototype", proxyMode = ScopedProxyMode.TARGET_CLASS)
    ReportBuilder reportBuilder() { return new ReportBuilder(); }
}

class ReportService {
    private final ReportBuilder builder;
    ReportService(ReportBuilder builder) { this.builder = builder; }

    void add(String line) { builder.line(line); }
    String lines() { return builder.text(); }
}`,
        output: '[]',
        why: 'The service receives a proxy, and every method call on a prototype-scoped proxy asks the context for a new instance. Each `line` call appends to a fresh builder that is then discarded, and `text()` reads yet another empty one. Scoped proxies suit request or session scopes; for “a new object per unit of work”, use `ObjectProvider.getObject()` and keep the instance while you use it.',
      },
      {
        key: 'object-provider-fresh',
        code: `import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(AppConfig.class, ReportService.class);
        ReportService service = ctx.getBean(ReportService.class);
        System.out.println(service.build("a"));
        System.out.println(service.build("b"));
    }
}

class ReportBuilder {
    private final StringBuilder text = new StringBuilder();
    void line(String s) { text.append(s); }
    String text() { return text.toString(); }
}

@Configuration
class AppConfig {
    @Bean
    @Scope("prototype")
    ReportBuilder reportBuilder() { return new ReportBuilder(); }
}

class ReportService {
    private final ObjectProvider<ReportBuilder> builders;
    ReportService(ObjectProvider<ReportBuilder> builders) { this.builders = builders; }

    String build(String line) {
        ReportBuilder builder = builders.getObject();
        builder.line(line);
        return builder.text();
    }
}`,
        output: 'a\nb',
        why: 'Injecting an `ObjectProvider` instead of the bean lets the singleton ask for a new prototype each time it calls `getObject()`. Each report starts with an empty builder.',
      },
    ],
  ),
  ...b.fails(
    'sb-di-new-bypasses-spring',
    3,
    'Which object did Spring create, and which one did the code create itself?',
    [
      {
        key: 'field-injection-new',
        question: 'A developer creates the service with `new` in a quick test. Why does it throw?',
        code: `import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(Clock.class, GreetingService.class);
        GreetingService service = new GreetingService();
        System.out.println(service.greet("Ada"));
    }
}

class Clock {
    String partOfDay() { return "morning"; }
}

class GreetingService {
    @Autowired
    private Clock clock;

    String greet(String name) { return "Good " + clock.partOfDay() + ", " + name; }
}`,
        error: 'NullPointerException',
        correct:
          'Only beans created by Spring get their `@Autowired` fields injected; this `new GreetingService()` has a `null` clock. Use the bean from the context, and prefer constructor injection so a missing dependency cannot go unnoticed.',
        wrong: [
          '`@Autowired` fields must be `public` for Spring to set them.',
          'The `Clock` bean is created lazily, after `greet` is called.',
          'Field injection only works in classes annotated with `@Service`.',
        ],
        why: 'Spring injects dependencies into the objects it creates. An object built with `new` is invisible to the container, so its `@Autowired` field stays `null`. With constructor injection the dependency is a required argument, so `new GreetingService()` would not even compile, and tests pass a fake in explicitly.',
      },
      {
        key: 'new-inside-bean',
        question: 'The controller builds its service itself. Why does the request fail?',
        code: `import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(TaxRates.class, InvoiceController.class);
        System.out.println(ctx.getBean(InvoiceController.class).total(100));
    }
}

class TaxRates {
    int percent() { return 20; }
}

class InvoiceService {
    @Autowired
    TaxRates rates;

    int total(int net) { return net + net * rates.percent() / 100; }
}

class InvoiceController {
    private final InvoiceService service = new InvoiceService();

    int total(int net) { return service.total(net); }
}`,
        error: 'NullPointerException',
        correct:
          '`InvoiceService` is created with `new`, not by Spring, so `rates` is never injected; make `InvoiceService` a bean and inject it through the controller’s constructor.',
        wrong: [
          '`TaxRates` must be registered before `InvoiceController`.',
          'Spring injects `@Autowired` fields only after the first request, so the first call always fails.',
          'An `int` result cannot be computed from a bean method; return `Integer`.',
        ],
        why: 'Even inside a bean, `new` creates an unmanaged object. `InvoiceService` is not registered and is not created by the container, so its field stays `null`. Dependencies should be injected, not constructed, so the container controls their wiring.',
      },
    ],
  ),
  ...b.codeChoice(
    'sb-di-injection-style',
    5,
    'Compare what each style guarantees about a fully initialized, testable object.',
    [
      {
        key: 'constructor-vs-field',
        question:
          'A team debates the injection style of this service. Which statement best explains why constructor injection is recommended over the commented-out field injection?',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(Ledger.class, TransferService.class);
        System.out.println(ctx.getBean(TransferService.class).transfer(10));
        // In a unit test, no Spring context is needed:
        System.out.println(new TransferService(new Ledger()).transfer(5));
    }
}

class Ledger {
    int record(int amount) { return amount; }
}

class TransferService {
    // @Autowired private Ledger ledger;   // field injection
    private final Ledger ledger;           // constructor injection

    TransferService(Ledger ledger) { this.ledger = ledger; }

    String transfer(int amount) { return "recorded " + ledger.record(amount); }
}`,
        correct:
          'The dependency is a required, `final` constructor argument: the object can never exist half-initialized, and tests can create it with `new` and a fake without Spring or reflection.',
        wrong: [
          'Constructor injection is faster at run time because Spring skips reflection for every method call.',
          'Field injection does not work for classes registered with `AnnotationConfigApplicationContext`.',
          'Constructor injection lets Spring resolve circular dependencies automatically.',
        ],
        why: 'Both styles work at run time, and injection happens once at startup, not per call. Constructor injection makes dependencies explicit and mandatory, allows `final` fields and immutability, and makes plain unit tests trivial (as the second line of `main` shows). It also makes circular dependencies fail fast rather than resolving them.',
      },
      {
        key: 'too-many-dependencies',
        question:
          'This constructor keeps growing. What does the growing parameter list most likely tell you?',
        code: `import org.springframework.context.annotation.*;

public class Main {
    public static void main(String[] args) {
        var ctx = new AnnotationConfigApplicationContext(
            Orders.class, Payments.class, Invoices.class, Mailer.class, Reports.class, Ratings.class, OrderFacade.class);
        System.out.println(ctx.getBean(OrderFacade.class).dependencies());
    }
}

class Orders {}
class Payments {}
class Invoices {}
class Mailer {}
class Reports {}
class Ratings {}

class OrderFacade {
    private final int count;

    OrderFacade(Orders o, Payments p, Invoices i, Mailer m, Reports r, Ratings ra) {
        this.count = 6;
    }

    int dependencies() { return count; }
}`,
        correct:
          'The class has too many responsibilities; split it into smaller services, each with the few dependencies it really needs.',
        wrong: [
          'Spring limits constructors to five parameters, so switch to field injection.',
          'The parameters should be bundled into a `Map<String, Object>` bean.',
          'Mark the constructor `@Autowired` so that Spring can inject more than four beans.',
        ],
        why: 'Spring injects any number of constructor parameters; the program runs fine. A long constructor is a design smell that field injection would only hide: a class that needs six collaborators probably does several jobs. Splitting it improves cohesion and testability.',
      },
    ],
  ),
];
