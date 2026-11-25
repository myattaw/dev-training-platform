import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Classes and object-oriented programming: constructors, static members,
 * encapsulation, inheritance, abstract classes, interfaces, composition,
 * polymorphism, overriding and overloading.
 */
const b = programBuilders('java');

// ---------------------------------------------------------------- Classes and objects

export const classesObjectsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'java-object-state',
    1,
    [
      'Each object created with `new` has its own copy of the instance fields.',
      'A method called on one object changes only that object’s fields.',
    ],
    [
      {
        key: 'two-carts',
        code: `public class Main {
    public static void main(String[] args) {
        Cart first = new Cart();
        Cart second = new Cart();
        first.add(30);
        first.add(12);
        second.add(5);
        System.out.println(first.total + " " + second.total);
    }
}

class Cart {
    int total;

    void add(int price) {
        total += price;
    }
}`,
        output: '42 5',
        why: '`first` and `second` are separate objects, each with its own `total` field starting at `0`. Calls on `first` change only `first.total`.',
      },
      {
        key: 'same-object',
        code: `public class Main {
    public static void main(String[] args) {
        Account a = new Account();
        Account b = a;
        b.deposit(100);
        a.deposit(50);
        System.out.println(a.balance + " " + b.balance);
    }
}

class Account {
    int balance;

    void deposit(int amount) {
        balance += amount;
    }
}`,
        output: '150 150',
        why: '`b = a` copies the reference, not the object. Both variables refer to the one `Account`, so both deposits change the same `balance`.',
      },
      {
        key: 'return-this',
        code: `public class Main {
    public static void main(String[] args) {
        Query q = new Query().where("status = 'PAID'").limit(10);
        System.out.println(q.describe());
    }
}

class Query {
    private String filter = "none";
    private int max = -1;

    Query where(String condition) {
        filter = condition;
        return this;
    }

    Query limit(int n) {
        max = n;
        return this;
    }

    String describe() {
        return filter + " / " + max;
    }
}`,
        output: "status = 'PAID' / 10",
        why: 'Each method changes the object and returns `this`, the same object, so calls can be chained fluently. This is how many builders and query APIs work.',
      },
    ],
  ),
  ...b.codeChoice(
    'java-field-shadowing',
    2,
    'Inside the constructor, which variable does a bare name refer to when a parameter has the same name as a field?',
    [
      {
        key: 'constructor',
        question: 'This program prints `null`. What is the bug?',
        code: `public class Main {
    public static void main(String[] args) {
        Customer c = new Customer("Ada");
        System.out.println(c.getName());
    }
}

class Customer {
    private String name;

    Customer(String name) {
        name = name;
    }

    String getName() {
        return name;
    }
}`,
        correct: 'The parameter `name` shadows the field, so `name = name` assigns the parameter to itself; write `this.name = name`.',
        wrong: [
          'Private fields cannot be assigned in a constructor; make the field `public`.',
          'Strings must be copied with `new String(name)` before they are stored.',
          'The getter returns a copy of the field, which is always `null`.',
        ],
        why: 'A parameter or local variable with the same name as a field hides the field. `name = name` is a self-assignment of the parameter, so the field keeps its default `null`. `this.name` refers explicitly to the field. Constructors can assign private fields, and strings never need copying because they are immutable.',
      },
      {
        key: 'setter',
        question: 'The discount never changes. What is the bug?',
        code: `public class Main {
    public static void main(String[] args) {
        PriceRule rule = new PriceRule();
        rule.setDiscount(15);
        System.out.println(rule.discount());
    }
}

class PriceRule {
    private int discount = 5;

    void setDiscount(int discount) {
        if (discount >= 0) {
            int checked = discount;
            discount = checked;
        }
    }

    int discount() {
        return discount;
    }
}`,
        correct: 'Inside `setDiscount`, `discount` always means the parameter, so the assignment changes the parameter, not the field; use `this.discount = checked`.',
        wrong: [
          'A method and a field cannot have the same name, so `discount()` returns the method’s default.',
          '`int` parameters are passed by reference, so the assignment is undone when the method returns.',
          'The `if` block creates a new scope in which fields cannot be assigned.',
        ],
        why: 'The parameter `discount` shadows the field for the whole method body, including nested blocks. The program prints `5`. A method and a field may share a name in Java, and arguments are passed by value, so assigning a parameter never affects the caller or a field.',
      },
    ],
  ),
  ...b.compiles(
    'java-constructor-rules',
    2,
    'Java adds a no-argument default constructor only when a class declares no constructors. `this(...)` must be the first statement of a constructor.',
    [
      {
        key: 'no-default',
        code: `public class Main {
    public static void main(String[] args) {
        Product p = new Product();
        System.out.println(p.name);
    }
}

class Product {
    String name;

    Product(String name) {
        this.name = name;
    }
}`,
        compiles: false,
        why: 'Once a class declares any constructor, the compiler no longer generates the no-argument default constructor. `new Product()` fails with “constructor Product in class Product cannot be applied to given types”. Add `Product() { this("unnamed"); }` if a default is meaningful.',
      },
      {
        key: 'chaining',
        code: `public class Main {
    public static void main(String[] args) {
        Product p = new Product();
        System.out.println(p.name + " " + p.price);
    }
}

class Product {
    String name;
    int price;

    Product() {
        this("unnamed");
    }

    Product(String name) {
        this(name, 0);
    }

    Product(String name, int price) {
        this.name = name;
        this.price = price;
    }
}`,
        compiles: true,
        why: 'Each convenience constructor delegates with `this(...)` as its first statement, so all initialization lives in one constructor. It prints `unnamed 0`.',
      },
      {
        key: 'this-not-first',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(new Product("pen").name);
    }
}

class Product {
    String name;
    int price;

    Product(String name) {
        System.out.println("creating " + name);
        this(name, 0);
    }

    Product(String name, int price) {
        this.name = name;
        this.price = price;
    }
}`,
        compiles: false,
        why: 'In Java 21 an explicit constructor call (`this(...)` or `super(...)`) must be the first statement in the constructor body; the compiler rejects it after the `println`. Move the logging into the delegated constructor or after the call.',
      },
      {
        key: 'final-unassigned',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(new Invoice("INV-1").id);
    }
}

class Invoice {
    final String id;
    final int total;

    Invoice(String id) {
        this.id = id;
    }
}`,
        compiles: false,
        why: 'A `final` field must be definitely assigned exactly once by the end of every constructor. `total` is never assigned, so the compiler reports “variable total not initialized in the default constructor” (or not initialized at the end of the constructor). Assign it, or chain to a constructor that does.',
      },
    ],
  ),
  ...b.output(
    'java-static-members',
    2,
    [
      'A `static` field belongs to the class: there is one copy shared by all instances.',
      'An instance field exists separately in every object.',
    ],
    [
      {
        key: 'counter',
        code: `public class Main {
    public static void main(String[] args) {
        Order a = new Order();
        Order b = new Order();
        Order c = new Order();
        System.out.println(a.number + " " + c.number + " " + Order.created);
    }
}

class Order {
    static int created = 0;
    final int number;

    Order() {
        created++;
        number = created;
    }
}`,
        output: '1 3 3',
        why: '`created` is shared by all orders and incremented by every constructor. Each order copies the current count into its own `number` field, so `a` gets `1` and `c` gets `3`.',
      },
      {
        key: 'via-instance',
        code: `public class Main {
    public static void main(String[] args) {
        Config dev = new Config();
        Config prod = new Config();
        dev.region = "eu-west-1";
        prod.timeout = 30;
        System.out.println(prod.region + " " + dev.timeout);
    }
}

class Config {
    static String region = "us-east-1";
    int timeout = 10;
}`,
        output: 'eu-west-1 10',
        why: '`region` is static, so `dev.region = ...` changes the single class-wide field (accessing it through an instance is legal but misleading). `timeout` is an instance field, so changing `prod.timeout` does not affect `dev`.',
      },
      {
        key: 'static-method',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(Money.format(1250));
        System.out.println(Money.CENTS_PER_UNIT);
    }
}

class Money {
    static final int CENTS_PER_UNIT = 100;

    static String format(int cents) {
        return cents / CENTS_PER_UNIT + "." + String.format("%02d", cents % CENTS_PER_UNIT);
    }
}`,
        output: '12.50\n100',
        why: 'Static methods and constants are used through the class name, without creating an object. `1250 / 100` is `12` and `1250 % 100` is `50`, formatted with two digits.',
      },
    ],
  ),
  ...b.compiles(
    'java-static-context',
    3,
    'A static method runs without an instance: there is no `this`. Which members can it use directly?',
    [
      {
        key: 'instance-field',
        code: `public class Main {
    private int requests = 0;

    public static void main(String[] args) {
        requests++;
        System.out.println(requests);
    }
}`,
        compiles: false,
        why: '`main` is static, so there is no `this` object whose `requests` field could be used: “non-static variable requests cannot be referenced from a static context”. Create an instance (`new Main().requests++`) or make the field static if it really is class-wide.',
      },
      {
        key: 'instance-method',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(new Main().greeting());
    }

    String greeting() {
        return "hello";
    }
}`,
        compiles: true,
        why: 'Calling the instance method on an explicitly created object is fine: `new Main().greeting()` provides the instance. It prints `hello`.',
      },
      {
        key: 'inner-class',
        code: `public class Main {
    class Line {
        int qty = 1;
    }

    public static void main(String[] args) {
        Line line = new Line();
        System.out.println(line.qty);
    }
}`,
        compiles: false,
        why: 'A non-static nested (inner) class needs an enclosing instance, which a static method does not have: “non-static variable this cannot be referenced from a static context”. Declare it `static class Line` (or a top-level class) when it does not need the outer object.',
      },
      {
        key: 'static-nested',
        code: `public class Main {
    static class Line {
        int qty = 1;
    }

    public static void main(String[] args) {
        Line line = new Line();
        System.out.println(line.qty);
    }
}`,
        compiles: true,
        why: 'A static nested class does not belong to an instance of `Main`, so it can be created from a static method. It prints `1`.',
      },
    ],
  ),
  ...b.output(
    'java-pass-by-value',
    3,
    [
      'Java always passes a copy of the argument. For an object, the copy is a reference to the same object.',
      'Reassigning a parameter changes only the method’s copy.',
    ],
    [
      {
        key: 'mutate-vs-reassign',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    static void process(List<String> items) {
        items.add("checked");
        items = new ArrayList<>();
        items.add("lost");
    }

    public static void main(String[] args) {
        List<String> items = new ArrayList<>(List.of("new"));
        process(items);
        System.out.println(items);
    }
}`,
        output: '[new, checked]',
        why: 'The method receives a copy of the reference. `items.add("checked")` changes the shared list. `items = new ArrayList<>()` only changes the method’s copy of the reference, so `"lost"` goes into a list the caller never sees.',
      },
      {
        key: 'primitive',
        code: `public class Main {
    static void applyBonus(int points) {
        points += 100;
    }

    public static void main(String[] args) {
        int points = 50;
        applyBonus(points);
        System.out.println(points);
    }
}`,
        output: '50',
        why: 'The `int` value is copied into the parameter. Changing the parameter cannot affect the caller’s variable. Return the new value instead: `points = applyBonus(points)`.',
      },
      {
        key: 'swap',
        code: `public class Main {
    static void swap(Box a, Box b) {
        Box tmp = a;
        a = b;
        b = tmp;
        a.value += 1;
    }

    public static void main(String[] args) {
        Box x = new Box(1);
        Box y = new Box(2);
        swap(x, y);
        System.out.println(x.value + " " + y.value);
    }
}

class Box {
    int value;
    Box(int value) { this.value = value; }
}`,
        output: '1 3',
        why: 'The swap only exchanges the method’s local copies of the references; `x` and `y` in `main` are unchanged. After the swap, the local `a` refers to the caller’s `y` object, so `a.value += 1` makes `y.value` `3`.',
      },
    ],
  ),
  ...b.whichCompile(
    'java-access-modifiers',
    4,
    'All classes in one file share a package. `private` is visible in the declaring top-level class; package-private and `protected` members are visible in the whole package.',
    [
      {
        key: 'account',
        question:
          'These classes are in the same file (the same package). Which of the following classes compile when added to the file?',
        prelude: `class Account {
    private long balance;
    long overdraftLimit;
    protected String owner;

    long balance() {
        return balance;
    }

    boolean richerThan(Account other) {
        return balance > other.balance;
    }
}`,
        options: [
          'class Audit { long read(Account a) { return a.balance; } }',
          'class Audit { long read(Account a) { return a.balance(); } }',
          'class Audit { long read(Account a) { return a.overdraftLimit; } }',
          'class Audit { String read(Account a) { return a.owner; } }',
        ],
        correct: [
          'class Audit { long read(Account a) { return a.balance(); } }',
          'class Audit { long read(Account a) { return a.overdraftLimit; } }',
          'class Audit { String read(Account a) { return a.owner; } }',
        ],
        why: '`balance` is `private`, so only code inside `Account` can use it (including `other.balance` on a different `Account` instance, as in `richerThan`). Package-private (`overdraftLimit`, `balance()`) is visible in the same package, and `protected` includes package access too, so `owner` is readable without subclassing.',
      },
      {
        key: 'private-constructor',
        question: 'Which of the following classes compile when added to the same file?',
        prelude: `class Ids {
    private Ids() {}

    static String next(int n) {
        return "ID-" + n;
    }

    private static int secret() {
        return 42;
    }
}`,
        options: [
          'class Use { String id() { return Ids.next(1); } }',
          'class Use { Ids make() { return new Ids(); } }',
          'class Use { int s() { return Ids.secret(); } }',
          'class Use { String id() { return Ids.next(Ids.class.getSimpleName().length()); } }',
        ],
        correct: [
          'class Use { String id() { return Ids.next(1); } }',
          'class Use { String id() { return Ids.next(Ids.class.getSimpleName().length()); } }',
        ],
        why: 'A private constructor prevents other classes from creating instances, the usual pattern for a utility class with only static methods. The package-private static method `next` is callable; `secret` is private and `new Ids()` uses the private constructor, so both fail to compile.',
      },
    ],
  ),
  ...b.codeChoice(
    'java-encapsulation-leaks',
    4,
    'Does the object hand out, or keep, a reference to a mutable object that someone else can change?',
    [
      {
        key: 'getter',
        question: 'An `Order` must never contain more than 3 lines. How can a caller break that rule, and what is the fix?',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        Order order = new Order();
        order.addLine("pen");
        order.getLines().add("desk");
        order.getLines().add("lamp");
        order.getLines().add("chair");
        System.out.println(order.getLines().size());
    }
}

class Order {
    private final List<String> lines = new ArrayList<>();

    void addLine(String line) {
        if (lines.size() >= 3) throw new IllegalStateException("too many lines");
        lines.add(line);
    }

    List<String> getLines() {
        return lines;
    }
}`,
        correct: 'The getter returns the internal list, so callers can add lines without going through `addLine`; return `List.copyOf(lines)` or `Collections.unmodifiableList(lines)`.',
        wrong: [
          'The field is not `private` enough; making it `private static` prevents changes.',
          'The `final` keyword makes the list immutable, so the caller cannot add lines; the rule holds.',
          '`addLine` should be `synchronized` so that the rule is enforced.',
        ],
        why: 'The program prints `4`: the getter leaks the mutable internal list. `final` only prevents reassigning the field, not changing the list. Returning an unmodifiable view or a copy keeps all changes going through `addLine`, where the invariant is checked.',
      },
      {
        key: 'constructor',
        question: 'The team’s member list changes after the `Team` was created. What is the cause?',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<String> names = new ArrayList<>(List.of("ada", "linus"));
        Team team = new Team(names);
        names.clear();
        System.out.println(team.size());
    }
}

