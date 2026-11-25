import type { QuestionSource } from '@pracstack/content-model';
import { b, dbProgram, djangoProgram, drfApps } from './program';

/*
 * Django REST Framework (a separate package, version 3.16): serializers and
 * validation, API views, generic views, viewsets and routers, pagination,
 * permissions and status codes. Requests go through DRF's real APIClient.
 */

const drf = { apps: drfApps } as const;
const api = { apps: drfApps, urls: true } as const;

/** A Book model and its table, used by several API programs. */
const BOOK = `from django.db import connection, models

class Book(models.Model):
    title = models.CharField(max_length=100)
    pages = models.PositiveIntegerField(default=0)

    class Meta:
        app_label = "library"

with connection.schema_editor() as editor:
    editor.create_model(Book)`;

export const serializerFamilies: readonly QuestionSource[] = [
  ...b.output(
    'dj-drf-ser-validation',
    1,
    [
      'A serializer validates incoming data like a form: `is_valid()`, then `validated_data` or `errors`.',
      'Fields are required unless `required=False` or a default is given.',
    ],
    [
      {
        key: 'valid',
        code: djangoProgram(
          `from rest_framework import serializers

class SignupSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=20)
    age = serializers.IntegerField(min_value=13)

s = SignupSerializer(data={"username": "ada", "age": "36"})
print(s.is_valid())
print(s.validated_data)`,
          drf,
        ),
        output: "True\n{'username': 'ada', 'age': 36}",
        why: '`IntegerField` converts the string `"36"` to an integer in `validated_data`, just like a Django form field. DRF serializers are part of Django REST Framework, a separate package installed alongside Django.',
      },
      {
        key: 'errors',
        code: djangoProgram(
          `from rest_framework import serializers

class SignupSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=20)
    age = serializers.IntegerField(min_value=13)

s = SignupSerializer(data={"age": 9})
print(s.is_valid())
print(sorted(s.errors))
print(s.errors["username"][0], "|", s.errors["age"][0])`,
          drf,
        ),
        output:
          "False\n['age', 'username']\nThis field is required. | Ensure this value is greater than or equal to 13.",
        why: 'All fields are validated and every problem is reported at once, keyed by field name. In an API view these errors become the body of a 400 response.',
      },
    ],
  ),
  ...b.output(
    'dj-drf-ser-read-write-only',
    2,
    [
      '`read_only` fields appear in output but are ignored in input.',
      '`write_only` fields are accepted in input but never appear in output.',
    ],
    [
      {
        key: 'write-only-password',
        code: djangoProgram(
          `from rest_framework import serializers

class AccountSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

s = AccountSerializer(data={"id": 99, "email": "ada@example.com", "password": "s3cret"})
s.is_valid()
print(dict(s.validated_data))
print(AccountSerializer({"id": 1, "email": "ada@example.com", "password": "s3cret"}).data)`,
          drf,
        ),
        output:
          "{'email': 'ada@example.com', 'password': 's3cret'}\n{'id': 1, 'email': 'ada@example.com'}",
        why: 'The client cannot set `id`: read-only input is dropped without an error. The password is accepted for writing but left out of serialized output, so it is never sent back in a response.',
      },
      {
        key: 'model-read-only',
        code: dbProgram(
          `${BOOK}

from rest_framework import serializers

class BookSerializer(serializers.ModelSerializer):
    class Meta:
        model = Book
        fields = ["id", "title", "pages"]
        read_only_fields = ["pages"]

s = BookSerializer(data={"id": 5, "title": "Dune", "pages": 999})
s.is_valid()
book = s.save()
print(book.id, book.pages)
print(BookSerializer(book).data)`,
          drf,
        ),
        output: "1 0\n{'id': 1, 'title': 'Dune', 'pages': 0}",
        why: '`ModelSerializer` makes the auto primary key read-only, and `read_only_fields` does the same for `pages`, so both submitted values are ignored: the database assigns `id` 1 and `pages` keeps its model default 0.',
      },
    ],
  ),
  ...b.fails(
    'dj-drf-ser-misuse',
    2,
    'Serializers enforce the order: pass data, validate, then read or save.',
    [
      {
        key: 'data-before-valid',
        question: 'This code fails. Why?',
        code: djangoProgram(
          `from rest_framework import serializers

class TagSerializer(serializers.Serializer):
    name = serializers.CharField()

s = TagSerializer(data={"name": "django"})
print(s.data)`,
          drf,
        ),
        error: 'AssertionError',
        correct: 'With `data=`, you must call `is_valid()` before reading `.data`.',
        wrong: [
          '`.data` only exists on `ModelSerializer`.',
          'The serializer must be given an instance as the first argument as well.',
          '`CharField` requires `max_length` in DRF.',
        ],
        why: 'DRF asserts that input is validated before it is represented: "When a serializer is passed a `data` keyword argument you must call `.is_valid()` before attempting to access the serialized `.data` representation." Output-only serializers (given an instance) need no validation.',
      },
      {
        key: 'raise-exception',
        question: 'This code stops with an exception instead of printing errors. Why?',
        code: djangoProgram(
          `from rest_framework import serializers

class TagSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=10)

s = TagSerializer(data={"name": "a-very-long-tag"})
s.is_valid(raise_exception=True)
print(s.errors)`,
          drf,
        ),
        error: 'ValidationError',
        correct:
          '`raise_exception=True` raises `ValidationError` for invalid data; inside a DRF view that exception becomes a 400 response automatically.',
        wrong: [
          '`max_length` is not supported by `CharField`, so DRF raises an error.',
          '`is_valid()` always raises; `errors` is only for forms.',
          'The serializer must call `save()` before `errors` is filled.',
        ],
        why: 'In API views, `serializer.is_valid(raise_exception=True)` is the idiomatic shortcut: DRF’s exception handler turns the `ValidationError` into a 400 with the errors as JSON. Outside a view, nothing catches it.',
      },
      {
        key: 'save-without-create',
        question: 'Saving fails. Why?',
        code: djangoProgram(
          `from rest_framework import serializers

class FeedbackSerializer(serializers.Serializer):
    message = serializers.CharField()

s = FeedbackSerializer(data={"message": "Great"})
s.is_valid()
s.save()`,
          drf,
        ),
        error: 'NotImplementedError',
        correct:
          'A plain `Serializer` does not know how to store data; implement `create()` (and `update()`), or use a `ModelSerializer`.',
        wrong: [
          '`save()` needs the request as an argument.',
          '`save()` can only be called on serializers created with `instance=`.',
          'Plain serializers are read-only; data cannot be validated with them.',
        ],
        why: '`save()` calls `create(validated_data)` (or `update()` when an instance was passed). The base class raises `NotImplementedError: create() must be implemented.` `ModelSerializer` provides both methods for model instances.',
      },
    ],
  ),
  ...b.output(
    'dj-drf-ser-validate-methods',
    3,
    [
      '`validate_<field>()` checks one value; `validate()` sees all validated fields.',
      'Errors from `validate()` are reported under `non_field_errors`.',
    ],
    [
      {
        key: 'field-and-object',
        code: djangoProgram(
          `from rest_framework import serializers

class EventSerializer(serializers.Serializer):
    name = serializers.CharField()
    start = serializers.IntegerField()
    end = serializers.IntegerField()

    def validate_name(self, value):
        return value.strip().title()

    def validate(self, attrs):
        if attrs["end"] <= attrs["start"]:
            raise serializers.ValidationError("end must be after start")
        return attrs

ok = EventSerializer(data={"name": " django con ", "start": 1, "end": 3})
print(ok.is_valid(), ok.validated_data["name"])
bad = EventSerializer(data={"name": "x", "start": 5, "end": 2})
print(bad.is_valid(), bad.errors["non_field_errors"][0])`,
          drf,
        ),
        output: 'True Django Con\nFalse end must be after start',
        why: 'Like a form’s `clean_<field>()`, `validate_name()` returns the value to keep. `validate()` handles rules spanning several fields; its errors are keyed `non_field_errors`.',
      },
      {
        key: 'skipped',
        code: djangoProgram(
          `from rest_framework import serializers

class EventSerializer(serializers.Serializer):
    start = serializers.IntegerField()
    end = serializers.IntegerField()

    def validate(self, attrs):
        print("validate called")
        return attrs

s = EventSerializer(data={"start": "soon", "end": 2})
print(s.is_valid(), list(s.errors))`,
          drf,
        ),
        output: "False ['start']",
        why: 'Unlike a Django form’s `clean()`, DRF only calls `validate()` when every field passed its own validation, so `attrs` always contains valid values. Here `start` fails, `validate()` is never called, and only the field error is reported.',
      },
    ],
  ),
  ...b.output(
    'dj-drf-ser-nested',
    3,
    [
      'A serializer can be used as a field of another serializer.',
      '`source` reads a value from a different attribute, including across relations.',
    ],
    [
      {
        key: 'nested-and-source',
        code: dbProgram(
          `from django.db import connection, models
from rest_framework import serializers

class Author(models.Model):
    name = models.CharField(max_length=50)

    class Meta:
        app_label = "library"

class Book(models.Model):
    title = models.CharField(max_length=100)
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name="books")

    class Meta:
        app_label = "library"

with connection.schema_editor() as editor:
    editor.create_model(Author)
    editor.create_model(Book)

class BookSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.name", read_only=True)

    class Meta:
        model = Book
        fields = ["title", "author_name"]

class AuthorSerializer(serializers.ModelSerializer):
    books = BookSerializer(many=True, read_only=True)

    class Meta:
        model = Author
        fields = ["name", "books"]

ada = Author.objects.create(name="Ada")
Book.objects.create(title="Notes", author=ada)
print(AuthorSerializer(ada).data)`,
          drf,
        ),
        output: "{'name': 'Ada', 'books': [{'title': 'Notes', 'author_name': 'Ada'}]}",
        why: '`BookSerializer(many=True)` serializes the reverse relation `books` as a list of objects. `source="author.name"` follows the foreign key. Both are read-only, which is the simple case; nested writes need custom code.',
      },
      {
        key: 'primary-key-default',
        code: dbProgram(
          `from django.db import connection, models
from rest_framework import serializers

class Author(models.Model):
    name = models.CharField(max_length=50)

    class Meta:
        app_label = "library"

class Book(models.Model):
    title = models.CharField(max_length=100)
    author = models.ForeignKey(Author, on_delete=models.CASCADE)

    class Meta:
        app_label = "library"

with connection.schema_editor() as editor:
    editor.create_model(Author)
    editor.create_model(Book)

class BookSerializer(serializers.ModelSerializer):
    class Meta:
        model = Book
        fields = ["title", "author"]

ada = Author.objects.create(name="Ada")
print(BookSerializer(Book.objects.create(title="Notes", author=ada)).data)
s = BookSerializer(data={"title": "X", "author": 42})
print(s.is_valid(), s.errors["author"][0])`,
          drf,
        ),
        output:
          '{\'title\': \'Notes\', \'author\': 1}\nFalse Invalid pk "42" - object does not exist.',
        why: 'By default `ModelSerializer` represents a foreign key as a `PrimaryKeyRelatedField`: the id on output, and on input an id that must exist, which DRF checks with a query.',
      },
    ],
  ),
  ...b.output(
    'dj-drf-ser-model-serializer',
    4,
    [
      '`ModelSerializer` derives fields, validators and `required` from the model.',
      'Passing an instance makes `save()` update it; `partial=True` makes every field optional.',
    ],
    [
      {
        key: 'unique-and-required',
        code: dbProgram(
          `from django.db import connection, models
from rest_framework import serializers

class Account(models.Model):
    email = models.EmailField(unique=True)
    nickname = models.CharField(max_length=30, blank=True)
    plan = models.CharField(max_length=10, default="free")

    class Meta:
        app_label = "users"

with connection.schema_editor() as editor:
    editor.create_model(Account)

class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = ["email", "nickname", "plan"]

Account.objects.create(email="ada@example.com")
s = AccountSerializer(data={"email": "ada@example.com"})
print(s.is_valid(), s.errors["email"][0])
s = AccountSerializer(data={"email": "grace@example.com"})
print(s.is_valid(), s.save().plan)`,
          drf,
        ),
        output:
          'False account with this email already exists.\nTrue free',
        why: '`unique=True` becomes a `UniqueValidator`, so duplicates are a 400-style validation error rather than an `IntegrityError`. Fields with `blank=True` or a model default are not required; the default fills `plan`.',
      },
      {
        key: 'partial-update',
        code: dbProgram(
          `${BOOK}

from rest_framework import serializers

class BookSerializer(serializers.ModelSerializer):
    class Meta:
        model = Book
        fields = ["title", "pages"]

book = Book.objects.create(title="Dune", pages=412)
full = BookSerializer(book, data={"pages": 500})
print(full.is_valid(), list(full.errors))
patch = BookSerializer(book, data={"pages": 500}, partial=True)
print(patch.is_valid(), patch.save().title, Book.objects.get().pages)`,
          drf,
        ),
        output: "False ['title']\nTrue Dune 500",
        why: 'With an instance and data, `save()` calls `update()`. A full update (PUT) still requires every required field; `partial=True` (what DRF uses for PATCH) validates only the fields sent and keeps the rest.',
      },
    ],
  ),
  ...b.fails(
    'dj-drf-ser-nested-writes',
    5,
    'Nested serializers are easy to read and deliberately not writable by default.',
    [
      {
        key: 'nested-create',
        question:
          'The nested `address` serializer is writable, and saving fails. What is the cause?',
        code: dbProgram(
          `from django.db import connection, models
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

s = CustomerSerializer(data={"name": "Acme", "address": {"city": "Lyon"}})
s.is_valid(raise_exception=True)
s.save()`,
          drf,
        ),
        error: 'AssertionError',
        correct:
          '`ModelSerializer.create()` does not support writable nested fields; override `create()` to create the `Address` first, then the `Customer`.',
        wrong: [
          'Nested data fails validation because `address` must be an id.',
          'One-to-one relations cannot be serialized.',
          '`save()` must be called with `address=...` for every nested serializer.',
        ],
        why: 'Validation succeeds (the nested data is valid), but the default `create()` refuses: "The `.create()` method does not support writable nested fields by default." DRF cannot guess whether to create, reuse or update related objects, so you write that logic, usually inside `transaction.atomic()`.',
      },
    ],
  ),
  ...b.concept(
    'dj-drf-ser-concepts',
    2,
    'DRF is an add-on to Django, not part of it.',
    [
      {
        key: 'separate-package',
        question: 'How does Django REST Framework relate to Django?',
        correct:
          'It is a separate package (`djangorestframework`), installed with pip and added to `INSTALLED_APPS` as `"rest_framework"`; it builds on Django’s request handling, ORM and auth.',
        wrong: [
          'It is part of Django core since Django 4.0 and needs no installation.',
          'It replaces Django’s ORM with its own serializer-based database layer.',
          'It is a JavaScript client for calling Django views.',
        ],
        why: 'DRF is maintained separately and versioned on its own (3.16 here, with Django 5.2). It adds serializers, API views, authentication and permission classes, routers and a browsable API on top of Django; models and the ORM stay Django’s.',
      },
      {
        key: 'serializer-vs-form',
        question: 'Why do APIs built with DRF use serializers instead of Django forms?',
        correct:
          'Serializers convert in both directions (objects to JSON-friendly data and input back to validated data), handle nested and list data, and integrate with DRF views, parsers and error responses.',
        wrong: [
          'Django forms cannot validate data that did not come from an HTML page.',
          'Serializers are faster because they skip validation.',
          'Forms are deprecated in Django 5.2.',
        ],
        why: 'Forms validate flat input and render HTML widgets; serializers also produce output representations, support nested structures, and plug into content negotiation. Serializers do validate (that is half their job), and forms are not deprecated.',
      },
    ],
  ),
];

