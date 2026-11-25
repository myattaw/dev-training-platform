import type { QuestionSource } from '@pracstack/content-model';
import {
  plsqlBlankFamily,
  plsqlCodeChoiceFamily,
  plsqlConceptFamily,
  plsqlOutputFamily,
} from './builders';

// ---------------------------------------------------------------- Cursors

export const cursorQuestions: readonly QuestionSource[] = [
  ...plsqlOutputFamily(
    'plsql-cursor-for-loop',
    1,
    ['A cursor FOR loop opens, fetches and closes for you.'],
    [
      {
        key: 'dept-10',
        tables: true,
        code: `BEGIN
  FOR r IN (SELECT name FROM employees WHERE dept_id = 10 ORDER BY name) LOOP
    DBMS_OUTPUT.PUT_LINE(r.name);
  END LOOP;
END;
/`,
        output: 'Ada\nLinus',
        why: 'The loop runs once per row of the query, in its `ORDER BY` order, with `r` holding the current row. Opening, fetching and closing the cursor happen automatically.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-sql-rowcount',
    2,
    ['`SQL%ROWCOUNT` is the number of rows the last SQL statement affected.'],
    [
      {
        key: 'update',
        tables: true,
        code: `BEGIN
  UPDATE employees SET salary = salary + 100 WHERE dept_id = 10;
  DBMS_OUTPUT.PUT_LINE(SQL%ROWCOUNT || ' rows updated');
END;
/`,
        output: '2 rows updated',
        why: 'Ada and Linus are in department 10, so the update changes 2 rows. `SQL%ROWCOUNT` reads the implicit cursor of the most recent SQL statement.',
      },
      {
        key: 'delete',
        tables: true,
        code: `BEGIN
  DELETE FROM employees WHERE salary < 4500;
  DBMS_OUTPUT.PUT_LINE(SQL%ROWCOUNT || ' rows deleted');
END;
/`,
        output: '2 rows deleted',
        why: 'Linus (4000) and Alan (3000) earn less than 4500, so 2 rows are deleted.',
      },
    ],
  ),
  ...plsqlBlankFamily('plsql-rowtype', 2, 'Anchor the record to the whole row of the table.', [
    {
      key: 'employee',
      tables: true,
      prompt: 'Declare `v_emp` as a record with all the columns of `employees`.',
      template: `DECLARE
  v_emp employees{{blank:row}};
BEGIN
  SELECT * INTO v_emp FROM employees WHERE id = 2;
  DBMS_OUTPUT.PUT_LINE(v_emp.name || ' earns ' || v_emp.salary);
END;
/`,
      blanks: { row: ['%ROWTYPE'] },
      why: '`%ROWTYPE` declares a record with one field per column, named like the columns, so `SELECT *` fits it and stays correct when columns are added.',
    },
  ]),
  ...plsqlOutputFamily(
    'plsql-explicit-cursor',
    3,
    ['OPEN, FETCH in a loop until %NOTFOUND, then CLOSE.'],
    [
      {
        key: 'total',
        tables: true,
        code: `DECLARE
  CURSOR c_dept IS SELECT salary FROM employees WHERE dept_id = 10;
  v_salary employees.salary%TYPE;
  v_total  NUMBER := 0;
BEGIN
  OPEN c_dept;
  LOOP
    FETCH c_dept INTO v_salary;
    EXIT WHEN c_dept%NOTFOUND;
    v_total := v_total + v_salary;
  END LOOP;
  CLOSE c_dept;
  DBMS_OUTPUT.PUT_LINE(v_total);
END;
/`,
        output: '9000',
        why: 'The cursor returns Ada (5000) and Linus (4000). The loop stops when a `FETCH` finds no more rows, so the total is 9000.',
      },
    ],
  ),
  ...plsqlBlankFamily(
    'plsql-cursor-notfound',
    3,
    'Which cursor attribute is TRUE when the last FETCH returned no row?',
    [
      {
        key: 'exit',
        tables: true,
        prompt: 'Complete the loop so it stops when there are no more rows.',
        template: `DECLARE
  CURSOR c IS SELECT name FROM employees ORDER BY id;
  v_name employees.name%TYPE;
BEGIN
  OPEN c;
  LOOP
    FETCH c INTO v_name;
    EXIT WHEN c{{blank:attr}};
    DBMS_OUTPUT.PUT_LINE(v_name);
  END LOOP;
  CLOSE c;
END;
/`,
        blanks: { attr: ['%NOTFOUND'] },
        why: '`%NOTFOUND` is TRUE once a `FETCH` returns no row. (`%FOUND` is its opposite, `%ROWCOUNT` counts the rows fetched so far, and `%ISOPEN` tells whether the cursor is open.)',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-sql-notfound',
    3,
    ['An UPDATE that matches nothing is not an error.'],
    [
      {
        key: 'no-employee',
        tables: true,
        code: `BEGIN
  UPDATE employees SET salary = salary * 2 WHERE id = 99;
  IF SQL%NOTFOUND THEN
    DBMS_OUTPUT.PUT_LINE('No employee 99');
  END IF;
END;
/`,
        output: 'No employee 99',
        why: 'Unlike `SELECT … INTO`, an `UPDATE` or `DELETE` that matches no row raises nothing; check `SQL%NOTFOUND` (or `SQL%ROWCOUNT = 0`) yourself.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-exit-placement',
    4,
    ['After a failed FETCH the variable still holds the previous row.'],
    [
      {
        key: 'exit-last',
        tables: true,
        code: `DECLARE
  CURSOR c IS SELECT name FROM employees WHERE dept_id = 10 ORDER BY name;
  v_name employees.name%TYPE;
BEGIN
  OPEN c;
  LOOP
    FETCH c INTO v_name;
    DBMS_OUTPUT.PUT_LINE(v_name);
    EXIT WHEN c%NOTFOUND;
  END LOOP;
  CLOSE c;
END;
/`,
        output: 'Ada\nLinus\nLinus',
        why: 'The third `FETCH` finds no row and leaves `v_name` unchanged, so Linus is printed again before the `EXIT` check. Put `EXIT WHEN c%NOTFOUND` right after the `FETCH`.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-rowcount-latest',
    5,
    ['`SQL%` always describes the most recent SQL statement.'],
    [
      {
        key: 'after-select',
        tables: true,
        code: `DECLARE
  v_count NUMBER;
BEGIN
  UPDATE employees SET salary = salary + 1 WHERE dept_id = 10;
  SELECT COUNT(*) INTO v_count FROM employees;
  DBMS_OUTPUT.PUT_LINE(SQL%ROWCOUNT);
END;
/`,
        output: '1',
        why: 'The `SELECT … INTO` ran after the `UPDATE`, so `SQL%ROWCOUNT` now describes it: one row fetched. Save `SQL%ROWCOUNT` into a variable right after the statement you care about.',
      },
    ],
  ),
  ...plsqlConceptFamily('plsql-cursor-choice', 5, 'Compare row-by-row work with set-based SQL.', [
    {
      key: 'set-based',
      question:
        'A procedure gives every Sales employee a 5% raise by looping over a cursor and updating one row at a time. What is the better approach?',
      correct: 'A single `UPDATE … WHERE dept_id = 20` statement: one set-based SQL statement',
      wrong: [
        'An explicit cursor instead of a cursor FOR loop',
        'A COMMIT after every row so locks are released sooner',
        'A WHILE loop instead of a FOR loop',
      ],
      why: 'Row-by-row processing ("slow by slow") switches between PL/SQL and SQL for every row. When plain SQL can do the job, one statement is simpler and much faster; committing per row also breaks the all-or-nothing behavior of the change.',
    },
  ]),
];

// ---------------------------------------------------------------- Exceptions

export const exceptionQuestions: readonly QuestionSource[] = [
  ...plsqlOutputFamily(
    'plsql-no-data-found',
    1,
    ['A handler in the EXCEPTION section catches the named error.'],
    [
      {
        key: 'handled',
        tables: true,
        code: `DECLARE
  v_name employees.name%TYPE;
BEGIN
  SELECT name INTO v_name FROM employees WHERE id = 99;
  DBMS_OUTPUT.PUT_LINE(v_name);
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    DBMS_OUTPUT.PUT_LINE('Not found');
END;
/`,
        output: 'Not found',
        why: 'No employee has id 99, so `SELECT … INTO` raises `NO_DATA_FOUND`. Control jumps to the matching handler; the `PUT_LINE` after the `SELECT` never runs.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-zero-divide',
    2,
    ['Dividing by zero raises a predefined exception.'],
    [
      {
        key: 'handled',
        code: `DECLARE
  v NUMBER;
BEGIN
  v := 10 / 0;
  DBMS_OUTPUT.PUT_LINE(v);
EXCEPTION
  WHEN ZERO_DIVIDE THEN
    DBMS_OUTPUT.PUT_LINE('Cannot divide by zero');
END;
/`,
        output: 'Cannot divide by zero',
        why: '`10 / 0` raises the predefined `ZERO_DIVIDE` (ORA-01476), which the handler catches.',
      },
    ],
  ),
  ...plsqlBlankFamily(
    'plsql-too-many-rows',
    2,
    'Each common error has a predefined exception name.',
    [
      {
        key: 'handler',
        tables: true,
        prompt:
          'Name the exception this handler must catch when the query returns more than one row.',
        template: `DECLARE
  v_name employees.name%TYPE;
BEGIN
  SELECT name INTO v_name FROM employees WHERE dept_id = 10;
EXCEPTION
  WHEN {{blank:exc}} THEN
    DBMS_OUTPUT.PUT_LINE('More than one employee');
END;
/`,
        blanks: { exc: ['TOO_MANY_ROWS'] },
        why: '`SELECT … INTO` raises `TOO_MANY_ROWS` (ORA-01422) when more than one row matches; department 10 has two employees.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-user-exception',
    3,
    ['Declare an exception, RAISE it, and handle it by name.'],
    [
      {
        key: 'low-salary',
        tables: true,
        code: `DECLARE
  e_low_salary EXCEPTION;
  v_salary employees.salary%TYPE;
BEGIN
  SELECT salary INTO v_salary FROM employees WHERE id = 4;
  IF v_salary < 3500 THEN
    RAISE e_low_salary;
  END IF;
  DBMS_OUTPUT.PUT_LINE('OK');
EXCEPTION
  WHEN e_low_salary THEN
    DBMS_OUTPUT.PUT_LINE('Salary too low');
END;
/`,
        output: 'Salary too low',
        why: "Alan's salary is 3000, so the block raises its own exception and the handler for it runs.",
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-raise-application-error',
    3,
    ['`RAISE_APPLICATION_ERROR` raises an error with your own number (-20000 to -20999).'],
    [
      {
        key: 'sqlcode',
        code: `BEGIN
  RAISE_APPLICATION_ERROR(-20001, 'Salary too high');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE(SQLCODE);
END;
/`,
        output: '-20001',
        why: '`RAISE_APPLICATION_ERROR` raises a real error with your number and message, which a caller (or a client program) sees as ORA-20001. `SQLCODE` returns the number of the current error.',
      },
      {
        key: 'sqlerrm',
        code: `BEGIN
  RAISE_APPLICATION_ERROR(-20002, 'Department is closed');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE(SQLERRM);
END;
/`,
        output: 'ORA-20002: Department is closed',
        why: '`SQLERRM` returns the message of the current error, prefixed with its code. Application errors use -20000 to -20999.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-exception-propagation',
    4,
    ['An unhandled exception leaves the block and looks for a handler in the enclosing one.'],
    [
      {
        key: 'outer',
        tables: true,
        code: `DECLARE
  v_name employees.name%TYPE;
BEGIN
  BEGIN
    SELECT name INTO v_name FROM employees WHERE id = 99;
    DBMS_OUTPUT.PUT_LINE('inner done');
  END;
  DBMS_OUTPUT.PUT_LINE('after inner block');
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    DBMS_OUTPUT.PUT_LINE('outer handler');
END;
/`,
        output: 'outer handler',
        why: 'The inner block has no handler, so `NO_DATA_FOUND` propagates to the outer block, skipping everything in between, including the line after the inner block.',
      },
      {
        key: 'inner',
        tables: true,
        code: `DECLARE
  v_name employees.name%TYPE;
BEGIN
  BEGIN
    SELECT name INTO v_name FROM employees WHERE id = 99;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      DBMS_OUTPUT.PUT_LINE('handled inside');
  END;
  DBMS_OUTPUT.PUT_LINE('continues');
END;
/`,
        output: 'handled inside\ncontinues',
        why: 'The inner block handles its own error, so it ends normally and the outer block carries on with the next statement.',
      },
    ],
  ),
  ...plsqlCodeChoiceFamily(
    'plsql-when-others-null',
    5,
    'Think about who finds out that something went wrong.',
    [
      {
        key: 'swallow',
        tables: true,
        question: 'What is the problem with this block?',
        code: `BEGIN
  UPDATE employees SET salary = salary / 0 WHERE id = 1;
  DBMS_OUTPUT.PUT_LINE('Salary updated');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
/`,
        correct: 'WHEN OTHERS THEN NULL hides every error: the caller thinks the update worked',
        wrong: [
          'It does not compile: a handler cannot be NULL',
          'It prints Salary updated even though nothing changed',
          'WHEN OTHERS must come before the other handlers',
        ],
        why: 'The division fails, the handler does nothing, and the block ends successfully: no message, no error, no data changed. Handle the errors you expect by name, and in `WHEN OTHERS` log and re-`RAISE`.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-exception-init',
    5,
    ['`PRAGMA EXCEPTION_INIT` gives an Oracle error number a name you can handle.'],
    [
      {
        key: 'divide',
        code: `DECLARE
  e_division EXCEPTION;
  PRAGMA EXCEPTION_INIT(e_division, -1476);
  v NUMBER;
BEGIN
  v := 1 / 0;
EXCEPTION
  WHEN e_division THEN
    DBMS_OUTPUT.PUT_LINE('caught e_division');
END;
/`,
        output: 'caught e_division',
        why: 'ORA-01476 is the error for dividing by zero. `EXCEPTION_INIT` binds it to `e_division`, so that handler catches it. This is how you name errors that have no predefined exception, such as ORA-02292 (child record found).',
      },
    ],
  ),
];
