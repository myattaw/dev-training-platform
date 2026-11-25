import type { QuestionSource } from '@pracstack/content-model';
import { b, dbProgram, djangoProgram } from './program';

/*
 * Forms and validation: Form, ModelForm, field cleaning, clean_<field>() and
 * clean(), error messages, bound and unbound forms. Every form is validated
 * for real.
 */

export const formsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'dj-form-is-valid',
    1,
    [
      '`is_valid()` runs every field’s validation; `cleaned_data` holds converted values.',
      'Form data arrives as strings.',
    ],
    [
      {
        key: 'converted',
        code: djangoProgram(`from django import forms

class SignupForm(forms.Form):
    name = forms.CharField(max_length=30)
    age = forms.IntegerField()

form = SignupForm({"name": "Ada", "age": "36"})
print(form.is_valid())
print(form.cleaned_data)`),
        output: "True\n{'name': 'Ada', 'age': 36}",
        why: 'The raw data is all strings, as it would be from `request.POST`. `IntegerField` converts `"36"` to the integer `36` in `cleaned_data`; use `cleaned_data`, never the raw data, after validation.',
      },
      {
        key: 'missing-required',
        code: djangoProgram(`from django import forms

class SignupForm(forms.Form):
    name = forms.CharField(max_length=30)
    nickname = forms.CharField(required=False)

form = SignupForm({"nickname": "ace"})
print(form.is_valid())
print(list(form.errors))
print(form.cleaned_data)`),
        output: "False\n['name']\n{'nickname': 'ace'}",
        why: 'Form fields are required by default, so the missing `name` makes the form invalid with an error under that key. `cleaned_data` still exists after `is_valid()` and holds the fields that passed.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-form-errors',
    2,
    'Each field reports its own message; `errors` is keyed by field name.',
    [
      {
        key: 'max-length',
        code: djangoProgram(`from django import forms

class TagForm(forms.Form):
    tag = forms.CharField(max_length=5)

form = TagForm({"tag": "framework"})
form.is_valid()
print(form.errors["tag"][0])`),
        correct: 'Ensure this value has at most 5 characters (it has 9).',
        wrong: ['This field is required.', 'Enter a valid value.', 'Value too long for type character varying(5).'],
        why: '`max_length` on a form field adds a `MaxLengthValidator` with this message. It is checked in the form, before anything reaches the database; the last option is a PostgreSQL error you would get only by skipping validation.',
      },
      {
        key: 'invalid-number',
        code: djangoProgram(`from django import forms

class QuantityForm(forms.Form):
    quantity = forms.IntegerField(min_value=1)

a = QuantityForm({"quantity": "two"})
b = QuantityForm({"quantity": "0"})
a.is_valid(), b.is_valid()
print(a.errors["quantity"][0], "|", b.errors["quantity"][0])`),
        correct: 'Enter a whole number. | Ensure this value is greater than or equal to 1.',
        wrong: [
          'Enter a whole number. | Enter a whole number.',
          'Ensure this value is greater than or equal to 1. | Ensure this value is greater than or equal to 1.',
          'This field is required. | Ensure this value is greater than or equal to 1.',
        ],
        why: 'Conversion happens first (`to_python()`): `"two"` cannot become an integer, so validators never run for it. `"0"` converts fine and then fails the `min_value` validator.',
      },
      {
        key: 'as-json',
        code: djangoProgram(`from django import forms

class EmailForm(forms.Form):
    email = forms.EmailField()

form = EmailForm({"email": "not-an-email"})
form.is_valid()
print(form.errors.get_json_data()["email"][0]["code"])`),
        correct: 'invalid',
        wrong: ['required', 'email', 'ValidationError'],
        why: 'Every error carries a machine-readable `code` besides its message (`invalid` for a malformed email, `required` for a missing value). APIs and JavaScript should branch on the code, because messages are translated.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-form-bound',
    2,
    'A form without data is unbound: it can be displayed, not validated.',
    [
      {
        key: 'unbound',
        code: djangoProgram(`from django import forms

class SearchForm(forms.Form):
    q = forms.CharField()

form = SearchForm()
print(form.is_bound, form.is_valid(), dict(form.errors))`),
        correct: 'False False {}',
        wrong: ["False False {'q': ['This field is required.']}", 'True False {}', 'False True {}'],
        why: 'An unbound form (`SearchForm()`) has no data, so `is_valid()` is `False` without producing errors: showing an empty form on GET must not display "This field is required." Bind it with `SearchForm(request.POST)` to validate.',
      },
      {
        key: 'empty-dict',
        code: djangoProgram(`from django import forms

class SearchForm(forms.Form):
    q = forms.CharField()

form = SearchForm({})
print(form.is_bound, form.is_valid(), list(form.errors))`),
        correct: "True False ['q']",
        wrong: ['False False []', "False False ['q']", 'True True []'],
        why: 'Any data argument, even an empty dictionary, makes the form bound, so it is validated and the required field reports an error. Passing `request.POST or None` is a common idiom to keep a GET form unbound.',
      },
      {
        key: 'initial',
        code: djangoProgram(`from django import forms

class SettingsForm(forms.Form):
    theme = forms.CharField(initial="light")

form = SettingsForm({"theme": ""})
print(form.is_valid(), form["theme"].value() == "")`),
        correct: 'False True',
        wrong: ['True False', 'True True', 'False False'],
        why: '`initial` is only the value shown in an unbound form; it is not a default for submitted data. The submitted empty string is used and fails the required check. Use a model default or handle the empty value in `clean_theme()` if you need a fallback.',
      },
    ],
  ),
  ...b.output(
    'dj-form-field-cleaning',
    4,
    [
      '`CharField` strips surrounding whitespace by default.',
      'A required `BooleanField` means "must be checked".',
    ],
    [
      {
        key: 'strip-and-boolean',
        code: djangoProgram(`from django import forms

class TermsForm(forms.Form):
    name = forms.CharField()
    accept = forms.BooleanField()
    newsletter = forms.BooleanField(required=False)

form = TermsForm({"name": "  Ada  ", "accept": ""})
print(form.is_valid(), sorted(form.errors))
form = TermsForm({"name": "  Ada  ", "accept": "on"})
print(form.is_valid(), form.cleaned_data)`),
        output: "False ['accept']\nTrue {'name': 'Ada', 'accept': True, 'newsletter': False}",
        why: '`BooleanField` is required by default, which means the box must be checked: perfect for "accept the terms", wrong for an optional newsletter flag (add `required=False`). `CharField` strips whitespace (`strip=True`), and an unchecked optional box is `False`.',
      },
      {
        key: 'whitespace-only',
        code: djangoProgram(`from django import forms

class CommentForm(forms.Form):
    body = forms.CharField()
    note = forms.CharField(required=False)

form = CommentForm({"body": "   ", "note": "   "})
print(form.is_valid(), list(form.errors), repr(form.cleaned_data["note"]))`),
        output: "False ['body'] ''",
        why: 'Stripping happens before the required check, so a body of only spaces counts as empty and fails. The optional `note` becomes the empty string.',
      },
    ],
  ),
  ...b.output(
    'dj-form-clean-field',
    3,
    [
      '`clean_<field>()` runs after the field’s own validation and must return the value to keep.',
      'Raise `ValidationError` to reject the value.',
    ],
    [
      {
        key: 'forgot-return',
        code: djangoProgram(`from django import forms

class UsernameForm(forms.Form):
    username = forms.CharField()

    def clean_username(self):
        value = self.cleaned_data["username"].lower()
        if value == "admin":
            raise forms.ValidationError("Reserved name.")

form = UsernameForm({"username": "Ada"})
print(form.is_valid(), form.cleaned_data)`),
        output: "True {'username': None}",
        why: 'Whatever `clean_username()` returns replaces the value in `cleaned_data`. This method forgets `return value`, so it returns `None`: the form is valid but the username is lost. Always end with `return value`.',
      },
      {
        key: 'raise',
        code: djangoProgram(`from django import forms

class UsernameForm(forms.Form):
    username = forms.CharField()

    def clean_username(self):
        value = self.cleaned_data["username"].lower()
        if value == "admin":
            raise forms.ValidationError("Reserved name.")
        return value

ok = UsernameForm({"username": "Ada"})
bad = UsernameForm({"username": "ADMIN"})
print(ok.is_valid(), ok.cleaned_data["username"])
print(bad.is_valid(), bad.errors["username"][0])`),
        output: 'True ada\nFalse Reserved name.',
        why: 'The method can normalize (here lowercasing) by returning a new value, and a `ValidationError` is attached to that field’s errors. The check is case-insensitive because it compares the lowercased value.',
      },
    ],
  ),
  ...b.output(
    'dj-form-clean',
    3,
    [
      '`clean()` runs after every field has been cleaned, for rules involving several fields.',
      'A field that failed its own validation is missing from `cleaned_data` in `clean()`.',
    ],
    [
      {
        key: 'passwords',
        code: djangoProgram(`from django import forms

class PasswordForm(forms.Form):
    password = forms.CharField()
    confirm = forms.CharField()

    def clean(self):
        data = super().clean()
        if data.get("password") != data.get("confirm"):
            raise forms.ValidationError("Passwords do not match.")
        return data

form = PasswordForm({"password": "abc12345", "confirm": "abc1234"})
print(form.is_valid())
print(form.non_field_errors()[0])
print(list(form.errors))`),
        output: 'False\nPasswords do not match.\n[\'__all__\']',
        why: 'An error raised in `clean()` belongs to no single field, so it is stored under `__all__` and returned by `non_field_errors()`. Templates usually show these above the form.',
      },
      {
        key: 'add-error',
        code: djangoProgram(`from django import forms

class BookingForm(forms.Form):
    start = forms.IntegerField()
    end = forms.IntegerField()

    def clean(self):
        data = super().clean()
        start, end = data.get("start"), data.get("end")
        if start is not None and end is not None and end <= start:
            self.add_error("end", "End must be after start.")
        return data

a = BookingForm({"start": "5", "end": "3"})
b = BookingForm({"start": "x", "end": "3"})
print(a.is_valid(), dict(a.errors))
print(b.is_valid(), sorted(b.errors))`),
        output: "False {'end': ['End must be after start.']}\nFalse ['start']",
        why: '`add_error("end", ...)` attaches a cross-field error to a specific field and removes it from `cleaned_data`. In the second form `start` failed conversion, so `data.get("start")` is `None` and the comparison is skipped: always use `.get()` in `clean()`, since invalid fields are absent.',
      },
    ],
  ),
  ...b.fails(
    'dj-form-cleaned-data-too-early',
    2,
    '`cleaned_data` is created by validation.',
    [
      {
        key: 'before-is-valid',
        question: 'A view reads the form’s data and fails. Why?',
        code: djangoProgram(`from django import forms

class ContactForm(forms.Form):
    email = forms.EmailField()

form = ContactForm({"email": "ada@example.com"})
print(form.cleaned_data["email"])`),
        error: 'AttributeError',
        correct: '`cleaned_data` only exists after `is_valid()` (or `full_clean()`) has run.',
        wrong: [
          '`cleaned_data` is a method: call `form.cleaned_data()`.',
          'The email is invalid, so the key is missing and a `KeyError` follows.',
          'Forms must be bound with `request.POST`, not a dictionary.',
        ],
        why: 'Validation builds `cleaned_data`; before `is_valid()` the attribute does not exist (`AttributeError: \'ContactForm\' object has no attribute \'cleaned_data\'`). The usual pattern is `if form.is_valid(): use form.cleaned_data`. Any dictionary-like object can bind a form.',
      },
      {
        key: 'invalid-field-key',
        question: 'This code fails although it calls `is_valid()`. Why?',
        code: djangoProgram(`from django import forms

class ContactForm(forms.Form):
    email = forms.EmailField()

form = ContactForm({"email": "ada"})
form.is_valid()
print(form.cleaned_data["email"])`),
        error: 'KeyError',
        correct: 'The email is invalid, so it is not in `cleaned_data`; use the data only when `is_valid()` returned `True`.',
        wrong: [
          '`is_valid()` must be called twice to fill `cleaned_data`.',
          '`cleaned_data` uses the field label, not the field name, as the key.',
          '`EmailField` stores its value under `cleaned_data["email_address"]`.',
        ],
        why: 'Fields that fail validation are left out of `cleaned_data`. Ignoring the result of `is_valid()` turns a validation error into a crash (500) instead of a re-rendered form with the message.',
      },
    ],
  ),
  ...b.output(
    'dj-form-modelform',
    4,
    [
      'A ModelForm builds its fields from the model, including `blank`, `max_length` and uniqueness.',
      '`save(commit=False)` returns an unsaved instance.',
    ],
    [
      {
        key: 'unique',
        code: dbProgram(`from django import forms
from django.db import connection, models

class Account(models.Model):
    email = models.EmailField(unique=True)
    bio = models.TextField(blank=True)

    class Meta:
        app_label = "users"

class AccountForm(forms.ModelForm):
    class Meta:
        model = Account
        fields = ["email", "bio"]

with connection.schema_editor() as editor:
    editor.create_model(Account)

Account.objects.create(email="ada@example.com")
form = AccountForm({"email": "ada@example.com"})
print(form.is_valid(), form.errors["email"][0])
print(AccountForm({"email": "grace@example.com"}).is_valid())`),
        output: 'False Account with this Email already exists.\nTrue',
        why: 'ModelForm validation includes model validation, which checks `unique` fields with a query, so the duplicate is caught as a friendly form error instead of an `IntegrityError`. `bio` has `blank=True`, so the form does not require it.',
      },
      {
        key: 'commit-false',
        code: dbProgram(`from django import forms
from django.db import connection, models

class Note(models.Model):
    text = models.CharField(max_length=100)
    owner = models.CharField(max_length=30)

    class Meta:
        app_label = "notes"

class NoteForm(forms.ModelForm):
    class Meta:
        model = Note
        fields = ["text"]

with connection.schema_editor() as editor:
    editor.create_model(Note)

form = NoteForm({"text": "Buy milk", "owner": "mallory"})
form.is_valid()
note = form.save(commit=False)
print(note.pk, Note.objects.count())
note.owner = "ada"
note.save()
print(Note.objects.values_list("text", "owner").get())`),
        output: "None 0\n('Buy milk', 'ada')",
        why: '`commit=False` builds the instance without saving, so the view can set fields that do not come from the user (`owner` from `request.user`). Because `owner` is not in `fields`, the submitted `"mallory"` is ignored.',
      },
    ],
  ),
  ...b.codeChoice(
    'dj-form-mass-assignment',
    5,
    'Which fields can the submitted data set?',
    [
      {
        key: 'all-fields',
        question:
          'A profile page lets users edit their own profile with this form. A user submits the extra field shown. What is the problem, and the fix?',
        code: dbProgram(`from django import forms
from django.db import connection, models

class Profile(models.Model):
    display_name = models.CharField(max_length=50)
    is_moderator = models.BooleanField(default=False)

    class Meta:
        app_label = "community"

class ProfileForm(forms.ModelForm):
    class Meta:
        model = Profile
        fields = "__all__"

with connection.schema_editor() as editor:
    editor.create_model(Profile)

profile = Profile.objects.create(display_name="Ada")
form = ProfileForm({"display_name": "Ada L.", "is_moderator": "on"}, instance=profile)
form.is_valid()
form.save()
print(Profile.objects.get().is_moderator)`),
        correct:
          '`fields = "__all__"` exposes `is_moderator`, so users can promote themselves (the program prints `True`); list only the editable fields, `fields = ["display_name"]`.',
        wrong: [
          'There is no problem: the form ignores fields that are not rendered in the template.',
          'The problem is the missing CSRF token; with it, the extra field is rejected.',
          'Use `exclude = []` instead of `"__all__"`, which skips Boolean fields.',
        ],
        why: 'A ModelForm validates and saves every field in its `fields`, whatever the HTML shows; attackers can post any field name. An explicit allow list is the safe default (it is why Django requires `fields` or `exclude`). CSRF protection stops cross-site submissions, not a logged-in user editing their own request.',
      },
      {
        key: 'exclude-new-field',
        question:
          'The form uses `exclude`. Later a developer adds `is_verified` to the model. What happens?',
        code: dbProgram(`from django import forms
from django.db import connection, models

class Seller(models.Model):
    shop_name = models.CharField(max_length=50)
    is_verified = models.BooleanField(default=False)  # added later

    class Meta:
        app_label = "market"

class SellerForm(forms.ModelForm):
    class Meta:
        model = Seller
        exclude = []

print(list(SellerForm().fields))`),
        correct:
          'The new field is editable through the form automatically, because `exclude` only removes the fields it lists; prefer an explicit `fields` list.',
        wrong: [
          'New model fields are never added to an existing ModelForm until it is regenerated.',
          'The form raises `ImproperlyConfigured` because `exclude` is empty.',
          'Boolean fields are always excluded from ModelForms.',
        ],
        why: 'The program prints `[\'shop_name\', \'is_verified\']`. With `exclude`, every new model field becomes user-editable without anyone touching the form, which is how sensitive flags leak. `fields = [...]` keeps new fields out until someone deliberately adds them.',
      },
    ],
  ),
];