export const apiViewFamilies: readonly QuestionSource[] = [
  ...b.output(
    'dj-drf-view-api-view',
    1,
    [
      '`@api_view` lists the allowed methods and gives the view DRF’s `Request` and `Response`.',
      '`request.data` holds the parsed body, JSON included.',
    ],
    [
      {
        key: 'get-and-post',
        code: djangoProgram(
          `from django.urls import path
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.test import APIClient

@api_view(["GET", "POST"])
def echo(request):
    if request.method == "POST":
        return Response({"got": request.data["msg"]}, status=201)
    return Response({"hello": "world"})

urlpatterns = [path("echo/", echo)]

c = APIClient()
print(c.get("/echo/").json())
r = c.post("/echo/", {"msg": "hi"}, format="json")
print(r.status_code, r.json())
print(c.delete("/echo/").status_code)`,
          api,
        ),
        output: "{'hello': 'world'}\n201 {'got': 'hi'}\n405",
        why: 'DRF parses the JSON body into `request.data` (plain Django would leave it in `request.body`). `Response` renders the data with content negotiation, and methods not listed in `@api_view` get 405.',
      },
      {
        key: 'api-view-class',
        code: djangoProgram(
          `from django.urls import path
from rest_framework import status
from rest_framework.response import Response
from rest_framework.test import APIClient
from rest_framework.views import APIView

class Health(APIView):
    def get(self, request):
        return Response({"ok": True})

    def post(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)

urlpatterns = [path("health/", Health.as_view())]

c = APIClient()
print(c.get("/health/").json(), c.post("/health/").status_code, c.put("/health/").status_code)`,
          api,
        ),
        output: "{'ok': True} 204 405",
        why: '`APIView` dispatches by method like Django’s `View`, with DRF’s request parsing, authentication and permissions added. The `status` module gives readable names for codes; PUT has no handler, so 405.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-drf-view-status',
    2,
    'Which status does the view or DRF choose for this outcome?',
    [
      {
        key: 'validation-400',
        code: djangoProgram(
          `from django.urls import path
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.test import APIClient

class OrderSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1)

@api_view(["POST"])
def create_order(request):
    s = OrderSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    return Response(s.validated_data, status=201)

urlpatterns = [path("orders/", create_order)]

r = APIClient().post("/orders/", {"quantity": 0}, format="json")
print(r.status_code, list(r.json()))`,
          api,
        ),
        correct: "400 ['quantity']",
        wrong: ["500 ['detail']", "422 ['quantity']", "201 ['quantity']"],
        why: 'The `ValidationError` raised by `is_valid(raise_exception=True)` is turned into 400 Bad Request with the field errors as the body. DRF does not use 422 by default, and the exception never becomes a 500.',
      },
      {
        key: 'not-found',
        code: dbProgram(
          `${BOOK}

from django.urls import path
from rest_framework import generics, serializers
from rest_framework.test import APIClient

class BookSerializer(serializers.ModelSerializer):
    class Meta:
        model = Book
        fields = ["id", "title"]

class BookDetail(generics.RetrieveAPIView):
    queryset = Book.objects.all()
    serializer_class = BookSerializer

urlpatterns = [path("books/<int:pk>/", BookDetail.as_view())]

r = APIClient().get("/books/7/")
print(r.status_code, r.json())`,
          api,
        ),
        correct: "404 {'detail': 'No Book matches the given query.'}",
        wrong: ["404 {'detail': 'Not found.'}", "500 {'detail': 'Book matching query does not exist.'}", '200 {}'],
        why: '`get_object()` uses `get_object_or_404()`, and DRF’s exception handler renders `Http404` as a 404 with a `detail` message. `DoesNotExist` never escapes as a 500.',
      },
    ],
  ),
  ...b.output(
    'dj-drf-view-generic',
    3,
    [
      'Generic views combine a queryset, a serializer class and mixins for list, create, retrieve, update and destroy.',
      'Override `get_queryset()` to filter per request.',
    ],
    [
      {
        key: 'list-create',
        code: dbProgram(
          `${BOOK}

from django.urls import path
from rest_framework import generics, serializers
from rest_framework.test import APIClient

class BookSerializer(serializers.ModelSerializer):
    class Meta:
        model = Book
        fields = ["id", "title", "pages"]

class BookList(generics.ListCreateAPIView):
    queryset = Book.objects.order_by("title")
    serializer_class = BookSerializer

urlpatterns = [path("books/", BookList.as_view())]

c = APIClient()
print(c.post("/books/", {"title": "Emma", "pages": 300}, format="json").status_code)
print(c.post("/books/", {"title": "Dune"}, format="json").status_code)
print(c.get("/books/").json())`,
          api,
        ),
        output:
          "201\n201\n[{'id': 2, 'title': 'Dune', 'pages': 0}, {'id': 1, 'title': 'Emma', 'pages': 300}]",
        why: '`ListCreateAPIView` handles GET (list) and POST (create, answering 201). `pages` has a model default, so it is optional. The list follows the queryset’s ordering.',
      },
      {
        key: 'get-queryset',
        code: dbProgram(
          `${BOOK}

from django.urls import path
from rest_framework import generics, serializers
from rest_framework.test import APIClient

class BookSerializer(serializers.ModelSerializer):
    class Meta:
        model = Book
        fields = ["title"]

class LongBooks(generics.ListAPIView):
    serializer_class = BookSerializer

    def get_queryset(self):
        minimum = int(self.request.query_params.get("min", 0))
        return Book.objects.filter(pages__gte=minimum).order_by("title")

urlpatterns = [path("books/", LongBooks.as_view())]

Book.objects.bulk_create([Book(title="Emma", pages=300), Book(title="Dune", pages=412)])
print(APIClient().get("/books/", {"min": 400}).json())`,
          api,
        ),
        output: "[{'title': 'Dune'}]",
        why: '`get_queryset()` runs per request, so it can depend on `self.request` (query parameters, the user). `query_params` is DRF’s name for `request.GET`.',
      },
    ],
  ),
  ...b.output(
    'dj-drf-view-routers',
    3,
    [
      'A router generates list and detail routes for a viewset, named `<basename>-list` and `<basename>-detail`.',
      '`@action` adds extra routes.',
    ],
    [
      {
        key: 'names',
        code: dbProgram(
          `${BOOK}

from django.urls import include, path, reverse
from rest_framework import routers, serializers, viewsets

class BookSerializer(serializers.ModelSerializer):
    class Meta:
        model = Book
        fields = ["id", "title"]

class BookViewSet(viewsets.ModelViewSet):
    queryset = Book.objects.all()
    serializer_class = BookSerializer

router = routers.DefaultRouter()
router.register("books", BookViewSet)
urlpatterns = [path("api/", include(router.urls))]

print(reverse("book-list"), reverse("book-detail", args=[3]))`,
          api,
        ),
        output: '/api/books/ /api/books/3/',
        why: 'The basename defaults to the model name in lowercase (`book`), taken from the viewset’s `queryset`. A `ModelViewSet` on the two routes provides list, create, retrieve, update, partial update and destroy.',
      },
      {
        key: 'action',
        code: dbProgram(
          `${BOOK}

from django.urls import include, path
from rest_framework import routers, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.test import APIClient

class BookSerializer(serializers.ModelSerializer):
    class Meta:
        model = Book
        fields = ["id", "title", "pages"]

class BookViewSet(viewsets.ModelViewSet):
    queryset = Book.objects.all()
    serializer_class = BookSerializer

    @action(detail=True, methods=["post"])
    def double(self, request, pk=None):
        book = self.get_object()
        book.pages *= 2
        book.save()
        return Response({"pages": book.pages})

router = routers.DefaultRouter()
router.register("books", BookViewSet)
urlpatterns = [path("api/", include(router.urls))]

Book.objects.create(title="Dune", pages=400)
c = APIClient()
print(c.post("/api/books/1/double/").json())
print(c.get("/api/books/1/double/").status_code)
print(c.delete("/api/books/1/").status_code, Book.objects.count())`,
          api,
        ),
        output: "{'pages': 800}\n405\n204 0",
        why: '`@action(detail=True)` adds `/books/{pk}/double/`, accepting only the listed methods (GET gives 405). `ModelViewSet`’s destroy answers 204 No Content.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-drf-view-pagination',
    4,
    'With pagination, a list response is wrapped in an envelope.',
    [
      {
        key: 'page-number',
        code: dbProgram(
          `${BOOK}

from django.urls import path
from rest_framework import generics, serializers
from rest_framework.test import APIClient

class BookSerializer(serializers.ModelSerializer):
    class Meta:
        model = Book
        fields = ["title"]

class BookList(generics.ListAPIView):
    queryset = Book.objects.order_by("id")
    serializer_class = BookSerializer

urlpatterns = [path("books/", BookList.as_view())]

Book.objects.bulk_create([Book(title=t) for t in ["A", "B", "C", "D", "E"]])
data = APIClient().get("/books/", {"page": 2}).json()
print(data["count"], data["next"], data["previous"], [b["title"] for b in data["results"]])`,
          {
            ...api,
            settings: [
              'REST_FRAMEWORK={"DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination", "PAGE_SIZE": 2}',
            ],
          },
        ),
        correct: "5 http://testserver/books/?page=3 http://testserver/books/ ['C', 'D']",
        wrong: [
          "2 http://testserver/books/?page=3 http://testserver/books/?page=1 ['C', 'D']",
          "5 /books/?page=3 /books/?page=1 ['C', 'D']",
          "5 http://testserver/books/?page=3 http://testserver/books/ ['B', 'C']",
        ],
        why: '`count` is the total number of items, not of the page. `next` and `previous` are absolute URLs built from the request; the link to page 1 omits `?page=1`. Page 2 with two items per page holds C and D. Paginate with a stable ordering, or items can repeat or vanish between pages.',
      },
      {
        key: 'unpaginated',
        code: dbProgram(
          `${BOOK}

from django.urls import path
from rest_framework import generics, serializers
from rest_framework.test import APIClient

class BookSerializer(serializers.ModelSerializer):
    class Meta:
        model = Book
        fields = ["title"]

class BookList(generics.ListAPIView):
    queryset = Book.objects.order_by("id")
    serializer_class = BookSerializer

urlpatterns = [path("books/", BookList.as_view())]

Book.objects.bulk_create([Book(title=t) for t in ["A", "B", "C"]])
print(APIClient().get("/books/", {"page": 2}).json())`,
          api,
        ),
        correct: "[{'title': 'A'}, {'title': 'B'}, {'title': 'C'}]",
        wrong: ["{'count': 3, 'next': None, 'previous': None, 'results': []}", "[{'title': 'C'}]", '404'],
        why: 'Pagination is off unless a pagination class is configured (globally with `PAGE_SIZE` or on the view), so `?page=2` is ignored and the whole list is returned as a plain array. On large tables that is a performance risk.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-drf-view-permissions',
    3,
    'Permission classes decide access; the authentication classes decide between 401 and 403.',
    [
      {
        key: 'is-authenticated',
        code: dbProgram(
          `from django.core.management import call_command
from django.contrib.auth.models import User
from django.urls import path
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.test import APIClient

call_command("migrate", verbosity=0)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    return Response({"user": request.user.username})

urlpatterns = [path("me/", me)]

c = APIClient()
print(c.get("/me/").status_code, end=" ")
c.force_authenticate(user=User.objects.create_user("ada"))
print(c.get("/me/").json())`,
          api,
        ),
        correct: "403 {'user': 'ada'}",
        wrong: ["401 {'user': 'ada'}", "200 {'user': ''}", "302 {'user': 'ada'}"],
        why: 'With DRF’s default authentication classes (session first, then basic), an unauthenticated request gets 403: session authentication sends no `WWW-Authenticate` header, and without one DRF must not answer 401. APIs do not redirect to a login page.',
      },
      {
        key: 'basic-first',
        code: djangoProgram(
          `from django.urls import path
from rest_framework.authentication import BasicAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.test import APIClient

@api_view(["GET"])
@authentication_classes([BasicAuthentication])
@permission_classes([IsAuthenticated])
def me(request):
    return Response({"user": request.user.username})

urlpatterns = [path("me/", me)]

r = APIClient().get("/me/")
print(r.status_code, r["WWW-Authenticate"])`,
          api,
        ),
        correct: '401 Basic realm="api"',
        wrong: ['403 Basic realm="api"', '401 Bearer', '403 None'],
        why: 'When the first authentication class can describe a challenge (`BasicAuthentication` sends `WWW-Authenticate: Basic realm="api"`), DRF answers 401 Unauthorized. Whether clients see 401 or 403 therefore depends on the authentication classes, not only the permission.',
      },
      {
        key: 'read-only',
        code: djangoProgram(
          `from django.contrib.auth.models import User
from django.urls import path
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.test import APIClient

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticatedOrReadOnly])
def posts(request):
    return Response({"method": request.method})

urlpatterns = [path("posts/", posts)]

c = APIClient()
print(c.get("/posts/").status_code, c.post("/posts/").status_code, end=" ")
c.force_authenticate(user=User(username="ada"))
print(c.post("/posts/").status_code)`,
          api,
        ),
        correct: '200 403 200',
        wrong: ['403 403 200', '200 200 200', '200 401 200'],
        why: '`IsAuthenticatedOrReadOnly` allows the safe methods (GET, HEAD, OPTIONS) for everyone and requires authentication for the others, so the anonymous POST is refused and the authenticated one passes. (`force_authenticate()` skips authentication in tests; the user does not even need to be saved.)',
      },
    ],
  ),
  ...b.codeChoice(
    'dj-drf-view-object-permissions',
    5,
    '`has_object_permission()` only runs when the view calls `get_object()`.',
    [
      {
        key: 'list-not-filtered',
        question:
          'Each note should be visible only to its owner. Bob gets Ada’s note in the list but 403 on its detail URL. What is wrong?',
        code: dbProgram(
          `from django.core.management import call_command
from django.contrib.auth.models import User
from django.db import connection, models
from django.urls import include, path
from rest_framework import permissions, routers, serializers, viewsets
from rest_framework.test import APIClient

call_command("migrate", verbosity=0)

class Note(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    text = models.CharField(max_length=50)

    class Meta:
        app_label = "notes"

with connection.schema_editor() as editor:
    editor.create_model(Note)

class IsOwner(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.owner == request.user

class NoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Note
        fields = ["id", "text"]

class NoteViewSet(viewsets.ModelViewSet):
    queryset = Note.objects.all()
    serializer_class = NoteSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

router = routers.DefaultRouter()
router.register("notes", NoteViewSet)
urlpatterns = [path("", include(router.urls))]

Note.objects.create(owner=User.objects.create_user("ada"), text="ada's secret")
c = APIClient()
c.force_authenticate(user=User.objects.create_user("bob"))
print(c.get("/notes/").json(), c.get("/notes/1/").status_code)`,
          api,
        ),
        correct:
          'Object permissions are not checked for list results; override `get_queryset()` to return `Note.objects.filter(owner=self.request.user)`.',
        wrong: [
          '`IsOwner` must also implement `has_permission()` returning `False`.',
          'Permission classes are combined with OR, so `IsAuthenticated` lets Bob through.',
          'The router skips permissions for the list route unless `detail=False` is set.',
        ],
        why: 'The program prints Ada’s note in Bob’s list and 403 for the detail. DRF calls `has_object_permission()` only from `get_object()` (retrieve, update, destroy); filtering a list is the queryset’s job. Scoping `get_queryset()` fixes both: the list is filtered, and other users’ detail URLs answer 404 rather than revealing that the note exists. Permission classes are combined with AND by default.',
      },
    ],
  ),
];
