import type { QuestionSource } from '@pracstack/content-model';
import { plain } from '../helpers';
import { programBuilders } from '../program-builders';

/*
 * REST APIs, HTTP behavior, DTOs and validation, exception handling. The
 * programs drive real Spring MVC controllers through MockMvc (standalone
 * setup), so status codes, headers and JSON bodies are what Spring produces.
 */

const b = programBuilders('java');

/** Imports shared by the MockMvc programs (shown to the learner as part of the code). */
const MVC = `import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;`;

/** The same, plus the base class that turns Spring MVC exceptions into ProblemDetail responses. */
const MVC_PROBLEMS = `${MVC}
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;`;

// ---------------------------------------------------------------- REST controllers

export const restControllerFamilies: readonly QuestionSource[] = [
  ...b.output(
    'sb-rest-path-variable',
    1,
    [
      'A `{name}` segment in the mapping is bound to the `@PathVariable` parameter; a returned record is written as JSON.',
    ],
    [
      {
        key: 'get-by-id',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new BookController()).build();
        var response = mvc.perform(get("/api/books/7")).andReturn().getResponse();
        System.out.println(response.getStatus());
        System.out.println(response.getContentAsString());
    }
}

record Book(long id, String title) {}

@RestController
@RequestMapping("/api/books")
class BookController {
    @GetMapping("/{id}")
    Book one(@PathVariable long id) {
        return new Book(id, "Book " + id);
    }
}`,
        output: '200\n{"id":7,"title":"Book 7"}',
        why: '`/api/books/7` matches the class-level `/api/books` plus the method-level `/{id}`, and `"7"` is converted to `long`. `@RestController` writes the returned record as JSON with status 200.',
      },
      {
        key: 'two-variables',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new OrderController()).build();
        var response = mvc.perform(get("/customers/c42/orders/1001")).andReturn().getResponse();
        System.out.println(response.getContentAsString());
    }
}

@RestController
class OrderController {
    @GetMapping("/customers/{customerId}/orders/{orderId}")
    String order(@PathVariable String customerId, @PathVariable("orderId") int number) {
        return customerId + ":" + (number + 1);
    }
}`,
        output: 'c42:1002',
        why: 'Each template variable is bound by name: `customerId` matches the parameter name, and `@PathVariable("orderId")` binds the second segment to a parameter with a different name. The value is converted to `int`, so `number + 1` is arithmetic, not string concatenation. A `String` return value is written as plain text.',
      },
    ],
  ),
  ...b.output(
    'sb-rest-request-param',
    2,
    ['`@RequestParam` reads the query string. Look at `required` and `defaultValue`.'],
    [
      {
        key: 'default-value',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ProductController()).build();
        System.out.println(mvc.perform(get("/products")).andReturn().getResponse().getContentAsString());
        System.out.println(mvc.perform(get("/products?page=3&size=5")).andReturn().getResponse().getContentAsString());
    }
}

@RestController
class ProductController {
    @GetMapping("/products")
    String list(@RequestParam(defaultValue = "0") int page,
                @RequestParam(defaultValue = "20") int size) {
        return "page " + page + ", size " + size;
    }
}`,
        output: 'page 0, size 20\npage 3, size 5',
        why: 'A `defaultValue` makes the parameter optional and is used (converted to `int`) when the query string does not contain it. When the request supplies the value, it wins.',
      },
      {
        key: 'optional-null',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new SearchController()).build();
        System.out.println(mvc.perform(get("/search")).andReturn().getResponse().getContentAsString());
        System.out.println(mvc.perform(get("/search?q=boots")).andReturn().getResponse().getContentAsString());
    }
}

@RestController
class SearchController {
    @GetMapping("/search")
    String search(@RequestParam(required = false) String q) {
        return q == null ? "all products" : "results for " + q;
    }
}`,
        output: 'all products\nresults for boots',
        why: '`required = false` lets the parameter be absent; Spring then passes `null`. Without it, a missing `q` would make Spring reject the request with 400 before the method runs.',
      },
      {
        key: 'list-param',
        code: `${MVC}
import java.util.List;

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ProductController()).build();
        System.out.println(mvc.perform(get("/products?tag=red&tag=sale")).andReturn().getResponse().getContentAsString());
        System.out.println(mvc.perform(get("/products?tag=red,sale")).andReturn().getResponse().getContentAsString());
    }
}

@RestController
class ProductController {
    @GetMapping("/products")
    String byTags(@RequestParam List<String> tag) {
        return tag.size() + " " + tag;
    }
}`,
        output: '2 [red, sale]\n2 [red, sale]',
        why: 'A `List` parameter collects repeated parameters (`tag=red&tag=sale`), and Spring’s conversion also splits a single comma-separated value into list elements. Both requests bind the same two tags.',
      },
    ],
  ),
  ...b.output(
    'sb-rest-request-body',
    2,
    ['`@RequestBody` converts the JSON request body into the parameter type with Jackson.'],
    [
      {
        key: 'post-json',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new TaskController()).build();
        var response = mvc.perform(post("/tasks")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"title": "Write tests", "priority": 2}
                    """))
            .andReturn().getResponse();
        System.out.println(response.getContentAsString());
    }
}

record NewTask(String title, int priority) {}
record Task(int id, String title, boolean urgent) {}

@RestController
class TaskController {
    @PostMapping("/tasks")
    Task create(@RequestBody NewTask request) {
        return new Task(1, request.title(), request.priority() <= 2);
    }
}`,
        output: '{"id":1,"title":"Write tests","urgent":true}',
        why: 'Jackson maps the JSON properties to the record components by name. The response is a different record, so the API controls exactly which fields go out: a request DTO and a response DTO.',
      },
      {
        key: 'unknown-property',
        question:
          'The client sends a property the DTO does not have. What does this program print?',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new AccountController()).build();
        var response = mvc.perform(post("/accounts")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"email": "ann@example.com", "admin": true}
                    """))
            .andReturn().getResponse();
        System.out.println(response.getStatus() + " " + response.getContentAsString());
    }
}

record SignupRequest(String email) {}

@RestController
class AccountController {
    @PostMapping("/accounts")
    String signup(@RequestBody SignupRequest request) {
        return "created " + request.email();
    }
}`,
        output: '200 created ann@example.com',
        why: 'Spring configures Jackson to ignore unknown properties, so `admin` is dropped and the request succeeds. That is one reason to bind requests to a DTO that only contains the fields a client may set: an `admin` flag cannot sneak into the domain object.',
      },
    ],
  ),
  ...b.blank(
    'sb-rest-annotations-blank',
    2,
    'One annotation reads a URL segment, one reads the query string, one reads the body.',
    [
      {
        key: 'path-and-body',
        prompt: 'Complete the controller so that `PUT /notes/3` with a JSON body updates note 3.',
        template: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new NoteController()).build();
        var response = mvc.perform(put("/notes/3")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\\"text\\": \\"buy milk\\"}"))
            .andReturn().getResponse();
        System.out.println(response.getStatus() + " " + response.getContentAsString());
    }
}

record NoteText(String text) {}

@RestController
class NoteController {
    @{{blank:mapping}}("/notes/{id}")
    String update(@{{blank:id}} long id, @{{blank:body}} NoteText note) {
        return id + ": " + note.text();
    }
}`,
        blanks: { mapping: ['PutMapping'], id: ['PathVariable'], body: ['RequestBody'] },
        why: '`@PutMapping` maps HTTP PUT, `@PathVariable` binds `{id}` from the URL and `@RequestBody` reads the JSON body into the DTO. `@RequestParam` would look for `?id=` in the query string instead.',
      },
      {
        key: 'query-param',
        prompt:
          'Complete the controller so that `GET /reports?year=2025` returns the report for that year.',
        template: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ReportController()).build();
        System.out.println(mvc.perform(get("/reports?year=2025")).andReturn().getResponse().getContentAsString());
    }
}

@{{blank:controller}}
class ReportController {
    @{{blank:mapping}}("/reports")
    String report(@{{blank:param}} int year) {
        return "report " + year;
    }
}`,
        blanks: {
          controller: ['RestController'],
          mapping: ['GetMapping'],
          param: ['RequestParam'],
        },
        why: '`@RestController` makes return values the response body, `@GetMapping` maps HTTP GET, and `@RequestParam` binds `year` from the query string. With `@Controller` alone, the returned string would be treated as a view name.',
      },
    ],
  ),
  ...b.output(
    'sb-rest-mapping-resolution',
    3,
    [
      'The class-level mapping is a prefix for every method. When several patterns match, the most specific one wins.',
    ],
    [
      {
        key: 'class-prefix-methods',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new OrderController()).build();
        System.out.println(mvc.perform(get("/api/orders")).andReturn().getResponse().getContentAsString());
        System.out.println(mvc.perform(post("/api/orders")).andReturn().getResponse().getContentAsString());
        System.out.println(mvc.perform(delete("/api/orders/5")).andReturn().getResponse().getContentAsString());
    }
}

@RestController
@RequestMapping("/api/orders")
class OrderController {
    @GetMapping
    String list() { return "list"; }

    @PostMapping
    String create() { return "create"; }

    @DeleteMapping("/{id}")
    String delete(@PathVariable long id) { return "delete " + id; }
}`,
        output: 'list\ncreate\ndelete 5',
        why: 'The same path `/api/orders` maps to different methods depending on the HTTP method. `@GetMapping` without a value inherits just the class-level path, and `/{id}` is appended to it for the delete.',
      },
      {
        key: 'literal-beats-variable',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new FileController()).build();
        System.out.println(mvc.perform(get("/files/summary")).andReturn().getResponse().getContentAsString());
        System.out.println(mvc.perform(get("/files/q3-report")).andReturn().getResponse().getContentAsString());
    }
}

@RestController
class FileController {
    @GetMapping("/files/{name}")
    String file(@PathVariable String name) { return "file " + name; }