class Team {
    private final List<String> members;

    Team(List<String> members) {
        this.members = members;
    }

    int size() {
        return members.size();
    }
}`,
        correct: 'The constructor stores the caller’s list, so the caller can still change it; store a defensive copy such as `List.copyOf(members)`.',
        wrong: [
          '`names.clear()` clears every list in the program that contains the same strings.',
          'Final fields are re-read from the constructor argument on each access.',
          '`size()` should be `static` so it is computed once.',
        ],
        why: 'The program prints `0`: `Team` and `main` share one list object. A defensive copy at construction (`List.copyOf` also rejects `null` elements) makes the object independent of the caller. Strings are shared harmlessly because they are immutable; lists are not.',
      },
    ],
  ),
  ...b.output(
    'java-initialization-order',
    5,
    [
      'Static initializers run once, when the class is first initialized. Instance field initializers and instance initializer blocks run, in source order, before the constructor body.',
      'With `this(...)`, the delegated constructor runs (with the initializers) before the rest of the calling constructor.',
    ],
    [
      {
        key: 'blocks',
        code: `public class Main {
    public static void main(String[] args) {
        new Service();
        new Service();
    }
}

class Service {
    static { System.out.println("static"); }

    private String name = log("field");

    { System.out.println("block"); }

    Service() {
        System.out.println("constructor");
    }

