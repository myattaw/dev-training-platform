import type { QuestionSource } from '@pracstack/content-model';
import { b, dbProgram } from './program';

/*
 * Database performance: lazy evaluation and QuerySet caching, N+1 queries,
 * select_related and prefetch_related, only()/values(), exists() and count(),
 * bulk operations and transactions. Query counts are measured with
 * CaptureQueriesContext, so they are exact and deterministic.
 */

/** Three authors with two books each, and a query counter. */
const LIBRARY = `from django.db import connection, models
from django.test.utils import CaptureQueriesContext

class Author(models.Model):
    name = models.CharField(max_length=50)

    class Meta:
        app_label = "library"

class Book(models.Model):
    title = models.CharField(max_length=50)
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name="books")

    class Meta:
        app_label = "library"

with connection.schema_editor() as editor:
    editor.create_model(Author)
    editor.create_model(Book)

for name in ["Ada", "Grace", "Linus"]:
    author = Author.objects.create(name=name)
    Book.objects.create(title=name + " I", author=author)
    Book.objects.create(title=name + " II", author=author)`;

export const library = (code: string, imports = '') =>
  dbProgram(`${imports ? `${imports.trim()}\n` : ''}${LIBRARY}

${code.trim()}`);

export const performanceFamilies: readonly QuestionSource[] = [
  ...b.output(
    'dj-perf-lazy',
    1,
    [
      'Building a QuerySet runs no SQL; iterating, `len()`, `list()` or `bool()` does.',
      'An evaluated QuerySet caches its rows.',
    ],
    [
      {
        key: 'when-queries-run',
        code: library(`with CaptureQueriesContext(connection) as ctx:
    qs = Book.objects.filter(title__endswith="I").exclude(author__name="Ada")
    print(len(ctx.captured_queries))
    titles = [b.title for b in qs]
    print(len(ctx.captured_queries))
    again = [b.title for b in qs]
    print(len(ctx.captured_queries))`),
        output: '0\n1\n1',
        why: 'Chaining `filter()` and `exclude()` only builds the query. The first iteration runs it and stores the rows in the QuerySet’s cache, so iterating the same QuerySet again runs no new query.',
      },
      {
        key: 'new-queryset',
        code: library(`with CaptureQueriesContext(connection) as ctx:
    qs = Book.objects.all()
    list(qs)
    list(qs.all())
    list(qs.filter(title__startswith="A"))
    qs.count()
print(len(ctx.captured_queries))`),
        output: '3',
        why: '`list(qs)` runs a query and fills `qs`’s cache. `qs.all()` and `qs.filter()` return new QuerySets with empty caches, so each runs its own query. `count()` on an already evaluated QuerySet uses the cached rows (no query). Keep a reference to the evaluated QuerySet when you need the rows again.',
      },
    ],
  ),
  ...b.output(
    'dj-perf-n-plus-one',
    2,
    [
      'Accessing a foreign key that was not loaded runs one query per object.',
      'Count: one query for the list, plus one for each related object accessed.',
    ],
    [
      {
        key: 'forward-fk',
        code: library(`with CaptureQueriesContext(connection) as ctx:
    for book in Book.objects.all():
        book.author.name
print(len(ctx.captured_queries))`),
        output: '7',
        why: 'One query loads the six books, then each `book.author` runs its own query: 1 + 6 = 7. This is the N+1 problem; it grows with the data and is often invisible in development with a few rows.',
      },
      {
        key: 'reverse-manager',
        code: library(`with CaptureQueriesContext(connection) as ctx:
    for author in Author.objects.all():
        author.books.count()
print(len(ctx.captured_queries))`),
        output: '4',
        why: 'One query for the three authors and one `COUNT` per author. Annotating with `Count("books")` would get all counts in a single query.',
      },
      {
        key: 'fk-id',
        code: library(`with CaptureQueriesContext(connection) as ctx:
    ids = [book.author_id for book in Book.objects.all()]
print(len(ctx.captured_queries), ids)`),
        output: '1 [1, 1, 2, 2, 3, 3]',
        why: 'The foreign key column `author_id` is part of the book row, so reading it needs no extra query. Only `book.author` (the related object) triggers a lookup.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-perf-related-loading',
    3,
    '`select_related` joins single-valued relations; `prefetch_related` runs one extra query per relation.',
    [
      {
        key: 'select-related',
        code: library(`with CaptureQueriesContext(connection) as ctx:
    names = [b.author.name for b in Book.objects.select_related("author")]
print(len(ctx.captured_queries))`),
        correct: '1',
        wrong: ['7', '2', '6'],
        why: '`select_related("author")` adds a JOIN, so each book arrives with its author already loaded: one query in total.',
      },
      {
        key: 'prefetch-related',
        code: library(`with CaptureQueriesContext(connection) as ctx:
    counts = [len(a.books.all()) for a in Author.objects.prefetch_related("books")]
print(len(ctx.captured_queries), counts)`),
        correct: '2 [2, 2, 2]',
        wrong: ['1 [2, 2, 2]', '4 [2, 2, 2]', '2 [6, 6, 6]'],
        why: 'For a reverse foreign key (many books per author) a JOIN would duplicate rows, so `prefetch_related` runs a second query (`WHERE author_id IN (...)`) and distributes the books in Python: 2 queries for any number of authors.',
      },
      {
        key: 'prefetch-then-filter',
        code: library(`with CaptureQueriesContext(connection) as ctx:
    result = [a.books.filter(title__endswith="II").count() for a in Author.objects.prefetch_related("books")]
print(len(ctx.captured_queries))`),
        correct: '5',
        wrong: ['2', '1', '4'],
        why: 'The prefetched rows are used only by `a.books.all()`. Calling `filter()` (or `count()` on the manager) creates a new query per author, so the prefetch is wasted: 2 + 3 = 5. Filter in Python over `a.books.all()`, or use `Prefetch("books", queryset=...)`.',
      },
    ],
  ),
  ...b.fails(
    'dj-perf-select-related-misuse',
    4,
    '`select_related` only follows foreign keys and one-to-one relations forward (and one-to-one backward).',
    [
      {
        key: 'reverse-fk',
        question: 'This optimization attempt fails. Why?',
        code: library(`authors = list(Author.objects.select_related("books"))`),
        error: 'FieldError',
        correct:
          '`books` is a reverse foreign key (many books per author), which `select_related` cannot join; use `prefetch_related("books")`.',
        wrong: [
          '`select_related` needs the model name `"book"`, not the related name.',
          '`select_related` must come after `all()`.',
          'Related names cannot be used in queries.',
        ],
        why: "Django raises `FieldError: Invalid field name(s) given in select_related: 'books'. Choices are: (none)`. A JOIN can only fetch one related row per row; multi-valued relations need `prefetch_related`.",
      },
      {
        key: 'typo',
        question: 'This query fails. Why?',
        code: library(`books = list(Book.objects.select_related("writer"))`),
        error: 'FieldError',
        correct: 'There is no relation named `writer` on `Book`; the foreign key is `author`.',
        wrong: [
          '`select_related` cannot be combined with `list()`.',
          'Unknown relation names are silently ignored, so the error must come from elsewhere.',
          '`select_related` needs `"author_id"`.',
        ],
        why: '`select_related` validates its arguments and lists the valid choices (`author`) in the `FieldError`, which makes typos easy to fix. The relation name is the field name, not the `_id` column.',
      },
    ],
  ),
  ...b.output(
    'dj-perf-only-values',
    3,
    [
      '`only()` loads some columns; reading a deferred field later runs a query for that object.',
      '`values()` returns dictionaries without building model instances.',
    ],
    [
      {
        key: 'deferred-access',
        code: library(`with CaptureQueriesContext(connection) as ctx:
    books = list(Book.objects.only("id"))
    titles = [b.title for b in books]
print(len(ctx.captured_queries))`),
        output: '7',
        why: '`only("id")` defers `title`, so each `b.title` loads it with one query per book: 1 + 6. `only()` helps when you truly skip the columns; otherwise it creates its own N+1.',
      },
      {
        key: 'values',
        code: library(`with CaptureQueriesContext(connection) as ctx:
    rows = list(Book.objects.order_by("id").values("title", "author__name")[:2])
print(len(ctx.captured_queries), rows)`),
        output:
          "1 [{'title': 'Ada I', 'author__name': 'Ada'}, {'title': 'Ada II', 'author__name': 'Ada'}]",
        why: '`values()` selects exactly the named columns (joining the author for `author__name`) and returns dictionaries, which is cheaper than model instances for read-only exports and reports. The slice becomes `LIMIT 2`.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-perf-exists-count',
    2,
    'Ask the database only for what you need: a yes/no, a number, or the rows.',
    [
      {
        key: 'exists',
        code: library(`with CaptureQueriesContext(connection) as ctx:
    found = Book.objects.filter(author__name="Ada").exists()
sql = ctx.captured_queries[0]["sql"]
print(found, "LIMIT 1" in sql, "title" in sql)`),
        correct: 'True True False',
        wrong: ['True False True', 'True True True', '2 True False'],
        why: '`exists()` runs `SELECT 1 ... LIMIT 1`: it stops at the first match and fetches no columns. `if queryset:` would load every matching row just to test for emptiness.',
      },
      {
        key: 'len-vs-count',
        code: library(`with CaptureQueriesContext(connection) as ctx:
    n = Book.objects.count()
sql = ctx.captured_queries[0]["sql"]
print(n, "COUNT(*)" in sql)`),
        correct: '6 True',
        wrong: ['6 False', '1 True', '0 True'],
        why: '`count()` asks the database for `SELECT COUNT(*)`, transferring one number. `len(Book.objects.all())` would load all six rows into Python first; use `len()` only when you need the rows anyway.',
      },
    ],
  ),
  ...b.output(
    'dj-perf-bulk',
    3,
    [
      '`bulk_create()` inserts many rows in one query; it does not call `save()`.',
      '`update()` changes rows in the database without loading them.',
    ],
    [
      {
        key: 'bulk-create',
        code: library(`with CaptureQueriesContext(connection) as ctx:
    Book.objects.bulk_create([Book(title=f"Vol {i}", author_id=1) for i in range(50)])
inserts = [q for q in ctx.captured_queries if q["sql"].startswith("INSERT")]
print(len(inserts), Book.objects.count())
with CaptureQueriesContext(connection) as ctx:
    Book.objects.filter(title__startswith="Vol").update(author_id=2)
print(len(ctx.captured_queries))`),
        output: '1 56\n1',
        why: 'Fifty `create()` calls would run fifty INSERTs; `bulk_create()` sends them in one multi-row INSERT (wrapped in a transaction, and split into batches for very large lists or with `batch_size`). `update()` is one UPDATE however many rows match.',
      },
      {
        key: 'save-skipped',
        code: dbProgram(`from django.db import connection, models

class Page(models.Model):
    title = models.CharField(max_length=50)
    slug = models.CharField(max_length=50, blank=True)

    class Meta:
        app_label = "cms"

    def save(self, *args, **kwargs):
        self.slug = self.title.lower().replace(" ", "-")
        super().save(*args, **kwargs)

with connection.schema_editor() as editor:
    editor.create_model(Page)

Page.objects.create(title="About Us")
Page.objects.bulk_create([Page(title="Contact Us")])
Page.objects.filter(title="About Us").update(title="About")
print(list(Page.objects.order_by("id").values_list("title", "slug")))`),
        output: "[('About', 'about-us'), ('Contact Us', '')]",
        why: '`bulk_create()` and `update()` work directly in SQL: custom `save()` methods (and `pre_save`/`post_save` signals) do not run. So the bulk-created page has no slug and the updated page keeps its old one. Put such logic where bulk paths can reach it, or set the values yourself.',
      },
    ],
  ),
  ...b.output(
    'dj-perf-transactions',
    3,
    [
      'An exception inside `transaction.atomic()` rolls back everything in the block.',
      'A nested `atomic()` creates a savepoint: only the inner block is rolled back when its exception is caught.',
    ],
    [
      {
        key: 'rollback',
        code: library(
          `try:
    with transaction.atomic():
        Book.objects.create(title="Draft", author_id=1)
        Author.objects.filter(name="Ada").update(name="Ada L.")
        raise ValueError("payment failed")
except ValueError:
    pass
print(Book.objects.filter(title="Draft").exists(), Author.objects.filter(name="Ada").exists())`,
          'from django.db import transaction',
        ),
        output: 'False True',
        why: 'The exception leaves the `atomic()` block, so both the insert and the update are rolled back: all or nothing. Catching the exception outside the block is the right place; catching it inside would let the block commit.',
      },
      {
        key: 'savepoint',
        code: library(
          `with transaction.atomic():
    Book.objects.create(title="Kept", author_id=1)
    try:
        with transaction.atomic():
            Book.objects.create(title="Dropped", author_id=1)
            raise ValueError("bad row")
    except ValueError:
        pass
    Book.objects.create(title="Also kept", author_id=2)
print(sorted(Book.objects.filter(title__in=["Kept", "Dropped", "Also kept"]).values_list("title", flat=True)))`,
          'from django.db import transaction',
        ),
        output: "['Also kept', 'Kept']",
        why: 'The inner `atomic()` is a savepoint: its failure rolls back only `Dropped`, and the outer transaction continues and commits the other two rows.',
      },
    ],
  ),
  ...b.fails(
    'dj-perf-broken-transaction',
    5,
    'After a database error inside `atomic()`, the transaction cannot be used until it is rolled back.',
    [
      {
        key: 'caught-inside',
        question:
          'The code catches a duplicate-key error inside one `atomic()` block and continues. Why does the next query fail?',
        code: dbProgram(`from django.db import IntegrityError, connection, models, transaction

class Account(models.Model):
    email = models.CharField(max_length=50, unique=True)

    class Meta:
        app_label = "users"

with connection.schema_editor() as editor:
    editor.create_model(Account)

Account.objects.create(email="ada@example.com")
with transaction.atomic():
    try:
        Account.objects.create(email="ada@example.com")
    except IntegrityError:
        pass
    Account.objects.create(email="grace@example.com")`),
        error: 'TransactionManagementError',
        correct:
          'The failed query marked the transaction for rollback; wrap the risky statement in its own `atomic()` (a savepoint) so only that part is rolled back.',
        wrong: [
          'SQLite allows only one INSERT per transaction.',
          'The `IntegrityError` must be re-raised, or Django raises it again on the next query.',
          'Unique constraints are checked at commit time, so the second insert is the duplicate.',
        ],
        why: "Django raises `TransactionManagementError: An error occurred in the current transaction. You can't execute queries until the end of the 'atomic' block.` Catching a database error inside `atomic()` without a savepoint leaves the transaction broken. `with transaction.atomic(): Account.objects.create(...)` inside the `try` fixes it.",
      },
    ],
  ),
  ...b.concept('dj-perf-strategy', 4, 'Measure first, then fix the biggest cost.', [
    {
      key: 'diagnose',
      question: 'An order list page became slow as data grew. What is the best first step?',
      correct:
        'Measure the queries the page runs (Django Debug Toolbar, `assertNumQueries`, or database logs) and look for N+1 patterns and slow queries before changing code.',
      wrong: [
        'Add a cache in front of every view.',
        'Replace the ORM with raw SQL everywhere.',
        'Add a database index on every column.',
      ],
      why: 'Most ORM slowdowns are query counts (N+1) or missing indexes for specific filters, and both show up when you measure. Blanket caching hides problems and adds invalidation bugs, raw SQL rarely helps by itself, and indexes on every column slow down writes.',
    },
    {
      key: 'index',
      question:
        'Queries filter orders by `status` and sort by `created_at` on a table with millions of rows. Which model change targets that query?',
      correct:
        'Add `models.Index(fields=["status", "created_at"], name="order_status_created_idx")` to `Meta.indexes` and migrate.',
      wrong: [
        'Add `db_index=True` to the primary key.',
        'Set `ordering = ["created_at"]` in `Meta`, which creates an index.',
        'Use `select_related("status")`.',
      ],
      why: 'A composite index matching the filter then the sort lets the database find and order rows without scanning the table. Primary keys are always indexed, `Meta.ordering` only adds `ORDER BY` (it can even add cost), and `select_related` is for relations.',
    },
  ]),
];
