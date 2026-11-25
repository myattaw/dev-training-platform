import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Collections (lists, sets, maps, queues, equals/hashCode, iteration and
 * immutability) and generics (type parameters, bounds, wildcards, erasure).
 */
const b = programBuilders('java');

// ---------------------------------------------------------------- Collections

export const collectionsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'java-list-basics',
    1,
    [
      '`add(element)` appends; `add(index, element)` inserts and shifts later elements right.',
      '`set` replaces an element and returns the old one.',
    ],
    [
      {
        key: 'add-insert',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<String> steps = new ArrayList<>();
        steps.add("pack");
        steps.add("ship");
        steps.add(0, "pay");
        steps.set(2, "deliver");
        System.out.println(steps + " " + steps.size());
    }
}`,
        output: '[pay, pack, deliver] 3',
        why: 'After two appends the list is `[pack, ship]`. `add(0, "pay")` inserts at the front: `[pay, pack, ship]`. `set(2, ...)` replaces `ship`; it does not insert, so the size stays 3.',
      },
      {
        key: 'index-of',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<String> tags = new ArrayList<>(List.of("java", "sql", "java"));
        System.out.println(tags.indexOf("java") + " " + tags.lastIndexOf("java") + " " + tags.indexOf("go"));
        tags.remove("java");
        System.out.println(tags);
    }
}`,
        output: '0 2 -1\n[sql, java]',
        why: 'Lists keep duplicates in insertion order. `indexOf` finds the first match, `lastIndexOf` the last, and a missing element gives `-1`. `remove(Object)` removes only the first occurrence.',
      },
      {
        key: 'sequenced',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Integer> queue = new ArrayList<>(List.of(3, 5, 8));
        queue.addFirst(1);
        System.out.println(queue.getFirst() + " " + queue.getLast());
        System.out.println(queue.reversed());
    }
}`,
        output: '1 8\n[8, 5, 3, 1]',
        why: 'Java 21 added sequenced collections: `List` now has `addFirst`, `getFirst`, `getLast` and `reversed()` (a reversed view). `addFirst(1)` inserts at index 0.',
      },
    ],
  ),
  ...b.concept(
    'java-choose-collection',
    2,
    'Ask what the data needs: duplicates or uniqueness, order (insertion or sorted), lookup by key, or first-in-first-out processing.',
    [
      {
        key: 'unique-ordered',
        question:
          'An import must remove duplicate email addresses but keep the first-seen order for the report. Which collection fits best?',
        correct: '`LinkedHashSet<String>`',
        wrong: ['`HashSet<String>`', '`TreeSet<String>`', '`ArrayList<String>`'],
        why: '`LinkedHashSet` rejects duplicates and iterates in insertion order. `HashSet` makes no ordering promise, `TreeSet` sorts alphabetically (losing the first-seen order), and `ArrayList` keeps duplicates unless you check `contains`, which is a linear scan each time.',
      },
      {
        key: 'sorted-lookup',
        question:
          'A pricing service looks up the tax rate for a date range: it needs “the entry with the greatest start date not after this date”. Which collection fits best?',
        correct: '`TreeMap<LocalDate, BigDecimal>` with `floorEntry(date)`',
        wrong: [
          '`HashMap<LocalDate, BigDecimal>` with `get(date)`',
          '`LinkedHashMap<LocalDate, BigDecimal>` iterated from the start',
          '`ArrayList<BigDecimal>` indexed by day of the year',
        ],
        why: 'A `TreeMap` keeps keys sorted and supports navigation: `floorEntry` finds the greatest key less than or equal to the argument in logarithmic time. `HashMap.get` only finds exact keys, and scanning a `LinkedHashMap` is linear and depends on insertion order.',
      },
      {
        key: 'fifo',
        question:
          'A background worker processes jobs in the order they arrive, adding at the tail and taking from the head. Which collection fits best for a single thread?',
        correct: '`ArrayDeque<Job>` used as a `Queue` (`offer` and `poll`)',
        wrong: [
          '`ArrayList<Job>` with `remove(0)`',
          '`Stack<Job>` with `push` and `pop`',
          '`TreeSet<Job>` ordered by arrival time',
        ],
        why: '`ArrayDeque` adds and removes at both ends in constant time. `ArrayList.remove(0)` shifts every remaining element, a `Stack` is last-in-first-out, and a `TreeSet` drops jobs that compare as equal and needs a comparator.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-set-ordering',
    2,
    'All sets reject duplicates. They differ in iteration order and in how they decide that two elements are “the same”.',
    [
      {
        key: 'linked-vs-tree',
        code: `import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

public class Main {
    public static void main(String[] args) {
        List<String> input = List.of("sql", "java", "aws", "java");
        Set<String> linked = new LinkedHashSet<>(input);
        Set<String> sorted = new TreeSet<>(input);
        System.out.println(linked + " " + sorted);
    }
}`,
        correct: '[sql, java, aws] [aws, java, sql]',
        wrong: [
          '[sql, java, aws, java] [aws, java, java, sql]',
          '[aws, java, sql] [sql, java, aws]',
          '[sql, java, aws] [sql, java, aws]',
        ],
        why: 'Both sets drop the duplicate `java`. `LinkedHashSet` iterates in insertion order (first insertion wins), and `TreeSet` iterates in sorted (natural) order.',
      },
      {
        key: 'comparator-dedupe',
        code: `import java.util.Set;
import java.util.TreeSet;

