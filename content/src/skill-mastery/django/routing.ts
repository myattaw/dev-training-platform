import type { QuestionSource } from '@pracstack/content-model';
import { b, djangoProgram } from './program';

/*
 * URL routing: path() patterns and converters, named routes, include() and
 * namespaces, reverse() and resolve(), pattern order and trailing slashes.
 * reverse() and resolve() run for real against the script's urlpatterns.
 */

const urls = { urls: true } as const;

export const routingFamilies: readonly QuestionSource[] = [
  ...b.output(
    'dj-url-converters',
    1,
    [
      'A converter decides both what the segment may contain and the Python type the view receives.',
      '`str` stops at a slash; `path` does not.',
    ],
    [
      {
        key: 'int',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.urls import path, resolve

def item(request, pk):
    return HttpResponse()

urlpatterns = [path("items/<int:pk>/", item)]

match = resolve("/items/42/")
print(match.kwargs)
print(type(match.kwargs["pk"]).__name__)`,
          urls,
        ),
        output: "{'pk': 42}\nint",
        why: 'The `int` converter matches digits and converts them, so the view receives the integer `42`, not the string `"42"`. Without a converter (`<pk>`) the default is `str`.',
      },
      {
        key: 'slug',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.urls import path, resolve

def post(request, slug):
    return HttpResponse()

urlpatterns = [path("blog/<slug:slug>/", post)]

print(resolve("/blog/hello-world_2/").kwargs)`,
          urls,
        ),
        output: "{'slug': 'hello-world_2'}",
        why: 'The `slug` converter matches ASCII letters, digits, hyphens and underscores, and passes the value on as a string.',
      },
      {
        key: 'path',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.urls import path, resolve

def show(request, name):
    return HttpResponse()

urlpatterns = [
    path("str/<str:name>", show),
    path("path/<path:name>", show),
]

print(resolve("/path/docs/guide.txt").kwargs)
print(resolve("/str/guide.txt").kwargs)`,
          urls,
        ),
        output: "{'name': 'docs/guide.txt'}\n{'name': 'guide.txt'}",
        why: '`path` matches any non-empty string including slashes, so it captures the whole `docs/guide.txt`. `str` matches any non-empty string without a slash; `/str/docs/guide.txt` would not match at all.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-url-reverse',
    2,
    'reverse() builds the URL from the route name and the arguments the pattern needs.',
    [
      {
        key: 'args',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.urls import path, reverse

def article(request, year, slug):
    return HttpResponse()

urlpatterns = [path("news/<int:year>/<slug:slug>/", article, name="article")]

print(reverse("article", args=[2025, "launch"]))`,
          urls,
        ),
        correct: '/news/2025/launch/',
        wrong: ['news/2025/launch/', '/article/2025/launch/', '/news/?year=2025&slug=launch'],
        why: '`reverse()` finds the pattern named `article` and fills its converters in order, returning an absolute path with the leading slash. The route name is not part of the URL, and arguments are never turned into a query string.',
      },
      {
        key: 'kwargs',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.urls import path, reverse

def profile(request, username):
    return HttpResponse()

urlpatterns = [path("u/<str:username>/", profile, name="profile")]

print(reverse("profile", kwargs={"username": "ada"}))`,
          urls,
        ),
        correct: '/u/ada/',
        wrong: ['/profile/ada/', '/u/<str:username>/', '/u/?username=ada'],
        why: 'With `kwargs`, values are matched to the converter names. Hard-coding `"/u/ada/"` in templates and views would break when the pattern changes; reversing by name keeps links correct.',
      },
      {
        key: 'query',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.urls import path, reverse

def search(request):
    return HttpResponse()

urlpatterns = [path("search/", search, name="search")]

print(reverse("search", query={"q": "django", "page": 2}))`,
          urls,
        ),
        correct: '/search/?q=django&page=2',
        wrong: ['/search/', '/search/django/2/', '/search/?page=2&q=django'],
        why: 'Since Django 5.2, `reverse()` accepts `query` (and `fragment`) and encodes them after the path, in the order given. Before 5.2 you had to append `"?" + urlencode(...)` yourself.',
      },
    ],
  ),
  ...b.fails(
    'dj-url-no-reverse-match',
    2,
    'NoReverseMatch means no named pattern accepts the name and arguments you passed.',
    [
      {
        key: 'missing-arg',
        question: 'This program raises an error. What is wrong?',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.urls import path, reverse

def detail(request, pk):
    return HttpResponse()

urlpatterns = [path("orders/<int:pk>/", detail, name="order-detail")]

print(reverse("order-detail"))`,
          urls,
        ),
        error: 'NoReverseMatch',
        correct: 'The pattern needs a `pk` argument; call `reverse("order-detail", args=[pk])`.',
        wrong: [
          'Route names cannot contain hyphens.',
          '`reverse()` only works inside a view.',
          'The pattern must be defined with `re_path()` to be reversible.',
        ],
        why: '`reverse()` must fill every converter of the pattern. Without `pk` no pattern matches, so it raises `NoReverseMatch` and lists the patterns it tried. Hyphens are fine in names, and `reverse()` works anywhere once the URLconf can be imported.',
      },
      {
        key: 'wrong-type',
        question: 'This program raises an error. What is wrong?',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.urls import path, reverse

def detail(request, pk):
    return HttpResponse()

urlpatterns = [path("orders/<int:pk>/", detail, name="order-detail")]

print(reverse("order-detail", args=["latest"]))`,
          urls,
        ),
        error: 'NoReverseMatch',
        correct: '`"latest"` does not match the `int` converter, so no URL can be built.',
        wrong: [
          '`args` must be a tuple, not a list.',
          '`reverse()` converts `"latest"` to an integer and fails with `ValueError`.',
          'The name must be prefixed with the app label.',
        ],
        why: 'Reversing checks each value against the converter’s pattern (`[0-9]+` for `int`). `"latest"` fails, so `NoReverseMatch` is raised rather than producing a URL the resolver could never match. Lists and tuples are both accepted for `args`.',
      },
      {
        key: 'namespace',
        question: 'This program raises an error. What is wrong?',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.urls import include, path, reverse

def index(request):
    return HttpResponse()

shop_patterns = ([path("", index, name="index")], "shop")
urlpatterns = [path("shop/", include(shop_patterns))]

print(reverse("index"))`,
          urls,
        ),
        error: 'NoReverseMatch',
        correct:
          'The included patterns are in the `shop` namespace, so the name must be `"shop:index"`.',
        wrong: [
          'Included patterns cannot be named.',
          'An empty route `""` cannot be reversed.',
          '`include()` needs a module path string, not a tuple.',
        ],
        why: 'Passing `(patterns, "shop")` to `include()` sets the application namespace `shop`. Names inside a namespace are only reachable as `namespace:name`; plain `"index"` finds nothing. Namespaces let two apps both use a name like `index` without clashing.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-url-order',
    3,
    'The resolver tries patterns from top to bottom and stops at the first match.',
    [
      {
        key: 'catch-all-first',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.urls import path, resolve

def detail(request, slug):
    return HttpResponse()

def create(request):
    return HttpResponse()

urlpatterns = [
    path("posts/<slug:slug>/", detail),
    path("posts/new/", create),
]

print(resolve("/posts/new/").func.__name__)`,
          urls,
        ),
        correct: 'detail',
        wrong: ['create', 'NoReverseMatch', 'Both views are called'],
        why: '`new` is a valid slug, so the first pattern matches and `create` is never reached: this is the classic "my page shows the detail view" bug. Put fixed routes such as `posts/new/` before patterns with converters that could also match them.',
      },
      {
        key: 'int-falls-through',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.urls import path, resolve

def by_id(request, pk):
    return HttpResponse()

def by_name(request, name):
    return HttpResponse()

urlpatterns = [
    path("users/<int:pk>/", by_id),
    path("users/<str:name>/", by_name),
]

print(resolve("/users/ada/").func.__name__, resolve("/users/7/").func.__name__)`,
          urls,
        ),
        correct: 'by_name by_id',
        wrong: ['by_id by_id', 'by_name by_name', 'by_id by_name'],
        why: '`ada` does not match the `int` converter, so the resolver moves on to the `str` pattern. `7` matches the first pattern. A converter that rejects a segment is not an error; it just makes that pattern not match.',
      },
    ],
  ),
  ...b.output(
    'dj-url-include',
    3,
    [
      'An included URLconf’s routes are appended to the prefix of the `path()` that includes it.',
      '`resolve()` returns a `ResolverMatch` with the view, its arguments, the name and the namespace.',
    ],
    [
      {
        key: 'resolver-match',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.urls import include, path, resolve

def detail(request, pk):
    return HttpResponse()

blog_patterns = ([path("<int:pk>/", detail, name="detail")], "blog")
urlpatterns = [path("blog/", include(blog_patterns))]

match = resolve("/blog/3/")
print(match.view_name)
print(match.route)
print(match.kwargs)`,
          urls,
        ),
        output: "blog:detail\nblog/<int:pk>/\n{'pk': 3}",
        why: '`view_name` combines the namespace and the route name. `route` is the full matched pattern, prefix included. The included pattern only matches the remainder of the path after `blog/`.',
      },
      {
        key: 'reuse-namespace',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.urls import include, path, reverse

def index(request):
    return HttpResponse()

shop = ([path("", index, name="index")], "shop")
blog = ([path("", index, name="index")], "blog")
urlpatterns = [
    path("store/", include(shop)),
    path("news/", include(blog)),
]

print(reverse("shop:index"))
print(reverse("blog:index"))`,
          urls,
        ),
        output: '/store/\n/news/',
        why: 'Both apps use the name `index`; the namespaces keep them apart. Reversing returns the prefix under which each app was included, so an app’s URLs move with the `include()` without code changes.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-url-trailing-slash',
    4,
    'APPEND_SLASH is implemented by a middleware, and only applies when the URL without the slash does not match.',
    [
      {
        key: 'redirect',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

def about(request):
    return HttpResponse("about")

urlpatterns = [path("about/", about)]

r = Client().get("/about")
print(r.status_code, r["Location"])`,
          { urls: true, settings: ['MIDDLEWARE=["django.middleware.common.CommonMiddleware"]'] },
        ),
        correct: '301 /about/',
        wrong: ['200 /about', '404 /about/', '302 /about/'],
        why: 'No pattern matches `/about`, but `/about/` does, so `CommonMiddleware` (with the default `APPEND_SLASH = True`) answers with a permanent 301 redirect to the URL with the slash.',
      },
      {
        key: 'no-middleware',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

def about(request):
    return HttpResponse("about")

urlpatterns = [path("about/", about)]

print(Client().get("/about").status_code)`,
          { urls: true, settings: ['MIDDLEWARE=[]'] },
        ),
        correct: '404',
        wrong: ['301', '200', '405'],
        why: '`APPEND_SLASH` defaults to `True`, but the setting is only acted on by `django.middleware.common.CommonMiddleware`. Without that middleware, `/about` simply matches nothing and returns 404.',
      },
      {
        key: 'post-loses-body',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

def contact(request):
    return HttpResponse(request.method)

urlpatterns = [path("contact/", contact)]

r = Client().post("/contact", {"message": "hi"})
print(r.status_code, r["Location"])`,
          { urls: true, settings: ['MIDDLEWARE=["django.middleware.common.CommonMiddleware"]'] },
        ),
        correct: '301 /contact/',
        wrong: ['200 /contact/', '405 /contact/', '307 /contact/'],
        why: 'The middleware redirects POST requests too, and browsers follow a 301 with a GET, so the form data is lost. With `DEBUG = True` Django raises a `RuntimeError` for this case instead, to make the mistake visible; the fix is to post to the URL with the trailing slash.',
      },
    ],
  ),
  ...b.codeChoice(
    'dj-url-re-path-strings',
    5,
    'Regular-expression groups capture text; nothing converts it.',
    [
      {
        key: 'year-compare',
        question:
          'An archive view compares the year with an integer. Requests to `/archive/2024/` always show "old". What is the cause?',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import re_path

def archive(request, year):
    return HttpResponse("current" if year == 2024 else "old")

urlpatterns = [re_path(r"^archive/(?P<year>[0-9]{4})/$", archive)]

print(Client().get("/archive/2024/").content.decode())`,
          urls,
        ),
        correct:
          '`re_path()` passes captured groups as strings, so `year` is `"2024"`; use `path("archive/<int:year>/", ...)` or convert with `int(year)`.',
        wrong: [
          'The regular expression needs `\\d` instead of `[0-9]` to capture numbers.',
          'Named groups are passed as positional arguments, so `year` is the request path.',
          '`re_path()` patterns must not start with `^`.',
        ],
        why: 'Regex captures are always `str`, and `"2024" == 2024` is `False` in Python. `path()` converters such as `int` convert the value; with `re_path()` you convert yourself. Named groups are passed as keyword arguments, and `^` is allowed (and usual) in `re_path()` patterns.',
      },
      {
        key: 'custom-converter',
        question:
          'A custom converter is registered for four-digit years. What does `reverse("archive", args=[7])` return?',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.urls import path, register_converter, reverse

class FourDigitYear:
    regex = "[0-9]{4}"

    def to_python(self, value):
        return int(value)

    def to_url(self, value):
        return f"{value:04d}"

register_converter(FourDigitYear, "yyyy")

def archive(request, year):
    return HttpResponse()

urlpatterns = [path("archive/<yyyy:year>/", archive, name="archive")]

print(reverse("archive", args=[7]))`,
          urls,
        ),
        correct: '`/archive/0007/`: `to_url()` formats the value, and the result matches the regex.',
        wrong: [
          '`/archive/7/`: `reverse()` uses `str(value)` and ignores `to_url()`.',
          'It raises `NoReverseMatch` because `7` is not four digits.',
          '`/archive/<yyyy:7>/`',
        ],
        why: 'When reversing, Django calls the converter’s `to_url()` and then checks the result against `regex`. `f"{7:04d}"` is `"0007"`, which matches. `to_python()` is used in the other direction, when resolving an incoming URL.',
      },
    ],
  ),
];
