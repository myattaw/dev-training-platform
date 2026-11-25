import type { QuestionSource } from '@pracstack/content-model';
import { library } from './performance';
import { authApps, b, dbProgram, djangoProgram, drfApps } from './program';

/*
 * Advanced (difficulty 4 and 5) families for authentication, middleware,
 * Django REST Framework, testing and performance. Every program runs in the
 * real Python runner.
 */

const MIGRATE = `from django.core.management import call_command

call_command("migrate", verbosity=0)  # creates the auth tables`;

const SESSION_WEB = {
  apps: [...authApps, 'django.contrib.sessions'],
  fastHasher: true,
  urls: true,
  settings: [
    'SECRET_KEY="practice-only-not-secret"',
    `MIDDLEWARE=[
        "django.contrib.sessions.middleware.SessionMiddleware",
        "django.contrib.auth.middleware.AuthenticationMiddleware",
    ]`,
  ],
} as const;

const RUN = `import io
import unittest

def run(case):
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(case)
    result = unittest.TextTestRunner(stream=io.StringIO()).run(suite)
    print(result.testsRun, len(result.failures), len(result.errors))`;

const api = { apps: drfApps, urls: true } as const;

export const authAdvanced: readonly QuestionSource[] = [
  ...b.output(
    'dj-auth-custom-backend',
    4,
    [
      '`authenticate()` tries each backend in `AUTHENTICATION_BACKENDS` in order until one returns a user.',
      'A backend that raises `PermissionDenied` stops the chain.',
    ],
    [
      {
        key: 'email-login',
        code: dbProgram(
          `${MIGRATE}
from django.contrib.auth import authenticate
from django.contrib.auth.backends import ModelBackend
from django.contrib.auth.models import User

class EmailBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        try:
            user = User.objects.get(email__iexact=username)
        except User.DoesNotExist:
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None

User.objects.create_user("ada", email="ada@example.com", password="s3cret")
for login in ["ADA@example.com", "ada"]:
    user = authenticate(username=login, password="s3cret")
    print(user, user.backend.rsplit(".", 1)[1])`,
          {
            apps: authApps,
            fastHasher: true,
            settings: [
              `AUTHENTICATION_BACKENDS=[
        "__main__.EmailBackend",
        "django.contrib.auth.backends.ModelBackend",
    ]`,
            ],
          },
        ),
        output: 'ada EmailBackend\nada ModelBackend',
        why: 'The email backend matches the address case-insensitively; for `"ada"` it finds no email and returns `None`, so Django tries the next backend, which matches the username. `authenticate()` records the successful backend on `user.backend`, and `login()` stores it in the session. Reusing `user_can_authenticate()` keeps the `is_active` check.',
      },
      {
        key: 'permission-denied',
        code: dbProgram(
          `${MIGRATE}
from django.contrib.auth import authenticate
from django.contrib.auth.backends import BaseBackend
from django.contrib.auth.models import User
from django.core.exceptions import PermissionDenied

class BlockList(BaseBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        if username == "mallory":
            raise PermissionDenied
        return None

User.objects.create_user("mallory", password="s3cret")
User.objects.create_user("ada", password="s3cret")
print(authenticate(username="mallory", password="s3cret"), authenticate(username="ada", password="s3cret"))`,
          {
            apps: authApps,
            fastHasher: true,
            settings: [
              `AUTHENTICATION_BACKENDS=[
        "__main__.BlockList",
        "django.contrib.auth.backends.ModelBackend",
    ]`,
            ],
          },
        ),
        output: 'None ada',
        why: 'Returning `None` means "not my user, ask the next backend"; raising `PermissionDenied` means "refuse", and `authenticate()` returns `None` immediately without consulting `ModelBackend`, even though Mallory’s password is right. For `ada` the block list passes and `ModelBackend` succeeds.',
      },
    ],
  ),
  ...b.output(
    'dj-auth-password-change-sessions',
    5,
    [
      'Each session stores a hash derived from the user’s password hash.',
      'When the password changes, sessions with the old hash are no longer valid.',
    ],
    [
      {
        key: 'all-sessions-end',
        question:
          'Ada is logged in on a laptop and a phone. Her password is changed. What does each device get next?',
        code: dbProgram(
          `${MIGRATE}
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.http import HttpResponse
from django.test import Client
from django.urls import path

@login_required
def me(request):
    return HttpResponse(request.user.username)

urlpatterns = [path("me/", me)]

ada = User.objects.create_user("ada", password="old-password")
laptop, phone = Client(), Client()
laptop.force_login(ada)
phone.force_login(ada)
print(laptop.get("/me/").status_code, phone.get("/me/").status_code)

ada.set_password("new-password")
ada.save()
print(laptop.get("/me/").status_code, phone.get("/me/").status_code)`,
          SESSION_WEB,
        ),
        output: '200 200\n302 302',
        why: 'On every request, `AuthenticationMiddleware` compares the session’s stored hash with one derived from the current password hash. After the change they differ, so both sessions are flushed and the users are treated as anonymous (redirected to log in). That logs out an attacker who knew the old password.',
      },
      {
        key: 'keep-current',
        question:
          'Now the password is changed through a view that calls `update_session_auth_hash()`. What does each device get next?',
        code: dbProgram(
          `${MIGRATE}
from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.http import HttpResponse
from django.test import Client
from django.urls import path

@login_required
def me(request):
    return HttpResponse(request.user.username)

@login_required
def change_password(request):
    request.user.set_password("new-password")
    request.user.save()
    update_session_auth_hash(request, request.user)
    return HttpResponse("changed")

urlpatterns = [path("me/", me), path("change/", change_password)]

ada = User.objects.create_user("ada", password="old-password")
laptop, phone = Client(), Client()
laptop.force_login(ada)
phone.force_login(ada)
laptop.get("/change/")
print(laptop.get("/me/").status_code, phone.get("/me/").status_code)`,
          SESSION_WEB,
        ),
        output: '200 302',
        why: '`update_session_auth_hash()` stores the new hash in the current session, so the device that changed the password stays logged in, while every other session is still invalidated. Django’s `PasswordChangeView` does exactly this.',
      },
    ],
  ),
];

