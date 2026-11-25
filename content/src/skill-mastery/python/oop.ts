import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Object-oriented Python: classes, attributes, methods, inheritance, properties,
 * composition, dataclasses and dunder methods.
 */

const b = programBuilders('python');

// ---------------------------------------------------------------- Classes, inheritance and properties

export const classesFamilies: readonly QuestionSource[] = [
  ...b.output(
    'py-init-and-self',
    1,
    [
      '`__init__` runs when you call the class; `self` is the new instance.',
      'Each instance has its own instance attributes.',
    ],
    [
      {
        key: 'account',
        code: `class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount):
        self.balance += amount
        return self.balance

a = Account("ana")
b = Account("ben", 50)
a.deposit(20)
print(a.balance, b.balance)`,
        output: '20 50',
        why: 'Calling `Account(...)` creates an instance and runs `__init__` with it as `self`. `a.deposit(20)` is `Account.deposit(a, 20)`, so only `a` changes.',
      },
      {
        key: 'method-chain',
        code: `class Counter:
    def __init__(self):
        self.value = 0

    def add(self, n):
        self.value += n
        return self

c = Counter().add(2).add(3)
print(c.value)`,
        output: '5',
        why: 'Each `add` returns `self`, the same instance, so the calls can be chained and both additions apply to one counter.',
      },
    ],
  ),
  ...b.fails(
    'py-self-mistakes',
    2,
    'Instance methods receive the instance as their first parameter, and attributes are always reached through it.',
    [
      {
        key: 'missing-self-param',
        question: 'Why does this program fail?',
        code: `class Greeter:
    def greet():
        return "hello"

print(Greeter().greet())`,
        error: 'TypeError',
        correct:
          '`greet` has no `self` parameter, but calling it on an instance passes the instance anyway: `takes 0 positional arguments but 1 was given`',
        wrong: [
          'Methods without parameters must be called on the class: `Greeter.greet` is the only valid form',
          '`Greeter()` fails because the class has no `__init__`',
          'It raises `NameError` because `self` is not defined',
        ],
        why: 'Python passes the instance as the first argument of every instance method call. Add `self` (or make it a `@staticmethod` if it really needs no instance). A class without `__init__` is fine; it inherits `object.__init__`.',
      },
      {
        key: 'bare-attribute',
        question: 'Why does `describe` fail?',
        code: `class Product:
    def __init__(self, name, price):
        self.name = name
        self.price = price

    def describe(self):
        return f"{name}: {price}"

print(Product("pen", 2).describe())`,
        error: 'NameError',
        correct:
          'Inside a method, attributes must be accessed as `self.name` and `self.price`; the bare names are not defined',
        wrong: [
          'The f-string needs `str(name)` to format an attribute',
          'Attributes set in `__init__` are deleted when `__init__` returns',
          '`describe` must be declared before `__init__`',
        ],
        why: 'Unlike Java or C#, Python has no implicit `this`. The parameters of `__init__` were local to it; the values survive only as attributes on `self`.',
      },
    ],
  ),
  ...b.output(
    'py-inheritance-super',
    2,
    [
      'A subclass method with the same name replaces the parent’s method.',
      '`super()` calls the next implementation, usually the parent’s.',
    ],
    [
      {
        key: 'override',
        code: `class Animal:
    def speak(self):
        return "..."

    def intro(self):
        return "I say " + self.speak()

class Dog(Animal):
    def speak(self):
        return "woof"

print(Animal().intro(), Dog().intro())`,
        output: 'I say ... I say woof',
        why: '`intro` is inherited, but it calls `self.speak()`, which is looked up on the actual object. For a `Dog`, the overriding `speak` runs.',
      },
      {
        key: 'super-init',
        code: `class Employee:
    def __init__(self, name):
        self.name = name

class Manager(Employee):
    def __init__(self, name, reports):
        super().__init__(name)
        self.reports = reports

m = Manager("ana", ["ben", "cai"])
print(m.name, len(m.reports), isinstance(m, Employee))`,
        output: 'ana 2 True',
        why: '`super().__init__(name)` runs the parent initializer, which sets `name`. A `Manager` is also an `Employee`, so `isinstance` is `True`.',
      },
      {
        key: 'extend',
        code: `class Report:
    def render(self):
        return "body"

class SignedReport(Report):
    def render(self):
        return super().render() + " / signed"

print(SignedReport().render())`,
        output: 'body / signed',
        why: 'The override reuses the parent’s result through `super()` and adds to it, instead of duplicating the parent’s code.',
      },
    ],
  ),
  ...b.outputChoice(
    'py-class-vs-instance-attributes',
    3,
    'Reading `obj.attr` checks the instance first, then the class. Assigning `obj.attr = ...` always writes to the instance.',
    [
      {
        key: 'shared-list',
        code: `class Team:
    members = []

    def join(self, name):
        self.members.append(name)

red = Team()
blue = Team()
red.join("ana")
print(blue.members)`,
        correct: "['ana']",
        wrong: ['[]', "['ana', 'ana']", 'AttributeError'],
        why: '`members` is a class attribute: one list shared by every instance. `self.members.append` finds it on the class and mutates it. Create per-instance state in `__init__` with `self.members = []`.',
      },
      {
        key: 'shadow',
        code: `class Config:
    retries = 3

a = Config()
b = Config()
a.retries = 5
Config.retries = 10
print(a.retries, b.retries)`,
        correct: '5 10',
        wrong: ['5 3', '10 10', '5 5'],
        why: '`a.retries = 5` creates an instance attribute on `a` that shadows the class attribute. `b` has none, so it reads the class attribute, which is now `10`.',
      },
      {
        key: 'counter',
        code: `class Ticket:
    issued = 0

    def __init__(self):
        Ticket.issued += 1
        self.number = Ticket.issued

t1, t2, t3 = Ticket(), Ticket(), Ticket()
print(t2.number, Ticket.issued, t1.issued)`,
        correct: '2 3 3',
        wrong: ['2 1 1', '1 3 1', '2 3 1'],
        why: 'Updating through the class name changes the shared class attribute. Each instance stores its own `number`. `t1.issued` has no instance attribute, so it reads the class value `3`.',
      },
    ],
  ),
  ...b.output(
    'py-method-kinds',
    3,
    [
      'A `@classmethod` receives the class as `cls`; a `@staticmethod` receives neither the instance nor the class.',
      'Calling `cls(...)` in a class method creates an instance of whichever class it was called on.',
    ],
    [
      {
        key: 'alt-constructor',
        code: `class Money:
    def __init__(self, cents):
        self.cents = cents

    @classmethod
    def from_text(cls, text):
        euros, cents = text.split(".")
        return cls(int(euros) * 100 + int(cents))

    @staticmethod
    def is_valid(text):
        return text.count(".") == 1

m = Money.from_text("12.34")
print(m.cents, Money.is_valid("5"))`,
        output: '1234 False',
        why: '`from_text` is an alternative constructor: it receives the class and returns `cls(...)`. `is_valid` is a helper that needs no instance or class state, so it is a static method.',
      },
      {
        key: 'subclass-cls',
        code: `class Shape:
    @classmethod
    def create(cls):
        return cls()

class Circle(Shape):
    pass

print(type(Circle.create()).__name__, type(Shape.create()).__name__)`,
        output: 'Circle Shape',
        why: 'When called on `Circle`, `cls` is `Circle`, so the factory builds a `Circle`. This is why alternative constructors are class methods rather than static methods hard-coding the class.',
      },
      {
        key: 'call-on-instance',
        code: `class Temp:
    unit = "C"

    @classmethod
    def describe(cls):
        return "unit " + cls.unit

    @staticmethod
    def convert(c):
        return c * 9 / 5 + 32

t = Temp()
t.unit = "F"
print(t.describe(), t.convert(100))`,
        output: 'unit C 212.0',
        why: 'A class method called on an instance still receives the class, so it reads the class attribute `"C"`, not the instance attribute. Static methods can be called on instances too; they just get the arguments given.',
      },
    ],
  ),
  ...b.fails(
    'py-forgot-super-init',
    3,
    'If a subclass defines `__init__`, the parent’s `__init__` runs only if the subclass calls it.',
    [
      {
        key: 'missing-attribute',
        question: 'Why does this program fail?',
        code: `class Vehicle:
    def __init__(self, wheels):
        self.wheels = wheels

class Bike(Vehicle):
    def __init__(self, brand):
        self.brand = brand

bike = Bike("acme")
print(bike.brand, bike.wheels)`,
        error: 'AttributeError',
        correct:
          '`Bike.__init__` never calls `super().__init__(2)`, so `wheels` is never set and reading it raises `AttributeError`',
        wrong: [
          'Python calls `Vehicle.__init__` automatically first, but with no argument for `wheels`',
          '`brand` must be passed to the parent class too',
          'Subclasses cannot add new attributes',
        ],
        why: 'Python does not chain initializers automatically. A subclass `__init__` replaces the parent’s; call `super().__init__(...)` explicitly to run it.',
      },
      {
        key: 'wrong-args',
        question: 'Why does creating `Admin` fail?',
        code: `class User:
    def __init__(self, name, email):
        self.name = name
        self.email = email

class Admin(User):
    def __init__(self, name, email, level):
        super().__init__(self, name, email)
        self.level = level

print(Admin("ana", "a@x.io", 1).level)`,
        error: 'TypeError',
        correct:
          '`super().__init__` is already bound to the instance; passing `self` again gives `User.__init__` one argument too many',
        wrong: [
          '`super()` needs the arguments `super(Admin, self)` in Python 3',
          '`level` must be set before calling the parent initializer',
          'The parent initializer cannot receive an email',
        ],
        why: '`super()` returns a proxy bound to `self`, so `super().__init__(name, email)` is the correct call. Passing `self` explicitly is the old style for calling `User.__init__(self, name, email)` directly; mixing the two adds an extra argument.',
      },
    ],
  ),
  ...b.output(
    'py-properties',
    4,
    [
      '`@property` turns a method into a computed attribute read without parentheses.',
      'A property without a setter is read-only; a setter runs on assignment, also in `__init__`.',
    ],
    [
      {
        key: 'validation',
        code: `class Product:
    def __init__(self, price):
        self.price = price

    @property
    def price(self):
        return self._price

    @price.setter
    def price(self, value):
        if value < 0:
            raise ValueError("negative price")
        self._price = value

p = Product(5)
try:
    p.price = -1
except ValueError as e:
    print(e)
try:
    Product(-3)
except ValueError as e:
    print("init:", e)
print(p.price)`,
        output: 'negative price\ninit: negative price\n5',
        why: '`self.price = price` in `__init__` goes through the setter too, so invalid values are rejected at construction. The failed assignment leaves the stored `_price` unchanged.',
      },
      {
        key: 'read-only',
        code: `class Rectangle:
    def __init__(self, w, h):
        self.w = w
        self.h = h

    @property
    def area(self):
        return self.w * self.h

r = Rectangle(2, 3)
r.w = 10
print(r.area)
try:
    r.area = 5
except AttributeError:
    print("read-only")`,
        output: '30\nread-only',
        why: 'The property is computed on each access, so it reflects the new width. With no setter, assignment raises `AttributeError`.',
      },
      {
        key: 'method-vs-property',
        code: `class Circle:
    def __init__(self, r):
        self.r = r

    @property
    def diameter(self):
        return self.r * 2

c = Circle(4)
print(c.diameter)
try:
    print(c.diameter())
except TypeError:
    print("TypeError")`,
        output: '8\nTypeError',
        why: 'Reading `c.diameter` already calls the getter and returns `8`. Adding parentheses then tries to call the int `8`, which raises `TypeError: \'int\' object is not callable`.',
      },
    ],
  ),
  ...b.codeChoice(
    'py-composition-vs-inheritance',
    3,
    'Inheritance says "is a" and exposes the whole parent interface; composition says "has a" and exposes only what you choose.',
    [
      {
        key: 'stack',
        question:
          'This `Stack` subclasses `list`. Why is composition (a class that holds a list in an attribute) the better design here?',
        code: `class Stack(list):
    def push(self, item):
        self.append(item)

s = Stack()
s.push(1)
s.push(2)
s.insert(0, 99)
print(s.pop(), s[0])`,
        correct:
          'Inheriting from `list` exposes every list method, so callers can `insert` at the bottom or index into it and break the stack’s rules',
        wrong: [
          'Classes cannot inherit from built-in types such as `list`',
          'Subclassing `list` makes `pop` return the first item instead of the last',
          'Composition is always faster than inheritance in Python',
        ],
        why: 'Subclassing built-ins is allowed, but it makes the whole `list` interface part of `Stack`. Holding a private list and exposing only `push`, `pop` and `peek` keeps the invariant. The program prints `2 99`.',
      },
      {
        key: 'notifier',
        question: 'Which design best lets an `OrderService` send notifications by email in production and record them in tests?',
        code: `class EmailSender:
    def send(self, to, text):
        print("email to", to)

class FakeSender:
    def __init__(self):
        self.sent = []
    def send(self, to, text):
        self.sent.append((to, text))

class OrderService:
    def __init__(self, sender):
        self.sender = sender
    def place(self, customer):
        self.sender.send(customer, "order placed")

fake = FakeSender()
OrderService(fake).place("ana")
print(fake.sent)`,
        correct:
          'Pass a sender object into `OrderService` (composition), as shown, so any object with a `send` method can be used',
        wrong: [
          'Make `OrderService` inherit from `EmailSender`, and override `send` in a test subclass',
          'Make `EmailSender` inherit from `OrderService` so it can access orders',
          'Call `EmailSender().send` directly inside `place` and patch the class in production',
        ],
        why: 'An order service has a sender; it is not one. Injecting the collaborator lets tests pass a fake and production pass the real sender, relying on duck typing. Inheritance couples the service to one implementation.',
      },
    ],
  ),
  ...b.output(
    'py-mro-cooperative-super',
    5,
    [
      '`super()` follows the method resolution order (MRO) of the instance’s class, not just the direct parent.',
      '`Class.__mro__` lists the order; each class appears before its parents.',
    ],
    [
      {
        key: 'diamond',
        code: `class Base:
    def setup(self):
        return ["Base"]

class Logging(Base):
    def setup(self):
        return ["Logging"] + super().setup()

class Caching(Base):
    def setup(self):
        return ["Caching"] + super().setup()

class Service(Logging, Caching):
    def setup(self):
        return ["Service"] + super().setup()

print(Service().setup())
print([c.__name__ for c in Service.__mro__])`,
        output: "['Service', 'Logging', 'Caching', 'Base']\n['Service', 'Logging', 'Caching', 'Base', 'object']",
        why: 'The MRO of `Service` is Service, Logging, Caching, Base, object. `super()` inside `Logging` calls the next class in the instance’s MRO, which is `Caching`, not `Base`. That is why each class runs once.',
      },
      {
        key: 'order-swap',
        code: `class A:
    def who(self):
        return "A"

class B(A):
    def who(self):
        return "B>" + super().who()

class C(A):
    def who(self):
        return "C>" + super().who()

class D(C, B):
    pass

print(D().who(), B().who())`,
        output: 'C>B>A B>A',
        why: '`D(C, B)` lists `C` first, so the MRO is D, C, B, A. Inside `C`, `super()` goes to `B` for a `D` instance, but for a plain `B` instance the chain is just B, A.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Dataclasses and dunder methods

export const dataclassesFamilies: readonly QuestionSource[] = [
  ...b.output(
    'py-dataclass-basics',
    1,
    [
      '`@dataclass` generates `__init__`, `__repr__` and `__eq__` from the annotated fields.',
      'The generated `__eq__` compares field values, in order.',
    ],
    [
      {
        key: 'repr-eq',
        code: `from dataclasses import dataclass

@dataclass
class Point:
    x: int
    y: int = 0

p = Point(1, 2)
print(p)
print(p == Point(1, 2), Point(3))`,
        output: 'Point(x=1, y=2)\nTrue Point(x=3, y=0)',
        why: 'The generated `__repr__` shows the class name and every field. The generated `__eq__` compares fields, so two separate objects with equal fields are equal. `y` has a default.',
      },
      {
        key: 'plain-class',
        code: `from dataclasses import dataclass

class PlainItem:
    def __init__(self, name):
        self.name = name

@dataclass
class Item:
    name: str

print(PlainItem("pen") == PlainItem("pen"), Item("pen") == Item("pen"))`,
        output: 'False True',
        why: 'A plain class inherits `object.__eq__`, which compares identity, so two instances are never equal. The dataclass generates a value-based `__eq__`.',
      },
    ],
  ),
  ...b.fails(
    'py-dataclass-mutable-default',
    2,
    'Dataclasses refuse defaults of type `list`, `dict` or `set`.',
    [
      {
        key: 'list-default',
        question: 'Why does this program fail before any object is created?',
        code: `from dataclasses import dataclass

@dataclass
class Order:
    id: int
    items: list = []

print(Order(1))`,
        error: 'ValueError',
        correct:
          'A mutable default would be shared by all instances, so `@dataclass` raises `ValueError` and asks for `field(default_factory=list)`',
        wrong: [
          'Dataclass fields cannot have the type `list`',
          '`id` shadows a built-in name, which dataclasses forbid',
          'Defaults are only allowed on the first field',
        ],
        why: 'The error is raised while the class is being created: `mutable default <class \'list\'> for field items is not allowed: use default_factory`. This protects against the same shared-default bug that plain function defaults have.',
      },
      {
        key: 'field-order',
        question: 'Why does this class definition fail?',
        code: `from dataclasses import dataclass

@dataclass
class Task:
    title: str
    done: bool = False
    owner: str

print(Task("write", owner="ana"))`,
        error: 'TypeError',
        correct:
          'A field without a default (`owner`) cannot follow a field with a default, because the generated `__init__` would be invalid',
        wrong: [
          'Boolean fields must come last',
          '`owner` must be passed positionally',
          'Dataclasses do not allow keyword arguments in the constructor',
        ],
        why: 'The generated signature would be `__init__(self, title, done=False, owner)`, which is illegal, so the decorator raises `TypeError: non-default argument \'owner\' follows default argument`. Reorder the fields or use `@dataclass(kw_only=True)` / `field(kw_only=True)`.',
      },
    ],
  ),
  ...b.blank(
    'py-default-factory',
    2,
    '`field(default_factory=...)` calls the factory for every new instance.',
    [
      {
        key: 'tags',
        prompt: 'Give each `Post` its own empty `tags` list.',
        template: `from dataclasses import dataclass, field

@dataclass
class Post:
    title: str
    tags: list[str] = field({{blank:arg}})

a = Post("a")
b = Post("b")
a.tags.append("python")
print(a.tags, b.tags)
assert b.tags == []`,
        blanks: { arg: ['default_factory=list', 'default_factory=lambda: []'] },
        why: '`default_factory=list` calls `list()` for each instance, so `a` and `b` get separate lists. `field(default=[])` is rejected just like a plain `= []`.',
      },
      {
        key: 'counter',
        prompt: 'Give each `Inventory` its own empty `Counter`.',
        template: `from collections import Counter
from dataclasses import dataclass, field

@dataclass
class Inventory:
    counts: Counter = field(default_factory={{blank:factory}})

x = Inventory()
y = Inventory()
x.counts["pen"] += 2
print(x.counts["pen"], y.counts["pen"])
assert y.counts["pen"] == 0`,
        blanks: { factory: ['Counter'] },
        why: 'Any zero-argument callable works as a factory; the class `Counter` itself creates an empty counter. Passing `Counter()` would pass an instance, not a callable, and fail when the dataclass tries to call it.',
      },
    ],
  ),
  ...b.output(
    'py-repr-str',
    2,
    [
      '`print` and `str()` use `__str__`, falling back to `__repr__`.',
      'Containers show their items with `__repr__`, even inside `print`.',
    ],
    [
      {
        key: 'both',
        code: `class Money:
    def __init__(self, cents):
        self.cents = cents

    def __repr__(self):
        return f"Money({self.cents})"

    def __str__(self):
        return f"{self.cents / 100:.2f} EUR"

m = Money(1250)
print(m)
print([m])
print(f"{m!r}")`,
        output: '12.50 EUR\n[Money(1250)]\nMoney(1250)',
        why: '`print(m)` uses `__str__`. Printing a list uses the list’s string form, which shows each item with `__repr__`. `!r` asks for `repr()` explicitly.',
      },
      {
        key: 'repr-only',
        code: `class Tag:
    def __init__(self, name):
        self.name = name

    def __repr__(self):
        return f"Tag({self.name!r})"

t = Tag("new")
print(t, str(t), [t])`,
        output: "Tag('new') Tag('new') [Tag('new')]",
        why: 'Without a `__str__`, `str()` falls back to `__repr__`, so all three forms are the same. Defining `__repr__` is the most useful single dunder for debugging.',
      },
    ],
  ),
  ...b.fails(
    'py-frozen-dataclass',
    3,
    '`frozen=True` makes instances immutable after `__init__`.',
    [
      {
        key: 'assign',
        question: 'Why does this program fail?',
        code: `from dataclasses import dataclass

@dataclass(frozen=True)
class Coordinate:
    lat: float
    lon: float

home = Coordinate(48.1, 11.6)
home.lat = 0.0
print(home)`,
        error: 'FrozenInstanceError',
        correct:
          'The instance is frozen, so assigning a field raises `FrozenInstanceError`; create a changed copy with `dataclasses.replace(home, lat=0.0)`',
        wrong: [
          'Float fields cannot be reassigned in any dataclass',
          'Frozen dataclasses cannot be printed',
          'The assignment succeeds but is silently ignored',
        ],
        why: 'A frozen dataclass overrides `__setattr__` to raise `dataclasses.FrozenInstanceError` (a subclass of `AttributeError`). `dataclasses.replace` returns a new instance with selected fields changed.',
      },
      {
        key: 'unhashable',
        question: 'Why can this dataclass not be used in a set?',
        code: `from dataclasses import dataclass

@dataclass
class Sku:
    code: str

unique = {Sku("A1"), Sku("A1")}
print(len(unique))`,
        error: 'TypeError',
        correct:
          'With the default `eq=True` and `frozen=False`, the dataclass sets `__hash__` to `None`, so instances are unhashable; use `@dataclass(frozen=True)`',
        wrong: [
          'Sets cannot contain objects of user-defined classes',
          'The two instances are equal, and sets reject duplicates with an error',
          '`code` must be an `int` to be hashable',
        ],
        why: 'A mutable object whose equality depends on its fields would change its hash when a field changes, so the dataclass makes it unhashable. With `frozen=True`, it generates a field-based `__hash__`, and the set would contain one element.',
      },
    ],
  ),
  ...b.output(
    'py-dataclass-ordering',
    3,
    [
      '`order=True` generates `<`, `<=`, `>`, `>=` that compare the fields as a tuple, in declaration order.',
      '`field(compare=False)` leaves a field out of comparisons.',
    ],
    [
      {
        key: 'sort',
        code: `from dataclasses import dataclass

@dataclass(order=True)
class Version:
    major: int
    minor: int
    patch: int = 0

versions = [Version(1, 10), Version(1, 2, 5), Version(0, 99)]
print(max(versions))
print([f"{v.major}.{v.minor}" for v in sorted(versions)])`,
        output: "Version(major=1, minor=10, patch=0)\n['0.99', '1.2', '1.10']",
        why: 'The comparison works like comparing `(major, minor, patch)` tuples, so `1.10` is greater than `1.2` (10 > 2 as ints), unlike string comparison.',
      },
      {
        key: 'compare-false',
        code: `from dataclasses import dataclass, field

@dataclass(order=True)
class Job:
    priority: int
    name: str = field(compare=False)

jobs = sorted([Job(2, "b"), Job(1, "z"), Job(2, "a")])
print([j.name for j in jobs])
print(Job(1, "x") == Job(1, "y"))`,
        output: "['z', 'b', 'a']\nTrue",
        why: 'Only `priority` takes part in comparisons and equality. Jobs with equal priority keep their original order because sorting is stable, and two jobs with the same priority are equal even with different names.',
      },
    ],
  ),
  ...b.outputChoice(
    'py-eq-and-hash',
    4,
    'Defining `__eq__` without `__hash__` makes a class unhashable; hash and equality must agree.',
    [
      {
        key: 'eq-only',
        code: `class Email:
    def __init__(self, address):
        self.address = address.lower()

    def __eq__(self, other):
        return isinstance(other, Email) and self.address == other.address

print(Email("A@x.io") == Email("a@x.io"))
try:
    print(len({Email("a@x.io")}))
except TypeError:
    print("unhashable")`,
        correct: 'True\nunhashable',
        wrong: ['True\n1', 'False\n1', 'True\n2'],
        why: 'When a class defines `__eq__` but not `__hash__`, Python sets `__hash__` to `None`, so instances cannot go into sets or be dict keys. Add `def __hash__(self): return hash(self.address)`.',
      },
      {
        key: 'eq-and-hash',
        code: `class Email:
    def __init__(self, address):
        self.address = address.lower()

    def __eq__(self, other):
        return isinstance(other, Email) and self.address == other.address

    def __hash__(self):
        return hash(self.address)

emails = {Email("A@x.io"), Email("a@x.io"), Email("b@x.io")}
print(len(emails))`,
        correct: '2',
        wrong: ['3', '1', 'TypeError'],
        why: 'With a hash based on the same field as equality, equal objects land in the same bucket and the set keeps one of them. Hash and equality must agree: equal objects must have equal hashes.',
      },
      {
        key: 'not-implemented',
        code: `class Meters:
    def __init__(self, value):
        self.value = value

    def __eq__(self, other):
        if not isinstance(other, Meters):
            return NotImplemented
        return self.value == other.value

print(Meters(5) == Meters(5), Meters(5) == 5, Meters(5) != Meters(6))`,
        correct: 'True False True',
        wrong: ['True True True', 'True TypeError', 'True False False'],
        why: 'Returning `NotImplemented` lets Python try the other operand and finally fall back to identity, which gives `False` for `Meters(5) == 5`. Python derives `!=` from `__eq__` automatically.',
      },
    ],
  ),
  ...b.output(
    'py-operator-dunders',
    4,
    [
      'Operators and built-ins call dunder methods: `+` calls `__add__`, `len()` calls `__len__`, `bool()` uses `__bool__` or `__len__`.',
      '`sum()` starts from `0`, so it needs `0 + obj` to work, which calls `__radd__`.',
    ],
    [
      {
        key: 'add-radd',
        code: `class Money:
    def __init__(self, cents):
        self.cents = cents

    def __add__(self, other):
        if isinstance(other, Money):
            return Money(self.cents + other.cents)
        return NotImplemented

    def __radd__(self, other):
        if other == 0:
            return self
        return NotImplemented

total = sum([Money(150), Money(275)])
print(total.cents)`,
        output: '425',
        why: '`sum` computes `0 + Money(150)` first. `int.__add__` returns `NotImplemented` for a `Money`, so Python calls `Money.__radd__(0)`, which returns the money unchanged. Without `__radd__`, `sum` would raise `TypeError`.',
      },
      {
        key: 'len-bool',
        code: `class Cart:
    def __init__(self, items):
        self.items = list(items)

    def __len__(self):
        return len(self.items)

empty = Cart([])
full = Cart(["pen"])
print(len(full), bool(empty), "has items" if full else "empty")`,
        output: '1 False has items',
        why: 'Without `__bool__`, truth testing falls back to `__len__`: a length of 0 is falsy. So the class behaves like a built-in container in `if` statements.',
      },
      {
        key: 'total-ordering',
        code: `from functools import total_ordering

@total_ordering
class Size:
    order = ["S", "M", "L"]

    def __init__(self, label):
        self.label = label

    def __eq__(self, other):
        return self.label == other.label

    def __lt__(self, other):
        return self.order.index(self.label) < self.order.index(other.label)

sizes = [Size("L"), Size("S"), Size("M")]
print([s.label for s in sorted(sizes)], Size("L") >= Size("M"))`,
        output: "['S', 'M', 'L'] True",
        why: '`sorted` only needs `__lt__`. `@total_ordering` fills in `>=`, `>` and `<=` from `__eq__` and `__lt__`, so `Size("L") >= Size("M")` works.',
      },
    ],
  ),
  ...b.output(
    'py-dataclass-post-init',
    5,
    [
      '`__post_init__` runs at the end of the generated `__init__`.',
      '`field(init=False)` excludes a field from `__init__`; `field(repr=False)` hides it from the repr.',
    ],
    [
      {
        key: 'derived',
        code: `from dataclasses import dataclass, field

@dataclass
class Line:
    unit_price: int
    qty: int
    total: int = field(init=False)

    def __post_init__(self):
        if self.qty <= 0:
            raise ValueError("qty must be positive")
        self.total = self.unit_price * self.qty

line = Line(250, 4)
print(line)
line.qty = 10
print(line.total)`,
        output: 'Line(unit_price=250, qty=4, total=1000)\n1000',
        why: '`total` is computed once in `__post_init__`. It is still a regular field, so it appears in the repr, but changing `qty` later does not update it; use a `@property` for a value that must stay in sync.',
      },
      {
        key: 'inheritance-kw-only',
        code: `from dataclasses import dataclass, field

@dataclass
class Base:
    id: int
    secret: str = field(default="x", repr=False)

@dataclass(kw_only=True)
class Child(Base):
    name: str

c = Child(7, name="ana")
print(c)`,
        output: "Child(id=7, name='ana')",
        why: 'Inherited fields come first. `name` has no default, which would normally be illegal after the defaulted `secret`, but `kw_only=True` makes `Child`’s own fields keyword-only. `secret` is hidden by `repr=False`.',
      },
    ],
  ),
];