    @GetMapping("/files/summary")
    String summary() { return "summary of all files"; }
}`,
        output: 'summary of all files\nfile q3-report',
        why: 'Both patterns match `/files/summary`, and Spring picks the more specific one: a literal segment beats a URI variable, whatever the declaration order. Other names only match the variable pattern.',
      },
      {
        key: 'params-condition',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ExportController()).build();
        System.out.println(mvc.perform(get("/export?format=csv")).andReturn().getResponse().getContentAsString());
        System.out.println(mvc.perform(get("/export")).andReturn().getResponse().getContentAsString());
    }
}

@RestController
class ExportController {
    @GetMapping(value = "/export", params = "format=csv")
    String csv() { return "csv export"; }

    @GetMapping("/export")
    String json() { return "json export"; }
}`,
        output: 'csv export\njson export',
        why: 'A mapping with a `params` condition is more specific than one without it, so the request with `format=csv` goes to `csv()`. Without the parameter only the unconditional mapping matches.',
      },
    ],
  ),
  ...b.fails(
    'sb-rest-controller-annotation',
    3,
    'Which annotation makes a method’s return value the response body?',
    [
      {
        key: 'controller-string',
        question: 'This endpoint should return the text "pong", but the request fails. Why?',
        code: `${MVC}
import org.springframework.stereotype.Controller;

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new PingController()).build();
        System.out.println(mvc.perform(get("/ping")).andReturn().getResponse().getContentAsString());
    }
}

@Controller
class PingController {
    @GetMapping("/ping")
    String ping() {
        return "ping";
    }
}`,
        error: 'Circular view path [ping]',
        correct:
          'With `@Controller`, a returned `String` is a view name, so Spring tries to render a view called "ping"; use `@RestController` (or add `@ResponseBody`).',
        wrong: [
          '`@GetMapping` methods must return `ResponseEntity`, not `String`.',
          'The method name `ping` clashes with the URL `/ping`, which causes a redirect loop.',
          'Controllers need a class-level `@RequestMapping` before method mappings work.',
        ],
        why: '`@Controller` is for server-side views: the return value names a template. Here no view resolver knows "ping", so the default one forwards to the URL `ping`, the same handler, and Spring stops with “Circular view path”. `@RestController` is `@Controller` plus `@ResponseBody`, which writes the return value to the response instead.',
      },
      {
        key: 'controller-record',
        question: 'This endpoint should return the order as JSON. Why does the request fail?',
        code: `${MVC}
import org.springframework.stereotype.Controller;

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new OrderController()).build();
        System.out.println(mvc.perform(get("/order")).andReturn().getResponse().getContentAsString());
    }
}

record Order(int id, String status) {}

@Controller
class OrderController {
    @GetMapping("/order")
    Order order() {
        return new Order(1, "NEW");
    }
}`,
        error: 'Circular view path [order]',
        correct:
          'Without `@ResponseBody`, Spring treats the returned object as model data and derives the view name from the URL; `@RestController` makes it write JSON.',
        wrong: [
          'Records cannot be serialized to JSON; return a `Map` instead.',
          'The response needs an explicit `produces = "application/json"`.',
          'Spring MVC only serializes objects with public getters such as `getId()`.',
        ],
        why: 'In a plain `@Controller`, a non-`String` return value becomes a model attribute and the view name defaults to the request path (`order`), which leads back to the same handler. With `@ResponseBody` (included in `@RestController`), Jackson writes the record as JSON; records serialize fine through their accessors.',
      },
    ],
  ),
  ...b.output(
    'sb-rest-type-conversion',
    4,
    [
      'Path variables and query parameters arrive as strings; Spring converts them to the parameter type and rejects the request when it cannot.',
    ],
    [
      {
        key: 'bad-number',
        code: `${MVC_PROBLEMS}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new OrderController())
            .setControllerAdvice(new ApiErrors())
            .build();
        System.out.println(mvc.perform(get("/orders/12")).andReturn().getResponse().getStatus());
        System.out.println(mvc.perform(get("/orders/abc")).andReturn().getResponse().getStatus());
    }
}

@RestController
class OrderController {
    @GetMapping("/orders/{id}")
    String order(@PathVariable long id) { return "order " + id; }
}

// Turns Spring MVC exceptions into ProblemDetail responses.
@RestControllerAdvice
class ApiErrors extends ResponseEntityExceptionHandler {}`,
        output: '200\n400',
        why: '`abc` cannot be converted to `long`, so Spring rejects the request with 400 Bad Request before the method runs. It is not a 404: the path matched, only the value is invalid. Not a 500 either: a client error is not a server failure.',
      },
      {
        key: 'local-date',
        code: `${MVC_PROBLEMS}
import org.springframework.format.annotation.DateTimeFormat;
import java.time.LocalDate;

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new BookingController())
            .setControllerAdvice(new ApiErrors())
            .build();
        System.out.println(mvc.perform(get("/bookings?from=2026-03-01")).andReturn().getResponse().getContentAsString());
        System.out.println(mvc.perform(get("/bookings?from=01.03.2026")).andReturn().getResponse().getStatus());
    }
}

@RestController
class BookingController {
    @GetMapping("/bookings")
    String from(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from) {
        return from.getDayOfWeek() + " " + from.plusDays(1);
    }
}

// Turns Spring MVC exceptions into ProblemDetail responses.
@RestControllerAdvice
class ApiErrors extends ResponseEntityExceptionHandler {}`,
        output: 'SUNDAY 2026-03-02\n400',
        why: '`@DateTimeFormat(iso = DATE)` tells Spring to parse `yyyy-MM-dd`, so the first request binds a real `LocalDate` (1 March 2026 is a Sunday). The German-style `01.03.2026` cannot be parsed with that format and is rejected with 400 before the method runs. ISO dates in APIs avoid locale ambiguity.',
      },
      {
        key: 'enum-case',
        code: `${MVC_PROBLEMS}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new OrderController())
            .setControllerAdvice(new ApiErrors())
            .build();
        System.out.println(mvc.perform(get("/orders?status=SHIPPED")).andReturn().getResponse().getContentAsString());
        System.out.println(mvc.perform(get("/orders?status=shipped")).andReturn().getResponse().getStatus());
    }
}

enum Status { NEW, SHIPPED, DELIVERED }

@RestController
class OrderController {
    @GetMapping("/orders")
    String byStatus(@RequestParam Status status) { return "orders " + status.ordinal(); }
}

// Turns Spring MVC exceptions into ProblemDetail responses.
@RestControllerAdvice
class ApiErrors extends ResponseEntityExceptionHandler {}`,
        output: 'orders 1\n400',
        why: 'Spring converts a string to an enum with the constant’s exact name, so `SHIPPED` works and `shipped` is rejected with 400. Accepting other spellings needs a custom `Converter` (or a lowercase-aware lookup in the code).',
      },
    ],
  ),
  ...b.output(
    'sb-rest-headers-cookies',
    4,
    [
      '`@RequestHeader` and `@CookieValue` bind like `@RequestParam`: required by default, optional with a default value.',
    ],
    [
      {
        key: 'header-default',
        code: `${MVC_PROBLEMS}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new GreetingController())
            .setControllerAdvice(new ApiErrors())
            .build();
        System.out.println(mvc.perform(get("/greeting").header("Accept-Language", "de-CH")).andReturn().getResponse().getContentAsString());
        System.out.println(mvc.perform(get("/greeting")).andReturn().getResponse().getContentAsString());
        System.out.println(mvc.perform(get("/orders")).andReturn().getResponse().getStatus());
    }
}

@RestController
class GreetingController {
    @GetMapping("/greeting")
    String greet(@RequestHeader(value = "Accept-Language", defaultValue = "en") String language) {
        return language.startsWith("de") ? "Hallo" : "Hello";
    }

    @GetMapping("/orders")
    String orders(@RequestHeader("X-Tenant") String tenant) {
        return "orders of " + tenant;
    }
}

// Turns Spring MVC exceptions into ProblemDetail responses.
@RestControllerAdvice
class ApiErrors extends ResponseEntityExceptionHandler {}`,
        output: 'Hallo\nHello\n400',
        why: 'The header value is bound as a string, and `defaultValue` covers requests without it. `X-Tenant` has no default, so a request without the header is rejected with 400 (`MissingRequestHeaderException`) before the method runs.',
      },
      {
        key: 'cookie',
        code: `${MVC_PROBLEMS}
import jakarta.servlet.http.Cookie;

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new CartController())
            .setControllerAdvice(new ApiErrors())
            .build();
        System.out.println(mvc.perform(get("/cart").cookie(new Cookie("cartId", "c-42"))).andReturn().getResponse().getContentAsString());
        System.out.println(mvc.perform(get("/cart")).andReturn().getResponse().getStatus());
        System.out.println(mvc.perform(get("/cart/size")).andReturn().getResponse().getContentAsString());
    }
}

@RestController
class CartController {
    @GetMapping("/cart")
    String cart(@CookieValue("cartId") String cartId) {
        return "cart " + cartId;
    }

    @GetMapping("/cart/size")
    String size(@CookieValue(value = "cartId", required = false) String cartId) {
        return cartId == null ? "empty cart" : "cart " + cartId + " has items";
    }
}

// Turns Spring MVC exceptions into ProblemDetail responses.
@RestControllerAdvice
class ApiErrors extends ResponseEntityExceptionHandler {}`,
        output: 'cart c-42\n400\nempty cart',
        why: '`@CookieValue` reads a cookie by name. A required cookie that is missing makes Spring answer 400 (`MissingRequestCookieException`); with `required = false` the parameter is `null` and the method decides what an absent cookie means.',
      },
    ],
  ),
  ...b.fails(
    'sb-rest-ambiguous-mapping',
    5,
    'Two handler methods may not claim exactly the same request.',
    [
      {
        key: 'duplicate-get',
        question:
          'A second endpoint was added during a refactoring. Why does `GET /customers/1` now fail?',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new CustomerController()).build();
        System.out.println(mvc.perform(get("/customers/1")).andReturn().getResponse().getContentAsString());
    }
}

@RestController
@RequestMapping("/customers")
class CustomerController {
    @GetMapping("/{id}")
    String byId(@PathVariable long id) { return "customer " + id; }

