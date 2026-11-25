import type { QuestionSource } from '@pracstack/content-model';
import { programBuilders } from '../program-builders';

/*
 * Java fundamentals: primitive types, operators, conversions, equality, null
 * and control flow. Every snippet is compiled and run on the real JDK 21 runner.
 */
const b = programBuilders('java');

// ---------------------------------------------------------------- Types, operators, conversions

export const typesOperatorsFamilies: readonly QuestionSource[] = [
  ...b.output(
    'java-integer-division',
    1,
    [
      'When both operands are integers, `/` divides as integers and drops the fractional part.',
      'Conversion to `double` only happens when one operand is already a `double` (or a cast says so).',
    ],
    [
      {
        key: 'average',
        code: `public class Main {
    public static void main(String[] args) {
        int totalMinutes = 7;
        int sessions = 2;
        double average = totalMinutes / sessions;
        System.out.println(average);
    }
}`,
        output: '3.0',
        why: '`totalMinutes / sessions` is evaluated first, as `int` division: `7 / 2` is `3`. Only then is the result widened to `double` for the assignment, giving `3.0`. Assigning to a `double` variable does not make the division itself floating-point; write `(double) totalMinutes / sessions` to get `3.5`.',
      },
      {
        key: 'percentage',
        code: `public class Main {
    public static void main(String[] args) {
        int done = 3;
        int total = 4;
        System.out.println(done / total * 100);
        System.out.println(done * 100 / total);
    }
}`,
        output: '0\n75',
        why: 'Operators of the same precedence run left to right. In the first line `3 / 4` is `0` in integer division, and `0 * 100` is `0`. In the second line `3 * 100` is `300` and `300 / 4` is `75`. Multiplying before dividing keeps the precision you need when you must stay in integers.',
      },
      {
        key: 'negative',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(-7 / 2);
        System.out.println(-7 % 3);
        System.out.println(7 % -3);
    }
}`,
        output: '-3\n-1\n1',
        why: 'Java integer division truncates toward zero, so `-7 / 2` is `-3` (not `-4`, which floor division would give). The remainder takes the sign of the dividend (the left operand): `-7 % 3` is `-1` and `7 % -3` is `1`. Code such as `n % 2 == 1` to test for odd numbers is therefore wrong for negative `n`.',
      },
      {
        key: 'mixed',
        code: `public class Main {
    public static void main(String[] args) {
        int items = 5;
        System.out.println(items / 2);
        System.out.println(items / 2.0);
        System.out.println((double) (items / 2));
    }
}`,
        output: '2\n2.5\n2.0',
        why: '`items / 2` is integer division (`2`). In `items / 2.0` one operand is a `double`, so `items` is widened and the result is `2.5`. In the last line the parentheses force the integer division first, so the cast only converts the already-truncated `2` to `2.0`.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-int-overflow',
    2,
    'An `int` has 32 bits. What happens when a result does not fit, and when is the expression widened to `long`?',
    [
      {
        key: 'max-plus-one',
        code: `public class Main {
    public static void main(String[] args) {
        int max = Integer.MAX_VALUE;
        System.out.println(max + 1);
    }
}`,
        correct: '-2147483648',
        wrong: ['2147483648', 'ArithmeticException: integer overflow', '2147483647'],
        why: 'Integer arithmetic in Java silently wraps around in two’s complement: `Integer.MAX_VALUE + 1` becomes `Integer.MIN_VALUE`. No exception is thrown (only `Math.addExact` and friends throw on overflow), and the result is not widened to `long` automatically.',
      },
      {
        key: 'long-target',
        code: `public class Main {
    public static void main(String[] args) {
        long microsPerDay = 24 * 60 * 60 * 1000 * 1000;
        System.out.println(microsPerDay);
    }
}`,
        correct: '500654080',
        wrong: [
          '86400000000',
          '-2147483648',
          'It does not compile: the value is too large for an int',
        ],
        why: 'Every literal is an `int`, so the whole product is computed in `int` arithmetic and overflows before it is widened to `long` for the assignment. The compiler does not reject it because the constant expression is a valid (wrapped) `int`. Writing `24L * 60 * ...` makes the first operand a `long`, so the product is computed in `long` and prints `86400000000`.',
      },
      {
        key: 'abs-min',
        code: `public class Main {
    public static void main(String[] args) {
        int balance = Integer.MIN_VALUE;
        System.out.println(Math.abs(balance));
    }
}`,
        correct: '-2147483648',
        wrong: ['2147483648', '2147483647', 'ArithmeticException: integer overflow'],
        why: 'The `int` range is asymmetric: `-2147483648` has no positive counterpart. `Math.abs(Integer.MIN_VALUE)` overflows and returns the same negative value. `Math.absExact` (Java 15+) throws instead, which is safer when the input can be extreme.',
      },
    ],
  ),
  ...b.compiles(
    'java-compound-assignment',
    3,
    'Arithmetic on `byte`, `short` and `char` produces an `int`. Compound assignment operators (`+=`, `*=`, `++`) include an implicit cast; plain `=` does not.',
    [
      {
        key: 'byte-plus',
        code: `public class Main {
    public static void main(String[] args) {
        byte retries = 3;
        retries = retries + 1;
        System.out.println(retries);
    }
}`,
        compiles: false,
        why: '`retries + 1` is promoted to `int`, and assigning an `int` expression to a `byte` is a narrowing conversion that needs an explicit cast: “incompatible types: possible lossy conversion from int to byte”. Use `retries++`, `retries += 1` or `retries = (byte) (retries + 1)`.',
      },
      {
        key: 'byte-plus-equals',
        code: `public class Main {
    public static void main(String[] args) {
        byte retries = 3;
        retries += 1;
        System.out.println(retries);
    }
}`,
        compiles: true,
        why: 'A compound assignment `x op= y` means `x = (T) (x op y)`, where `T` is the type of `x`. The cast to `byte` is implicit, so this compiles and prints `4`. The same implicit cast is why `byteValue += 200` compiles but silently overflows.',
      },
      {
        key: 'int-plus-double',
        code: `public class Main {
    public static void main(String[] args) {
        int total = 10;
        total += 2.75;
        System.out.println(total);
    }
}`,
        compiles: true,
        why: 'It compiles and prints `12`: `total += 2.75` is `total = (int) (total + 2.75)`, so `12.75` is truncated. This is a real source of silent bugs in money calculations; `total = total + 2.75` would have been rejected as a lossy conversion.',
      },
      {
        key: 'final-constant',
        code: `public class Main {
    public static void main(String[] args) {
        final int limit = 100;
        byte small = limit;
        int other = 100;
        byte notConstant = other;
        System.out.println(small + notConstant);
    }
}`,
        compiles: false,
        why: '`byte small = limit` is allowed because `limit` is a compile-time constant (`final`, initialized with a constant) whose value fits in a `byte`. `other` is not a constant, so `byte notConstant = other` is a lossy conversion from `int` and fails to compile.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-narrowing-casts',
    3,
    'A cast from floating point to an integer type truncates toward zero; a cast between integer types keeps only the low-order bits.',
    [
      {
        key: 'double-to-int',
        code: `public class Main {
    public static void main(String[] args) {
        double price = 19.99;
        double refund = -3.7;
        System.out.println((int) price + " " + (int) refund);
    }
}`,
        correct: '19 -3',
        wrong: ['20 -4', '19 -4', '20 -3'],
        why: 'Casting a `double` to `int` truncates toward zero: `19.99` becomes `19` and `-3.7` becomes `-3`. It does not round (that would give `20` and `-4`) and does not floor (that would give `-4` for the negative value). Use `Math.round` or `Math.floor` when you mean those.',
      },
      {
        key: 'int-to-byte',
        code: `public class Main {
    public static void main(String[] args) {
        int status = 200;
        byte b = (byte) status;
        System.out.println(b);
    }
}`,
        correct: '-56',
        wrong: ['200', '127', 'ClassCastException'],
        why: 'A `byte` holds `-128` to `127`. The cast keeps the low 8 bits of `200` (`11001000`), which as a signed byte is `200 - 256 = -56`. Integer narrowing never clamps to the maximum and never throws.',
      },
      {
        key: 'huge-double',
        code: `public class Main {
    public static void main(String[] args) {
        double big = 1e10;
        System.out.println((int) big);
        System.out.println((long) big);
    }
}`,
        correct: '2147483647\n10000000000',
        wrong: ['1410065408\n10000000000', '-2147483648\n10000000000', 'ArithmeticException'],
        why: 'Floating-point to integer conversion saturates: a value above the `int` range becomes `Integer.MAX_VALUE`. Wrapping (`1410065408`) is what an `int` overflow or a `long`-to-`int` cast would give, but not a `double`-to-`int` cast. `1e10` fits in a `long`, so the second cast is exact.',
      },
      {
        key: 'round',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(Math.round(2.5) + " " + Math.round(-2.5));
    }
}`,
        correct: '3 -2',
        wrong: ['3 -3', '2 -2', '2 -3'],
        why: '`Math.round` adds `0.5` and takes the floor, so ties round up toward positive infinity: `2.5` becomes `3` and `-2.5` becomes `-2`. It is neither “away from zero” (`-3`) nor banker’s rounding (`2` and `-2`); use `BigDecimal` with an explicit `RoundingMode` when the rule matters.',
      },
    ],
  ),
  ...b.output(
    'java-char-string-concat',
    2,
    [
      '`+` is evaluated left to right. It is numeric addition until one operand is a `String`.',
      'A `char` is a 16-bit unsigned number; in arithmetic it is promoted to `int`.',
    ],
    [
      {
        key: 'left-to-right',
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println(1 + 2 + "3" + 4 + 5);
    }
}`,
        output: '3345',
        why: '`1 + 2` is numeric (`3`). Then `3 + "3"` is string concatenation (`"33"`), and from then on every `+` appends: `"334"`, then `"3345"`.',
      },
      {
        key: 'char-sum',
        code: `public class Main {
    public static void main(String[] args) {
        char first = 'a';
        char second = 'b';
        System.out.println(first + second);
        System.out.println("" + first + second);
    }
}`,
        output: '195\nab',
        why: 'Two `char` values added together are promoted to `int`: `97 + 98 = 195`. Starting with `""` makes the first `+` a string concatenation, so the characters are appended as text.',
      },
      {
        key: 'next-letter',
        code: `public class Main {
    public static void main(String[] args) {
        char grade = 'B';
        System.out.println(grade + 1);
        System.out.println((char) (grade + 1));
        grade++;
        System.out.println(grade);
    }
}`,
        output: '67\nC\nC',
        why: '`grade + 1` is an `int` (`66 + 1 = 67`), printed as a number. Casting back to `char` gives `C`. `grade++` has an implicit cast like other compound operators, so `grade` stays a `char` and prints `C`.',
      },
    ],
  ),
  ...b.output(
    'java-increment-operators',
    3,
    [
      '`x++` evaluates to the old value, then increments; `++x` increments first and evaluates to the new value.',
      'An assignment stores its right-hand value after the right-hand side has been fully evaluated.',
    ],
    [
      {
        key: 'self-assign',
        code: `public class Main {
    public static void main(String[] args) {
        int count = 5;
        count = count++;
        System.out.println(count);
    }
}`,
        output: '5',
        why: '`count++` evaluates to `5` and increments `count` to `6`. Then the assignment stores the evaluated value, `5`, back into `count`, overwriting the increment. Write `count++` on its own line instead.',
      },
      {
        key: 'mixed',
        code: `public class Main {
    public static void main(String[] args) {
        int x = 1;
        int y = x++ + ++x;
        System.out.println(x + " " + y);
    }
}`,
        output: '3 4',
        why: 'Operands are evaluated left to right. `x++` yields `1` (x becomes `2`), then `++x` makes x `3` and yields `3`. So `y = 1 + 3 = 4` and `x` is `3`.',
      },
      {
        key: 'loop-index',
        code: `public class Main {
    public static void main(String[] args) {
        int[] codes = {10, 20, 30};
        int i = 0;
        int a = codes[i++];
        int b = codes[++i];
        System.out.println(a + " " + b + " " + i);
    }
}`,
        output: '10 30 2',
        why: '`codes[i++]` reads index `0` and then makes `i` `1`. `codes[++i]` first makes `i` `2` and reads index `2`, which is `30`.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-floating-point-money',
    4,
    '`double` stores binary fractions, so most decimal fractions are approximations. `BigDecimal` stores decimal digits and a scale.',
    [
      {
        key: 'sum',
        code: `public class Main {
    public static void main(String[] args) {
        double total = 0.1 + 0.2;
        System.out.println(total);
        System.out.println(total == 0.3);
    }
}`,
        correct: '0.30000000000000004\nfalse',
        wrong: ['0.3\ntrue', '0.3\nfalse', '0.30000000000000004\ntrue'],
        why: '`0.1` and `0.2` have no exact binary representation, and their sum is the double closest to `0.30000000000000004`, which is a different double from the literal `0.3`. Never compare computed doubles with `==`; for money use `BigDecimal` or integer cents.',
      },
      {
        key: 'bigdecimal-string',
        code: `import java.math.BigDecimal;

public class Main {
    public static void main(String[] args) {
        BigDecimal price = new BigDecimal("0.10");
        BigDecimal total = price.add(new BigDecimal("0.20"));
        System.out.println(total);
        System.out.println(new BigDecimal(0.1).compareTo(new BigDecimal("0.1")) == 0);
    }
}`,
        correct: '0.30\nfalse',
        wrong: ['0.3\ntrue', '0.30\ntrue', '0.30000000000000004\nfalse'],
        why: 'The `String` constructor is exact, and addition keeps the larger scale, so the total prints `0.30`. `new BigDecimal(0.1)` converts the binary double exactly, giving `0.1000000000000000055511151231257827...`, which is not equal to `0.1`. Create `BigDecimal` values from strings or with `BigDecimal.valueOf(double)`.',
      },
      {
        key: 'bigdecimal-equals',
        code: `import java.math.BigDecimal;

public class Main {
    public static void main(String[] args) {
        BigDecimal a = new BigDecimal("2.0");
        BigDecimal b = new BigDecimal("2.00");
        System.out.println(a.equals(b) + " " + (a.compareTo(b) == 0));
    }
}`,
        correct: 'false true',
        wrong: ['true true', 'false false', 'true false'],
        why: '`BigDecimal.equals` compares the value and the scale, so `2.0` (scale 1) is not equal to `2.00` (scale 2). `compareTo` compares only the numeric value. Use `compareTo` for amounts, and be careful with `BigDecimal` keys in a `HashSet` or `HashMap`, which rely on `equals`.',
      },
      {
        key: 'division-by-zero',
        code: `public class Main {
    public static void main(String[] args) {
        double rate = 1.0 / 0;
        double unknown = 0.0 / 0;
        System.out.println(rate + " " + (unknown == unknown));
    }
}`,
        correct: 'Infinity false',
        wrong: ['ArithmeticException: / by zero', 'Infinity true', 'NaN false'],
        why: 'Floating-point division by zero does not throw: `1.0 / 0` is `Infinity` and `0.0 / 0` is `NaN`. `NaN` is not equal to anything, including itself, so `unknown == unknown` is `false` (use `Double.isNaN`). Only integer division by zero throws `ArithmeticException`.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-numeric-promotion-surprises',
    5,
    'Look at the types: which conversions happen implicitly, and can the target type represent every value of the source type?',
    [
      {
        key: 'ternary-promotion',
        code: `public class Main {
    public static void main(String[] args) {
        boolean premium = true;
        Object discount = premium ? 1 : 2.0;
        System.out.println(discount);
    }
}`,
        correct: '1.0',
        wrong: ['1', '2.0', 'It does not compile: the branches have different types'],
        why: 'When both branches of `?:` are numeric, binary numeric promotion gives the whole expression one type: `int` and `double` become `double`. So the result is `1.0`, boxed as a `Double`, even though the `int` branch was selected.',
      },
      {
        key: 'int-to-float',
        code: `public class Main {
    public static void main(String[] args) {
        int quantity = 16_777_217;
        float f = quantity;
        System.out.println((int) f);
    }
}`,
        correct: '16777216',
        wrong: ['16777217', 'It does not compile: possible lossy conversion', '16777218'],
        why: '`int` to `float` is a widening conversion, so it is implicit, but a `float` has only 24 bits of precision. `16_777_217` (2^24 + 1) cannot be represented, so it is rounded to `16_777_216`. Widening means “no cast needed”, not “no precision lost”.',
      },
      {
        key: 'long-to-double',
        code: `public class Main {
    public static void main(String[] args) {
        long orderId = 9_007_199_254_740_993L;
        double asDouble = orderId;
        System.out.println((long) asDouble == orderId);
    }
}`,
        correct: 'false',
        wrong: ['true', 'It does not compile: possible lossy conversion', 'ArithmeticException'],
        why: 'A `double` has 53 bits of precision. `2^53 + 1` cannot be represented, so the implicit widening rounds it to `2^53`, and converting back gives a different `long`. This is why large IDs should never pass through `double` (or JSON numbers read as doubles).',
      },
    ],
  ),
  ...b.fails(
    'java-arithmetic-failures',
    4,
    'Read the exception type and message first: they name the operation that failed.',
    [
      {
        key: 'empty-average',
        question:
          'This report crashes when there are no orders. What is the cause and the right fix?',
        code: `import java.util.List;

public class Main {
    static int averageQuantity(List<Integer> quantities) {
        int sum = 0;
        for (int q : quantities) sum += q;
        return sum / quantities.size();
    }

    public static void main(String[] args) {
        System.out.println(averageQuantity(List.of(4, 6)));
        System.out.println(averageQuantity(List.of()));
    }
}`,
        error: 'ArithmeticException',
        correct:
          'Integer division by zero throws `ArithmeticException: / by zero`; handle the empty list explicitly (for example return `0` or an `OptionalDouble`).',
        wrong: [
          'The loop throws `NoSuchElementException` on an empty list; check `hasNext()` first.',
          'Division by zero returns `Infinity`; compare the result with `Double.POSITIVE_INFINITY`.',
          '`List.of()` returns `null`; check the argument for `null`.',
        ],
        why: 'Integer division by zero throws `ArithmeticException` (only floating-point division gives `Infinity`). Iterating an empty list simply runs zero times, and `List.of()` is an empty list, not `null`. The fix is to decide what the average of nothing means and handle that case before dividing.',
      },
      {
        key: 'to-int-exact',
        question:
          'A batch job fails when it converts a file size. What does the exception tell you?',
        code: `public class Main {
    public static void main(String[] args) {
        long bytes = 3_000_000_000L;
        int size = Math.toIntExact(bytes);
        System.out.println(size);
    }
}`,
        error: 'ArithmeticException: integer overflow',
        correct:
          '`3_000_000_000` does not fit in an `int`; `Math.toIntExact` detects the overflow and throws instead of silently wrapping, so keep the value as a `long`.',
        wrong: [
          '`Math.toIntExact` rounds the value; use `(int) bytes` to get the exact result.',
          'The literal needs a `D` suffix to be stored as a large number.',
          'A `long` cannot be larger than `Integer.MAX_VALUE`; the literal is invalid.',
        ],
        why: '`Math.toIntExact` throws `ArithmeticException: integer overflow` when the value is outside the `int` range. A plain `(int) bytes` cast would not be exact: it silently keeps the low 32 bits and prints a negative number. The value is a valid `long`, so the fix is to keep using `long`.',
      },
      {
        key: 'parse-int',
        question: 'Importing a CSV fails on this line. Why?',
        code: `public class Main {
    public static void main(String[] args) {
        String cell = "1,250";
        int quantity = Integer.parseInt(cell);
        System.out.println(quantity * 2);
    }
}`,
        error: 'NumberFormatException',
        correct:
          '`Integer.parseInt` accepts only an optional sign and digits; the grouping comma makes it throw `NumberFormatException`, so strip or parse the separator explicitly.',
        wrong: [
          '`parseInt` returns `0` for invalid input, so the program prints `0`.',
          '`parseInt` reads the digits before the comma and returns `1`.',
          'The value is too large for an `int`, so it throws `ArithmeticException`.',
        ],
        why: '`parseInt` never returns a default and never parses a prefix: any character other than an optional leading sign and digits throws `NumberFormatException: For input string: "1,250"`. Remove the separator (or use a locale-aware `NumberFormat`) before converting.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Equality, null, control flow

export const equalityControlFamilies: readonly QuestionSource[] = [
  ...b.output(
    'java-loops-basics',
    1,
    [
      '`continue` skips to the next iteration; `break` leaves the loop.',
      'A `do`/`while` loop checks its condition after the body.',
    ],
    [
      {
        key: 'continue-break',
        code: `public class Main {
    public static void main(String[] args) {
        int[] amounts = {5, -1, 8, 0, 3};
        int total = 0;
        for (int amount : amounts) {
            if (amount < 0) continue;
            if (amount == 0) break;
            total += amount;
        }
        System.out.println(total);
    }
}`,
        output: '13',
        why: '`5` is added, `-1` is skipped by `continue`, `8` is added, and `0` stops the loop with `break`, so `3` is never reached: `5 + 8 = 13`.',
      },
      {
        key: 'do-while',
        code: `public class Main {
    public static void main(String[] args) {
        int attempts = 10;
        do {
            System.out.println("attempt " + attempts);
            attempts++;
        } while (attempts < 3);
        System.out.println(attempts);
    }
}`,
        output: 'attempt 10\n11',
        why: 'A `do`/`while` body always runs at least once because the condition is checked afterwards. After one iteration `attempts` is `11`, `11 < 3` is false, and the loop ends.',
      },
      {
        key: 'while-countdown',
        code: `public class Main {
    public static void main(String[] args) {
        int stock = 7;
        int orders = 0;
        while (stock >= 3) {
            stock -= 3;
            orders++;
        }
        System.out.println(orders + " " + stock);
    }
}`,
        output: '2 1',
        why: '`7 >= 3`: stock becomes `4`, one order. `4 >= 3`: stock becomes `1`, two orders. `1 >= 3` is false, so the loop stops with `2` orders and `1` left.',
      },
    ],
  ),
  ...b.output(
    'java-switch-fallthrough',
    2,
    [
      'In a classic `switch` statement with `case X:` labels, execution continues into the next case until a `break`.',
      'Arrow labels (`case X ->`) never fall through.',
    ],
    [
      {
        key: 'missing-break',
        code: `public class Main {
    public static void main(String[] args) {
        String level = "SILVER";
        int discount = 0;
        switch (level) {
            case "GOLD":
                discount += 10;
            case "SILVER":
                discount += 5;
            case "BRONZE":
                discount += 2;
                break;
            default:
                discount = -1;
        }
        System.out.println(discount);
    }
}`,
        output: '7',
        why: 'Execution jumps to `case "SILVER"`, adds `5`, then falls through into `case "BRONZE"` (no `break`) and adds `2`, stopping at its `break`. The `default` branch is not reached. A missing `break` is a classic bug that arrow labels eliminate.',
      },
      {
        key: 'arrow',
        code: `public class Main {
    public static void main(String[] args) {
        String level = "GOLD";
        int discount = 0;
        switch (level) {
            case "GOLD" -> discount += 10;
            case "SILVER" -> discount += 5;
            default -> discount += 1;
        }
        System.out.println(discount);
    }
}`,
        output: '10',
        why: 'With `case ... ->` labels only the matching branch runs; there is no fall-through and no `break` is needed. `GOLD` adds `10` and the switch ends.',
      },
      {
        key: 'default-first',
        code: `public class Main {
    public static void main(String[] args) {
        int code = 404;
        switch (code) {
            default:
                System.out.println("other");
            case 200:
                System.out.println("ok");
                break;
            case 500:
                System.out.println("error");
        }
    }
}`,
        output: 'other\nok',
        why: 'No case matches `404`, so execution starts at `default`, wherever it is written. With no `break` after it, execution falls through into `case 200` and prints `ok` before the `break`.',
      },
    ],
  ),
  ...b.output(
    'java-short-circuit',
    2,
    [
      '`&&` and `||` evaluate the right operand only if it can still change the result.',
      '`&` and `|` on booleans always evaluate both operands.',
    ],
    [
      {
        key: 'and-or',
        code: `public class Main {
    static boolean check(String name, boolean result) {
        System.out.println("check " + name);
        return result;
    }

    public static void main(String[] args) {
        if (check("a", false) && check("b", true)) System.out.println("both");
        if (check("c", true) || check("d", true)) System.out.println("either");
    }
}`,
        output: 'check a\ncheck c\neither',
        why: '`false && ...` is already false, so `check("b")` is skipped. `true || ...` is already true, so `check("d")` is skipped. Only `either` is printed.',
      },
      {
        key: 'single-ampersand',
        code: `public class Main {
    static boolean check(String name, boolean result) {
        System.out.println("check " + name);
        return result;
    }

    public static void main(String[] args) {
        boolean ok = check("stock", false) & check("credit", true);
        System.out.println(ok);
    }
}`,
        output: 'check stock\ncheck credit\nfalse',
        why: 'On `boolean` operands `&` is the non-short-circuit logical AND: both sides are always evaluated, so both checks print, and the result is `false`.',
      },
      {
        key: 'null-guard',
        code: `public class Main {
    public static void main(String[] args) {
        String coupon = null;
        if (coupon != null && coupon.length() > 3) {
            System.out.println("valid");
        } else {
            System.out.println("no coupon");
        }
    }
}`,
        output: 'no coupon',
        why: '`coupon != null` is false, so `&&` never evaluates `coupon.length()` and no `NullPointerException` is thrown. Reversing the operands, or using `&`, would throw.',
      },
    ],
  ),
  ...b.output(
    'java-reference-equality',
    2,
    [
      '`==` on references compares identity: are these the same object?',
      'Classes inherit `equals` from `Object`, which also compares identity unless it is overridden. Records generate a field-based `equals`.',
    ],
    [
      {
        key: 'class',
        code: `public class Main {
    public static void main(String[] args) {
        Money a = new Money(5, "EUR");
        Money b = new Money(5, "EUR");
        System.out.println(a == b);
        System.out.println(a.equals(b));
        System.out.println(a.equals(a));
    }
}

class Money {
    final int amount;
    final String currency;

    Money(int amount, String currency) {
        this.amount = amount;
        this.currency = currency;
    }
}`,
        output: 'false\nfalse\ntrue',
        why: '`a` and `b` are two different objects, so `==` is false. `Money` does not override `equals`, so it inherits `Object.equals`, which is also identity: equal fields do not matter. An object is always equal to itself.',
      },
      {
        key: 'record',
        code: `public class Main {
    public static void main(String[] args) {
        Money a = new Money(5, "EUR");
        Money b = new Money(5, "EUR");
        System.out.println(a == b);
        System.out.println(a.equals(b));
    }
}

record Money(int amount, String currency) {}`,
        output: 'false\ntrue',
        why: 'A record generates `equals` and `hashCode` from its components, so two records with the same components are equal. They are still two objects, so `==` is false.',
      },
      {
        key: 'array',
        code: `import java.util.Arrays;

public class Main {
    public static void main(String[] args) {
        int[] a = {1, 2, 3};
        int[] b = {1, 2, 3};
        System.out.println(a.equals(b));
        System.out.println(Arrays.equals(a, b));
    }
}`,
        output: 'false\ntrue',
        why: 'Arrays do not override `equals`, so `a.equals(b)` compares identity and is false. `Arrays.equals` compares the elements one by one.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-integer-cache',
    3,
    'Wrapper objects are compared by identity with `==`. Autoboxing small values reuses cached objects; `equals` also checks the wrapper type.',
    [
      {
        key: 'cache-boundary',
        code: `public class Main {
    public static void main(String[] args) {
        Integer a = 127, b = 127;
        Integer c = 128, d = 128;
        System.out.println((a == b) + " " + (c == d));
    }
}`,
        correct: 'true false',
        wrong: ['true true', 'false false', 'It does not compile: use equals'],
        why: 'Autoboxing uses `Integer.valueOf`, which returns cached objects for `-128` to `127`. So `a` and `b` are the same object, while `128` produces two different objects and `==` compares references. Always compare wrappers with `equals` (or unbox them).',
      },
      {
        key: 'mixed-unboxing',
        code: `public class Main {
    public static void main(String[] args) {
        Integer limit = 1000;
        int requested = 1000;
        System.out.println(limit == requested);
    }
}`,
        correct: 'true',
        wrong: ['false', 'It does not compile: incompatible types', 'NullPointerException'],
        why: 'When one operand of `==` is a primitive `int`, the `Integer` is unboxed and the values are compared numerically, so the cache does not matter. (If `limit` were `null`, unboxing would throw.)',
      },
      {
        key: 'long-equals-int',
        code: `public class Main {
    public static void main(String[] args) {
        Long customerId = 42L;
        System.out.println(customerId.equals(42));
        System.out.println(customerId.equals(42L));
        System.out.println(customerId == 42);
    }
}`,
        correct: 'false\ntrue\ntrue',
        wrong: ['true\ntrue\ntrue', 'false\ntrue\nfalse', 'true\ntrue\nfalse'],
        why: '`customerId.equals(42)` boxes `42` into an `Integer`, and `Long.equals` returns false for any non-`Long` argument, even with the same numeric value. `42L` boxes to a `Long`, so it is equal. `customerId == 42` unboxes the `Long` and compares numbers. This bug often appears as `map.get(42)` on a `Map<Long, ...>` returning `null`.',
      },
    ],
  ),
  ...b.fails(
    'java-null-failures',
    3,
    'Find the expression that dereferences or unboxes a value that can be `null`.',
    [
      {
        key: 'unboxing-map',
        question: 'Why does this stock check throw?',
        code: `import java.util.HashMap;
import java.util.Map;

public class Main {
    public static void main(String[] args) {
        Map<String, Integer> stock = new HashMap<>();
        stock.put("pen", 12);
        int notebooks = stock.get("notebook");
        System.out.println(notebooks);
    }
}`,
        error: 'NullPointerException',
        correct:
          '`stock.get("notebook")` returns `null` for a missing key, and unboxing `null` into an `int` throws `NullPointerException`; use `getOrDefault("notebook", 0)`.',
        wrong: [
          '`Map.get` throws `NoSuchElementException` for a missing key; check `containsKey` first.',
          'An `int` cannot hold a value from a `Map<String, Integer>`; declare `notebooks` as `long`.',
          'A missing `Integer` defaults to `0`, so the problem is that `println` cannot print `0`.',
        ],
        why: '`Map.get` returns `null` for a missing key; it never throws. Assigning that `null` to a primitive `int` triggers auto-unboxing (`intValue()`), which throws `NullPointerException`. `getOrDefault` or keeping the value as an `Integer` and checking for `null` avoids it.',
      },
      {
        key: 'equals-order',
        question: 'Why does this filter throw for one customer?',
        code: `public class Main {
    static boolean isVip(Customer c) {
        return c.tier.equals("VIP");
    }

    public static void main(String[] args) {
        System.out.println(isVip(new Customer("VIP")));
        System.out.println(isVip(new Customer(null)));
    }
}

class Customer {
    final String tier;
    Customer(String tier) { this.tier = tier; }
}`,
        error: 'NullPointerException',
        correct:
          'The second customer has a `null` tier, and calling `.equals` on `null` throws; write `"VIP".equals(c.tier)` or `Objects.equals(c.tier, "VIP")`.',
        wrong: [
          '`equals` cannot compare a field with a literal; use `c.tier == "VIP"`.',
          '`String.equals(null)` throws; the argument must not be `null`.',
          'Final fields cannot be `null`; the constructor call fails.',
        ],
        why: 'The receiver of a method call must not be `null`: `c.tier.equals(...)` throws when `tier` is `null`. Passing `null` as an argument is fine (`"VIP".equals(null)` is false). `==` would compare references and is not a correct way to compare strings.',
      },
      {
        key: 'switch-null',
        question: 'Why does this status handler throw?',
        code: `public class Main {
    static String label(String status) {
        switch (status) {
            case "NEW": return "New order";
            case "PAID": return "Paid";
            default: return "Unknown";
        }
    }

    public static void main(String[] args) {
        System.out.println(label("PAID"));
        System.out.println(label(null));
    }
}`,
        error: 'NullPointerException',
        correct:
          'A `switch` on a `null` value throws `NullPointerException` before any label is checked; `default` does not cover `null` (in Java 21 add an explicit `case null` or check first).',
        wrong: [
          '`null` is handled by `default`, so the exception must come from `println`.',
          'A `switch` on strings compares with `==`, which fails for `null`.',
          '`switch` on `String` is not allowed; use `if`/`else` instead.',
        ],
        why: 'A classic `switch` throws `NullPointerException` when the selector is `null`; `default` only covers non-null values that match no other label. Java 21 pattern-matching switches accept `case null` (also `case null, default ->`). String switches compare with `equals` (via `hashCode`), not `==`.',
      },
    ],
  ),
  ...b.outputChoice(
    'java-labeled-break',
    4,
    'A plain `break` leaves only the innermost loop (or `switch`). A labeled `break` names the loop to leave.',
    [
      {
        key: 'inner-only',
        code: `public class Main {
    public static void main(String[] args) {
        int[][] shelves = {{3, 0, 4}, {2, 5}};
        int counted = 0;
        for (int[] shelf : shelves) {
            for (int box : shelf) {
                if (box == 0) break;
                counted += box;
            }
        }
        System.out.println(counted);
    }
}`,
        correct: '10',
        wrong: ['3', '14', '7'],
        why: 'The `break` leaves only the inner loop. On the first shelf `3` is counted and `0` stops that shelf (so `4` is skipped); the second shelf is still processed: `3 + 2 + 5 = 10`.',
      },
      {
        key: 'labeled',
        code: `public class Main {
    public static void main(String[] args) {
        int[][] shelves = {{3, 0, 4}, {2, 5}};
        int counted = 0;
        search:
        for (int[] shelf : shelves) {
            for (int box : shelf) {
                if (box == 0) break search;
                counted += box;
            }
        }
        System.out.println(counted);
    }
}`,
        correct: '3',
        wrong: ['10', '7', '14'],
        why: '`break search` leaves the loop labeled `search`, the outer one. After counting `3`, the `0` ends both loops, so nothing else is added.',
      },
      {
        key: 'labeled-continue',
        code: `public class Main {
    public static void main(String[] args) {
        int[][] shelves = {{3, 0, 4}, {2, 5}};
        int counted = 0;
        shelves:
        for (int[] shelf : shelves) {
            for (int box : shelf) {
                if (box == 0) continue shelves;
                counted += box;
            }
            counted += 100;
        }
        System.out.println(counted);
    }
}`,
        correct: '110',
        wrong: ['210', '14', '114'],
        why: '`continue shelves` jumps to the next iteration of the outer loop, skipping the rest of the inner loop and the `counted += 100` after it. Shelf one adds only `3`; shelf two adds `2 + 5` and then `100`: `3 + 7 + 100 = 110`.',
      },
    ],
  ),
  ...b.multi(
    'java-equality-facts',
    4,
    'Think about what `==` compares for primitives, for references and for mixed operands.',
    [
      {
        key: 'statements',
        question: 'Select every statement that is true in Java.',
        correct: [
          '`==` on two `int` values compares their numeric values.',
          '`Objects.equals(a, b)` returns `true` when both arguments are `null`.',
          'A class that does not override `equals` compares objects by identity.',
          'Comparing an `Integer` with an `int` using `==` unboxes the `Integer`.',
        ],
        wrong: [
          '`Object.equals` compares all fields of the two objects by reflection.',
          '`==` on two `Integer` objects compares their values once they are larger than 127.',
          '`"a".equals(null)` throws a `NullPointerException`.',
        ],
        why: 'Primitives are compared by value. `Objects.equals` is null-safe and treats two `null`s as equal. `Object.equals` is identity, not a field comparison. Two `Integer` objects compared with `==` are compared by reference; the cache makes small values look equal, and larger values usually are not. Passing `null` to `equals` simply returns false.',
      },
      {
        key: 'null-safety',
        code: `import java.util.Objects;

public class Main {
    public static void main(String[] args) {
        String region = null;
        System.out.println("EU".equals(region));
        System.out.println(Objects.equals(region, null));
        System.out.println(Objects.requireNonNullElse(region, "EU"));
    }
}`,
        question:
          'This program runs without an exception. Select every statement that is true about it.',
        correct: [
          'It prints `false` on the first line, because `"EU".equals(null)` is false.',
          'It prints `true` on the second line.',
          'It prints `EU` on the third line.',
        ],
        wrong: [
          'Swapping the first call to `region.equals("EU")` would print `false`.',
          '`Objects.requireNonNullElse` throws because `region` is `null`.',
        ],
        why: 'Calling `equals` on a constant is null-safe, but `region.equals("EU")` would throw `NullPointerException`, because the receiver is `null`. `Objects.equals(null, null)` is `true`. `requireNonNullElse` returns the fallback when the first argument is `null`; it is `requireNonNull` that throws.',
      },
    ],
  ),
  ...b.fails(
    'java-ternary-unboxing',
    5,
    'Find where a wrapper value is converted to a primitive. What does the conditional operator do with an `Integer` and an `int` branch?',
    [
      {
        key: 'discount',
        question:
          'Why does this pricing code throw, even though `discount` is only used for VIP customers?',
        code: `public class Main {
    static Integer loadDiscount(String customer) {
        return null; // not configured yet
    }

    public static void main(String[] args) {
        boolean vip = true;
        Integer discount = loadDiscount("acme");
        Integer applied = vip ? discount : 0;
        System.out.println(applied);
    }
}`,
        error: 'NullPointerException',
        correct:
          'With an `Integer` and an `int` branch, the conditional expression has type `int`, so `discount` is unboxed (and throws) even though the result is assigned to an `Integer`.',
        wrong: [
          'Assigning `null` to an `Integer` variable throws `NullPointerException`.',
          '`println` cannot print a `null` `Integer`.',
          '`loadDiscount` must not return `null` from a method declared to return `Integer`.',
        ],
        why: 'If one operand of `?:` is `Integer` and the other is `int`, the result type is `int`: the `Integer` branch is unboxed. Unboxing `null` throws. Making both branches `Integer` (for example `vip ? discount : Integer.valueOf(0)`) or handling `null` first avoids it. Assigning `null` to an `Integer` and printing it are both fine (`println` prints `null`).',
      },
      {
        key: 'map-ternary',
        question: 'Why does this quota lookup throw for an unknown user?',
        code: `import java.util.Map;

public class Main {
    public static void main(String[] args) {
        Map<String, Integer> quotas = Map.of("ada", 10);
        String user = "bob";
        boolean known = !user.isEmpty();
        Integer quota = known ? quotas.get(user) : 5;
        System.out.println(quota);
    }
}`,
        error: 'NullPointerException',
        correct:
          '`quotas.get("bob")` is `null`, and because the other branch is the `int` literal `5`, the conditional unboxes the `null`.',
        wrong: [
          '`Map.of` maps throw `NullPointerException` from `get` for a missing key.',
          '`Map.of` maps cannot be read with `get`; use `getOrDefault`.',
          '`!user.isEmpty()` throws because `user` is not empty.',
        ],
        why: '`Map.of` maps return `null` from `get` for a missing key (they only reject `null` keys and values). The mixed `Integer`/`int` conditional has type `int`, so the `null` is unboxed and throws. `quotas.getOrDefault(user, 5)` is the clean fix.',
      },
    ],
  ),
];
