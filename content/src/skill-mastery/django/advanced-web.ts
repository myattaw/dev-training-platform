import type { QuestionSource } from '@pracstack/content-model';
import { b, dbProgram, djangoProgram } from './program';

/*
 * Advanced (difficulty 4 and 5) families for routing, views, models, the ORM,
 * migrations and forms. Every program runs in the real Python runner.
 */

const urls = { urls: true } as const;

export const routingAdvanced: readonly QuestionSource[] = [
  ...b.output(
    'dj-url-extra-kwargs',
    4,
    [
      'The third argument of `path()` is a dictionary of extra keyword arguments for the view.',
      'Extra arguments given to `include()` are passed to every view it includes.',
    ],
    [
      {
        key: 'override-captured',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

def listing(request, page, template="list"):
    return HttpResponse(f"{template} page {page}")

urlpatterns = [
    path("items/<int:page>/", listing),
    path("print/<int:page>/", listing, {"template": "print"}),
    path("first/<int:page>/", listing, {"page": 1}),
]

c = Client()
for url in ["/items/3/", "/print/3/", "/first/3/"]:
    print(c.get(url).content.decode())`,
          urls,
        ),
        output: 'list page 3\nprint page 3\nlist page 1',
        why: 'Extra options are merged with the captured arguments and win on conflicts, so `/first/3/` calls the view with `page=1` whatever the URL says. They are handy for reusing one view with different configuration, but an extra option that silently overrides a captured value is easy to miss.',
      },
      {
        key: 'include-kwargs',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import include, path

def index(request, section):
    return HttpResponse(f"{section} index")

def detail(request, pk, section):
    return HttpResponse(f"{section} #{pk}")

app_patterns = [path("", index), path("<int:pk>/", detail)]

urlpatterns = [
    path("news/", include(app_patterns), {"section": "news"}),
    path("blog/", include(app_patterns), {"section": "blog"}),
]

c = Client()
print(c.get("/news/").content.decode(), "|", c.get("/blog/7/").content.decode())`,
          urls,
        ),
        output: 'news index | blog #7',
        why: 'The options dictionary passed with `include()` is added to every pattern in the included URLconf, so the same app patterns serve two sections with a different `section` argument. Every included view must accept that argument, or it fails with a `TypeError`.',
      },
    ],
  ),
];