public class Main {
    public static void main(String[] args) {
        Set<String> users = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        users.add("Ada");
        users.add("ada");
        users.add("Linus");
        System.out.println(users + " " + users.contains("LINUS"));
    }
}`,
        correct: '[Ada, Linus] true',
        wrong: ['[Ada, ada, Linus] false', '[ada, Linus] true', '[Ada, ada, Linus] true'],
        why: 'A `TreeSet` decides equality with its comparator, not `equals`. Case-insensitively `"ada"` equals `"Ada"`, so the second `add` is ignored (the first element is kept), and `contains("LINUS")` is true.',
      },
      {
        key: 'add-returns',
        code: `import java.util.HashSet;
import java.util.Set;

public class Main {
    public static void main(String[] args) {
        Set<Integer> processed = new HashSet<>();
        System.out.println(processed.add(42));
        System.out.println(processed.add(42));
        System.out.println(processed.size());
    }
}`,
        correct: 'true\nfalse\n1',
        wrong: ['true\ntrue\n2', 'true\ntrue\n1', 'true\nfalse\n2'],
        why: '`Set.add` returns `true` only if the element was not already present. That makes it a convenient “first time seen?” check, for example to skip duplicate messages, without a separate `contains` call.',
      },
    ],
  ),
  ...b.output(
    'java-map-operations',
    2,
    [
      '`put` returns the previous value for the key (or `null`).',
      '`merge` and `computeIfAbsent` combine a lookup and an update in one call.',
    ],
    [
      {
        key: 'put-returns',
        code: `import java.util.HashMap;
import java.util.Map;

public class Main {
    public static void main(String[] args) {
        Map<String, Integer> stock = new HashMap<>();
        System.out.println(stock.put("pen", 10));
        System.out.println(stock.put("pen", 7));
        System.out.println(stock.get("pen") + " " + stock.getOrDefault("ink", 0));
    }
}`,
        output: 'null\n10\n7 0',
        why: 'A map holds one value per key. The first `put` had no previous value (`null`); the second replaces `10` and returns it. `getOrDefault` returns the default for a missing key.',
      },
      {
        key: 'merge-count',
        code: `import java.util.List;
import java.util.Map;
import java.util.TreeMap;

public class Main {
    public static void main(String[] args) {
        Map<String, Integer> counts = new TreeMap<>();
        for (String status : List.of("PAID", "NEW", "PAID", "PAID", "NEW", "SHIPPED")) {
            counts.merge(status, 1, Integer::sum);
        }
        System.out.println(counts);
    }
}`,
        output: '{NEW=2, PAID=3, SHIPPED=1}',
        why: '`merge(key, 1, Integer::sum)` stores `1` for a new key, otherwise it stores `old + 1`. A `TreeMap` prints its keys in sorted order.',
      },
      {
        key: 'compute-if-absent',
        code: `import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class Main {
    public static void main(String[] args) {
        Map<String, List<String>> byCity = new LinkedHashMap<>();
        String[][] customers = {{"ada", "London"}, {"linus", "Helsinki"}, {"alan", "London"}};
        for (String[] c : customers) {
            byCity.computeIfAbsent(c[1], city -> new ArrayList<>()).add(c[0]);
        }
        System.out.println(byCity);
    }
}`,
        output: '{London=[ada, alan], Helsinki=[linus]}',
        why: '`computeIfAbsent` creates the list the first time a city is seen and returns the existing list afterwards, so `.add` always works. `LinkedHashMap` keeps the keys in insertion order.',
      },
      {
        key: 'tree-navigation',
        code: `import java.util.TreeMap;

public class Main {
    public static void main(String[] args) {
        TreeMap<Integer, String> tiers = new TreeMap<>();
        tiers.put(0, "bronze");
        tiers.put(1000, "silver");
        tiers.put(5000, "gold");
        System.out.println(tiers.floorEntry(2500).getValue());
        System.out.println(tiers.ceilingKey(2500));
        System.out.println(tiers.headMap(1000));
    }
}`,
        output: 'silver\n5000\n{0=bronze}',
        why: '`floorEntry(2500)` is the greatest key not above 2500 (1000, `silver`). `ceilingKey(2500)` is the smallest key not below it (5000). `headMap(1000)` contains keys strictly less than 1000.',
      },
    ],
  ),
  ...b.output(
    'java-queues-deques',
    3,
    [
      '`ArrayDeque` can be a stack (`push`/`pop` at the head) or a queue (`offer` at the tail, `poll` at the head).',
      'A `PriorityQueue` returns elements in priority order from `poll`, but its `toString` shows the internal heap order.',
    ],
    [
      {
        key: 'stack-vs-queue',
        code: `import java.util.ArrayDeque;
import java.util.Deque;

public class Main {
    public static void main(String[] args) {
        Deque<String> stack = new ArrayDeque<>();
        Deque<String> queue = new ArrayDeque<>();
        for (String s : new String[] {"a", "b", "c"}) {
            stack.push(s);
            queue.offer(s);
        }
        System.out.println(stack.pop() + queue.poll());
        System.out.println(stack + " " + queue);
    }
}`,
        output: 'ca\n[b, a] [b, c]',
        why: '`push` adds at the head, so the stack is `[c, b, a]` and `pop` returns `c` (last in, first out). `offer` adds at the tail and `poll` removes from the head, so the queue returns `a` (first in, first out).',
      },
      {
        key: 'priority',
        code: `import java.util.PriorityQueue;

public class Main {
    public static void main(String[] args) {
        PriorityQueue<Integer> tickets = new PriorityQueue<>();
        tickets.add(3);
        tickets.add(1);
        tickets.add(2);
        System.out.println(tickets);
        StringBuilder order = new StringBuilder();
        while (!tickets.isEmpty()) order.append(tickets.poll());
        System.out.println(order);
    }
}`,
        output: '[1, 3, 2]\n123',
        why: 'A `PriorityQueue` is a binary heap: only the head is guaranteed to be the smallest. Its `toString` (and iteration) shows the array order `[1, 3, 2]`, not a sorted order. Repeated `poll` calls return elements in priority order.',
      },
      {
        key: 'empty',
        code: `import java.util.ArrayDeque;