    static String log(String s) {
        System.out.println(s);
        return s;
    }
}`,
        output: 'static\nfield\nblock\nconstructor\nfield\nblock\nconstructor',
        why: 'The static block runs once, when `Service` is first used. For every instance, field initializers and instance blocks run in source order, then the constructor body.',
      },
      {
        key: 'this-chain',
        code: `public class Main {
    public static void main(String[] args) {
        new Report();
    }
}

class Report {
    private int pages = trace("pages");

    Report() {
        this("draft");
        System.out.println("no-arg");
    }

    Report(String title) {
        System.out.println("title " + title);
    }

    static int trace(String s) {
        System.out.println(s);
        return 1;
    }
}`,
        output: 'pages\ntitle draft\nno-arg',
        why: 'Initializers run once per object, in the constructor that calls `super(...)` (implicitly here, the one-argument constructor), before its body. Then control returns to the no-argument constructor, which finishes after the `this(...)` call.',
      },
      {
        key: 'static-order',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(Limits.MAX + " " + Limits.DOUBLE_MAX);
    }
}

class Limits {
    static int DOUBLE_MAX = Limits.MAX * 2;
    static int MAX = 50;
}`,
        output: '50 0',
        why: 'Static fields are initialized in source order. When `DOUBLE_MAX` is computed, `MAX` still has its default `0`, so `DOUBLE_MAX` is `0`; only afterwards is `MAX` set to `50`, so the program prints `50 0`. (Writing plain `MAX` there would be an illegal forward reference; qualifying it compiles but reads the default value.)',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Inheritance and interfaces

