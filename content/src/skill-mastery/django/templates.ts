import type { QuestionSource } from '@pracstack/content-model';
import { b, djangoProgram, html } from './program';

/*
 * Templates: variables and lookups, filters, loops and conditions, inheritance,
 * auto-escaping and template errors. Templates are rendered for real with
 * django.template.Engine (auto-escaping on, as in a project).
 */

/** A Python string literal, single-quoted unless the text contains a single quote. */
const py = (s: string) => (s.includes("'") ? JSON.stringify(s) : `'${s.replace(/\\/g, '\\\\')}'`);

/** A program that renders one template string with a context. */
const render = (template: string, context: string, before = '') =>
  djangoProgram(`from django.template import Context, Engine
${before ? `\n${before.trim()}\n` : ''}
template = Engine().from_string(${py(template)})
print(template.render(Context(${context})))`);

/** A program with named templates in memory (for extends and include). */
const renderFiles = (files: Record<string, string>, name: string, context: string) =>
  djangoProgram(`from django.template import Context, Engine

templates = {
${Object.entries(files)
  .map(([k, v]) => `    ${py(k)}: ${py(v)},`)
  .join('\n')}
}
engine = Engine(loaders=[("django.template.loaders.locmem.Loader", templates)])
print(engine.get_template(${py(name)}).render(Context(${context})))`);