    @GetMapping("/{email}")
    String byEmail(@PathVariable String email) { return "customer " + email; }
}`,
        error: 'Ambiguous handler methods mapped for',
        correct:
          '`/{id}` and `/{email}` are the same pattern to Spring, whatever the variable names or types; give one endpoint a distinct path such as `/by-email/{email}` or use a query parameter.',
        wrong: [
          'Spring picks the method whose parameter type can be converted, so the failure must be in `Long` parsing.',
          'Two `@GetMapping` methods may not exist in the same controller.',
          'Path variables must be named `id`; `{email}` is not allowed.',
        ],
        why: 'Both patterns match every `/customers/{something}` path with the same specificity, so for `/customers/1` Spring finds two equally good handlers and fails the request with “Ambiguous handler methods mapped”. Variable names and Java types are not part of the matching, so Spring cannot choose by trying conversions. (Two methods with literally identical mappings are rejected even earlier, at startup.)',
      },
      {
        key: 'same-method-two-controllers',
        question: 'Two controllers were merged into one application. Why does the setup fail?',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ReportController(), new ExportController()).build();
        System.out.println(mvc.perform(get("/reports/daily")).andReturn().getResponse().getContentAsString());
    }
}

@RestController
class ReportController {
    @GetMapping("/reports/daily")
    String daily() { return "daily report"; }
}

@RestController
@RequestMapping("/reports")
class ExportController {
    @GetMapping("/daily")
    String dailyExport() { return "daily export"; }
}`,
        error: 'Ambiguous mapping',
        correct:
          'After combining the class-level prefix, both methods map `GET /reports/daily`; one of them needs a different path or condition.',
        wrong: [
          'Only one `@RestController` may be registered per path prefix.',
          'Class-level `@RequestMapping` is ignored when a method has `@GetMapping`, so `ExportController` maps `/daily`.',
          'Spring uses the controller registered first, so the error must come from a missing bean.',
        ],
        why: 'The effective mapping is the class-level path plus the method-level path, here `/reports/daily` in both controllers. Spring refuses duplicate mappings across controllers too, at startup, instead of silently choosing one.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- HTTP behavior

export const httpBehaviorFamilies: readonly QuestionSource[] = [
  ...b.output(
    'sb-http-response-entity',
    1,
    ['`ResponseEntity` sets the status, headers and body explicitly.'],
    [
      {
        key: 'created',
        code: `${MVC}
import java.net.URI;

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new CustomerController()).build();
        var response = mvc.perform(post("/customers")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\\"name\\": \\"Ada\\"}"))
            .andReturn().getResponse();
        System.out.println(response.getStatus());
        System.out.println(response.getHeader("Location"));
        System.out.println(response.getContentAsString());
    }
}

record NewCustomer(String name) {}
record Customer(long id, String name) {}

@RestController
class CustomerController {
    @PostMapping("/customers")
    ResponseEntity<Customer> create(@RequestBody NewCustomer request) {
        Customer saved = new Customer(15, request.name());
        return ResponseEntity.created(URI.create("/customers/" + saved.id())).body(saved);
    }
}`,
        output: '201\n/customers/15\n{"id":15,"name":"Ada"}',
        why: '`ResponseEntity.created(uri)` sets status 201 Created and the `Location` header that tells the client where the new resource lives. Returning the record directly would give 200.',
      },
      {
        key: 'not-found',
        code: `${MVC}
import java.util.Map;

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new CustomerController()).build();
        var found = mvc.perform(get("/customers/1")).andReturn().getResponse();
        var missing = mvc.perform(get("/customers/2")).andReturn().getResponse();
        System.out.println(found.getStatus() + " " + found.getContentAsString());
        System.out.println(missing.getStatus() + " [" + missing.getContentAsString() + "]");
    }
}

record Customer(long id, String name) {}

@RestController
class CustomerController {
    private final Map<Long, Customer> customers = Map.of(1L, new Customer(1, "Ada"));

    @GetMapping("/customers/{id}")
    ResponseEntity<Customer> one(@PathVariable long id) {
        Customer c = customers.get(id);
        return c == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(c);
    }
}`,
        output: '200 {"id":1,"name":"Ada"}\n404 []',
        why: '`ResponseEntity.notFound().build()` produces 404 with no body, and `ResponseEntity.ok(c)` 200 with the JSON body. Returning `null` from a plain `Customer` method would instead give 200 with an empty body, which hides the missing resource.',
      },
      {
        key: 'of-optional',
        code: `${MVC}
import java.util.Optional;

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ProductController()).build();
        System.out.println(mvc.perform(get("/products/pen")).andReturn().getResponse().getStatus());
        System.out.println(mvc.perform(get("/products/cup")).andReturn().getResponse().getStatus());
    }
}

record Product(String sku) {}

@RestController
class ProductController {
    @GetMapping("/products/{sku}")
    ResponseEntity<Product> one(@PathVariable String sku) {
        Optional<Product> product = sku.equals("pen") ? Optional.of(new Product(sku)) : Optional.empty();
        return ResponseEntity.of(product);
    }
}`,
        output: '200\n404',
        why: '`ResponseEntity.of(optional)` returns 200 with the value when present and 404 when empty, which matches repository methods such as `findById` that return `Optional`.',
      },
    ],
  ),
  ...b.multi(
    'sb-http-method-semantics',
    2,
    'Safe means no state change; idempotent means repeating the request has the same effect as sending it once.',
    [
      {
        key: 'safe-idempotent',
        question: 'Which statements about HTTP methods in a REST API are true?',
        correct: [
          '`GET` must not change server state, so it can be cached and retried freely.',
          '`PUT` replaces a resource, so sending the same `PUT` twice leaves the same state as sending it once.',
          '`DELETE` is idempotent: deleting an already deleted resource does not change the state further.',
        ],
        wrong: [
          '`POST` is idempotent, so clients may retry it automatically after a timeout without side effects.',
          '`PATCH` and `PUT` are interchangeable; both must send the complete resource.',
        ],
        why: '`GET`, `HEAD` and `OPTIONS` are safe; `PUT` and `DELETE` are idempotent but not safe; `POST` is neither, so blind retries can create duplicates (idempotency keys solve that). `PATCH` sends a partial change, while `PUT` sends the full representation.',
      },
      {
        key: 'choose-method',
        question: 'Which mappings are good REST choices for an order API?',
        correct: [
          '`POST /orders` to create an order whose id the server assigns.',
          '`GET /orders?status=OPEN` to search orders.',
          '`PATCH /orders/42` to change only the delivery address of order 42.',
        ],
        wrong: [
          '`GET /orders/42/cancel` to cancel order 42, because it is the easiest link to click.',
          '`POST /orders/42/get` to read an order, because POST bodies are more secure.',
        ],
        why: 'Creation with a server-assigned id is `POST` to the collection, filters are query parameters on `GET`, and a partial update is `PATCH`. A `GET` that changes state breaks caches, crawlers and link prefetching; reading with `POST` loses caching and the meaning of the method.',
      },
    ],
  ),
  ...b.output(
    'sb-http-response-status',
    2,
    ['Without `ResponseEntity`, the status is 200 unless `@ResponseStatus` says otherwise.'],
    [
      {
        key: 'annotation-on-method',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new CommentController()).build();
        System.out.println(mvc.perform(post("/comments")).andReturn().getResponse().getStatus());
        System.out.println(mvc.perform(delete("/comments/3")).andReturn().getResponse().getStatus());
        System.out.println(mvc.perform(put("/comments/3")).andReturn().getResponse().getStatus());
    }
}

@RestController
class CommentController {
    @PostMapping("/comments")
    @ResponseStatus(HttpStatus.CREATED)
    String create() { return "created"; }

    @DeleteMapping("/comments/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable long id) {}

    @PutMapping("/comments/{id}")
    void update(@PathVariable long id) {}
}`,
        output: '201\n204\n200',
        why: '`@ResponseStatus` on a handler method sets the success status. A `void` method without it still answers 200 (with an empty body); 204 No Content has to be requested explicitly.',
      },
      {
        key: 'exception-class',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new InvoiceController()).build();
        System.out.println(mvc.perform(get("/invoices/1")).andReturn().getResponse().getStatus());
        System.out.println(mvc.perform(get("/invoices/99")).andReturn().getResponse().getStatus());
    }
}

@ResponseStatus(HttpStatus.NOT_FOUND)
class InvoiceNotFoundException extends RuntimeException {}

@RestController
class InvoiceController {
    @GetMapping("/invoices/{id}")
    String invoice(@PathVariable long id) {
        if (id > 10) throw new InvoiceNotFoundException();
        return "invoice " + id;
    }
}`,
        output: '200\n404',
        why: 'An exception class annotated with `@ResponseStatus` is translated into that status when it escapes a handler. Without the annotation (or a handler), an unexpected exception means a 500 Internal Server Error.',
      },
    ],
  ),
  ...b.concept(
    'sb-http-status-choice',
    3,
    'Separate “the client sent something wrong” (4xx) from “the server failed” (5xx), then pick the most precise code.',
    [
      {
        key: 'duplicate-email',
        question:
          'A signup request is well formed, but the email address is already registered. Which response fits best?',
        correct: '`409 Conflict`, with a problem body explaining that the email is taken.',
        wrong: [
          '`500 Internal Server Error`, because the database unique constraint threw an exception.',
          '`200 OK` with `{"success": false}` so that clients do not see an error.',
          '`404 Not Found`, because no new account was found after the insert.',
        ],
        why: 'The request conflicts with the current state of the resource, which is what 409 means. A 500 tells the client the server is broken and invites retries; a 200 with an error flag defeats HTTP-aware clients, monitoring and caches; 404 is for missing resources.',
      },
      {
        key: 'unauthenticated-vs-forbidden',
        question:
          'A logged-in user without the `ADMIN` role calls `DELETE /users/7`. A second caller sends no credentials at all. Which statuses should they get?',
        correct:
          '`403 Forbidden` for the logged-in user, `401 Unauthorized` for the caller without credentials.',
        wrong: [
          '`401` for both, because neither may delete users.',
          '`403` for both, because the endpoint is forbidden to both.',
          '`404` for the logged-in user and `403` for the anonymous caller.',
        ],
        why: '401 means “not authenticated” (despite its name): the client should provide credentials. 403 means the server knows who you are and you are not allowed. Spring Security follows exactly this split.',
      },
      {
        key: 'async-accepted',
        question:
          '`POST /reports` starts generating a large report in the background; it will be ready in a few minutes. What should the response be?',
        correct:
          '`202 Accepted`, with a `Location` pointing to a status resource the client can poll.',
        wrong: [
          '`201 Created`, with the report body empty until it is ready.',
          '`200 OK` after blocking the request until the report is finished.',
          '`204 No Content`, because there is nothing to return yet.',
        ],
        why: '202 says the request was accepted for processing but is not complete. 201 claims the resource exists now, blocking ties up a server thread and runs into client timeouts, and 204 gives the client no way to follow up.',
      },
    ],
  ),
  ...b.output(
    'sb-http-content-type',
    3,
    [
      'The converter is chosen from the return type and the `Accept` header; the `Content-Type` follows from that choice.',
    ],
    [
      {
        key: 'string-vs-object',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new StatusController()).build();
        System.out.println(mvc.perform(get("/status/text")).andReturn().getResponse().getContentType());
        System.out.println(mvc.perform(get("/status/json")).andReturn().getResponse().getContentType());
    }
}