export const inheritanceInterfacesFamilies: readonly QuestionSource[] = [
  ...b.output(
    'java-super-constructor-order',
    1,
    [
      'A constructor always calls a superclass constructor first, explicitly with `super(...)` or implicitly.',
      'The superclass part of an object is initialized before the subclass part.',
    ],
    [
      {
        key: 'implicit',
        code: `public class Main {
    public static void main(String[] args) {
        new Truck();
    }
}

class Vehicle {
    Vehicle() {
        System.out.println("vehicle");
    }
}

class Truck extends Vehicle {
    Truck() {
        System.out.println("truck");
    }
}`,
        output: 'vehicle\ntruck',
        why: '`Truck()` starts with an implicit `super()`, so the `Vehicle` constructor runs first. Constructors are not inherited; each level runs its own.',
      },
      {
        key: 'explicit',
        code: `public class Main {
    public static void main(String[] args) {
        Employee e = new Manager("Ada", 3);
        System.out.println(e.describe());
    }
}

class Employee {
    protected final String name;

    Employee(String name) {
        this.name = name;
        System.out.println("employee " + name);
    }

    String describe() {
        return name;
    }
}

class Manager extends Employee {
    private final int reports;

    Manager(String name, int reports) {
        super(name);
        this.reports = reports;
        System.out.println("manager");
    }

    @Override
    String describe() {
        return super.describe() + " manages " + reports;
    }
}`,
        output: 'employee Ada\nmanager\nAda manages 3',
        why: '`super(name)` runs the `Employee` constructor first. `describe()` is overridden, and `super.describe()` calls the superclass version, which the subclass extends.',
      },
      {
        key: 'three-levels',
        code: `public class Main {
    public static void main(String[] args) {
        new C();
    }
}

class A { A() { System.out.print("A"); } }
class B extends A { B() { System.out.print("B"); } }
class C extends B { C() { System.out.println("C"); } }`,
        output: 'ABC',
        why: 'Each constructor first calls its superclass constructor, so construction runs from the top of the hierarchy down: `A`, then `B`, then `C`.',
      },
    ],
  ),
  ...b.compiles(
    'java-inheritance-rules',
    2,
    'Check what the compiler requires of a subclass: a reachable superclass constructor, implementations of abstract methods, and no extending of `final` types.',
    [
      {
        key: 'missing-super',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(new SavingsAccount().id);
    }
}

class Account {
    final String id;
    Account(String id) { this.id = id; }
}

class SavingsAccount extends Account {
    SavingsAccount() {
        System.out.println("savings");
    }
}`,
        compiles: false,
        why: 'Without an explicit `super(...)`, the compiler inserts `super()`, but `Account` has no no-argument constructor: “constructor Account in class Account cannot be applied to given types”. Call `super("...")` explicitly.',
      },
      {
        key: 'abstract-new',
        code: `public class Main {
    public static void main(String[] args) {
        Shape s = new Shape();
        System.out.println(s.area());
    }
}

abstract class Shape {
    abstract double area();
}`,
        compiles: false,
        why: 'An abstract class cannot be instantiated: “Shape is abstract; cannot be instantiated”. Create a concrete subclass (or an anonymous class that implements `area`).',
      },
      {
        key: 'missing-impl',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(new Circle(1).area());
    }
}

abstract class Shape {
    abstract double area();
    abstract double perimeter();
}

class Circle extends Shape {
    private final double r;
    Circle(double r) { this.r = r; }
    double area() { return Math.PI * r * r; }
}`,
        compiles: false,
        why: 'A concrete class must implement every inherited abstract method: “Circle is not abstract and does not override abstract method perimeter() in Shape”. Either implement `perimeter` or declare `Circle` abstract.',
      },
      {
        key: 'anonymous',
        code: `public class Main {
    public static void main(String[] args) {
        Shape unit = new Shape() {
            double area() { return 1; }
        };
        System.out.println(unit.area());
    }
}

abstract class Shape {
    abstract double area();
}`,
        compiles: true,
        why: '`new Shape() { ... }` creates an anonymous subclass that implements the abstract method, which is allowed. It prints `1.0`.',
      },
    ],
  ),
  ...b.output(
    'java-template-method',
    2,
    [
      'An abstract class can implement the overall algorithm and leave specific steps abstract.',
      'Calls to an abstract method run the subclass implementation.',
    ],
    [
      {
        key: 'export',
        code: `public class Main {
    public static void main(String[] args) {
        Exporter exporter = new CsvExporter();
        System.out.println(exporter.export(new String[] {"ada", "linus"}));
    }
}

abstract class Exporter {
    final String export(String[] rows) {
        StringBuilder out = new StringBuilder(header());
        for (String row : rows) out.append(format(row));
        return out.toString();
    }

    abstract String header();

    abstract String format(String row);
}

class CsvExporter extends Exporter {
    String header() { return "name;"; }
    String format(String row) { return row + ";"; }
}`,
        output: 'name;ada;linus;',
        why: 'The `final` method `export` fixes the algorithm, and the subclass supplies the steps. The calls to `header()` and `format()` dispatch to `CsvExporter`.',
      },
      {
        key: 'hook',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(new Nightly().run());
        System.out.println(new Weekly().run());
    }
}

abstract class Job {
    String run() {
        return name() + (shouldNotify() ? " +mail" : "");
    }

    abstract String name();

    boolean shouldNotify() {
        return false;
    }
}

class Nightly extends Job {
    String name() { return "nightly"; }
}

class Weekly extends Job {
    String name() { return "weekly"; }

    @Override
    boolean shouldNotify() { return true; }
}`,
        output: 'nightly\nweekly +mail',
        why: '`shouldNotify` is a hook with a default implementation. `Nightly` keeps the default (`false`); `Weekly` overrides it, so only the weekly job adds ` +mail`.',
      },
    ],
  ),
  ...b.output(
    'java-interface-default-methods',
    3,
    [
      'A default method is inherited by implementing classes unless they override it.',
      'Static interface methods are called on the interface name, and are not inherited by implementing classes.',
    ],
    [
      {
        key: 'override-default',
        code: `public class Main {
    public static void main(String[] args) {
        Notifier email = new EmailNotifier();
        Notifier sms = new SmsNotifier();
        System.out.println(email.send("hi"));
        System.out.println(sms.send("hi"));
    }
}

interface Notifier {
    String channel();

    default String send(String message) {
        return "[" + channel() + "] " + message;
    }
}

class EmailNotifier implements Notifier {
    public String channel() { return "email"; }
}

class SmsNotifier implements Notifier {
    public String channel() { return "sms"; }

    @Override
    public String send(String message) {
        return Notifier.super.send(message.toUpperCase());
    }
}`,
        output: '[email] hi\n[sms] HI',
        why: '`EmailNotifier` inherits the default `send`. `SmsNotifier` overrides it and calls the default implementation explicitly with `Notifier.super.send(...)`, passing an uppercased message.',
      },
      {
        key: 'static-method',
        code: `public class Main {
    public static void main(String[] args) {
        Discount d = Discount.percent(10);
        System.out.println(d.apply(200));
        System.out.println(Discount.NONE.apply(200));
    }
}

interface Discount {
    Discount NONE = price -> price;

    int apply(int price);

    static Discount percent(int p) {
        return price -> price - price * p / 100;
    }
}`,
        output: '180\n200',
        why: 'Interfaces can declare static factory methods and constants (fields are implicitly `public static final`). `Discount.percent(10)` returns a lambda that subtracts 10%. `NONE` returns the price unchanged.',
      },
      {
        key: 'class-wins',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(new Invoice().label());
    }
}

interface Labeled {
    default String label() { return "interface"; }
}

class Document {
    public String label() { return "superclass"; }
}

class Invoice extends Document implements Labeled {
}`,
        output: 'superclass',
        why: 'When a class inherits a method from its superclass and a default method with the same signature from an interface, the class hierarchy wins. Default methods never override a concrete method inherited from a class.',
      },
    ],
  ),
  ...b.compiles(
    'java-default-method-conflicts',
    4,
    'What does the compiler require when two interfaces provide the same default method, and which `Object` methods can a default method replace?',
    [
      {
        key: 'two-defaults',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(new Report().format());
    }
}

interface Pdf { default String format() { return "pdf"; } }
interface Html { default String format() { return "html"; } }

class Report implements Pdf, Html {
}`,
        compiles: false,
        why: '`Report` inherits two unrelated defaults for `format()`, so the compiler cannot choose: “types Pdf and Html are incompatible; class Report inherits unrelated defaults for format()”. Override `format()` in `Report`, possibly delegating with `Pdf.super.format()`.',
      },
      {
        key: 'resolved',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(new Report().format());
    }
}

interface Pdf { default String format() { return "pdf"; } }
interface Html { default String format() { return "html"; } }

class Report implements Pdf, Html {
    @Override
    public String format() {
        return Pdf.super.format() + "+" + Html.super.format();
    }
}`,
        compiles: true,
        why: 'Overriding `format()` resolves the conflict, and `Pdf.super.format()` / `Html.super.format()` call the specific defaults. It prints `pdf+html`.',
      },
      {
        key: 'default-equals',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println("ok");
    }
}