import java.util.NoSuchElementException;
import java.util.Queue;

public class Main {
    public static void main(String[] args) {
        Queue<String> jobs = new ArrayDeque<>();
        System.out.println(jobs.poll());
        System.out.println(jobs.peek());
        try {
            jobs.remove();
        } catch (NoSuchElementException e) {
            System.out.println("remove threw");
        }
    }
}`,
        output: 'null\nnull\nremove threw',
        why: '`Queue` has two styles of methods: `poll` and `peek` return `null` on an empty queue, while `remove` and `element` throw `NoSuchElementException`. (That is also why `ArrayDeque` does not accept `null` elements.)',
      },
    ],
  ),
  ...b.outputChoice(
    'java-list-remove-overload',
    3,
    '`List` has `remove(int index)` and `remove(Object o)`. Which one does an `int` argument select?',
    [
      {
        key: 'index',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Integer> ids = new ArrayList<>(List.of(10, 20, 1, 30));
        ids.remove(1);
        System.out.println(ids);
    }
}`,
        correct: '[10, 1, 30]',
        wrong: ['[10, 20, 30]', '[20, 1, 30]', 'IndexOutOfBoundsException'],
        why: 'The argument `1` is an `int`, so overload resolution picks `remove(int index)` without boxing (an exact match beats boxing). It removes the element at index 1, which is `20`, not the value `1`.',
      },
      {
        key: 'boxed',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Integer> ids = new ArrayList<>(List.of(10, 20, 1, 30));
        ids.remove(Integer.valueOf(1));
        System.out.println(ids);
    }
}`,
        correct: '[10, 20, 30]',
        wrong: ['[10, 1, 30]', '[20, 1, 30]', 'It does not compile: the call is ambiguous'],
        why: 'An `Integer` argument matches `remove(Object)` directly, so the element equal to `1` is removed. Use `Integer.valueOf(x)` (or `removeIf`) when you mean the value.',
      },
      {
        key: 'set',
        code: `import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

public class Main {
    public static void main(String[] args) {
        Set<Integer> codes = new TreeSet<>(Set.of(0, 1, 2));
        List<Integer> list = new ArrayList<>(codes);
        codes.remove(2);
        list.remove(2);
        System.out.println(codes + " " + list);
    }
}`,
        correct: '[0, 1] [0, 1]',
        wrong: ['[0, 1] [0, 2]', '[0, 2] [0, 1]', '[1, 2] [0, 1]'],
        why: '`Set` has only `remove(Object)`, so `2` is boxed and the value is removed. The list removes index 2, which here also happens to hold `2`. The same code would remove different elements as soon as the list order or values change, which makes this bug easy to miss in tests.',
      },
    ],
  ),
  ...b.fails(
    'java-concurrent-modification',
    3,
    'Changing a collection while a for-each loop iterates over it (other than through the iterator) is detected on the next step of the iterator.',
    [
      {
        key: 'for-each-remove',
        question: 'This cleanup job throws. What is the cause and the right fix?',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<String> sessions = new ArrayList<>(List.of("a-live", "b-expired", "c-live", "d-live"));
        for (String s : sessions) {
            if (s.endsWith("expired")) sessions.remove(s);
        }
        System.out.println(sessions);
    }
}`,
        error: 'ConcurrentModificationException',
        correct:
          'The list is structurally modified during the for-each loop, so the iterator fails fast on its next step; use `sessions.removeIf(s -> s.endsWith("expired"))` or `Iterator.remove()`.',
        wrong: [
          'Another thread changed the list; wrap it with `Collections.synchronizedList`.',
          '`remove(Object)` cannot be used on an `ArrayList` created from `List.of`.',
          'The loop variable `s` is `final`, so the element cannot be removed.',
        ],
        why: 'There is only one thread: `ConcurrentModificationException` means the collection changed behind the iterator’s back. `removeIf` or the iterator’s own `remove()` update the collection safely. `new ArrayList<>(List.of(...))` is a normal mutable list.',
      },
      {
        key: 'map-keys',
        question: 'Why does this cache eviction throw?',
        code: `import java.util.Map;
import java.util.TreeMap;

public class Main {
    public static void main(String[] args) {
        Map<String, Integer> ages = new TreeMap<>(Map.of("a", 90, "b", 5, "c", 70));
        for (String key : ages.keySet()) {
            if (ages.get(key) > 60) ages.remove(key);
        }
        System.out.println(ages);
    }
}`,
        error: 'ConcurrentModificationException',
        correct:
          'Removing from the map while iterating its `keySet()` invalidates the iterator; use `ages.values().removeIf(age -> age > 60)` or `ages.entrySet().removeIf(...)`.',
        wrong: [
          '`TreeMap` does not support `remove`; use a `HashMap`.',
          '`keySet()` returns a copy, so the removal affects the wrong map.',
          '`ages.get(key)` returns `null` for removed keys, which causes the exception.',
        ],
        why: '`keySet()` is a live view of the map, and its iterator is fail-fast: removing `a` through the map makes the next iteration step throw. The views support `removeIf`, which removes entries safely through the iterator.',
      },
      {
        key: 'nested-add',
        question: 'Why does this order duplication feature throw?',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<String> lines = new ArrayList<>(List.of("pen", "paper"));
        for (String line : lines) {
            if (line.equals("pen")) lines.add("pen refill");
        }
        System.out.println(lines);
    }
}`,
        error: 'ConcurrentModificationException',
        correct:
          'Adding to the list during the for-each loop is also a structural modification; collect the new lines in a separate list and call `addAll` after the loop.',
        wrong: [
          'Only `remove` causes this exception; the problem is that `"pen"` is compared with `equals`.',
          '`ArrayList` has a fixed capacity, so `add` fails when the list is full.',
          'For-each loops over a `List` iterate over a snapshot, so the exception comes from `println`.',
        ],
        why: 'Any structural change (adding or removing) through the list, not through the iterator, makes the iterator throw on its next `next()`. For-each loops do not iterate over a snapshot. `ArrayList` grows as needed.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-hashcode-contract',
    4,
    'Hash-based collections first use `hashCode` to find a bucket, then `equals` inside it. Equal objects must have equal hash codes.',
    [
      {
        key: 'equals-only',
        code: `import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