record Status(String state) {}

@RestController
class StatusController {
    @GetMapping("/status/text")
    String text() { return "UP"; }

    @GetMapping("/status/json")
    Status json() { return new Status("UP"); }
}`,
        output: 'text/plain;charset=ISO-8859-1\napplication/json',
        why: 'A `String` is written by the string converter as `text/plain`, here with the servlet default charset ISO-8859-1; an object is written by Jackson as `application/json`. Returning a hand-built JSON string therefore does not produce a JSON content type.',
      },
      {
        key: 'produces',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ExportController()).build();
        var response = mvc.perform(get("/export")).andReturn().getResponse();
        System.out.println(response.getContentType());
        System.out.println(response.getContentAsString());
    }
}

@RestController
class ExportController {
    @GetMapping(value = "/export", produces = "text/csv")
    String export() { return "id,name\\n1,Ada"; }
}`,
        output: 'text/csv;charset=ISO-8859-1\nid,name\n1,Ada',
        why: '`produces` declares the media type the endpoint returns, and the response carries it as its `Content-Type`; the string converter adds its default charset, ISO-8859-1 (declare `text/csv;charset=UTF-8` for non-ASCII data). It also restricts matching: a client that only accepts `application/json` would get 406 Not Acceptable.',
      },
      {
        key: 'not-acceptable',
        code: `${MVC_PROBLEMS}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new StatusController())
            .setControllerAdvice(new ApiErrors())
            .build();
        System.out.println(mvc.perform(get("/status").accept(MediaType.APPLICATION_JSON)).andReturn().getResponse().getStatus());
        System.out.println(mvc.perform(get("/status").accept(MediaType.APPLICATION_XML)).andReturn().getResponse().getStatus());
    }
}

record Status(String state) {}

@RestController
class StatusController {
    @GetMapping("/status")
    Status status() { return new Status("UP"); }
}

// Turns Spring MVC exceptions into ProblemDetail responses.
@RestControllerAdvice
class ApiErrors extends ResponseEntityExceptionHandler {}`,
        output: '200\n406',
        why: 'Content negotiation looks for a converter that can write `Status` in a media type the client accepts. Jackson’s XML module is not on the class path, so nothing can produce `application/xml` and Spring answers 406 Not Acceptable.',
      },
    ],
  ),
  ...b.output(
    'sb-http-client-errors',
    4,
    [
      'Spring MVC rejects requests it cannot map or read before your method runs; each reason has its own 4xx status.',
    ],
    [
      {
        key: 'unsupported-media-type',
        code: `${MVC_PROBLEMS}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new OrderController())
            .setControllerAdvice(new ApiErrors())
            .build();
        var response = mvc.perform(post("/orders").contentType(MediaType.TEXT_PLAIN).content("pen x2"))
            .andReturn().getResponse();
        System.out.println(response.getStatus());
    }
}

record NewOrder(String product, int quantity) {}

@RestController
class OrderController {
    @PostMapping("/orders")
    String create(@RequestBody NewOrder order) { return "ok"; }
}

// Turns Spring MVC exceptions into ProblemDetail responses.
@RestControllerAdvice
class ApiErrors extends ResponseEntityExceptionHandler {}`,
        output: '415',
        why: 'No converter can read `text/plain` into a `NewOrder`, so Spring answers 415 Unsupported Media Type. The client must send `Content-Type: application/json`.',
      },
      {
        key: 'malformed-json',
        code: `${MVC_PROBLEMS}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new OrderController())
            .setControllerAdvice(new ApiErrors())
            .build();
        var response = mvc.perform(post("/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\\"product\\": \\"pen\\", \\"quantity\\": }"))
            .andReturn().getResponse();
        System.out.println(response.getStatus());
        System.out.println(response.getContentAsString());
    }
}

record NewOrder(String product, int quantity) {}

@RestController
class OrderController {
    @PostMapping("/orders")
    String create(@RequestBody NewOrder order) { return "ok"; }
}

// Turns Spring MVC exceptions into ProblemDetail responses.
@RestControllerAdvice
class ApiErrors extends ResponseEntityExceptionHandler {}`,
        output:
          '400\n{"detail":"Failed to read request","instance":"/orders","status":400,"title":"Bad Request"}',
        why: 'The body is not valid JSON, so reading it fails and Spring answers 400 Bad Request. The `ResponseEntityExceptionHandler` base class writes an RFC 9457 problem body with a generic detail that does not echo the parser’s internal message.',
      },
      {
        key: 'missing-param',
        code: `${MVC_PROBLEMS}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ReportController())
            .setControllerAdvice(new ApiErrors())
            .build();
        var response = mvc.perform(get("/reports")).andReturn().getResponse();
        System.out.println(response.getStatus());
        System.out.println(response.getContentAsString());
    }
}

@RestController
class ReportController {
    @GetMapping("/reports")
    String report(@RequestParam int year) { return "report " + year; }
}

// Turns Spring MVC exceptions into ProblemDetail responses.
@RestControllerAdvice
class ApiErrors extends ResponseEntityExceptionHandler {}`,
        output:
          '400\n{"detail":"Required parameter \'year\' is not present.","instance":"/reports","status":400,"title":"Bad Request"}',
        why: '`@RequestParam` is required by default, so a request without `year` is rejected with 400 before the method is called. Make it optional with `required = false` (and a nullable type) or a `defaultValue`.',
      },
    ],
  ),
  ...b.output(
    'sb-http-null-body',
    4,
    ['What status does Spring use when a handler returns normally, whatever the value?'],
    [
      {
        key: 'null-return',
        question: 'The lookup returns `null` for an unknown user. What does this program print?',
        code: `${MVC}
import java.util.Map;

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new UserController()).build();
        var response = mvc.perform(get("/users/bob")).andReturn().getResponse();
        System.out.println(response.getStatus() + " [" + response.getContentAsString() + "]");
    }
}

record User(String name) {}

@RestController
class UserController {
    private final Map<String, User> users = Map.of("ann", new User("ann"));

    @GetMapping("/users/{name}")
    User user(@PathVariable String name) {
        return users.get(name);
    }
}`,
        output: '200 []',
        why: 'Returning `null` is still a normal return, so the status is 200 with an empty body; Spring does not turn it into 404. Signal a missing resource explicitly: `ResponseEntity.notFound()`, `ResponseEntity.of(optional)` or an exception mapped to 404.',
      },
      {
        key: 'empty-list',
        question: 'Nobody has placed an order yet. What does this program print?',
        code: `${MVC}
import java.util.List;

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new OrderController()).build();
        var response = mvc.perform(get("/orders")).andReturn().getResponse();
        System.out.println(response.getStatus() + " " + response.getContentAsString());
    }
}

record Order(long id) {}

@RestController
class OrderController {
    @GetMapping("/orders")
    List<Order> orders() {
        return List.of();
    }
}`,
        output: '200 []',
        why: 'An empty collection is a valid result for a search or a list: 200 with the JSON array `[]`. That is the right behavior; 404 would wrongly say that the `/orders` resource itself does not exist.',
      },
    ],
  ),
  ...b.output(
    'sb-http-conditional-get',
    5,
    [
      'An `ETag` identifies a version of a resource; a client that already has that version sends it back in `If-None-Match`.',
    ],
    [
      {
        key: 'not-modified',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new CatalogController()).build();
        var first = mvc.perform(get("/catalog")).andReturn().getResponse();
        System.out.println(first.getStatus() + " " + first.getHeader("ETag") + " " + first.getContentAsString());
        var second = mvc.perform(get("/catalog").header("If-None-Match", "\\"v7\\"")).andReturn().getResponse();
        System.out.println(second.getStatus() + " [" + second.getContentAsString() + "]");
    }
}

@RestController
class CatalogController {
    @GetMapping("/catalog")
    ResponseEntity<String> catalog() {
        return ResponseEntity.ok().eTag("v7").body("pen,cup,book");
    }
}`,
        output: '200 "v7" pen,cup,book\n304 []',
        why: 'Spring quotes the ETag value and, when the request’s `If-None-Match` matches it, answers 304 Not Modified without a body, so the client reuses its cached copy. The handler still ran; for expensive resources, check the version before building the body.',
      },
      {
        key: 'changed',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new CatalogController()).build();
        var response = mvc.perform(get("/catalog").header("If-None-Match", "\\"v6\\"")).andReturn().getResponse();
        System.out.println(response.getStatus() + " " + response.getHeader("ETag") + " " + response.getContentAsString());
    }
}

@RestController
class CatalogController {
    @GetMapping("/catalog")
    ResponseEntity<String> catalog() {
        return ResponseEntity.ok().eTag("v7").body("pen,cup,book");
    }
}`,
        output: '200 "v7" pen,cup,book',
        why: 'The client’s cached version `"v6"` differs from the current `"v7"`, so the full response is sent with the new ETag. Only a match produces 304.',
      },
    ],
  ),
  ...b.codeChoice(
    'sb-http-contract',
    5,
    'A response contract is what clients rely on: field names, types, status codes and error format.',
    [
      {
        key: 'entity-leak',
        question:
          'The API returns the domain object directly. Which problem does this code have as an API contract?',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new UserController()).build();
        System.out.println(mvc.perform(get("/users/1")).andReturn().getResponse().getContentAsString());
    }
}

class User {
    private final long id = 1;
    private final String email = "ann@example.com";
    private final String passwordHash = "$2a$10$abc";

    public long getId() { return id; }
    public String getEmail() { return email; }
    public String getPasswordHash() { return passwordHash; }
}