interface Identified {
    String id();

    default boolean equals(Object other) {
        return other instanceof Identified i && i.id().equals(id());
    }
}`,
        compiles: false,
        why: 'An interface cannot declare a default method that overrides a `public` method of `Object` (`equals`, `hashCode`, `toString`): “default method equals in interface Identified overrides a member of java.lang.Object”. Every class already inherits `Object.equals`, which would always win, so the default would be useless.',
      },
      {
        key: 'static-via-instance',
        code: `public class Main {
    public static void main(String[] args) {
        Tax tax = amount -> amount / 5;
        System.out.println(tax.standard());
    }
}

interface Tax {
    int of(int amount);

    static Tax standard() {
        return amount -> amount / 5;
    }
}`,
        compiles: false,
        why: 'Static interface methods are not inherited and can be called only through the interface name: `Tax.standard()`. Calling one through an instance is “illegal static interface method call”, unlike static class methods, which may (misleadingly) be called through an instance.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-fragile-base-class',
    4,
    'An overridden method is also called by the superclass’s own code. Does `addAll` in `HashSet` call `add`?',
    [
      {
        key: 'counting-set',
        code: `import java.util.HashSet;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        CountingSet<String> tags = new CountingSet<>();
        tags.addAll(List.of("java", "spring", "sql"));
        System.out.println(tags.addCount);
    }
}

class CountingSet<E> extends HashSet<E> {
    int addCount = 0;

    @Override
    public boolean add(E e) {
        addCount++;
        return super.add(e);
    }

    @Override
    public boolean addAll(java.util.Collection<? extends E> c) {
        addCount += c.size();
        return super.addAll(c);
    }
}`,
        correct: '6',
        wrong: ['3', '0', 'StackOverflowError'],
        why: '`HashSet` inherits `addAll` from `AbstractCollection`, which calls `add` for each element. Because `add` is overridden, each element is counted twice: three in `addAll` and three more in `add`. The subclass depends on an undocumented implementation detail of its superclass. Wrapping a `Set` (composition and forwarding) avoids the problem.',
      },
      {
        key: 'composition',
        code: `import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class Main {
    public static void main(String[] args) {
        CountingSet<String> tags = new CountingSet<>(new HashSet<>());
        tags.addAll(List.of("java", "spring", "sql"));
        tags.add("java");
        System.out.println(tags.addCount + " " + tags.size());
    }
}

class CountingSet<E> {
    private final Set<E> inner;
    int addCount = 0;

    CountingSet(Set<E> inner) { this.inner = inner; }

    boolean add(E e) {
        addCount++;
        return inner.add(e);
    }

    boolean addAll(Collection<? extends E> c) {
        addCount += c.size();
        return inner.addAll(c);
    }

    int size() { return inner.size(); }
}`,
        correct: '4 3',
        wrong: ['7 3', '4 4', '7 4'],
        why: 'This version wraps a `Set` instead of extending one. `inner.addAll` calls the inner set’s own `add`, not the wrapper’s, so each attempted insertion is counted once: 3 + 1 = 4. The duplicate `"java"` is counted as an attempt but not stored, so the set has 3 elements.',
      },
    ],
  ),
  ...b.codeChoice(
    'java-composition-over-inheritance',
    3,
    'Inheritance exposes every public method of the superclass. Does the subclass really satisfy “is a” for all of them?',
    [
      {
        key: 'stack-list',
        question: 'A team implemented an undo history by extending `ArrayList`. Which statement describes the design problem and a better approach?',
        code: `import java.util.ArrayList;

public class Main {
    public static void main(String[] args) {
        UndoHistory history = new UndoHistory();
        history.push("type a");
        history.push("type b");
        history.add(0, "sneaky");
        System.out.println(history.pop() + " " + history.size());
    }
}

class UndoHistory extends ArrayList<String> {
    void push(String action) { add(action); }
    String pop() { return remove(size() - 1); }
}`,
        correct: 'Callers can use every `ArrayList` method (`add(0, ...)`, `set`, `clear`) and break the stack discipline; hold a private `Deque<String>` field and expose only `push` and `pop`.',
        wrong: [
          '`ArrayList` is `final`, so the class should extend `LinkedList` instead.',
          'Inheritance is fine; the problem is only that `pop` should be `synchronized`.',
          'The class should extend `Stack<String>` so the extra list methods disappear.',
        ],
        why: 'An undo history is not a general-purpose list, but inheriting from `ArrayList` makes it one, publicly and forever. Composition with a private `ArrayDeque` exposes only the operations that keep the invariant. `ArrayList` is not `final`, and `java.util.Stack` has the same problem: it extends `Vector` and exposes indexed access too.',
      },
      {
        key: 'reuse',
        question: 'A `PremiumCustomer extends EmailSender` so that it can reuse the `send` method. What is the best refactoring?',
        code: `public class Main {
    public static void main(String[] args) {
        PremiumCustomer c = new PremiumCustomer("ada@example.com");
        c.welcome();
    }
}

class EmailSender {
    void send(String to, String body) {
        System.out.println("to " + to + ": " + body);
    }
}