public class Main {
    public static void main(String[] args) {
        Set<Email> emails = new HashSet<>();
        emails.add(new Email("ada@example.com"));
        System.out.println(new Email("ada@example.com").equals(new Email("ada@example.com")));
        System.out.println(emails.contains(new Email("ada@example.com")));
    }
}

class Email {
    private final String value;
    Email(String value) { this.value = value; }

    @Override
    public boolean equals(Object o) {
        return o instanceof Email other && Objects.equals(value, other.value);
    }
}`,
        correct: 'true\nfalse',
        wrong: ['true\ntrue', 'false\nfalse', 'false\ntrue'],
        why: '`equals` is overridden but `hashCode` is not, so two equal emails (almost certainly) have different identity hash codes and land in different buckets; `contains` never calls `equals`. Overriding `equals` without `hashCode` breaks the contract. A `record` generates both.',
      },
      {
        key: 'map-key',
        code: `import java.util.HashMap;
import java.util.Map;

public class Main {
    public static void main(String[] args) {
        Map<OrderKey, String> status = new HashMap<>();
        status.put(new OrderKey("EU", 7), "PAID");
        System.out.println(status.get(new OrderKey("EU", 7)));
    }
}

record OrderKey(String region, int number) {}`,
        correct: 'PAID',
        wrong: ['null', 'OrderKey[region=EU, number=7]', 'NullPointerException'],
        why: 'Records generate `equals` and `hashCode` from all components, so a new `OrderKey("EU", 7)` finds the entry. Records are the simplest way to build correct composite keys.',
      },
      {
        key: 'inconsistent',
        code: `import java.util.HashSet;
import java.util.Set;

public class Main {
    public static void main(String[] args) {
        Set<Product> products = new HashSet<>();
        products.add(new Product("p-1", "Pen"));
        products.add(new Product("p-1", "Pen (blue)"));
        System.out.println(products.size());
    }
}

class Product {
    final String id;
    final String name;
    Product(String id, String name) { this.id = id; this.name = name; }

    @Override
    public boolean equals(Object o) {
        return o instanceof Product p && id.equals(p.id);
    }

    @Override
    public int hashCode() {
        return name.hashCode();
    }
}`,
        correct: '2',
        wrong: ['1', '0', 'IllegalStateException'],
        why: 'The two products are equal by `equals` (same id), but `hashCode` uses `name`, which differs, so they usually land in different buckets and both are stored. `hashCode` must be computed from the same fields as `equals` (or a subset of them).',
      },
    ],
  ),
  ...b.fails(
    'java-immutable-collections',
    4,
    'Which factory methods return unmodifiable or fixed-size collections, and what do they do with `null`?',
    [
      {
        key: 'list-of-add',
        question: 'A service adds a default role and crashes. Why?',
        code: `import java.util.List;

public class Main {
    static List<String> rolesFor(String user) {
        return List.of("USER");
    }

    public static void main(String[] args) {
        List<String> roles = rolesFor("ada");
        roles.add("AUDITOR");
        System.out.println(roles);
    }
}`,
        error: 'UnsupportedOperationException',
        correct:
          '`List.of` returns an unmodifiable list, so `add` throws; copy it into a mutable list (`new ArrayList<>(roles)`) before changing it.',
        wrong: [
          '`List.of` returns a fixed-size array view; `set` would also throw `ArrayIndexOutOfBoundsException`.',
          'Lists returned from a method are read-only in Java.',
          '`"AUDITOR"` is not one of the original elements, so it is rejected.',
        ],
        why: '`List.of`, `Set.of`, `Map.of`, `List.copyOf` and `Stream.toList()` return unmodifiable collections: every mutator throws `UnsupportedOperationException`. Returning one from a method is fine; the caller must copy it to change it.',
      },
      {
        key: 'as-list',
        question: 'Why does this code throw, although `set` on the same list works?',
        code: `import java.util.Arrays;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        String[] codes = {"A", "B"};
        List<String> list = Arrays.asList(codes);
        list.set(0, "Z");
        System.out.println(codes[0]);
        list.add("C");
    }
}`,
        error: 'UnsupportedOperationException',
        correct:
          '`Arrays.asList` returns a fixed-size list backed by the array: `set` writes through to the array (it printed `Z`), but `add` and `remove` throw.',
        wrong: [
          '`Arrays.asList` copies the array into an unmodifiable list, so `set` should also have thrown.',
          '`add` throws `ArrayIndexOutOfBoundsException` because the array is full.',
          'Arrays of `String` cannot be converted to a list.',
        ],
        why: '`Arrays.asList` is a view of the array: it cannot grow or shrink, but elements can be replaced, and changes are visible in the array too (it printed `Z`). `new ArrayList<>(Arrays.asList(...))` or `List.of` give you a growable or a truly unmodifiable list respectively.',
      },
      {
        key: 'contains-null',
        question: 'A validation helper throws for a missing value. Why?',
        code: `import java.util.List;