@RestController
class UserController {
    @GetMapping("/users/{id}")
    User user(@PathVariable long id) { return new User(); }
}`,
        correct:
          'Every getter becomes part of the JSON, so the password hash leaks and any refactoring of `User` changes the API; return a response DTO with only the public fields.',
        wrong: [
          'Jackson cannot serialize classes with `final` fields, so the response is empty.',
          'The hash is safe to expose because it cannot be reversed.',
          'Private fields are never serialized, so only `id` is returned.',
        ],
        why: 'Jackson serializes through public getters, so `passwordHash` is sent to every client (running the code shows it). Hashes can be brute-forced offline, so they must never leave the server. A response DTO decouples the API contract from the internal model.',
      },
      {
        key: 'versioned-field',
        question:
          'Mobile clients read `total` as a number. A developer changes it to a formatted string. What is the best way to evolve this API?',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new OrderController()).build();
        System.out.println(mvc.perform(get("/api/v1/orders/1")).andReturn().getResponse().getContentAsString());
        System.out.println(mvc.perform(get("/api/v2/orders/1")).andReturn().getResponse().getContentAsString());
    }
}

record OrderV1(long id, long total) {}
record OrderV2(long id, long total, String totalDisplay) {}

@RestController
class OrderController {
    @GetMapping("/api/v1/orders/{id}")
    OrderV1 v1(@PathVariable long id) { return new OrderV1(id, 1999); }

    @GetMapping("/api/v2/orders/{id}")
    OrderV2 v2(@PathVariable long id) { return new OrderV2(id, 1999, "19.99 EUR"); }
}`,
        correct:
          'Keep `total` unchanged and add new fields (here `totalDisplay`); breaking changes go into a new version while the old one keeps working.',
        wrong: [
          'Change the type in place; JSON is untyped, so clients adapt automatically.',
          'Rename `total` to `amount` in the same version, since clients should ignore unknown fields.',
          'Return both shapes from one endpoint and let clients choose by trying to parse them.',
        ],
        why: 'Adding an optional field is backward compatible because tolerant clients ignore unknown properties. Changing the type or name of an existing field breaks existing clients, so it needs a new version (path, header or media type), with the old one supported until clients migrate.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- DTOs and validation

const VALIDATION = `import jakarta.validation.*;
import jakarta.validation.constraints.*;`;

