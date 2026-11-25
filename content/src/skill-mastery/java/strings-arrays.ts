import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Strings and arrays: immutability, string equality, StringBuilder, common
 * String methods, arrays, multidimensional arrays and java.util.Arrays.
 */
const b = programBuilders('java');

export const stringsArraysFamilies: readonly QuestionSource[] = [
  ...b.output(
    'java-string-immutability',
    1,
    [
      'A `String` can never change. Methods such as `toUpperCase` and `replace` return a new string.',
      'If the result of a method is not assigned, it is lost.',
    ],
    [
      {
        key: 'to-upper',
        code: `public class Main {
    public static void main(String[] args) {
        String code = "eur";
        code.toUpperCase();
        System.out.println(code);
    }
}`,
        output: 'eur',
        why: '`toUpperCase()` returns a new string `"EUR"`, but the result is discarded. `code` still refers to the original, unchanged `"eur"`. Write `code = code.toUpperCase();`.',
      },
      {
        key: 'shared-reference',
        code: `public class Main {
    public static void main(String[] args) {
        String original = "order";
        String alias = original;
        alias += "-42";
        System.out.println(original);
        System.out.println(alias);
    }
}`,
        output: 'order\norder-42',
        why: '`alias += "-42"` creates a new string and points `alias` at it. The string `original` refers to cannot change, so `original` still prints `order`.',
      },
      {
        key: 'replace-chain',
        code: `public class Main {
    public static void main(String[] args) {
        String sku = " ab-12 ";
        sku.trim();
        String clean = sku.trim().replace("-", "").toUpperCase();
        System.out.println("[" + sku + "]");
        System.out.println("[" + clean + "]");
    }
}`,
        output: '[ ab-12 ]\n[AB12]',
        why: 'The first `sku.trim()` result is thrown away, so `sku` keeps its spaces. The chained call works because each method returns a new string that the next method is called on, and the final result is assigned to `clean`.',
      },
    ],
  ),
  ...b.output(
    'java-string-methods',
    2,
    [
      '`substring(begin, end)` includes `begin` and excludes `end`.',
      '`indexOf` returns `-1` when the text is not found.',
    ],
    [
      {
        key: 'substring',
        code: `public class Main {
    public static void main(String[] args) {
        String invoice = "INV-2024-0042";
        System.out.println(invoice.substring(4, 8));
        System.out.println(invoice.substring(invoice.lastIndexOf('-') + 1));
    }
}`,
        output: '2024\n0042',
        why: '`substring(4, 8)` returns the characters at indexes 4 to 7: `2024`. `lastIndexOf(\'-\')` is `8`, so `substring(9)` returns the rest of the string from index 9: `0042`.',
      },
      {
        key: 'index-of',
        code: `public class Main {
    public static void main(String[] args) {
        String email = "ada@example.com";
        int at = email.indexOf('@');
        System.out.println(email.substring(0, at));
        System.out.println(email.indexOf("#"));
        System.out.println(email.contains("example"));
    }
}`,
        output: 'ada\n-1\ntrue',
        why: '`indexOf(\'@\')` is `3`, so `substring(0, 3)` is `ada`. A missing character gives `-1` (no exception), and `contains` checks for a substring.',
      },
      {
        key: 'join-repeat',
        code: `import java.util.List;

public class Main {
    public static void main(String[] args) {
        System.out.println(String.join(" | ", List.of("id", "name", "total")));
        System.out.println("-".repeat(5));
        System.out.println("  ".isBlank() + " " + "  ".isEmpty());
    }
}`,
        output: 'id | name | total\n-----\ntrue false',
        why: '`String.join` puts the separator between elements, not after the last. `repeat(5)` concatenates five copies. `isBlank` is true for whitespace-only strings, while `isEmpty` is true only for length 0.',
      },
    ],
  ),
  ...b.output(
    'java-stringbuilder',
    2,
    [
      '`StringBuilder` is mutable: its methods change the builder and return the same builder.',
      '`StringBuilder` does not override `equals`.',
    ],
    [
      {
        key: 'chain',
        code: `public class Main {
    public static void main(String[] args) {
        StringBuilder sb = new StringBuilder("total");
        sb.append(": ").append(42).insert(0, "[").append(']');
        System.out.println(sb);
        System.out.println(sb.length());
    }
}`,
        output: '[total: 42]\n11',
        why: 'Each call modifies the same builder and returns it, so the calls can be chained. `insert(0, "[")` puts the bracket at the front. The final text `[total: 42]` has 11 characters.',
      },
      {
        key: 'reverse-delete',
        code: `public class Main {
    public static void main(String[] args) {
        StringBuilder csv = new StringBuilder();
        for (int i = 1; i <= 3; i++) {
            csv.append(i).append(',');
        }
        csv.setLength(csv.length() - 1);
        System.out.println(csv);
        System.out.println(csv.reverse());
    }
}`,
        output: '1,2,3\n3,2,1',
        why: 'The loop builds `1,2,3,`; `setLength(length - 1)` removes the trailing comma. `reverse()` reverses the builder in place and returns it, printing `3,2,1`.',
      },
      {
        key: 'equals',
        code: `public class Main {
    public static void main(String[] args) {
        StringBuilder a = new StringBuilder("ok");
        StringBuilder b = new StringBuilder("ok");
        System.out.println(a.equals(b));
        System.out.println(a.toString().equals(b.toString()));
        System.out.println(a.compareTo(b) == 0);
    }
}`,
        output: 'false\ntrue\ntrue',
        why: '`StringBuilder` inherits identity-based `equals` from `Object`, so two builders with the same content are not equal. Compare their `toString()` results, or use `compareTo` (available since Java 11), which compares the characters.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-string-equality',
    3,
    'String literals and compile-time constant expressions are interned (shared); strings built at run time are new objects.',
    [
      {
        key: 'new-string',
        code: `public class Main {
    public static void main(String[] args) {
        String a = "draft";
        String b = "draft";
        String c = new String("draft");
        System.out.println((a == b) + " " + (a == c) + " " + a.equals(c));
    }
}`,
        correct: 'true false true',
        wrong: ['true true true', 'false false true', 'true false false'],
        why: 'Identical literals refer to the same interned object, so `a == b` is true. `new String(...)` always creates a new object, so `a == c` is false even though the text is equal. `equals` compares characters and is the only reliable choice.',
      },
      {
        key: 'runtime-concat',
        code: `public class Main {
    public static void main(String[] args) {
        String prefix = "ord";
        String built = prefix + "er";
        System.out.println(built == "order");
        System.out.println(built.intern() == "order");
    }
}`,
        correct: 'false\ntrue',
        wrong: ['true\ntrue', 'false\nfalse', 'true\nfalse'],
        why: '`prefix` is not a constant, so `prefix + "er"` is computed at run time and produces a new `String` object. `intern()` returns the canonical pooled instance, which is the same object as the literal. Code that “works” with `==` in a test often fails with strings read from input.',
      },
      {
        key: 'final-constant',
        code: `public class Main {
    public static void main(String[] args) {
        final String prefix = "ord";
        String built = prefix + "er";
        System.out.println(built == "order");
    }
}`,
        correct: 'true',
        wrong: ['false', 'It does not compile: == cannot compare strings', 'It depends on the garbage collector'],
        why: 'A `final` local initialized with a literal is a constant variable, so `prefix + "er"` is a compile-time constant expression. The compiler folds it into the literal `"order"`, which is interned. This is why `==` on strings sometimes seems to work, and why it must never be relied on.',
      },
    ],
  ),
  ...b.codeChoice(
    'java-string-building',
    3,
    'Each `+=` on a `String` creates a new string and copies everything built so far.',
    [
      {
        key: 'loop-concat',
        question: 'This method builds a CSV line for an export with tens of thousands of values. Which change is the best refactoring?',
        code: `import java.util.List;

public class Main {
    static String toCsv(List<String> values) {
        String line = "";
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) line += ",";
            line += values.get(i);
        }
        return line;
    }

    public static void main(String[] args) {
        System.out.println(toCsv(List.of("a", "b", "c")));
    }
}`,
        correct: 'Replace the loop with `String.join(",", values)` (or a `StringBuilder`), which builds the result once instead of copying the growing string on every `+=`.',
        wrong: [
          'Replace `line += x` with `line.concat(x)`, which appends in place without copying.',
          'Declare `line` as `final` so the compiler can optimize the concatenation.',
          'Nothing: the compiler turns any loop with `+=` into a single `StringBuilder`.',
        ],
        why: 'Strings are immutable, so each `+=` in a loop allocates a new string and copies the previous content, which is quadratic in total. `String.join` (or one `StringBuilder` reused across iterations) is linear. `concat` also returns a new string, a `final` variable cannot be reassigned at all, and the compiler optimizes a single expression, not a loop.',
      },
      {
        key: 'builder-in-loop',
        question: 'A colleague “optimized” this report with `StringBuilder`. What is wrong with it?',
        code: `import java.util.List;

public class Main {
    static String report(List<String> lines) {
        String result = "";
        for (String line : lines) {
            result = new StringBuilder(result).append(line).append('\\n').toString();
        }
        return result;
    }

    public static void main(String[] args) {
        System.out.print(report(List.of("one", "two")));
    }
}`,
        correct: 'It creates a new `StringBuilder` and a new `String` on every iteration, so it still copies the whole result each time; create one builder before the loop and call `toString()` once at the end.',
        wrong: [
          'Nothing: `StringBuilder` always makes string building linear.',
          '`StringBuilder` is not thread-safe, so the method must use `StringBuffer`.',
          '`append(\'\\n\')` appends the number 10 instead of a newline.',
        ],
        why: 'The benefit of `StringBuilder` comes from appending to the same mutable buffer. Copying `result` into a fresh builder each time and converting back is as wasteful as `+=`. Thread safety is irrelevant for a local variable, and `append(char)` appends the character.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-split-pitfalls',
    4,
    '`split` takes a regular expression, and by default it removes trailing empty strings.',
    [
      {
        key: 'dot',
        code: `public class Main {
    public static void main(String[] args) {
        String version = "21.0.4";
        String[] parts = version.split(".");
        System.out.println(parts.length);
    }
}`,
        correct: '0',
        wrong: ['3', '1', '6'],
        why: '`.` is a regular expression that matches any character, so every character is a separator. All resulting strings are empty, and trailing empty strings are removed, leaving an empty array. Use `split("\\\\.")` or `split(Pattern.quote("."))`.',
      },
      {
        key: 'trailing',
        code: `public class Main {
    public static void main(String[] args) {
        String row = "ada,,london,,";
        System.out.println(row.split(",").length);
        System.out.println(row.split(",", -1).length);
    }
}`,
        correct: '3\n5',
        wrong: ['5\n5', '3\n3', '2\n5'],
        why: 'Splitting gives `ada`, `""`, `london`, `""`, `""`. With the default limit, trailing empty strings are removed (the empty string in the middle stays), giving 3. A negative limit keeps all of them, which matters for CSV rows with empty last columns.',
      },
      {
        key: 'pipe',
        code: `public class Main {
    public static void main(String[] args) {
        String line = "a|b";
        System.out.println(line.split("|").length);
        System.out.println(line.split("\\\\|").length);
    }
}`,
        correct: '3\n2',
        wrong: ['2\n2', '1\n2', '2\n3'],
        why: '`|` in a regular expression is alternation between two empty patterns, so it matches the empty string between every character: `a`, `|`, `b`. Escaping it as `\\\\|` splits on the literal pipe and gives `a` and `b`.',
      },
    ],
  ),
  ...b.output(
    'java-array-basics',
    1,
    [
      'New arrays are filled with default values: `0`, `false`, or `null` for references.',
      '`length` is a field of the array, not a method.',
    ],
    [
      {
        key: 'defaults',
        code: `import java.util.Arrays;

public class Main {
    public static void main(String[] args) {
        int[] scores = new int[3];
        String[] names = new String[2];
        boolean[] flags = new boolean[1];
        System.out.println(Arrays.toString(scores));
        System.out.println(Arrays.toString(names));
        System.out.println(flags[0]);
    }
}`,
        output: '[0, 0, 0]\n[null, null]\nfalse',
        why: 'Array elements are always initialized: numeric types to `0`, `boolean` to `false`, and reference types (including `String`) to `null`, not to an empty string.',
      },
      {
        key: 'shared',
        code: `public class Main {
    public static void main(String[] args) {
        int[] prices = {10, 20, 30};
        int[] copy = prices;
        copy[0] = 99;
        System.out.println(prices[0] + " " + prices.length);
    }
}`,
        output: '99 3',
        why: 'Arrays are objects. `copy = prices` copies the reference, so both variables refer to the same array and the change is visible through `prices`. Use `prices.clone()` or `Arrays.copyOf` for an independent copy.',
      },
      {
        key: 'sum',
        code: `public class Main {
    public static void main(String[] args) {
        int[] quantities = {2, 5, 1};
        int sum = 0;
        for (int i = quantities.length - 1; i >= 0; i--) {
            sum = sum * 10 + quantities[i];
        }
        System.out.println(sum);
    }
}`,
        output: '152',
        why: 'The loop walks the array backwards: `1`, then `1 * 10 + 5 = 15`, then `15 * 10 + 2 = 152`. Valid indexes are `0` to `length - 1`.',
      },
    ],
  ),
  ...b.fails(
    'java-index-failures',
    2,
    'Valid indexes go from `0` to `length - 1`. Read the index and length in the exception message.',
    [
      {
        key: 'less-equal',
        question: 'This loop throws. Which change fixes it?',
        code: `public class Main {
    public static void main(String[] args) {
        int[] totals = {120, 80, 45};
        int sum = 0;
        for (int i = 0; i <= totals.length; i++) {
            sum += totals[i];
        }
        System.out.println(sum);
    }
}`,
        error: 'ArrayIndexOutOfBoundsException',
        correct: 'Use `i < totals.length`: with `<=` the loop reads `totals[3]`, one past the last index.',
        wrong: [
          'Start at `i = 1`, because Java arrays are 1-based.',
          'Use `totals.length()`, because `length` is a method.',
          'Declare `sum` as `long`, because the total overflows.',
        ],
        why: 'The exception message is `Index 3 out of bounds for length 3`: indexes run from `0` to `2`. Arrays are 0-based, `length` is a field (`length()` would not compile), and the sum is far too small to overflow.',
      },
      {
        key: 'substring',
        question: 'This code that masks card numbers throws for one input. Why?',
        code: `public class Main {
    static String mask(String card) {
        return "****" + card.substring(card.length() - 4);
    }

    public static void main(String[] args) {
        System.out.println(mask("4111111111111111"));
        System.out.println(mask("123"));
    }
}`,
        error: 'StringIndexOutOfBoundsException',
        correct: 'For `"123"`, `card.length() - 4` is `-1`, and `substring` throws for a negative begin index; validate the length first.',
        wrong: [
          '`substring` with one argument needs an end index too.',
          '`substring` returns `null` for short strings, and the concatenation fails.',
          'Concatenating `"****"` with a number throws.',
        ],
        why: '`substring(begin)` throws `StringIndexOutOfBoundsException` when `begin` is negative or greater than the length. It never returns `null`, and the one-argument form is valid. Input validation should reject card numbers that are too short.',
      },
      {
        key: 'empty-array',
        question: 'Why does this method throw for one of the batches?',
        code: `public class Main {
    static int last(int[] batch) {
        return batch[batch.length - 1];
    }

    public static void main(String[] args) {
        System.out.println(last(new int[] {4, 8}));
        System.out.println(last(new int[0]));
    }
}`,
        error: 'ArrayIndexOutOfBoundsException',
        correct: 'The second batch is empty, so `batch.length - 1` is `-1`, which is not a valid index.',
        wrong: [
          '`new int[0]` is not allowed; arrays must have at least one element.',
          '`new int[0]` creates `null`, so the method throws `NullPointerException`.',
          'An empty `int` array contains a single `0`, so the method should print `0`.',
        ],
        why: 'Zero-length arrays are valid objects (not `null`) with no elements, so any index, including `-1`, is out of bounds: `Index -1 out of bounds for length 0`. Decide what “last of nothing” means before indexing.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-arrays-utilities',
    3,
    'Look at what each `java.util.Arrays` method returns, and whether it changes the array in place.',
    [
      {
        key: 'sort-copy',
        code: `import java.util.Arrays;

public class Main {
    public static void main(String[] args) {
        int[] ids = {42, 7, 19};
        int[] sorted = Arrays.copyOf(ids, 5);
        Arrays.sort(sorted);
        System.out.println(Arrays.toString(ids));
        System.out.println(Arrays.toString(sorted));
    }
}`,
        correct: '[42, 7, 19]\n[0, 0, 7, 19, 42]',
        wrong: ['[7, 19, 42]\n[7, 19, 42, 0, 0]', '[42, 7, 19]\n[7, 19, 42, 0, 0]', '[42, 7, 19]\n[7, 19, 42]'],
        why: '`Arrays.copyOf` makes a new array; a larger length pads it with default values (`0`). `Arrays.sort` sorts that copy in place, so the padding zeros move to the front. The original `ids` is untouched.',
      },
      {
        key: 'fill-range',
        code: `import java.util.Arrays;

public class Main {
    public static void main(String[] args) {
        char[] seats = new char[5];
        Arrays.fill(seats, '.');
        Arrays.fill(seats, 1, 3, 'X');
        System.out.println(new String(seats));
        System.out.println(Arrays.toString(Arrays.copyOfRange(seats, 2, 4)));
    }
}`,
        correct: '.XX..\n[X, .]',
        wrong: ['.XXX.\n[X, ., .]', '.XX..\n[X, ., .]', 'XXX..\n[X, .]'],
        why: 'Range methods in `Arrays` use a half-open range: `fill(seats, 1, 3, \'X\')` sets indexes 1 and 2, and `copyOfRange(seats, 2, 4)` copies indexes 2 and 3.',
      },
      {
        key: 'binary-search',
        code: `import java.util.Arrays;

public class Main {
    public static void main(String[] args) {
        int[] codes = {100, 200, 300, 400};
        System.out.println(Arrays.binarySearch(codes, 300));
        System.out.println(Arrays.binarySearch(codes, 250));
    }
}`,
        correct: '2\n-3',
        wrong: ['2\n-1', '3\n-1', '2\n2'],
        why: 'On a sorted array, `binarySearch` returns the index when found (`2`). When not found it returns `-(insertionPoint) - 1`: `250` would be inserted at index 2, so the result is `-3`. The array must be sorted, otherwise the result is undefined.',
      },
    ],
  ),
  ...b.output(
    'java-multidimensional-arrays',
    4,
    [
      'A two-dimensional array is an array of arrays: each row is a separate array object.',
      '`clone()` on an array copies its elements; for an array of arrays, the elements are row references.',
    ],
    [
      {
        key: 'jagged',
        code: `public class Main {
    public static void main(String[] args) {
        int[][] shifts = new int[3][];
        shifts[0] = new int[] {8, 4};
        shifts[2] = new int[1];
        System.out.println(shifts.length + " " + shifts[0].length);
        System.out.println(shifts[1] == null);
        System.out.println(shifts[2][0]);
    }
}`,
        output: '3 2\ntrue\n0',
        why: '`new int[3][]` creates the outer array of three row references, all `null`. Rows can have different lengths (a jagged array). Row 1 was never created, so it is `null`; row 2 is a new `int[1]`, whose element defaults to `0`.',
      },
      {
        key: 'shallow-clone',
        code: `public class Main {
    public static void main(String[] args) {
        int[][] grid = {{1, 2}, {3, 4}};
        int[][] copy = grid.clone();
        copy[0][0] = 9;
        copy[1] = new int[] {7, 7};
        System.out.println(grid[0][0] + " " + grid[1][0]);
    }
}`,
        output: '9 3',
        why: '`clone()` copies the outer array only, so `copy[0]` and `grid[0]` are the same row: changing `copy[0][0]` changes `grid`. Replacing `copy[1]` with a new row only changes the copy’s outer array, so `grid[1][0]` is still `3`.',
      },
      {
        key: 'deep-equals',
        code: `import java.util.Arrays;

public class Main {
    public static void main(String[] args) {
        int[][] a = {{1, 2}, {3}};
        int[][] b = {{1, 2}, {3}};
        System.out.println(Arrays.equals(a, b));
        System.out.println(Arrays.deepEquals(a, b));
        System.out.println(Arrays.deepToString(a));
    }
}`,
        output: 'false\ntrue\n[[1, 2], [3]]',
        why: '`Arrays.equals` compares the elements of the outer arrays with `equals`, and the rows are different array objects (identity equality), so it is false. `deepEquals` and `deepToString` recurse into nested arrays.',
      },
    ],
  ),
  ...b.fails(
    'java-array-covariance',
    5,
    'Arrays are covariant: a `String[]` can be used where an `Object[]` is expected. Who checks what is stored in it, and when?',
    [
      {
        key: 'array-store',
        question: 'This code compiles but throws at run time. Why?',
        code: `public class Main {
    static void fillDefaults(Object[] slots) {
        for (int i = 0; i < slots.length; i++) {
            slots[i] = 0;
        }
    }

    public static void main(String[] args) {
        String[] labels = new String[2];
        fillDefaults(labels);
        System.out.println(labels[0]);
    }
}`,
        error: 'ArrayStoreException',
        correct: 'The runtime array is a `String[]`; storing an `Integer` into it is checked at run time and throws `ArrayStoreException`, even though the static type is `Object[]`.',
        wrong: [
          'Passing a `String[]` as an `Object[]` throws `ClassCastException` at the call.',
          'Autoboxing `0` inside an `Object[]` is not allowed, so it throws `IllegalArgumentException`.',
          'The array elements are `null`, so the assignment throws `NullPointerException`.',
        ],
        why: 'Because arrays are covariant, the compiler accepts `String[]` as `Object[]`, and each array remembers its real element type. Every store is checked at run time, and storing an `Integer` into a `String[]` throws `ArrayStoreException: java.lang.Integer`. Generic collections avoid this by making `List<String>` not a subtype of `List<Object>`, so the mistake is a compile error.',
      },
      {
        key: 'as-object-array',
        question: 'Why does this cache code fail?',
        code: `public class Main {
    public static void main(String[] args) {
        Integer[] counts = {1, 2, 3};
        Number[] numbers = counts;
        numbers[0] = 1.5;
        System.out.println(numbers[0]);
    }
}`,
        error: 'ArrayStoreException',
        correct: '`numbers` refers to an `Integer[]`, so storing a `Double` fails the run-time element type check.',
        wrong: [
          '`Integer[]` cannot be assigned to `Number[]`; this is a compile error.',
          '`1.5` is narrowed to `1` before it is stored, so the program prints `1`.',
          'Wrapper arrays are immutable after initialization.',
        ],
        why: '`Integer[]` is a subtype of `Number[]`, so the assignment compiles and `numbers[0] = 1.5` type-checks (a `Double` is a `Number`). At run time the JVM checks the element against the actual array type, `Integer[]`, and throws `ArrayStoreException: java.lang.Double`.',
      },
    ],
  ),
];