class PremiumCustomer extends EmailSender {
    private final String email;
    PremiumCustomer(String email) { this.email = email; }
    void welcome() { send(email, "Welcome!"); }
}`,
        correct: 'A customer is not an email sender; give the class (or better, a service) an `EmailSender` field, injected through the constructor, and call `sender.send(...)`.',
        wrong: [
          'Make `send` `static` so that inheritance is no longer needed, and keep the `extends`.',
          'Make `EmailSender` abstract so `PremiumCustomer` must implement `send`.',
          'The design is correct, because inheritance is the main way to reuse code in Java.',
        ],
        why: 'Inheritance for code reuse couples a domain class to infrastructure and fails the “is a” test. Composition (a field of type `EmailSender`, ideally an interface) keeps the classes independent, lets tests pass a fake sender, and is exactly what dependency injection in Spring builds on.',
      },
    ],
  ),
  ...b.multi(
    'java-interface-vs-abstract',
    5,
    'Compare what each construct can contain (state, constructors, method kinds) and how many of each a class can inherit from.',
    [
      {
        key: 'statements',
        question: 'Select every statement that is true in Java 21.',
        correct: [
          'Fields declared in an interface are implicitly `public static final`.',
          'An interface can declare `private` methods that its default methods share.',
          'An abstract class can declare constructors and mutable instance fields.',
          'A class can extend one class and implement several interfaces.',
        ],
        wrong: [
          'Interface methods without a body may be declared `protected`.',
          'An abstract class must declare at least one abstract method.',
          'A default method may override `toString()` from `Object`.',
        ],
        why: 'Interface fields are constants, and Java 9 added private interface methods for sharing code between defaults. Abstract classes can hold state and constructors (used by subclasses through `super(...)`), and they do not need any abstract method. Interface members cannot be `protected`, and default methods cannot override `Object`’s public methods.',
      },
      {
        key: 'choose',
        question: 'You are designing a `PaymentGateway` abstraction for a Spring service with Stripe and in-memory test implementations. Select every statement that is a good reason for your choice.',
        correct: [
          'An interface lets an implementation extend some other class it needs.',
          'An interface makes it easy to create a fake or a mock for tests.',
          'An abstract class is useful if all implementations share state and a fixed algorithm, with steps left to subclasses.',
        ],
        wrong: [
          'An interface is needed because abstract classes cannot be used as Spring beans.',
          'An abstract class is needed because interfaces cannot have any method implementations.',
        ],
        why: 'Interfaces are the usual choice for a service boundary: they leave implementations free to extend other classes, and they are easy to fake or mock. An abstract base class fits a template-method design with shared state. Spring can inject either, and interfaces can have default and static methods.',
      },
    ],
  ),
  ...b.fails(
    'java-class-cast',
    3,
    'A cast checks the run-time class of the object, not the declared type of the variable.',
    [
      {
        key: 'downcast',
        question: 'This invoice handler throws. What is the cause?',
        code: `import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Payment> payments = List.of(new CardPayment(), new BankTransfer());
        for (Payment p : payments) {
            CardPayment card = (CardPayment) p;
            System.out.println(card.lastDigits());
        }
    }
}

interface Payment {}

class CardPayment implements Payment {
    String lastDigits() { return "4242"; }
}

class BankTransfer implements Payment {}`,
        error: 'ClassCastException',
        correct: 'The second element is a `BankTransfer`, and casting it to `CardPayment` fails at run time; use `if (p instanceof CardPayment card)` or a polymorphic method on `Payment`.',
        wrong: [
          'Casting from an interface to a class is never allowed; the code does not compile.',
          '`List.of` returns an immutable list, so the elements cannot be cast.',
          'The cast creates a new `CardPayment` from the `BankTransfer`, losing its data.',
        ],
        why: 'The cast compiles because a `Payment` might be a `CardPayment`, but the JVM checks the actual class and throws `ClassCastException: class BankTransfer cannot be cast to class CardPayment`. A cast never converts or copies an object. Pattern matching with `instanceof` (or moving the behavior into the interface) avoids the unchecked assumption.',
      },
      {
        key: 'object-list',
        question: 'Why does this report fail?',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Object> cells = new ArrayList<>();
        cells.add("Ada");
        cells.add(42);
        int total = 0;
        for (Object cell : cells) {
            total += ((String) cell).length();
        }
        System.out.println(total);
    }
}`,
        error: 'ClassCastException',
        correct: 'The second cell is an `Integer`, so the cast to `String` throws; a `List<Object>` gives up type checking, so check the type (or model the row with a record).',
        wrong: [
          'Adding an `int` to a `List<Object>` does not compile.',
          '`(String) cell` converts `42` to `"42"`, so the total is `5`.',
          'The `for` loop throws because the list was modified.',
        ],
        why: '`42` is autoboxed to `Integer`, which is an `Object`, so it can be stored. Casting it to `String` throws `ClassCastException` (`String.valueOf` would convert; a cast does not). Mixed-type lists push type errors to run time.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Polymorphism, overriding, overloading