export const validationFamilies: readonly QuestionSource[] = [
  ...b.output(
    'sb-val-constraints',
    1,
    ['Each violated constraint produces one violation with a property path and a default message.'],
    [
      {
        key: 'blank-and-range',
        code: `${VALIDATION}

public class Main {
    public static void main(String[] args) {
        Validator validator = Validation.buildDefaultValidatorFactory().getValidator();
        var request = new NewProduct("", 0);
        validator.validate(request).stream()
            .map(v -> v.getPropertyPath() + ": " + v.getMessage())
            .sorted()
            .forEach(System.out::println);
    }
}

record NewProduct(@NotBlank String name, @Min(1) int stock) {}`,
        output: 'name: must not be blank\nstock: must be greater than or equal to 1',
        why: 'Bean Validation checks every constraint and reports all violations, not just the first. `@NotBlank` rejects the empty string and `@Min(1)` rejects 0. The results are sorted because `validate` returns a `Set`.',
      },
      {
        key: 'email-size',
        code: `${VALIDATION}

public class Main {
    public static void main(String[] args) {
        Validator validator = Validation.buildDefaultValidatorFactory().getValidator();
        var ok = new Signup("ann@example.com", "s3cret-pass");
        var bad = new Signup("ann.example.com", "short");
        System.out.println(validator.validate(ok).size());
        validator.validate(bad).stream()
            .map(v -> v.getPropertyPath() + ": " + v.getMessage())
            .sorted()
            .forEach(System.out::println);
    }
}

record Signup(@Email String email, @Size(min = 8, max = 64) String password) {}`,
        output:
          '0\nemail: must be a well-formed email address\npassword: size must be between 8 and 64',
        why: 'The valid object has no violations. `@Email` rejects an address without `@`, and `@Size` checks the string length. Messages come from the default message bundle and include the constraint’s attributes.',
      },
    ],
  ),
  ...b.output(
    'sb-val-null-blank-empty',
    2,
    [
      '`@NotNull` only rejects `null`; `@NotEmpty` also rejects length 0; `@NotBlank` also rejects whitespace only.',
    ],
    [
      {
        key: 'whitespace',
        code: `${VALIDATION}

public class Main {
    public static void main(String[] args) {
        Validator validator = Validation.buildDefaultValidatorFactory().getValidator();
        var form = new Comment("   ", "   ", "   ");
        validator.validate(form).stream()
            .map(v -> v.getPropertyPath().toString())
            .sorted()
            .forEach(System.out::println);
    }
}

record Comment(@NotNull String a, @NotEmpty String b, @NotBlank String c) {}`,
        output: 'c',
        why: 'A string of spaces is not `null` and not empty, so only `@NotBlank`, which trims before checking, rejects it. For required text input, `@NotBlank` is usually the right choice.',
      },
      {
        key: 'null-values',
        code: `${VALIDATION}

public class Main {
    public static void main(String[] args) {
        Validator validator = Validation.buildDefaultValidatorFactory().getValidator();
        var form = new Profile(null, null, null);
        validator.validate(form).stream()
            .map(v -> v.getPropertyPath().toString())
            .sorted()
            .forEach(System.out::println);
    }
}

record Profile(@Size(min = 2) String nickname, @Email String email, @NotEmpty String name) {}`,
        output: 'name',
        why: 'Most constraints consider `null` valid: `@Size` and `@Email` only check values that are present. Only `@NotEmpty` (like `@NotNull` and `@NotBlank`) rejects `null`. Combine `@NotNull` with `@Size` when the field is required.',
      },
    ],
  ),
  ...b.output(
    'sb-val-mvc-errors',
    2,
    [
      '`@Valid` on a `@RequestBody` validates it before the method runs and throws `MethodArgumentNotValidException` on failure.',
    ],
    [
      {
        key: 'field-errors',
        code: `${MVC}
${VALIDATION}
import org.springframework.web.bind.MethodArgumentNotValidException;
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new UserController())
            .setControllerAdvice(new ValidationErrors())
            .build();
        var response = mvc.perform(post("/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\\"name\\": \\"\\", \\"age\\": 12}"))
            .andReturn().getResponse();
        System.out.println(response.getStatus());
        System.out.println(response.getContentAsString());
    }
}

record NewUser(@NotBlank String name, @Min(18) int age) {}

@RestController
class UserController {
    @PostMapping("/users")
    ResponseEntity<String> create(@Valid @RequestBody NewUser user) {
        return ResponseEntity.status(HttpStatus.CREATED).body("created " + user.name());
    }
}

@RestControllerAdvice
class ValidationErrors {
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<Map<String, String>> invalid(MethodArgumentNotValidException e) {
        Map<String, String> errors = new TreeMap<>();
        e.getBindingResult().getFieldErrors()
            .forEach(f -> errors.put(f.getField(), f.getDefaultMessage()));
        return ResponseEntity.badRequest().body(errors);
    }
}`,
        output: '400\n{"age":"must be greater than or equal to 18","name":"must not be blank"}',
        why: 'Validation fails before `create` runs, and the handler turns the field errors into a 400 response with one message per field (a `TreeMap` keeps the keys sorted). Clients get every problem at once instead of fixing them one by one.',
      },
      {
        key: 'valid-request',
        code: `${MVC}
${VALIDATION}
import org.springframework.web.bind.MethodArgumentNotValidException;
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new UserController())
            .setControllerAdvice(new ValidationErrors())
            .build();
        var response = mvc.perform(post("/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\\"name\\": \\"Ann\\", \\"age\\": 30}"))
            .andReturn().getResponse();
        System.out.println(response.getStatus() + " " + response.getContentAsString());
    }
}

record NewUser(@NotBlank String name, @Min(18) int age) {}

@RestController
class UserController {
    @PostMapping("/users")
    ResponseEntity<String> create(@Valid @RequestBody NewUser user) {
        return ResponseEntity.status(HttpStatus.CREATED).body("created " + user.name());
    }
}

@RestControllerAdvice
class ValidationErrors {
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<Map<String, String>> invalid(MethodArgumentNotValidException e) {
        Map<String, String> errors = new TreeMap<>();
        e.getBindingResult().getFieldErrors()
            .forEach(f -> errors.put(f.getField(), f.getDefaultMessage()));
        return ResponseEntity.badRequest().body(errors);
    }
}`,
        output: '201 created Ann',
        why: 'A valid body passes validation and the method runs normally. The exception handler is only involved when validation fails.',
      },
    ],
  ),
  ...b.output(
    'sb-val-missing-valid',
    3,
    [
      'Constraint annotations on a DTO do nothing by themselves; something has to trigger validation.',
    ],
    [
      {
        key: 'no-valid',
        question:
          'The DTO has constraints, but look at the controller parameter. What does this program print?',
        code: `${MVC}
${VALIDATION}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new UserController()).build();
        var response = mvc.perform(post("/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\\"name\\": \\"\\", \\"age\\": 12}"))
            .andReturn().getResponse();
        System.out.println(response.getStatus() + " " + response.getContentAsString());
    }
}

record NewUser(@NotBlank String name, @Min(18) int age) {}

@RestController
class UserController {
    @PostMapping("/users")
    ResponseEntity<String> create(@RequestBody NewUser user) {
        return ResponseEntity.status(HttpStatus.CREATED).body("created '" + user.name() + "' aged " + user.age());
    }
}`,
        output: "201 created '' aged 12",
        why: 'Without `@Valid` (or `@Validated`) on the parameter, Spring MVC does not validate the body, so the invalid user is accepted. The constraint annotations are only metadata until a validator is asked to check them.',
      },
      {
        key: 'nested-without-valid',
        question: 'The nested address has constraints too. What does this program print?',
        code: `${MVC}
${VALIDATION}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new OrderController()).build();
        var response = mvc.perform(post("/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\\"product\\": \\"pen\\", \\"address\\": {\\"city\\": \\"\\"}}"))
            .andReturn().getResponse();
        System.out.println(response.getStatus() + " " + response.getContentAsString());
    }
}

record Address(@NotBlank String city) {}
record NewOrder(@NotBlank String product, @NotNull Address address) {}

@RestController
class OrderController {
    @PostMapping("/orders")
    String create(@Valid @RequestBody NewOrder order) {
        return "shipping to '" + order.address().city() + "'";
    }
}`,
        output: "200 shipping to ''",
        why: 'Validation does not cascade into nested objects by default. `@NotNull` only checks that the address exists; its own `@NotBlank` is ignored unless the field is marked `@Valid Address address`.',
      },
    ],
  ),
  ...b.output(
    'sb-val-nested-cascade',
    4,
    ['`@Valid` on a field or a type argument makes validation cascade into the nested objects.'],
    [
      {
        key: 'nested-valid',
        code: `${VALIDATION}

public class Main {
    public static void main(String[] args) {
        Validator validator = Validation.buildDefaultValidatorFactory().getValidator();
        var order = new NewOrder("pen", new Address(""));
        validator.validate(order).stream()
            .map(v -> v.getPropertyPath() + ": " + v.getMessage())
            .forEach(System.out::println);
    }
}

record Address(@NotBlank String city) {}
record NewOrder(@NotBlank String product, @Valid @NotNull Address address) {}`,
        output: 'address.city: must not be blank',
        why: '`@Valid` on `address` tells the validator to descend into it, and the property path shows where the violation is: `address.city`.',
      },
      {
        key: 'list-elements',
        code: `${VALIDATION}
import java.util.List;

public class Main {
    public static void main(String[] args) {
        Validator validator = Validation.buildDefaultValidatorFactory().getValidator();
        var order = new NewOrder(List.of(new Line("pen", 2), new Line("cup", 0), new Line("", 1)));
        validator.validate(order).stream()
            .map(v -> v.getPropertyPath() + ": " + v.getMessage())
            .sorted()
            .forEach(System.out::println);
    }
}

record Line(@NotBlank String sku, @Positive int quantity) {}
record NewOrder(@NotEmpty List<@Valid Line> lines) {}`,
        output: 'lines[1].quantity: must be greater than 0\nlines[2].sku: must not be blank',
        why: '`List<@Valid Line>` cascades into each element, and the path includes the index. `@NotEmpty` on the list itself only checks that there is at least one line.',
      },
    ],
  ),
  ...b.output(
    'sb-val-entity-binding',
    3,
    ['Jackson sets every property the client sends that the target type can accept.'],
    [
      {
        key: 'mass-assignment',
        question:
          'The signup endpoint binds the request straight into the domain class. What does this program print?',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new SignupController()).build();
        var response = mvc.perform(post("/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\\"email\\": \\"eve@example.com\\", \\"role\\": \\"ADMIN\\"}"))
            .andReturn().getResponse();
        System.out.println(response.getContentAsString());
    }
}

class Account {
    private String email;
    private String role = "USER";

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
}

@RestController
class SignupController {
    @PostMapping("/signup")
    String signup(@RequestBody Account account) {
        return account.getEmail() + " is " + account.getRole();
    }
}`,
        output: 'eve@example.com is ADMIN',
        why: 'Binding requests directly into a domain class lets clients set any property with a setter, including `role`: a mass-assignment vulnerability. A request DTO such as `record SignupRequest(String email)` limits the input to what the client may choose; the server sets the role.',
      },
      {
        key: 'dto-binding',
        question:
          'The same attack against an endpoint that uses a request DTO. What does it print?',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new SignupController()).build();
        var response = mvc.perform(post("/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\\"email\\": \\"eve@example.com\\", \\"role\\": \\"ADMIN\\"}"))
            .andReturn().getResponse();
        System.out.println(response.getContentAsString());
    }
}

record SignupRequest(String email) {}

class Account {
    private final String email;
    private final String role;
    Account(String email, String role) { this.email = email; this.role = role; }
    String describe() { return email + " is " + role; }
}

@RestController
class SignupController {
    @PostMapping("/signup")
    String signup(@RequestBody SignupRequest request) {
        Account account = new Account(request.email(), "USER");
        return account.describe();
    }
}`,
        output: 'eve@example.com is USER',
        why: 'The DTO has no `role`, so the extra property is ignored, and the server decides the role when it builds the domain object. Request DTOs are the API’s input contract; domain objects stay internal.',
      },
    ],
  ),
  ...b.output(
    'sb-val-business-rules',
    4,
    [
      'Annotations check the shape of one request; rules that need data (existing users, stock) belong in the service.',
    ],
    [
      {
        key: 'duplicate-email',
        code: `${MVC}
${VALIDATION}
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new UserController(new UserService()))
            .setControllerAdvice(new ApiErrors())
            .build();
        for (String email : List.of("new@example.com", "ann@example.com", "not-an-email")) {
            var response = mvc.perform(post("/users")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\\"email\\": \\"" + email + "\\"}"))
                .andReturn().getResponse();
            System.out.println(response.getStatus());
        }
    }
}

record NewUser(@NotBlank @Email String email) {}

class EmailTakenException extends RuntimeException {}

class UserService {
    private final Set<String> emails = new HashSet<>(Set.of("ann@example.com"));

    void register(String email) {
        if (!emails.add(email)) throw new EmailTakenException();
    }
}

@RestController
class UserController {
    private final UserService users;
    UserController(UserService users) { this.users = users; }

    @PostMapping("/users")
    @ResponseStatus(HttpStatus.CREATED)
    void create(@Valid @RequestBody NewUser user) { users.register(user.email()); }
}

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(EmailTakenException.class)
    ProblemDetail taken() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Email already registered");
    }

    @ExceptionHandler(org.springframework.web.bind.MethodArgumentNotValidException.class)
    ProblemDetail invalid() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Invalid request");
    }
}`,
        output: '201\n409\n400',
        why: 'Format rules (`@Email`) are checked by Bean Validation before the controller method and give 400. Uniqueness needs existing data, so the service checks it and throws a domain exception that the advice maps to 409 Conflict. Both paths produce consistent error responses.',
      },
      {
        key: 'service-guard',
        code: `${MVC}
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new OrderController(new StockService()))
            .setControllerAdvice(new ApiErrors())
            .build();
        for (int quantity : new int[] {3, 8}) {
            var response = mvc.perform(post("/orders").param("sku", "pen").param("quantity", String.valueOf(quantity)))
                .andReturn().getResponse();
            System.out.println(response.getStatus() + " " + response.getContentAsString());
        }
    }
}

class OutOfStockException extends RuntimeException {
    OutOfStockException(String sku, int available) { super(sku + ": only " + available + " left"); }
}

class StockService {
    private final Map<String, Integer> stock = new HashMap<>(Map.of("pen", 5));

    int reserve(String sku, int quantity) {
        int available = stock.getOrDefault(sku, 0);
        if (quantity > available) throw new OutOfStockException(sku, available);
        stock.put(sku, available - quantity);
        return available - quantity;
    }
}

@RestController
class OrderController {
    private final StockService stock;
    OrderController(StockService stock) { this.stock = stock; }

    @PostMapping("/orders")
    String order(@RequestParam String sku, @RequestParam int quantity) {
        return "left " + stock.reserve(sku, quantity);
    }
}

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(OutOfStockException.class)
    ResponseEntity<String> outOfStock(OutOfStockException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(e.getMessage());
    }
}`,
        output: '200 left 2\n409 pen: only 2 left',
        why: 'The first order reserves 3 of 5 pens. The second asks for 8 while only 2 are left; the service enforces the rule (so every caller, not only this controller, gets it) and the advice maps the domain exception to 409.',
      },
    ],
  ),
  ...b.output(
    'sb-val-custom-rules',
    5,
    [
      'A constraint can sit on a method of the object (cross-field) or be a custom annotation backed by a `ConstraintValidator`.',
    ],
    [
      {
        key: 'assert-true',
        code: `${VALIDATION}
import java.time.LocalDate;

public class Main {
    public static void main(String[] args) {
        Validator validator = Validation.buildDefaultValidatorFactory().getValidator();
        var booking = new Booking(LocalDate.of(2026, 5, 10), LocalDate.of(2026, 5, 7));
        validator.validate(booking).forEach(v ->
            System.out.println(v.getPropertyPath() + ": " + v.getMessage()));
    }
}

record Booking(@NotNull LocalDate checkIn, @NotNull LocalDate checkOut) {
    @AssertTrue(message = "check-out must be after check-in")
    boolean isDateRangeValid() {
        return checkIn == null || checkOut == null || checkOut.isAfter(checkIn);
    }
}`,
        output: 'dateRangeValid: check-out must be after check-in',
        why: 'A constraint on a getter-style method (`isDateRangeValid`) validates a property named `dateRangeValid`, which lets one rule compare two fields. The null checks leave missing dates to `@NotNull` instead of throwing.',
      },
      {
        key: 'custom-annotation',
        code: `${VALIDATION}
import java.lang.annotation.*;

public class Main {
    public static void main(String[] args) {
        Validator validator = Validation.buildDefaultValidatorFactory().getValidator();
        for (String sku : new String[] {"PEN-001", "pen-1", null}) {
            System.out.println(sku + " -> " + validator.validate(new Item(sku)).size());
        }
    }

    // Public, so that Hibernate Validator can instantiate it.
    public static class SkuValidator implements ConstraintValidator<Sku, String> {
        public boolean isValid(String value, ConstraintValidatorContext context) {
            return value == null || value.matches("[A-Z]{3}-\\\\d{3}");
        }
    }
}

@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = Main.SkuValidator.class)
@interface Sku {
    String message() default "invalid SKU";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}


record Item(@Sku String sku) {}`,
        output: 'PEN-001 -> 0\npen-1 -> 1\nnull -> 0',
        why: 'A custom constraint is an annotation with `@Constraint(validatedBy = ...)` plus a `ConstraintValidator`. By convention validators treat `null` as valid and leave “required” to `@NotNull`, so the `null` SKU passes.',
      },
    ],
  ),
  ...b.output(
    'sb-val-method-validation',
    5,
    ['Constraints can also sit directly on `@RequestParam` and `@PathVariable` parameters.'],
    [
      {
        key: 'request-param-min',
        code: `${MVC_PROBLEMS}
${VALIDATION}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ProductController())
            .setControllerAdvice(new ApiErrors())
            .build();
        System.out.println(mvc.perform(get("/products?limit=10")).andReturn().getResponse().getStatus());
        var response = mvc.perform(get("/products?limit=500")).andReturn().getResponse();
        System.out.println(response.getStatus() + " " + response.getContentAsString());
    }
}

@RestController
class ProductController {
    @GetMapping("/products")
    String list(@RequestParam @Min(1) @Max(100) int limit) {
        return "first " + limit;
    }
}

// Turns Spring MVC exceptions into ProblemDetail responses.
@RestControllerAdvice
class ApiErrors extends ResponseEntityExceptionHandler {}`,
        output:
          '200\n400 {"detail":"Validation failure","instance":"/products","status":400,"title":"Bad Request"}',
        why: 'Spring MVC applies method validation when handler parameters carry constraints: `limit=500` violates `@Max(100)`, so the request fails with `HandlerMethodValidationException` and 400 before the method body runs. No `@Validated` on the class is needed for controller parameters.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Exception handling

export const exceptionHandlingFamilies: readonly QuestionSource[] = [
  ...b.output(
    'sb-err-handler-basic',
    1,
    [
      'An `@ExceptionHandler` in a `@RestControllerAdvice` turns a thrown exception into a response.',
    ],
    [
      {
        key: 'not-found',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new OrderController())
            .setControllerAdvice(new ApiErrors())
            .build();
        var response = mvc.perform(get("/orders/9")).andReturn().getResponse();
        System.out.println(response.getStatus());
        System.out.println(response.getContentAsString());
    }
}

class OrderNotFoundException extends RuntimeException {
    OrderNotFoundException(long id) { super("Order " + id + " not found"); }
}

@RestController
class OrderController {
    @GetMapping("/orders/{id}")
    String order(@PathVariable long id) {
        throw new OrderNotFoundException(id);
    }
}

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(OrderNotFoundException.class)
    ResponseEntity<String> notFound(OrderNotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(e.getMessage());
    }
}`,
        output: '404\nOrder 9 not found',
        why: 'The exception leaves the controller, Spring finds the matching `@ExceptionHandler` in the advice and uses its `ResponseEntity`. The controller stays free of error-to-HTTP translation.',
      },
      {
        key: 'problem-detail',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new OrderController())
            .setControllerAdvice(new ApiErrors())
            .build();
        var response = mvc.perform(get("/orders/9")).andReturn().getResponse();
        System.out.println(response.getStatus() + " " + response.getContentType());
        System.out.println(response.getContentAsString());
    }
}

class OrderNotFoundException extends RuntimeException {
    OrderNotFoundException(long id) { super("Order " + id + " not found"); }
}

@RestController
class OrderController {
    @GetMapping("/orders/{id}")
    String order(@PathVariable long id) {
        throw new OrderNotFoundException(id);
    }
}

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(OrderNotFoundException.class)
    ProblemDetail notFound(OrderNotFoundException e) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
        problem.setTitle("Order not found");
        return problem;
    }
}`,
        output:
          '404 application/problem+json\n{"detail":"Order 9 not found","instance":"/orders/9","status":404,"title":"Order not found"}',
        why: 'Returning a `ProblemDetail` produces an RFC 9457 problem response: status from the object, content type `application/problem+json`, and `instance` filled in with the request path. Using one format for every error makes clients simpler.',
      },
    ],
  ),
  ...b.blank(
    'sb-err-advice-blank',
    2,
    'One annotation makes a class apply to all controllers; the other marks a method as the handler for an exception type.',
    [
      {
        key: 'advice-handler',
        prompt:
          'Complete the code so that `PaymentDeclinedException` from any controller becomes a 402 response.',
        template: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new PaymentController())
            .setControllerAdvice(new PaymentErrors())
            .build();
        System.out.println(mvc.perform(post("/payments")).andReturn().getResponse().getStatus());
    }
}

