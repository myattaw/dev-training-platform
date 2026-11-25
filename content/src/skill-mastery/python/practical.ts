import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Practical Python: JSON, CSV and text files, validation, money with Decimal,
 * grouping and aggregation, defensive programming.
 */

const b = programBuilders('python');

export const practicalFamilies: readonly QuestionSource[] = [
  ...b.output(
    'py-json-roundtrip',
    1,
    [
      '`json.dumps` turns Python objects into JSON text; `json.loads` parses JSON text into Python objects.',
      'JSON has no tuples, and object keys are always strings.',
    ],
    [
      {
        key: 'types',
        code: `import json

data = {"active": True, "manager": None, "tags": ("a", "b"), "score": 9.5}
text = json.dumps(data)
print(text)
print(json.loads(text)["tags"])`,
        output:
          '{"active": true, "manager": null, "tags": ["a", "b"], "score": 9.5}\n[\'a\', \'b\']',
        why: '`True` becomes `true`, `None` becomes `null` and a tuple becomes a JSON array. Parsing it back gives a list, not a tuple: a round trip does not preserve every Python type.',
      },
      {
        key: 'int-keys',
        code: `import json

stock = {1: "pen", 2: "ink"}
restored = json.loads(json.dumps(stock))
print(restored)
print(restored.get(1), restored.get("1"))`,
        output: "{'1': 'pen', '2': 'ink'}\nNone pen",
        why: 'JSON object keys are strings, so `dumps` converts the int keys and `loads` returns string keys. Lookups with the original int keys then miss.',
      },
    ],
  ),
  ...b.output(
    'py-csv-processing',
    2,
    [
      '`csv.DictReader` yields one dict per row, keyed by the header row.',
      'Every value read from CSV is a string until you convert it.',
    ],
    [
      {
        key: 'dictreader',
        code: `import csv
import io

data = io.StringIO("sku,qty,price\\nA1,2,3.50\\nB2,1,10.00\\n")
total = 0.0
for row in csv.DictReader(data):
    total += int(row["qty"]) * float(row["price"])
print(total)`,
        output: '17.0',
        why: 'Each row is a dict of strings such as `{"sku": "A1", "qty": "2", "price": "3.50"}`, so the numbers must be converted before the arithmetic.',
      },
      {
        key: 'quoted',
        code: `import csv
import io

data = io.StringIO('name,city\\n"Smith, Ana",Berlin\\n')
rows = list(csv.reader(data))
print(len(rows[1]), rows[1][0])
print(data.getvalue().splitlines()[1].split(","))`,
        output: "2 Smith, Ana\n['\"Smith', ' Ana\"', 'Berlin']",
        why: 'The `csv` module understands quoting, so the comma inside `"Smith, Ana"` stays in one field. A naive `split(",")` breaks the name into two pieces and keeps the quotes.',
      },
      {
        key: 'writer',
        code: `import csv
import io

out = io.StringIO()
writer = csv.DictWriter(out, fieldnames=["id", "note"], lineterminator="\\n")
writer.writeheader()
writer.writerow({"id": 1, "note": 'said "hi", left'})
print(out.getvalue(), end="")`,
        output: 'id,note\n1,"said ""hi"", left"',
        why: '`DictWriter` quotes a field containing commas or quotes and doubles the inner quotes, which is the standard CSV escaping. `lineterminator="\\n"` replaces the default `\\r\\n`.',
      },
    ],
  ),
  ...b.output(
    'py-text-file-lines',
    2,
    [
      'Iterating over a text file yields lines including their trailing newline.',
      'Strip each line, and skip blank ones explicitly.',
    ],
    [
      {
        key: 'newlines',
        code: `from pathlib import Path

path = Path("/tmp/names.txt")
path.write_text("ana\\nben\\n\\ncai\\n")
with path.open() as f:
    lines = list(f)
print(lines)
print([l.strip() for l in lines if l.strip()])`,
        output: "['ana\\n', 'ben\\n', '\\n', 'cai\\n']\n['ana', 'ben', 'cai']",
        why: 'Each line keeps its `\\n`, and the blank line is `"\\n"`, which is truthy. Stripping removes the newline and filtering on the stripped text drops blank lines.',
      },
      {
        key: 'read-splitlines',
        code: `from pathlib import Path

path = Path("/tmp/log.txt")
path.write_text("ok\\nfail\\nok\\n", encoding="utf-8")
text = path.read_text(encoding="utf-8")
print(text.split("\\n"))
print(text.splitlines().count("ok"))`,
        output: "['ok', 'fail', 'ok', '']\n2",
        why: '`split("\\n")` leaves an empty string after the final newline; `splitlines()` does not. Passing `encoding="utf-8"` explicitly avoids depending on the platform’s default encoding.',
      },
    ],
  ),
  ...b.fails(
    'py-json-errors',
    2,
    'JSON is stricter than Python literal syntax, and `json.dumps` only knows basic types.',
    [
      {
        key: 'single-quotes',
        question:
          'A config value was copied from Python code into a JSON parser. Why does it fail?',
        code: `import json

raw = "{'retries': 3, 'debug': False}"
config = json.loads(raw)
print(config)`,
        error: 'JSONDecodeError',
        correct:
          'JSON requires double-quoted strings and lowercase `false`; this is a Python dict literal, so `json.loads` raises `JSONDecodeError`',
        wrong: [
          'JSON does not support integer values',
          '`json.loads` needs a file, not a string',
          'Keys must be unquoted in JSON',
        ],
        why: 'The valid JSON is `{"retries": 3, "debug": false}`. `json.JSONDecodeError` is a subclass of `ValueError` and reports the line and column of the problem.',
      },
      {
        key: 'decimal-not-serializable',
        question: 'Why does serializing this invoice fail?',
        code: `import json
from decimal import Decimal

invoice = {"id": 7, "total": Decimal("19.90")}
print(json.dumps(invoice))`,
        error: 'TypeError',
        correct:
          '`json.dumps` cannot serialize `Decimal` objects; convert explicitly (for example `str(total)`) or pass a `default=` function',
        wrong: [
          'JSON numbers cannot have two decimal places',
          'The key `"id"` must be a string value',
          '`Decimal` must be imported from `json`',
        ],
        why: '`TypeError: Object of type Decimal is not JSON serializable`. The same happens for `datetime`, `set` and custom classes. Choose the representation deliberately; for money, a string avoids float rounding.',
      },
    ],
  ),
  ...b.outputChoice(
    'py-decimal-money',
    3,
    'Floats are binary approximations; `Decimal` built from strings is exact in base 10.',
    [
      {
        key: 'sum',
        code: `from decimal import Decimal

print(sum([0.10] * 3))
print(sum([Decimal("0.10")] * 3))`,
        correct: '0.30000000000000004\n0.30',
        wrong: ['0.3\n0.30', '0.30000000000000004\n0.3', '0.3\n0.3'],
        why: '`0.10` has no exact binary representation, so the float sum is slightly off. `Decimal("0.10")` is exact and keeps its two decimal places, so the sum prints `0.30`.',
      },
      {
        key: 'from-float',
        code: `from decimal import Decimal

print(Decimal("0.1") == Decimal(0.1))
print(Decimal(0.5), Decimal("1.10") + Decimal("2.2"))`,
        correct: 'False\n0.5 3.30',
        wrong: ['True\n0.5 3.30', 'False\n0.5 3.3', 'True\n0.50 3.3'],
        why: '`Decimal(0.1)` converts the float exactly, including its binary error (`0.1000000000000000055511...`), so it differs from `Decimal("0.1")`. `0.5` is exact in binary. Addition keeps the larger number of decimal places, giving `3.30`.',
      },
      {
        key: 'rounding',
        code: `from decimal import Decimal, ROUND_HALF_UP

amount = Decimal("2.675")
print(round(2.675, 2), amount.quantize(Decimal("0.01")), amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))`,
        correct: '2.67 2.68 2.68',
        wrong: ['2.68 2.68 2.68', '2.67 2.67 2.68', '2.68 2.67 2.68'],
        why: 'The float `2.675` is really slightly below 2.675, so `round` gives `2.67`. The exact `Decimal("2.675")` is a true half; the default rounding is half-to-even, which rounds to `2.68` here because 8 is even, and `ROUND_HALF_UP` also gives `2.68`.',
      },
    ],
  ),
  ...b.output(
    'py-grouping-aggregation',
    3,
    [
      'Group with a dict (or `defaultdict`) keyed by the grouping field, then aggregate each group.',
      'Sort the result explicitly when the order matters for a report.',
    ],
    [
      {
        key: 'sum-by-region',
        code: `from collections import defaultdict

sales = [
    {"region": "west", "amount": 120},
    {"region": "east", "amount": 80},
    {"region": "west", "amount": 30},
    {"region": "north", "amount": 80},
]
totals = defaultdict(int)
for sale in sales:
    totals[sale["region"]] += sale["amount"]
for region, total in sorted(totals.items(), key=lambda kv: (-kv[1], kv[0])):
    print(region, total)`,
        output: 'west 150\neast 80\nnorth 80',
        why: 'The `defaultdict(int)` starts each region at 0. Sorting by negative total gives the largest first, and the region name breaks the tie between `east` and `north`.',
      },
      {
        key: 'stats-per-group',
        code: `orders = [("ana", 30), ("ben", 50), ("ana", 70), ("ana", 20)]
stats = {}
for customer, amount in orders:
    s = stats.setdefault(customer, {"count": 0, "total": 0, "max": 0})
    s["count"] += 1
    s["total"] += amount
    s["max"] = max(s["max"], amount)
for customer in sorted(stats):
    s = stats[customer]
    print(customer, s["count"], s["total"] / s["count"], s["max"])`,
        output: 'ana 3 40.0 70\nben 1 50.0 50',
        why: 'One pass collects count, total and maximum per customer; the average is computed at the end. `/` always produces a float.',
      },
      {
        key: 'counter-top',
        code: `from collections import Counter

log = ["login", "view", "view", "buy", "view", "login"]
counts = Counter(log)
print(counts.most_common(1)[0], sum(counts.values()), counts["refund"])`,
        output: "('view', 3) 6 0",
        why: '`Counter` aggregates counts in one call; `most_common(1)` gives the top `(item, count)` pair, and a missing key counts as 0.',
      },
    ],
  ),
  ...b.blank(
    'py-validation-errors',
    3,
    'Collect every problem in a list instead of stopping at the first one, then decide.',
    [
      {
        key: 'collect',
        prompt: 'Complete the validator so it reports every problem with a record.',
        template: `def validate(record):
    errors = []
    if not record.get("email", "").count("@") == 1:
        errors.{{blank:method}}("invalid email")
    age = record.get("age")
    if not isinstance(age, int) {{blank:op}} age < 0:
        errors.append("invalid age")
    return errors

print(validate({"email": "ana@x.io", "age": 30}))
print(validate({"email": "bad", "age": -1}))
assert validate({"email": "ana@x.io", "age": 30}) == []
assert validate({"email": "bad", "age": "x"}) == ["invalid email", "invalid age"]`,
        blanks: { method: ['append'], op: ['or'] },
        why: 'Appending to `errors` lets a caller show all problems at once. The age check uses `or` with short-circuiting: if `age` is not an int, `age < 0` is never evaluated, which avoids a `TypeError` for strings or `None`.',
      },
      {
        key: 'raise',
        prompt: 'Raise an error carrying all problems when validation fails.',
        template: `class ValidationError(Exception):
    def __init__(self, errors):
        super().__init__("; ".join(errors))
        self.errors = errors

def parse_order(data):
    errors = []
    if "sku" not in data:
        errors.append("sku missing")
    if data.get("qty", 0) <= 0:
        errors.append("qty must be positive")
    if errors:
        {{blank:stmt}}
    return data["sku"], data["qty"]

try:
    parse_order({"qty": 0})
except ValidationError as e:
    print(e)
    assert e.errors == ["sku missing", "qty must be positive"]`,
        blanks: { stmt: ['raise ValidationError(errors)'] },
        why: 'Raising one exception that carries the full list separates detecting problems from presenting them. The message joins them for logs, and `e.errors` keeps the structured list for an API response.',
      },
    ],
  ),
  ...b.codeChoice(
    'py-defensive-input',
    4,
    'Validate external data at the boundary, and fail loudly with a clear message instead of guessing.',
    [
      {
        key: 'eafp',
        question: 'Which statement best describes this parsing function?',
        code: `def parse_quantity(raw):
    try:
        qty = int(raw)
    except (TypeError, ValueError):
        raise ValueError(f"quantity must be a whole number, got {raw!r}") from None
    if qty <= 0:
        raise ValueError(f"quantity must be positive, got {qty}")
    return qty

print(parse_quantity(" 3 "))`,
        correct:
          'It tries the conversion and translates failures into a clear `ValueError` (EAFP), then checks the business rule, so bad input never travels further',
        wrong: [
          'It should return `0` for invalid input so callers do not need error handling',
          'It is unsafe because `int(" 3 ")` raises `ValueError` for the spaces',
          'Catching `TypeError` is pointless because `int()` accepts any type',
        ],
        why: '"Easier to ask forgiveness than permission" is idiomatic Python: attempt the operation and handle the specific failure. `int()` tolerates surrounding whitespace, and `int(None)` raises `TypeError`, so catching both is right. Silent defaults like `0` turn bad data into wrong results.',
      },
      {
        key: 'nested-get',
        question:
          'An API sometimes omits `shipping` or sets it to `null`. Which lookup is safe and still reports missing data clearly?',
        code: `def shipping_city(order):
    shipping = order.get("shipping") or {}
    city = shipping.get("city")
    if not city:
        raise ValueError(f"order {order.get('id')} has no shipping city")
    return city

print(shipping_city({"id": 1, "shipping": {"city": "Lyon"}}))
for bad in [{"id": 2}, {"id": 3, "shipping": None}]:
    try:
        shipping_city(bad)
    except ValueError as e:
        print(e)`,
        correct:
          'The version shown: it treats a missing or `null` section as empty and then raises a specific error when the required city is absent',
        wrong: [
          '`order["shipping"]["city"]` inside a bare `try: ... except: return ""`',
          '`order.get("shipping", {}).get("city")`, which handles both cases',
          '`order.get("shipping").get("city", "unknown")`',
        ],
        why: '`get("shipping", {})` returns `None` when the key exists with a `null` value, so chaining `.get` on it fails with `AttributeError`. `or {}` covers both missing and `null`. A bare `except` returning `""` hides errors, and the last option crashes on a missing section.',
      },
    ],
  ),
  ...b.output(
    'py-json-customization',
    4,
    [
      '`default=` tells `json.dumps` how to convert unsupported objects; `sort_keys` and `indent` control the layout.',
      '`json.loads` accepts hooks such as `parse_float` and `object_hook` to control how values are decoded.',
    ],
    [
      {
        key: 'default',
        code: `import json
from datetime import date
from decimal import Decimal

def encode(obj):
    if isinstance(obj, (date, Decimal)):
        return str(obj)
    raise TypeError(f"cannot encode {type(obj).__name__}")

payload = {"total": Decimal("19.90"), "due": date(2026, 12, 1), "id": 7}
print(json.dumps(payload, default=encode, sort_keys=True))`,
        output: '{"due": "2026-12-01", "id": 7, "total": "19.90"}',
        why: '`default` is called only for objects `json` cannot handle; it returns something serializable. Raising `TypeError` for anything else keeps surprises visible. `sort_keys=True` makes the output stable.',
      },
      {
        key: 'parse-float',
        code: `import json
from decimal import Decimal

text = '{"items": [{"price": 1.10}, {"price": 2.20}]}'
data = json.loads(text, parse_float=Decimal)
print(sum(item["price"] for item in data["items"]))`,
        output: '3.30',
        why: '`parse_float=Decimal` makes the parser build `Decimal` values straight from the JSON text, so no float rounding happens and the trailing zero is kept.',
      },
      {
        key: 'separators',
        code: `import json

data = {"b": [1, 2], "a": "é"}
print(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
print(json.dumps(data["a"]))`,
        output: '{"b":[1,2],"a":"é"}\n"\\u00e9"',
        why: 'Compact separators remove the spaces. By default `ensure_ascii=True` escapes non-ASCII characters as `\\u` sequences; `ensure_ascii=False` writes them as they are.',
      },
    ],
  ),
  ...b.output(
    'py-money-pipeline',
    5,
    [
      'Keep money in `Decimal` from parsing to output, and round once, at the defined step, with an explicit rounding mode.',
      'Rounding each line and rounding the total can give different results.',
    ],
    [
      {
        key: 'line-vs-total',
        code: `from decimal import Decimal, ROUND_HALF_UP

CENT = Decimal("0.01")
lines = [Decimal("0.335"), Decimal("0.335"), Decimal("0.335")]
per_line = sum(l.quantize(CENT, rounding=ROUND_HALF_UP) for l in lines)
on_total = sum(lines).quantize(CENT, rounding=ROUND_HALF_UP)
print(per_line, on_total)`,
        output: '1.02 1.01',
        why: 'Each line rounds up from `0.335` to `0.34`, totaling `1.02`, while the exact total `1.005` rounds to `1.01`. Business rules (invoices, tax law) must define which one applies; the code should make that choice explicit.',
      },
      {
        key: 'csv-to-report',
        code: `import csv
import io
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_EVEN

raw = io.StringIO("""category,amount
books,12.345
toys,5.10
books,0.005
""")
totals = defaultdict(Decimal)
for row in csv.DictReader(raw):
    totals[row["category"]] += Decimal(row["amount"])
for category in sorted(totals):
    print(category, totals[category], totals[category].quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN))`,
        output: 'books 12.350 12.35\ntoys 5.10 5.10',
        why: '`defaultdict(Decimal)` starts each total at `Decimal("0")`. Parsing the CSV strings straight into `Decimal` keeps them exact: `12.345 + 0.005 = 12.350`, which already has a clean cent value. Converting through `float` first could introduce errors.',
      },
    ],
  ),
];
