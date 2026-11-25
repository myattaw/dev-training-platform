import type { QuestionSource } from '@pracstack/content-model';
import {
  plsqlBlankFamily,
  plsqlCodeChoiceFamily,
  plsqlConceptFamily,
  plsqlOutputFamily,
} from './builders';

// ---------------------------------------------------------------- Blocks and variables

export const blockQuestions: readonly QuestionSource[] = [
  ...plsqlOutputFamily(
    'plsql-block-assign',
    1,
    ['`:=` assigns; `||` joins text.'],
    [
      {
        key: 'multiply',
        code: `DECLARE
  v_count NUMBER := 2;
BEGIN
  v_count := v_count * 3;
  DBMS_OUTPUT.PUT_LINE('Count: ' || v_count);
END;
/`,
        output: 'Count: 6',
        why: 'A block declares variables in `DECLARE`, runs statements between `BEGIN` and `END`, and `:=` assigns. `||` converts the number to text and joins it.',
      },
    ],
  ),
  ...plsqlBlankFamily(
    'plsql-block-put-line',
    1,
    'DBMS_OUTPUT has a procedure that prints a line.',
    [
      {
        key: 'hello',
        prompt: 'Complete the block so it prints `Hello`.',
        template: `BEGIN
  DBMS_OUTPUT.{{blank:print}}('Hello');
END;
/`,
        blanks: { print: ['PUT_LINE'] },
        why: '`DBMS_OUTPUT.PUT_LINE` writes a line to the output buffer, which tools show when server output is on (`SET SERVEROUTPUT ON` in SQL*Plus and SQL Developer).',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-block-null-concat',
    2,
    ['A variable without a default value starts as NULL.'],
    [
      {
        key: 'empty-name',
        code: `DECLARE
  v_name VARCHAR2(20);
BEGIN
  DBMS_OUTPUT.PUT_LINE('Hi ' || v_name || '!');
END;
/`,
        output: 'Hi !',
        why: 'An unassigned variable is NULL, and in Oracle `||` treats NULL as an empty string, so nothing is inserted (no error, and no "null" text).',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-select-into',
    2,
    ['`SELECT … INTO` puts one row into variables.'],
    [
      {
        key: 'name',
        tables: true,
        code: `DECLARE
  v_name employees.name%TYPE;
BEGIN
  SELECT name INTO v_name FROM employees WHERE id = 3;
  DBMS_OUTPUT.PUT_LINE(v_name);
END;
/`,
        output: 'Grace',
        why: '`SELECT … INTO` reads exactly one row into the variables. Employee 3 is Grace.',
      },
      {
        key: 'salary',
        tables: true,
        code: `DECLARE
  v_salary employees.salary%TYPE;
BEGIN
  SELECT salary INTO v_salary FROM employees WHERE name = 'Linus';
  DBMS_OUTPUT.PUT_LINE(v_salary * 2);
END;
/`,
        output: '8000',
        why: "`SELECT … INTO` reads Linus's salary (4000) into the variable; doubled it is 8000.",
      },
    ],
  ),
  ...plsqlBlankFamily(
    'plsql-percent-type',
    3,
    'Anchor the variable to the column, so it follows the column definition.',
    [
      {
        key: 'salary',
        tables: true,
        prompt:
          'Declare `v_salary` with the same data type as the `salary` column of `employees`, whatever that type is.',
        template: `DECLARE
  v_salary employees.salary{{blank:anchor}};
BEGIN
  SELECT salary INTO v_salary FROM employees WHERE id = 1;
  DBMS_OUTPUT.PUT_LINE(v_salary);
END;
/`,
        blanks: { anchor: ['%TYPE'] },
        why: "`%TYPE` gives the variable the column's data type. If the column changes (say, `NUMBER(8,2)` to `NUMBER(10,2)`), the code still matches after it is recompiled.",
      },
    ],
  ),
  ...plsqlConceptFamily(
    'plsql-percent-type-why',
    3,
    'Think about what happens when the table changes.',
    [
      {
        key: 'benefit',
        question:
          'Why declare `v_salary employees.salary%TYPE` rather than `v_salary NUMBER(8, 2)`?',
        correct:
          'The variable follows the column: if the column type changes, the code does not need editing',
        wrong: [
          'It makes the variable faster to read',
          'It reads the salary from the table automatically',
          '`NUMBER(8, 2)` is not allowed in PL/SQL',
        ],
        why: '`%TYPE` copies the data type (not the value). Hard-coded types drift from the table: widen the column and `NUMBER(8, 2)` overflows on large values (ORA-06502).',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-nested-scope',
    4,
    ['An inner block can declare a variable with the same name; it hides the outer one inside.'],
    [
      {
        key: 'shadow',
        code: `DECLARE
  x NUMBER := 1;
BEGIN
  DECLARE
    x NUMBER := 2;
  BEGIN
    DBMS_OUTPUT.PUT_LINE(x);
  END;
  DBMS_OUTPUT.PUT_LINE(x);
END;
/`,
        output: '2\n1',
        why: 'The inner block declares its own `x`, which hides the outer one only inside that block. After it ends, `x` is the outer variable again.',
      },
    ],
  ),
  ...plsqlCodeChoiceFamily('plsql-select-into-rows', 4, '`SELECT … INTO` needs exactly one row.', [
    {
      key: 'too-many',
      tables: true,
      question: 'What happens when this block runs?',
      code: `DECLARE
  v_name employees.name%TYPE;
BEGIN
  SELECT name INTO v_name FROM employees WHERE dept_id = 10;
  DBMS_OUTPUT.PUT_LINE(v_name);
END;
/`,
      fails: 'ORA-01422',
      correct: 'It fails with TOO_MANY_ROWS (ORA-01422): two employees are in department 10',
      wrong: [
        'It prints Ada, the first matching row',
        'It prints both names on one line',
        'It prints nothing, because the variable can hold only one name',
      ],
      why: '`SELECT … INTO` must return exactly one row: more raises `TOO_MANY_ROWS` (ORA-01422), none raises `NO_DATA_FOUND` (ORA-01403). For several rows, use a cursor loop or `BULK COLLECT`.',
    },
    {
      key: 'no-data',
      tables: true,
      question: 'What happens when this block runs?',
      code: `DECLARE
  v_name employees.name%TYPE;
BEGIN
  SELECT name INTO v_name FROM employees WHERE id = 99;
  DBMS_OUTPUT.PUT_LINE(NVL(v_name, 'nobody'));
END;
/`,
      fails: 'ORA-01403',
      correct: 'It fails with NO_DATA_FOUND (ORA-01403): no employee has id 99',
      wrong: ['It prints nobody', 'It prints an empty line', 'It prints nothing and succeeds'],
      why: '`SELECT … INTO` raises `NO_DATA_FOUND` when no row matches, before `PUT_LINE` runs; the `NVL` never gets a chance. Handle it in an `EXCEPTION` section, or use an aggregate, which always returns one row.',
    },
  ]),
  ...plsqlOutputFamily(
    'plsql-aggregate-into',
    5,
    ['An aggregate without GROUP BY always returns exactly one row.'],
    [
      {
        key: 'sum-none',
        tables: true,
        code: `DECLARE
  v_total NUMBER;
BEGIN
  SELECT SUM(salary) INTO v_total FROM employees WHERE dept_id = 99;
  DBMS_OUTPUT.PUT_LINE(NVL(v_total, 0));
END;
/`,
        output: '0',
        why: 'No employee is in department 99, but `SUM` without `GROUP BY` still returns one row, holding NULL. So there is no `NO_DATA_FOUND`, and `NVL` turns the NULL into 0. (`COUNT(*)` would return 0 directly.)',
      },
      {
        key: 'count-none',
        tables: true,
        code: `DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM employees WHERE dept_id = 99;
  DBMS_OUTPUT.PUT_LINE('Employees: ' || v_count);
END;
/`,
        output: 'Employees: 0',
        why: '`COUNT(*)` without `GROUP BY` returns exactly one row even when nothing matches, with the value 0, so `SELECT … INTO` succeeds.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Conditions and loops

export const controlQuestions: readonly QuestionSource[] = [
  ...plsqlOutputFamily(
    'plsql-for-loop',
    1,
    ['`FOR i IN a..b` counts from a to b, one step at a time.'],
    [
      {
        key: 'up',
        code: `BEGIN
  FOR i IN 1..3 LOOP
    DBMS_OUTPUT.PUT_LINE(i);
  END LOOP;
END;
/`,
        output: '1\n2\n3',
        why: 'A numeric `FOR` loop declares its counter itself and runs once for each value from the lower to the upper bound.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-for-reverse',
    2,
    ['`REVERSE` changes the direction, not the bounds.'],
    [
      {
        key: 'down',
        code: `BEGIN
  FOR i IN REVERSE 1..3 LOOP
    DBMS_OUTPUT.PUT_LINE(i);
  END LOOP;
END;
/`,
        output: '3\n2\n1',
        why: 'With `REVERSE` the loop runs from the upper bound down to the lower one. The bounds are still written low..high: `REVERSE 3..1` would not run at all.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-if-elsif',
    2,
    ['Conditions are tested top to bottom; the first true one wins.'],
    [
      {
        key: 'medium',
        code: `DECLARE
  v_salary NUMBER := 4500;
BEGIN
  IF v_salary > 5000 THEN
    DBMS_OUTPUT.PUT_LINE('High');
  ELSIF v_salary > 4000 THEN
    DBMS_OUTPUT.PUT_LINE('Medium');
  ELSE
    DBMS_OUTPUT.PUT_LINE('Low');
  END IF;
END;
/`,
        output: 'Medium',
        why: '4500 is not above 5000, but it is above 4000, so the `ELSIF` branch runs. Note the spelling: `ELSIF`, not `ELSEIF` or `ELSE IF`.',
      },
    ],
  ),
  ...plsqlBlankFamily(
    'plsql-basic-loop-exit',
    2,
    'A basic LOOP runs until a statement leaves it.',
    [
      {
        key: 'exit-when',
        prompt: 'Complete the loop so it stops after printing 1, 2 and 3.',
        template: `DECLARE
  i NUMBER := 1;
BEGIN
  LOOP
    {{blank:leave}} WHEN i > 3;
    DBMS_OUTPUT.PUT_LINE(i);
    i := i + 1;
  END LOOP;
END;
/`,
        blanks: { leave: ['EXIT'] },
        why: '`EXIT WHEN condition` leaves the innermost loop when the condition is true. Without it, a basic `LOOP` never ends.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-while-loop',
    3,
    ['The condition is checked before each iteration.'],
    [
      {
        key: 'triple',
        code: `DECLARE
  i NUMBER := 1;
BEGIN
  WHILE i < 20 LOOP
    i := i * 3;
  END LOOP;
  DBMS_OUTPUT.PUT_LINE(i);
END;
/`,
        output: '27',
        why: 'i goes 1, 3, 9, 27. When i is 9 the condition `9 < 20` is still true, so it runs once more to 27; then `27 < 20` is false and the loop ends.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-case-expression',
    3,
    ['A searched CASE returns the value of the first true WHEN.'],
    [
      {
        key: 'grade',
        code: `DECLARE
  v_score NUMBER := 85;
  v_grade CHAR(1);
BEGIN
  v_grade := CASE
               WHEN v_score >= 90 THEN 'A'
               WHEN v_score >= 80 THEN 'B'
               ELSE 'C'
             END;
  DBMS_OUTPUT.PUT_LINE(v_grade);
END;
/`,
        output: 'B',
        why: '85 fails `>= 90` and passes `>= 80`, so the expression is B. A `CASE` expression returns a value; the `CASE` statement (ending `END CASE;`) runs statements instead.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-null-condition',
    4,
    ['A comparison with NULL is neither true nor false.'],
    [
      {
        key: 'unknown',
        code: `DECLARE
  v NUMBER;
BEGIN
  IF v > 0 THEN
    DBMS_OUTPUT.PUT_LINE('positive');
  ELSIF NOT (v > 0) THEN
    DBMS_OUTPUT.PUT_LINE('not positive');
  ELSE
    DBMS_OUTPUT.PUT_LINE('unknown');
  END IF;
END;
/`,
        output: 'unknown',
        why: '`v` is NULL, so `v > 0` is NULL (unknown), and so is `NOT (v > 0)`. `IF` only takes a branch whose condition is TRUE, so control falls through to `ELSE`. Test `v IS NULL` explicitly.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-continue',
    4,
    ['`CONTINUE WHEN` skips the rest of this iteration.'],
    [
      {
        key: 'odd-sum',
        code: `DECLARE
  v_sum NUMBER := 0;
BEGIN
  FOR i IN 1..6 LOOP
    CONTINUE WHEN MOD(i, 2) = 0;
    v_sum := v_sum + i;
  END LOOP;
  DBMS_OUTPUT.PUT_LINE(v_sum);
END;
/`,
        output: '9',
        why: 'Even numbers skip the addition, so only 1 + 3 + 5 = 9 is added. `CONTINUE` moves on to the next iteration; `EXIT` would leave the loop.',
      },
    ],
  ),
  ...plsqlCodeChoiceFamily(
    'plsql-for-counter-readonly',
    5,
    'Who owns the counter of a numeric FOR loop?',
    [
      {
        key: 'assign',
        question: 'What happens when this block runs?',
        code: `BEGIN
  FOR i IN 1..10 LOOP
    IF i = 3 THEN
      i := 10;
    END IF;
    DBMS_OUTPUT.PUT_LINE(i);
  END LOOP;
END;
/`,
        fails: 'ORA-06550',
        correct: 'It does not compile: the counter of a FOR loop cannot be assigned (PLS-00363)',
        wrong: [
          'It prints 1, 2 and 10, then stops',
          'It prints 1 to 10, ignoring the assignment',
          'It loops forever',
        ],
        why: 'The loop declares `i` itself and it is read-only inside the loop, so the block fails to compile (PLS-00363, reported as ORA-06550 for an anonymous block). To stop early, use `EXIT WHEN`.',
      },
    ],
  ),
];