export const templatesFamilies: readonly QuestionSource[] = [
  ...b.output(
    'dj-tpl-variables',
    1,
    [
      'The dot tries a dictionary key, then an attribute, then a list index.',
      'A missing variable does not raise an error in a template.',
    ],
    [
      {
        key: 'dot-lookup',
        code: render(
          '{{ user.name }} has {{ tags.0 }} and {{ stats.count }}',
          '{"user": {"name": "Ada"}, "tags": ["admin", "staff"], "stats": Stats()}',
          `class Stats:
    count = 3`,
        ),
        output: 'Ada has admin and 3',
        why: '`user.name` is a dictionary key, `tags.0` a list index and `stats.count` an attribute. Template syntax uses the dot for all three; Python’s `["name"]` and `[0]` are not allowed in templates.',
      },
      {
        key: 'missing',
        code: render('Hello {{ name }}! [{{ title }}]', '{"name": "Ada"}'),
        output: 'Hello Ada! []',
        why: 'A variable that is not in the context renders as an empty string (the engine’s `string_if_invalid`, empty by default). That keeps pages rendering, but it also hides typos, so test the important values.',
      },
      {
        key: 'method',
        code: render(
          '{{ cart.total }} / {{ name.upper }}',
          '{"cart": Cart(), "name": "ada"}',
          `class Cart:
    def total(self):
        return 42`,
        ),
        output: '42 / ADA',
        why: 'If a lookup finds a callable, the template calls it without arguments, so `cart.total` renders `42` and `name.upper` calls `str.upper()`. You never write parentheses in template variables.',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-tpl-filters',
    2,
    'Each filter transforms the value on its left; check what counts as "empty" for each one.',
    [
      {
        key: 'default',
        code: render(
          '{{ a|default:"-" }} {{ b|default:"-" }} {{ c|default_if_none:"-" }}',
          '{"a": "", "b": 0, "c": ""}',
        ),
        correct: '- - ',
        wrong: ['- 0 -', '  -', '- - -'],
        why: '`default` applies to any falsy value, so both `""` and `0` become `-`. `default_if_none` only replaces `None`; the empty string `c` stays empty. Use `default_if_none` when `0` or `""` are meaningful values.',
      },
      {
        key: 'chain',
        code: render('{{ tags|join:", "|upper }} ({{ tags|length }})', '{"tags": ["web", "api"]}'),
        correct: 'WEB, API (2)',
        wrong: ['web, api (2)', "['WEB', 'API'] (2)", 'WEB, API (7)'],
        why: 'Filters are applied left to right: `join` turns the list into `"web, api"`, then `upper` capitalizes the string. `length` on the list counts its elements.',
      },
      {
        key: 'pluralize',
        code: render(
          '{{ n }} item{{ n|pluralize }}, {{ m }} box{{ m|pluralize:"es" }}',
          '{"n": 1, "m": 3}',
        ),
        correct: '1 item, 3 boxes',
        wrong: ['1 items, 3 boxes', '1 item, 3 boxs', '1 item, 3 boxes(es)'],
        why: '`pluralize` adds `s` unless the value is 1; an argument gives a different suffix, here `es`.',
      },
    ],
  ),
  ...b.output(
    'dj-tpl-loops-conditions',
    2,
    [
      '`{% empty %}` renders when the loop has nothing to iterate over.',
      '`forloop` holds counters and first/last flags for the current loop.',
    ],
    [
      {
        key: 'forloop',
        code: render(
          '{% for t in tasks %}{{ forloop.counter }}.{{ t }}{% if not forloop.last %}, {% endif %}{% endfor %}',
          '{"tasks": ["plan", "build", "ship"]}',
        ),
        output: '1.plan, 2.build, 3.ship',
        why: '`forloop.counter` starts at 1 (`counter0` starts at 0), and `forloop.last` is true on the final iteration, so no separator follows `ship`.',
      },
      {
        key: 'empty',
        code: render(
          '{% for o in orders %}{{ o }} {% empty %}No orders{% endfor %}|{% if orders %}has{% else %}none{% endif %}',
          '{"orders": []}',
        ),
        output: 'No orders|none',
        why: 'An empty list makes the loop render its `{% empty %}` part, and an empty list is false in `{% if %}`, like in Python.',
      },
      {
        key: 'if-operators',
        code: render(
          '{% if score >= 90 %}A{% elif score >= 75 and not late %}B{% else %}C{% endif %} {% if "x" in tags %}x{% endif %}',
          '{"score": 80, "late": False, "tags": ["x", "y"]}',
        ),
        output: 'B x',
        why: '`{% if %}` supports comparisons, `and`, `or`, `not` and `in`. 80 is not at least 90, but it is at least 75 and `late` is false, so the `elif` branch renders `B`.',
      },
    ],
  ),
  ...b.output(
    'dj-tpl-inheritance',
    3,
    [
      'A child template only fills blocks that the parent defines.',
      '`{{ block.super }}` inserts the parent’s content of the same block.',
    ],
    [
      {
        key: 'override',
        code: renderFiles(
          {
            'base.html': '[{% block title %}Site{% endblock %}] {% block body %}{% endblock %}',
            'page.html': '{% extends "base.html" %}{% block body %}Hi {{ name }}{% endblock %}',
          },
          'page.html',
          '{"name": "Ada"}',
        ),
        output: '[Site] Hi Ada',
        why: 'The child overrides `body` only; `title` keeps the parent’s default content `Site`. The child’s blocks are rendered with the same context.',
      },
      {
        key: 'block-super',
        code: renderFiles(
          {
            'base.html': '{% block nav %}Home{% endblock %}',
            'docs.html':
              '{% extends "base.html" %}{% block nav %}{{ block.super }} > Docs{% endblock %}',
          },
          'docs.html',
          '{}',
        ),
        output: 'Home > Docs',
        why: '`{{ block.super }}` renders the parent’s version of the block, so the child extends the navigation instead of replacing it.',
      },
      {
        key: 'outside-blocks',
        code: renderFiles(
          {
            'base.html': '<main>{% block content %}{% endblock %}</main>',
            'page.html':
              '{% extends "base.html" %}Lost text {% block content %}Kept{% endblock %} more lost text',
          },
          'page.html',
          '{}',
        ),
        output: '<main>Kept</main>',
        why: 'When a template extends another, only its blocks are used: anything outside `{% block %}` tags is ignored. That is a common reason for "my content does not show up".',
      },
    ],
  ),
  ...b.outputChoice(
    'dj-tpl-autoescape',
    3,
    'Django escapes variables by default; marking a value safe turns that protection off for it.',
    [
      {
        key: 'escaped',
        code: render('<p>{{ comment }}</p>', '{"comment": "<script>alert(1)</script>"}'),
        correct: '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
        wrong: ['<p><script>alert(1)</script></p>', '<p>alert(1)</p>', '<p></p>'],
        why: 'Auto-escaping converts `<`, `>`, `&`, `"` and `\'` in variable output to HTML entities, so the comment is displayed as text instead of running as a script. That is Django’s main defense against cross-site scripting (XSS). Tags are not stripped; they are escaped.',
      },
      {
        key: 'safe-filter',
        code: render('<p>{{ comment|safe }}</p>', '{"comment": "<b>hi</b>"}'),
        correct: '<p><b>hi</b></p>',
        wrong: ['<p>&lt;b&gt;hi&lt;/b&gt;</p>', '<p>hi</p>', '<p>&amp;lt;b&amp;gt;hi</p>'],
        why: '`|safe` marks the value as safe HTML, so it is inserted unescaped. That is only acceptable for HTML you produced or sanitized yourself; with user input it reopens the XSS hole.',
      },
      {
        key: 'quotes',
        code: render('<a title="{{ name }}">x</a>', `{"name": 'Bob" onmouseover="steal()'}`),
        correct: '<a title="Bob&quot; onmouseover=&quot;steal()">x</a>',
        wrong: [
          '<a title="Bob" onmouseover="steal()">x</a>',
          '<a title="Bob">x</a>',
          '<a title="Bob\\" onmouseover=\\"steal()">x</a>',
        ],
        why: 'Escaping also converts double quotes to `&quot;`, so a value cannot break out of a quoted attribute and add an event handler. (Unquoted attributes are not protected this way; always quote them.)',
      },
      {
        key: 'mark-safe',
        code: render(
          '{{ a }} {{ b }}',
          '{"a": "<i>x</i>", "b": mark_safe("<i>y</i>")}',
          'from django.utils.safestring import mark_safe',
        ),
        correct: '&lt;i&gt;x&lt;/i&gt; <i>y</i>',
        wrong: [
          '<i>x</i> <i>y</i>',
          '&lt;i&gt;x&lt;/i&gt; &lt;i&gt;y&lt;/i&gt;',
          '<i>x</i> &lt;i&gt;y&lt;/i&gt;',
        ],
        why: '`mark_safe()` in Python has the same effect as `|safe` in the template: the value is inserted as is. Ordinary strings are still escaped.',
      },
    ],
  ),
  ...b.codeChoice(
    'dj-tpl-xss-fix',
    4,
    'Keep escaping on for user data; build HTML with helpers that escape the parts.',
    [
      {
        key: 'format-html',
        question:
          'A helper builds a link from a user-supplied name. It renders correctly but a reviewer flags it. What is the best fix?',
        code: djangoProgram(`from django.utils.safestring import mark_safe

def user_link(user_id, name):
    return mark_safe(f'<a href="/u/{user_id}/">{name}</a>')

print(user_link(7, "<img src=x onerror=steal()>"))`),
        correct:
          'Use `format_html(\'<a href="/u/{}/">{}</a>\', user_id, name)`, which escapes the arguments and marks only the result safe.',
        wrong: [
          'Wrap the result in `str()` so the template escapes it again.',
          'Keep `mark_safe()` and add `|safe` in the template to be explicit.',
          'Replace `mark_safe()` with `escape()` around the whole f-string.',
        ],
        why: '`mark_safe()` on an f-string trusts the user’s `name`, so the `<img onerror>` payload runs. `format_html()` escapes each argument and returns a safe string, so the link works and the name is shown as text. `str()` of a safe string is still safe; escaping the whole string would escape the `<a>` tag too and show raw HTML.',
      },
      {
        key: 'json-script',
        question: 'A template must pass user data to JavaScript. Which approach is safe?',
        code: render(
          '{{ profile|json_script:"profile-data" }}',
          '{"profile": {"bio": "</script><script>steal()</script>"}}',
        ),
        correct:
          'This one: `json_script` outputs the value as JSON inside a `<script type="application/json">` tag with `<`, `>` and `&` escaped, and the page reads it with `JSON.parse`.',
        wrong: [
          'Writing `<script>var bio = "{{ profile.bio|safe }}";</script>` is safe because the value is in a JavaScript string.',
          'Writing `<script>var bio = "{{ profile.bio }}";</script>` is safe because HTML escaping also escapes JavaScript.',
          'Passing data to JavaScript is impossible in Django templates; an API endpoint is required.',
        ],
        why: 'The program shows `json_script` turning `</script>` into `\\u003C/script\\u003E`, so the payload cannot close the tag. HTML escaping is the wrong escaping for JavaScript contexts, and `|safe` lets `</script>` end the script block early. An API is one option, but not the only safe one.',
      },
    ],
  ),
  ...b.fails(
    'dj-tpl-errors',
    4,
    'Template syntax errors are raised when the template is compiled, not when a variable is missing.',
    [
      {
        key: 'unclosed-for',
        question: 'This template raises an error. Why?',
        code: render('{% for item in items %}{{ item }}', '{"items": [1, 2]}'),
        error: 'TemplateSyntaxError',
        correct: 'The `{% for %}` tag has no matching `{% endfor %}`.',
        wrong: [
          '`items` must be passed as a `QuerySet`.',
          'Loop variables must be declared with `{% with %}` first.',
          'Block tags must each be on their own line.',
        ],
        why: "Compiling the template fails with `TemplateSyntaxError: Unclosed tag ... 'for'. Looking for one of: empty, endfor.` Any iterable works for the loop, and tags do not need their own lines.",
      },
      {
        key: 'unknown-filter',
        question: 'This template raises an error. Why?',
        code: render('{{ price|currency }}', '{"price": 9}'),
        error: 'TemplateSyntaxError',
        correct:
          'There is no built-in `currency` filter; a custom filter must be registered in a template library and loaded with `{% load %}`.',
        wrong: [
          'Filters cannot be applied to numbers.',
          'Filters need parentheses: `{{ price|currency() }}`.',
          'An unknown filter renders as an empty string, so the error comes from `price`.',
        ],
        why: "An unknown filter is a syntax error (`Invalid filter: 'currency'`), unlike a missing variable. Custom filters live in a `templatetags` module and are made available with `{% load your_library %}`.",
      },
      {
        key: 'extends-not-first',
        question: 'This template raises an error. Why?',
        code: renderFiles(
          {
            'base.html': '{% block body %}{% endblock %}',
            'page.html':
              '{% load static %}{% block body %}x{% endblock %}{% extends "base.html" %}',
          },
          'page.html',
          '{}',
        ),
        error: 'TemplateSyntaxError',
        correct: '`{% extends %}` must be the first template tag in the template.',
        wrong: [
          '`{% load %}` cannot be used in a template that extends another.',
          'The block name `body` is reserved.',
          'The base template must be loaded with `{% include %}` instead.',
        ],
        why: 'Django raises `<ExtendsNode: extends "base.html"> must be the first tag in the template.` Put `{% extends %}` first and `{% load %}` after it. `{% include %}` inserts a template; it does not provide inheritance.',
      },
    ],
  ),
  ...b.output(
    'dj-tpl-calls-and-alters-data',
    5,
    [
      'A template can only call methods that take no arguments.',
      'Methods marked `alters_data = True` are never called from a template.',
    ],
    [
      {
        key: 'arguments-and-alters-data',
        code: render(
          '[{{ order.total }}] [{{ order.discounted }}] [{{ order.delete }}]',
          '{"order": order}',
          `class Order:
    def total(self):
        return 100

    def discounted(self, percent):
        return 100 - percent

    def delete(self):
        print("deleted!")
    delete.alters_data = True

order = Order()`,
        ),
        output: '[100] [] []',
        why: '`discounted` needs an argument, so the lookup fails silently and renders the empty `string_if_invalid`. `delete` is marked `alters_data` (as Django’s `Model.delete()` and `save()` are), so the template refuses to call it: nothing is printed and nothing is deleted. Templates should display data, not change it.',
      },
      {
        key: 'do-not-call',
        code: render(
          '{{ Status.OPEN }} {{ Status.do_not_call_in_templates }} {{ factory.name }}',
          '{"Status": Status, "factory": Factory}',
          `class Status:
    OPEN = "open"
    do_not_call_in_templates = True

class Factory:
    name = "class attribute"

    def __init__(self):
        self.name = "instance attribute"`,
        ),
        output: 'open True instance attribute',
        why: 'Classes are callable, so the template calls `Factory()` and then reads `name` on the new instance. `do_not_call_in_templates = True` (which Django’s enumeration types set) stops that, so `Status.OPEN` is read from the class itself.',
      },
    ],
  ),
  ...b.concept(
    'dj-tpl-where-logic-goes',
    2,
    'Templates present data; views and models compute it.',
    [
      {
        key: 'query-in-template',
        question:
          'A template shows each order’s customer with `{{ order.customer.name }}` inside a loop over 200 orders, and the page is slow. Where should this be fixed?',
        snippet: html(`{% for order in orders %}
  <li>{{ order.id }}: {{ order.customer.name }}</li>
{% endfor %}`),
        correct:
          'In the view: fetch the orders with `select_related("customer")` so the template’s lookups do not run one query per order.',
        wrong: [
          'In the template: wrap the loop in `{% cache %}` so the queries run in parallel.',
          'In the template: replace the dot lookup with `{{ order["customer"]["name"] }}`.',
          'Nowhere: templates evaluate lookups without database queries.',
        ],
        why: 'Each `order.customer` access loads the related row lazily, one query per order (the N+1 problem). Templates cannot fix that; the queryset passed by the view should load the relation up front. Python subscript syntax is not valid in templates, and caching a slow page hides rather than fixes the queries.',
      },
    ],
  ),
];