class PaymentDeclinedException extends RuntimeException {}

@RestController
class PaymentController {
    @PostMapping("/payments")
    String pay() { throw new PaymentDeclinedException(); }
}

@{{blank:advice}}
class PaymentErrors {
    @{{blank:handler}}(PaymentDeclinedException.class)
    ProblemDetail declined() {
        return ProblemDetail.forStatus(HttpStatus.PAYMENT_REQUIRED);
    }
}`,
        blanks: {
          advice: ['RestControllerAdvice', 'ControllerAdvice'],
          handler: ['ExceptionHandler'],
        },
        why: '`@RestControllerAdvice` (or `@ControllerAdvice`; a `ProblemDetail` return value is written as the body either way) applies the class’s handlers to all controllers, and `@ExceptionHandler(Type.class)` selects the exceptions a method handles.',
      },
    ],
  ),
  ...b.output(
    'sb-err-handler-selection',
    3,
    [
      'When several handlers could apply, Spring picks the one whose exception type is closest to the thrown exception.',
    ],
    [
      {
        key: 'most-specific',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ImportController())
            .setControllerAdvice(new ApiErrors())
            .build();
        System.out.println(mvc.perform(get("/import/number")).andReturn().getResponse().getContentAsString());
        System.out.println(mvc.perform(get("/import/state")).andReturn().getResponse().getContentAsString());
    }
}

@RestController
class ImportController {
    @GetMapping("/import/number")
    String number() { return String.valueOf(Integer.parseInt("x1")); }

    @GetMapping("/import/state")
    String state() { throw new IllegalStateException("import already running"); }
}

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(RuntimeException.class)
    ResponseEntity<String> any(RuntimeException e) {
        return ResponseEntity.internalServerError().body("runtime handler");
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<String> badInput(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body("argument handler");
    }
}`,
        output: 'argument handler\nruntime handler',
        why: '`NumberFormatException` extends `IllegalArgumentException`, which is closer to it than `RuntimeException`, so the argument handler wins. `IllegalStateException` is not an `IllegalArgumentException`, so only the general handler matches. Declaration order does not matter.',
      },
      {
        key: 'local-beats-advice',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new LegacyController(), new OrderController())
            .setControllerAdvice(new ApiErrors())
            .build();
        System.out.println(mvc.perform(get("/legacy")).andReturn().getResponse().getContentAsString());
        System.out.println(mvc.perform(get("/orders")).andReturn().getResponse().getContentAsString());
    }
}

@RestController
class LegacyController {
    @GetMapping("/legacy")
    String legacy() { throw new UnsupportedOperationException(); }

    @ExceptionHandler(UnsupportedOperationException.class)
    ResponseEntity<String> local() {
        return ResponseEntity.status(HttpStatus.GONE).body("local handler");
    }
}

@RestController
class OrderController {
    @GetMapping("/orders")
    String orders() { throw new UnsupportedOperationException(); }
}

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(UnsupportedOperationException.class)
    ResponseEntity<String> global() {
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).body("advice handler");
    }
}`,
        output: 'local handler\nadvice handler',
        why: 'An `@ExceptionHandler` declared in the controller itself is consulted before any advice, so it handles that controller’s exceptions only. Other controllers fall back to the global advice.',
      },
    ],
  ),
  ...b.fails('sb-err-unhandled', 2, 'Which handler is responsible for this exception type?', [
    {
      key: 'wrong-type',
      question: 'The advice handles not-found errors, yet this request fails. Why?',
      code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new TransferController())
            .setControllerAdvice(new ApiErrors())
            .build();
        System.out.println(mvc.perform(post("/transfers")).andReturn().getResponse().getStatus());
    }
}

class AccountNotFoundException extends RuntimeException {}
class InsufficientFundsException extends RuntimeException {}

@RestController
class TransferController {
    @PostMapping("/transfers")
    String transfer() { throw new InsufficientFundsException(); }
}

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(AccountNotFoundException.class)
    ProblemDetail notFound() { return ProblemDetail.forStatus(HttpStatus.NOT_FOUND); }
}`,
      error: 'InsufficientFundsException',
      correct:
        'No handler matches `InsufficientFundsException`, so it propagates out of Spring MVC (a running server answers 500); add a handler for it, for example mapping it to 409 or 422.',
      wrong: [
        'The advice handles every `RuntimeException`, so the failure must be in MockMvc.',
        'Exceptions without a message cannot be handled; add a constructor with a message.',
        '`@RestControllerAdvice` only applies to controllers in the same file.',
      ],
      why: 'A handler only catches its own type and subtypes. An unmatched exception escapes to the servlet container: in a running Spring Boot application the client gets a generic 500 from the error controller, and MockMvc rethrows it wrapped in a `ServletException`. Every expected business exception should have an explicit mapping.',
    },
    {
      key: 'checked-in-service',
      question:
        'The handler is registered for a superclass of the thrown exception. Why does the request still fail?',
      code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ReportController())
            .setControllerAdvice(new ApiErrors())
            .build();
        System.out.println(mvc.perform(get("/report")).andReturn().getResponse().getStatus());
    }
}

class ReportException extends RuntimeException {
    ReportException(String message, Throwable cause) { super(message, cause); }
}

@RestController
class ReportController {
    @GetMapping("/report")
    String report() {
        try {
            throw new java.io.IOException("disk full");
        } catch (java.io.IOException e) {
            throw new IllegalStateException("report failed", e);
        }
    }
}

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(ReportException.class)
    ProblemDetail reportFailed() { return ProblemDetail.forStatus(HttpStatus.SERVICE_UNAVAILABLE); }
}`,
      error: 'IllegalStateException: report failed',
      correct:
        'The controller wraps the error in `IllegalStateException`, not in `ReportException`, so the handler does not match; throw `new ReportException("report failed", e)` instead.',
      wrong: [
        'Checked exceptions such as `IOException` can never be handled by `@ExceptionHandler`.',
        'Handlers match the root cause, so the handler should be declared for `IOException`.',
        'The handler method needs a parameter of the exception type to be called.',
      ],
      why: 'Spring matches the thrown exception type first (it also looks at causes, but neither `IllegalStateException` nor `IOException` is a `ReportException`). Wrapping low-level exceptions in a domain exception is good practice, as long as the handler is for that exception. Handler methods may omit the exception parameter.',
    },
  ]),
  ...b.codeChoice(
    'sb-err-no-leaks',
    4,
    'What does the client learn from each response, and what should only go to the server log?',
    [
      {
        key: 'exception-message',
        question:
          'This catch-all handler returns the exception text to the client. What is the main problem and the best fix?',
        code: `${MVC}

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new UserController())
            .setControllerAdvice(new ApiErrors())
            .build();
        System.out.println(mvc.perform(get("/users/7")).andReturn().getResponse().getContentAsString());
    }
}

@RestController
class UserController {
    @GetMapping("/users/{id}")
    String user(@PathVariable long id) {
        throw new IllegalStateException("SQL error: relation app_users (password_hash) on db-prod-3:5432");
    }
}

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(Exception.class)
    ResponseEntity<String> any(Exception e) {
        return ResponseEntity.internalServerError().body(e.toString());
    }
}`,
        correct:
          'It leaks internal details (table, column, host) to clients; log the exception server-side with a correlation id and return a generic problem response that includes only that id.',
        wrong: [
          'It is fine, because only authenticated users can trigger errors.',
          'The handler should return `e.getStackTrace()` instead, which is more useful for clients.',
          'Catch-all handlers are not allowed; remove it so that Spring shows the default error page with the exception message.',
        ],
        why: 'Exception messages and stack traces reveal schema, infrastructure and library versions that help attackers, and clients cannot act on them. Log the full exception with an id, return a generic message (and the id for support). A catch-all handler is legitimate; Spring Boot’s default error response also hides messages and traces unless configured otherwise.',
      },
      {
        key: 'consistent-format',
        question:
          'Different handlers in this application return different error shapes. Which change improves the API most?',
        code: `${MVC}