export const polymorphismFamilies: readonly QuestionSource[] = [
  ...b.output(
    'java-dynamic-dispatch',
    1,
    [
      'The method that runs is chosen by the object’s run-time class, not by the variable’s declared type.',
    ],
    [
      {
        key: 'shapes',
        code: `import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Shipping> options = List.of(new Standard(), new Express(), new Standard());
        int total = 0;
        for (Shipping s : options) total += s.cost();
        System.out.println(total);
    }
}

class Shipping {
    int cost() { return 5; }
}

class Standard extends Shipping {
}

class Express extends Shipping {
    @Override
    int cost() { return 20; }
}`,
        output: '30',
        why: '`Standard` inherits `cost()` (5); `Express` overrides it (20). Each call dispatches on the actual object: `5 + 20 + 5 = 30`.',
      },
      {
        key: 'variable-type',
        code: `public class Main {
    public static void main(String[] args) {
        Animal a = new Dog();
        Dog d = new Dog();
        System.out.println(a.sound() + " " + d.sound());
    }
}

class Animal {
    String sound() { return "..."; }
}

class Dog extends Animal {
    @Override
    String sound() { return "woof"; }
}`,
        output: 'woof woof',
        why: 'Even through a variable of type `Animal`, the object is a `Dog`, so the overriding `Dog.sound()` runs. The declared type only decides which methods may be called.',
      },
      {
        key: 'interface',
        code: `public class Main {
    public static void main(String[] args) {
        Formatter f = new Upper();
        System.out.println(f.format("total"));
        f = new Bracketed();
        System.out.println(f.format("total"));
    }
}

interface Formatter {
    String format(String s);
}

class Upper implements Formatter {
    public String format(String s) { return s.toUpperCase(); }
}

class Bracketed implements Formatter {
    public String format(String s) { return "[" + s + "]"; }
}`,
        output: 'TOTAL\n[total]',
        why: 'The same call `f.format(...)` runs different code depending on the object `f` refers to at that moment. That is polymorphism through an interface.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-overload-resolution',
    3,
    'Overloads are chosen at compile time, using the declared (static) types of the arguments. Overriding is chosen at run time.',
    [
      {
        key: 'static-type',
        code: `public class Main {
    static String describe(Object o) { return "object"; }
    static String describe(String s) { return "string"; }

    public static void main(String[] args) {
        Object value = "invoice";
        System.out.println(describe(value) + " " + describe("invoice"));
    }
}`,
        correct: 'object string',
        wrong: ['string string', 'object object', 'It does not compile: the call is ambiguous'],
        why: 'The overload is selected by the compiler from the declared type of the argument. `value` is declared as `Object`, so `describe(Object)` is chosen even though the object is a `String` at run time.',
      },
      {
        key: 'null-argument',
        code: `public class Main {
    static String audit(Object o) { return "object"; }
    static String audit(String s) { return "string"; }

    public static void main(String[] args) {
        System.out.println(audit(null));
    }
}`,
        correct: 'string',
        wrong: ['object', 'It does not compile: the call is ambiguous', 'NullPointerException'],
        why: '`null` fits both parameters, and the compiler picks the most specific applicable overload: `String` is a subtype of `Object`, so `audit(String)` wins. (With `audit(String)` and `audit(Integer)`, neither is more specific and the call would not compile.)',
      },
      {
        key: 'widening-boxing',
        code: `public class Main {
    static String store(long id) { return "long"; }
    static String store(Integer id) { return "Integer"; }
    static String store(int... ids) { return "varargs"; }

    public static void main(String[] args) {
        System.out.println(store(7));
    }
}`,
        correct: 'long',
        wrong: ['Integer', 'varargs', 'It does not compile: the call is ambiguous'],
        why: 'Overload resolution runs in phases: first without boxing or varargs (widening `int` to `long` is allowed), then with boxing, then with varargs. `store(long)` is found in the first phase, so it wins over boxing and varargs.',
      },
      {
        key: 'overload-in-subclass',
        code: `public class Main {
    public static void main(String[] args) {
        Printer p = new PdfPrinter();
        System.out.println(p.print("x"));
    }
}

class Printer {
    String print(Object o) { return "Printer.object"; }
}

class PdfPrinter extends Printer {
    String print(String s) { return "PdfPrinter.string"; }
}`,
        correct: 'Printer.object',
        wrong: ['PdfPrinter.string', 'It does not compile: the call is ambiguous', 'ClassCastException'],
        why: 'The compiler only sees `Printer`’s methods through `p`, so it selects `print(Object)`. `PdfPrinter.print(String)` has a different parameter type: it is an overload, not an override, so dynamic dispatch never reaches it. `@Override` on it would have turned this into a compile error.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-equals-overload-bug',
    3,
    'Collections call `equals(Object)`. Does the class override that method, or add a new overload?',
    [
      {
        key: 'contains',
        code: `import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Sku> stock = List.of(new Sku("A-1"));
        Sku wanted = new Sku("A-1");
        System.out.println(wanted.equals(new Sku("A-1")) + " " + stock.contains(wanted));
    }
}

class Sku {
    final String code;
    Sku(String code) { this.code = code; }

    public boolean equals(Sku other) {
        return code.equals(other.code);
    }

    @Override
    public int hashCode() { return code.hashCode(); }
}`,
        correct: 'true false',
        wrong: ['true true', 'false false', 'false true'],
        why: '`equals(Sku)` is an overload. The direct call with a `Sku` argument picks it (`true`), but `List.contains` calls `equals(Object)`, which is still `Object`’s identity comparison (`false`). Declaring `public boolean equals(Object o)` with `@Override` would have exposed the mistake at compile time.',
      },
      {
        key: 'hash-set',
        code: `import java.util.HashSet;
import java.util.Set;

public class Main {
    public static void main(String[] args) {
        Set<Sku> seen = new HashSet<>();
        seen.add(new Sku("A-1"));
        seen.add(new Sku("A-1"));
        System.out.println(seen.size());
    }
}

class Sku {
    final String code;
    Sku(String code) { this.code = code; }

    public boolean equals(Sku other) {
        return code.equals(other.code);
    }

    @Override
    public int hashCode() { return code.hashCode(); }
}`,
        correct: '2',
        wrong: ['1', '0', 'It does not compile: equals must take an Object'],
        why: 'Both objects have the same hash code, so `HashSet` compares them with `equals(Object)`, which is not overridden and compares identity. The duplicate is kept. Overloading `equals` is legal Java, which is why `@Override` matters.',
      },
    ],
  ),
  ...b.compiles(
    'java-override-rules',
    3,
    'An override must keep the signature, may return a subtype, may not reduce visibility and may not throw broader checked exceptions.',
    [
      {
        key: 'covariant-return',
        code: `public class Main {
    public static void main(String[] args) {
        Invoice copy = new Invoice().copy();
        System.out.println(copy.getClass().getSimpleName());
    }
}

class Document {
    Document copy() { return new Document(); }
}

class Invoice extends Document {
    @Override
    Invoice copy() { return new Invoice(); }
}`,
        compiles: true,
        why: 'An overriding method may return a subtype of the original return type (a covariant return). Callers holding an `Invoice` get an `Invoice` without casting. It prints `Invoice`.',
      },
      {
        key: 'weaker-access',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(new Secret().toString());
    }
}

class Secret {
    @Override
    protected String toString() {
        return "hidden";
    }
}`,
        compiles: false,
        why: '`Object.toString()` is `public`, and an override cannot reduce visibility: “attempting to assign weaker access privileges; was public”. Otherwise code using an `Object` reference could call a method that is not accessible.',
      },
      {
        key: 'override-annotation',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(new Money(5).equals(new Money(5)));
    }
}

class Money {
    final int cents;
    Money(int cents) { this.cents = cents; }

    @Override
    public boolean equals(Money other) {
        return cents == other.cents;
    }
}`,
        compiles: false,
        why: '`@Override` makes the compiler check that the method really overrides something. `equals(Money)` does not override `equals(Object)`, so it is an error: “method does not override or implement a method from a supertype”. That is the point of the annotation.',
      },
      {
        key: 'checked-exception',
        code: `import java.io.IOException;

public class Main {
    public static void main(String[] args) throws Exception {
        System.out.println(new FileStore().load());
    }
}

class Store {
    String load() { return "memory"; }
}

class FileStore extends Store {
    @Override
    String load() throws IOException {
        return "file";
    }
}`,
        compiles: false,
        why: 'An override cannot throw checked exceptions that the overridden method does not declare: “overridden method does not throw java.io.IOException”. Callers using a `Store` reference are not prepared to handle it. Unchecked exceptions are not restricted.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-hiding-not-overriding',
    4,
    'Only instance methods are dispatched dynamically. Fields and static methods are resolved from the declared type.',
    [
      {
        key: 'field',
        code: `public class Main {
    public static void main(String[] args) {
        Plan plan = new ProPlan();
        System.out.println(plan.name + " " + plan.name());
    }
}

class Plan {
    String name = "basic";
    String name() { return name; }
}

class ProPlan extends Plan {
    String name = "pro";
    @Override
    String name() { return name; }
}`,
        correct: 'basic pro',
        wrong: ['pro pro', 'basic basic', 'pro basic'],
        why: 'The field `name` in `ProPlan` hides the one in `Plan`; the object has both. `plan.name` uses the declared type `Plan`, so it reads `basic`. The method `name()` is overridden and dispatches to `ProPlan`, whose body reads its own field, `pro`.',
      },
      {
        key: 'static',
        code: `public class Main {
    public static void main(String[] args) {
        Parser parser = new JsonParser();
        System.out.println(parser.kind() + " " + JsonParser.kind());
    }
}

class Parser {
    static String kind() { return "generic"; }
}

class JsonParser extends Parser {
    static String kind() { return "json"; }
}`,
        correct: 'generic json',
        wrong: ['json json', 'generic generic', 'It does not compile: static methods cannot be redeclared'],
        why: 'Static methods are hidden, not overridden. `parser.kind()` is resolved at compile time from the declared type `Parser` (calling a static method through an instance is legal but misleading). `JsonParser.kind()` names the subclass method explicitly.',
      },
      {
        key: 'private',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(new Child().run());
    }
}

class Parent {
    String run() { return step(); }
    private String step() { return "parent"; }
}

class Child extends Parent {
    String step() { return "child"; }
}`,
        correct: 'parent',
        wrong: ['child', 'It does not compile: step() cannot be redeclared', 'StackOverflowError'],
        why: 'Private methods are not inherited, so `Child.step()` does not override `Parent.step()`; it is an unrelated method. Inside `Parent.run`, the call to the private `step()` is bound to `Parent`’s version.',
      },
    ],
  ),
  ...b.fails(
    'java-polymorphism-debugging',
    2,
    'Read the stack trace from the top: which method was running, on which object, and which variable was `null`?',
    [
      {
        key: 'abstract-null',
        question: 'A new `Rule` subclass makes this pricing engine throw. What is the cause?',
        code: `import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Rule> rules = List.of(new Fixed(), new FromConfig());
        int price = 100;
        for (Rule r : rules) price = r.apply(price);
        System.out.println(price);
    }
}

abstract class Rule {
    abstract int apply(int price);
}

class Fixed extends Rule {
    int apply(int price) { return price - 10; }
}

class FromConfig extends Rule {
    private Integer percent;

    int apply(int price) { return price - price * percent / 100; }
}`,
        error: 'NullPointerException',
        correct: '`FromConfig.percent` is never set, so unboxing the `null` `Integer` in `apply` throws; initialize it (for example through the constructor) or use an `int`.',
        wrong: [
          'Abstract methods cannot be called through a `List<Rule>`; cast to the subclass first.',
          '`Fixed` does not use `@Override`, so its `apply` is never called and the price stays `null`.',
          '`List.of` cannot hold objects of different subclasses.',
        ],
        why: 'Dynamic dispatch works fine: `Fixed.apply` runs, then `FromConfig.apply`. There, `percent` is an `Integer` field with the default `null`, and `price * percent` unboxes it. `@Override` is optional (though recommended), and a `List<Rule>` can hold any subclass.',
      },
      {
        key: 'unsupported',
        question: 'Why does this report fail for one export format?',
        code: `import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Exporter> exporters = List.of(new CsvExporter(), new XmlExporter());
        for (Exporter e : exporters) System.out.println(e.export("total"));
    }
}

class Exporter {
    String export(String data) {
        throw new UnsupportedOperationException("export not implemented for " + getClass().getSimpleName());
    }
}

class CsvExporter extends Exporter {
    @Override
    String export(String data) { return data + ";"; }
}

class XmlExporter extends Exporter {
    String export(Object data) { return "<v>" + data + "</v>"; }
}`,
        error: 'UnsupportedOperationException: export not implemented for XmlExporter',
        correct: '`XmlExporter.export(Object)` overloads instead of overriding `export(String)`, so the base method runs and throws; change the parameter to `String` and add `@Override`.',
        wrong: [
          '`XmlExporter` must call `super.export(data)` first.',
          'Dynamic dispatch picks the method with the most general parameter type, which is the base method.',
          '`getClass()` returns `Exporter` in the base class, so the wrong method is chosen.',
        ],
        why: 'A method with a different parameter type is a new overload. Calls through an `Exporter` reference with a `String` argument resolve to `export(String)` at compile time, and `XmlExporter` does not override it, so the base implementation throws. `getClass()` returns the run-time class, which is why the message names `XmlExporter`. Making `Exporter` abstract with an abstract `export` would have caught this at compile time.',
      },
    ],
  ),
  ...b.output(
    'java-overridable-in-constructor',
    5,
    [
      'The superclass constructor runs before the subclass’s field initializers.',
      'Calling an overridable method from a constructor dispatches to the subclass, whose fields still have default values.',
    ],
    [
      {
        key: 'null-field',
        code: `public class Main {
    public static void main(String[] args) {
        new AuditedReport();
    }
}

class Report {
    Report() {
        describe();
    }

    void describe() {
        System.out.println("report");
    }
}

class AuditedReport extends Report {
    private String auditor = "ada";
    private int pages = 5;

    AuditedReport() {
        describe();
    }

    @Override
    void describe() {
        System.out.println(auditor + " " + pages);
    }
}`,
        output: 'null 0\nada 5',
        why: '`new AuditedReport()` first runs `Report()`, which calls `describe()`. Dynamic dispatch selects `AuditedReport.describe()`, but the subclass’s field initializers have not run yet, so it sees `null` and `0`. After `super()` returns, the initializers run and the second call sees `ada 5`. Never call overridable methods from a constructor.',
      },
      {
        key: 'validation',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(new LimitedAccount(500).limit);
    }
}

class Account {
    Account() {
        System.out.println("valid: " + isValid());
    }

    boolean isValid() {
        return true;
    }
}

class LimitedAccount extends Account {
    final int limit;

    LimitedAccount(int limit) {
        this.limit = limit;
    }

    @Override
    boolean isValid() {
        return limit > 0;
    }
}`,
        output: 'valid: false\n500',
        why: 'The `Account` constructor runs before `this.limit = limit`, and its call to `isValid()` dispatches to the override, which reads `limit` while it is still `0`. Even a `final` field can be observed with its default value this way. The validation result is wrong, although the object later ends up with `limit` `500`.',
      },
    ],
  ),
];
