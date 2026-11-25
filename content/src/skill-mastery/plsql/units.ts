import type { QuestionSource } from '@pracstack/content-model';
import {
  plsqlBlankFamily,
  plsqlCodeChoiceFamily,
  plsqlConceptFamily,
  plsqlOutputFamily,
} from './builders';

// ---------------------------------------------------------------- Procedures and functions

export const subprogramQuestions: readonly QuestionSource[] = [
  ...plsqlOutputFamily(
    'plsql-function-call',
    1,
    ['A function RETURNs a value; call it like an expression.'],
    [
      {
        key: 'double',
        code: `CREATE OR REPLACE FUNCTION double_it(p_value NUMBER) RETURN NUMBER IS
BEGIN
  RETURN p_value * 2;
END;
/
BEGIN
  DBMS_OUTPUT.PUT_LINE(double_it(21));
END;
/`,
        output: '42',
        why: '`CREATE OR REPLACE FUNCTION` stores the function in the database; any block (or SQL) can then call it. It returns 21 * 2.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-procedure-call',
    2,
    ['A procedure does work; it is called as a statement.'],
    [
      {
        key: 'raise',
        tables: true,
        code: `CREATE OR REPLACE PROCEDURE raise_salary(p_id NUMBER, p_amount NUMBER) IS
BEGIN
  UPDATE employees SET salary = salary + p_amount WHERE id = p_id;
END;
/
DECLARE
  v_salary employees.salary%TYPE;
BEGIN
  raise_salary(4, 500);
  SELECT salary INTO v_salary FROM employees WHERE id = 4;
  DBMS_OUTPUT.PUT_LINE(v_salary);
END;
/`,
        output: '3500',
        why: "The procedure adds 500 to Alan's 3000. A procedure is called as a statement on its own; it does not return a value (a function does).",
      },
    ],
  ),
  ...plsqlBlankFamily('plsql-function-return', 2, 'A function declares the type it gives back.', [
    {
      key: 'header',
      prompt: 'Complete the function header.',
      template: `CREATE OR REPLACE FUNCTION add_tax(p_amount NUMBER) {{blank:kw}} NUMBER IS
BEGIN
  RETURN p_amount * 1.2;
END;
/
BEGIN
  DBMS_OUTPUT.PUT_LINE(add_tax(100));
END;
/`,
      blanks: { kw: ['RETURN'] },
      why: 'A function header names its return type with `RETURN type` (no size: `RETURN VARCHAR2`, not `VARCHAR2(20)`), and the body must reach a `RETURN value` statement.',
    },
  ]),
  ...plsqlOutputFamily(
    'plsql-out-parameter',
    3,
    ['An OUT parameter passes a value back to the caller.'],
    [
      {
        key: 'name',
        tables: true,
        code: `CREATE OR REPLACE PROCEDURE get_name(p_id IN NUMBER, p_name OUT VARCHAR2) IS
BEGIN
  SELECT name INTO p_name FROM employees WHERE id = p_id;
END;
/
DECLARE
  v_name employees.name%TYPE;
BEGIN
  get_name(3, v_name);
  DBMS_OUTPUT.PUT_LINE(v_name);
END;
/`,
        output: 'Grace',
        why: 'The procedure writes the name into its `OUT` parameter, and the value is copied back into `v_name` when it returns.',
      },
      {
        key: 'named-notation',
        code: `CREATE OR REPLACE PROCEDURE greet(p_name VARCHAR2, p_greeting VARCHAR2 DEFAULT 'Hello') IS
BEGIN
  DBMS_OUTPUT.PUT_LINE(p_greeting || ', ' || p_name);
END;
/
BEGIN
  greet(p_name => 'Ada');
  greet('Linus', 'Hi');
END;
/`,
        output: 'Hello, Ada\nHi, Linus',
        why: 'The first call uses named notation (`=>`) and leaves `p_greeting` out, so its `DEFAULT` applies. The second passes both by position.',
      },
    ],
  ),
  ...plsqlBlankFamily('plsql-in-out-mode', 3, 'The procedure reads the value and changes it.', [
    {
      key: 'bonus',
      prompt:
        "Give the parameter the mode that lets the procedure read and change the caller's variable.",
      template: `CREATE OR REPLACE PROCEDURE add_bonus(p_salary {{blank:mode}} NUMBER) IS
BEGIN
  p_salary := p_salary + 100;
END;
/
DECLARE
  v_salary NUMBER := 1000;
BEGIN
  add_bonus(v_salary);
  DBMS_OUTPUT.PUT_LINE(v_salary);
END;
/`,
      blanks: { mode: ['IN OUT'] },
      why: '`IN` (the default) is read-only, `OUT` starts as NULL inside the procedure, and `IN OUT` both receives the value and passes the new one back.',
    },
  ]),
  ...plsqlCodeChoiceFamily(
    'plsql-in-readonly',
    4,
    'What mode does a parameter have when none is written?',
    [
      {
        key: 'assign-in',
        question: 'What happens when this procedure is created?',
        code: `CREATE OR REPLACE PROCEDURE apply_cap(p_salary NUMBER) IS
BEGIN
  IF p_salary > 6000 THEN
    p_salary := 6000;
  END IF;
END;
/`,
        fails: 'compile',
        correct:
          'It is created with compilation errors: p_salary is an IN parameter, which is read-only',
        wrong: [
          "It works and caps the caller's variable at 6000",
          'It works, but the change is lost when the procedure returns',
          'It fails only when called with a value above 6000',
        ],
        why: 'Without a mode a parameter is `IN`, and an `IN` parameter cannot be assigned (PLS-00363). The procedure is stored but invalid. Copy it to a local variable, or make it `IN OUT` if the caller should see the change.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-function-in-sql',
    4,
    ['A stored function can be used inside a SQL statement.'],
    [
      {
        key: 'where',
        tables: true,
        code: `CREATE OR REPLACE FUNCTION double_it(p_value NUMBER) RETURN NUMBER IS
BEGIN
  RETURN p_value * 2;
END;
/
DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM employees WHERE salary > double_it(2000);
  DBMS_OUTPUT.PUT_LINE(v_count);
END;
/`,
        output: '2',
        why: '`double_it(2000)` is 4000, and Ada (5000) and Grace (4500) earn more than that. Functions called from SQL must not change data (no `UPDATE` inside a function called by a `SELECT`).',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-out-starts-null',
    5,
    ['What value does an OUT parameter have when the procedure starts?'],
    [
      {
        key: 'not-assigned',
        code: `CREATE OR REPLACE PROCEDURE maybe_set(p_value OUT NUMBER) IS
BEGIN
  NULL;
END;
/
DECLARE
  v NUMBER := 5;
BEGIN
  maybe_set(v);
  DBMS_OUTPUT.PUT_LINE(NVL(TO_CHAR(v), 'NULL'));
END;
/`,
        output: 'NULL',
        why: "An `OUT` parameter starts as NULL inside the procedure, whatever the caller's variable held, and that NULL is copied back. Use `IN OUT` to keep the caller's value when the procedure does not set it.",
      },
    ],
  ),
  ...plsqlConceptFamily(
    'plsql-function-or-procedure',
    1,
    'One gives back a value, the other performs an action.',
    [
      {
        key: 'choose',
        question:
          'You need a routine that calculates the bonus for a salary, usable inside a SELECT. What should it be?',
        correct: 'A function that RETURNs the bonus',
        wrong: [
          'A procedure with an IN parameter',
          'A trigger on the employees table',
          'An anonymous block',
        ],
        why: 'Functions return a value and can be called in SQL expressions (`SELECT name, bonus(salary) FROM employees`). Procedures perform actions and are called as statements.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Packages

export const packageQuestions: readonly QuestionSource[] = [
  ...plsqlConceptFamily(
    'plsql-package-spec',
    1,
    'The specification is the public face of the package.',
    [
      {
        key: 'contents',
        question: 'What goes in a package specification?',
        correct:
          'The declarations other code may use: procedure and function headers, types, constants',
        wrong: [
          'The code of every procedure and function',
          'Only private helper routines',
          'The tables the package reads',
        ],
        why: 'The specification (`CREATE PACKAGE`) declares the public interface; the body (`CREATE PACKAGE BODY`) holds the code, plus private routines and variables that are not in the specification.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-package-call',
    2,
    ['Call a packaged function as package.function.'],
    [
      {
        key: 'bonus',
        code: `CREATE OR REPLACE PACKAGE pay AS
  FUNCTION bonus(p_salary NUMBER) RETURN NUMBER;
END pay;
/
CREATE OR REPLACE PACKAGE BODY pay AS
  FUNCTION bonus(p_salary NUMBER) RETURN NUMBER IS
  BEGIN
    RETURN p_salary * 0.1;
  END bonus;
END pay;
/
BEGIN
  DBMS_OUTPUT.PUT_LINE(pay.bonus(5000));
END;
/`,
        output: '500',
        why: 'The specification declares `bonus`, the body implements it, and callers use `pay.bonus(…)`.',
      },
    ],
  ),
  ...plsqlBlankFamily(
    'plsql-package-body',
    2,
    'The specification and the code are created separately.',
    [
      {
        key: 'body',
        prompt: 'Complete the statement that creates the code of the package.',
        template: `CREATE OR REPLACE PACKAGE greeting AS
  PROCEDURE hello;
END greeting;
/
CREATE OR REPLACE PACKAGE {{blank:part}} greeting AS
  PROCEDURE hello IS
  BEGIN
    DBMS_OUTPUT.PUT_LINE('Hello');
  END hello;
END greeting;
/
BEGIN
  greeting.hello;
END;
/`,
        blanks: { part: ['BODY'] },
        why: '`CREATE PACKAGE` creates the specification, `CREATE PACKAGE BODY` the implementation. Every routine declared in the specification must be implemented in the body.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-package-state',
    3,
    ['Package variables keep their values for the whole session.'],
    [
      {
        key: 'counter',
        code: `CREATE OR REPLACE PACKAGE counter AS
  g_count NUMBER := 0;
  PROCEDURE add_one;
END counter;
/
CREATE OR REPLACE PACKAGE BODY counter AS
  PROCEDURE add_one IS
  BEGIN
    g_count := g_count + 1;
  END add_one;
END counter;
/
BEGIN
  counter.add_one;
  counter.add_one;
END;
/
BEGIN
  counter.add_one;
  DBMS_OUTPUT.PUT_LINE(counter.g_count);
END;
/`,
        output: '3',
        why: "A package's variables live for the database session, not for one block: both blocks run in the same session, so the count reaches 3. Another session has its own copy, starting at 0.",
      },
    ],
  ),
  ...plsqlCodeChoiceFamily(
    'plsql-package-private',
    4,
    'Only what is in the specification can be called from outside.',
    [
      {
        key: 'helper',
        question: 'The package is created without errors. What happens when the last block runs?',
        code: `CREATE OR REPLACE PACKAGE report AS
  PROCEDURE run;
END report;
/
CREATE OR REPLACE PACKAGE BODY report AS
  PROCEDURE helper IS
  BEGIN
    DBMS_OUTPUT.PUT_LINE('helping');
  END helper;

  PROCEDURE run IS
  BEGIN
    helper;
  END run;
END report;
/
BEGIN
  report.helper;
END;
/`,
        fails: 'ORA-06550',
        correct:
          'It fails: helper is not in the specification, so only code inside the package body can call it',
        wrong: [
          'It prints helping',
          'It prints nothing, because helper is private',
          'It runs report.run instead',
        ],
        why: 'Routines declared only in the body are private (PLS-00302: component must be declared). Packages use this to hide helpers and keep the public interface small.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-package-overload',
    4,
    ['Several routines can share a name if their parameters differ.'],
    [
      {
        key: 'number-text',
        code: `CREATE OR REPLACE PACKAGE fmt AS
  FUNCTION show(p_value NUMBER) RETURN VARCHAR2;
  FUNCTION show(p_value VARCHAR2) RETURN VARCHAR2;
END fmt;
/
CREATE OR REPLACE PACKAGE BODY fmt AS
  FUNCTION show(p_value NUMBER) RETURN VARCHAR2 IS
  BEGIN
    RETURN 'number ' || p_value;
  END show;
  FUNCTION show(p_value VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN 'text ' || p_value;
  END show;
END fmt;
/
BEGIN
  DBMS_OUTPUT.PUT_LINE(fmt.show(7));
  DBMS_OUTPUT.PUT_LINE(fmt.show('7'));
END;
/`,
        output: 'number 7\ntext 7',
        why: 'Overloading: Oracle picks the version whose parameter types match the arguments, a number for the first call and text for the second.',
      },
    ],
  ),
  ...plsqlConceptFamily(
    'plsql-package-dependencies',
    5,
    'Callers depend on the specification, not on the body.',
    [
      {
        key: 'body-change',
        question:
          'You fix a bug inside a packaged procedure by changing only the package body. What happens to the procedures in other packages that call it?',
        correct: 'They stay valid: they depend on the specification, which did not change',
        wrong: [
          'They all become invalid and must be recompiled',
          'They keep running the old code until the database restarts',
          'They must be dropped and created again',
        ],
        why: "This is a main reason for packages: changing a body (the implementation) does not invalidate callers, while changing the specification does. Sessions using the package's state may get ORA-04068 once, when the state is discarded.",
      },
    ],
  ),
];
