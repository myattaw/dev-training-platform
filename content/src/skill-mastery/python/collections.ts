import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Collections: lists, tuples, dicts and sets; mutability, aliasing and copying.
 */

const b = programBuilders('python');

// ---------------------------------------------------------------- Lists, tuples, dicts and sets

export const collectionsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'py-list-operations',
    1,
    [
      '`append` adds one item (whatever it is); `extend` adds each item of an iterable.',
      '`pop()` removes and returns the last item; `pop(i)` removes index `i`.',
    ],
    [
      {
        key: 'append-extend',
        code: `items = [1, 2]
items.append([3, 4])
items.extend([5, 6])
print(items, len(items))`,
        output: '[1, 2, [3, 4], 5, 6] 5',
        why: '`append` adds its argument as a single element, so the list `[3, 4]` becomes one nested item. `extend` iterates its argument and adds `5` and `6` separately, giving 5 elements in total.',
      },
      {
        key: 'pop-insert',
        code: `queue = ["a", "b", "c"]
last = queue.pop()
first = queue.pop(0)
queue.insert(0, "z")
print(last, first, queue)`,
        output: "c a ['z', 'b']",
        why: '`pop()` takes the last item (`"c"`), `pop(0)` the first (`"a"`), leaving `["b"]`. `insert(0, "z")` puts `"z"` in front.',
      },
      {
        key: 'extend-string',
        code: `letters = ["x"]
letters.extend("yz")
letters += "w"
print(letters)`,
        output: "['x', 'y', 'z', 'w']",
        why: 'A string is an iterable of characters, so `extend("yz")` adds `"y"` and `"z"`. `+=` on a list behaves like `extend`, so it also iterates the string. Use `append` to add a whole string as one item.',
      },
    ],
  ),
  ...b.outputChoice(
    'py-sort-returns-none',
    1,
    'Methods that change a list in place return `None`.',
    [
      {
        key: 'sort',
        code: `scores = [30, 10, 20]
result = scores.sort()
print(result, scores)`,
        correct: 'None [10, 20, 30]',
        wrong: ['[10, 20, 30] [10, 20, 30]', '[10, 20, 30] [30, 10, 20]', 'None [30, 10, 20]'],
        why: '`list.sort()` sorts the list in place and returns `None`, so `result` is `None`. Use `sorted(scores)` to get a new sorted list and keep the original.',
      },
      {
        key: 'sorted',
        code: `scores = [30, 10, 20]
ranked = sorted(scores, reverse=True)
print(ranked, scores)`,
        correct: '[30, 20, 10] [30, 10, 20]',
        wrong: ['[30, 20, 10] [30, 20, 10]', 'None [30, 20, 10]', '[10, 20, 30] [30, 10, 20]'],
        why: '`sorted()` returns a new list and leaves its argument unchanged. `reverse=True` sorts from largest to smallest.',
      },
      {
        key: 'reverse',
        code: `names = ["a", "b", "c"]
names = names.reverse()
print(names)`,
        correct: 'None',
        wrong: ["['c', 'b', 'a']", "['a', 'b', 'c']", 'AttributeError'],
        why: '`reverse()` reverses in place and returns `None`; assigning its result back to `names` loses the list. Call `names.reverse()` on its own line, or use `names[::-1]` or `list(reversed(names))` for a new list.',
      },
    ],
  ),
  ...b.outputChoice('py-tuples', 2, 'The comma makes a tuple, not the parentheses.', [
    {
      key: 'single',
      code: `a = (5)
b = (5,)
print(type(a).__name__, type(b).__name__, len(b))`,
      correct: 'int tuple 1',
      wrong: ['tuple tuple 1', 'int int 1', 'tuple tuple 2'],
      why: 'Parentheses alone only group an expression, so `(5)` is the int `5`. A one-element tuple needs a trailing comma: `(5,)`.',
    },
    {
      key: 'without-parens',
      code: `point = 3, 4
x, y = point
print(point, x + y)`,
      correct: '(3, 4) 7',
      wrong: ['3 7', '[3, 4] 7', '(3, 4) 34'],
      why: '`3, 4` creates a tuple even without parentheses, and unpacking assigns its items to `x` and `y`. Tuples print with parentheses.',
    },
    {
      key: 'trailing-comma-bug',
      code: `total = 10 + 5,
print(total)`,
      correct: '(15,)',
      wrong: ['15', '(10, 5)', 'SyntaxError'],
      why: 'The trailing comma turns the right side into a one-element tuple. This is a classic bug after copying a line out of a function call or a list.',
    },
  ]),
  ...b.output(
    'py-set-operations',
    2,
    [
      '`|` is union, `&` intersection, `-` difference and `^` symmetric difference.',
      'Sets drop duplicates; `sorted()` turns a set into a sorted list for stable output.',
    ],
    [
      {
        key: 'operators',
        code: `backend = {"python", "sql", "docker"}
frontend = {"typescript", "css", "docker"}
print(sorted(backend & frontend))
print(sorted(backend - frontend))
print(len(backend | frontend))`,
        output: "['docker']\n['python', 'sql']\n5",
        why: '`&` keeps elements in both sets, `-` keeps elements of the left set not in the right one, and `|` combines both without duplicates: 3 + 3 - 1 shared = 5.',
      },
      {
        key: 'dedupe',
        code: `visits = ["home", "cart", "home", "pay", "cart"]
print(len(visits), len(set(visits)))
print(sorted(set(visits)))`,
        output: "5 3\n['cart', 'home', 'pay']",
        why: 'Converting to a set removes duplicates. A set has no defined order for strings, so the program sorts it before printing. To keep first-seen order instead, use `list(dict.fromkeys(visits))`.',
      },
      {
        key: 'symmetric',
        code: `before = {1, 2, 3, 4}
after = {3, 4, 5}
print(sorted(before ^ after))
print(before <= {1, 2, 3, 4, 5}, after.isdisjoint({1, 2}))`,
        output: '[1, 2, 5]\nTrue True',
        why: '`^` keeps elements in exactly one of the sets. `<=` tests for a subset, and `isdisjoint` is `True` when there are no common elements.',
      },
    ],
  ),
  ...b.fails('py-dict-missing-key', 2, 'Square-bracket lookup requires the key to exist.', [
    {
      key: 'lookup',
      question: 'Why does this program fail?',
      code: `stock = {"apple": 3, "pear": 0}
print(stock["pear"])
print(stock["plum"])`,
      error: 'KeyError',
      correct:
        '`stock["plum"]` raises `KeyError` because the key is missing; use `stock.get("plum", 0)` or test `"plum" in stock` first',
      wrong: [
        '`stock["pear"]` fails because its value is `0`',
        '`stock["plum"]` returns `None` and printing `None` fails',
        'It raises `IndexError` because the dict has only two entries',
      ],
      why: 'A key with a falsy value like `0` still exists, so `stock["pear"]` prints `0`. A missing key raises `KeyError` (not `IndexError`, which is for sequences). `dict.get` returns a default instead.',
    },
    {
      key: 'counting',
      question: 'This word counter fails on the first word. What is the fix?',
      code: `counts = {}
for word in "to be or not to be".split():
    counts[word] += 1
print(counts)`,
      error: 'KeyError',
      correct:
        '`counts[word] += 1` reads the missing key first; use `counts[word] = counts.get(word, 0) + 1`, a `defaultdict(int)` or `collections.Counter`',
      wrong: [
        'Use `counts[word] =+ 1` instead',
        'Initialize with `counts = []` because dicts cannot be incremented',
        'Replace `+=` with `counts.update(word)`',
      ],
      why: '`counts[word] += 1` means `counts[word] = counts[word] + 1`, and the read fails for a new word. `=+ 1` would just assign `+1`, and `update(word)` expects a mapping or pairs. `Counter(words)` does the whole job.',
    },
  ]),
  ...b.output(
    'py-dict-methods',
    3,
    [
      'Dicts keep insertion order; updating an existing key does not move it.',
      '`a | b` merges with the right-hand values winning; `setdefault` inserts only when the key is missing.',
    ],
    [
      {
        key: 'merge',
        code: `defaults = {"theme": "light", "lang": "en", "size": 12}
user = {"size": 14, "beta": True}
print(defaults | user)`,
        output: "{'theme': 'light', 'lang': 'en', 'size': 14, 'beta': True}",
        why: '`|` (Python 3.9+) creates a new dict: keys from the left first, values from the right overriding. `"size"` keeps its original position with the new value, and the new key `"beta"` goes at the end.',
      },
      {
        key: 'setdefault',
        code: `groups = {}
for name, team in [("ann", "red"), ("bo", "blue"), ("cy", "red")]:
    groups.setdefault(team, []).append(name)
print(groups)`,
        output: "{'red': ['ann', 'cy'], 'blue': ['bo']}",
        why: '`setdefault(key, default)` returns the existing value, or inserts the default and returns it. The returned list is the one stored in the dict, so `append` updates the group directly.',
      },
      {
        key: 'items-order',
        code: `prices = {"b": 2, "a": 1}
prices["c"] = 3
prices["b"] = 20
for key, value in prices.items():
    print(key, value)`,
        output: 'b 20\na 1\nc 3',
        why: 'Since Python 3.7, dicts iterate in insertion order. Reassigning `"b"` changes its value but not its position; `"c"` was added last.',
      },
    ],
  ),
  ...b.fails(
    'py-unhashable-keys',
    3,
    'Dict keys and set elements must be hashable, which rules out mutable built-ins like lists.',
    [
      {
        key: 'list-key',
        question: 'Why does this program fail?',
        code: `visited = {}
route = ["A", "B"]
visited[route] = True
print(visited)`,
        error: 'TypeError',
        correct:
          'A list is mutable and unhashable, so it cannot be a dict key; use a tuple: `visited[tuple(route)] = True`',
        wrong: [
          'Dict keys must be strings',
          'A list can be a key only if it is not empty',
          '`visited` must be created with `dict()` instead of `{}`',
        ],
        why: "Dicts locate keys by hash, and a key’s hash must never change. Lists can change, so they define no hash and raise `TypeError: unhashable type: 'list'`. Tuples, strings, numbers and frozensets work.",
      },
      {
        key: 'tuple-with-list',
        question: 'Tuples are hashable, so why does this fail?',
        code: `seen = set()
seen.add(("order-1", ["pen", "ink"]))
print(len(seen))`,
        error: 'TypeError',
        correct:
          'A tuple is hashable only if all its items are; this one contains a list, so `add` raises `TypeError`',
        wrong: [
          'Sets cannot contain tuples',
          '`set()` creates an empty dict, which has no `add` method',
          'Tuples are never hashable; only strings and numbers are',
        ],
        why: "Hashing a tuple hashes each item, and the list inside raises `TypeError: unhashable type: 'list'`. Use a tuple of tuples (or a frozenset) for the inner value. `set()` really is an empty set; `{}` would be the empty dict.",
      },
      {
        key: 'set-of-sets',
        question: 'Why does this program fail?',
        code: `teams = set()
teams.add({"ann", "bo"})
print(len(teams))`,
        error: 'TypeError',
        correct:
          'A `set` is mutable and unhashable, so it cannot be an element of another set; use `frozenset({"ann", "bo"})`',
        wrong: [
          'Sets cannot contain strings',
          '`add` accepts only one element, and the argument contains two',
          'Sets are hashable, but nested sets are limited to one level',
        ],
        why: '`frozenset` is the immutable, hashable version of `set` and exists exactly for this. `add` adds its argument as one element; to add several elements use `update`.',
      },
    ],
  ),
  ...b.outputChoice(
    'py-modify-while-iterating',
    4,
    'Changing a collection while a `for` loop iterates over it gives surprising results or errors.',
    [
      {
        key: 'remove-skips',
        code: `nums = [1, 2, 2, 3, 4]
for n in nums:
    if n % 2 == 0:
        nums.remove(n)
print(nums)`,
        correct: '[1, 2, 3]',
        wrong: ['[1, 3]', '[1, 3, 4]', 'RuntimeError'],
        why: 'The loop tracks an index. Removing the first `2` shifts the second `2` into the current slot, so the loop skips it. Then `4` is reached and removed. Build a new list instead: `[n for n in nums if n % 2 != 0]`.',
      },
      {
        key: 'append-grows',
        code: `tasks = ["a", "b"]
count = 0
for t in tasks:
    count += 1
    if count < 4:
        tasks.append(t + "!")
print(count, len(tasks))`,
        correct: '5 5',
        wrong: ['2 4', '2 5', '4 5'],
        why: 'A list iterator checks the current length on each step, so items appended during the loop are visited too. Three appends happen (while `count < 4`), the list reaches 5 items, and the loop visits all 5.',
      },
      {
        key: 'dict-size',
        code: `stock = {"pen": 0, "ink": 4, "pad": 0}
try:
    for item in stock:
        if stock[item] == 0:
            del stock[item]
except RuntimeError:
    print("RuntimeError")
print(len(stock))`,
        correct: 'RuntimeError\n2',
        wrong: ['1', 'RuntimeError\n3', '2'],
        why: 'Deleting from a dict while iterating over it raises `RuntimeError: dictionary changed size during iteration` on the next step. The first deletion already happened, so 2 items remain. Iterate over a copy (`list(stock)`) or build a new dict with a comprehension.',
      },
    ],
  ),
  ...b.output(
    'py-collections-module',
    4,
    [
      '`Counter` counts hashable items, `defaultdict` creates missing values with a factory, `deque` is a double-ended queue.',
      '`most_common` orders by count, keeping first-seen order for ties.',
    ],
    [
      {
        key: 'counter',
        code: `from collections import Counter
votes = Counter(["red", "blue", "red", "green", "blue", "red"])
print(votes.most_common(2))
print(votes["purple"])`,
        output: "[('red', 3), ('blue', 2)]\n0",
        why: '`most_common(2)` returns the two highest counts as `(item, count)` pairs. Looking up a missing item in a `Counter` returns `0` instead of raising `KeyError`, and it does not insert the key.',
      },
      {
        key: 'defaultdict',
        code: `from collections import defaultdict
by_initial = defaultdict(list)
for name in ["ada", "alan", "bob"]:
    by_initial[name[0]].append(name)
print(dict(by_initial))
print(len(by_initial["z"]), len(by_initial))`,
        output: "{'a': ['ada', 'alan'], 'b': ['bob']}\n0 3",
        why: 'A `defaultdict(list)` calls `list()` for a missing key, so grouping needs no checks. Beware: merely reading `by_initial["z"]` inserts an empty list, which is why the length becomes 3.',
      },
      {
        key: 'deque',
        code: `from collections import deque
recent = deque(maxlen=3)
for page in ["home", "cart", "pay", "done"]:
    recent.append(page)
recent.appendleft("start")
print(list(recent))`,
        output: "['start', 'cart', 'pay']",
        why: 'A bounded `deque` drops items from the opposite end when it is full. After four appends it holds `cart, pay, done`; `appendleft` adds `start` on the left and drops `done` from the right.',
      },
    ],
  ),
  ...b.multi(
    'py-choose-collection',
    3,
    'Think about order, duplicates, mutability and lookup speed.',
    [
      {
        key: 'statements',
        question: 'Select every true statement about Python’s built-in collections.',
        correct: [
          'Checking `x in some_set` takes about the same time however large the set is, while `x in some_list` scans the list',
          'A `tuple` is a good fit for a fixed-size record such as `(latitude, longitude)` and can be used as a dict key',
          'Dicts preserve insertion order',
        ],
        wrong: [
          'Sets keep their elements in insertion order',
          'A `list` cannot hold values of different types',
          'Dicts allow duplicate keys; the latest value is returned first',
        ],
        why: 'Set and dict membership is a hash lookup (average constant time), list membership is a linear scan. Tuples are immutable and hashable when their items are. Dicts (not sets) keep insertion order since Python 3.7. Lists may mix types, and a dict key appears only once.',
      },
      {
        key: 'pick',
        question:
          'You need to store users’ email addresses, reject duplicates and check quickly whether an address is already registered. Which choices are reasonable?',
        code: `registered = set()
for email in ["a@x.io", "b@x.io", "a@x.io"]:
    if email in registered:
        print("duplicate", email)
    registered.add(email)
print(len(registered))`,
        correct: ['A `set` of addresses', 'A `dict` mapping each address to the user’s data'],
        wrong: [
          'A `list` with `append` and `in` checks, since it is the fastest option',
          'A `tuple`, rebuilt for every new address',
        ],
        why: 'Sets and dicts both give fast membership tests and unique keys; a dict also stores data per address. A list works but checks membership with a linear scan, and a tuple would need copying on every insert.',
      },
    ],
  ),
  ...b.output(
    'py-dict-equality-views',
    5,
    [
      'Dict equality ignores order; key views are live and support set operations.',
      'In `{**a, **b}` later mappings win.',
    ],
    [
      {
        key: 'equality',
        code: `a = {"x": 1, "y": 2}
b = {"y": 2, "x": 1}
print(a == b, list(a) == list(b))`,
        output: 'True False',
        why: 'Two dicts are equal when they have the same key-value pairs, regardless of insertion order. Their key lists differ in order, so the lists are not equal. (`collections.OrderedDict` instances, by contrast, compare order too.)',
      },
      {
        key: 'live-view',
        code: `config = {"debug": False}
keys = config.keys()
config["port"] = 8080
print(list(keys))
print(sorted(keys & {"port", "host"}))`,
        output: "['debug', 'port']\n['port']",
        why: '`keys()` returns a view, not a copy, so it reflects keys added later. Key views behave like sets and support `&`, `|` and `-` with other sets.',
      },
      {
        key: 'unpack-merge',
        code: `base = {"a": 1, "b": 2}
override = {"b": 3, "c": 4}
merged = {**base, **override, "a": 0}
print(merged)`,
        output: "{'a': 0, 'b': 3, 'c': 4}",
        why: 'Unpacking inserts the items in order; later values replace earlier ones but each key keeps the position of its first insertion. `"a"` stays first with the value `0` from the explicit entry at the end.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Mutability, aliasing and copying

export const mutabilityFamilies: readonly QuestionSource[] = [
  ...b.output(
    'py-aliasing',
    1,
    [
      'Assignment never copies: it binds another name to the same object.',
      'Changing a mutable object is visible through every name bound to it.',
    ],
    [
      {
        key: 'list',
        code: `cart = ["pen"]
saved = cart
cart.append("ink")
print(saved)`,
        output: "['pen', 'ink']",
        why: '`saved = cart` makes `saved` another name for the same list, so the `append` is visible through both names. Use `cart.copy()` or `list(cart)` to take a snapshot.',
      },
      {
        key: 'rebind',
        code: `cart = ["pen"]
saved = cart
cart = cart + ["ink"]
print(saved, cart)`,
        output: "['pen'] ['pen', 'ink']",
        why: '`cart + ["ink"]` builds a new list and `cart = ...` rebinds the name to it. `saved` still refers to the original list, which was never changed.',
      },
      {
        key: 'dict-in-list',
        code: `row = {"qty": 1}
rows = [row, row]
rows[0]["qty"] = 5
print(rows)`,
        output: "[{'qty': 5}, {'qty': 5}]",
        why: 'The list holds two references to the same dict, so changing it through `rows[0]` also shows up in `rows[1]`.',
      },
    ],
  ),
  ...b.multi('py-mutable-immutable', 2, 'Ask whether the object can change after it is created.', [
    {
      key: 'types',
      question: 'Select every immutable built-in type.',
      correct: ['`str`', '`tuple`', '`frozenset`', '`int`'],
      wrong: ['`list`', '`dict`'],
      why: 'Numbers, strings, tuples and frozensets cannot change after creation; operations on them produce new objects. Lists, dicts, sets and `bytearray` are mutable.',
    },
    {
      key: 'behavior',
      question: 'Select every true statement about this program.',
      code: `def add_item(items, item):
    items.append(item)

def add_suffix(text, suffix):
    text += suffix

names = ["a"]
label = "x"
add_item(names, "b")
add_suffix(label, "!")
print(names, label)`,
      correct: [
        "It prints `['a', 'b'] x`",
        '`add_item` changes the caller’s list because the parameter refers to the same object',
        '`text += suffix` rebinds only the local name `text` to a new string',
      ],
      wrong: [
        'Python passes every argument by copying it',
        '`add_suffix` changes `label` to `"x!"`',
      ],
      why: 'Python passes references to objects (sometimes called pass by object reference). A mutation through the parameter is visible to the caller; rebinding the parameter, which is what `+=` does for an immutable string, is not.',
    },
  ]),
  ...b.output(
    'py-shallow-copy',
    2,
    [
      '`list.copy()`, `list(x)`, `x[:]` and `dict.copy()` copy only the outer container.',
      'Nested objects are shared between the original and a shallow copy.',
    ],
    [
      {
        key: 'flat',
        code: `original = [1, 2, 3]
copy = original[:]
copy[0] = 99
print(original, copy)`,
        output: '[1, 2, 3] [99, 2, 3]',
        why: 'A slice creates a new list, so replacing an element of the copy does not affect the original. With only immutable elements, a shallow copy is all you need.',
      },
      {
        key: 'nested',
        code: `original = [[1, 2], [3, 4]]
copy = original.copy()
copy[0].append(99)
copy[1] = ["new"]
print(original)`,
        output: '[[1, 2, 99], [3, 4]]',
        why: 'The copy is a new outer list holding the same inner lists. Appending to `copy[0]` changes the shared inner list; replacing `copy[1]` changes only the copy’s slot.',
      },
      {
        key: 'dict',
        code: `settings = {"name": "app", "tags": ["web"]}
draft = dict(settings)
draft["name"] = "draft"
draft["tags"].append("beta")
print(settings)`,
        output: "{'name': 'app', 'tags': ['web', 'beta']}",
        why: '`dict(settings)` is a shallow copy. Reassigning `draft["name"]` affects only the copy, but the `"tags"` list is shared, so the append shows in `settings` too.',
      },
    ],
  ),
  ...b.blank('py-deepcopy', 3, 'The `copy` module has both shallow and deep copying.', [
    {
      key: 'nested-config',
      prompt: 'Complete the code so changing `test_cfg` never affects `base_cfg`, at any depth.',
      template: `import copy

base_cfg = {"db": {"host": "localhost", "port": 5432}, "features": ["a"]}
test_cfg = copy.{{blank:fn}}(base_cfg)
test_cfg["db"]["port"] = 5433
test_cfg["features"].append("b")
print(base_cfg)
assert base_cfg == {"db": {"host": "localhost", "port": 5432}, "features": ["a"]}`,
      blanks: { fn: ['deepcopy'] },
      why: '`copy.deepcopy` copies the container and, recursively, everything inside it, so the nested dict and list are independent. `copy.copy` would copy only the outer dict and share the nested objects.',
    },
    {
      key: 'grid',
      prompt: 'Complete the code so `snapshot` keeps the board as it was before the move.',
      template: `import copy

board = [[".", "."], [".", "."]]
snapshot = {{blank:expr}}
board[0][0] = "X"
print(snapshot[0][0])
assert snapshot[0][0] == "."`,
      blanks: {
        expr: [
          'copy.deepcopy(board)',
          '[row[:] for row in board]',
          '[row.copy() for row in board]',
          '[list(row) for row in board]',
        ],
      },
      why: 'The board is a list of lists, so both levels need copying. `copy.deepcopy` does it generally; for exactly two levels, copying each row in a comprehension is enough. `board.copy()` or `board[:]` would share the rows.',
    },
  ]),
  ...b.outputChoice(
    'py-list-multiplication',
    3,
    '`[x] * n` repeats references to the same object `x`.',
    [
      {
        key: 'grid',
        code: `grid = [[0] * 3] * 2
grid[0][1] = 5
print(grid)`,
        correct: '[[0, 5, 0], [0, 5, 0]]',
        wrong: ['[[0, 5, 0], [0, 0, 0]]', '[[5, 5, 5], [0, 0, 0]]', 'TypeError'],
        why: 'The outer `* 2` repeats a reference to the same inner list, so both rows are one object. Build independent rows with `[[0] * 3 for _ in range(2)]`. The inner `[0] * 3` is fine because ints are immutable.',
      },
      {
        key: 'comprehension',
        code: `grid = [[0] * 3 for _ in range(2)]
grid[0][1] = 5
print(grid)`,
        correct: '[[0, 5, 0], [0, 0, 0]]',
        wrong: ['[[0, 5, 0], [0, 5, 0]]', '[[5, 5, 5], [0, 0, 0]]', '[[0, 5, 0]]'],
        why: 'The comprehension evaluates `[0] * 3` once per iteration, creating a separate list for each row, so only the first row changes.',
      },
      {
        key: 'dict-fromkeys',
        code: `buckets = dict.fromkeys(["a", "b"], [])
buckets["a"].append(1)
print(buckets)`,
        correct: "{'a': [1], 'b': [1]}",
        wrong: ["{'a': [1], 'b': []}", "{'a': 1, 'b': []}", "{'a': [1]}"],
        why: '`dict.fromkeys(keys, value)` uses the same value object for every key, so both keys share one list. Use `{k: [] for k in keys}` or a `defaultdict(list)`.',
      },
    ],
  ),
  ...b.codeChoice(
    'py-argument-mutation-bug',
    3,
    'A function receives a reference to the caller’s object.',
    [
      {
        key: 'normalize',
        question:
          'After calling `normalized`, the caller’s `prices` list has changed too. Which change fixes `normalized` so it leaves its argument alone?',
        code: `def normalized(values):
    top = max(values)
    for i in range(len(values)):
        values[i] = values[i] / top
    return values

prices = [50, 100]
result = normalized(prices)
print(prices, result)`,
        correct:
          'Return a new list: `return [v / top for v in values]` instead of writing into `values`',
        wrong: [
          'Declare `global values` inside the function',
          'Call it as `normalized(*prices)` so the list is copied',
          'Rename the parameter so it does not refer to `prices`',
        ],
        why: 'The parameter `values` refers to the caller’s list, so item assignment changes it. Building and returning a new list avoids the side effect. Parameter names do not matter, `global` is unrelated, and `*prices` would pass separate arguments that do not match the signature.',
      },
      {
        key: 'sort-in-helper',
        question:
          'The report shows customers in the order they signed up, but after `top_three` runs, `customers` is sorted. Why?',
        code: `def top_three(scores):
    scores.sort(reverse=True)
    return scores[:3]

customers = [40, 95, 70, 88]
best = top_three(customers)
print(customers)`,
        correct:
          '`scores.sort()` sorts the caller’s list in place; use `sorted(scores, reverse=True)[:3]` to work on a new list',
        wrong: [
          'The slice `scores[:3]` writes the sorted values back into `customers`',
          'Lists are always passed by copy, so the problem must be elsewhere',
          '`reverse=True` makes `sort` modify the original instead of a copy',
        ],
        why: '`list.sort` mutates the list the parameter refers to, which is the caller’s list. `sorted` returns a new list. Slicing creates a new list and never writes back.',
      },
    ],
  ),
  ...b.output(
    'py-augmented-assignment-mutation',
    4,
    [
      'For a list, `a += b` extends the list in place; `a = a + b` builds a new list.',
      'For immutable types like tuples and strings, `+=` always creates a new object.',
    ],
    [
      {
        key: 'list-in-place',
        code: `a = [1]
alias = a
a += [2]
a = a + [3]
print(alias, a)`,
        output: '[1, 2] [1, 2, 3]',
        why: '`a += [2]` calls `list.__iadd__`, which extends the same list, so `alias` sees the `2`. `a = a + [3]` creates a new list and rebinds `a`, leaving `alias` behind.',
      },
      {
        key: 'tuple-new',
        code: `t = (1,)
alias = t
t += (2,)
print(alias, t, alias is t)`,
        output: '(1,) (1, 2) False',
        why: 'Tuples are immutable, so `+=` falls back to building a new tuple and rebinding `t`. `alias` still refers to the original one-element tuple.',
      },
      {
        key: 'parameter',
        code: `def add_one(values):
    values += [1]

def add_two(values):
    values = values + [2]

data = []
add_one(data)
add_two(data)
print(data)`,
        output: '[1]',
        why: 'Inside `add_one`, `+=` extends the caller’s list in place. Inside `add_two`, `values + [2]` is a new list bound only to the local name, so the caller never sees it.',
      },
    ],
  ),
  ...b.output(
    'py-tuple-plus-equals-trap',
    5,
    [
      '`t[0] += x` first computes `t[0].__iadd__(x)`, then tries to store the result into `t[0]`.',
      'The in-place extension can succeed even though the item assignment fails.',
    ],
    [
      {
        key: 'list-in-tuple',
        code: `t = ([1, 2], "x")
try:
    t[0] += [3]
except TypeError:
    print("TypeError")
print(t)`,
        output: "TypeError\n([1, 2, 3], 'x')",
        why: 'Augmented assignment on an item runs in two steps: `list.__iadd__` extends the list in place (that succeeds), then `t[0] = result` fails because tuples do not support item assignment. The error is raised, but the list has already changed. Use `t[0].extend([3])` to avoid the error.',
      },
      {
        key: 'extend-ok',
        code: `t = ([1, 2], "x")
t[0].extend([3])
t[0].append(4)
print(t)`,
        output: "([1, 2, 3, 4], 'x')",
        why: 'The tuple cannot change which objects it holds, but a list it holds is still mutable. Calling methods on it changes the list without assigning into the tuple, so no error occurs.',
      },
      {
        key: 'hash-check',
        code: `frozen = (1, 2)
mixed = (1, [2])
print(hash(frozen) == hash((1, 2)))
try:
    hash(mixed)
except TypeError:
    print("unhashable")`,
        output: 'True\nunhashable',
        why: 'Equal tuples of hashable items have equal hashes. A tuple containing a list is not hashable, because the list could change: immutability of the tuple is shallow.',
      },
    ],
  ),
];
