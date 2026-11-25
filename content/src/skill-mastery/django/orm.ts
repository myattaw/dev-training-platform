import type { QuestionSource } from '@pracstack/content-model';
import { b, dbProgram } from './program';

/*
 * The ORM: QuerySets, filter/exclude/get, field lookups, Q and F objects,
 * ordering, values, aggregation, annotation and related lookups. Every query
 * runs against an in-memory SQLite database.
 */

/** Two categories and four products, used by most programs in this file. */
const CATALOG = `from django.db import connection, models

class Category(models.Model):
    name = models.CharField(max_length=30)

    class Meta:
        app_label = "shop"

class Product(models.Model):
    name = models.CharField(max_length=30)
    price = models.IntegerField()
    stock = models.IntegerField()
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="products")

    class Meta:
        app_label = "shop"

with connection.schema_editor() as editor:
    editor.create_model(Category)
    editor.create_model(Product)

books = Category.objects.create(name="Books")
games = Category.objects.create(name="Games")
Product.objects.bulk_create([
    Product(name="Atlas", price=30, stock=0, category=books),
    Product(name="Bible", price=15, stock=4, category=books),
    Product(name="Chess", price=25, stock=2, category=games),
    Product(name="Dice", price=5, stock=10, category=games),
])`;

/** A program on the catalog: extra imports first, then the query code. */
const catalog = (code: string, imports = '') =>
  dbProgram(`${imports ? `${imports.trim()}\n` : ''}${CATALOG}

${code.trim()}`);

