import type { QuestionSource } from '@pracstack/content-model';
import { plain } from '../helpers';
import { authApps, b, djangoProgram } from './program';

/*
 * Django fundamentals: projects and applications, settings, app configuration,
 * the request lifecycle and project structure. Every program runs in the real
 * Python runner with Django 5.2.
 */

export const fundamentalsFamilies: readonly QuestionSource[] = [
  ...b.outputChoice(
    'dj-fund-settings-defaults',
    1,
    'Settings you do not set keep the value from Django’s global defaults.',
    [
      {
        key: 'debug',
        code: djangoProgram(`print(settings.DEBUG, settings.APPEND_SLASH)`),
        correct: 'False True',
        wrong: ['True True', 'False False', 'None None'],
        why: '`settings.configure()` with no arguments starts from `django.conf.global_settings`. `DEBUG` defaults to `False` (debug mode must be switched on deliberately) and `APPEND_SLASH` defaults to `True`. Unset settings are never `None`: every documented setting has a default.',
      },
      {
        key: 'override-one',
        code: djangoProgram(`print(settings.DEBUG, settings.LANGUAGE_CODE)`, {
          settings: ['DEBUG=True'],
        }),
        correct: 'True en-us',
        wrong: ['True None', 'False en-us', 'True en'],
        why: 'Only the settings passed to `configure()` (or defined in the settings module) change; everything else still comes from the global defaults, so `LANGUAGE_CODE` is the default `en-us`.',
      },
      {
        key: 'use-tz',
        code: djangoProgram(`print(settings.USE_TZ, settings.TIME_ZONE)`),
        correct: 'True America/Chicago',
        wrong: ['False America/Chicago', 'True UTC', 'False UTC'],
        why: 'Since Django 5.0 `USE_TZ` defaults to `True`, so datetimes are stored as aware UTC values. The global default `TIME_ZONE` is still `America/Chicago`; the `settings.py` that `startproject` generates sets it to `UTC`, which is why many people assume `UTC` is the built-in default.',
      },
    ],
  ),
  ...b.concept(
    'dj-fund-project-vs-app',
    1,
    'One is the whole site’s configuration; the other is a reusable package of features.',
    [
      {
        key: 'definition',
        question: 'What is the difference between a Django project and a Django application?',
        correct:
          'A project is the configuration of a whole site (settings, root URLconf, WSGI/ASGI entry points); an application is a Python package that provides one set of features and is activated by listing it in `INSTALLED_APPS`.',
        wrong: [
          'A project is a package with models; an application is the server that runs it.',
          'They are the same thing: `startproject` and `startapp` only differ in the folder name.',
          'An application can only be used by the project that created it.',
        ],
        why: 'A project ties applications together with settings and the root URLconf. Applications (for example `django.contrib.auth` or your own `orders` app) hold models, views, templates and migrations and can be reused across projects. They are not interchangeable folders, and a well-designed app is not bound to one project.',
      },
      {
        key: 'activate',
        question:
          'You ran `python manage.py startapp orders` and wrote models in `orders/models.py`, but `makemigrations` says "No changes detected". What is the most likely cause?',
        correct: 'The app is not listed in `INSTALLED_APPS`, so Django does not load its models.',
        wrong: [
          'Models are only detected after the development server has been restarted.',
          'The app must also be added to `urlpatterns` before its models are registered.',
          '`makemigrations` only looks at apps whose name starts with the project name.',
        ],
        why: 'Django builds its app registry from `INSTALLED_APPS`; models in a package that is not listed are never imported, so the autodetector sees nothing. URLs have nothing to do with model registration, and no server restart is involved in running a management command.',
      },
    ],
  ),
  ...b.fails(
    'dj-fund-setup-order',
    2,
    'Read the error name: it says which step of startup was skipped or done in the wrong order.',
    [
      {
        key: 'settings-not-configured',
        question: 'This script fails. Why?',
        code: `from django.conf import settings

print(settings.DEBUG)`,
        error: 'ImproperlyConfigured',
        correct:
          'No settings were configured: Django needs `DJANGO_SETTINGS_MODULE` or a call to `settings.configure()` before a setting is read.',
        wrong: [
          '`DEBUG` has no default value, so reading it raises an error.',
          '`settings` must be imported from `django.conf.global_settings`.',
          'Settings can only be read inside a view.',
        ],
        why: '`django.conf.settings` is a lazy object. The first attribute access looks for `DJANGO_SETTINGS_MODULE` (set by `manage.py`, `wsgi.py` and `asgi.py`) or for an earlier `settings.configure()` call; with neither it raises `ImproperlyConfigured: Requested setting DEBUG, but settings are not configured`. `DEBUG` does have a default, and `global_settings` only holds the defaults.',
      },
      {
        key: 'model-before-setup',
        question: 'This script fails while defining the model. Why?',
        code: `from django.conf import settings

settings.configure()

from django.db import models

class Tag(models.Model):
    name = models.CharField(max_length=20)

    class Meta:
        app_label = "blog"`,
        error: 'AppRegistryNotReady',
        correct:
          '`django.setup()` was never called, so the app registry is not loaded when the model class is created.',
        wrong: [
          'The `blog` app is not in `INSTALLED_APPS`.',
          'Models need a database configured before the class can be defined.',
          '`CharField` requires `null=True` outside a project.',
        ],
        why: 'Creating a model class registers it with the app registry, which must be populated first by `django.setup()` (done for you by `manage.py` and the WSGI/ASGI handlers). The error is `AppRegistryNotReady: Apps aren\'t loaded yet.` An explicit `app_label` is enough even when the app is not installed, and no database is touched when a class is defined.',
      },
      {
        key: 'lowercase-setting',
        question: 'This script fails at `configure()`. Why?',
        code: `import django
from django.conf import settings

settings.configure(debug=True)
django.setup()`,
        error: 'TypeError',
        correct: 'Setting names must be uppercase; `configure()` rejects `debug`.',
        wrong: [
          '`DEBUG` cannot be set through `configure()`; only the settings module can set it.',
          '`configure()` must be called after `django.setup()`.',
          '`DEBUG` expects the string `"True"`.',
        ],
        why: 'Django only treats uppercase names as settings. `configure()` raises `TypeError: Setting \'debug\' must be uppercase.`; in a settings module a lowercase name would be silently ignored instead, which is a classic source of "my setting has no effect". `configure()` must come before `django.setup()`, not after.',
      },
    ],
  ),
  ...b.concept(
    'dj-fund-project-structure',
    2,
    'Think about which file each command or server reads first.',
    [
      {
        key: 'root-urlconf',
        question:
          'In a project created with `django-admin startproject shop`, which setting tells Django where the root URL patterns are?',
        snippet: plain(`shop/
    manage.py
    shop/
        __init__.py
        settings.py
        urls.py
        asgi.py
        wsgi.py`),
        correct: '`ROOT_URLCONF = "shop.urls"` in `shop/settings.py`',
        wrong: [
          'Django always imports a file named `urls.py` next to `manage.py`.',
          '`manage.py` passes the URL module to the server on the command line.',
          '`INSTALLED_APPS` lists the URL modules to load.',
        ],
        why: '`startproject` writes `ROOT_URLCONF = "shop.urls"` into the settings; the resolver imports that module and reads its `urlpatterns`. App URLconfs are only used when the root URLconf `include()`s them. `INSTALLED_APPS` activates apps, not URLs.',
      },
      {
        key: 'settings-module',
        question:
          'How do `manage.py`, `wsgi.py` and `asgi.py` know which settings to use?',
        correct:
          'Each sets the `DJANGO_SETTINGS_MODULE` environment variable (with `os.environ.setdefault`) to a dotted module path such as `shop.settings`.',
        wrong: [
          'They read `settings.json` from the current directory.',
          'Django searches every package for a file named `settings.py` and uses the first one.',
          'The settings module is fixed at install time by `pip`.',
        ],
        why: 'The generated files call `os.environ.setdefault("DJANGO_SETTINGS_MODULE", "shop.settings")`. Because it is `setdefault`, an environment variable set by the deployment wins, which is how one code base runs with different settings modules in development and production.',
      },
    ],
  ),
  ...b.output(
    'dj-fund-app-ready',
    3,
    [
      'An `AppConfig` (normally in the app’s `apps.py`) configures one application.',
      '`ready()` runs once, when `django.setup()` has loaded every app.',
    ],
    [
      {
        key: 'ready-hook',
        question:
          'This script plays the role of a `blog` app: its `AppConfig` would normally live in `blog/apps.py`. What does it print?',
        code: `import django
from django.apps import AppConfig
from django.conf import settings

class BlogConfig(AppConfig):
    name = "__main__"  # normally the package name, "blog"
    label = "blog"
    verbose_name = "Company blog"

    def ready(self):
        print("blog ready")

settings.configure(INSTALLED_APPS=["django.contrib.contenttypes", "__main__.BlogConfig"])
print("before setup")
django.setup()
print("after setup")

from django.apps import apps
print(apps.get_app_config("blog").verbose_name)
`,
        output: 'before setup\nblog ready\nafter setup\nCompany blog',
        why: '`django.setup()` imports every app in `INSTALLED_APPS`, then their models, then calls each config’s `ready()`. That is the place for startup code such as connecting signal handlers; code at import time of `models.py` runs too early for anything that needs other apps.',
      },
      {
        key: 'default-auto-field',
        question: 'The app config chooses the primary key type for its models. What does this program print?',
        code: `import django
from django.apps import AppConfig
from django.conf import settings

class ShopConfig(AppConfig):
    name = "__main__"  # normally the package name, "shop"
    label = "shop"
    default_auto_field = "django.db.models.BigAutoField"

settings.configure(INSTALLED_APPS=["__main__.ShopConfig"])
django.setup()

from django.db import models

class Product(models.Model):
    name = models.CharField(max_length=20)

print(type(Product._meta.pk).__name__)
print(settings.DEFAULT_AUTO_FIELD)
`,
        output: 'BigAutoField\ndjango.db.models.AutoField',
        why: 'The global default `DEFAULT_AUTO_FIELD` is still `AutoField` (32-bit), but an app config’s `default_auto_field` wins for that app’s models. Projects from `startproject` set `DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"`, and `startapp` writes the same value into `apps.py`.',
      },
    ],
  ),
  ...b.output(
    'dj-fund-app-config',
    3,
    [
      'The app registry (`django.apps.apps`) knows every installed app by its label.',
      'The label is the last part of the dotted name unless the AppConfig sets another.',
    ],
    [
      {
        key: 'label-and-name',
        code: djangoProgram(
          `from django.apps import apps

config = apps.get_app_config("auth")
print(config.name)
print(config.verbose_name)`,
          { apps: authApps },
        ),
        output: 'django.contrib.auth\nAuthentication and Authorization',
        why: 'An app is looked up by its label (`auth`), while `name` is the full dotted path listed in `INSTALLED_APPS`. `AuthConfig` sets a human-readable `verbose_name`, used for example by the admin.',
      },
      {
        key: 'is-installed',
        code: djangoProgram(
          `from django.apps import apps

print(apps.is_installed("django.contrib.auth"))
print(apps.is_installed("auth"))
print([c.label for c in apps.get_app_configs()])`,
          { apps: authApps },
        ),
        output: "True\nFalse\n['contenttypes', 'auth']",
        why: '`is_installed()` takes the full app name, not the label, so `"auth"` is `False`. `get_app_configs()` returns the configs in `INSTALLED_APPS` order, which matters for template and static file lookup and for which app wins when two provide the same file.',
      },
      {
        key: 'get-model',
        code: djangoProgram(
          `from django.apps import apps

User = apps.get_model("auth", "User")
print(User._meta.label)
print(User._meta.db_table)`,
          { apps: authApps },
        ),
        output: 'auth.User\nauth_user',
        why: '`apps.get_model(app_label, model_name)` looks a model up through the registry (this is how migrations and swappable models refer to models). The default table name is `<app_label>_<model name in lowercase>`, so `auth_user`.',
      },
    ],
  ),
  ...b.output(
    'dj-fund-request-lifecycle',
    4,
    ['Middleware wraps the whole URL resolution and view call.', 'Code after get_response() runs on the way back out.'],
    [
      {
        key: 'converter-order',
        question:
          'A path converter, a middleware and a view each print a line. What does this program print?',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path, register_converter

class Upper:
    regex = "[a-z]+"

    def to_python(self, value):
        print("resolve")
        return value.upper()

    def to_url(self, value):
        return value.lower()

register_converter(Upper, "upper")

class Trace:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        print("middleware")
        return self.get_response(request)

def hello(request, name):
    print("view " + name)
    return HttpResponse("ok")

urlpatterns = [path("hi/<upper:name>/", hello)]

Client().get("/hi/ada/")`,
          { urls: true, settings: ['MIDDLEWARE=["__main__.Trace"]'] },
        ),
        output: 'middleware\nresolve\nview ADA',
        why: 'The handler runs the middleware chain first; only the innermost step resolves the URL (calling the converter’s `to_python`) and then calls the view with the converted value, `"ADA"`. So URL resolution never happens before request middleware, which is why middleware cannot rely on `request.resolver_match` before calling `get_response`.',
      },
      {
        key: 'status-after-view',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

class Stamp:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response["X-Seen"] = "yes"
        print("after view", response.status_code)
        return response

def missing(request):
    print("view")
    return HttpResponse("gone", status=410)

urlpatterns = [path("old/", missing)]

c = Client()
print(c.get("/old/")["X-Seen"])
c.get("/nowhere/")`,
          { urls: true, settings: ['MIDDLEWARE=["__main__.Stamp"]'] },
        ),
        output: 'view\nafter view 410\nyes\nafter view 404',
        why: 'Code after `get_response()` runs once the view has returned, so it sees the view’s status (410). For `/nowhere/` no pattern matches: Django converts the `Resolver404` into a 404 response inside the chain, and the middleware still sees that response on the way out. Middleware therefore runs for unknown URLs too.',
      },
      {
        key: 'signals',
        question:
          'Request signals, a middleware and the view each print a line. What does this program print?',
        code: djangoProgram(
          `from django.core.signals import request_finished, request_started
from django.http import HttpResponse
from django.test import Client
from django.urls import path

def on_started(sender, **kwargs):
    print("request_started")

def on_finished(sender, **kwargs):
    print("request_finished")

request_started.connect(on_started)
request_finished.connect(on_finished)

class Trace:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        print("middleware in")
        response = self.get_response(request)
        print("middleware out")
        return response

def home(request):
    print("view")
    return HttpResponse("ok")

urlpatterns = [path("", home)]

Client().get("/")`,
          { urls: true, settings: ['MIDDLEWARE=["__main__.Trace"]'] },
        ),
        output: 'request_started\nmiddleware in\nview\nmiddleware out\nrequest_finished',
        why: '`request_started` fires when the handler receives the request, before any middleware. `request_finished` fires when the response is closed, after the whole middleware chain has returned; Django uses it, for example, to close database connections that exceeded `CONN_MAX_AGE`.',
      },
    ],
  ),
  ...b.multi(
    'dj-fund-lifecycle-facts',
    3,
    'Follow one request from the web server to the response.',
    [
      {
        key: 'steps',
        question: 'Which statements about how Django handles a request are correct?',
        correct: [
          'The WSGI or ASGI handler builds an `HttpRequest` and passes it through the middleware listed in `MIDDLEWARE`.',
          'The URL resolver matches `request.path_info` against `urlpatterns` from `ROOT_URLCONF` in order and calls the first matching view.',
          'A view must return an `HttpResponse` (or a subclass); the response then passes back through the middleware in reverse order.',
        ],
        wrong: [
          'Django starts a new Python process for every request.',
          'Templates are rendered by the middleware after the view returns its context dictionary.',
          'All matching URL patterns are called, and their responses are merged.',
        ],
        why: 'One long-running worker process handles many requests: the handler creates the request object, middleware wraps the resolver and the view, and the first matching pattern wins. Views render templates themselves (for example with `render()`); a plain dictionary is not a valid return value.',
      },
    ],
  ),
  ...b.output(
    'dj-fund-override-settings',
    2,
    ['`override_settings` changes a setting only inside its block (or decorated test).'],
    [
      {
        key: 'context-manager',
        code: djangoProgram(`from django.test import override_settings

with override_settings(DEBUG=True):
    print(settings.DEBUG)
print(settings.DEBUG)`),
        output: 'True\nFalse',
        why: '`override_settings` temporarily replaces the setting and restores it when the block ends. It is meant for tests; production code should never change settings at run time, because other threads and cached values would not see a consistent configuration.',
      },
      {
        key: 'new-setting',
        code: djangoProgram(`from django.test import override_settings

with override_settings(FEATURE_FLAGS={"beta": True}):
    print(settings.FEATURE_FLAGS["beta"])
print(hasattr(settings, "FEATURE_FLAGS"))`),
        output: 'True\nFalse',
        why: 'Projects may define their own uppercase settings, and `override_settings` can add one temporarily. After the block the attribute is gone again, so `hasattr` is `False`. Reading a custom setting that may be missing should use `getattr(settings, "NAME", default)`.',
      },
    ],
  ),
  ...b.concept(
    'dj-fund-settings-per-environment',
    5,
    'One code base, several environments: what changes, and where should it come from?',
    [
      {
        key: 'split',
        question:
          'A team keeps one `settings.py` with `DEBUG = True` and a hard-coded `SECRET_KEY`, and edits it on the server before each deployment. What is the best improvement?',
        correct:
          'Keep shared settings in code and read environment-specific values (`DEBUG`, `SECRET_KEY`, `ALLOWED_HOSTS`, database credentials) from environment variables or a secrets store, or select a per-environment settings module with `DJANGO_SETTINGS_MODULE`.',
        wrong: [
          'Commit one settings file per server, including the secret keys, so every change is reviewed.',
          'Leave `DEBUG = True` everywhere so errors are easier to diagnose in production.',
          'Move all settings into the database so they can be changed from the admin.',
        ],
        why: 'Editing files on servers is error-prone and puts secrets in the wrong place. Configuration that differs per environment belongs in the environment (the twelve-factor approach) or in separate settings modules chosen with `DJANGO_SETTINGS_MODULE`; secrets must never be committed. `DEBUG = True` in production leaks code and settings in error pages, and settings are read at startup, so a database is the wrong home for them.',
      },
      {
        key: 'import-directly',
        question:
          'Why should code use `from django.conf import settings` instead of `from shop import settings`?',
        correct:
          '`django.conf.settings` combines the defaults with the module selected by `DJANGO_SETTINGS_MODULE` (and test overrides); importing the module directly ignores the defaults, the selected environment and `override_settings`.',
        wrong: [
          'Importing the settings module directly is slower because it is executed on every access.',
          'There is no difference; both give the same object.',
          '`from shop import settings` is a syntax error in Python 3.',
        ],
        why: 'A direct import binds the code to one specific file: it misses defaults for unset values, breaks when production uses `shop.settings_prod`, and does not see `override_settings` in tests. Modules are imported once and cached, so speed is not the issue.',
      },
    ],
  ),
  ...b.output(
    'dj-fund-settings-captured',
    4,
    [
      'A value copied from `settings` keeps the value it had when it was copied.',
      '`override_settings` changes what `settings.X` returns, not copies made earlier.',
    ],
    [
      {
        key: 'module-constant',
        code: djangoProgram(
          `from django.test import override_settings

PAGE_SIZE = settings.PAGE_SIZE  # read once, at import time

def page_size_constant():
    return PAGE_SIZE

def page_size_live():
    return settings.PAGE_SIZE

with override_settings(PAGE_SIZE=50):
    print(page_size_constant(), page_size_live())`,
          { settings: ['PAGE_SIZE=20'] },
        ),
        output: '20 50',
        why: 'The module-level constant copied the setting when the module was imported, so overriding the setting later (in a test, for example) does not affect it. Reading `settings.PAGE_SIZE` when the value is needed sees the override. Tests that "override a setting with no effect" are usually hitting a copy like this.',
      },
      {
        key: 'cached-function',
        code: djangoProgram(
          `from functools import cache
from django.test import override_settings

@cache
def feature_enabled():
    return settings.FEATURES.get("beta", False)

print(feature_enabled())
with override_settings(FEATURES={"beta": True}):
    print(feature_enabled())
    feature_enabled.cache_clear()
    print(feature_enabled())`,
          { settings: ['FEATURES={}'] },
        ),
        output: 'False\nFalse\nTrue',
        why: 'The cached function computed its answer once, so the override is invisible until the cache is cleared. Django’s own caches have the same issue, which is why it clears some of them when the `setting_changed` signal fires; your own caches need the same care (connect a `setting_changed` receiver or avoid caching setting values).',
      },
    ],
  ),
];
