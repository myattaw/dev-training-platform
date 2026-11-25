import type { QuestionSource } from '@pracstack/content-model';
import {
  plsqlBlankFamily,
  plsqlCodeChoiceFamily,
  plsqlConceptFamily,
  plsqlOutputFamily,
} from './builders';

/** More procedure, function and package questions, so every tier has enough new questions. */

export const moreSubprogramQuestions: readonly QuestionSource[] = [
  ...plsqlBlankFamily('plsql-create-procedure', 2, 'It performs an action and returns no value.', [
    {
      key: 'kind',
      prompt: 'Complete the statement that creates a stored procedure.',
      template: `CREATE OR REPLACE {{blank:kind}} log_message(p_text VARCHAR2) IS
BEGIN
  DBMS_OUTPUT.PUT_LINE('LOG: ' || p_text);
END;
/
BEGIN
  log_message('started');
END;
/`,
      blanks: { kind: ['PROCEDURE'] },
      why: '`CREATE OR REPLACE PROCEDURE` stores a named procedure; `OR REPLACE` keeps its grants when you change it.',
    },
  ]),
  ...plsqlOutputFamily(
    'plsql-local-function',
    4,
    ['A block can declare its own functions after its variables.'],
    [
      {
        key: 'square',
        code: `DECLARE
  v_total NUMBER := 0;
  FUNCTION square(n NUMBER) RETURN NUMBER IS
  BEGIN
    RETURN n * n;
  END;
BEGIN
  FOR i IN 1..3 LOOP
    v_total := v_total + square(i);
  END LOOP;
  DBMS_OUTPUT.PUT_LINE(v_total);
END;
/`,
        output: '14',
        why: 'A local function exists only inside this block: 1 + 4 + 9 = 14. Local subprograms must be declared after the variables.',
      },
      {
        key: 'recursion',
        code: `CREATE OR REPLACE FUNCTION factorial(n NUMBER) RETURN NUMBER IS
BEGIN
  IF n <= 1 THEN
    RETURN 1;
  END IF;
  RETURN n * factorial(n - 1);
END;
/
BEGIN
  DBMS_OUTPUT.PUT_LINE(factorial(5));
END;
/`,
        output: '120',
        why: 'The function calls itself until n reaches 1: 5 × 4 × 3 × 2 × 1 = 120.',
      },
    ],
  ),
  ...plsqlCodeChoiceFamily(
    'plsql-function-no-return',
    5,
    'Follow the path the call takes for a negative number.',
    [
      {
        key: 'missing-return',
        question: 'The function compiles. What happens when the block runs?',
        code: `CREATE OR REPLACE FUNCTION sign_text(p_value NUMBER) RETURN VARCHAR2 IS
BEGIN
  IF p_value > 0 THEN
    RETURN 'positive';
  END IF;
END;
/
BEGIN
  DBMS_OUTPUT.PUT_LINE(sign_text(-1));
END;
/`,
        fails: 'ORA-06503',
        correct: 'It fails with ORA-06503: the function ended without returning a value',
        wrong: ['It prints an empty line', 'It prints positive', 'It prints NULL'],
        why: 'Every path through a function must reach a `RETURN`. Reaching `END` instead raises ORA-06503 at run time (the compiler only warns, if warnings are enabled).',
      },
      {
        key: 'dml-in-query',
        tables: true,
        question: 'The function compiles. What happens when the block runs?',
        code: `CREATE OR REPLACE FUNCTION next_bonus RETURN NUMBER IS
BEGIN
  UPDATE employees SET salary = salary + 1;
  RETURN 1;
END;
/
DECLARE
  v NUMBER;
BEGIN
  SELECT next_bonus INTO v FROM dual;
END;
/`,
        fails: 'ORA-14551',
        correct: 'It fails with ORA-14551: a function called from a query cannot change data',
        wrong: [
          'It raises every salary by 1',
          'It returns 1 and the UPDATE is rolled back',
          'It does not compile',
        ],
        why: 'A query must not have side effects, so a function that runs DML cannot be called from a `SELECT`. Call it as a PL/SQL statement instead, or make it a procedure.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-out-on-exception',
    5,
    ['When is an OUT parameter copied back to the caller?'],
    [
      {
        key: 'not-copied',
        code: `CREATE OR REPLACE PROCEDURE set_then_fail(p_value OUT NUMBER) IS
BEGIN
  p_value := 10;
  RAISE NO_DATA_FOUND;
END;
/
DECLARE
  v NUMBER := 5;
BEGIN
  BEGIN
    set_then_fail(v);
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      NULL;
  END;
  DBMS_OUTPUT.PUT_LINE(v);
END;
/`,
        output: '5',
        why: 'OUT values are copied back only when the procedure ends normally. It ended with an exception, so `v` keeps 5. (With `NOCOPY` the result can differ: that hint lets Oracle pass by reference.)',
      },
    ],
  ),
];

export const morePackageQuestions: readonly QuestionSource[] = [
  ...plsqlConceptFamily(
    'plsql-package-parts',
    1,
    'One part is the interface, the other the implementation.',
    [
      {
        key: 'two-parts',
        question: 'What are the two parts of a PL/SQL package?',
        correct: 'The specification and the body',
        wrong: [
          'The header and the trailer',
          'The procedure and the function',
          'The schema and the table',
        ],
        why: 'The specification (`CREATE PACKAGE`) is the public interface; the body (`CREATE PACKAGE BODY`) implements it.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-package-constant',
    2,
    ['A package of only declarations needs no body.'],
    [
      {
        key: 'limit',
        code: `CREATE OR REPLACE PACKAGE limits AS
  max_salary CONSTANT NUMBER := 9000;
END limits;
/
BEGIN
  DBMS_OUTPUT.PUT_LINE(limits.max_salary);
END;
/`,
        output: '9000',
        why: 'A specification with only constants, types or variables needs no body. Shared constants in a package keep magic numbers in one place.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-package-init',
    3,
    ['The BEGIN section of a package body runs once per session.'],
    [
      {
        key: 'once',
        code: `CREATE OR REPLACE PACKAGE settings AS
  g_rate NUMBER;
END settings;
/
CREATE OR REPLACE PACKAGE BODY settings AS
BEGIN
  g_rate := 0.2;
  DBMS_OUTPUT.PUT_LINE('initialized');
END settings;
/
BEGIN
  DBMS_OUTPUT.PUT_LINE(settings.g_rate);
  DBMS_OUTPUT.PUT_LINE(settings.g_rate);
END;
/`,
        output: 'initialized\n.2\n.2',
        why: 'The initialization section runs the first time the session uses the package, not at every call, so `initialized` is printed once and the rate twice. Note how Oracle prints 0.2 by default: `.2`.',
      },
      {
        key: 'private-state',
        code: `CREATE OR REPLACE PACKAGE tally AS
  PROCEDURE add(p NUMBER);
  FUNCTION total RETURN NUMBER;
END tally;
/
CREATE OR REPLACE PACKAGE BODY tally AS
  g_total NUMBER := 0;
  PROCEDURE add(p NUMBER) IS
  BEGIN
    g_total := g_total + p;
  END add;
  FUNCTION total RETURN NUMBER IS
  BEGIN
    RETURN g_total;
  END total;
END tally;
/
BEGIN
  tally.add(5);
  tally.add(7);
  DBMS_OUTPUT.PUT_LINE(tally.total);
END;
/`,
        output: '12',
        why: '`g_total` is declared in the body, so it is private: callers can only change it through `add` and read it through `total`.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-overload-count',
    4,
    ['Overloads can also differ in how many parameters they take.'],
    [
      {
        key: 'area',
        code: `CREATE OR REPLACE PACKAGE geometry AS
  FUNCTION area(p_side NUMBER) RETURN NUMBER;
  FUNCTION area(p_width NUMBER, p_height NUMBER) RETURN NUMBER;
END geometry;
/
CREATE OR REPLACE PACKAGE BODY geometry AS
  FUNCTION area(p_side NUMBER) RETURN NUMBER IS
  BEGIN
    RETURN p_side * p_side;
  END area;
  FUNCTION area(p_width NUMBER, p_height NUMBER) RETURN NUMBER IS
  BEGIN
    RETURN p_width * p_height;
  END area;
END geometry;
/
BEGIN
  DBMS_OUTPUT.PUT_LINE(geometry.area(3));
  DBMS_OUTPUT.PUT_LINE(geometry.area(2, 5));
END;
/`,
        output: '9\n10',
        why: 'One argument calls the square version (3 × 3), two arguments the rectangle version (2 × 5).',
      },
    ],
  ),
  ...plsqlCodeChoiceFamily(
    'plsql-package-body-mismatch',
    4,
    'The body must implement what the specification promises.',
    [
      {
        key: 'missing',
        question: 'What happens when the package body is created?',
        code: `CREATE OR REPLACE PACKAGE orders AS
  PROCEDURE place;
  PROCEDURE cancel;
END orders;
/
CREATE OR REPLACE PACKAGE BODY orders AS
  PROCEDURE place IS
  BEGIN
    NULL;
  END place;
END orders;
/`,
        fails: 'compile',
        correct:
          'The body is created with compilation errors: cancel is declared but not implemented (PLS-00323)',
        wrong: [
          'It works; calling cancel later does nothing',
          'It works; cancel becomes a private procedure',
          'The specification is dropped',
        ],
        why: 'Every subprogram in the specification needs a matching implementation in the body, or the body is invalid and nothing in the package can be called.',
      },
    ],
  ),
  ...plsqlCodeChoiceFamily(
    'plsql-forward-declaration',
    5,
    'Inside a package body, a routine must be declared before it is called.',
    [
      {
        key: 'helper-after',
        question: 'What happens when the package body is created?',
        code: `CREATE OR REPLACE PACKAGE report AS
  PROCEDURE run;
END report;
/
CREATE OR REPLACE PACKAGE BODY report AS
  PROCEDURE run IS
  BEGIN
    print_header;
  END run;

  PROCEDURE print_header IS
  BEGIN
    DBMS_OUTPUT.PUT_LINE('REPORT');
  END print_header;
END report;
/`,
        fails: 'compile',
        correct:
          'It has compilation errors: print_header is used before it is declared (PLS-00313)',
        wrong: [
          'It works, because both procedures are in the same body',
          'It works, but print_header is public',
          'It fails only when report.run is called',
        ],
        why: 'PL/SQL reads top to bottom: a private routine must be defined, or forward-declared (`PROCEDURE print_header;`), before code that calls it.',
      },
    ],
  ),
  ...plsqlConceptFamily(
    'plsql-package-state-discarded',
    5,
    'Recompiling a package throws away the state sessions held in it.',
    [
      {
        key: 'ora-04068',
        question:
          'A session has used a package that holds variables. Someone recompiles the package. What does that session get on its next call?',
        correct: 'ORA-04068: existing state of packages has been discarded; calling again works',
        wrong: [
          'The old package code until the session ends',
          'The new code with the old variable values',
          'A deadlock until the other session commits',
        ],
        why: "The session's copy of the package state no longer matches the code, so Oracle discards it and raises ORA-04068 once. Packages without state (no package-level variables) avoid this.",
      },
    ],
  ),
];