export const viewsAdvanced: readonly QuestionSource[] = [
  ...b.outputChoice(
    'dj-view-head-options',
    4,
    'Class-based views answer some methods without a handler of your own.',
    [
      {
        key: 'head-and-options',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path
from django.views import View

class Report(View):
    def get(self, request):
        return HttpResponse("full report")

urlpatterns = [path("report/", Report.as_view())]

c = Client()
head = c.head("/report/")
options = c.options("/report/")
print(head.status_code, len(head.content), options.status_code, options["Allow"])`,
          urls,
        ),
        correct: '200 0 200 GET, HEAD, OPTIONS',
        wrong: ['405 0 405 GET', '200 11 200 GET', '200 0 405 GET, HEAD'],
        why: '`View` maps HEAD to `get()` when no `head()` is defined, and the handler strips the body from HEAD responses. `View.options()` answers OPTIONS with an `Allow` header listing the methods the class implements.',
      },
      {
        key: 'http-method-names',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path
from django.views import View

class Archive(View):
    http_method_names = ["get"]

    def get(self, request):
        return HttpResponse("archive")

    def post(self, request):
        return HttpResponse("restored")

urlpatterns = [path("archive/", Archive.as_view())]

c = Client()
print(c.get("/archive/").status_code, c.post("/archive/").status_code, c.head("/archive/").status_code)`,
          urls,
        ),
        correct: '200 405 405',
        wrong: ['200 200 200', '200 405 200', '200 200 405'],
        why: '`dispatch()` first checks the method against `http_method_names`; anything not listed (here POST and HEAD) gets 405 even if a handler method exists. Restricting the list is a quick way to make a subclass read-only.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-view-conditional',
    5,
    'An ETag lets the client ask "has this changed since my copy?"',
    [
      {
        key: 'etag-304',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path
from django.views.decorators.http import etag

calls = []

def catalog_etag(request):
    return "catalog-v7"

@etag(catalog_etag)
def catalog(request):
    calls.append("render")
    return HttpResponse("big catalog")

urlpatterns = [path("catalog/", catalog)]

c = Client()
first = c.get("/catalog/")
second = c.get("/catalog/", headers={"If-None-Match": first["ETag"]})
print(first.status_code, second.status_code, len(second.content), len(calls))`,
          urls,
        ),
        correct: '200 304 0 1',
        wrong: ['200 200 11 2', '200 304 0 2', '200 304 11 1'],
        why: 'The `etag` decorator computes the ETag first. When the client sends a matching `If-None-Match`, Django answers 304 Not Modified with no body and never calls the view, so the expensive rendering runs once. The ETag function must be cheap and must change whenever the content changes.',
      },
    ],
  ),
];

export const modelsAdvanced: readonly QuestionSource[] = [
  ...b.fails(
    'dj-model-cross-field-check',
    4,
    'A check constraint can compare two columns of the same row.',
    [
      {
        key: 'end-after-start',
        question: 'Creating the booking fails. Why?',
        code: dbProgram(`from django.db import connection, models
from django.db.models import F, Q

class Booking(models.Model):
    start = models.IntegerField()
    end = models.IntegerField()

    class Meta:
        app_label = "rooms"
        constraints = [
            models.CheckConstraint(condition=Q(end__gt=F("start")), name="end_after_start"),
        ]

with connection.schema_editor() as editor:
    editor.create_model(Booking)

Booking.objects.create(start=9, end=11)
Booking.objects.create(start=14, end=14)`),
        error: 'IntegrityError',
        correct:
          'The constraint requires `end > start`; a booking that ends when it starts violates it, so the database rejects the row.',
        wrong: [
          '`F()` cannot be used inside a constraint, so the table was created without it.',
          'Two bookings cannot share the same `end` value.',
          'Check constraints are only enforced by `full_clean()`.',
        ],
        why: 'The condition `Q(end__gt=F("start"))` becomes `CHECK ("end" > "start")` in the table, so `14 > 14` fails with `CHECK constraint failed: end_after_start`. Rules that involve several fields of one row are a good fit for check constraints, because every write path (forms, bulk updates, scripts) is covered.',
      },
    ],
  ),
  ...b.output(
    'dj-model-validate-constraints',
    5,
    [
      '`full_clean()` validates fields, unique fields and `Meta.constraints` before anything is saved.',
      'Errors are collected per field in `message_dict`; constraint errors without a field go under `__all__`.',
    ],
    [
      {
        key: 'full-clean',
        code: dbProgram(`from django.core.exceptions import ValidationError
from django.db import connection, models
from django.db.models import Q

class Product(models.Model):
    sku = models.CharField(max_length=10, unique=True)
    price = models.IntegerField()

    class Meta:
        app_label = "shop"
        constraints = [
            models.CheckConstraint(condition=Q(price__gte=0), name="price_not_negative"),
        ]

with connection.schema_editor() as editor:
    editor.create_model(Product)

Product.objects.create(sku="PEN", price=2)
candidate = Product(sku="PEN", price=-5)
try:
    candidate.full_clean()
except ValidationError as e:
    print(sorted(e.message_dict))
    print(e.message_dict["sku"][0])
print(Product.objects.count())`),
        output: "['__all__', 'sku']\nProduct with this Sku already exists.\n1",
        why: 'Since Django 4.1, model validation also checks `Meta.constraints`, so `full_clean()` reports both problems as a `ValidationError` before any INSERT: the duplicate SKU under its field, and the check constraint under `__all__` because it is not tied to one field. Model forms call the same validation, which turns database rules into friendly form errors.',
      },
    ],
  ),
];

export const ormAdvanced: readonly QuestionSource[] = [
  ...b.output(
    'dj-orm-subqueries',
    5,
    [
      '`OuterRef` refers to a column of the outer query from inside a `Subquery` or `Exists`.',
      'A `Subquery` used as an annotation must return one row and one column.',
    ],
    [
      {
        key: 'latest-per-group',
        code: dbProgram(`from django.db import connection, models
from django.db.models import OuterRef, Subquery

class Author(models.Model):
    name = models.CharField(max_length=30)

    class Meta:
        app_label = "press"

class Book(models.Model):
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name="books")
    title = models.CharField(max_length=30)
    year = models.IntegerField()

    class Meta:
        app_label = "press"

with connection.schema_editor() as editor:
    editor.create_model(Author)
    editor.create_model(Book)

ada, alan = Author.objects.create(name="Ada"), Author.objects.create(name="Alan")
Book.objects.create(author=ada, title="Notes", year=1843)
Book.objects.create(author=ada, title="Letters", year=1850)
Book.objects.create(author=alan, title="Computing", year=1950)

latest = Book.objects.filter(author=OuterRef("pk")).order_by("-year").values("title")[:1]
for a in Author.objects.annotate(latest=Subquery(latest)).order_by("name"):
    print(a.name, a.latest)`),
        output: 'Ada Letters\nAlan Computing',
        why: 'For each author, the correlated subquery picks that author’s books (`OuterRef("pk")`), orders them by year and takes one title. `values("title")[:1]` keeps it to one column and one row. All of it runs as a single SQL query instead of one query per author.',
      },
      {
        key: 'exists',
        code: dbProgram(`from django.db import connection, models
from django.db.models import Exists, OuterRef

class Customer(models.Model):
    name = models.CharField(max_length=30)

    class Meta:
        app_label = "crm"

class Order(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE)
    paid = models.BooleanField()

    class Meta:
        app_label = "crm"

with connection.schema_editor() as editor:
    editor.create_model(Customer)
    editor.create_model(Order)

ada, bob, cy = (Customer.objects.create(name=n) for n in ["Ada", "Bob", "Cy"])
Order.objects.create(customer=ada, paid=False)
Order.objects.create(customer=ada, paid=True)
Order.objects.create(customer=bob, paid=True)

unpaid = Order.objects.filter(customer=OuterRef("pk"), paid=False)
qs = Customer.objects.annotate(owes=Exists(unpaid)).order_by("name")
print([(c.name, c.owes) for c in qs])
print(list(Customer.objects.filter(~Exists(Order.objects.filter(customer=OuterRef("pk")))).values_list("name", flat=True)))`),
        output: "[('Ada', True), ('Bob', False), ('Cy', False)]\n['Cy']",
        why: '`Exists()` becomes `EXISTS (SELECT ...)`, which stops at the first matching row and never duplicates customers the way a JOIN with `filter(order__paid=False)` can. It can be annotated as a Boolean or used directly in `filter()`, negated with `~` to find customers without orders.',
      },
    ],
  ),
];

export const migrationsAdvanced: readonly QuestionSource[] = [
  ...b.fails(
    'dj-mig-state-order',
    4,
    'Inside a migration, each operation sees the state produced by the operations before it.',
    [
      {
        key: 'field-added-later',
        question: 'The data migration runs before the field is added. Why does it fail?',
        code: dbProgram(`from django.db import connection, migrations, models
from django.db.migrations.state import ProjectState

def seed(apps, schema_editor):
    Page = apps.get_model("cms", "Page")
    Page.objects.create(title="Home", views=10)

class Migration(migrations.Migration):
    operations = [
        migrations.CreateModel("Page", [
            ("id", models.AutoField(primary_key=True)),
            ("title", models.CharField(max_length=50)),
        ]),
        migrations.RunPython(seed),
        migrations.AddField("page", "views", models.IntegerField(default=0)),
    ]

with connection.schema_editor() as editor:
    Migration("0001_initial", "cms").apply(ProjectState(), editor)`),
        error: 'TypeError',
        correct:
          'The historical `Page` at that point has no `views` field yet; move the `RunPython` after the `AddField` (or into a later migration).',
        wrong: [
          '`RunPython` always runs after all schema operations, so `views` is missing from the database.',
          '`apps.get_model()` cannot be used in the same migration that creates the model.',
          'Data migrations may not set integer fields.',
        ],
        why: "Operations run in order, and `apps.get_model()` returns the model as the state stands at that operation, so `Page(views=10)` fails with `TypeError: Page() got unexpected keyword arguments: 'views'`. That ordering is exactly what makes historical models safe: the code matches the schema at that moment.",
      },
    ],
  ),
];

export const formsAdvanced: readonly QuestionSource[] = [
  ...b.output(
    'dj-form-modelform-instance',
    4,
    [
      '`is_valid()` on a ModelForm copies the cleaned values onto `form.instance`, without saving.',
      'Uniqueness checks exclude the instance being edited.',
    ],
    [
      {
        key: 'instance-changed',
        code: dbProgram(`from django import forms
from django.db import connection, models

class Account(models.Model):
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=30)

    class Meta:
        app_label = "users"

class AccountForm(forms.ModelForm):
    class Meta:
        model = Account
        fields = ["email", "name"]

with connection.schema_editor() as editor:
    editor.create_model(Account)

acc = Account.objects.create(email="ada@example.com", name="Ada")
form = AccountForm({"email": "ada@example.com", "name": "Ada L."}, instance=acc)
print(form.is_valid())
print(acc.name, Account.objects.get().name)`),
        output: 'True\nAda L. Ada',
        why: 'Editing your own record with an unchanged email is valid: the unique check excludes the instance itself. Validation also writes the cleaned values onto the instance (`_post_clean()`), so `acc.name` already changed in memory while the database row did not; only `form.save()` writes it. Code that reuses the instance after a failed or unsaved form can show values that were never stored.',
      },
    ],
  ),
];
