import type { QuestionSource } from '@pracstack/content-model';
import { plain } from '../helpers';
import { b, dbProgram, djangoProgram } from './program';

/*
 * Migrations: makemigrations and migrate, operations, data migrations with
 * RunPython, historical models, reversibility and troubleshooting. Programs
 * run `makemigrations --dry-run` against the script's own app, and apply real
 * Migration objects with the same apply()/unapply() calls `migrate` uses.
 */

/** Applies the script's `Migration` to the in-memory database, as `migrate` would. */
const APPLY = `with connection.schema_editor() as editor:
    state = Migration("0001_initial", "cms").apply(ProjectState(), editor)`;

const MIGRATION_IMPORTS = `from django.db import connection, migrations, models
from django.db.migrations.state import ProjectState`;

export const migrationsFamilies: readonly QuestionSource[] = [
  ...b.concept('dj-mig-workflow', 1, 'One command writes files, the other changes the database.', [
    {
      key: 'two-commands',
      question: 'You added a field to a model. Which sequence updates the database schema?',
      correct:
        'Run `python manage.py makemigrations` to write a migration file from the model change, commit it, then run `python manage.py migrate` to apply it.',
      wrong: [
        'Run `python manage.py migrate`; it detects model changes and alters the tables directly.',
        'Run `python manage.py makemigrations`; it writes the file and applies it.',
        'Restart the server; Django synchronizes tables with models at startup.',
      ],
      why: '`makemigrations` compares the models with the state recorded in existing migrations and writes new migration files; it does not touch the database. `migrate` applies unapplied migrations and records them in the `django_migrations` table. Nothing happens at server startup.',
    },
    {
      key: 'commit-migrations',
      question: 'Should migration files be committed to version control?',
      correct:
        'Yes. They are part of the code: every environment must apply the same migrations in the same order.',
      wrong: [
        'No. Each developer and server should run `makemigrations` to generate its own.',
        'Only the initial migration; later ones are regenerated on deployment.',
        'No. They contain database passwords.',
      ],
      why: 'Generating migrations separately per environment produces different files, names and data migrations, and the histories diverge. Migration files contain schema operations, never credentials.',
    },
  ]),
  ...b.output(
    'dj-mig-makemigrations',
    2,
    [
      '`--dry-run` shows what `makemigrations` would write without creating files.',
      'An app without migrations gets an initial migration that creates its models.',
    ],
    [
      {
        key: 'initial',
        question:
          'The script is installed as the app `shop` and runs `makemigrations --dry-run`. What does it print?',
        code: djangoProgram(
          `from django.core.management import call_command
from django.db import models

class Author(models.Model):
    name = models.CharField(max_length=50)

    class Meta:
        app_label = "shop"

class Book(models.Model):
    author = models.ForeignKey(Author, on_delete=models.CASCADE)

    class Meta:
        app_label = "shop"

call_command("makemigrations", "shop", "--dry-run")`,
          { app: 'shop', db: true },
        ),
        output:
          "Migrations for 'shop':\n  migrations/0001_initial.py\n    + Create model Author\n    + Create model Book",
        why: 'The first migration of an app is `0001_initial`, with one `CreateModel` per model. `Author` comes first because `Book` has a foreign key to it: the autodetector orders operations by dependency. `--dry-run` only reports; no file is written.',
      },
      {
        key: 'named',
        question:
          'The script is installed as the app `blog` and runs `makemigrations` with a name. What does it print?',
        code: djangoProgram(
          `from django.core.management import call_command
from django.db import models

class Post(models.Model):
    title = models.CharField(max_length=100)

    class Meta:
        app_label = "blog"

call_command("makemigrations", "blog", "--dry-run", "--name", "create_post")`,
          { app: 'blog', db: true },
        ),
        output: "Migrations for 'blog':\n  migrations/0001_create_post.py\n    + Create model Post",
        why: '`--name` replaces the automatic suffix but keeps the number, which orders migrations within an app. Descriptive names make the history easier to read than `0007_auto_...`.',
      },
    ],
  ),
  ...b.outputChoice('dj-mig-operations', 2, 'Each operation describes one schema or data change.', [
    {
      key: 'describe',
      code: djangoProgram(`from django.db import migrations, models

ops = [
    migrations.AddField("product", "sku", models.CharField(max_length=20, default="")),
    migrations.RenameField("product", "title", "name"),
    migrations.DeleteModel("Coupon"),
]
print(" | ".join(op.describe() for op in ops))`),
      correct:
        'Add field sku to product | Rename field title on product to name | Delete model Coupon',
      wrong: [
        'AddField | RenameField | DeleteModel',
        'Add field sku to product | Remove field title from product | Delete model Coupon',
        'Alter table product | Alter table product | Drop table coupon',
      ],
      why: '`describe()` is the text `makemigrations` and `migrate --plan` print. A rename is its own operation (`RenameField`), which keeps the data; if the autodetector instead produced a remove and an add, the column’s data would be lost, so always read generated migrations.',
    },
    {
      key: 'reversible',
      code: djangoProgram(`from django.db import migrations, models

def forwards(apps, schema_editor):
    pass

index = models.Index(fields=["name"], name="product_name_idx")
print(
    migrations.RunPython(forwards).reversible,
    migrations.RunPython(forwards, migrations.RunPython.noop).reversible,
    migrations.AddIndex("product", index).reversible,
)`),
      correct: 'False True True',
      wrong: ['True True True', 'False False True', 'False True False'],
      why: '`RunPython` is only reversible with a `reverse_code`; `RunPython.noop` declares that undoing needs no work. Schema operations such as `AddIndex` know their own inverse.',
    },
  ]),
  ...b.output(
    'dj-mig-run-migration',
    3,
    [
      'Operations run in order; `RunPython` sees the state built by the operations before it.',
      'A field added with a default fills existing rows.',
    ],
    [
      {
        key: 'data-migration',
        question: 'The script applies a migration the way `migrate` does. What does it print?',
        code: dbProgram(`${MIGRATION_IMPORTS}

def add_pages(apps, schema_editor):
    Page = apps.get_model("cms", "Page")
    Page.objects.create(title="Home")
    Page.objects.create(title="About")

class Migration(migrations.Migration):
    operations = [
        migrations.CreateModel("Page", [
            ("id", models.AutoField(primary_key=True)),
            ("title", models.CharField(max_length=50)),
        ]),
        migrations.RunPython(add_pages, migrations.RunPython.noop),
        migrations.AddField("page", "views", models.IntegerField(default=0)),
    ]

${APPLY}

with connection.cursor() as cursor:
    cursor.execute("SELECT title, views FROM cms_page ORDER BY id")
    print(cursor.fetchall())`),
        output: "[('Home', 0), ('About', 0)]",
        why: 'The table is created, the data migration inserts two rows through the historical `Page` model, and `AddField` then adds `views`, filling existing rows with the default 0. Inside `RunPython`, `views` does not exist yet: the historical model matches the state at that point in the migration.',
      },
      {
        key: 'unapply',
        question: 'The migration is applied and then reversed. What does this program print?',
        code: dbProgram(`${MIGRATION_IMPORTS}

class Migration(migrations.Migration):
    operations = [
        migrations.CreateModel("Page", [
            ("id", models.AutoField(primary_key=True)),
            ("title", models.CharField(max_length=50)),
        ]),
        migrations.AddField("page", "slug", models.SlugField(default="")),
    ]

${APPLY}
print(sorted(c.name for c in connection.introspection.get_table_description(connection.cursor(), "cms_page")))

with connection.schema_editor() as editor:
    Migration("0001_initial", "cms").unapply(state, editor)
print(connection.introspection.table_names())`),
        output: "['id', 'slug', 'title']\n[]",
        why: 'Unapplying runs the inverse of each operation in reverse order: the field is removed, then the model’s table is dropped. This is what `migrate cms zero` (or migrating back to an earlier migration) does.',
      },
    ],
  ),
  ...b.fails(
    'dj-mig-irreversible',
    3,
    'Rolling back needs an inverse for every operation in the migration.',
    [
      {
        key: 'runpython-no-reverse',
        question: 'Reversing this data migration fails. What is the fix?',
        code: dbProgram(`${MIGRATION_IMPORTS}

def normalize_emails(apps, schema_editor):
    pass  # lowercase every email

class Migration(migrations.Migration):
    operations = [migrations.RunPython(normalize_emails)]

with connection.schema_editor() as editor:
    Migration("0002_normalize_emails", "accounts").unapply(ProjectState(), editor)`),
        error: 'IrreversibleError',
        correct:
          'Pass a `reverse_code`: `migrations.RunPython(normalize_emails, migrations.RunPython.noop)` when undoing needs no data change.',
        wrong: [
          'Mark the migration `atomic = False`.',
          'Delete the row for this migration from `django_migrations` before migrating back.',
          'Data migrations can never be reversed; squash it into the initial migration.',
        ],
        why: '`RunPython` without `reverse_code` is irreversible, so `Migration.unapply()` raises `IrreversibleError` before doing anything. `RunPython.noop` is right when the forward change can safely stay (lowercased emails); otherwise write a real reverse function. Editing `django_migrations` by hand leaves the history and the schema out of sync.',
      },
      {
        key: 'runsql-no-reverse',
        question: 'Reversing this migration fails. Why?',
        code: dbProgram(`${MIGRATION_IMPORTS}

class Migration(migrations.Migration):
    operations = [
        migrations.RunSQL("CREATE INDEX shop_order_lower_email ON shop_order (lower(email))"),
    ]

with connection.schema_editor() as editor:
    Migration("0005_email_index", "shop").unapply(ProjectState(), editor)`),
        error: 'IrreversibleError',
        correct:
          '`RunSQL` has no `reverse_sql`, so Django cannot know how to undo it; add `reverse_sql="DROP INDEX shop_order_lower_email"`.',
        wrong: [
          'Raw SQL is never allowed in migrations.',
          'The table `shop_order` does not exist, so the index cannot be dropped.',
          'Indexes must be created with `AddIndex`; `RunSQL` only supports `SELECT`.',
        ],
        why: 'Like `RunPython`, `RunSQL` is reversible only when given its inverse. The check happens before any SQL runs, so the missing table is not the reason here. (A functional index like this one can also be declared with `models.Index(Lower("email"), ...)` so the autodetector manages it.)',
      },
    ],
  ),
  ...b.fails(
    'dj-mig-historical-models',
    5,
    'Inside a migration, models come from the migration state, not from `models.py`.',
    [
      {
        key: 'custom-method',
        question:
          'The real `Page` model has a `make_slug()` method, but the data migration fails. Why?',
        code: dbProgram(`${MIGRATION_IMPORTS}
from django.utils.text import slugify

class Page(models.Model):  # the current model in models.py
    title = models.CharField(max_length=50)
    slug = models.SlugField(default="")

    class Meta:
        app_label = "cms"

    def make_slug(self):
        self.slug = slugify(self.title)

def fill_slugs(apps, schema_editor):
    Page = apps.get_model("cms", "Page")
    for page in Page.objects.all():
        page.make_slug()
        page.save()

class Migration(migrations.Migration):
    operations = [
        migrations.CreateModel("Page", [
            ("id", models.AutoField(primary_key=True)),
            ("title", models.CharField(max_length=50)),
            ("slug", models.SlugField(default="")),
        ]),
        migrations.RunPython(lambda apps, se: apps.get_model("cms", "Page").objects.create(title="Hello World")),
        migrations.RunPython(fill_slugs),
    ]

${APPLY}`),
        error: "AttributeError: 'Page' object has no attribute 'make_slug'",
        correct:
          '`apps.get_model()` returns a historical model built from the migration state: it has the fields but none of the custom methods; put the logic in the migration (call `slugify()` directly).',
        wrong: [
          '`apps.get_model()` returns the current model, so the error must be in `slugify()`.',
          'The migration should `import` `Page` from `models.py` instead of using `apps.get_model()`.',
          'Methods are only available after the migration has been committed.',
        ],
        why: 'Historical models reproduce fields, relations and `Meta` options as of that migration, not your current Python code (custom managers only when `use_in_migrations = True`). Importing the real model would be worse: later field changes would break old migrations. Copy the logic you need into the migration file.',
      },
    ],
  ),
  ...b.concept('dj-mig-reading', 3, 'Read the dependencies and each operation in order.', [
    {
      key: 'preserve-default',
      question: 'What does `preserve_default=False` mean in this generated migration?',
      snippet: {
        language: 'python',
        source: `from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("shop", "0003_product_price")]

    operations = [
        migrations.AddField(
            model_name="product",
            name="sku",
            field=models.CharField(default="UNKNOWN", max_length=20),
            preserve_default=False,
        ),
    ]
`,
      },
      correct:
        'The default `"UNKNOWN"` was a one-off value typed at the `makemigrations` prompt: it fills existing rows, but the field itself keeps no default.',
      wrong: [
        'Existing rows are left NULL and only new rows get `"UNKNOWN"`.',
        'The migration only runs if the table is empty.',
        'Every future product without a SKU is saved as `"UNKNOWN"`.',
      ],
      why: 'When you add a non-null field without a default, `makemigrations` asks for a one-off default to fill existing rows. With `preserve_default=False` that value is used during the migration only; afterwards the model has no default, so new code must always provide a SKU.',
    },
    {
      key: 'dependencies',
      question: 'What does the `dependencies` list in this migration guarantee?',
      snippet: {
        language: 'python',
        source: `from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("shop", "0004_product_sku"),
        ("accounts", "0002_customer"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="customer",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                to="accounts.customer",
            ),
        ),
    ]
`,
      },
      correct:
        'Both listed migrations are applied before this one, so the `accounts.Customer` table exists when the foreign key is created.',
      wrong: [
        'Applying this migration also unapplies `0004_product_sku`.',
        'The two migrations are merged into this file when it runs.',
        'It only documents the history; Django applies migrations in file-name order regardless.',
      ],
      why: 'Migrations form a graph. Cross-app dependencies (like `accounts.0002_customer`) are added automatically when a relation points to another app, so `migrate` applies them in a valid order. File names only order migrations within one app’s chain.',
    },
  ]),
  ...b.concept(
    'dj-mig-troubleshooting',
    4,
    'Compare what the code expects with what `django_migrations` and the schema say.',
    [
      {
        key: 'no-such-table',
        question:
          'After pulling a teammate’s branch, a page fails with `OperationalError: no such table: shop_coupon`. What is the most likely fix?',
        correct:
          'Run `python manage.py migrate`: the branch added a migration for `Coupon` that has not been applied to your database yet.',
        wrong: [
          'Run `makemigrations` again; the teammate’s migration file is not used on other machines.',
          'Delete the database and every migration file, then start with a new initial migration.',
          'Add `managed = False` to the model so Django stops looking for the table.',
        ],
        why: '`python manage.py showmigrations` lists `[ ]` for unapplied migrations. Applying the committed migration creates the table. Regenerating or deleting migrations destroys the shared history, and `managed = False` only stops Django from managing a table that still does not exist.',
      },
      {
        key: 'conflict',
        question:
          '`migrate` refuses to run: "Conflicting migrations detected; multiple leaf nodes in the migration graph: (0004_order_note, 0004_product_color in shop)". What happened, and what is the usual fix?',
        snippet: plain(`CommandError: Conflicting migrations detected; multiple leaf nodes in the
migration graph: (0004_order_note, 0004_product_color in shop).
To fix them run 'python manage.py makemigrations --merge'`),
        correct:
          'Two branches each added a migration on top of `0003`; `makemigrations --merge` creates a migration that depends on both and joins the graph again.',
        wrong: [
          'Two migrations have the same number; rename one of the files to `0005_...`.',
          'The database is corrupted; restore a backup.',
          'Delete one of the two migrations and run `migrate --fake`.',
        ],
        why: 'The number in a file name is only a convention; the graph comes from `dependencies`. Both `0004` files depend on `0003`, so there are two leaves. A merge migration depends on both. Renaming a file changes nothing in the graph, and deleting or faking hides real schema changes.',
      },
      {
        key: 'edited-applied',
        question:
          'A developer edits an already applied migration to add a field, runs `migrate`, and sees "No migrations to apply". Why?',
        correct:
          'Django records applied migrations by name in `django_migrations` and never re-runs them; schema changes must go into a new migration.',
        wrong: [
          'Edited migrations are applied only after `makemigrations --merge`.',
          '`migrate` compares file checksums and ignores small changes.',
          'The field already exists because models and tables are synchronized automatically.',
        ],
        why: 'Applied state is tracked per migration name, not content. Editing applied migrations makes environments diverge (a fresh database would get the field, existing ones would not). Create a new migration with `makemigrations` instead.',
      },
    ],
  ),
  ...b.concept(
    'dj-mig-zero-downtime',
    5,
    'During a rolling deployment, old and new code run against the same schema.',
    [
      {
        key: 'rename-column',
        question:
          'A busy service must rename the column `fullname` to `display_name` without downtime, with old and new app servers running side by side during the deployment. What is the safest approach?',
        correct:
          'Expand and contract: add `display_name`, write to both and backfill, switch reads to the new column, and remove `fullname` in a later release.',
        wrong: [
          'Use one `RenameField` migration and deploy it with the new code; renames are instant.',
          'Rename the column by hand in the database before deploying, then fake the migration.',
          'Deploy the code first; Django falls back to the old column name when the new one is missing.',
        ],
        why: 'A rename breaks every old app server still querying `fullname` until the deployment finishes. Splitting the change across releases keeps both versions working. Manual renames and faked migrations make the history lie, and Django has no column fallback.',
      },
      {
        key: 'not-null-large-table',
        question:
          'Adding a non-null column with a default to a very large table locks it for minutes on the team’s database. Which approach avoids the long lock while ending with a non-null column?',
        correct:
          'Add the column as nullable, backfill it in batches (a data migration or a background job), then make it non-null in a later migration.',
        wrong: [
          'Use `preserve_default=False`, which skips updating existing rows.',
          'Add `atomic = False` to the migration so the table is not locked.',
          'Run `makemigrations --dry-run` to apply the change without locks.',
        ],
        why: 'Depending on the database and version, adding a column with a default may rewrite the table. A nullable column without a default is a quick metadata change; batched backfills keep locks short. `preserve_default=False` still fills existing rows, `atomic = False` only affects transactions, and `--dry-run` applies nothing.',
      },
    ],
  ),
];