import java.util.Map;

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new CartController())
            .setControllerAdvice(new ApiErrors())
            .build();
        System.out.println(mvc.perform(get("/cart/missing")).andReturn().getResponse().getContentAsString());
        System.out.println(mvc.perform(get("/cart/locked")).andReturn().getResponse().getContentAsString());
    }
}

class CartNotFoundException extends RuntimeException {}
class CartLockedException extends RuntimeException {}

@RestController
class CartController {
    @GetMapping("/cart/missing")
    String missing() { throw new CartNotFoundException(); }

    @GetMapping("/cart/locked")
    String locked() { throw new CartLockedException(); }
}

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(CartNotFoundException.class)
    ResponseEntity<Map<String, String>> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
    }

    @ExceptionHandler(CartLockedException.class)
    ResponseEntity<String> locked() {
        return ResponseEntity.status(HttpStatus.CONFLICT).body("Cart is locked");
    }
}`,
        correct:
          'Return `ProblemDetail` from every handler so that all errors share one documented format (`type`, `title`, `status`, `detail`).',
        wrong: [
          'Return 200 for all errors and put the real status in the body, so clients parse one shape.',
          'Remove the handlers and let each controller catch its own exceptions.',
          'Return plain strings everywhere, because they are the simplest to read.',
        ],
        why: 'Clients should parse errors one way. `ProblemDetail` is Spring’s implementation of the RFC 9457 standard, and `ResponseEntityExceptionHandler` already uses it for Spring MVC’s own errors. Hiding the status in a 200 body breaks HTTP semantics, and catching in every controller duplicates code.',
      },
    ],
  ),
  ...b.output(
    'sb-err-problem-properties',
    4,
    ['A `ProblemDetail` can carry a `type` URI and extra properties beyond the standard fields.'],
    [
      {
        key: 'validation-errors',
        code: `${MVC_PROBLEMS}
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.context.request.WebRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new UserController())
            .setControllerAdvice(new ApiErrors())
            .build();
        var response = mvc.perform(post("/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\\"name\\": \\"\\", \\"age\\": 12}"))
            .andReturn().getResponse();
        System.out.println(response.getStatus());
        System.out.println(response.getContentAsString());
    }
}

record NewUser(@NotBlank String name, @Min(18) int age) {}

@RestController
class UserController {
    @PostMapping("/users")
    String create(@Valid @RequestBody NewUser user) { return "created"; }
}

@RestControllerAdvice
class ApiErrors extends ResponseEntityExceptionHandler {
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        ProblemDetail problem = ex.getBody();
        Map<String, String> errors = new TreeMap<>();
        ex.getBindingResult().getFieldErrors().forEach(f -> errors.put(f.getField(), f.getDefaultMessage()));
        problem.setProperty("errors", errors);
        return handleExceptionInternal(ex, problem, headers, status, request);
    }
}`,
        output:
          '400\n{"detail":"Invalid request content.","instance":"/users","status":400,"title":"Bad Request","errors":{"age":"must be greater than or equal to 18","name":"must not be blank"}}',
        why: '`MethodArgumentNotValidException` already carries a `ProblemDetail` (`ex.getBody()`). Overriding the base handler’s hook adds a field-by-field `errors` property while keeping the standard problem format, so clients can show each message next to its input.',
      },
      {
        key: 'extra-properties',
        code: `${MVC}
import java.net.URI;

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new CartController())
            .setControllerAdvice(new ApiErrors())
            .build();
        System.out.println(mvc.perform(post("/cart/items")).andReturn().getResponse().getContentAsString());
    }
}

class OutOfStockException extends RuntimeException {
    final String sku;
    final int available;
    OutOfStockException(String sku, int available) { this.sku = sku; this.available = available; }
}

@RestController
class CartController {
    @PostMapping("/cart/items")
    String add() { throw new OutOfStockException("PEN-001", 2); }
}

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(OutOfStockException.class)
    ProblemDetail outOfStock(OutOfStockException e) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Not enough stock");
        problem.setType(URI.create("https://api.example.com/problems/out-of-stock"));
        problem.setProperty("available", e.available);
        return problem;
    }
}`,
        output:
          '{"detail":"Not enough stock","instance":"/cart/items","status":409,"title":"Conflict","type":"https://api.example.com/problems/out-of-stock","available":2}',
        why: 'The `type` URI identifies the kind of problem for clients, `title` defaults to the status reason phrase, and properties set with `setProperty` are written as top-level members after the standard ones. Clients can react to `available` without parsing text.',
      },
    ],
  ),
  ...b.output(
    'sb-err-response-status-exception',
    5,
    [
      '`ResponseStatusException` carries a status and a reason; `ResponseEntityExceptionHandler` writes it as a problem response.',
    ],
    [
      {
        key: 'with-reason',
        code: `${MVC_PROBLEMS}
import org.springframework.web.server.ResponseStatusException;

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new OrderController())
            .setControllerAdvice(new ApiErrors())
            .build();
        System.out.println(mvc.perform(delete("/orders/3")).andReturn().getResponse().getContentAsString());
    }
}

@RestController
class OrderController {
    @DeleteMapping("/orders/{id}")
    void cancel(@PathVariable long id) {
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Order " + id + " has already shipped");
    }
}

// Turns Spring MVC exceptions into ProblemDetail responses.
@RestControllerAdvice
class ApiErrors extends ResponseEntityExceptionHandler {}`,
        output:
          '{"detail":"Order 3 has already shipped","instance":"/orders/3","status":409,"title":"Conflict"}',
        why: '`ResponseStatusException` is one of the `ErrorResponse` exceptions the base handler understands: the status becomes `status`/`title`, and the reason becomes `detail`. It is handy for one-off cases; recurring domain errors read better as dedicated exception types mapped in one place.',
      },
      {
        key: 'error-response-exception',
        code: `${MVC_PROBLEMS}
import org.springframework.web.ErrorResponseException;
import java.net.URI;

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new OrderController())
            .setControllerAdvice(new ApiErrors())
            .build();
        var response = mvc.perform(delete("/orders/3")).andReturn().getResponse();
        System.out.println(response.getStatus());
        System.out.println(response.getContentAsString());
    }
}

class OrderShippedException extends ErrorResponseException {
    OrderShippedException(long id) {
        super(HttpStatus.CONFLICT, problem(id), null);
    }

    private static ProblemDetail problem(long id) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Order " + id + " has already shipped");
        problem.setType(URI.create("https://api.example.com/problems/order-shipped"));
        problem.setProperty("orderId", id);
        return problem;
    }
}

@RestController
class OrderController {
    @DeleteMapping("/orders/{id}")
    void cancel(@PathVariable long id) {
        throw new OrderShippedException(id);
    }
}

// Turns Spring MVC exceptions into ProblemDetail responses.
@RestControllerAdvice
class ApiErrors extends ResponseEntityExceptionHandler {}`,
        output:
          '409\n{"detail":"Order 3 has already shipped","instance":"/orders/3","status":409,"title":"Conflict","type":"https://api.example.com/problems/order-shipped","orderId":3}',
        why: 'An exception that extends `ErrorResponseException` carries its own status and `ProblemDetail`, so the base handler can write it without a dedicated `@ExceptionHandler`. The domain exception decides its problem type and extra properties in one place, and every controller that throws it produces the same response.',
      },
      {
        key: 'override-hook',
        code: `${MVC_PROBLEMS}
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.context.request.WebRequest;

public class Main {
    public static void main(String[] args) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new OrderController())
            .setControllerAdvice(new ApiErrors())
            .build();
        System.out.println(mvc.perform(get("/orders?page=x")).andReturn().getResponse().getContentAsString());
    }
}

@RestController
class OrderController {
    @GetMapping("/orders")
    String list(@RequestParam int page) { return "page " + page; }
}

@RestControllerAdvice
class ApiErrors extends ResponseEntityExceptionHandler {
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body, HttpHeaders headers,
                                                             HttpStatusCode status, WebRequest request) {
        if (body instanceof ProblemDetail problem) {
            problem.setProperty("code", "REQUEST_INVALID");
        }
        return super.handleExceptionInternal(ex, body, headers, status, request);
    }
}`,
        output:
          '{"detail":"Failed to convert \'page\' with value: \'x\'","instance":"/orders","status":400,"title":"Bad Request","code":"REQUEST_INVALID"}',
        why: 'Every Spring MVC exception handled by `ResponseEntityExceptionHandler` goes through `handleExceptionInternal`, so overriding it adds an application-wide error code to all of them in one place. The conversion failure of `page=x` is reported with a 400 problem body.',
      },
    ],
  ),
  ...b.concept(
    'sb-err-design',
    3,
    'Think about who can act on the error: the client, the caller in the same code base, or an operator.',
    [
      {
        key: 'exception-hierarchy',
        question:
          'A service throws `OrderNotFoundException`, `OrderAlreadyShippedException` and `PaymentDeclinedException`. Where should the mapping to HTTP status codes live?',
        correct:
          'In one `@RestControllerAdvice` that maps each domain exception to a status and a `ProblemDetail`; the service stays unaware of HTTP.',
        wrong: [
          'In the service, by throwing `ResponseStatusException` with the right status everywhere.',
          'In each controller method, with a `try`/`catch` around every service call.',
          'In the exception classes, by giving each one an `int httpStatus` field read by the service.',
        ],
        why: 'Services are reused by batch jobs, message listeners and other services, where HTTP status codes mean nothing. Central advice keeps the translation in the web layer and in one place. `@ResponseStatus` on the exception class is acceptable for simple cases but still couples the domain to HTTP.',
      },
      {
        key: 'catch-and-ignore',
        question: 'Which way of dealing with an unexpected `SQLException` in a request is best?',
        snippet: plain(`A: catch (Exception e) { return List.of(); }
B: catch (Exception e) { e.printStackTrace(); throw e; }
C: let it propagate; a catch-all handler logs it once with a request id and returns a generic 500 problem
D: catch (Exception e) { log.error("failed", e); throw new RuntimeException(e); }  // in every layer`),
        correct: 'C',
        wrong: ['A', 'B', 'D'],
        why: 'Swallowing the error (A) returns wrong data and hides the incident. Printing to stderr (B) bypasses logging configuration. Logging and rethrowing in every layer (D) logs the same failure many times. Let unexpected errors propagate to one central handler that logs once and answers consistently.',
      },
    ],
  ),
];
