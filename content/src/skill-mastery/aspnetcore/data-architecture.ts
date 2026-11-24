import type { QuestionSource } from '@pracstack/content-model';
import { cs, plain } from '../helpers';
import { choiceFamily, outputFamily, web } from './builders';

/*
 * Data access with EF Core, and testing and architecture.
 *
 * EF Core, xUnit and WebApplicationFactory are NuGet packages the C# runner does
 * not have, so that code is shown as plain text and those questions are reviewed
 * reasoning. Where the point can be shown with the shared framework alone (DTO
 * serialization, swapping services for test doubles), the program is run.
 */

// ================================================================ EF Core

const shopModel = `public class Customer
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public List<Order> Orders { get; set; } = [];
}

public class Order
{
    public int Id { get; set; }
    public decimal Total { get; set; }
    public int CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;
}`;

export const efCoreFamilies: readonly QuestionSource[] = [
  ...choiceFamily(
    'aspnet-ef-dbcontext-basics',
    1,
    'A `DbContext` is a unit of work for one operation, such as one HTTP request.',
    [
      {
        key: 'lifetime',
        question:
          'With which lifetime does `builder.Services.AddDbContext<ShopDb>(...)` register the context by default?',
        code: plain(`// C# (Program.cs, EF Core with SQL Server)
builder.Services.AddDbContext<ShopDb>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Shop")));`),
        correct: 'Scoped: one context per request',
        wrong: [
          'Singleton: one context for the whole app',
          'Transient: a new context on every resolution',
          'It is not registered; the context is created with `new`',
        ],
        why: '`AddDbContext` registers the context as scoped, so everything that handles one request shares one context (one change tracker, one unit of work), and it is disposed when the request ends.',
      },
      {
        key: 'obtain',
        question: 'How should an endpoint or controller get its `ShopDb`?',
        code: plain(`// C#
public class OrdersController(ShopDb db) : ControllerBase
{
    // ...
}`),
        correct:
          'Through constructor (or handler parameter) injection, as shown, receiving the request’s scoped instance',
        wrong: [
          'With `new ShopDb()` inside each action method',
          'From a `static ShopDb` field shared by all controllers',
          'By resolving it from `app.Services` (the root provider) in each action',
        ],
        why: 'Injection gives the request’s scoped context, configured from the registration and disposed automatically. `new` bypasses configuration and disposal; a static field shares one non-thread-safe context across requests; resolving a scoped service from the root provider creates a context that is never disposed with the request.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-ef-context-misuse',
    2,
    'A `DbContext` is not thread-safe and its change tracker keeps every entity it has loaded.',
    [
      {
        key: 'singleton',
        question:
          'A developer registers the context as a singleton "to save the cost of creating it". What goes wrong under load?',
        code: plain(`// C#
builder.Services.AddDbContext<ShopDb>(o => o.UseSqlServer(cs), ServiceLifetime.Singleton);`),
        correct:
          'Concurrent requests share one context, which is not thread-safe, and its change tracker keeps growing and serves stale tracked entities',
        wrong: [
          'Nothing: a singleton context is the recommended setup for high traffic',
          'Each request opens a new database connection that is never closed',
          'Migrations stop working because the model is built only once',
        ],
        why: 'A context may be used by only one operation at a time; parallel requests on the same instance throw or corrupt its state. A long-lived context also accumulates tracked entities, using memory and returning old values. Creating a context is cheap; use scoped (or `AddDbContextPool` if profiling shows a need).',
      },
      {
        key: 'background-service',
        question:
          'A `BackgroundService` (registered as a singleton) must read pending orders from the database every minute. How should it get a context?',
        code: plain(`// C#
public class PendingOrdersWorker(/* ? */) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            // read pending orders ...
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }
}`),
        correct:
          'Inject `IServiceScopeFactory` (or `IDbContextFactory<ShopDb>`) and create a new scope and context for each iteration',
        wrong: [
          'Inject `ShopDb` in the constructor and reuse it for every iteration',
          'Register the worker as scoped so it can take `ShopDb` directly',
          'Store the context in a static field initialized on the first iteration',
        ],
        why: 'A singleton taking the scoped context in its constructor is a captive dependency: one context forever, with a growing change tracker. A scope (or a context factory) per unit of work gives each iteration a fresh, short-lived context. Hosted services are always singletons, whatever lifetime you would like them to have.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-ef-relationships',
    2,
    'EF Core finds relationships from navigation properties and properties named `<Navigation>Id`.',
    [
      {
        key: 'one-to-many',
        question:
          'Which relationship does EF Core infer from these C# entity classes by convention?',
        code: plain(`// C#
${shopModel}`),
        correct:
          'One-to-many: a customer has many orders, and `Order.CustomerId` is a required foreign key to `Customer`',
        wrong: [
          'Many-to-many, with a join table `CustomerOrder`',
          'One-to-one between `Customer` and `Order`',
          'None: relationships must always be configured in `OnModelCreating`',
        ],
        why: 'A collection navigation on one side (`Orders`) and a reference navigation plus `CustomerId` on the other is the one-to-many convention. The foreign key is a non-nullable `int`, so the relationship is required: every order must have a customer.',
      },
      {
        key: 'many-to-many',
        question: 'Which database tables does EF Core create for these C# entities by convention?',
        code: plain(`// C#
public class Student
{
    public int Id { get; set; }
    public List<Course> Courses { get; set; } = [];
}

public class Course
{
    public int Id { get; set; }
    public List<Student> Students { get; set; } = [];
}`),
        correct: '`Students`, `Courses`, and a join table holding pairs of student and course ids',
        wrong: [
          '`Students` and `Courses` only, each with a column listing the other’s ids',
          'Nothing: many-to-many requires an explicit join entity class',
          '`Students` and `Courses`, with a `StudentId` foreign key column on `Courses`',
        ],
        why: 'Collection navigations on both sides form a many-to-many relationship. A relational database models it with a join table, which EF Core creates automatically. A foreign key on `Courses` would allow only one student per course.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-ef-migrations-workflow',
    2,
    'Migrations are code generated from model changes, reviewed, and then applied to each database.',
    [
      {
        key: 'add-column',
        question:
          'You add a `Phone` property to the `Customer` entity. The production database already has customer data. How should the schema change be made?',
        code: plain(`// C#
public class Customer
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Phone { get; set; }   // new
}`),
        correct:
          'Add a migration (`dotnet ef migrations add AddCustomerPhone`), review the generated code, and apply it to each database (for example `dotnet ef database update` or a generated SQL script)',
        wrong: [
          'Call `Database.EnsureCreated()` at startup; it adds missing columns to existing tables',
          'Delete and recreate the database so it matches the model',
          'Nothing: EF Core adds new columns automatically on the first query',
        ],
        why: 'A migration records the change (an `AddColumn` for a nullable `Phone`) and is applied to every environment the same way. `EnsureCreated` only creates a database that does not exist and never alters an existing one; recreating the database destroys the data.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-ef-linq-translation',
    3,
    'EF Core translates the expression tree to SQL. What can it not translate, and where does the query switch to running in memory?',
    [
      {
        key: 'custom-method',
        question: 'What happens when this C# query runs?',
        code: plain(`// C#
var vips = await db.Customers
    .Where(c => IsVip(c))
    .ToListAsync();

static bool IsVip(Customer c) => c.Orders.Sum(o => o.Total) > 10_000;`),
        correct:
          'It throws an `InvalidOperationException` saying the `Where` expression could not be translated',
        wrong: [
          'EF Core loads all customers and runs `IsVip` in memory',
          'It does not compile, because `Where` only accepts lambda expressions with built-in methods',
          'EF Core inlines the body of `IsVip` and translates it to SQL',
        ],
        why: 'EF Core sees a call to an arbitrary C# method it cannot turn into SQL. Since EF Core 3.0 it refuses to silently evaluate filters on the client (which used to load whole tables) and throws instead. Write the condition inline (`c.Orders.Sum(o => o.Total) > 10_000`) so it can be translated.',
      },
      {
        key: 'early-tolist',
        question: 'What does this C# code do?',
        code: plain(`// C#
var bigOrders = db.Orders
    .ToList()
    .Where(o => o.Total > 1_000)
    .Take(10)
    .ToList();`),
        correct:
          'It reads every row of the orders table into memory, then filters and takes 10 in C#',
        wrong: [
          'It sends one SQL query with `WHERE Total > 1000` and a row limit of 10',
          'It throws, because `Where` cannot follow `ToList`',
          'It sends one query per order to check the total',
        ],
        why: '`ToList()` executes the query so far (`SELECT * FROM Orders`) and returns a `List<Order>`; everything after it is LINQ to Objects. Move `Where` and `Take` before the materializing call so they become part of the SQL.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-ef-tracking',
    3,
    'Only tracked entities are saved by `SaveChanges`, and EF Core compares their values with a snapshot taken when they were loaded.',
    [
      {
        key: 'no-tracking-save',
        question: 'What happens to the price in the database when this C# code runs?',
        code: plain(`// C#
var product = await db.Products
    .AsNoTracking()
    .FirstAsync(p => p.Id == 7);
product.Price = 19.99m;
var saved = await db.SaveChangesAsync();`),
        correct: 'Nothing is updated and `saved` is 0: the context is not tracking the product',
        wrong: [
          'The price is updated to 19.99 and `saved` is 1',
          '`SaveChangesAsync` throws because the entity was loaded without tracking',
          'All columns of product 7 are overwritten with the loaded values',
        ],
        why: '`AsNoTracking` returns entities the context does not know about, so changing them has no effect on `SaveChanges`. That is ideal for read-only queries (less memory, faster). To update, load with tracking, or call `Update`/`Attach` deliberately.',
      },
      {
        key: 'tracked-update',
        question:
          'Which SQL does `SaveChangesAsync` send for this tracked entity (SQL shown simplified)?',
        code: plain(`// C#
var product = await db.Products.FirstAsync(p => p.Id == 7);   // tracked
product.Price = 19.99m;
await db.SaveChangesAsync();`),
        correct: '`UPDATE Products SET Price = @p0 WHERE Id = @p1`',
        wrong: [
          '`UPDATE Products SET Name = @p0, Price = @p1, Stock = @p2 WHERE Id = @p3`',
          '`DELETE FROM Products WHERE Id = @p0` followed by an `INSERT`',
          'No SQL: changes to tracked entities are saved only when the context is disposed',
        ],
        why: 'Change tracking compares current values with the snapshot taken at load time and marks only `Price` as modified, so only that column is updated. Calling `db.Update(product)` instead would mark every property modified and update all columns.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-ef-migrations-production',
    4,
    'A migration is code you own: review it, and decide deliberately when and by whom it is applied.',
    [
      {
        key: 'rename',
        question:
          'A teammate renamed `Customer.Surname` to `LastName`. Their migration contains the code below. What is the problem, and the fix?',
        code: plain(`// C# (migration Up method)
migrationBuilder.DropColumn(name: "Surname", table: "Customers");
migrationBuilder.AddColumn<string>(name: "LastName", table: "Customers", nullable: false, defaultValue: "");`),
        correct:
          'Every customer’s surname would be deleted; change it to `migrationBuilder.RenameColumn("Surname", "Customers", "LastName")`',
        wrong: [
          'Nothing: EF Core copies the data from the dropped column into the new one',
          'The migration fails because a column cannot be dropped while the table has rows',
          'It is only a problem in development; production databases keep dropped columns',
        ],
        why: 'Drop-then-add destroys the column and its data; the new column is filled with the default empty string. A migration is ordinary code that must be reviewed, and a rename should be expressed as `RenameColumn`, which keeps the data.',
      },
      {
        key: 'multi-instance',
        question:
          'The API runs as six instances behind a load balancer, and each calls `db.Database.Migrate()` at startup. Which approach is recommended instead?',
        correct:
          'Apply migrations once as a separate deployment step (a reviewed SQL script or a migration bundle) before the new version starts',
        wrong: [
          'Keep `Migrate()` at startup, but start the instances in random order',
          'Call `Database.EnsureCreated()` instead of `Migrate()`',
          'Let only the first request to each instance apply pending migrations',
        ],
        why: 'Several instances migrating at once can race, and a failed migration then takes the app down at startup; the app also needs permission to alter the schema. Applying migrations once, as a controlled step, avoids both and allows review of the exact SQL. `EnsureCreated` does not apply migrations at all.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-ef-loading',
    4,
    'Count the queries in the log, and ask when each navigation property gets its data.',
    [
      {
        key: 'n-plus-one',
        question:
          'The context uses lazy-loading proxies. What explains this SQL log, and what is the fix?',
        code: plain(`// C#
var orders = await db.Orders.Where(o => o.Total > 100).ToListAsync();
foreach (var order in orders)
    Console.WriteLine($"{order.Id}: {order.Customer.Name}");

-- SQL log
SELECT o.Id, o.Total, o.CustomerId FROM Orders AS o WHERE o.Total > 100.0
SELECT c.Id, c.Name FROM Customers AS c WHERE c.Id = @p0     -- customer 12
SELECT c.Id, c.Name FROM Customers AS c WHERE c.Id = @p0     -- customer 31
SELECT c.Id, c.Name FROM Customers AS c WHERE c.Id = @p0     -- customer 7
... (one per order, 500 in total)`),
        correct:
          'An N+1 problem: each `order.Customer` access lazily loads one customer; load them up front with `Include(o => o.Customer)` or project the needed fields in the query',
        wrong: [
          'The database lacks an index on `Customers.Id`',
          'EF Core’s query cache is disabled, so the same query is compiled 500 times',
          '`ToListAsync` streams one row at a time; use `ToList` to load all rows at once',
        ],
        why: 'One query loaded the orders, then each loop iteration triggered another round trip for a customer. `Include` (one join) or a projection such as `Select(o => new { o.Id, o.Customer.Name })` gets everything in a single query. A missing index would make each query slow, not multiply their number.',
      },
      {
        key: 'no-lazy',
        question:
          'The same C# loop runs without lazy loading configured. What happens for an order whose customer was not loaded?',
        code: plain(`// C#
var orders = await db.Orders.Where(o => o.Total > 100).ToListAsync();
foreach (var order in orders)
    Console.WriteLine($"{order.Id}: {order.Customer.Name}");`),
        correct:
          '`order.Customer` is null, so the loop throws a `NullReferenceException`; add `Include(o => o.Customer)` or project the customer name',
        wrong: [
          'EF Core loads each customer on access, as with lazy loading',
          'The loop prints an empty name for every order',
          'The query fails because it references `Customer` without `Include`',
        ],
        why: 'Without lazy loading, a navigation is populated only if the related entity was loaded (by `Include`, a projection, or because it was already tracked). Declaring the navigation as non-nullable (`Customer Customer { get; set; } = null!;`) only silences the compiler; at runtime the reference is null.',
      },
      {
        key: 'cartesian',
        question:
          'This C# query became very slow as orders got more lines and payments. Why, and what helps?',
        code: plain(`// C#
var orders = await db.Orders
    .Include(o => o.Lines)      // ~50 lines per order
    .Include(o => o.Payments)   // ~20 payments per order
    .Where(o => o.CustomerId == id)
    .ToListAsync();`),
        correct:
          'One SQL query joins both collections, returning lines × payments rows per order (about 1,000); `AsSplitQuery()` loads each collection in its own query',
        wrong: [
          '`Include` runs one query per line and per payment; replace it with lazy loading',
          'Two `Include` calls are not allowed; only the second one is applied',
          'The `Where` is applied in memory after loading every order',
        ],
        why: 'Joining two independent collections in one query produces a cartesian product: each line row is repeated for every payment. A split query (or projecting just what is needed) avoids the duplication at the cost of extra round trips.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-ef-transactions',
    4,
    'By default, each `SaveChanges` call is its own transaction.',
    [
      {
        key: 'single-save',
        question:
          'If the stock update violates a database constraint, what is stored? (C#, EF Core with a relational database)',
        code: plain(`// C#
db.Orders.Add(new Order { CustomerId = 12, Total = 99.00m });
var product = await db.Products.FirstAsync(p => p.Id == 7);
product.Stock -= 1;
await db.SaveChangesAsync();`),
        correct:
          'Nothing: one `SaveChangesAsync` runs all its statements in one transaction, which is rolled back',
        wrong: [
          'The order is stored, because it was added first',
          'The stock change is stored, because it was a tracked update',
          'Whatever succeeded before the failing statement',
        ],
        why: 'EF Core wraps the statements of one `SaveChanges` call in a transaction (when no transaction is already open), so the order insert and the stock update succeed or fail together.',
      },
      {
        key: 'two-saves',
        question:
          'The second `SaveChangesAsync` fails. What is left in the database, and how do you make both steps atomic?',
        code: plain(`// C#
db.Orders.Add(order);
await db.SaveChangesAsync();          // needs order.Id generated by the database

db.Invoices.Add(new Invoice { OrderId = order.Id, Amount = order.Total });
await db.SaveChangesAsync();          // fails`),
        correct:
          'The order is committed without an invoice; wrap both calls in `await using var tx = await db.Database.BeginTransactionAsync()` and `CommitAsync()` after the second save',
        wrong: [
          'Nothing: EF Core rolls back earlier `SaveChanges` calls on the same context',
          'The order is committed, and EF Core retries the invoice automatically',
          'Nothing, because the order is only committed when the context is disposed',
        ],
        why: 'Each `SaveChanges` commits independently, so the first one is permanent. An explicit transaction spans both calls. Often the cleaner fix is a single save: add the invoice with a navigation (`order.Invoice = ...`) and EF Core orders the inserts and fills the foreign key itself.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-ef-concurrency',
    5,
    'A concurrency token is added to the `WHERE` clause of updates; what does it mean when the update affects zero rows?',
    [
      {
        key: 'row-version',
        question:
          'Two requests load product 7 at the same time; both change the price and save. The first save succeeds. What happens to the second? (C#, SQL Server)',
        code: plain(`// C#
public class Product
{
    public int Id { get; set; }
    public decimal Price { get; set; }

    [Timestamp]
    public byte[] RowVersion { get; set; } = [];
}

-- SQL sent by each save (simplified)
UPDATE Products SET Price = @p0
WHERE Id = @p1 AND RowVersion = @originalRowVersion`),
        correct:
          'Its `UPDATE` matches 0 rows, because the first save changed `RowVersion`, so EF Core throws `DbUpdateConcurrencyException`; the API can answer 409 (or 412) and let the client reload',
        wrong: [
          'It overwrites the first change: the last write wins',
          'It waits until the first transaction commits, then applies its change',
          'EF Core merges both prices automatically',
        ],
        why: 'The row version changes on every update. The second request still has the old value, so its `WHERE` clause no longer matches, and EF Core turns "0 rows affected" into `DbUpdateConcurrencyException`. That is optimistic concurrency: no locks, and conflicts are detected instead of silently lost.',
      },
      {
        key: 'no-token',
        question:
          'The same two requests run against a model with no concurrency token. What happens?',
        code: plain(`// C#
public class Product
{
    public int Id { get; set; }
    public decimal Price { get; set; }
}

-- SQL sent by each save (simplified)
UPDATE Products SET Price = @p0 WHERE Id = @p1`),
        correct:
          'Both updates succeed and the second silently overwrites the first (a lost update)',
        wrong: [
          'The second save throws `DbUpdateConcurrencyException`',
          'The database rejects the second update with a deadlock error',
          'EF Core detects that the row changed since it was loaded and reloads it',
        ],
        why: 'Without a token, the `WHERE` clause only checks the id, so both updates match and the last one wins with no error. Nobody learns that the first user’s change was lost; that is the problem concurrency tokens exist to detect.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-ef-query-boundaries',
    5,
    'Where does `IQueryable<T>` (translated to SQL) end and `IEnumerable<T>` (C# in memory) begin? And what may run concurrently on one context?',
    [
      {
        key: 'ienumerable-repository',
        question: 'What SQL does the caller’s query produce? (C#, EF Core)',
        code: plain(`// C#
public class OrderRepository(ShopDb db)
{
    public IEnumerable<Order> GetAll() => db.Orders;
}

// caller
var recent = repository.GetAll()
    .Where(o => o.CustomerId == 12)
    .OrderByDescending(o => o.Id)
    .Take(10)
    .ToList();`),
        correct:
          '`SELECT ... FROM Orders` with no filter: the return type is `IEnumerable<Order>`, so `Where`, `OrderByDescending` and `Take` run in memory over every row',
        wrong: [
          'One query with `WHERE CustomerId = 12`, `ORDER BY Id DESC` and a limit of 10',
          'It throws, because `IEnumerable` cannot be queried with LINQ',
          'Ten queries, one per order returned',
        ],
        why: 'The extension methods are chosen by the static type. On `IEnumerable<Order>` they are `Enumerable.Where` and so on, which enumerate the `DbSet` (a full table read) and filter in C#. Return specific query methods (or `IQueryable<Order>` deliberately) so the filter becomes SQL.',
      },
      {
        key: 'parallel-queries',
        question: 'What happens when this C# code runs in one request?',
        code: plain(`// C#
var countTask = db.Orders.CountAsync();
var totalTask = db.Orders.SumAsync(o => o.Total);
await Task.WhenAll(countTask, totalTask);`),
        correct:
          'It throws `InvalidOperationException`: a second operation was started on the same context before the first completed',
        wrong: [
          'Both queries run in parallel on separate connections, so it is twice as fast',
          'EF Core queues the second query until the first finishes',
          'Both queries are combined into one SQL statement',
        ],
        why: 'A `DbContext` supports only one operation at a time and detects concurrent use. Await the queries one after another, or use separate contexts (for example from `IDbContextFactory`) if they really must run in parallel.',
      },
    ],
  ),
];

// ================================================================ Testing and architecture

export const testingArchitectureFamilies: readonly QuestionSource[] = [
  ...choiceFamily(
    'aspnet-test-kinds',
    1,
    'A unit test checks one piece of logic in isolation; an integration test checks that real components work together.',
    [
      {
        key: 'unit',
        question:
          'You want to check that `PriceCalculator.Total` applies a 10% discount to orders over 100. Which kind of test fits best?',
        correct: 'A unit test that calls `PriceCalculator` directly with a few amounts',
        wrong: [
          'An integration test that starts the API and posts orders over HTTP',
          'An end-to-end test that clicks through the web shop in a browser',
          'A load test that sends many orders and checks the averages',
        ],
        why: 'The rule is pure logic, so a unit test checks it fastest and most precisely, and pinpoints the failure. Going through HTTP or a browser adds slow, unrelated moving parts that do not make the discount check more reliable.',
      },
      {
        key: 'integration',
        question:
          'You want to check that `POST /api/orders` rejects anonymous callers with 401 and that a valid order comes back as JSON with a `Location` header. Which kind of test fits best?',
        correct:
          'An integration test that hosts the app in memory (for example with `WebApplicationFactory`) and sends real HTTP requests',
        wrong: [
          'A unit test that calls the endpoint handler method directly',
          'A unit test of the `Order` class',
          'A manual check with an HTTP client before each release',
        ],
        why: 'Routing, authentication, model binding and serialization are framework behavior wired up in `Program.cs`. Calling the handler directly skips all of them, so only a test that goes through the real pipeline can verify this, and automating it keeps it checked on every build.',
      },
    ],
  ),
  ...choiceFamily('aspnet-test-tdd-cycle', 1, 'Red, green, refactor: each step has one job.', [
    {
      key: 'order',
      question: 'What is the order of the test-driven development cycle?',
      correct:
        'Write a failing test, write just enough code to pass it, then refactor with the tests green',
      wrong: [
        'Write the code, write tests for it, then refactor',
        'Refactor the existing code, write a failing test, then make it pass',
        'Write all the tests for the feature, then write all the code',
      ],
      why: 'Seeing the test fail first proves it can detect the missing behavior. Passing it with minimal code keeps the design driven by tests, and refactoring happens only while all tests are green, so behavior is preserved.',
    },
    {
      key: 'next-step',
      question:
        'You have just written a test for "orders over 100 ship free" and watched it fail. What is the next step in TDD?',
      correct: 'Write the simplest code that makes this test pass',
      wrong: [
        'Implement the full shipping-rules module, including rules not tested yet',
        'Refactor the shipping code before making the test pass',
        'Delete the test, since a failing test blocks the build',
      ],
      why: 'Green comes next, with the simplest change that passes. Building untested rules skips the feedback loop, and refactoring while a test is red mixes two kinds of change. A failing test at this point is expected: it is the specification of the next behavior.',
    },
  ]),
  ...choiceFamily(
    'aspnet-test-doubles',
    2,
    'Stub: canned answers. Fake: a working but simplified implementation. Spy: records how it was called, for later assertions.',
    [
      {
        key: 'fake',
        question: 'Which kind of test double is `InMemoryOrderRepository`?',
        code: cs(`var repository = new InMemoryOrderRepository();
repository.Add(new Order(1, 50m));
repository.Add(new Order(2, 150m));
Console.WriteLine(repository.Find(2)?.Total);

record Order(int Id, decimal Total);

interface IOrderRepository
{
    void Add(Order order);
    Order? Find(int id);
}

class InMemoryOrderRepository : IOrderRepository
{
    private readonly Dictionary<int, Order> orders = [];
    public void Add(Order order) => orders[order.Id] = order;
    public Order? Find(int id) => orders.GetValueOrDefault(id);
}`),
        correct:
          'A fake: a real, working implementation that takes a shortcut (memory instead of a database)',
        wrong: ['A stub', 'A spy', 'A dummy'],
        why: 'It actually stores and finds orders, so tests can use it like the real repository, just faster and without a database. A stub would return fixed answers regardless of what was added; a dummy is passed only to satisfy a parameter and never used.',
      },
      {
        key: 'stub',
        question: 'Which kind of test double is `FixedClock`?',
        code: cs(`var clock = new FixedClock();
Console.WriteLine(clock.Today);

interface IClock { DateOnly Today { get; } }

class FixedClock : IClock
{
    public DateOnly Today => new(2025, 1, 31);
}`),
        correct: 'A stub: it returns a canned answer so the test controls the input',
        wrong: ['A fake', 'A spy', 'A dummy'],
        why: 'It has no behavior beyond returning a fixed value, which makes date-dependent logic deterministic in tests. It does not record anything (spy) or implement real clock logic (fake).',
      },
      {
        key: 'spy',
        question: 'Which kind of test double is `RecordingEmailSender`?',
        code: cs(`var sender = new RecordingEmailSender();
sender.Send("ana@example.com", "Your order shipped");
Console.WriteLine(sender.Sent.Count);

interface IEmailSender { void Send(string to, string subject); }

class RecordingEmailSender : IEmailSender
{
    public List<(string To, string Subject)> Sent { get; } = [];
    public void Send(string to, string subject) => Sent.Add((to, subject));
}`),
        correct:
          'A spy: it records the calls it receives so the test can assert on them afterwards',
        wrong: ['A stub', 'A fake', 'A dummy'],
        why: 'The test lets the code run, then inspects `Sent` to verify that the right email was sent. Recording interactions for later verification is what makes it a spy.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-test-bdd',
    2,
    'Given sets up the context, When is the single action, Then is the observable outcome, all in business language.',
    [
      {
        key: 'good-scenario',
        question:
          'Which scenario is the best Given/When/Then specification of the rule "orders over 100 ship free"?',
        correct:
          'Given a cart totalling 120 / When the customer checks out / Then the shipping cost is 0',
        wrong: [
          'Given the user clicks the button with id `btn-add` twice / When the page reloads / Then the div `#ship` shows 0',
          'Given a cart / When `ShippingCalculator.Compute` is called with 120 and `isPremium = false` / Then it returns 0',
          'Given a cart totalling 120 / When the customer checks out and then cancels and then checks out again / Then the shipping cost is 0 and an email is sent',
        ],
        why: 'A good scenario describes behavior in the domain’s language, with one action and a clear outcome. The alternatives tie it to UI details, to internal method names (implementation, not behavior), or bundle several actions and outcomes into one scenario.',
      },
      {
        key: 'arrange-act-assert',
        question:
          'A team writes their unit tests in Arrange / Act / Assert sections. Which BDD step corresponds to Act?',
        correct: 'When',
        wrong: ['Given', 'Then', 'Background'],
        why: 'Arrange sets up the context (Given), Act performs the one behavior under test (When), and Assert checks the outcome (Then). The structure is the same; BDD phrases it in business language.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-test-swap-dependencies',
    3,
    [
      'Integration tests reuse the app’s registrations, then register test doubles afterwards. Which registration does the endpoint receive?',
    ],
    [
      {
        key: 'fixed-clock',
        code: web({
          services: `builder.Services.AddSingleton<IClock, SystemClock>();
// What an integration test adds afterwards (for example in ConfigureTestServices):
builder.Services.AddSingleton<IClock>(new FixedClock(new DateOnly(2025, 1, 31)));`,
          app: `app.MapGet("/invoices/due-date", (IClock clock) => clock.Today.AddDays(30).ToString("yyyy-MM-dd"));`,
          client: `Console.WriteLine(await http.GetStringAsync("/invoices/due-date"));`,
          types: `interface IClock { DateOnly Today { get; } }
class SystemClock : IClock { public DateOnly Today => DateOnly.FromDateTime(DateTime.UtcNow); }
class FixedClock(DateOnly today) : IClock { public DateOnly Today => today; }`,
        }),
        output: '2025-03-02',
        why: 'The last registration of `IClock` wins, so the endpoint gets the fixed clock and the result is deterministic: 31 January plus 30 days is 2 March 2025. Registering test doubles after the app’s own services is exactly why `ConfigureTestServices` runs last.',
      },
      {
        key: 'payment-spy',
        code: web({
          usings: ['System.Net.Http.Json'],
          services: `builder.Services.AddSingleton<IPaymentGateway, CardGateway>();
// What an integration test adds afterwards:
var gateway = new RecordingGateway();
builder.Services.AddSingleton<IPaymentGateway>(gateway);`,
          app: `app.MapPost("/checkout", (Checkout request, IPaymentGateway payments) =>
{
    if (request.Amount <= 0) return Results.BadRequest();
    payments.Charge(request.Amount);
    return Results.Created("/orders/1", null);
});`,
          client: `Console.WriteLine((int)(await http.PostAsJsonAsync("/checkout", new { amount = 0 })).StatusCode);
Console.WriteLine((int)(await http.PostAsJsonAsync("/checkout", new { amount = 25.5 })).StatusCode);
Console.WriteLine(string.Join(",", gateway.Charges));`,
          types: `record Checkout(decimal Amount);
interface IPaymentGateway { void Charge(decimal amount); }
class CardGateway : IPaymentGateway { public void Charge(decimal amount) => throw new InvalidOperationException("real card network"); }
class RecordingGateway : IPaymentGateway
{
    public List<decimal> Charges { get; } = [];
    public void Charge(decimal amount) => Charges.Add(amount);
}`,
        }),
        output: '400\n201\n25.5',
        why: 'The recording gateway replaces the real one, so the test goes through routing, binding and the endpoint over real HTTP without touching a card network. The invalid request is rejected before any charge, and the spy shows exactly one charge of 25.5.',
      },
    ],
  ),
  ...outputFamily(
    'aspnet-arch-dto-vs-entity',
    3,
    [
      'The JSON serializer writes every public property of the object it is given, and follows its navigation properties.',
    ],
    [
      {
        key: 'leak',
        code: web({
          app: `app.MapGet("/users/{id:int}", (int id) => new User(id, "ana", "AQAAAAIAAYagAAAAEKx..."));`,
          client: `Console.WriteLine(await http.GetStringAsync("/users/1"));`,
          types: 'record User(int Id, string Name, string PasswordHash);',
        }),
        output: '{"id":1,"name":"ana","passwordHash":"AQAAAAIAAYagAAAAEKx..."}',
        why: 'Returning the stored entity exposes every property, including the password hash. A response DTO such as `record UserResponse(int Id, string Name)` makes the public contract explicit, and adding a column to the entity can no longer leak it.',
      },
      {
        key: 'cycle',
        code: web({
          app: `app.MapGet("/orders/{id:int}", (int id) =>
{
    var customer = new Customer("Ana");
    var order = new Order(id, customer);
    customer.Orders.Add(order);
    return order;
});`,
          client: `Console.WriteLine((int)(await http.GetAsync("/orders/1")).StatusCode);`,
          types: `record Customer(string Name) { public List<Order> Orders { get; } = []; }
record Order(int Id, Customer Customer);`,
        }),
        output: '500',
        why: 'Entities with navigations in both directions form a cycle (order, customer, orders, order, ...), and the serializer throws when it detects one, so the request fails with 500. A DTO shaped for the response (`OrderResponse(int Id, string CustomerName)`) has no cycles and no accidental data.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-arch-service-layer',
    3,
    'Keep HTTP concerns at the edge and business rules in code that does not know about HTTP.',
    [
      {
        key: 'fat-endpoint',
        question:
          'The same discount and stock rules are about to be needed by a message-queue consumer too. What is the best refactoring?',
        code: cs(`using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

var app = WebApplication.CreateSlimBuilder().Build();
var stock = new Dictionary<string, int> { ["A1"] = 5 };
app.MapPost("/orders", (PlaceOrder request) =>
{
    if (!stock.TryGetValue(request.Sku, out var available) || available < request.Quantity)
        return Results.Conflict("Out of stock");
    var total = request.Quantity * 20m;
    if (total > 100m) total *= 0.9m;
    stock[request.Sku] = available - request.Quantity;
    return Results.Ok(new { total });
});

record PlaceOrder(string Sku, int Quantity);`),
        correct:
          'Move the rules into an `OrderService` with a method such as `PlaceOrder(sku, quantity)`; the endpoint and the consumer both call it and only translate its result to their protocol',
        wrong: [
          'Have the queue consumer call the HTTP endpoint on localhost',
          'Copy the rules into the consumer and keep both copies in sync',
          'Move the rules into a middleware so every request runs them',
        ],
        why: 'A service layer gives the rules one home that does not depend on HTTP, so any entry point (and a unit test) can use it. Calling your own API over HTTP adds latency and failure modes; duplication drifts; middleware runs for every request and still ties the rules to HTTP.',
      },
      {
        key: 'leaky-service',
        question: 'What is the main problem with this service method’s design?',
        code: cs(`using Microsoft.AspNetCore.Http;

class OrderService
{
    public IResult Cancel(HttpContext context, int orderId)
    {
        var user = context.User.Identity?.Name;
        if (user is null) return Results.Unauthorized();
        return Results.NoContent();
    }
}`),
        correct:
          'It depends on HTTP types (`HttpContext`, `IResult`), so it cannot be reused outside a request and is awkward to unit test; pass the user id in and return a domain result instead',
        wrong: [
          'Service methods must be `static`',
          'It should take `HttpRequest` instead of `HttpContext`',
          '`IResult` is slower than returning a status code `int`',
        ],
        why: 'The service decides HTTP status codes and reads the user from `HttpContext`, which is the endpoint’s job. With plain inputs and a domain result (for example `CancelResult.NotFound`), the endpoint maps outcomes to HTTP and the service works anywhere.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-test-integration-setup',
    4,
    'Integration tests share the app’s real setup. What runs last, and what state is shared between tests?',
    [
      {
        key: 'configure-test-services',
        question:
          'This xUnit integration test (C#, uses the `Microsoft.AspNetCore.Mvc.Testing` package) replaces the email sender. Why is `ConfigureTestServices` used rather than `ConfigureServices`?',
        code: plain(`// C#
public class SignupTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task Signup_sends_welcome_email()
    {
        var emails = new RecordingEmailSender();
        var client = factory.WithWebHostBuilder(b =>
            b.ConfigureTestServices(s => s.AddSingleton<IEmailSender>(emails)))
            .CreateClient();

        var res = await client.PostAsJsonAsync("/signup", new { email = "ana@example.com" });

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        Assert.Single(emails.Sent);
    }
}`),
        correct:
          '`ConfigureTestServices` runs after the app’s own service registrations, so the recording sender is the last `IEmailSender` registered and wins',
        wrong: [
          '`ConfigureServices` is not available on `IWebHostBuilder`',
          '`ConfigureTestServices` also disables authentication',
          '`ConfigureTestServices` registers services as singletons, which tests require',
        ],
        why: 'The factory boots the real `Program`, which registers the real sender. Test registrations must come after it so that single resolution picks the double; `ConfigureTestServices` is guaranteed to run after the app’s registrations.',
      },
      {
        key: 'shared-database',
        question:
          'Integration tests pass one at a time but fail randomly when the whole suite runs, with errors like "expected 1 order, found 3". All tests use the same test database. What is the fix?',
        correct:
          'Isolate test data: give each test (or test class) its own database or schema, or reset or roll back the data around each test',
        wrong: [
          'Add retries to the flaky tests',
          'Replace the database with EF Core’s in-memory provider, which behaves exactly like SQL Server',
          'Run the tests in alphabetical order so the data is always the same',
        ],
        why: 'The tests depend on shared mutable state, so their outcome depends on what ran before or alongside them. Isolation makes each test independent. Retries hide the bug, ordering is fragile, and the in-memory provider is not relational (no SQL translation, constraints or transactions as in the real database).',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-arch-repository',
    4,
    'A `DbContext` already is a unit of work, and each `DbSet<T>` already behaves like a repository.',
    [
      {
        key: 'generic-repository',
        question: 'What is a real cost of putting this generic repository in front of EF Core?',
        code: plain(`// C#
public interface IRepository<T> where T : class
{
    IEnumerable<T> GetAll();
    T? GetById(int id);
    void Add(T entity);
}`),
        correct:
          'Queries can no longer be composed in the database: callers filter `GetAll()` in memory, or the interface grows one method per query',
        wrong: [
          'EF Core cannot be used behind an interface at all',
          'Transactions become impossible because each repository has its own connection',
          'It forces lazy loading on all entities',
        ],
        why: 'Returning `IEnumerable<T>` hides EF Core’s query translation, so filtering, paging and projection happen after loading everything, or each new need adds a method. A generic wrapper adds a layer without adding meaning. Repositories pay off when they are specific (`GetOpenOrdersFor(customerId)`) and owned by the domain.',
      },
      {
        key: 'unit-testing',
        question:
          'A team wants fast unit tests for `OrderService` without a database. Which approach is sound?',
        correct:
          'Have the service depend on a narrow, query-specific interface (for example `IOrderReader.GetOpenOrdersFor(customerId)`) and use a fake in unit tests, with integration tests against a real database for the EF Core queries',
        wrong: [
          'Mock `DbSet<Order>` so that LINQ queries run against an in-memory list, which proves the SQL translation works',
          'Use EF Core’s in-memory provider, which guarantees the same behavior as the production database',
          'Skip tests for data access, since EF Core is already tested by Microsoft',
        ],
        why: 'A narrow interface is trivial to fake, and keeps business logic tests fast and focused. Whether the real queries translate and behave correctly can only be shown against a real database. Mocked `DbSet`s and the in-memory provider run LINQ to Objects, so they cannot catch translation errors or relational behavior.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-arch-boundaries',
    5,
    'Dependencies point inwards, towards the domain. Distribution is a cost you pay for independent scaling and deployment, not a code-organization tool.',
    [
      {
        key: 'dependency-rule',
        question:
          'A solution follows clean architecture with projects Domain, Application, Infrastructure (EF Core, email) and Api. Which project reference breaks the dependency rule?',
        correct:
          'Domain references Infrastructure, to use the EF Core `DbContext` in an entity method',
        wrong: [
          'Application references Domain',
          'Infrastructure references Application, to implement its `IOrderRepository` interface',
          'Api references Infrastructure, to register its implementations in dependency injection',
        ],
        why: 'The domain is the innermost layer and must not depend on persistence or frameworks. Infrastructure implementing interfaces defined by Application is the intended inversion, and the Api project is the composition root that wires implementations up.',
      },
      {
        key: 'modular-monolith',
        question:
          'A team of six builds one product with orders, inventory and billing. Placing an order must reserve stock atomically, load is moderate, and everything is released together. Which architecture fits best?',
        correct:
          'A modular monolith: one deployable with enforced module boundaries (each module owns its data and exposes a public API), so modules could be extracted later',
        wrong: [
          'Microservices for orders, inventory and billing, with a distributed transaction to reserve stock',
          'Microservices that all share one database, so they can still use transactions',
          'A single project with no module boundaries, since it is deployed as one unit anyway',
        ],
        why: 'Microservices add network failures, distributed consistency and operational cost, which this team does not need: they gain nothing from independent deployment or scaling. Sharing one database between services couples them anyway. Clear module boundaries keep the code maintainable and make later extraction possible.',
      },
      {
        key: 'extract-service',
        question:
          'Which situation is the strongest reason to extract a module into a separate service?',
        correct:
          'Its load is many times that of the rest of the system, and a separate team owns it and needs to release it on its own schedule',
        wrong: [
          'The codebase has grown large and the team wants cleaner code',
          'The team wants to try a newer framework version in one part of the code',
          'The module has many classes',
        ],
        why: 'Independent scaling and independent deployment by an autonomous team are what a service boundary buys. Code quality and size are addressed with modules inside one codebase; a network boundary does not fix tangled code, it makes it distributed.',
      },
    ],
  ),
  ...choiceFamily(
    'aspnet-arch-outbox',
    5,
    'The database commit and the message publish are two separate systems: what if the process crashes between them?',
    [
      {
        key: 'crash-between',
        question:
          'After placing an order, the service saves it and then publishes an `OrderPlaced` message for the inventory service. What failure does this design allow, and what fixes it?',
        code: plain(`// C#
db.Orders.Add(order);
await db.SaveChangesAsync();
await bus.PublishAsync(new OrderPlaced(order.Id));   // process may crash before this line`),
        correct:
          'The order can be committed while the message is never sent; write the message to an outbox table in the same transaction as the order, and publish from the outbox afterwards',
        wrong: [
          'None: `SaveChangesAsync` and `PublishAsync` run in one transaction',
          'Publish the message first, then save the order, so the message is never lost',
          'Wrap both calls in `try/catch` and log any exception',
        ],
        why: 'A crash or broker outage after the commit loses the message, and inventory never learns about the order. Publishing first has the opposite problem: a message for an order that was never saved. The outbox pattern makes "order saved" and "message recorded" one atomic database commit; a relay then publishes with retries (consumers must tolerate duplicates).',
      },
      {
        key: 'duplicates',
        question:
          'With an outbox relay, the relay publishes a message and crashes before marking it as sent, so it publishes it again after restarting. How should the inventory consumer handle this?',
        correct:
          'Make the handler idempotent, for example by recording processed message ids and skipping ones already seen',
        wrong: [
          'Nothing: an outbox guarantees each message is delivered exactly once',
          'Reject every message whose id is lower than the last one processed',
          'Disable the relay’s retries so duplicates cannot happen',
        ],
        why: 'An outbox gives at-least-once delivery: no message is lost, but some may arrive twice. Idempotent consumers turn that into exactly-once effects. Ordering by id is not guaranteed across retries, and disabling retries brings back lost messages.',
      },
    ],
  ),
];