export const ormFamilies: readonly QuestionSource[] = [
  ...b.outputChoice(
    'dj-orm-filter-exclude',
    1,
    '`filter()` keeps matching rows, `exclude()` removes them, and chained calls combine with AND.',
    [
      {
        key: 'filter',
        code: catalog(
          `print([p.name for p in Product.objects.filter(price__lt=20).order_by("name")])`,
        ),
        correct: "['Bible', 'Dice']",
        wrong: ["['Atlas', 'Chess']", "['Dice']", "['Bible', 'Chess', 'Dice']"],
        why: '`price__lt=20` means `price < 20`: Bible (15) and Dice (5). The double underscore separates the field name from the lookup (`lt`, `gt`, `gte`, `contains`…).',
      },
      {
        key: 'exclude-chain',
        code: catalog(
          `qs = Product.objects.filter(category=games).exclude(stock=0)
print([p.name for p in Product.objects.exclude(stock=0).filter(price__gt=10).order_by("name")])`,
        ),
        correct: "['Bible', 'Chess']",
        wrong: ["['Atlas', 'Bible', 'Chess']", "['Chess']", "['Bible', 'Chess', 'Dice']"],
        why: 'Each call returns a new QuerySet narrowing the previous one: in stock (not Atlas) and priced above 10 (not Dice) leaves Bible and Chess. The unused `qs` line runs no query at all, because QuerySets are lazy.',
      },
      {
        key: 'kwargs-and',
        code: catalog(`print(Product.objects.filter(category__name="Books", stock__gt=0).count())`),
        correct: '1',
        wrong: ['2', '3', '0'],
        why: 'Several keyword arguments in one `filter()` are combined with AND: books (Atlas, Bible) that are in stock (only Bible). `category__name` follows the foreign key and filters on the related table’s column.',
      },
    ],
  ),
  ...b.output(
    'dj-orm-lookups',
    2,
    [
      'Lookup names follow the double underscore: `icontains`, `startswith`, `in`, `range`, `isnull`.',
    ],
    [
      {
        key: 'text',
        code: catalog(`print(Product.objects.filter(name__icontains="E").count())
print(Product.objects.filter(name__iexact="DICE").count())
print(Product.objects.filter(name="dice").count())`),
        output: '3\n1\n0',
        why: '`icontains` is case-insensitive: Bible, Chess and Dice contain an `e`. `iexact` matches `Dice` regardless of case. A plain `name="dice"` is `name__exact`, compared with `=`, which is case-sensitive on SQLite and PostgreSQL (some MySQL collations are not).',
      },
      {
        key: 'in-range',
        code: catalog(`print(sorted(Product.objects.filter(price__in=[5, 25, 99]).values_list("name", flat=True)))
print(sorted(Product.objects.filter(stock__range=(2, 4)).values_list("name", flat=True)))`),
        output: "['Chess', 'Dice']\n['Bible', 'Chess']",
        why: '`in` matches any value in the list (values that do not exist, like 99, are simply not matched). `range` is inclusive at both ends (`BETWEEN 2 AND 4`), so stock 2 and 4 both count.',
      },
      {
        key: 'reverse-relation',
        code: catalog(`print(list(Category.objects.filter(products__stock=0).values_list("name", flat=True)))
print(list(Category.objects.filter(products__price__lt=100).values_list("name", flat=True)))`),
        output: "['Books']\n['Books', 'Books', 'Games', 'Games']",
        why: 'Filtering through a reverse relation (`products__...`) joins the product table, so a category appears once per matching product. Add `.distinct()` when one row per category is wanted.',
      },
    ],
  ),
  ...b.fails('dj-orm-get-errors', 2, '`get()` must find exactly one row.', [
    {
      key: 'does-not-exist',
      question: 'This program fails. Why?',
      code: catalog(`print(Product.objects.get(name="Puzzle"))`),
      error: 'DoesNotExist',
      correct:
        'No product is named `Puzzle`; `get()` raises `Product.DoesNotExist` instead of returning `None`.',
      wrong: [
        '`get()` only accepts the primary key.',
        '`get()` returns a QuerySet, which cannot be printed.',
        'The name lookup needs `name__exact`.',
      ],
      why: 'When no row matches, `get()` raises the model’s `DoesNotExist` exception. Catch it, use `filter(...).first()` (which returns `None`), or in views use `get_object_or_404()`. Plain `name=` already means `name__exact`.',
    },
    {
      key: 'multiple',
      question: 'This program fails. Why?',
      code: catalog(`print(Product.objects.get(category=books).name)`),
      error: 'MultipleObjectsReturned',
      correct: 'Two products are in `Books`; `get()` refuses to pick one.',
      wrong: [
        '`category` must be compared by id: `category_id=books`.',
        '`get()` returns the first match, so the error must come from `.name`.',
        'Foreign keys cannot be used in `get()`.',
      ],
      why: '`get()` raises `MultipleObjectsReturned` when more than one row matches; it never silently picks the first. Use `filter()` for many rows, or a unique field when you mean one. Passing a model instance for a foreign key is fine.',
    },
    {
      key: 'string-pk',
      question: 'A view passes the URL’s query parameter to `get()`. Why does this fail?',
      code: catalog(`product_id = "abc"
print(Product.objects.get(pk=product_id))`),
      error: 'ValueError',
      correct:
        'The primary key is an integer, and `"abc"` cannot be converted, so Django raises `ValueError` before querying.',
      wrong: [
        'It raises `DoesNotExist` because no product has id `abc`.',
        '`pk` cannot be used in `get()`; use `id`.',
        'Query parameters are bytes and must be decoded first.',
      ],
      why: "Lookups convert values to the field’s type: `int(\"abc\")` fails with `ValueError: Field 'id' expected a number but got 'abc'.` Validate input (an `int` path converter or a form) before querying; otherwise the view crashes with a 500 instead of answering 404 or 400.",
    },
  ]),
  ...b.outputChoice(
    'dj-orm-q-objects',
    3,
    '`Q` objects combine conditions with `|` (OR), `&` (AND) and `~` (NOT).',
    [
      {
        key: 'or',
        code: catalog(
          `print(sorted(Product.objects.filter(Q(price__gte=25) | Q(stock__gte=10)).values_list("name", flat=True)))`,
          'from django.db.models import Q',
        ),
        correct: "['Atlas', 'Chess', 'Dice']",
        wrong: ["['Atlas', 'Chess']", "['Dice']", '[]'],
        why: 'Keyword arguments can only express AND; `Q(...) | Q(...)` produces an OR. Atlas (30) and Chess (25) match the price, Dice matches the stock.',
      },
      {
        key: 'not',
        code: catalog(
          `print(sorted(Product.objects.filter(~Q(category__name="Books"), price__gt=10).values_list("name", flat=True)))`,
          'from django.db.models import Q',
        ),
        correct: "['Chess']",
        wrong: ["['Atlas', 'Bible']", "['Chess', 'Dice']", "['Atlas', 'Bible', 'Chess']"],
        why: '`~Q` negates the condition, and it is ANDed with the keyword argument: not a book and priced above 10 leaves Chess. Positional `Q` arguments must come before keyword arguments.',
      },
      {
        key: 'precedence',
        code: catalog(
          `cond = Q(category=books) & Q(stock=0) | Q(price=5)
print(sorted(Product.objects.filter(cond).values_list("name", flat=True)))`,
          'from django.db.models import Q',
        ),
        correct: "['Atlas', 'Dice']",
        wrong: ["['Atlas']", "['Dice']", "['Atlas', 'Bible', 'Dice']"],
        why: '`Q` uses Python’s operator precedence: `&` binds tighter than `|`, so this is `(book AND out of stock) OR price 5`: Atlas and Dice. Add parentheses whenever you mix the operators, to make the intent explicit.',
      },
    ],
  ),
  ...b.output(
    'dj-orm-f-expressions',
    3,
    [
      '`F("field")` refers to a column’s value inside the database query.',
      'An instance in memory is not updated by a query; reload it to see the new value.',
    ],
    [
      {
        key: 'update',
        code: catalog(
          `Product.objects.filter(category=games).update(stock=F("stock") + 5)
print(sorted(Product.objects.values_list("name", "stock")))`,
          'from django.db.models import F',
        ),
        output: "[('Atlas', 0), ('Bible', 4), ('Chess', 7), ('Dice', 15)]",
        why: '`update(stock=F("stock") + 5)` runs one `UPDATE ... SET stock = stock + 5` in the database, without loading the rows into Python. Doing the arithmetic in the database also avoids lost updates when two requests change the same row.',
      },
      {
        key: 'compare-columns',
        code: catalog(
          `print(sorted(Product.objects.filter(stock__gt=F("price") / 5).values_list("name", flat=True)))`,
          'from django.db.models import F',
        ),
        output: "['Bible', 'Dice']",
        why: '`F` lets one column be compared with another: Bible has stock 4 > 15/5 = 3, Dice 10 > 1, while Atlas (0 > 6) and Chess (2 > 5) do not match.',
      },
      {
        key: 'stale-instance',
        code: catalog(
          `dice = Product.objects.get(name="Dice")
dice.stock = F("stock") - 1
dice.save()
print(dice.stock)
dice.refresh_from_db()
print(dice.stock)`,
          'from django.db.models import F',
        ),
        output: 'F(stock) - Value(1)\n9',
        why: 'Assigning an `F` expression makes `save()` write `stock = stock - 1` in SQL, but the attribute still holds the expression object, not a number. `refresh_from_db()` loads the actual value. Forgetting to reload (or saving twice) is a common bug: a second `save()` would subtract again.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-orm-ordering',
    2,
    'A leading `-` means descending; later fields break ties.',
    [
      {
        key: 'desc',
        code: catalog(`print([p.name for p in Product.objects.order_by("-price")[:2]])`),
        correct: "['Atlas', 'Chess']",
        wrong: ["['Dice', 'Bible']", "['Atlas', 'Bible']", "['Chess', 'Atlas']"],
        why: '`"-price"` sorts from the highest price, and the slice `[:2]` becomes `LIMIT 2` in SQL: Atlas (30) and Chess (25).',
      },
      {
        key: 'related-then-field',
        code: catalog(
          `print([p.name for p in Product.objects.order_by("-category__name", "price")])`,
        ),
        correct: "['Dice', 'Chess', 'Bible', 'Atlas']",
        wrong: [
          "['Atlas', 'Bible', 'Chess', 'Dice']",
          "['Chess', 'Dice', 'Atlas', 'Bible']",
          "['Bible', 'Atlas', 'Dice', 'Chess']",
        ],
        why: 'Games comes before Books in descending category order; within each category the cheaper product comes first.',
      },
      {
        key: 'first-last',
        code: catalog(`qs = Product.objects.order_by("stock")
print(qs.first().name, qs.last().name, Product.objects.filter(price=99).first())`),
        correct: 'Atlas Dice None',
        wrong: ['Dice Atlas None', 'Atlas Dice DoesNotExist', 'Atlas Atlas None'],
        why: '`first()` and `last()` respect the ordering (stock 0 is Atlas, 10 is Dice) and return `None` when nothing matches, unlike `get()`, which raises `DoesNotExist`.',
      },
    ],
  ),
  ...b.output(
    'dj-orm-values',
    2,
    ['`values()` returns dictionaries, `values_list()` tuples, and `flat=True` single values.'],
    [
      {
        key: 'values',
        code: catalog(`print(list(Product.objects.filter(name="Dice").values("name", "category__name")))
print(list(Product.objects.order_by("name").values_list("price", flat=True)))`),
        output: "[{'name': 'Dice', 'category__name': 'Games'}]\n[30, 15, 25, 5]",
        why: '`values()` returns dictionaries keyed by the requested names, which can follow relations. `values_list(..., flat=True)` returns plain values for a single field, in the query’s order (here by name).',
      },
      {
        key: 'distinct',
        code: catalog(`print(list(Product.objects.order_by("category__name").values_list("category__name", flat=True)))
print(list(Product.objects.order_by("category__name").values_list("category__name", flat=True).distinct()))`),
        output: "['Books', 'Books', 'Games', 'Games']\n['Books', 'Games']",
        why: 'One row per product means each category name appears once per product; `distinct()` adds `SELECT DISTINCT`. With `distinct()`, keep the `order_by()` fields among the selected values, otherwise the ordering columns are added to the SELECT and duplicates can come back.',
      },
    ],
  ),
  ...b.output(
    'dj-orm-aggregate',
    3,
    [
      '`aggregate()` returns one dictionary for the whole QuerySet.',
      'Default keys are `<field>__<function>`; named arguments choose the key.',
    ],
    [
      {
        key: 'keys',
        code: catalog(
          `print(Product.objects.aggregate(Sum("stock"), Max("price")))
print(Product.objects.filter(category=books).aggregate(avg=Avg("price")))`,
          'from django.db.models import Avg, Max, Sum',
        ),
        output: "{'stock__sum': 16, 'price__max': 30}\n{'avg': 22.5}",
        why: 'Unnamed aggregates are keyed `stock__sum` and `price__max`; `avg=Avg(...)` sets the key yourself. The average of 30 and 15 is 22.5, a float.',
      },
      {
        key: 'empty',
        code: catalog(
          `empty = Product.objects.filter(price__gt=100)
print(empty.aggregate(total=Sum("stock")))
print(empty.aggregate(total=Sum("stock", default=0)))
print(empty.aggregate(n=Count("id")))`,
          'from django.db.models import Count, Sum',
        ),
        output: "{'total': None}\n{'total': 0}\n{'n': 0}",
        why: 'SQL `SUM` over no rows is NULL, so the result is `None`, which breaks arithmetic such as `total + 1`. `default=0` (Django 4.0+) wraps the aggregate in `COALESCE`. `Count` already returns 0 for no rows.',
      },
    ],
  ),
  ...b.output(
    'dj-orm-annotate',
    4,
    [
      '`annotate()` adds a computed value to every row of the QuerySet.',
      'A filter on the annotation is a HAVING clause; a filter before `annotate()` restricts which rows are counted.',
    ],
    [
      {
        key: 'count-per-category',
        code: catalog(
          `qs = Category.objects.annotate(n=Count("products"), stock=Sum("products__stock")).order_by("name")
for c in qs:
    print(c.name, c.n, c.stock)`,
          'from django.db.models import Count, Sum',
        ),
        output: 'Books 2 4\nGames 2 12',
        why: '`annotate()` groups by category and adds `n` and `stock` as attributes on each instance. Books have 0 + 4 in stock, Games 2 + 10.',
      },
      {
        key: 'filter-order',
        code: catalog(
          `a = Category.objects.filter(products__stock__gt=0).annotate(n=Count("products"))
b = Category.objects.annotate(n=Count("products")).filter(n__gt=1)
print(sorted((c.name, c.n) for c in a))
print(sorted((c.name, c.n) for c in b))`,
          'from django.db.models import Count',
        ),
        output: "[('Books', 1), ('Games', 2)]\n[('Books', 2), ('Games', 2)]",
        why: 'A filter before `annotate()` restricts the joined rows that are counted (the out-of-stock Atlas is not counted). A filter on the annotation itself (`n__gt=1`) becomes `HAVING COUNT(...) > 1` and keeps whole groups.',
      },
      {
        key: 'conditional-count',
        code: catalog(
          `qs = Category.objects.annotate(
    total=Count("products"),
    available=Count("products", filter=Q(products__stock__gt=0)),
).order_by("name")
print([(c.name, c.total, c.available) for c in qs])`,
          'from django.db.models import Count, Q',
        ),
        output: "[('Books', 2, 1), ('Games', 2, 2)]",
        why: 'The `filter` argument of an aggregate counts only matching rows, so both counts come from one query without restricting the other aggregate.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-orm-multiple-joins',
    5,
    'Two annotations across two different multi-valued relations share one join.',
    [
      {
        key: 'inflated',
        question: 'An author has 2 books and 3 articles. What does this program print?',
        code: dbProgram(`from django.db import connection, models
from django.db.models import Count

class Author(models.Model):
    name = models.CharField(max_length=30)

    class Meta:
        app_label = "press"

class Book(models.Model):
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name="books")

    class Meta:
        app_label = "press"

class Article(models.Model):
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name="articles")

    class Meta:
        app_label = "press"

with connection.schema_editor() as editor:
    for model in (Author, Book, Article):
        editor.create_model(model)

ada = Author.objects.create(name="Ada")
Book.objects.bulk_create([Book(author=ada) for _ in range(2)])
Article.objects.bulk_create([Article(author=ada) for _ in range(3)])

a = Author.objects.annotate(b=Count("books"), n=Count("articles")).get()
print(a.b, a.n)`),
        correct: '6 6',
        wrong: ['2 3', '5 5', '2 6'],
        why: 'Both relations are joined in one query, producing 2 × 3 = 6 rows for Ada, and each `Count` counts those rows. That silent inflation is a well-known ORM pitfall.',
      },
      {
        key: 'distinct-fix',
        question: 'The same data, now with `distinct=True`. What does this program print?',
        code: dbProgram(`from django.db import connection, models
from django.db.models import Count

class Author(models.Model):
    name = models.CharField(max_length=30)

    class Meta:
        app_label = "press"

class Book(models.Model):
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name="books")

    class Meta:
        app_label = "press"

class Article(models.Model):
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name="articles")

    class Meta:
        app_label = "press"

with connection.schema_editor() as editor:
    for model in (Author, Book, Article):
        editor.create_model(model)

ada = Author.objects.create(name="Ada")
Book.objects.bulk_create([Book(author=ada) for _ in range(2)])
Article.objects.bulk_create([Article(author=ada) for _ in range(3)])

a = Author.objects.annotate(
    b=Count("books", distinct=True), n=Count("articles", distinct=True)
).get()
print(a.b, a.n)`),
        correct: '2 3',
        wrong: ['6 6', '1 1', '2 6'],
        why: '`distinct=True` counts distinct related ids, so the cross-product of the two joins no longer inflates the counts. This works for `Count`; for `Sum` over two joined relations you need subqueries instead.',
      },
    ],
  ),
];