const TEMPLATES = `TEMPLATES=[{
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "OPTIONS": {"loaders": [("django.template.loaders.locmem.Loader", {"page.html": "{{ title }} | {{ footer }}"})]},
    }]`;

export const middlewareAdvanced: readonly QuestionSource[] = [
  ...b.output(
    'dj-mw-exceptions-templates',
    4,
    [
      'Each middleware is wrapped so that an exception inside it becomes a response for the middleware outside it.',
      '`process_template_response()` runs only for responses that have not been rendered yet.',
    ],
    [
      {
        key: 'inner-raises',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

class Outer:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        print("outer saw", response.status_code)
        return response

class Broken:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        raise RuntimeError("cache unavailable")

def home(request):
    print("view")
    return HttpResponse("ok")

urlpatterns = [path("", home)]

print(Client(raise_request_exception=False).get("/").status_code)`,
          { urls: true, settings: ['MIDDLEWARE=["__main__.Outer", "__main__.Broken"]'] },
        ),
        output: 'outer saw 500\n500',
        why: 'Django wraps every middleware with exception handling, so the `RuntimeError` in `Broken` becomes a 500 response before it reaches `Outer`. The outer middleware therefore receives a normal response object (and can add headers or log the status) instead of an exception; the view never runs.',
      },
      {
        key: 'template-response',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.template.response import TemplateResponse
from django.test import Client
from django.urls import path

class Footer:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_template_response(self, request, response):
        response.context_data["footer"] = "v2.1"
        return response

def page(request):
    return TemplateResponse(request, "page.html", {"title": "Home"})

def plain(request):
    return HttpResponse("plain")

urlpatterns = [path("", page), path("plain/", plain)]

c = Client()
print(c.get("/").content.decode())
print(c.get("/plain/").content.decode())`,
          { urls: true, settings: [TEMPLATES, 'MIDDLEWARE=["__main__.Footer"]'] },
        ),
        output: 'Home | v2.1\nplain',
        why: 'A `TemplateResponse` is rendered lazily, after the view returns, so `process_template_response()` can still change its template or context. Plain `HttpResponse` objects are already rendered and skip that hook. Generic class-based views return `TemplateResponse`, which is why such middleware works with them.',
      },
    ],
  ),
  ...b.fails(
    'dj-mw-body-access',
    5,
    'Some responses and request bodies can only be read once, as a stream.',
    [
      {
        key: 'streaming-content',
        question: 'A size-logging middleware breaks the export download. Why?',
        code: djangoProgram(
          `from django.http import StreamingHttpResponse
from django.test import Client
from django.urls import path

class SizeLogger:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        print("bytes:", len(response.content))
        return response

def export(request):
    rows = (f"{i},item {i}\\n" for i in range(3))
    return StreamingHttpResponse(rows, content_type="text/csv")

urlpatterns = [path("export.csv", export)]

Client().get("/export.csv")`,
          { urls: true, settings: ['MIDDLEWARE=["__main__.SizeLogger"]'] },
        ),
        error: 'AttributeError',
        correct:
          'A `StreamingHttpResponse` has no `content`; middleware must check `response.streaming` and leave `streaming_content` alone (or wrap it lazily).',
        wrong: [
          'CSV responses cannot pass through middleware.',
          '`len()` does not work on bytes.',
          'The generator was exhausted by the test client before the middleware ran.',
        ],
        why: 'Streaming responses produce their body lazily, so there is no `content` to measure (`AttributeError: This StreamingHttpResponse instance has no content attribute. Use streaming_content instead.`). Reading it all in middleware would also defeat the point of streaming. Django’s own middleware (GZip, ConditionalGet) checks `response.streaming` first.',
      },
      {
        key: 'raw-post-data',
        question: 'A middleware reads a form field, and then the view fails. Why?',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

class TrackSource:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.source = request.POST.get("source", "web")
        return self.get_response(request)

def upload(request):
    return HttpResponse(f"{len(request.body)} bytes from {request.source}")

urlpatterns = [path("upload/", upload)]

Client().post("/upload/", {"source": "app", "file": "data"})`,
          { urls: true, settings: ['MIDDLEWARE=["__main__.TrackSource"]'] },
        ),
        error: 'RawPostDataException',
        correct:
          'The multipart body was consumed as a stream when the middleware accessed `request.POST`, so `request.body` can no longer be read.',
        wrong: [
          'Middleware cannot read `request.POST` at all.',
          'Attributes set on the request in middleware are removed before the view runs.',
          '`request.body` is only available for GET requests.',
        ],
        why: 'The test client posts `multipart/form-data` by default. Parsing it reads the input stream, and Django refuses to give `body` afterwards: "You cannot access body after reading from request\'s data stream". Read `request.body` first (it is then cached and `POST` can be parsed from it), or avoid touching `POST` in middleware.',
      },
    ],
  ),
];

export const serializersAdvanced: readonly QuestionSource[] = [
  ...b.output(
    'dj-drf-ser-context',
    4,
    [
      'A serializer’s `context` dictionary carries extra information such as the request.',
      'Generic views pass `request`, `view` and `format` in the context automatically.',
    ],
    [
      {
        key: 'method-field',
        code: djangoProgram(
          `from rest_framework import serializers

class PriceSerializer(serializers.Serializer):
    name = serializers.CharField()
    cents = serializers.IntegerField()
    display = serializers.SerializerMethodField()

    def get_display(self, obj):
        rate = self.context.get("rate", 1)
        currency = self.context.get("currency", "USD")
        return f"{obj['cents'] * rate / 100:.2f} {currency}"

item = {"name": "Pen", "cents": 250}
print(PriceSerializer(item).data["display"])
print(PriceSerializer(item, context={"currency": "EUR", "rate": 2}).data["display"])`,
          { apps: drfApps },
        ),
        output: '2.50 USD\n5.00 EUR',
        why: 'A `SerializerMethodField` calls `get_<name>(obj)` and is read-only. The serializer itself has no access to the request or other inputs except through `self.context`, so per-request data (currency, user, request) is passed there.',
      },
      {
        key: 'current-user-default',
        code: djangoProgram(
          `from django.contrib.auth.models import User
from rest_framework import serializers
from rest_framework.test import APIRequestFactory

class NoteSerializer(serializers.Serializer):
    text = serializers.CharField()
    owner = serializers.HiddenField(default=serializers.CurrentUserDefault())

request = APIRequestFactory().post("/notes/")
request.user = User(username="ada")

s = NoteSerializer(data={"text": "hi", "owner": "mallory"}, context={"request": request})
print(s.is_valid(), s.validated_data["owner"].username, "owner" in s.data)`,
          { apps: drfApps },
        ),
        output: 'True ada False',
        why: 'A `HiddenField` ignores submitted input and always takes its default; `CurrentUserDefault()` reads `context["request"].user`. So the client cannot claim to be Mallory, and the field never appears in output. Without the request in the context the default would fail.',
      },
    ],
  ),
  ...b.output(
    'dj-drf-ser-advanced-writes',
    5,
    [
      'Writable nested data needs a custom `create()` that pops the nested part.',
      'With `many=True`, errors are a list with one entry per item.',
    ],
    [
      {
        key: 'nested-create',
        code: dbProgram(
          `from django.db import connection, models, transaction
from rest_framework import serializers

class Address(models.Model):
    city = models.CharField(max_length=50)

    class Meta:
        app_label = "crm"

class Customer(models.Model):
    name = models.CharField(max_length=50)
    address = models.OneToOneField(Address, on_delete=models.CASCADE)

    class Meta:
        app_label = "crm"

with connection.schema_editor() as editor:
    editor.create_model(Address)
    editor.create_model(Customer)

class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = ["city"]

class CustomerSerializer(serializers.ModelSerializer):
    address = AddressSerializer()

    class Meta:
        model = Customer
        fields = ["name", "address"]

    def create(self, validated_data):
        address_data = validated_data.pop("address")
        with transaction.atomic():
            address = Address.objects.create(**address_data)
            return Customer.objects.create(address=address, **validated_data)

s = CustomerSerializer(data={"name": "Acme", "address": {"city": "Lyon"}})
s.is_valid(raise_exception=True)
customer = s.save()
print(customer.address.city, Address.objects.count())
print(CustomerSerializer(customer).data)`,
          { apps: drfApps },
        ),
        output: "Lyon 1\n{'name': 'Acme', 'address': {'city': 'Lyon'}}",
        why: '`validated_data["address"]` is a plain dictionary of validated values, so `create()` pops it, creates the address, then the customer. Wrapping both inserts in `transaction.atomic()` ensures no orphan address remains if the customer insert fails. The same serializer then represents the result with the nested object.',
      },
      {
        key: 'many-errors',
        code: djangoProgram(
          `from rest_framework import serializers

class TagSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=5)

s = TagSerializer(data=[{"name": "web"}, {"name": "framework"}, {}], many=True)
print(s.is_valid())
print([sorted(item_errors) for item_errors in s.errors])`,
          { apps: drfApps },
        ),
        output: "False\n[[], ['name'], ['name']]",
        why: '`many=True` wraps the serializer in a `ListSerializer`. One invalid item makes the whole list invalid, and `errors` is a list aligned with the input: an empty dictionary for the valid first item, field errors for the others. Clients can map each error back to the item they sent.',
      },
    ],
  ),
];

export const apiViewsAdvanced: readonly QuestionSource[] = [
  ...b.output(
    'dj-drf-view-hooks',
    4,
    [
      'Throttles count requests per client and answer 429 when the rate is exceeded.',
      '`perform_create()` is where a generic view saves the serializer, with extra values.',
    ],
    [
      {
        key: 'throttle',
        code: djangoProgram(
          `from django.urls import path
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.test import APIClient

@api_view(["GET"])
def search(request):
    return Response({"results": []})

urlpatterns = [path("search/", search)]

c = APIClient()
responses = [c.get("/search/") for _ in range(3)]
print([r.status_code for r in responses], "Retry-After" in responses[2])`,
          {
            ...api,
            settings: [
              `REST_FRAMEWORK={
        "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.AnonRateThrottle"],
        "DEFAULT_THROTTLE_RATES": {"anon": "2/min"},
    }`,
            ],
          },
        ),
        output: '[200, 200, 429] True',
        why: '`AnonRateThrottle` identifies anonymous clients by IP and keeps request history in Django’s cache (local memory here). The third request within a minute gets 429 Too Many Requests with a `Retry-After` header. In production the cache must be shared between processes (Redis, Memcached), or each worker counts separately.',
      },
      {
        key: 'perform-create',
        code: dbProgram(
          `${MIGRATE}
from django.contrib.auth.models import User
from django.db import connection, models
from django.urls import path
from rest_framework import generics, permissions, serializers
from rest_framework.test import APIClient

class Note(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    text = models.CharField(max_length=50)

    class Meta:
        app_label = "notes"

with connection.schema_editor() as editor:
    editor.create_model(Note)

class NoteSerializer(serializers.ModelSerializer):
    owner = serializers.ReadOnlyField(source="owner.username")

    class Meta:
        model = Note
        fields = ["id", "text", "owner"]

class NoteList(generics.ListCreateAPIView):
    serializer_class = NoteSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Note.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

urlpatterns = [path("notes/", NoteList.as_view())]

ada, bob = User.objects.create_user("ada"), User.objects.create_user("bob")
c = APIClient()
c.force_authenticate(ada)
print(c.post("/notes/", {"text": "hi", "owner": "bob"}, format="json").json())
c.force_authenticate(bob)
print(c.get("/notes/").json())`,
          api,
        ),
        output: "{'id': 1, 'text': 'hi', 'owner': 'ada'}\n[]",
        why: '`perform_create()` passes `owner=self.request.user` to `save()`, so the owner always comes from the authenticated user; the read-only `owner` field ignores the submitted `"bob"`. `get_queryset()` scopes the list to the current user, so Bob sees nothing.',
      },
    ],
  ),
  ...b.output(
    'dj-drf-view-per-action',
    5,
    [
      'A viewset knows the current action (`list`, `create`, `retrieve`…) as `self.action`.',
      'Override `get_permissions()` or `get_serializer_class()` to vary them per action.',
    ],
    [
      {
        key: 'permissions',
        code: dbProgram(
          `from django.contrib.auth.models import User
from django.db import connection, models
from django.urls import include, path
from rest_framework import permissions, routers, serializers, viewsets
from rest_framework.test import APIClient

class Book(models.Model):
    title = models.CharField(max_length=100)

    class Meta:
        app_label = "library"

with connection.schema_editor() as editor:
    editor.create_model(Book)

class BookSerializer(serializers.ModelSerializer):
    class Meta:
        model = Book
        fields = ["id", "title"]

class BookViewSet(viewsets.ModelViewSet):
    queryset = Book.objects.all()
    serializer_class = BookSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.AllowAny()]
        return [permissions.IsAdminUser()]

router = routers.DefaultRouter()
router.register("books", BookViewSet)
urlpatterns = [path("", include(router.urls))]

c = APIClient()
print(c.get("/books/").status_code, c.post("/books/", {"title": "Dune"}, format="json").status_code, end=" ")
c.force_authenticate(User(username="root", is_staff=True))
print(c.post("/books/", {"title": "Dune"}, format="json").status_code)`,
          api,
        ),
        output: '200 403 201',
        why: '`get_permissions()` returns permission instances (not classes) and can branch on `self.action`: anyone may read, only staff (`IsAdminUser` checks `is_staff`) may write. This keeps one viewset instead of splitting reads and writes into separate views.',
      },
      {
        key: 'serializer-class',
        code: dbProgram(
          `from django.db import connection, models
from django.urls import include, path
from rest_framework import routers, serializers, viewsets
from rest_framework.test import APIClient

class Book(models.Model):
    title = models.CharField(max_length=100)
    pages = models.IntegerField(default=0)

    class Meta:
        app_label = "library"

with connection.schema_editor() as editor:
    editor.create_model(Book)

class BookSummary(serializers.ModelSerializer):
    class Meta:
        model = Book
        fields = ["id", "title"]

class BookDetail(serializers.ModelSerializer):
    class Meta:
        model = Book
        fields = ["id", "title", "pages"]

class BookViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Book.objects.all()

    def get_serializer_class(self):
        return BookSummary if self.action == "list" else BookDetail

router = routers.DefaultRouter()
router.register("books", BookViewSet)
urlpatterns = [path("", include(router.urls))]

Book.objects.create(title="Dune", pages=412)
c = APIClient()
print(list(c.get("/books/").json()[0]), list(c.get("/books/1/").json()))`,
          api,
        ),
        output: "['id', 'title'] ['id', 'title', 'pages']",
        why: 'Overriding `get_serializer_class()` lets the list stay small while the detail endpoint returns everything. The router derives the basename from `queryset`, so no `serializer_class` attribute is needed when this method is overridden.',
      },
    ],
  ),
];

export const testingAdvanced: readonly QuestionSource[] = [
  ...b.output(
    'dj-test-client-advanced',
    4,
    [
      '`assertRedirects` checks the status and the target; `follow=True` makes the client follow redirects.',
      'By default the test client re-raises exceptions from views.',
    ],
    [
      {
        key: 'redirects',
        code: djangoProgram(
          `${RUN}

from django.http import HttpResponse
from django.shortcuts import redirect
from django.test import SimpleTestCase
from django.urls import path

def old(request):
    return redirect("/new/")

def new(request):
    return HttpResponse("new home")

urlpatterns = [path("old/", old), path("new/", new)]

class RedirectTests(SimpleTestCase):
    def test_redirect(self):
        self.assertRedirects(self.client.get("/old/"), "/new/")

    def test_follow(self):
        response = self.client.get("/old/", follow=True)
        self.assertEqual(response.redirect_chain, [("/new/", 302)])
        self.assertContains(response, "new home")

    def test_wrong_target(self):
        self.assertRedirects(self.client.get("/old/"), "/home/")

run(RedirectTests)`,
          { urls: true },
        ),
        output: '3 1 0',
        why: '`assertRedirects` verifies the 302 and that the target loads; `follow=True` records each hop in `redirect_chain` and returns the final page. The last test names the wrong target, so its assertion fails (a failure, not an error).',
      },
      {
        key: 'raise-request-exception',
        code: djangoProgram(
          `${RUN}

from django.test import Client, SimpleTestCase
from django.urls import path

def broken(request):
    raise ValueError("bug")

urlpatterns = [path("broken/", broken)]

class ErrorTests(SimpleTestCase):
    def test_default_client(self):
        self.assertEqual(self.client.get("/broken/").status_code, 500)

    def test_lenient_client(self):
        client = Client(raise_request_exception=False)
        self.assertEqual(client.get("/broken/").status_code, 500)

run(ErrorTests)`,
          { urls: true },
        ),
        output: '2 0 1',
        why: 'The default test client re-raises the view’s exception in the test, so `test_default_client` ends with an error (the `ValueError`) before any assertion runs: tests surface bugs instead of silently getting a 500. Pass `raise_request_exception=False` to test the 500 response itself.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-test-setup-test-data-copy',
    4,
    'Objects created in `setUpTestData()` are shared by the class, but each test gets its own copy.',
    [
      {
        key: 'in-memory-change',
        code: dbProgram(`${RUN}

from django.db import connection, models
from django.test import TestCase

class Product(models.Model):
    name = models.CharField(max_length=30)
    stock = models.IntegerField()

    class Meta:
        app_label = "shop"

with connection.schema_editor() as editor:
    editor.create_model(Product)

class StockTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.pen = Product.objects.create(name="Pen", stock=5)

    def test_a_sell_out(self):
        self.pen.stock = 0
        self.assertEqual(self.pen.stock, 0)

    def test_b_original(self):
        self.assertEqual(self.pen.stock, 5)

run(StockTests)`),
        correct: '2 0 0',
        wrong: ['2 1 0', '2 0 1', '1 0 0'],
        why: 'Database changes are rolled back after each test, and since Django 3.2 the objects assigned in `setUpTestData()` are also deep-copied for each test, so modifying `self.pen` in memory in one test does not leak into the next. Before that, tests sharing class-level instances could affect each other.',
      },
    ],
  ),
  ...b.output(
    'dj-test-integrity-in-test',
    5,
    [
      'Each `TestCase` test runs inside a transaction.',
      'After a database error inside a transaction, queries fail until a savepoint is rolled back.',
    ],
    [
      {
        key: 'savepoint-needed',
        code: dbProgram(`${RUN}

from django.db import IntegrityError, connection, models, transaction
from django.test import TestCase

class Account(models.Model):
    email = models.CharField(max_length=50, unique=True)

    class Meta:
        app_label = "users"

with connection.schema_editor() as editor:
    editor.create_model(Account)

class DuplicateTests(TestCase):
    def test_without_savepoint(self):
        Account.objects.create(email="ada@example.com")
        try:
            Account.objects.create(email="ada@example.com")
        except IntegrityError:
            pass
        self.assertEqual(Account.objects.count(), 1)

    def test_with_savepoint(self):
        Account.objects.create(email="ada@example.com")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Account.objects.create(email="ada@example.com")
        self.assertEqual(Account.objects.count(), 1)

run(DuplicateTests)`),
        output: '2 0 1',
        why: 'Because `TestCase` wraps each test in `atomic()`, the caught `IntegrityError` leaves the transaction broken and the next query raises `TransactionManagementError`: an error in `test_without_savepoint`. Wrapping the failing statement in its own `transaction.atomic()` creates a savepoint, which is rolled back on its own, so the count query works.',
      },
    ],
  ),
];

export const performanceAdvanced: readonly QuestionSource[] = [
  ...b.output(
    'dj-perf-prefetch-object',
    5,
    [
      '`Prefetch()` lets you choose the queryset used for a prefetch.',
      '`to_attr` stores the result as a plain list attribute.',
    ],
    [
      {
        key: 'filtered-to-attr',
        code: library(
          `with CaptureQueriesContext(connection) as ctx:
    authors = Author.objects.order_by("name").prefetch_related(
        Prefetch("books", queryset=Book.objects.filter(title__endswith="II"), to_attr="sequels")
    )
    result = [[b.title for b in a.sequels] for a in authors]
print(len(ctx.captured_queries), result)`,
          'from django.db.models import Prefetch',
        ),
        output: "2 [['Ada II'], ['Grace II'], ['Linus II']]",
        why: 'The filtered prefetch still costs one extra query for all authors, and `to_attr="sequels"` stores the filtered books as a list, leaving `a.books` untouched (so the two cannot be confused). This replaces a per-author `a.books.filter(...)`, which would run one query per author.',
      },
    ],
  ),
  ...b.output(
    'dj-perf-annotate-instead',
    4,
    ['When you only need a count or a sum, ask the database to compute it per row.'],
    [
      {
        key: 'count-vs-prefetch',
        code: library(
          `with CaptureQueriesContext(connection) as ctx:
    prefetched = [len(a.books.all()) for a in Author.objects.prefetch_related("books")]
print(len(ctx.captured_queries), prefetched)
with CaptureQueriesContext(connection) as ctx:
    counted = [a.n for a in Author.objects.annotate(n=Count("books"))]
print(len(ctx.captured_queries), counted)`,
          'from django.db.models import Count',
        ),
        output: '2 [2, 2, 2]\n1 [2, 2, 2]',
        why: 'Prefetching loads every book row into Python only to count them (2 queries, and all rows transferred). `annotate(Count("books"))` computes the counts in one grouped query and transfers three numbers. Prefetch when you need the related objects; annotate when you need only aggregates.',
      },
    ],
  ),
];
