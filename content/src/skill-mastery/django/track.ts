import type { TrackSource } from '@pracstack/content-model';
import { authFamilies } from './auth';
import { apiViewFamilies, serializerFamilies } from './drf';
import { formsFamilies } from './forms';
import { fundamentalsFamilies } from './fundamentals';
import { middlewareFamilies } from './middleware';
import { migrationsFamilies } from './migrations';
import { modelsFamilies } from './models';
import { operationsFamilies } from './operations';
import { ormFamilies } from './orm';
import { performanceFamilies } from './performance';
import { testingFamilies } from './testing';
import { routingFamilies } from './routing';
import { templatesFamilies } from './templates';
import { viewsFamilies } from './views';

/**
 * Django: Django 5.2 LTS and Django REST Framework 3.16. Every Python program is
 * run by the real Python runner (Python 3.14, in-memory SQLite); see program.ts
 * for the shared setup lines each program starts with.
 */
export const djangoTrack: TrackSource = {
  id: 'django',
  name: 'Django',
  category: 'frameworks',
  description:
    'Build web applications and APIs with Django 5.2 LTS and Django REST Framework 3.16, the separately installed package for REST APIs: routing, views, templates, models, the ORM, forms, authentication, middleware, testing, performance and operations.',
  topics: [
    {
      id: 'dj-fundamentals-topic',
      name: 'Django fundamentals',
      description: 'How a Django project is put together and how a request flows through it.',
      skills: [
        {
          id: 'dj-fundamentals',
          name: 'Projects, apps and settings',
          description:
            'Projects versus applications, settings and their defaults, app configuration, project structure and the request lifecycle.',
          objectives: [
            'Explain the difference between a project and an application.',
            'Predict setting values from defaults and overrides.',
            'Fix startup errors caused by missing settings or a skipped `django.setup()`.',
            'Trace a request through middleware, URL resolution and the view.',
          ],
          questions: fundamentalsFamilies,
        },
      ],
    },
    {
      id: 'dj-web-topic',
      name: 'Routing, views and templates',
      description: 'Map URLs to views, handle requests and render HTML safely.',
      skills: [
        {
          id: 'dj-url-routing',
          prerequisites: ['dj-fundamentals'],
          name: 'URL routing',
          description:
            '`path()` patterns and converters, named routes, `include()` and namespaces, `reverse()` and `resolve()`, pattern order and trailing slashes.',
          objectives: [
            'Predict which view a URL resolves to and with which arguments.',
            'Build URLs with `reverse()` instead of hard-coding them.',
            'Fix `NoReverseMatch` errors and pattern-order bugs.',
            'Explain how `APPEND_SLASH` and `CommonMiddleware` handle missing slashes.',
          ],
          questions: routingFamilies,
        },
        {
          id: 'dj-views',
          prerequisites: ['dj-url-routing'],
          name: 'Views',
          description:
            'Function-based and class-based views, request and response objects, `JsonResponse`, HTTP method handling and shortcuts.',
          objectives: [
            'Write function-based and class-based views that return the right status codes.',
            'Read query strings, form data, JSON bodies and headers from a request.',
            'Restrict views to the HTTP methods they support.',
            'Avoid state that leaks between requests in class-based views.',
          ],
          questions: viewsFamilies,
        },
        {
          id: 'dj-templates',
          prerequisites: ['dj-views'],
          name: 'Templates',
          description:
            'Variables and lookups, filters, loops and conditions, template inheritance, auto-escaping and template errors.',
          objectives: [
            'Predict how variables, filters, loops and conditions render.',
            'Structure pages with `{% extends %}`, blocks and `{{ block.super }}`.',
            'Keep auto-escaping effective and choose safe ways to output HTML and JSON.',
            'Fix template syntax errors.',
          ],
          questions: templatesFamilies,
        },
      ],
    },
    {
      id: 'dj-data-topic',
      name: 'Models, ORM and migrations',
      description: 'Model data, query it with the ORM and evolve the schema safely.',
      skills: [
        {
          id: 'dj-models',
          prerequisites: ['dj-fundamentals'],
          name: 'Models',
          description:
            'Field types and options, primary keys, relationships and `on_delete`, constraints, choices, model methods and `__str__`.',
          objectives: [
            'Choose field options such as `null`, `blank`, `default` and `choices` correctly.',
            'Model one-to-many, many-to-many and one-to-one relationships with the right `on_delete`.',
            'Enforce data rules with unique and check constraints.',
            'Fix `IntegrityError`s caused by missing values and violated constraints.',
          ],
          questions: modelsFamilies,
        },
        {
          id: 'dj-orm',
          prerequisites: ['dj-models'],
          name: 'ORM queries',
          description:
            'QuerySets, `filter()`/`exclude()`/`get()`, field lookups, `Q` and `F` objects, ordering, `values()`, aggregation, annotation and related lookups.',
          objectives: [
            'Predict the rows a QuerySet returns from its filters and lookups.',
            'Combine conditions with `Q` and update columns in the database with `F`.',
            'Compute totals and per-group values with `aggregate()` and `annotate()`.',
            'Handle `DoesNotExist` and `MultipleObjectsReturned` correctly.',
          ],
          questions: ormFamilies,
        },
        {
          id: 'dj-migrations',
          prerequisites: ['dj-models'],
          name: 'Migrations',
          description:
            '`makemigrations` and `migrate`, migration operations, data migrations with `RunPython`, historical models, reversibility and troubleshooting.',
          objectives: [
            'Explain what `makemigrations` and `migrate` each do.',
            'Write reversible data migrations that use historical models.',
            'Read generated migrations, including dependencies and one-off defaults.',
            'Resolve unapplied, conflicting and edited migrations.',
          ],
          questions: migrationsFamilies,
        },
      ],
    },
    {
      id: 'dj-request-handling-topic',
      name: 'Forms, authentication and middleware',
      description: 'Validate input, identify users, control access and process every request.',
      skills: [
        {
          id: 'dj-forms',
          prerequisites: ['dj-views', 'dj-models'],
          name: 'Forms and validation',
          description:
            '`Form` and `ModelForm`, field cleaning, `clean_<field>()` and `clean()`, error messages, bound and unbound forms and safe field lists.',
          objectives: [
            'Predict `is_valid()`, `cleaned_data` and `errors` for submitted data.',
            'Write field and cross-field validation with `clean_<field>()` and `clean()`.',
            'Use `ModelForm` with `save(commit=False)` and explicit `fields`.',
            'Fix forms that lose values or crash on invalid input.',
          ],
          questions: formsFamilies,
        },
        {
          id: 'dj-auth',
          prerequisites: ['dj-views', 'dj-models'],
          name: 'Authentication and authorization',
          description:
            'The `User` model, password hashing, `authenticate()`, permissions and groups, sessions, `login_required` and object-level access control.',
          objectives: [
            'Create users and change passwords so they are hashed correctly.',
            'Predict `authenticate()` and `has_perm()` results for users, groups and superusers.',
            'Protect views with `login_required` and permission checks.',
            'Prevent users from reaching other users’ objects.',
          ],
          questions: authFamilies,
        },
        {
          id: 'dj-middleware',
          prerequisites: ['dj-views'],
          name: 'Middleware',
          description:
            'Request and response processing, ordering, short-circuiting, `process_view()` and `process_exception()`, CSRF and common middleware mistakes.',
          objectives: [
            'Predict the order in which middleware handles requests and responses.',
            'Write middleware that short-circuits or decorates responses.',
            'Order built-in middleware correctly and explain CSRF checks.',
            'Avoid per-request state on middleware instances.',
          ],
          questions: middlewareFamilies,
        },
      ],
    },
    {
      id: 'dj-drf-topic',
      name: 'Django REST Framework',
      description:
        'Build JSON APIs with Django REST Framework, the separately installed package that adds serializers, API views, routers and permissions.',
      skills: [
        {
          id: 'dj-drf-serializers',
          prerequisites: ['dj-models', 'dj-forms'],
          name: 'DRF serializers',
          description:
            'Serializer and ModelSerializer validation, `read_only` and `write_only` fields, `validate_<field>()` and `validate()`, nested serializers, partial updates and saving.',
          objectives: [
            'Predict `is_valid()`, `validated_data`, `errors` and `.data` for a serializer.',
            'Hide and protect fields with `read_only` and `write_only`.',
            'Write field-level and object-level validation.',
            'Handle nested representations and know when custom `create()` is needed.',
          ],
          questions: serializerFamilies,
        },
        {
          id: 'dj-drf-views',
          prerequisites: ['dj-drf-serializers', 'dj-views'],
          name: 'DRF views, routers and permissions',
          description:
            '`@api_view` and `APIView`, generic views, viewsets and routers, pagination, permission classes and status codes.',
          objectives: [
            'Build endpoints with `@api_view`, `APIView`, generic views and viewsets.',
            'Predict the URL names and routes a router generates.',
            'Configure pagination and read its response envelope.',
            'Choose permission classes and scope querysets so users only reach their own data.',
          ],
          questions: apiViewFamilies,
        },
      ],
    },
    {
      id: 'dj-production-topic',
      name: 'Testing, performance and operations',
      description: 'Prove the application works, keep it fast, and run it safely in production.',
      skills: [
        {
          id: 'dj-testing',
          prerequisites: ['dj-views', 'dj-models'],
          name: 'Testing',
          description:
            '`TestCase` and its per-test transactions, the test client, API tests, test data, `RequestFactory`, query-count assertions and `on_commit` callbacks.',
          objectives: [
            'Write view and API tests with the test client and `APITestCase`.',
            'Predict how test isolation and `setUpTestData()` affect data between tests.',
            'Choose between `SimpleTestCase`, `TestCase` and `RequestFactory`.',
            'Catch N+1 regressions with `assertNumQueries`.',
          ],
          questions: testingFamilies,
        },
        {
          id: 'dj-performance',
          prerequisites: ['dj-orm'],
          name: 'Database performance',
          description:
            'Lazy QuerySets and caching, N+1 queries, `select_related` and `prefetch_related`, `only()` and `values()`, `exists()` and `count()`, bulk operations and transactions.',
          objectives: [
            'Count the queries a piece of ORM code runs.',
            'Fix N+1 problems with `select_related` and `prefetch_related`.',
            'Use bulk operations knowing what they skip.',
            'Use `transaction.atomic()` and savepoints correctly.',
          ],
          questions: performanceFamilies,
        },
        {
          id: 'dj-operations',
          prerequisites: ['dj-fundamentals', 'dj-middleware'],
          name: 'Configuration, security and deployment',
          description:
            'Configuration from the environment, `DEBUG` and `ALLOWED_HOSTS`, deployment checks, security settings and headers, logging, static files, WSGI/ASGI and troubleshooting.',
          objectives: [
            'Read configuration and secrets from the environment safely.',
            'Fix the warnings reported by `check --deploy`.',
            'Configure logging without lost or duplicated messages.',
            'Diagnose common production failures: 400s, CSRF errors and missing static files.',
          ],
          questions: operationsFamilies,
        },
      ],
    },
  ],
};
