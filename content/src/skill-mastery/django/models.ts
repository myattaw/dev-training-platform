import type { QuestionSource } from '@pracstack/content-model';
import { b, dbProgram } from './program';

/*
 * Models: fields and options, primary keys, relationships and on_delete,
 * constraints, model methods and validation. Tables are created in an
 * in-memory SQLite database with the schema editor, so every save, delete and
 * IntegrityError below is real.
 */

/** Creates the tables for the given models (shown in every program). */
const create = (...models: string[]) =>
  `with connection.schema_editor() as editor:\n${models.map((m) => `    editor.create_model(${m})`).join('\n')}`;

export const modelsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'dj-model-basics',
    1,
    [
      'A model without an explicit primary key gets an auto-incrementing `id`.',
      '`__str__` decides how an instance is displayed.',
    ],
    [
      {
        key: 'auto-id-and-default',
        code: dbProgram(`from django.db import connection, models

class Product(models.Model):
    name = models.CharField(max_length=100)
    in_stock = models.BooleanField(default=True)

    class Meta:
        app_label = "shop"

    def __str__(self):
        return self.name

${create('Product')}

p = Product.objects.create(name="Pen")
q = Product.objects.create(name="Ink", in_stock=False)
print(p.id, p.in_stock, str(p))
print(q.pk, q.in_stock, str(q))`),
        output: '1 True Pen\n2 False Ink',
        why: 'Django adds an `id` primary key (an auto-incrementing integer) when no field has `primary_key=True`, and `pk` is an alias for it. `default` fills a field you did not pass. `__str__` is what the admin, the shell and templates show.',
      },
      {
        key: 'custom-pk',
        code: dbProgram(`from django.db import connection, models

class Country(models.Model):
    code = models.CharField(max_length=2, primary_key=True)
    name = models.CharField(max_length=50)

    class Meta:
        app_label = "geo"

${create('Country')}

c = Country.objects.create(code="FR", name="France")
print(c.pk, hasattr(c, "id"))
print(Country._meta.pk.name)`),
        output: 'FR False\ncode',
        why: 'With `primary_key=True` on `code`, Django does not add an `id` field. `pk` always refers to the primary key, whatever its name, which is why generic code should use `pk` rather than `id`.',
      },
      {
        key: 'str-missing',
        question: 'The model defines no `__str__`. What does this program print?',
        code: dbProgram(`from django.db import connection, models

class Tag(models.Model):
    label = models.CharField(max_length=20)

    class Meta:
        app_label = "blog"

${create('Tag')}

t = Tag.objects.create(label="django")
print(str(t))`),
        output: 'Tag object (1)',
        why: 'The default `Model.__str__` shows the class name and the primary key. Defining `__str__` (here returning `self.label`) makes instances readable in the admin, logs and the shell.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-model-choices',
    2,
    'Choices describe the allowed values; check which operations actually enforce them.',
    [
      {
        key: 'display',
        code: dbProgram(`from django.db import connection, models

class Order(models.Model):
    class Status(models.TextChoices):
        NEW = "new", "Awaiting payment"
        PAID = "paid", "Paid"

    status = models.CharField(max_length=10, choices=Status, default=Status.NEW)

    class Meta:
        app_label = "shop"

${create('Order')}

o = Order.objects.create()
print(o.status, "|", o.get_status_display())`),
        correct: 'new | Awaiting payment',
        wrong: ['NEW | Awaiting payment', 'Awaiting payment | new', 'Status.NEW | new'],
        why: 'The database stores the value (`"new"`); `get_status_display()`, generated for every field with choices, returns the human-readable label. `TextChoices` members are strings equal to their value.',
      },
      {
        key: 'not-enforced',
        code: dbProgram(`from django.db import connection, models

class Order(models.Model):
    status = models.CharField(
        max_length=10,
        choices=[("new", "New"), ("paid", "Paid")],
    )

    class Meta:
        app_label = "shop"

${create('Order')}

o = Order.objects.create(status="lost")
print(Order.objects.get(pk=o.pk).status, o.get_status_display())`),
        correct: 'lost lost',
        wrong: ['new New', 'IntegrityError', 'lost None'],
        why: '`choices` is enforced by validation (`full_clean()`, model forms and the admin), not by `save()` or the database. The invalid value is stored, and `get_status_display()` falls back to the raw value when it has no label. Add a `CheckConstraint` if the database must reject it.',
      },
    ],
  ),
  ...b.codeChoice(
    'dj-model-null-blank',
    3,
    '`blank` is about validation, `null` is about the database column.',
    [
      {
        key: 'blank-saves',
        question:
          'The `title` field has the default `blank=False`, yet this program saves an empty title. Why?',
        code: dbProgram(`from django.db import connection, models

class Article(models.Model):
    title = models.CharField(max_length=100)

    class Meta:
        app_label = "news"

${create('Article')}

a = Article.objects.create(title="")
print(Article.objects.filter(title="").count())`),
        correct:
          '`blank=False` is only checked by validation (`full_clean()`, forms, the admin); `save()` does not validate, and `""` is a valid non-null value for the column.',
        wrong: [
          '`blank=False` only applies to `TextField`, not `CharField`.',
          'SQLite ignores `NOT NULL`; other databases would reject the row.',
          '`create()` sets `blank=True` automatically for new objects.',
        ],
        why: 'The empty string is not NULL, so the `NOT NULL` column accepts it on any database. Model validation runs only when called (`instance.full_clean()`) or through a `ModelForm`/serializer. For "must not be empty" at the database level, add a `CheckConstraint`.',
      },
      {
        key: 'null-on-charfield',
        question: 'Which field definition follows Django’s convention for an optional nickname?',
        code: dbProgram(`from django.db import connection, models

class Person(models.Model):
    nickname = models.CharField(max_length=30, blank=True)

    class Meta:
        app_label = "people"

${create('Person')}

p = Person.objects.create()
print(repr(p.nickname))`),
        correct:
          'The shown `CharField(max_length=30, blank=True)`: an optional text field stores `""`, so there is only one representation of "no value".',
        wrong: [
          '`CharField(max_length=30, null=True)`: `null=True` makes the field optional in forms.',
          '`CharField(max_length=30, null=True, blank=True)`, so that both `None` and `""` are possible.',
          '`CharField(max_length=30)`: Django makes every `CharField` optional by default.',
        ],
        why: 'The program prints `\'\'`: a `CharField` defaults to the empty string. Adding `null=True` to a text field creates two ways to say "empty" (`None` and `""`), which complicates queries. `null=True` does not affect forms; `blank=True` does. (Use `null=True` with `unique=True`, where several empty values must not collide.)',
      },
    ],
  ),
  ...b.fails(
    'dj-model-not-null',
    2,
    'The error comes from the database. Which column refused the value?',
    [
      {
        key: 'missing-fk',
        question: 'This program fails when saving the comment. Why?',
        code: dbProgram(`from django.db import connection, models

class Post(models.Model):
    title = models.CharField(max_length=50)

    class Meta:
        app_label = "blog"

class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE)
    body = models.TextField()

    class Meta:
        app_label = "blog"

${create('Post', 'Comment')}

Comment.objects.create(body="First!")`),
        error: 'IntegrityError',
        correct:
          'The foreign key `post` is required (`null=False`), so inserting a comment without a post violates the `NOT NULL` constraint on `post_id`.',
        wrong: [
          'A `TextField` needs `max_length`.',
          'The `Post` table must contain at least one row before any comment can be created.',
          '`create()` cannot be used for models with foreign keys.',
        ],
        why: 'SQLite reports `NOT NULL constraint failed: blog_comment.post_id`. Pass `post=some_post` (or make the relation optional with `null=True, blank=True`). `TextField` has no required `max_length`.',
      },
      {
        key: 'explicit-none',
        question: 'This program fails. Why?',
        code: dbProgram(`from django.db import connection, models

class Product(models.Model):
    name = models.CharField(max_length=50)
    price = models.DecimalField(max_digits=8, decimal_places=2)

    class Meta:
        app_label = "shop"

${create('Product')}

Product.objects.create(name="Pen")`),
        error: 'IntegrityError',
        correct:
          '`price` has no default and is not nullable, so it is saved as NULL and the database rejects it.',
        wrong: [
          'Every `DecimalField` defaults to `0`, so the error must be in `name`.',
          '`DecimalField` values must be passed as strings.',
          'Django validates required fields in `create()` and raises `ValidationError`.',
        ],
        why: 'Fields without a default start as `None`; `create()` does not validate, so the INSERT runs and fails with `NOT NULL constraint failed: shop_product.price`. A `ValidationError` would only come from `full_clean()` or a form.',
      },
    ],
  ),
  ...b.output(
    'dj-model-relationships',
    2,
    [
      'A `ForeignKey` creates a reverse manager on the other model, named by `related_name` or `<model>_set`.',
      'Many-to-many relations are managed with `add()`, `remove()` and `set()`.',
    ],
    [
      {
        key: 'reverse-fk',
        code: dbProgram(`from django.db import connection, models

class Author(models.Model):
    name = models.CharField(max_length=50)

    class Meta:
        app_label = "library"

class Book(models.Model):
    title = models.CharField(max_length=50)
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name="books")

    class Meta:
        app_label = "library"

${create('Author', 'Book')}

ada = Author.objects.create(name="Ada")
Book.objects.create(title="Notes", author=ada)
Book.objects.create(title="Engines", author=ada)
print(ada.books.count())
print(sorted(b.title for b in ada.books.all()))
print(Book.objects.first().author_id)`),
        output: "2\n['Engines', 'Notes']\n1",
        why: '`related_name="books"` names the reverse manager on `Author` (without it, it would be `book_set`). The column for the relation is `author_id`, available on the instance without loading the author.',
      },
      {
        key: 'many-to-many',
        code: dbProgram(`from django.db import connection, models

class Tag(models.Model):
    name = models.CharField(max_length=20)

    class Meta:
        app_label = "blog"

class Post(models.Model):
    title = models.CharField(max_length=50)
    tags = models.ManyToManyField(Tag, related_name="posts")

    class Meta:
        app_label = "blog"

${create('Tag', 'Post')}

web, api = Tag.objects.create(name="web"), Tag.objects.create(name="api")
p = Post.objects.create(title="REST")
p.tags.add(web, api)
p.tags.add(web)
print(p.tags.count(), web.posts.count())
p.tags.remove(api)
print([t.name for t in p.tags.all()])`),
        output: "2 1\n['web']",
        why: '`ManyToManyField` creates a join table; `add()` inserts rows and ignores a link that already exists, so adding `web` twice keeps one link. The reverse side (`web.posts`) sees the same rows.',
      },
      {
        key: 'one-to-one',
        code: dbProgram(`from django.db import connection, models

class Account(models.Model):
    email = models.CharField(max_length=50)

    class Meta:
        app_label = "users"

class Profile(models.Model):
    account = models.OneToOneField(Account, on_delete=models.CASCADE)
    bio = models.CharField(max_length=100)

    class Meta:
        app_label = "users"

${create('Account', 'Profile')}

acc = Account.objects.create(email="ada@example.com")
Profile.objects.create(account=acc, bio="Mathematician")
print(Account.objects.get(pk=acc.pk).profile.bio)`),
        output: 'Mathematician',
        why: 'A `OneToOneField` is a unique foreign key. The reverse accessor is a single object (`account.profile`, the lowercase model name), not a manager.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-model-on-delete',
    3,
    '`on_delete` decides what happens to rows that point at a deleted row.',
    [
      {
        key: 'cascade',
        code: dbProgram(`from django.db import connection, models

class Post(models.Model):
    title = models.CharField(max_length=50)

    class Meta:
        app_label = "blog"

class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE)

    class Meta:
        app_label = "blog"

${create('Post', 'Comment')}

p = Post.objects.create(title="Hi")
Comment.objects.create(post=p)
Comment.objects.create(post=p)
print(p.delete())`),
        correct: "(3, {'blog.Comment': 2, 'blog.Post': 1})",
        wrong: [
          "(1, {'blog.Post': 1})",
          "(3, {'blog.Post': 1, 'blog.Comment': 2})",
          'IntegrityError',
        ],
        why: '`CASCADE` deletes the comments along with the post. `delete()` returns the total number of deleted rows and a count per model; Django collects and deletes dependent rows first, which is why `blog.Comment` comes before `blog.Post`.',
      },
      {
        key: 'set-null',
        code: dbProgram(`from django.db import connection, models

class Team(models.Model):
    name = models.CharField(max_length=50)

    class Meta:
        app_label = "org"

class Member(models.Model):
    team = models.ForeignKey(Team, on_delete=models.SET_NULL, null=True)

    class Meta:
        app_label = "org"

${create('Team', 'Member')}

t = Team.objects.create(name="Core")
m = Member.objects.create(team=t)
t.delete()
m.refresh_from_db()
print(Member.objects.count(), m.team_id)`),
        correct: '1 None',
        wrong: ['0 None', '1 1', 'ProtectedError'],
        why: '`SET_NULL` keeps the member and sets its foreign key to NULL, which requires `null=True` on the field. `refresh_from_db()` is needed because the in-memory `m` still holds the old `team_id` until it is reloaded.',
      },
      {
        key: 'protect',
        code: dbProgram(`from django.db import connection, models
from django.db.models import ProtectedError

class Customer(models.Model):
    name = models.CharField(max_length=50)

    class Meta:
        app_label = "billing"

class Invoice(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT)

    class Meta:
        app_label = "billing"

${create('Customer', 'Invoice')}

c = Customer.objects.create(name="Acme")
Invoice.objects.create(customer=c)
try:
    c.delete()
except ProtectedError:
    print("protected", Customer.objects.count(), Invoice.objects.count())`),
        correct: 'protected 1 1',
        wrong: ['protected 0 1', 'protected 0 0', '1 0'],
        why: '`PROTECT` makes Django refuse the delete with `ProtectedError` before running any DELETE, so both rows remain. Use it for records that must not disappear, such as invoices.',
      },
    ],
  ),
  ...b.fails(
    'dj-model-constraints',
    4,
    'Constraints in `Meta.constraints` become database constraints, checked on every INSERT and UPDATE.',
    [
      {
        key: 'unique-together',
        question: 'The last line fails. Why?',
        code: dbProgram(`from django.db import connection, models

class Enrollment(models.Model):
    student = models.CharField(max_length=50)
    course = models.CharField(max_length=50)

    class Meta:
        app_label = "school"
        constraints = [
            models.UniqueConstraint(fields=["student", "course"], name="one_enrollment_per_course"),
        ]

${create('Enrollment')}

Enrollment.objects.create(student="ada", course="math")
Enrollment.objects.create(student="ada", course="physics")
Enrollment.objects.create(student="ada", course="math")`),
        error: 'IntegrityError',
        correct:
          'The pair (`ada`, `math`) already exists, and the unique constraint covers the combination of both fields.',
        wrong: [
          'A student can only have one enrollment, because `student` is unique.',
          'Constraint names must start with the app label.',
          '`UniqueConstraint` only works on PostgreSQL.',
        ],
        why: 'The constraint is on the pair, so `ada`/`physics` is fine but a second `ada`/`math` violates it: `UNIQUE constraint failed: school_enrollment.student, school_enrollment.course`. Unique constraints work on every supported database.',
      },
      {
        key: 'check',
        question: 'Updating the price fails. Why?',
        code: dbProgram(`from django.db import connection, models
from django.db.models import Q

class Product(models.Model):
    price = models.DecimalField(max_digits=8, decimal_places=2)

    class Meta:
        app_label = "shop"
        constraints = [
            models.CheckConstraint(condition=Q(price__gte=0), name="price_not_negative"),
        ]

${create('Product')}

p = Product.objects.create(price=5)
Product.objects.filter(pk=p.pk).update(price=-1)`),
        error: 'IntegrityError',
        correct:
          'The database enforces `price >= 0` on updates too, so the bulk `update()` is rejected.',
        wrong: [
          'Check constraints are only evaluated by `full_clean()`, so this must be a different error.',
          '`update()` cannot change a `DecimalField`.',
          'A `CheckConstraint` needs `fields=[...]` in addition to the condition.',
        ],
        why: 'A `CheckConstraint` is created in the table, so every INSERT and UPDATE is checked, including `QuerySet.update()`, which bypasses `save()` and validation: `CHECK constraint failed: price_not_negative`. Since Django 5.1 the argument is `condition=` (the older `check=` is deprecated).',
      },
      {
        key: 'unique-field',
        question: 'The second `create()` fails. Why?',
        code: dbProgram(`from django.db import connection, models

class Account(models.Model):
    email = models.EmailField(unique=True)

    class Meta:
        app_label = "users"

${create('Account')}

Account.objects.create(email="ada@example.com")
Account.objects.create(email="ada@example.com")`),
        error: 'IntegrityError',
        correct: '`unique=True` adds a unique index, so the database rejects the duplicate email.',
        wrong: [
          '`EmailField` validates the address and rejects `example.com` domains.',
          'Two objects created in the same second get the same primary key.',
          'The first object must be saved again before a second one is created.',
        ],
        why: 'The error is `UNIQUE constraint failed: users_account.email`. `EmailField` format validation only happens in `full_clean()` or forms. Checking "does it exist?" before inserting is not enough under concurrency; the unique index is what actually guarantees uniqueness.',
      },
    ],
  ),
  ...b.output(
    'dj-model-conditional-unique',
    5,
    [
      'A `UniqueConstraint` with a `condition` is a partial unique index: only rows matching the condition are compared.',
    ],
    [
      {
        key: 'one-active',
        code: dbProgram(`from django.db import IntegrityError, connection, models
from django.db.models import Q

class Subscription(models.Model):
    user = models.CharField(max_length=50)
    active = models.BooleanField()

    class Meta:
        app_label = "billing"
        constraints = [
            models.UniqueConstraint(
                fields=["user"], condition=Q(active=True), name="one_active_subscription"
            ),
        ]

${create('Subscription')}

Subscription.objects.create(user="ada", active=False)
Subscription.objects.create(user="ada", active=False)
Subscription.objects.create(user="ada", active=True)
try:
    Subscription.objects.create(user="ada", active=True)
except IntegrityError:
    print("rejected")
print(Subscription.objects.filter(user="ada").count())`),
        output: 'rejected\n3',
        why: 'Only active rows take part in the uniqueness check, so any number of inactive subscriptions may exist but a second active one is rejected. Partial unique indexes are supported by SQLite and PostgreSQL; on databases without them Django skips the constraint.',
      },
      {
        key: 'nulls',
        code: dbProgram(`from django.db import IntegrityError, connection, models

class Device(models.Model):
    serial = models.CharField(max_length=20, unique=True, null=True)

    class Meta:
        app_label = "iot"

${create('Device')}

Device.objects.create(serial=None)
Device.objects.create(serial=None)
try:
    Device.objects.create(serial="A1")
    Device.objects.create(serial="A1")
except IntegrityError:
    print("duplicate serial")
print(Device.objects.count())`),
        output: 'duplicate serial\n3',
        why: 'In SQL, NULL is not equal to NULL, so a unique column accepts many NULLs. That is the one case where `null=True` on a text field is right: with `""` as the empty value, the second unregistered device would collide.',
      },
    ],
  ),
  ...b.output(
    'dj-model-methods',
    3,
    [
      'Model methods and properties work on the in-memory instance.',
      'Overriding `save()` must call `super().save()`.',
    ],
    [
      {
        key: 'save-override',
        code: dbProgram(`from django.db import connection, models
from django.utils.text import slugify

class Page(models.Model):
    title = models.CharField(max_length=100)
    slug = models.SlugField(max_length=100, blank=True)

    class Meta:
        app_label = "cms"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.title)
        super().save(*args, **kwargs)

${create('Page')}

Page.objects.create(title="Hello World, Again!")
Page.objects.create(title="About", slug="about-us")
print(list(Page.objects.order_by("pk").values_list("slug", flat=True)))`),
        output: "['hello-world-again', 'about-us']",
        why: '`create()` calls `save()`, so the override fills the slug before the INSERT. `slugify()` lowercases, removes punctuation and joins words with hyphens; an explicit slug is kept. Note that `QuerySet.update()` and `bulk_create()` do not call `save()`.',
      },
      {
        key: 'property',
        code: dbProgram(`from decimal import Decimal
from django.db import connection, models

class Line(models.Model):
    unit_price = models.DecimalField(max_digits=8, decimal_places=2)
    quantity = models.PositiveIntegerField()

    class Meta:
        app_label = "shop"

    @property
    def total(self):
        return self.unit_price * self.quantity

${create('Line')}

line = Line.objects.create(unit_price=Decimal("2.50"), quantity=3)
print(line.total)
print(Line.objects.get(pk=line.pk).total)`),
        output: '7.50\n7.50',
        why: 'A property is computed from the field values each time it is read; it is not a column, so it cannot be used in `filter()` (use `annotate()` for that). `Decimal("2.50") * 3` keeps two decimal places.',
      },
    ],
  ),
];
