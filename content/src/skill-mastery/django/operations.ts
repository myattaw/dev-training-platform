import type { QuestionSource } from '@pracstack/content-model';
import { plain } from '../helpers';
import { b, djangoProgram } from './program';

/*
 * Operations: configuration from the environment, DEBUG and ALLOWED_HOSTS,
 * deployment checks, security settings and headers, logging, static files,
 * WSGI/ASGI and troubleshooting. Deployment checks, host validation, security
 * headers and logging run for real.
 */

const COMMON_MIDDLEWARE = 'MIDDLEWARE=["django.middleware.common.CommonMiddleware"]';

export const operationsFamilies: readonly QuestionSource[] = [
  ...b.outputChoice(
    'dj-ops-allowed-hosts',
    2,
    'Django validates the Host header against `ALLOWED_HOSTS` when it reads the host.',
    [
      {
        key: 'bad-host',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

def home(request):
    return HttpResponse("ok")

urlpatterns = [path("", home)]

c = Client()
print(c.get("/", HTTP_HOST="shop.example.com").status_code,
      c.get("/", HTTP_HOST="www.shop.example.com").status_code,
      c.get("/", HTTP_HOST="evil.example").status_code)`,
          {
            settings: [
              'ROOT_URLCONF=__name__',
              'ALLOWED_HOSTS=["shop.example.com"]',
              COMMON_MIDDLEWARE,
            ],
          },
        ),
        correct: '200 400 400',
        wrong: ['200 200 400', '200 400 403', '200 200 200'],
        why: 'An entry matches that exact host; subdomains need their own entry or a leading dot (`.shop.example.com` matches the domain and all subdomains). Other hosts raise `DisallowedHost`, answered with 400 Bad Request. This protects against Host header attacks such as poisoned password-reset links.',
      },
      {
        key: 'leading-dot',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

def home(request):
    return HttpResponse(request.get_host())

urlpatterns = [path("", home)]

c = Client()
print(c.get("/", HTTP_HOST="shop.example.com").content.decode(),
      c.get("/", HTTP_HOST="api.shop.example.com").status_code,
      c.get("/", HTTP_HOST="shop.example.com.evil.example").status_code)`,
          {
            settings: [
              'ROOT_URLCONF=__name__',
              'ALLOWED_HOSTS=[".shop.example.com"]',
              COMMON_MIDDLEWARE,
            ],
          },
        ),
        correct: 'shop.example.com 200 400',
        wrong: ['shop.example.com 400 400', 'shop.example.com 200 200', '400 200 400'],
        why: 'A leading dot allows the domain and every subdomain. A host that merely starts with the allowed name (`shop.example.com.evil.example`) is a different domain and is rejected.',
      },
    ],
  ),
  ...b.outputChoice('dj-ops-env-config', 3, 'Environment variables are always strings.', [
    {
      key: 'debug-string',
      code: djangoProgram(`import os

os.environ["DJANGO_DEBUG"] = "False"  # set by the deployment

DEBUG = bool(os.environ.get("DJANGO_DEBUG", False))
print(DEBUG)`),
      correct: 'True',
      wrong: ['False', 'None', 'ValueError'],
      why: '`bool("False")` is `True`: any non-empty string is truthy. Production would run with debug pages on. Parse explicitly, for example `os.environ.get("DJANGO_DEBUG", "") == "1"` or `.lower() in {"1", "true", "yes"}`.',
    },
    {
      key: 'hosts-split',
      code: djangoProgram(`import os

os.environ["DJANGO_ALLOWED_HOSTS"] = "shop.example.com, www.shop.example.com"

hosts = os.environ.get("DJANGO_ALLOWED_HOSTS", "").split(",")
print(hosts)`),
      correct: "['shop.example.com', ' www.shop.example.com']",
      wrong: [
        "['shop.example.com', 'www.shop.example.com']",
        "['shop.example.com, www.shop.example.com']",
        "('shop.example.com', 'www.shop.example.com')",
      ],
      why: 'Splitting on `","` keeps the space after the comma, so `" www.shop.example.com"` would never match a Host header and that site would answer 400. Strip each entry: `[h.strip() for h in value.split(",") if h.strip()]`.',
    },
  ]),
  ...b.fails('dj-ops-secret-key', 2, 'Should a missing secret make the app start anyway?', [
    {
      key: 'required-env',
      question:
        'The settings read the secret key like this, and the deployment forgot to set it. What happens, and is it good?',
      code: djangoProgram(`import os

SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]
print("started")`),
      error: 'KeyError',
      correct:
        "Startup fails with `KeyError: 'DJANGO_SECRET_KEY'`. That is good: failing fast beats running with a missing or guessable secret.",
      wrong: [
        'Django generates a random key automatically, so the app starts normally.',
        'The key becomes an empty string, and Django signs sessions without a key.',
        'Startup fails, which is bad: settings should always fall back to a default key committed in the repository.',
      ],
      why: '`SECRET_KEY` signs sessions, password-reset tokens and other signed data. A default committed to the repository is public, so anyone could forge signatures. Reading it with `os.environ[...]` (or from a secrets manager) and failing loudly when it is missing is the safe pattern. Django never invents a key.',
    },
    {
      key: 'empty-key',
      question: 'This program fails when signing a value. Why?',
      code: djangoProgram(
        `from django.core import signing

print(signing.dumps({"cart": 3}))`,
        { settings: ['SECRET_KEY=""'] },
      ),
      error: 'ImproperlyConfigured',
      correct: 'Signing needs a non-empty `SECRET_KEY`; Django refuses to sign with an empty one.',
      wrong: [
        'Dictionaries cannot be signed; only strings.',
        '`signing.dumps()` requires a `salt` argument.',
        'Signing only works inside a request.',
      ],
      why: 'Django raises `ImproperlyConfigured: The SECRET_KEY setting must not be empty.` the first time something needs the key. Values are serialized to JSON before signing, so dictionaries are fine, and `salt` is optional.',
    },
  ]),
  ...b.output(
    'dj-ops-check-deploy',
    3,
    [
      '`manage.py check --deploy` runs the deployment checks; here they are run with `run_checks()`.',
      'Each warning has an id such as `security.W018`.',
    ],
    [
      {
        key: 'warnings',
        question:
          'These settings are about to go to production. The program runs the same security checks as `manage.py check --deploy`. What does it print?',
        code: djangoProgram(
          `from django.core.checks import Tags, run_checks

messages = run_checks(tags=[Tags.security], include_deployment_checks=True)
print(len(messages))
print(any(m.id == "security.W018" for m in messages))
print(any(m.id == "security.W020" for m in messages))`,
          {
            settings: [
              'DEBUG=True',
              'SECRET_KEY="dev"',
              'ALLOWED_HOSTS=["shop.example.com"]',
              `MIDDLEWARE=[
        "django.middleware.security.SecurityMiddleware",
        "django.middleware.csrf.CsrfViewMiddleware",
        "django.middleware.clickjacking.XFrameOptionsMiddleware",
    ]`,
            ],
          },
        ),
        output: '5\nTrue\nFalse',
        why: 'There are five warnings: no `SECURE_HSTS_SECONDS` (W004), no `SECURE_SSL_REDIRECT` (W008), a short `SECRET_KEY` (W009), `CSRF_COOKIE_SECURE` not set (W016) and `DEBUG = True` (W018). `ALLOWED_HOSTS` is set, so W020 is not raised. Run `check --deploy` in the deployment pipeline with the production settings.',
      },
      {
        key: 'hardened',
        question: 'The settings were hardened. What does the deployment check print now?',
        code: djangoProgram(
          `from django.core.checks import Tags, run_checks

messages = run_checks(tags=[Tags.security], include_deployment_checks=True)
print([m.id for m in messages])`,
          {
            settings: [
              'DEBUG=False',
              'SECRET_KEY="k8$Qz!w2@Lp5#Rt7^Yu9&Io1*Pa3(Sd6)Fg4_Hj0+Zx8-Cv2=Bn5"',
              'ALLOWED_HOSTS=["shop.example.com"]',
              'SECURE_HSTS_SECONDS=31536000',
              'SECURE_HSTS_INCLUDE_SUBDOMAINS=True',
              'SECURE_HSTS_PRELOAD=True',
              'SECURE_SSL_REDIRECT=True',
              'CSRF_COOKIE_SECURE=True',
              `MIDDLEWARE=[
        "django.middleware.security.SecurityMiddleware",
        "django.middleware.csrf.CsrfViewMiddleware",
        "django.middleware.clickjacking.XFrameOptionsMiddleware",
    ]`,
            ],
          },
        ),
        output: '[]',
        why: 'Every earlier warning has been addressed: HSTS is set (with subdomains and preload), HTTP redirects to HTTPS, the CSRF cookie is HTTPS-only, debug is off and the key is long and random. In a real project the key would come from the environment, never from the code.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-ops-security-headers',
    4,
    'Some headers are added to every response; HSTS only to HTTPS responses.',
    [
      {
        key: 'defaults',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

def home(request):
    return HttpResponse("ok")

urlpatterns = [path("", home)]

c = Client()
r = c.get("/")
print(r["X-Content-Type-Options"], r["X-Frame-Options"], r.get("Strict-Transport-Security"), end=" ")
r = c.get("/", secure=True)
print(r["Strict-Transport-Security"])`,
          {
            urls: true,
            settings: [
              'SECURE_HSTS_SECONDS=3600',
              `MIDDLEWARE=[
        "django.middleware.security.SecurityMiddleware",
        "django.middleware.clickjacking.XFrameOptionsMiddleware",
    ]`,
            ],
          },
        ),
        correct: 'nosniff DENY None max-age=3600',
        wrong: [
          'nosniff DENY max-age=3600 max-age=3600',
          'None SAMEORIGIN None max-age=3600',
          'nosniff DENY None None',
        ],
        why: '`SecurityMiddleware` sends `X-Content-Type-Options: nosniff` by default, and `XFrameOptionsMiddleware` sends `DENY` (Django’s default since 3.0) against clickjacking. HSTS is only sent over HTTPS (`secure=True`), because browsers ignore it on plain HTTP.',
      },
      {
        key: 'ssl-redirect',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

def home(request):
    return HttpResponse("ok")

urlpatterns = [path("account/", home)]

c = Client()
r = c.get("/account/")
print(r.status_code, r["Location"], c.get("/account/", secure=True).status_code)`,
          {
            urls: true,
            settings: [
              'SECURE_SSL_REDIRECT=True',
              'MIDDLEWARE=["django.middleware.security.SecurityMiddleware"]',
            ],
          },
        ),
        correct: '301 https://testserver/account/ 200',
        wrong: ['302 https://testserver/account/ 200', '200 None 200', '301 /account/ 301'],
        why: 'With `SECURE_SSL_REDIRECT`, plain HTTP requests get a permanent redirect to the same URL over HTTPS. Behind a proxy that terminates TLS, also set `SECURE_PROXY_SSL_HEADER`, otherwise every request looks like HTTP and redirects forever.',
      },
    ],
  ),
  ...b.output(
    'dj-ops-logging',
    3,
    [
      'A logger only emits records at or above its level.',
      'Messages propagate to parent loggers (here the root logger) unless `propagate` is `False`.',
    ],
    [
      {
        key: 'levels',
        code: djangoProgram(
          `import logging

log = logging.getLogger("shop.orders")
log.debug("cart loaded")
log.info("order 7 placed")
log.warning("payment slow")
logging.getLogger("other").info("ignored")`,
          {
            settings: [
              `LOGGING={
        "version": 1,
        "formatters": {"short": {"format": "{levelname} {name}: {message}", "style": "{"}},
        "handlers": {"out": {"class": "logging.StreamHandler", "stream": "ext://sys.stdout", "formatter": "short"}},
        "loggers": {"shop": {"handlers": ["out"], "level": "INFO"}},
    }`,
            ],
          },
        ),
        output: 'INFO shop.orders: order 7 placed\nWARNING shop.orders: payment slow',
        why: 'Django applies `LOGGING` with `dictConfig` during setup. `shop.orders` has no handler of its own, so its records propagate to `shop`, whose level `INFO` drops the debug message. The `other` logger is not configured, so it inherits the root logger’s default level, `WARNING`, and its info message is dropped.',
      },
      {
        key: 'duplicates',
        question:
          'Both the root logger and `payments` have the same handler. What does this program print?',
        code: djangoProgram(
          `import logging

log = logging.getLogger("payments")
log.info("charged 20 EUR")
log.debug("card checked")`,
          {
            settings: [
              `LOGGING={
        "version": 1,
        "formatters": {"short": {"format": "{name} {levelname}: {message}", "style": "{"}},
        "handlers": {"out": {"class": "logging.StreamHandler", "stream": "ext://sys.stdout", "formatter": "short"}},
        "root": {"handlers": ["out"], "level": "WARNING"},
        "loggers": {"payments": {"handlers": ["out"], "level": "INFO"}},
    }`,
            ],
          },
        ),
        output: 'payments INFO: charged 20 EUR\npayments INFO: charged 20 EUR',
        why: 'The record is handled by `payments`’ own handler and then propagates to the root logger’s handlers. The root logger’s `WARNING` level does not filter it: a logger’s level is only checked where the record is created. Hence the duplicate line; set `"propagate": False` on `payments` or attach the handler in one place only. The debug message is below `INFO` and dropped.',
      },
    ],
  ),
  ...b.concept(
    'dj-ops-debug',
    1,
    'Think about what a visitor would see when something goes wrong.',
    [
      {
        key: 'debug-in-production',
        question: 'Why must `DEBUG` be `False` in production?',
        correct:
          'With `DEBUG = True`, error pages show tracebacks, local variables and settings to any visitor, and Django keeps every SQL query in memory.',
        wrong: [
          'Debug mode disables the database connection pool, so the site is slower but otherwise safe.',
          'Debug mode only affects the admin site.',
          'It does not matter as long as `ALLOWED_HOSTS` is set.',
        ],
        why: 'The technical 500 page exposes code, paths and configuration (Django masks settings with names like `SECRET` or `PASSWORD`, but not everything sensitive). Query logging in debug mode also grows memory. `ALLOWED_HOSTS` is a separate protection.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-ops-error-pages',
    1,
    'Compare what the error page reveals with and without debug mode.',
    [
      {
        key: 'debug-true',
        question:
          'A view raises an exception while `DEBUG = True`. What does the visitor’s response contain?',
        code: djangoProgram(
          `import logging
from django.test import Client
from django.urls import path

logging.disable()  # keep the program's output to the print below

def checkout(request):
    raise ValueError("card 4242 declined")

urlpatterns = [path("", checkout)]

r = Client(raise_request_exception=False).get("/")
body = r.content.decode()
print(r.status_code, "Traceback" in body, "card 4242" in body, "tok-123" in body)`,
          {
            urls: true,
            settings: [
              'DEBUG=True',
              'SECRET_KEY="practice-only-not-secret"',
              'API_TOKEN="tok-123"',
            ],
          },
        ),
        correct: '500 True True False',
        wrong: ['500 False False False', '500 True True True', '200 True True False'],
        why: 'In debug mode the 500 page is the technical error page: full traceback, local variables, the exception message and the settings. Django masks settings whose names look sensitive (`API_TOKEN` contains `TOKEN`), but everything else is visible to whoever triggered the error. That is why `DEBUG` must be `False` in production.',
      },
      {
        key: 'debug-false',
        question: 'The same view with `DEBUG = False`. What does the response contain?',
        code: djangoProgram(
          `import logging
from django.test import Client
from django.urls import path

logging.disable()  # keep the program's output to the print below

def checkout(request):
    raise ValueError("card 4242 declined")

urlpatterns = [path("", checkout)]

r = Client(raise_request_exception=False).get("/")
body = r.content.decode()
print(r.status_code, "Traceback" in body, "card 4242" in body, "Server Error (500)" in body)`,
          { urls: true, settings: ['DEBUG=False'] },
        ),
        correct: '500 False False True',
        wrong: ['500 True True True', '200 False False True', '500 True False True'],
        why: 'Without debug mode, visitors get a generic "Server Error (500)" page (or your `500.html` template), and the details go to logging (the `django.request` logger) and, if configured, to `ADMINS` by email. Make sure those logs reach a place you watch.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-ops-proxy-https',
    5,
    'Behind a TLS-terminating proxy, Django sees plain HTTP unless it is told which header to trust.',
    [
      {
        key: 'redirect-loop',
        question:
          'A load balancer terminates HTTPS and forwards requests over HTTP with `X-Forwarded-Proto: https`. What does Django answer to this forwarded request?',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

def home(request):
    return HttpResponse("ok")

urlpatterns = [path("", home)]

r = Client().get("/", headers={"X-Forwarded-Proto": "https"})
print(r.status_code, r.get("Location"))`,
          {
            urls: true,
            settings: [
              'SECURE_SSL_REDIRECT=True',
              'MIDDLEWARE=["django.middleware.security.SecurityMiddleware"]',
            ],
          },
        ),
        correct: '301 https://testserver/',
        wrong: ['200 None', '400 None', '302 https://testserver/'],
        why: 'Django does not trust `X-Forwarded-Proto` by default, so the request looks like plain HTTP and is redirected to HTTPS; the browser follows to the load balancer, which forwards over HTTP again: an endless redirect loop. Setting `SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")` fixes it.',
      },
      {
        key: 'spoofed',
        question:
          '`SECURE_PROXY_SSL_HEADER` is set, but this request reaches Django directly over plain HTTP, sent by an attacker. What does it print?',
        code: djangoProgram(
          `from django.http import HttpResponse
from django.test import Client
from django.urls import path

def home(request):
    return HttpResponse(f"secure={request.is_secure()}")

urlpatterns = [path("", home)]

r = Client().get("/", headers={"X-Forwarded-Proto": "https"})
print(r.status_code, r.content.decode())`,
          {
            urls: true,
            settings: [
              'SECURE_SSL_REDIRECT=True',
              'SECURE_PROXY_SSL_HEADER=("HTTP_X_FORWARDED_PROTO", "https")',
              'MIDDLEWARE=["django.middleware.security.SecurityMiddleware"]',
            ],
          },
        ),
        correct: '200 secure=True',
        wrong: ['301 secure=False', '200 secure=False', '400 secure=True'],
        why: 'With the setting, Django believes the header, whoever sent it: the plain HTTP request is treated as secure (no redirect, secure cookies sent over HTTP). Only set `SECURE_PROXY_SSL_HEADER` when the proxy always overwrites that header and clients cannot reach Django without going through the proxy.',
      },
    ],
  ),
  ...b.fails(
    'dj-ops-static-manifest',
    4,
    'Hashed static file names come from a manifest written by `collectstatic`.',
    [
      {
        key: 'missing-manifest',
        question:
          'Production uses `ManifestStaticFilesStorage`. Rendering any page with a `{% static %}` link fails after a deployment. What was skipped?',
        code: djangoProgram(
          `from django.templatetags.static import static

print(static("css/site.css"))`,
          {
            apps: ['django.contrib.staticfiles'],
            settings: [
              'DEBUG=False',
              'STATIC_URL="static/"',
              'STATIC_ROOT="/tmp/static"',
              'STORAGES={"staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.ManifestStaticFilesStorage"}}',
            ],
          },
        ),
        error: 'ValueError',
        correct:
          '`python manage.py collectstatic` did not run, so there is no `staticfiles.json` manifest to map `css/site.css` to its hashed name.',
        wrong: [
          'The `static` template tag only works with `DEBUG = True`.',
          '`STATIC_URL` must be an absolute URL starting with `https://`.',
          'Static files must be listed in `INSTALLED_APPS`.',
        ],
        why: "The storage looks the file up in the manifest that `collectstatic` writes and raises `ValueError: Missing staticfiles manifest entry for 'css/site.css'`. Hashed names (`site.3f2a1c.css`) let browsers cache files forever, but `collectstatic` must be part of every deployment. With `DEBUG = True` the unhashed name is used, which is why this only shows up in production.",
      },
    ],
  ),
  ...b.concept(
    'dj-ops-static-files',
    2,
    'Django’s development server serves static files; production needs a plan.',
    [
      {
        key: 'collectstatic',
        question:
          'After deploying with `DEBUG = False`, CSS and JavaScript return 404. What is the usual fix?',
        correct:
          'Set `STATIC_ROOT`, run `python manage.py collectstatic` during deployment, and serve that directory with the web server, a CDN, or a package such as WhiteNoise.',
        wrong: [
          'Set `DEBUG = True` so Django serves the files.',
          'Move the files into the templates directory.',
          'Add each file’s URL to `urlpatterns`.',
        ],
        why: '`runserver` serves static files only in debug mode, as a development convenience. `collectstatic` gathers files from every app into `STATIC_ROOT` (optionally with hashed names for caching), where a dedicated server serves them efficiently. Turning debug on in production is never the fix.',
      },
    ],
  ),
  ...b.concept(
    'dj-ops-wsgi-asgi',
    3,
    'Which interface does the application server speak, and what does it need?',
    [
      {
        key: 'runserver',
        question: 'Which setup is appropriate for serving a Django site in production?',
        snippet: plain(`gunicorn shop.wsgi:application --workers 4 --bind 0.0.0.0:8000`),
        correct:
          'A production WSGI server such as Gunicorn (or uWSGI) running `shop.wsgi:application`, usually behind a reverse proxy or load balancer.',
        wrong: [
          '`python manage.py runserver 0.0.0.0:80`, which is optimized for production.',
          'Importing `settings.py` from a cron job every minute.',
          'Running `manage.py migrate` in a loop to keep the process alive.',
        ],
        why: '`runserver` is a development server and the documentation says not to use it in production. `wsgi.py` (created by `startproject`) exposes the `application` callable that WSGI servers load.',
      },
      {
        key: 'asgi',
        question: 'When do you deploy Django through `asgi.py` instead of `wsgi.py`?',
        correct:
          'When you need asynchronous features such as async views handling many concurrent slow connections, WebSockets (with Channels) or long-lived streaming responses, served by an ASGI server like Uvicorn or Daphne.',
        wrong: [
          'Always: WSGI support was removed in Django 5.',
          'Only when using PostgreSQL.',
          'When the site needs HTTPS.',
        ],
        why: 'Django supports both interfaces. WSGI is simple and fine for typical request/response apps; ASGI enables async concurrency. Both remain supported in Django 5.2, and neither choice depends on the database or on HTTPS.',
      },
    ],
  ),
  ...b.concept('dj-ops-troubleshooting', 4, 'Match the symptom with the setting that checks it.', [
    {
      key: 'csrf-behind-proxy',
      question:
        'After moving behind an HTTPS load balancer, every form POST fails with "CSRF verification failed. Origin checking failed - https://shop.example.com does not match any trusted origins." What fixes it?',
      snippet: plain(`Forbidden (403)
CSRF verification failed. Request aborted.
Reason given for failure:
    Origin checking failed - https://shop.example.com does not match any trusted origins.`),
      correct:
        'Make Django aware of HTTPS behind the proxy (`SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")`, with the proxy setting that header) or add the origin to `CSRF_TRUSTED_ORIGINS`.',
      wrong: [
        'Add `@csrf_exempt` to every view that handles a form.',
        'Remove `CsrfViewMiddleware` from `MIDDLEWARE`.',
        'Set `CSRF_COOKIE_SECURE = False`.',
      ],
      why: 'The proxy talks plain HTTP to Django, so Django believes the request is `http://` and the browser’s `https://` origin does not match. Telling Django how to detect HTTPS (only when the proxy sets that header reliably) or trusting the origin explicitly solves it. Disabling CSRF protection removes a security control.',
    },
    {
      key: 'bad-request-400',
      question:
        'A newly deployed site answers every request with "Bad Request (400)" and the logs show `Invalid HTTP_HOST header`. What is wrong?',
      correct: 'The domain in the Host header is not in `ALLOWED_HOSTS`.',
      wrong: [
        'The database migrations have not been applied.',
        'Static files have not been collected.',
        '`SECRET_KEY` is too short.',
      ],
      why: 'With `DEBUG = False`, requests whose Host is not listed in `ALLOWED_HOSTS` raise `DisallowedHost`, answered with 400. Missing migrations show up as database errors (500), missing static files as 404s for assets, and a short key as a deployment-check warning.',
    },
  ]),
];
