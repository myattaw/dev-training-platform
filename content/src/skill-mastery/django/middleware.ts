import type { QuestionSource } from '@pracstack/content-model';
import { authApps, b, djangoProgram } from './program';

/*
 * Middleware: request and response processing, ordering (the onion model),
 * short-circuiting, process_view and process_exception, CSRF and common
 * mistakes. Requests go through the real handler with the test Client.
 */

const mw = (...names: string[]) => ({
  urls: true,
  settings: [`MIDDLEWARE=[${names.map((n) => `"${n}"`).join(', ')}]`],
});

export const middlewareFamilies: readonly QuestionSource[] = [
  ...b.outputChoice(
    'dj-mw-basics',
    1,
    'Middleware sees every request before the view and every response after it.',
    [
      {
        key: 'response-header',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

class PoweredBy:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response["X-Powered-By"] = "Django"
        return response

def home(request):
    return HttpResponse("home")

def about(request):
    return HttpResponse("about")

urlpatterns = [path("", home), path("about/", about)]

c = Client()
print(c.get("/")["X-Powered-By"], c.get("/about/")["X-Powered-By"])`,
          mw('__main__.PoweredBy'),
        ),
        correct: 'Django Django',
        wrong: ['Django None', 'KeyError', 'None None'],
        why: 'A middleware listed in `MIDDLEWARE` wraps every view, so both responses get the header without changing either view. That is the point of middleware: behavior that applies to all requests.',
      },
      {
        key: 'request-attribute',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

class Locale:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.lang = request.headers.get("Accept-Language", "en")[:2]
        return self.get_response(request)

def hello(request):
    return HttpResponse({"en": "Hello", "fr": "Bonjour"}.get(request.lang, "Hello"))

urlpatterns = [path("", hello)]

c = Client()
print(c.get("/", headers={"Accept-Language": "fr-FR"}).content.decode(), c.get("/").content.decode())`,
          mw('__main__.Locale'),
        ),
        correct: 'Bonjour Hello',
        wrong: ['Hello Hello', 'Bonjour Bonjour', 'AttributeError'],
        why: 'Middleware can attach data to the request before the view runs, the same way `AuthenticationMiddleware` sets `request.user`. Without the header, the middleware falls back to `"en"`.',
      },
    ],
  ),
  ...b.output(
    'dj-mw-onion',
    2,
    [
      'Middleware listed first runs first on the way in and last on the way out.',
      'Code before `get_response()` handles the request; code after it handles the response.',
    ],
    [
      {
        key: 'two-layers',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

class Outer:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        print("outer: request")
        response = self.get_response(request)
        print("outer: response")
        return response

class Inner:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        print("inner: request")
        response = self.get_response(request)
        print("inner: response")
        return response

def home(request):
    print("view")
    return HttpResponse("ok")

urlpatterns = [path("", home)]

Client().get("/")`,
          mw('__main__.Outer', '__main__.Inner'),
        ),
        output: 'outer: request\ninner: request\nview\ninner: response\nouter: response',
        why: 'Each middleware wraps the next one like the layers of an onion: `MIDDLEWARE` order on the way in, reverse order on the way out. That is why, for example, `SessionMiddleware` must come before `AuthenticationMiddleware`, which reads the session.',
      },
      {
        key: 'header',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

class Tag:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response["X-Tag"] = response.get("X-Tag", "") + self.name
        return response

class A(Tag):
    name = "A"

class B(Tag):
    name = "B"

def home(request):
    return HttpResponse("ok")

urlpatterns = [path("", home)]

print(Client().get("/")["X-Tag"])`,
          mw('__main__.A', '__main__.B'),
        ),
        output: 'BA',
        why: 'Response processing runs in reverse order: `B` (listed last, closest to the view) sets the header first, then `A` appends to it. A middleware that must have the final word on the response belongs at the top of the list.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-mw-short-circuit',
    3,
    'A middleware that returns a response without calling `get_response()` stops the request there.',
    [
      {
        key: 'maintenance',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

steps = []

class Log:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        steps.append(f"log {response.status_code}")
        return response

class Maintenance:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return HttpResponse("down", status=503)

class Audit:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        steps.append("audit")
        return self.get_response(request)

def home(request):
    steps.append("view")
    return HttpResponse("ok")

urlpatterns = [path("", home)]

Client().get("/")
print(steps)`,
          mw('__main__.Log', '__main__.Maintenance', '__main__.Audit'),
        ),
        correct: "['log 503']",
        wrong: ["['audit', 'view', 'log 200']", "['audit', 'log 503']", "['log 503', 'audit', 'view']"],
        why: '`Maintenance` answers without calling `get_response()`, so `Audit` and the view never run. Middleware listed before it (`Log`) still sees the 503 on the way out. Short-circuiting is how caching, maintenance and rate-limiting middleware work.',
      },
      {
        key: 'conditional',
        code: djangoProgram(
          `from django.http import HttpResponse, JsonResponse
from django.test import Client
from django.urls import path

class RequireApiKey:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith("/api/") and request.headers.get("X-Api-Key") != "k1":
            return JsonResponse({"error": "missing key"}, status=401)
        return self.get_response(request)

def ping(request):
    return HttpResponse("pong")

urlpatterns = [path("api/ping/", ping), path("ping/", ping)]

c = Client()
print(c.get("/api/ping/").status_code, c.get("/ping/").status_code,
      c.get("/api/ping/", headers={"X-Api-Key": "k1"}).status_code)`,
          mw('__main__.RequireApiKey'),
        ),
        correct: '401 200 200',
        wrong: ['401 401 200', '200 200 200', '403 200 200'],
        why: 'Middleware runs for every request, so it must check the path itself. Only `/api/` requests without the right key are stopped (401 Unauthorized); the others continue to their views.',
      },
    ],
  ),
  ...b.fails(
    'dj-mw-mistakes',
    2,
    'Check the middleware’s constructor and what `__call__` returns.',
    [
      {
        key: 'no-return',
        question: 'Every request fails after adding this middleware. Why?',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

class Timing:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response["X-Handled"] = "yes"

def home(request):
    return HttpResponse("ok")

urlpatterns = [path("", home)]

Client().get("/")`,
          mw('__main__.Timing'),
        ),
        error: 'AttributeError',
        correct: '`__call__` does not return the response, so the handler receives `None`; add `return response`.',
        wrong: [
          'Headers cannot be set on a response after the view has returned it.',
          'Middleware must subclass `django.utils.deprecation.MiddlewareMixin`.',
          '`get_response` must be called with `self` as an extra argument.',
        ],
        why: 'A middleware’s `__call__` must return a response. Here it returns `None`, and the code that receives it fails with `AttributeError: \'NoneType\' object has no attribute ...`. Setting headers after the view is normal, and `MiddlewareMixin` is only needed for old-style hook-based middleware.',
      },
      {
        key: 'no-get-response',
        question: 'The first request fails while Django loads the middleware. Why?',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

class AddHeader:
    def __call__(self, request, get_response):
        response = get_response(request)
        response["X-Frame"] = "1"
        return response

def home(request):
    return HttpResponse("ok")

urlpatterns = [path("", home)]

Client().get("/")`,
          mw('__main__.AddHeader'),
        ),
        error: 'TypeError',
        correct:
          'Django builds each middleware once with `Middleware(get_response)`; the class needs `__init__(self, get_response)` and `__call__(self, request)`.',
        wrong: [
          'Middleware classes must define a `process_request()` method.',
          'The middleware path must not start with `__main__`.',
          '`__call__` cannot be used on classes listed in settings.',
        ],
        why: 'At startup Django calls `AddHeader(get_response)`; this class takes no constructor argument, so it fails with `TypeError`. The factory pattern is: store `get_response` in `__init__`, and handle each request in `__call__(self, request)`.',
      },
      {
        key: 'auth-before-session',
        question: 'Requests fail with this middleware order. Why?',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

def home(request):
    return HttpResponse(str(request.user.is_authenticated))

urlpatterns = [path("", home)]

Client().get("/")`,
          {
            apps: [...authApps, 'django.contrib.sessions'],
            ...mw(
              'django.contrib.auth.middleware.AuthenticationMiddleware',
              'django.contrib.sessions.middleware.SessionMiddleware',
            ),
          },
        ),
        error: 'ImproperlyConfigured',
        correct:
          '`AuthenticationMiddleware` reads `request.session`, so `SessionMiddleware` must come before it in `MIDDLEWARE`.',
        wrong: [
          'The sessions app needs its own URL patterns.',
          '`request.user` is only available in class-based views.',
          'Authentication middleware cannot be combined with session middleware.',
        ],
        why: 'Order matters: on the way in, `AuthenticationMiddleware` finds no `request.session` because the session middleware has not run yet, and raises `ImproperlyConfigured` saying the session middleware must be installed before it. The `startproject` template lists them in the right order.',
      },
    ],
  ),
  ...b.output(
    'dj-mw-hooks',
    4,
    [
      '`process_view()` runs after URL resolution, just before the view, and knows which view will run.',
      '`process_exception()` runs only when the view raises, and may return a response.',
    ],
    [
      {
        key: 'process-view',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

class ViewLogger:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_view(self, request, view_func, view_args, view_kwargs):
        print("calling", view_func.__name__, view_kwargs)
        return None

def order_detail(request, pk):
    print("view")
    return HttpResponse("ok")

urlpatterns = [path("orders/<int:pk>/", order_detail)]

Client().get("/orders/5/")`,
          mw('__main__.ViewLogger'),
        ),
        output: "calling order_detail {'pk': 5}\nview",
        why: 'After every middleware’s `__call__` has passed the request on and the URL is resolved, Django calls each `process_view()` with the view and its arguments. Returning `None` continues to the view; returning a response would skip it.',
      },
      {
        key: 'process-exception',
        code: djangoProgram(
          `from django.http import JsonResponse
from django.test import Client
from django.urls import path

class PaymentDown(Exception):
    pass

class Errors:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_exception(self, request, exception):
        if isinstance(exception, PaymentDown):
            return JsonResponse({"error": "try later"}, status=503)
        return None

def pay(request):
    raise PaymentDown()

def crash(request):
    raise ValueError("bug")

urlpatterns = [path("pay/", pay), path("crash/", crash)]

c = Client(raise_request_exception=False)
r = c.get("/pay/")
print(r.status_code, r.json())
print(c.get("/crash/").status_code)`,
          mw('__main__.Errors'),
        ),
        output: "503 {'error': 'try later'}\n500",
        why: '`process_exception()` turns the known `PaymentDown` exception into a 503 response. For other exceptions it returns `None`, so Django’s default handling produces a 500. (`raise_request_exception=False` makes the test client return the 500 instead of re-raising the error.)',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-mw-csrf',
    3,
    'CSRF protection checks unsafe methods (POST, PUT, PATCH, DELETE) for a valid token.',
    [
      {
        key: 'enforced',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path
from django.views.decorators.csrf import csrf_exempt

def comment(request):
    return HttpResponse("saved")

@csrf_exempt
def webhook(request):
    return HttpResponse("received")

urlpatterns = [path("comment/", comment), path("webhook/", webhook)]

c = Client(enforce_csrf_checks=True)
print(c.get("/comment/").status_code, c.post("/comment/").status_code, c.post("/webhook/").status_code)`,
          mw('django.middleware.csrf.CsrfViewMiddleware'),
        ),
        correct: '200 403 200',
        wrong: ['200 200 200', '403 403 200', '200 403 403'],
        why: 'GET is a safe method and is not checked. A POST without a CSRF token is rejected with 403. `@csrf_exempt` turns the check off for one view, which is acceptable for a webhook that authenticates callers another way (such as a signature), never for ordinary forms.',
      },
      {
        key: 'test-client-default',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

def comment(request):
    return HttpResponse("saved")

urlpatterns = [path("comment/", comment)]

print(Client().post("/comment/").status_code)`,
          mw('django.middleware.csrf.CsrfViewMiddleware'),
        ),
        correct: '200',
        wrong: ['403', '400', '405'],
        why: 'The test client skips CSRF checks by default, so tests pass even when a template forgot `{% csrf_token %}`. Use `Client(enforce_csrf_checks=True)` when you want to test CSRF behavior itself.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-mw-instance-lifetime',
    5,
    'How many times is a middleware class instantiated?',
    [
      {
        key: 'counter',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

class CurrentUser:
    created = 0

    def __init__(self, get_response):
        self.get_response = get_response
        CurrentUser.created += 1

    def __call__(self, request):
        self.user = request.GET.get("user")
        return self.get_response(request)

def home(request):
    return HttpResponse("ok")

urlpatterns = [path("", home)]

c = Client()
c.get("/?user=ada")
c.get("/?user=bob")
c.get("/")
print(CurrentUser.created)`,
          mw('__main__.CurrentUser'),
        ),
        correct: '1',
        wrong: ['3', '0', '2'],
        why: 'Django instantiates middleware once, when the handler is built, and reuses the instance for every request. Storing per-request data on `self` (like `self.user` here) therefore leaks between requests and, under a threaded server, between concurrent users. Keep request data on the `request` object or in local variables.',
      },
    ],
  ),
  ...b.concept(
    'dj-mw-when-to-use',
    3,
    'Middleware is for behavior every request needs.',
    [
      {
        key: 'choose',
        question: 'Which requirement is the best fit for a custom middleware?',
        correct:
          'Add a request id header to every response and include it in log lines for all views.',
        wrong: [
          'Validate the fields of the checkout form.',
          'Compute the total of one order on the order detail page.',
          'Restrict one admin report to users with a specific permission.',
        ],
        why: 'Middleware is global: it runs for every request, so it suits cross-cutting concerns such as request ids, security headers or timing. Form validation, page-specific calculations and the access rule of a single view belong in forms, views and decorators, where they do not slow down or affect every other request.',
      },
    ],
  ),
];