public class Main {
    static final List<String> ALLOWED = List.of("EUR", "USD");

    static boolean isAllowed(String currency) {
        return ALLOWED.contains(currency);
    }

    public static void main(String[] args) {
        System.out.println(isAllowed("EUR"));
        System.out.println(isAllowed(null));
    }
}`,
        error: 'NullPointerException',
        correct:
          'The immutable lists from `List.of` reject `null` everywhere, including `contains(null)`, which throws; check for `null` before calling it.',
        wrong: [
          '`contains` throws for any value that is not in the list.',
          'Static final lists cannot be read from a static method.',
          '`List.of` lists are lazily created and are still `null` here.',
        ],
        why: 'The `List.of` collections do not allow `null` elements, and their `contains`/`indexOf` throw `NullPointerException` for a `null` argument (an `ArrayList` would simply return `false`). A missing value should be handled explicitly before the lookup.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-unmodifiable-view',
    5,
    'Is the result a read-only view of another collection, or an independent copy?',
    [
      {
        key: 'view',
        code: `import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<String> source = new ArrayList<>(List.of("a"));
        List<String> view = Collections.unmodifiableList(source);
        List<String> copy = List.copyOf(source);
        source.add("b");
        System.out.println(view + " " + copy);
    }
}`,
        correct: '[a, b] [a]',
        wrong: ['[a] [a]', '[a, b] [a, b]', 'UnsupportedOperationException'],
        why: '`Collections.unmodifiableList` returns a read-only view: it cannot be changed through `view`, but changes to `source` show through it. `List.copyOf` makes an independent unmodifiable copy. Only the copy is truly immutable.',
      },
      {
        key: 'record-list',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<String> items = new ArrayList<>(List.of("pen"));
        Order order = new Order("o-1", items);
        items.add("ink");
        order.items().add("paper");
        System.out.println(order.items().size());
    }
}

record Order(String id, List<String> items) {}`,
        correct: '3',
        wrong: ['1', '2', 'UnsupportedOperationException'],
        why: 'Records are shallowly immutable: the `items` component cannot be reassigned, but it refers to the caller’s mutable list. Both the caller and the accessor can change it. A compact constructor with `items = List.copyOf(items);` makes the record truly immutable.',
      },
      {
        key: 'record-copy',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<String> items = new ArrayList<>(List.of("pen"));
        Order order = new Order("o-1", items);
        items.add("ink");
        try {
            order.items().add("paper");
        } catch (UnsupportedOperationException e) {
            System.out.println("read-only");
        }
        System.out.println(order.items().size());
    }
}

record Order(String id, List<String> items) {
    Order {
        items = List.copyOf(items);
    }
}`,
        correct: 'read-only\n1',
        wrong: ['read-only\n2', '3', '2'],
        why: 'The compact constructor replaces the parameter with an unmodifiable copy before it is assigned to the field. Later changes to the caller’s list do not affect the record, and the accessor returns a list that rejects `add`.',
      },
    ],
  ),
  ...b.output(
    'java-mutable-keys',
    5,
    [
      'A hash set stores an element in a bucket chosen by its hash code at insertion time.',
      'If a field used by `hashCode` changes afterwards, lookups search the wrong bucket.',
    ],
    [
      {
        key: 'set',
        code: `import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

public class Main {
    public static void main(String[] args) {
        Set<Customer> vips = new HashSet<>();
        Customer c = new Customer("ada@old.example");
        vips.add(c);
        c.email = "ada@new.example";
        System.out.println(vips.contains(c) + " " + vips.size());
        vips.add(c);
        System.out.println(vips.size());
    }
}

class Customer {
    String email;
    Customer(String email) { this.email = email; }

    @Override
    public boolean equals(Object o) {
        return o instanceof Customer other && Objects.equals(email, other.email);
    }

    @Override
    public int hashCode() { return Objects.hash(email); }
}`,
        output: 'false 1\n2',
        why: 'The customer was stored under the hash of the old email. After the change, `contains(c)` looks in the bucket for the new hash and does not find it, even though it is the same object. Adding it again stores a second entry for the same object. Keys and set elements should be immutable (for example records with immutable components).',
      },
      {
        key: 'map',
        code: `import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class Main {
    public static void main(String[] args) {
        Map<List<String>, Integer> prices = new HashMap<>();
        List<String> bundle = new ArrayList<>(List.of("pen", "ink"));
        prices.put(bundle, 12);
        bundle.add("paper");
        System.out.println(prices.get(bundle));
        System.out.println(prices.get(List.of("pen", "ink")));
        System.out.println(prices.size());
    }
}`,
        output: 'null\nnull\n1',
        why: 'List hash codes depend on the elements. After `add`, the key’s hash no longer matches the bucket it was stored in, so `get(bundle)` misses. A new `[pen, ink]` list has the right hash and finds the bucket, but the stored key is now `[pen, ink, paper]`, so `equals` fails. The entry is still in the map but unreachable.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Generics

export const genericsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'java-generic-types',
    1,
    [
      'A type parameter (`T`, `K`, `V`) is replaced by the type argument you use, so the compiler checks types without casts.',
    ],
    [
      {
        key: 'box',
        code: `public class Main {
    public static void main(String[] args) {
        Result<Integer> ok = Result.success(42);
        Result<Integer> failed = Result.failure("timeout");
        System.out.println(ok.valueOr(0) + 1);
        System.out.println(failed.valueOr(0) + 1);
    }
}

class Result<T> {
    private final T value;
    private final String error;

    private Result(T value, String error) {
        this.value = value;
        this.error = error;
    }

    static <T> Result<T> success(T value) { return new Result<>(value, null); }
    static <T> Result<T> failure(String error) { return new Result<>(null, error); }

