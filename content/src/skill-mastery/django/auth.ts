import type { QuestionSource } from '@pracstack/content-model';
import { authApps, b, dbProgram } from './program';

/*
 * Authentication and authorization: the User model, password hashing,
 * authenticate(), permissions and groups, sessions, login_required and access
 * control. The auth tables are created with a real `migrate`; programs use the
 * fast MD5 hasher only to keep runs quick (never do that in a real project).
 */

const auth = { apps: authApps, fastHasher: true } as const;
const SESSION_APPS = [...authApps, 'django.contrib.sessions'];
const SESSION_MIDDLEWARE = `MIDDLEWARE=[
        "django.contrib.sessions.middleware.SessionMiddleware",
        "django.contrib.auth.middleware.AuthenticationMiddleware",
    ]`;
const web = {
  apps: SESSION_APPS,
  fastHasher: true,
  urls: true,
  settings: ['SECRET_KEY="practice-only-not-secret"', SESSION_MIDDLEWARE],
} as const;

const MIGRATE = `from django.core.management import call_command

call_command("migrate", verbosity=0)  # creates the auth tables`;

export const authFamilies: readonly QuestionSource[] = [
  ...b.output(
    'dj-auth-passwords',
    1,
    [
      '`create_user()` hashes the password; the raw password is never stored.',
      '`check_password()` hashes the candidate and compares.',
    ],
    [
      {
        key: 'create-user',
        code: dbProgram(
          `${MIGRATE}
from django.contrib.auth.models import User

user = User.objects.create_user("ada", password="correct horse")
print(user.password == "correct horse")
print(user.password.split("$")[0])
print(user.check_password("correct horse"), user.check_password("Correct horse"))`,
          auth,
        ),
        output: 'False\nmd5\nTrue False',
        why: 'The stored value is `<algorithm>$<salt>$<hash>`, never the password itself. These programs configure the fast MD5 hasher only so they run quickly; real projects must keep the default PBKDF2 (or Argon2/bcrypt), because MD5 is far too fast to resist brute force. Passwords are case-sensitive.',
      },
      {
        key: 'unusable',
        code: dbProgram(
          `${MIGRATE}
from django.contrib.auth.models import User

sso = User.objects.create_user("grace")
print(sso.has_usable_password(), sso.check_password(""))`,
          auth,
        ),
        output: 'False False',
        why: 'Without a password, `create_user()` calls `set_unusable_password()`: no password, not even the empty string, can log this account in. That is right for users who sign in only through single sign-on.',
      },
    ],
  ),
  ...b.codeChoice(
    'dj-auth-set-password',
    3,
    'Assigning to `password` stores exactly what you assign.',
    [
      {
        key: 'raw-assignment',
        question:
          'A password-reset script sets the new password like this. Why can the user not log in?',
        code: dbProgram(
          `${MIGRATE}
from django.contrib.auth import authenticate
from django.contrib.auth.models import User

user = User.objects.create_user("ada", password="old-password")
user.password = "new-password"
user.save()
print(authenticate(username="ada", password="new-password"))`,
          auth,
        ),
        correct:
          'The plain text was stored in the hash column; use `user.set_password("new-password")` and then `user.save()`.',
        wrong: [
          '`save()` must be called with `update_fields=["password"]`.',
          'Sessions cache the old password until the server restarts.',
          '`authenticate()` needs the request as its first argument to work.',
        ],
        why: 'The program prints `None`: `authenticate()` treats the stored value as a hash, and a raw string never matches. `set_password()` hashes the value (it does not save, hence the `save()`). Storing plain text passwords is also a serious security bug in its own right.',
      },
      {
        key: 'create-vs-create-user',
        question: 'Which line creates a user who can log in with `s3cret`?',
        code: dbProgram(
          `${MIGRATE}
from django.contrib.auth.models import User

a = User.objects.create(username="a", password="s3cret")
b = User.objects.create_user(username="b", password="s3cret")
print(a.check_password("s3cret"), b.check_password("s3cret"))`,
          auth,
        ),
        correct: 'Only `create_user()`: plain `create()` stores the password string unhashed.',
        wrong: [
          'Both: `User.save()` hashes the password automatically.',
          'Only `create()`, because `create_user()` requires an email address.',
          'Neither: passwords can only be set through the admin.',
        ],
        why: 'The program prints `False True`. `create()` is the generic model manager method and knows nothing about hashing; `create_user()` (and `create_superuser()`) call `set_password()`. The email argument of `create_user()` is optional.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-auth-authenticate',
    2,
    '`authenticate()` returns a user or `None`; it never raises for wrong credentials.',
    [
      {
        key: 'wrong-password',
        code: dbProgram(
          `${MIGRATE}
from django.contrib.auth import authenticate
from django.contrib.auth.models import User

User.objects.create_user("ada", password="s3cret")
print(authenticate(username="ada", password="s3cret"), authenticate(username="ada", password="nope"))`,
          auth,
        ),
        correct: 'ada None',
        wrong: ['True False', 'ada PermissionDenied', 'ada ada'],
        why: 'On success `authenticate()` returns the `User` (printed via its username); on failure it returns `None` rather than raising, so check `if user is not None:`. It only verifies credentials; `login()` then attaches the user to the session.',
      },
      {
        key: 'inactive',
        code: dbProgram(
          `${MIGRATE}
from django.contrib.auth import authenticate
from django.contrib.auth.models import User

User.objects.create_user("bob", password="s3cret", is_active=False)
print(authenticate(username="bob", password="s3cret"))`,
          auth,
        ),
        correct: 'None',
        wrong: ['bob', 'False', 'User.DoesNotExist'],
        why: 'The default `ModelBackend` rejects users with `is_active=False`, even with the right password. Deactivating an account (instead of deleting it) keeps its history while blocking logins.',
      },
      {
        key: 'anonymous',
        code: dbProgram(
          `from django.contrib.auth.models import AnonymousUser

user = AnonymousUser()
print(user.is_authenticated, user.is_anonymous, user.pk, user.has_perm("auth.view_user"))`,
          { apps: authApps },
        ),
        correct: 'False True None False',
        wrong: ['False True 0 False', 'True False None False', 'False True None True'],
        why: 'For requests without a logged-in user, `request.user` is an `AnonymousUser`: not authenticated, no primary key and no permissions. Check `request.user.is_authenticated` rather than comparing with `None`.',
      },
    ],
  ),
  ...b.output(
    'dj-auth-permissions',
    3,
    [
      'Permission strings are `"<app_label>.<codename>"`, for example `"auth.add_user"`.',
      'Users get permissions directly or through groups; active superusers have all of them.',
    ],
    [
      {
        key: 'group',
        code: dbProgram(
          `${MIGRATE}
from django.contrib.auth.models import Group, Permission, User

editors = Group.objects.create(name="editors")
editors.permissions.add(Permission.objects.get(codename="change_user"))
ada = User.objects.create_user("ada")
ada.groups.add(editors)
print(ada.has_perm("auth.change_user"), ada.has_perm("auth.delete_user"))
print(ada.has_perm("change_user"))`,
          auth,
        ),
        output: 'True False\nFalse',
        why: 'Group permissions count for every member. The default permissions for each model are `add_`, `change_`, `delete_` and `view_`. `has_perm()` needs the app label prefix: plain `"change_user"` matches nothing and quietly returns `False`.',
      },
      {
        key: 'superuser-inactive',
        code: dbProgram(
          `${MIGRATE}
from django.contrib.auth.models import User

root = User.objects.create_superuser("root", password="x")
print(root.has_perm("auth.delete_group"), root.has_perm("made.up_permission"))
root.is_active = False
print(root.has_perm("auth.delete_group"))`,
          auth,
        ),
        output: 'True True\nFalse',
        why: 'An active superuser passes every permission check, even for permissions that do not exist. Inactive users have no permissions at all, superuser or not.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-auth-perm-cache',
    4,
    'Permission checks are cached on the user object after the first call.',
    [
      {
        key: 'stale',
        code: dbProgram(
          `${MIGRATE}
from django.contrib.auth.models import Permission, User

ada = User.objects.create_user("ada")
print(ada.has_perm("auth.view_group"), end=" ")
ada.user_permissions.add(Permission.objects.get(codename="view_group"))
print(ada.has_perm("auth.view_group"), end=" ")
ada = User.objects.get(pk=ada.pk)
print(ada.has_perm("auth.view_group"))`,
          auth,
        ),
        correct: 'False False True',
        wrong: ['False True True', 'False False False', 'True True True'],
        why: '`ModelBackend` caches the permission set on the user instance at the first check, so a permission added afterwards is not seen by the same object. Re-fetching the user (as the next request does) loads fresh permissions. This often confuses tests that grant a permission and check it on the same instance.',
      },
      {
        key: 'group-later',
        code: dbProgram(
          `${MIGRATE}
from django.contrib.auth.models import Group, Permission, User

staff = Group.objects.create(name="staff")
ada = User.objects.create_user("ada")
ada.groups.add(staff)
print(ada.has_perm("auth.add_group"), end=" ")
staff.permissions.add(Permission.objects.get(codename="add_group"))
print(ada.has_perm("auth.add_group"), User.objects.get(pk=ada.pk).has_perm("auth.add_group"))`,
          auth,
        ),
        correct: 'False False True',
        wrong: ['False True True', 'False True False', 'False False False'],
        why: 'The cache covers group permissions too: the first `has_perm()` stored an empty set on `ada`. A freshly loaded user sees the group’s new permission.',
      },
    ],
  ),
  ...b.output(
    'dj-auth-login-required',
    2,
    [
      '`login_required` redirects anonymous users to `settings.LOGIN_URL` with a `next` parameter.',
      'The test client can log a user in without a password with `force_login()`.',
    ],
    [
      {
        key: 'redirect',
        code: dbProgram(
          `${MIGRATE}
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.http import HttpResponse
from django.test import Client
from django.urls import path

@login_required
def dashboard(request):
    return HttpResponse("Hi " + request.user.username)

urlpatterns = [path("dashboard/", dashboard)]

c = Client()
r = c.get("/dashboard/")
print(r.status_code, r["Location"])
c.force_login(User.objects.create_user("ada"))
print(c.get("/dashboard/").content.decode())`,
          web,
        ),
        output: '302 /accounts/login/?next=/dashboard/\nHi ada',
        why: 'Anonymous users are redirected to `LOGIN_URL` (default `/accounts/login/`) with `next` set to the requested path, so the login view can send them back. After `force_login()` the session identifies the user and the view runs.',
      },
      {
        key: 'permission-required',
        code: dbProgram(
          `${MIGRATE}
from django.contrib.auth.decorators import permission_required
from django.contrib.auth.models import User
from django.http import HttpResponse
from django.test import Client
from django.urls import path

@permission_required("auth.view_user", raise_exception=True)
def user_list(request):
    return HttpResponse("users")

urlpatterns = [path("users/", user_list)]

c = Client()
print(c.get("/users/").status_code)
c.force_login(User.objects.create_user("ada"))
print(c.get("/users/").status_code)
c.force_login(User.objects.create_superuser("root"))
print(c.get("/users/").status_code)`,
          web,
        ),
        output: '403\n403\n200',
        why: 'With `raise_exception=True`, a missing permission raises `PermissionDenied`, which becomes 403 Forbidden, for anonymous and logged-in users alike. Without it, users lacking the permission are redirected to the login page, which is confusing for someone already logged in.',
      },
    ],
  ),
  ...b.output(
    'dj-auth-sessions',
    3,
    [
      'Session data is stored on the server; the cookie only carries the session key.',
      'Each test client keeps its own cookies, like a separate browser.',
    ],
    [
      {
        key: 'counter',
        code: dbProgram(
          `${MIGRATE}
from django.http import HttpResponse
from django.test import Client
from django.urls import path

def visits(request):
    request.session["n"] = request.session.get("n", 0) + 1
    return HttpResponse(request.session["n"])

urlpatterns = [path("visits/", visits)]

alice, bob = Client(), Client()
alice.get("/visits/")
alice.get("/visits/")
print(alice.get("/visits/").content.decode(), bob.get("/visits/").content.decode())`,
          web,
        ),
        output: '3 1',
        why: 'Each client has its own `sessionid` cookie, so the counters are separate. The cookie holds an opaque session key, not the data; with the default database backend the values live in the `django_session` table, where the user cannot change them.',
      },
    ],
  ),
  ...b.codeChoice(
    'dj-auth-object-access',
    5,
    'Being logged in is not the same as being allowed to see this particular object.',
    [
      {
        key: 'idor',
        question:
          'Each user should only see their own invoices. Bob requests Ada’s invoice and gets status 200. What is the fix?',
        code: dbProgram(
          `${MIGRATE}
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.db import connection, models
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.test import Client
from django.urls import path

class Invoice(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    total = models.IntegerField()

    class Meta:
        app_label = "billing"

with connection.schema_editor() as editor:
    editor.create_model(Invoice)

@login_required
def invoice(request, pk):
    inv = get_object_or_404(Invoice, pk=pk)
    return HttpResponse(inv.total)

urlpatterns = [path("invoices/<int:pk>/", invoice)]

ada = User.objects.create_user("ada")
inv = Invoice.objects.create(owner=ada, total=120)
c = Client()
c.force_login(User.objects.create_user("bob"))
print(c.get(f"/invoices/{inv.pk}/").status_code)`,
          { ...web, apps: [...SESSION_APPS] },
        ),
        correct:
          'Scope the lookup to the user: `get_object_or_404(Invoice, pk=pk, owner=request.user)`, so other users’ invoices answer 404.',
        wrong: [
          'Add `@permission_required("billing.view_invoice")`; model permissions are checked per object.',
          'Use UUIDs instead of integer ids so the URLs cannot be guessed.',
          'Nothing: `login_required` already restricts the view to the invoice owner.',
        ],
        why: 'This is an insecure direct object reference: `login_required` only checks that someone is logged in. Model permissions in `ModelBackend` are global ("may view invoices"), not per object. Unguessable ids reduce discovery but are not access control. Filtering by owner makes the database enforce it.',
      },
    ],
  ),
  ...b.concept('dj-auth-concepts', 2, 'Think about what each mechanism is designed to protect.', [
    {
      key: 'custom-user',
      question:
        'Starting a new project that may later need extra user fields (for example sign-in by email). What does the Django documentation recommend?',
      correct:
        'Define a custom user model (for example subclassing `AbstractUser`) and set `AUTH_USER_MODEL` before the first migration.',
      wrong: [
        'Use `django.contrib.auth.models.User` and add columns to `auth_user` by hand later.',
        'Store extra fields in the session.',
        'Subclass `User` with multi-table inheritance whenever a field is needed.',
      ],
      why: 'Switching `AUTH_USER_MODEL` after tables and foreign keys exist is a difficult migration, so the docs recommend a custom user model from the start even if it is identical to `User`. Hand-edited tables drift from the migrations, and sessions are temporary.',
    },
    {
      key: 'hashers',
      question:
        'Why does Django store passwords with a slow, salted hash such as PBKDF2 or Argon2?',
      correct:
        'If the database leaks, each guess costs significant computation and salts stop precomputed tables, so recovering passwords is slow.',
      wrong: [
        'So that administrators can decrypt passwords when users forget them.',
        'Because fast hashes like MD5 cannot be stored in a `CharField`.',
        'To make logins faster by caching the hash in the session.',
      ],
      why: 'Password hashes are one-way: nobody can decrypt them, which is why resets set a new password. Fast hashes such as MD5 allow billions of guesses per second, which is why the practice programs here use MD5 only for speed and real projects must not.',
    },
  ]),
];
