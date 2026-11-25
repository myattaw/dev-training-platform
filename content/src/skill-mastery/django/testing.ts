import type { QuestionSource } from '@pracstack/content-model';
import { b, dbProgram, djangoProgram, drfApps } from './program';

/*
 * Testing: TestCase and its per-test transactions, the test client, API tests,
 * test data, failures versus errors, query-count assertions and on_commit.
 * Test classes are run in-process with unittest; programs print the counts
 * (tests run, failures, errors).
 */

/** Runs a TestCase class and prints "tests failures errors". */
const RUN = `import io
import unittest

def run(case):
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(case)
    result = unittest.TextTestRunner(stream=io.StringIO()).run(suite)
    print(result.testsRun, len(result.failures), len(result.errors))`;

const urls = { urls: true } as const;

export const testingFamilies: readonly QuestionSource[] = [
  ...b.output(
    'dj-test-client',
    1,
    [
      '`self.client` is a test client that sends requests through Django’s full handler.',
      'The program prints: tests run, failures, errors.',
    ],
    [
      {
        key: 'status-and-content',
        code: djangoProgram(
          `${RUN}

from django.http import HttpResponse
from django.test import SimpleTestCase
from django.urls import path

def home(request):
    return HttpResponse("<h1>Welcome</h1>")

urlpatterns = [path("", home)]

class HomeTests(SimpleTestCase):
    def test_status(self):
        self.assertEqual(self.client.get("/").status_code, 200)

    def test_heading(self):
        self.assertContains(self.client.get("/"), "Welcome")

    def test_missing_page(self):
        self.assertEqual(self.client.get("/nope/").status_code, 200)

run(HomeTests)`,
          urls,
        ),
        output: '3 1 0',
        why: 'Three tests ran. `/nope/` matches no URL and returns 404, so the last assertion fails: a failure, not an error. `assertContains` checks both the status (200 by default) and that the text appears in the body.',
      },
      {
        key: 'json-api',
        code: djangoProgram(
          `${RUN}

from django.http import JsonResponse
from django.test import SimpleTestCase
from django.urls import path

def version(request):
    return JsonResponse({"version": "1.4.0"})

urlpatterns = [path("version/", version)]

class VersionTests(SimpleTestCase):
    def test_json(self):
        response = self.client.get("/version/")
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertEqual(response.json(), {"version": "1.4.0"})

    def test_post_not_allowed(self):
        self.assertEqual(self.client.post("/version/").status_code, 405)

run(VersionTests)`,
          urls,
        ),
        output: '2 1 0',
        why: 'The first test passes. The view is a plain function, so it accepts POST too and returns 200; the second test documents a requirement the view does not implement yet. Restricting it with `@require_GET` would make it pass.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-test-isolation',
    2,
    '`TestCase` wraps each test in a transaction and rolls it back afterwards.',
    [
      {
        key: 'rollback',
        code: dbProgram(`${RUN}

from django.db import connection, models
from django.test import TestCase

class Note(models.Model):
    text = models.CharField(max_length=50)

    class Meta:
        app_label = "notes"

with connection.schema_editor() as editor:
    editor.create_model(Note)

class NoteTests(TestCase):
    def test_create(self):
        Note.objects.create(text="a")
        self.assertEqual(Note.objects.count(), 1)

    def test_starts_empty(self):
        self.assertEqual(Note.objects.count(), 0)

run(NoteTests)`),
        correct: '2 0 0',
        wrong: ['2 1 0', '2 0 1', '1 0 0'],
        why: 'Each test runs in a transaction that is rolled back, so `test_starts_empty` sees no notes whatever order the tests run in. Tests must never depend on data created by other tests.',
      },
      {
        key: 'set-up-test-data',
        code: dbProgram(`${RUN}

from django.db import connection, models
from django.test import TestCase

class Product(models.Model):
    name = models.CharField(max_length=50)
    stock = models.IntegerField()

    class Meta:
        app_label = "shop"

with connection.schema_editor() as editor:
    editor.create_model(Product)

class StockTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.pen = Product.objects.create(name="Pen", stock=5)

    def test_sell(self):
        Product.objects.filter(pk=self.pen.pk).update(stock=0)
        self.assertEqual(Product.objects.get().stock, 0)

    def test_initial_stock(self):
        self.assertEqual(Product.objects.get().stock, 5)

run(StockTests)`),
        correct: '2 0 0',
        wrong: ['2 1 0', '2 0 1', '1 0 0'],
        why: '`setUpTestData()` creates data once per class, inside an outer transaction; each test’s changes are rolled back to that point. So the update in `test_sell` does not leak into `test_initial_stock`. It is faster than `setUp()`, which runs before every test.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-test-failures-errors',
    2,
    'A failed assertion is a failure; any other exception is an error.',
    [
      {
        key: 'kinds',
        code: dbProgram(`${RUN}

from django.db import connection, models
from django.test import TestCase

class Coupon(models.Model):
    code = models.CharField(max_length=10)

    class Meta:
        app_label = "shop"

with connection.schema_editor() as editor:
    editor.create_model(Coupon)

class CouponTests(TestCase):
    def test_lookup(self):
        coupon = Coupon.objects.get(code="SPRING")
        self.assertEqual(coupon.code, "SPRING")

    def test_upper(self):
        self.assertEqual("spring".upper(), "Spring")

    def test_count(self):
        self.assertEqual(Coupon.objects.count(), 0)

run(CouponTests)`),
        correct: '3 1 1',
        wrong: ['3 2 0', '3 0 2', '2 1 0'],
        why: '`test_lookup` raises `Coupon.DoesNotExist` (no such coupon): an error, meaning the test itself broke. `test_upper` fails its assertion (`"SPRING"` is not `"Spring"`): a failure. `test_count` passes.',
      },
    ],
  ),
  ...b.fails(
    'dj-test-request-factory',
    3,
    '`RequestFactory` builds a request object only; no middleware runs.',
    [
      {
        key: 'no-user',
        question: 'This unit test of a view fails. Why?',
        code: djangoProgram(`from django.http import HttpResponse
from django.test import RequestFactory

def profile(request):
    return HttpResponse(request.user.username)

request = RequestFactory().get("/profile/")
print(profile(request).content)`),
        error: 'AttributeError',
        correct:
          '`RequestFactory` does not run `AuthenticationMiddleware`, so `request.user` is missing; set `request.user = ...` in the test (or use the test client).',
        wrong: [
          'The URL `/profile/` is not in any URLconf, so the request cannot be built.',
          'Views can only be called through `self.client` in tests.',
          '`RequestFactory` requests are always anonymous, so `username` is empty.',
        ],
        why: 'The factory creates a bare `WSGIRequest`; calling the view directly bypasses URL resolution and middleware. That makes tests fast and focused, but anything middleware normally adds (`user`, `session`) must be set by hand. The URL does not need to exist.',
      },
      {
        key: 'no-session',
        question: 'Calling the view with a factory request fails. Why?',
        code: djangoProgram(
          `from django.contrib.auth.models import AnonymousUser
from django.http import HttpResponse
from django.test import RequestFactory

def add_to_cart(request):
    cart = request.session.get("cart", [])
    return HttpResponse(len(cart))

request = RequestFactory().post("/cart/")
request.user = AnonymousUser()
print(add_to_cart(request).content)`,
          { apps: ['django.contrib.contenttypes', 'django.contrib.auth'] },
        ),
        error: 'AttributeError',
        correct:
          'No `SessionMiddleware` ran, so `request.session` does not exist; attach a session in the test or use the test client.',
        wrong: [
          'POST requests have no session; use GET.',
          'Anonymous users cannot have a session.',
          '`HttpResponse` cannot take an integer.',
        ],
        why: 'Sessions are attached by `SessionMiddleware`, which the factory skips. Anonymous users do have sessions in a real request, and `HttpResponse` converts an integer to its text.',
      },
    ],
  ),
  ...b.output(
    'dj-test-api',
    3,
    [
      '`APITestCase` gives each test an `APIClient` as `self.client`.',
      '`force_authenticate()` makes requests as a given user without credentials.',
    ],
    [
      {
        key: 'api-test-case',
        code: dbProgram(
          `${RUN}

from django.contrib.auth.models import User
from django.core.management import call_command
from django.urls import path
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.test import APITestCase

call_command("migrate", verbosity=0)

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def publish(request):
    return Response({"title": request.data["title"]}, status=201)

urlpatterns = [path("publish/", publish)]

class PublishTests(APITestCase):
    def test_requires_login(self):
        response = self.client.post("/publish/", {"title": "Hi"}, format="json")
        self.assertEqual(response.status_code, 401)

    def test_publish(self):
        self.client.force_authenticate(User.objects.create_user("ada"))
        response = self.client.post("/publish/", {"title": "Hi"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data, {"title": "Hi"})

run(PublishTests)`,
          { apps: drfApps, urls: true },
        ),
        output: '2 1 0',
        why: 'The authenticated test passes. The first test expects 401, but with DRF’s default authentication classes (session first) an anonymous request gets 403, so the assertion fails. Tests like this pin down the real API contract.',
      },
    ],
  ),
  ...b.output(
    'dj-test-assert-num-queries',
    4,
    [
      '`assertNumQueries(n)` fails when the block runs a different number of queries.',
      'Count one query per lazy relation access inside a loop.',
    ],
    [
      {
        key: 'n-plus-one-caught',
        code: dbProgram(`${RUN}

from django.db import connection, models
from django.test import TestCase

class Author(models.Model):
    name = models.CharField(max_length=50)

    class Meta:
        app_label = "library"

class Book(models.Model):
    author = models.ForeignKey(Author, on_delete=models.CASCADE)

    class Meta:
        app_label = "library"

with connection.schema_editor() as editor:
    editor.create_model(Author)
    editor.create_model(Book)

class QueryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        for name in ["Ada", "Grace", "Linus"]:
            Book.objects.create(author=Author.objects.create(name=name))

    def test_plain(self):
        with self.assertNumQueries(1):
            [b.author.name for b in Book.objects.all()]

    def test_select_related(self):
        with self.assertNumQueries(1):
            [b.author.name for b in Book.objects.select_related("author")]

run(QueryTests)`),
        output: '2 1 0',
        why: 'The plain loop runs 1 query for the books plus 1 per author (4 in total), so `test_plain` fails. `select_related("author")` joins the authors into the single query. `assertNumQueries` keeps such regressions from creeping back.',
      },
    ],
  ),
  ...b.output(
    'dj-test-test-case-types',
    5,
    [
      '`SimpleTestCase` forbids database queries.',
      '`TestCase` never commits, so `on_commit` callbacks do not run unless you capture them.',
    ],
    [
      {
        key: 'simple-test-case-db',
        code: dbProgram(`${RUN}

from django.db import connection, models
from django.test import SimpleTestCase

class Tag(models.Model):
    name = models.CharField(max_length=20)

    class Meta:
        app_label = "blog"

with connection.schema_editor() as editor:
    editor.create_model(Tag)

class TagTests(SimpleTestCase):
    def test_slug(self):
        self.assertEqual("Django".lower(), "django")

    def test_count(self):
        self.assertEqual(Tag.objects.count(), 0)

run(TagTests)`),
        output: '2 1 0',
        why: '`SimpleTestCase` blocks database access: the query in `test_count` raises an `AssertionError` ("Database queries to \'default\' are not allowed in SimpleTestCase"), so unittest reports it as a failure rather than an error. Use `SimpleTestCase` for tests that need no database (faster, no transactions) and `TestCase` otherwise.',
      },
      {
        key: 'on-commit',
        code: dbProgram(`${RUN}

from django.db import connection, models, transaction
from django.test import TestCase

sent = []

class Order(models.Model):
    email = models.CharField(max_length=50)

    class Meta:
        app_label = "shop"

with connection.schema_editor() as editor:
    editor.create_model(Order)

def place_order(email):
    order = Order.objects.create(email=email)
    transaction.on_commit(lambda: sent.append(email))
    return order

class OrderTests(TestCase):
    def test_plain(self):
        place_order("ada@example.com")
        self.assertEqual(sent, ["ada@example.com"])

    def test_captured(self):
        with self.captureOnCommitCallbacks(execute=True):
            place_order("grace@example.com")
        self.assertEqual(sent, ["grace@example.com"])

run(OrderTests)`),
        output: '2 1 0',
        why: '`on_commit` callbacks (such as sending a confirmation email) run only after the transaction commits, and `TestCase` rolls back instead of committing, so in `test_plain` nothing is sent. `captureOnCommitCallbacks(execute=True)` runs them when the block exits.',
      },
    ],
  ),
  ...b.concept(
    'dj-test-data',
    3,
    'Weigh speed, readability and how test data stays in sync with models.',
    [
      {
        key: 'fixtures-vs-code',
        question:
          'A test suite loads a large JSON fixture into every test class, and tests break whenever a model field changes. What is the most common improvement?',
        correct:
          'Create the data each test needs in code (`setUpTestData()` or a factory function/library), so it stays readable and is updated together with the models.',
        wrong: [
          'Regenerate the fixture from the production database before every test run.',
          'Use `TransactionTestCase` everywhere so fixtures load faster.',
          'Share one fixture by never rolling back the test database.',
        ],
        why: 'JSON fixtures are static copies of rows: they hide which values matter for a test and go stale with migrations. Data built in code with sensible defaults shows intent and changes with the model. Production data in tests is a privacy and stability risk, `TransactionTestCase` is slower, and sharing state between tests makes them order-dependent.',
      },
      {
        key: 'what-to-test',
        question: 'Which test gives the most value for a view that creates an order from a form?',
        correct:
          'Post valid and invalid data with the test client and assert the response (redirect or form errors) and the resulting rows in the database.',
        wrong: [
          'Assert that Django’s `CharField` enforces `max_length`.',
          'Snapshot the full HTML of the page and compare it byte for byte.',
          'Mock the ORM so the test does not touch the database.',
        ],
        why: 'Test your behavior through its public interface: inputs, response and side effects. Re-testing Django itself adds nothing, full HTML snapshots break on every template change, and mocking the ORM hides real query and constraint behavior that `TestCase` can check quickly.',
      },
    ],
  ),
];