    T valueOr(T fallback) { return error == null ? value : fallback; }
}`,
        output: '43\n1',
        why: '`Result<Integer>` makes `valueOr` return an `Integer`, so `+ 1` is numeric addition with no cast. The failure returns the fallback `0`.',
      },
      {
        key: 'pair-record',
        code: `public class Main {
    public static void main(String[] args) {
        Pair<String, Integer> line = new Pair<>("pen", 3);
        Pair<Integer, String> swapped = line.swap();
        System.out.println(swapped);
        System.out.println(swapped.first() * 2);
    }
}

record Pair<A, B>(A first, B second) {
    Pair<B, A> swap() {
        return new Pair<>(second, first);
    }
}`,
        output: 'Pair[first=3, second=pen]\n6',
        why: 'Records can be generic. `swap()` returns a `Pair<B, A>`, so `swapped.first()` is an `Integer` and can be multiplied directly.',
      },
      {
        key: 'generic-method',
        code: `import java.util.List;

public class Main {
    static <T> T lastOr(List<T> items, T fallback) {
        return items.isEmpty() ? fallback : items.get(items.size() - 1);
    }

    public static void main(String[] args) {
        String name = lastOr(List.of("ada", "linus"), "none");
        Integer id = lastOr(List.<Integer>of(), -1);
        System.out.println(name + " " + id);
    }
}`,
        output: 'linus -1',
        why: 'The type parameter `<T>` is declared before the return type and inferred from the arguments at each call: `String` for the first call, `Integer` for the second (here written explicitly with `List.<Integer>of()`).',
      },
    ],
  ),
  ...b.compiles(
    'java-generic-invariance',
    2,
    '`List<Integer>` is not a `List<Number>`, even though `Integer` is a `Number`. Wildcards (`? extends`, `? super`) express the relationships you need.',
    [
      {
        key: 'invariant',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Integer> quantities = new ArrayList<>();
        List<Number> numbers = quantities;
        numbers.add(2.5);
        System.out.println(quantities);
    }
}`,
        compiles: false,
        why: 'Generic types are invariant: `List<Integer>` cannot be assigned to `List<Number>`. If it could, `numbers.add(2.5)` would put a `Double` into a list of integers. Arrays allow this and fail at run time instead (`ArrayStoreException`).',
      },
      {
        key: 'extends-read',
        code: `import java.util.List;

public class Main {
    static double total(List<? extends Number> values) {
        double sum = 0;
        for (Number n : values) sum += n.doubleValue();
        return sum;
    }

    public static void main(String[] args) {
        System.out.println(total(List.of(1, 2, 3)) + total(List.of(0.5)));
    }
}`,
        compiles: true,
        why: '`List<? extends Number>` accepts a list of any `Number` subtype, and reading elements as `Number` is safe. It prints `6.5`.',
      },
      {
        key: 'extends-write',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<? extends Number> values = new ArrayList<Integer>();
        values.add(1);
        System.out.println(values);
    }
}`,
        compiles: false,
        why: 'The compiler only knows that `values` is a list of some unknown subtype of `Number`; it might be a `List<Double>`, so adding an `Integer` is rejected. With `? extends`, you can read but not add (except `null`).',
      },
      {
        key: 'super-write',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    static void addDefaults(List<? super Integer> target) {
        target.add(0);
        target.add(100);
    }

    public static void main(String[] args) {
        List<Number> numbers = new ArrayList<>();
        List<Object> objects = new ArrayList<>();
        addDefaults(numbers);
        addDefaults(objects);
        System.out.println(numbers + " " + objects);
    }
}`,
        compiles: true,
        why: '`List<? super Integer>` accepts a list of `Integer` or any supertype, and adding an `Integer` is always safe. It prints `[0, 100] [0, 100]`.',
      },
    ],
  ),
  ...b.compiles(
    'java-bounded-type-parameters',
    3,
    'Inside a generic method, you can only call methods that the bound of `T` guarantees.',
    [
      {
        key: 'no-bound',
        code: `import java.util.List;

public class Main {
    static <T> T max(List<T> items) {
        T best = items.get(0);
        for (T item : items) {
            if (item.compareTo(best) > 0) best = item;
        }
        return best;
    }

    public static void main(String[] args) {
        System.out.println(max(List.of(3, 9, 4)));
    }
}`,
        compiles: false,
        why: 'An unbounded `T` is only known to be an `Object`, which has no `compareTo` method. Declare `<T extends Comparable<T>>` (or `<T extends Comparable<? super T>>`) so the compiler knows every `T` can be compared.',
      },
      {
        key: 'with-bound',
        code: `import java.util.List;

public class Main {
    static <T extends Comparable<T>> T max(List<T> items) {
        T best = items.get(0);
        for (T item : items) {
            if (item.compareTo(best) > 0) best = item;
        }
        return best;
    }

    public static void main(String[] args) {
        System.out.println(max(List.of(3, 9, 4)) + " " + max(List.of("b", "c", "a")));
    }
}`,
        compiles: true,
        why: 'The bound makes `compareTo` available, and both `Integer` and `String` implement `Comparable` of themselves. It prints `9 c`.',
      },
      {
        key: 'not-comparable',
        code: `import java.util.List;

public class Main {
    static <T extends Comparable<T>> T max(List<T> items) {
        T best = items.get(0);
        for (T item : items) {
            if (item.compareTo(best) > 0) best = item;
        }
        return best;
    }

    public static void main(String[] args) {
        System.out.println(max(List.of(new Invoice(10), new Invoice(20))));
    }
}

record Invoice(int total) {}`,
        compiles: false,
        why: '`Invoice` does not implement `Comparable<Invoice>`, so it does not satisfy the bound: “inference variable T has incompatible bounds”. Implement `Comparable`, or pass a `Comparator<Invoice>` to the method instead.',
      },
      {
        key: 'multiple-bounds',
        code: `public class Main {
    static <T extends Number & Comparable<T>> boolean exceeds(T value, T limit) {
        return value.compareTo(limit) > 0 && value.doubleValue() > 0;
    }

    public static void main(String[] args) {
        System.out.println(exceeds(120, 100) + " " + exceeds(2.5, 3.0));
    }
}`,
        compiles: true,
        why: 'A type parameter can have several bounds joined with `&` (a class first, then interfaces). `T` then has both `Number` methods (`doubleValue`) and `compareTo`. It prints `true false`.',
      },
    ],
  ),
  ...b.blank(
    'java-generic-method-declaration',
    3,
    'A generic method declares its type parameters in angle brackets before the return type; a bound uses `extends`.',
    [
      {
        key: 'max-by',
        prompt:
          'Complete the declaration so that `maxOf` works for any type whose elements can be compared with each other.',
        template: `import java.util.List;

public class Main {
    static {{blank:tp}} T maxOf(List<T> items) {
        T best = items.get(0);
        for (T item : items) {
            if (item.compareTo(best) > 0) best = item;
        }
        return best;
    }

    public static void main(String[] args) {
        System.out.println(maxOf(List.of(4, 11, 7)));
        System.out.println(maxOf(List.of("pear", "apple")));
    }
}`,
        blanks: {
          tp: ['<T extends Comparable<T>>', '<T extends Comparable<? super T>>'],
        },
        why: '`<T extends Comparable<T>>` declares the type parameter and promises `compareTo`. The more flexible `<T extends Comparable<? super T>>` (the form used by `Collections.max`) also accepts types that inherit `compareTo` from a supertype.',
      },
      {
        key: 'copy',
        prompt:
          'Complete the parameter types so that `copyInto` can copy a `List<Integer>` into a `List<Number>` (producer extends, consumer super).',
        template: `import java.util.ArrayList;
import java.util.List;

public class Main {
    static <T> void copyInto(List<{{blank:src}}> source, List<{{blank:dst}}> target) {
        for (T item : source) target.add(item);
    }

    public static void main(String[] args) {
        List<Integer> ids = List.of(1, 2);
        List<Number> all = new ArrayList<>(List.of(0.5));
        copyInto(ids, all);
        System.out.println(all);
    }
}`,
        blanks: {
          src: ['? extends T'],
          dst: ['? super T'],
        },
        why: 'The source produces `T` values, so it is `List<? extends T>`; the target consumes them, so it is `List<? super T>`. With `T` inferred as `Integer` (or `Number`), the call compiles and prints `[0.5, 1, 2]`. This is the PECS rule: Producer Extends, Consumer Super.',
      },
    ],
  ),
  ...b.whichCompile(
    'java-wildcards-pecs',
    4,
    'For each call, find a `T` that makes the source a producer of `T` (`? extends T`) and the target a consumer of `T` (`? super T`).',
    [
      {
        key: 'copy-calls',
        question: 'Which of these classes compile?',
        prelude: `import java.util.List;

class Lists {
    static <T> void copy(List<? extends T> source, List<? super T> target) {
        for (T item : source) target.add(item);
    }
}`,
        options: [
          'class A { void run(List<Integer> ints, List<Number> nums) { Lists.copy(ints, nums); } }',
          'class B { void run(List<Integer> ints, List<Object> objs) { Lists.copy(ints, objs); } }',
          'class C { void run(List<Number> nums, List<Integer> ints) { Lists.copy(nums, ints); } }',
          'class D { void run(List<String> strs, List<Number> nums) { Lists.copy(strs, nums); } }',
        ],
        correct: [
          'class A { void run(List<Integer> ints, List<Number> nums) { Lists.copy(ints, nums); } }',
          'class B { void run(List<Integer> ints, List<Object> objs) { Lists.copy(ints, objs); } }',
        ],
        why: 'Integers can be copied into a list of `Number` or `Object` (`T` = `Integer` works). Copying `Number`s into a `List<Integer>` would put a `Double` into a list of integers, and `String` and `Number` share no `T` except `Object`, which a `List<Number>` cannot consume.',
      },
      {
        key: 'read-write',
        question: 'Which of these classes compile?',
        prelude: `import java.util.ArrayList;
import java.util.List;`,
        options: [
          'class A { Number first(List<? extends Number> xs) { return xs.get(0); } }',
          'class B { void add(List<? extends Number> xs) { xs.add(1); } }',
          'class C { void add(List<? super Integer> xs) { xs.add(1); } }',
          'class D { Integer first(List<? super Integer> xs) { return xs.get(0); } }',
          'class E { int size(List<?> xs) { return xs.size(); } }',
        ],
        correct: [
          'class A { Number first(List<? extends Number> xs) { return xs.get(0); } }',
          'class C { void add(List<? super Integer> xs) { xs.add(1); } }',
          'class E { int size(List<?> xs) { return xs.size(); } }',
        ],
        why: 'A `? extends Number` list can be read as `Number` but not added to. A `? super Integer` list accepts `Integer`s, but reading only gives `Object`, so returning it as `Integer` does not compile. `List<?>` supports operations that do not depend on the element type, such as `size()`.',
      },
    ],
  ),
  ...b.fails(
    'java-raw-types',
    4,
    'A raw type (`List` without `<...>`) switches off generic type checking. Where does the wrong element finally cause a failure?',
    [
      {
        key: 'legacy-helper',
        question:
          'A legacy helper with a raw `List` parameter is called from new code. Where and why does it fail?',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    @SuppressWarnings({"rawtypes", "unchecked"})
    static void addLegacyCodes(List codes) {
        codes.add(404);
    }

    public static void main(String[] args) {
        List<String> codes = new ArrayList<>();
        codes.add("200");
        addLegacyCodes(codes);
        for (String code : codes) {
            System.out.println(code.length());
        }
    }
}`,
        error: 'ClassCastException',
        correct:
          'The raw `List` lets an `Integer` into a `List<String>` without any check; the failure appears later, where the loop casts the element to `String`.',
        wrong: [
          '`codes.add(404)` throws immediately because the list knows it holds strings.',
          '`404` is converted to `"404"` when it is added to a `List<String>`.',
          'Raw types are a compile error since Java 5, so the code cannot run.',
        ],
        why: 'Because of type erasure, an `ArrayList<String>` is just an `ArrayList` at run time and cannot reject the `Integer`. The compiler inserts a cast to `String` where the element is read, which throws far from the real bug (heap pollution). Avoid raw types and do not suppress unchecked warnings without a reason.',
      },
      {
        key: 'unchecked-cast',
        question: 'Why does this cache read fail, and why only at the second line?',
        code: `import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class Main {
    static final Map<String, Object> cache = new HashMap<>();

    @SuppressWarnings("unchecked")
    static <T> T get(String key) {
        return (T) cache.get(key);
    }

    public static void main(String[] args) {
        cache.put("ids", List.of(1, 2));
        List<String> ids = get("ids");
        System.out.println(ids.size());
        String first = ids.get(0);
        System.out.println(first);
    }
}`,
        error: 'ClassCastException',
        correct:
          'The cast `(T)` is unchecked (erased), so `get` returns the `List<Integer>` as a `List<String>`; the real cast to `String` happens only when an element is read.',
        wrong: [
          '`(T)` checks the type at run time, but `List.of` lists are immutable.',
          '`ids.size()` throws first because the list type is wrong.',
          'The `HashMap` converts the stored list to `List<Object>`.',
        ],
        why: 'After erasure, `(T)` is a cast to `Object` and checks nothing. `ids.size()` works because it does not touch elements. `String first = ids.get(0)` contains a compiler-inserted cast, which finally throws: `Integer cannot be cast to String`. Unchecked casts move type errors away from their cause.',
      },
    ],
  ),
  ...b.compiles(
    'java-type-erasure',
    5,
    'Generic type arguments do not exist at run time (erasure). Anything that needs `T` or `List<String>` at run time is rejected.',
    [
      {
        key: 'new-t',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        System.out.println(new Factory<StringBuilder>().create());
    }
}

class Factory<T> {
    T create() {
        return new T();
    }
}`,
        compiles: false,
        why: 'The compiler cannot generate `new T()` because `T` is erased: at run time the class does not know what `T` is. Pass a `Supplier<T>` (for example `StringBuilder::new`) or a `Class<T>` instead.',
      },
      {
        key: 'same-erasure',
        code: `import java.util.List;

public class Main {
    static int total(List<Integer> amounts) { return amounts.size(); }
    static int total(List<String> names) { return names.size(); }

    public static void main(String[] args) {
        System.out.println(total(List.of(1, 2)));
    }
}`,
        compiles: false,
        why: 'Both methods erase to `total(List)`, so they would have the same signature in the class file: “name clash: total(List<String>) and total(List<Integer>) have the same erasure”. Give the methods different names.',
      },
      {
        key: 'instanceof-generic',
        code: `import java.util.List;

public class Main {
    public static void main(String[] args) {
        Object payload = List.of("a");
        if (payload instanceof List<String> names) {
            System.out.println(names.size());
        }
    }
}`,
        compiles: false,
        why: 'At run time the JVM can check `List` but not `List<String>`, so `instanceof` with a non-reifiable type from `Object` is rejected (“Object cannot be safely cast to List<String>”). Test `payload instanceof List<?> list` and check the elements.',
      },
      {
        key: 'wildcard-instanceof',
        code: `import java.util.List;

public class Main {
    public static void main(String[] args) {
        Object payload = List.of("a", "b");
        if (payload instanceof List<?> items) {
            System.out.println(items.size());
        }
    }
}`,
        compiles: true,
        why: '`List<?>` is reifiable (it says nothing about the element type), so the check is possible at run time. It prints `2`.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-erasure-runtime',
    4,
    'What does the JVM know about a generic object at run time?',
    [
      {
        key: 'get-class',
        code: `import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<String> names = new ArrayList<>();
        List<Integer> ids = new ArrayList<>();
        System.out.println(names.getClass() == ids.getClass());
        System.out.println(names.getClass().getSimpleName());
    }
}`,
        correct: 'true\nArrayList',
        wrong: ['false\nArrayList<String>', 'true\nArrayList<String>', 'false\nArrayList'],
        why: 'Type arguments are erased: both objects are instances of the same class, `ArrayList`. That is why frameworks such as Jackson need extra type information (for example a `TypeReference`) to deserialize a `List<Order>`.',
      },
      {
        key: 'static-shared',
        code: `public class Main {
    public static void main(String[] args) {
        new Counter<String>();
        new Counter<Integer>();
        new Counter<String>();
        System.out.println(Counter.created);
    }
}

class Counter<T> {
    static int created = 0;
    Counter() { created++; }
}`,
        correct: '3',
        wrong: ['2', '1', 'It does not compile: static fields cannot be used in a generic class'],
        why: 'There is only one class `Counter` at run time, whatever the type argument, so its static field is shared by all parameterizations. (A static field of type `T` is not allowed for the same reason.)',
      },
    ],
  ),
];
