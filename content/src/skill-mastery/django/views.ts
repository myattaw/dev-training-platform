import type { QuestionSource } from '@pracstack/content-model';
import { b, dbProgram, djangoProgram } from './program';

/*
 * Views: function-based and class-based views, request and response objects,
 * JsonResponse, HTTP method handling and shortcuts. Requests go through the
 * real test Client.
 */

const urls = { urls: true } as const;
const templates = (files: string) =>
  `TEMPLATES=[{
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "OPTIONS": {"loaders": [("django.template.loaders.locmem.Loader", ${files})]},
    }]`;

export const viewsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'dj-view-basics',
    1,
    ['A view takes an `HttpRequest` and returns an `HttpResponse`.', 'Look at the status each response sets.'],
    [
      {
        key: 'http-response',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

def hello(request):
    return HttpResponse("Hello, " + request.GET.get("name", "world"))

urlpatterns = [path("hello/", hello)]

r = Client().get("/hello/", {"name": "Ada"})
print(r.status_code, r.content.decode())`,
          urls,
        ),
        output: '200 Hello, Ada',
        why: '`HttpResponse` defaults to status 200. The test client encodes the dictionary as the query string, and `request.GET.get()` reads it with a default for missing keys.',
      },
      {
        key: 'json-response',
        code: djangoProgram(
          `from django.http import JsonResponse
from django.test import Client
from django.urls import path

def created(request):
    return JsonResponse({"id": 7}, status=201)

urlpatterns = [path("items/", created)]

r = Client().get("/items/")
print(r.status_code, r["Content-Type"])
print(r.json())`,
          urls,
        ),
        output: "201 application/json\n{'id': 7}",
        why: '`JsonResponse` serializes the dictionary with `json.dumps` and sets `Content-Type: application/json`; `status` overrides the default 200. The test client’s `json()` parses the body back.',
      },
      {
        key: 'not-found',
        code: djangoProgram(
          `from django.http import HttpResponse, HttpResponseNotFound
from django.test import Client
from django.urls import path

def page(request, slug):
    if slug != "home":
        return HttpResponseNotFound("no such page")
    return HttpResponse("home")

urlpatterns = [path("p/<slug:slug>/", page)]

c = Client()
print(c.get("/p/home/").status_code, c.get("/p/faq/").status_code)`,
          urls,
        ),
        output: '200 404',
        why: '`HttpResponseNotFound` is an `HttpResponse` subclass with status 404. Returning it is the same as `HttpResponse(..., status=404)`; raising `Http404` is the other common way to produce a 404.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-view-methods',
    2,
    'Which methods does the view accept, and what does Django answer for the others?',
    [
      {
        key: 'require-http-methods',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path
from django.views.decorators.http import require_http_methods

@require_http_methods(["GET", "HEAD"])
def report(request):
    return HttpResponse("report")

urlpatterns = [path("report/", report)]

r = Client().post("/report/")
print(r.status_code, r["Allow"])`,
          urls,
        ),
        correct: '405 GET, HEAD',
        wrong: ['403 GET, HEAD', '404 GET, HEAD', '200 GET, HEAD'],
        why: 'The decorator returns `HttpResponseNotAllowed` (405 Method Not Allowed) for other methods, with an `Allow` header listing the accepted ones. 403 means forbidden for this user and 404 means no such resource; neither describes a wrong method.',
      },
      {
        key: 'class-based',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path
from django.views import View

class Inbox(View):
    def get(self, request):
        return HttpResponse("messages")

urlpatterns = [path("inbox/", Inbox.as_view())]

c = Client()
print(c.get("/inbox/").status_code, c.delete("/inbox/").status_code)`,
          urls,
        ),
        correct: '200 405',
        wrong: ['200 200', '200 404', '200 500'],
        why: '`View.dispatch()` looks for a method named after the HTTP verb (`get`, `post`, `delete`…). There is no `delete()`, so it calls `http_method_not_allowed()`, which returns 405.',
      },
      {
        key: 'plain-function',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

def save(request):
    return HttpResponse("saved " + request.method)

urlpatterns = [path("save/", save)]

print(Client().get("/save/").content.decode())`,
          urls,
        ),
        correct: 'saved GET',
        wrong: ['405', 'saved POST', '403'],
        why: 'A plain function view accepts every method; nothing restricts `save` to POST. If a view changes data, check `request.method` or use `@require_POST`, otherwise a simple link (a GET) can trigger the change.',
      },
    ],
  ),
  ...b.fails(
    'dj-view-response-errors',
    2,
    'Read what the view returns and what the response class accepts.',
    [
      {
        key: 'json-list',
        question: 'Requesting `/tags/` fails with an error. Why?',
        code: djangoProgram(
          `from django.http import JsonResponse
from django.test import Client
from django.urls import path

def tags(request):
    return JsonResponse(["django", "python"])

urlpatterns = [path("tags/", tags)]

Client().get("/tags/")`,
          urls,
        ),
        error: 'TypeError',
        correct:
          '`JsonResponse` only accepts a dictionary unless you pass `safe=False`; wrap the list, for example `{"tags": [...]}`.',
        wrong: [
          'Lists cannot be serialized to JSON.',
          'The view must call `json.dumps()` before returning.',
          '`JsonResponse` needs `status=200` when the body is a list.',
        ],
        why: 'With the default `safe=True`, `JsonResponse` raises `TypeError: In order to allow non-dict objects to be serialized set the safe parameter to False.` Returning an object at the top level is also easier to extend later (adding a `count` field, for example).',
      },
      {
        key: 'returns-none',
        question: 'Requesting `/ping/` fails. Why?',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

def ping(request):
    if request.GET.get("verbose"):
        return HttpResponse("pong (verbose)")

urlpatterns = [path("ping/", ping)]

Client().get("/ping/")`,
          urls,
        ),
        error: "didn't return an HttpResponse object",
        correct:
          'Without `?verbose` the function falls off the end and returns `None`; every path through a view must return a response.',
        wrong: [
          'A view cannot read `request.GET` without declaring a parameter for it.',
          'Django turns `None` into an empty 204 response, so the error comes from the test client.',
          '`HttpResponse` must be given a status code.',
        ],
        why: 'Django checks the return value and raises `ValueError: The view __main__.ping didn\'t return an HttpResponse object. It returned None instead.` There is no automatic 204 for `None`. Add a final `return` for the other branch.',
      },
      {
        key: 'returns-dict',
        question: 'Requesting `/stats/` fails. Why?',
        code: djangoProgram(
          `from django.test import Client
from django.urls import path

def stats(request):
    return {"users": 3}

urlpatterns = [path("stats/", stats)]

Client().get("/stats/")`,
          urls,
        ),
        error: 'AttributeError',
        correct: 'A plain view must return an `HttpResponse`; use `JsonResponse({"users": 3})`.',
        wrong: [
          'Django serializes dictionaries automatically, so the test client is misconfigured.',
          'The view must set `content_type="application/json"` on the route for dictionaries to work.',
          'Function views must be decorated with `@api_view` to return data.',
        ],
        why: 'Plain Django does not convert dictionaries to responses (some other frameworks do, which is where the expectation comes from). Django only rejects `None` with a clear message; a dictionary travels on and fails later with a confusing `AttributeError` about a missing response attribute, deep inside the handler. `@api_view` belongs to Django REST Framework, a separate package, and even there the view returns a `Response` object.',
      },
    ],
  ),
  ...b.output(
    'dj-view-request-data',
    3,
    [
      '`request.GET` and `request.POST` are `QueryDict`s: one key can have several values.',
      'A JSON body is not parsed into `request.POST`.',
    ],
    [
      {
        key: 'getlist',
        code: djangoProgram(
          `from django.http import JsonResponse
from django.test import Client
from django.urls import path

def filters(request):
    return JsonResponse({
        "get": request.GET.get("tag"),
        "list": request.GET.getlist("tag"),
    })

urlpatterns = [path("f/", filters)]

print(Client().get("/f/?tag=a&tag=b").json())`,
          urls,
        ),
        output: "{'get': 'b', 'list': ['a', 'b']}",
        why: 'For a repeated key, `QueryDict.get()` returns the last value and `getlist()` returns all of them. Code that expects multiple selections (checkboxes, multi-selects) must use `getlist()`.',
      },
      {
        key: 'json-body',
        code: djangoProgram(
          `import json
from django.http import JsonResponse
from django.test import Client
from django.urls import path

def create(request):
    data = json.loads(request.body)
    return JsonResponse({"post": dict(request.POST), "body": data["name"]})

urlpatterns = [path("create/", create)]

r = Client().post("/create/", {"name": "Ada"}, content_type="application/json")
print(r.json())`,
          urls,
        ),
        output: "{'post': {}, 'body': 'Ada'}",
        why: 'Django fills `request.POST` only for form-encoded and multipart bodies. A JSON body stays in `request.body` and must be parsed (Django REST Framework’s `request.data` does that for you, but that is a separate package).',
      },
      {
        key: 'headers',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

def echo(request):
    return HttpResponse(request.headers["X-Client"] + " " + request.META["HTTP_X_CLIENT"])

urlpatterns = [path("echo/", echo)]

print(Client().get("/echo/", headers={"x-client": "cli"}).content.decode())`,
          urls,
        ),
        output: 'cli cli',
        why: '`request.headers` is case-insensitive, so `"X-Client"` finds `x-client`. In `request.META` the same header appears as `HTTP_X_CLIENT` (upper case, dashes turned into underscores, `HTTP_` prefix), following the WSGI convention.',
      },
    ],
  ),
  ...b.output(
    'dj-view-class-based',
    3,
    [
      '`as_view()` creates a new instance of the class for every request.',
      'Keyword arguments to `as_view()` override class attributes.',
    ],
    [
      {
        key: 'initkwargs',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path
from django.views import View

class Greet(View):
    greeting = "Hello"

    def get(self, request, name):
        return HttpResponse(f"{self.greeting}, {name}")

urlpatterns = [
    path("en/<str:name>/", Greet.as_view()),
    path("es/<str:name>/", Greet.as_view(greeting="Hola")),
]

c = Client()
print(c.get("/en/Ada/").content.decode())
print(c.get("/es/Ada/").content.decode())`,
          urls,
        ),
        output: 'Hello, Ada\nHola, Ada',
        why: '`as_view(greeting="Hola")` stores the keyword argument and sets it on each new instance, so one class serves both routes with different configuration. URL keyword arguments (`name`) are passed to the handler method.',
      },
      {
        key: 'template-view',
        code: djangoProgram(
          `from django.test import Client
from django.urls import path
from django.views.generic import TemplateView

class Home(TemplateView):
    template_name = "home.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["user_count"] = 3
        return context

urlpatterns = [path("", Home.as_view())]

print(Client().get("/").content.decode())`,
          {
            urls: true,
            settings: [templates('{"home.html": "{{ user_count }} users"}')],
          },
        ),
        output: '3 users',
        why: '`TemplateView` renders `template_name` with the context from `get_context_data()`. Calling `super()` first keeps what the base class adds (such as `view`) instead of replacing it.',
      },
      {
        key: 'unknown-initkwarg',
        question: 'What does this program print?',
        code: djangoProgram(
          `from django.views import View

class Report(View):
    format = "pdf"

try:
    Report.as_view(fromat="csv")
except TypeError as e:
    print("TypeError")
print(Report.as_view(format="csv").view_initkwargs)`,
        ),
        output: "TypeError\n{'format': 'csv'}",
        why: '`as_view()` only accepts keyword arguments that are existing class attributes, so the typo `fromat` is caught at URLconf import time with a `TypeError` instead of being silently ignored. The accepted keyword arguments are kept in `view_initkwargs`.',
      },
    ],
  ),
  ...b.output(
    'dj-view-shortcuts',
    4,
    [
      '`get_object_or_404()` raises `Http404`, which Django turns into a 404 response.',
      '`redirect()` accepts a URL, a route name, or a model with `get_absolute_url()`.',
    ],
    [
      {
        key: 'get-or-404',
        code: dbProgram(
          `from django.db import connection, models
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.test import Client
from django.urls import path

class Article(models.Model):
    title = models.CharField(max_length=50)

    class Meta:
        app_label = "news"

with connection.schema_editor() as editor:
    editor.create_model(Article)
Article.objects.create(title="Launch")

def detail(request, pk):
    article = get_object_or_404(Article, pk=pk)
    return HttpResponse(article.title)

urlpatterns = [path("a/<int:pk>/", detail)]

c = Client()
print(c.get("/a/1/").status_code, c.get("/a/99/").status_code)`,
          urls,
        ),
        output: '200 404',
        why: 'For a missing row `get_object_or_404()` raises `Http404` instead of letting `Article.DoesNotExist` escape (which would be a 500 error). The request handler converts `Http404` into a 404 response.',
      },
      {
        key: 'redirect-name',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.shortcuts import redirect
from django.test import Client
from django.urls import path

def dashboard(request, team):
    return HttpResponse(team)

def old_dashboard(request):
    return redirect("dashboard", team="core")

def moved(request):
    return redirect("/new-home/", permanent=True)

urlpatterns = [
    path("teams/<str:team>/", dashboard, name="dashboard"),
    path("old/", old_dashboard),
    path("moved/", moved),
]

c = Client()
r = c.get("/old/")
print(r.status_code, r["Location"])
r = c.get("/moved/")
print(r.status_code, r["Location"])`,
          urls,
        ),
        output: '302 /teams/core/\n301 /new-home/',
        why: '`redirect()` reverses a route name with the given arguments and returns a temporary 302 by default; `permanent=True` gives a 301. A string containing a slash is used as a URL as is.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-view-shared-state',
    5,
    'Class attributes belong to the class, which lives as long as the process; instances are per request.',
    [
      {
        key: 'mutable-class-attribute',
        question:
          'This view keeps a list of visited items. What does the second request return?',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path
from django.views import View

class Visit(View):
    seen = []

    def get(self, request, item):
        self.seen.append(item)
        return HttpResponse(",".join(self.seen))

urlpatterns = [path("v/<str:item>/", Visit.as_view())]

c = Client()
c.get("/v/a/")
print(c.get("/v/b/").content.decode())`,
          urls,
        ),
        correct: 'a,b',
        wrong: ['b', 'a', ''],
        why: 'Each request gets a new instance, but `self.seen.append()` mutates the list stored on the class, which is shared by every request (and every user) the worker process serves. Per-request state belongs in local variables or attributes assigned in the method; per-user state belongs in the session or the database.',
      },
      {
        key: 'instance-attribute',
        question: 'The list is now assigned in `setup()`. What does the second request return?',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path
from django.views import View

class Visit(View):
    def setup(self, request, *args, **kwargs):
        super().setup(request, *args, **kwargs)
        self.seen = []

    def get(self, request, item):
        self.seen.append(item)
        return HttpResponse(",".join(self.seen))

urlpatterns = [path("v/<str:item>/", Visit.as_view())]

c = Client()
c.get("/v/a/")
print(c.get("/v/b/").content.decode())`,
          urls,
        ),
        correct: 'b',
        wrong: ['a,b', 'a', ''],
        why: '`setup()` runs on the fresh instance of every request, before `dispatch()`, so each request starts with its own empty list. Only class-level mutable objects leak between requests.',
      },
    ],
  ),
];
