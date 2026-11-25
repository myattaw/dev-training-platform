import type { QuestionSource } from '@pracstack/content-model';
import { plsqlCodeChoiceFamily, plsqlConceptFamily, plsqlOutputFamily } from './builders';

/** More cursor and exception questions, so every tier has enough new questions. */

export const moreCursorQuestions: readonly QuestionSource[] = [
  ...plsqlConceptFamily(
    'plsql-cursor-for-loop-what',
    1,
    'Count the steps an explicit cursor needs.',
    [
      {
        key: 'automatic',
        question: 'What does a cursor FOR loop do for you?',
        correct: 'It opens the cursor, fetches each row into a record, and closes it at the end',
        wrong: [
          'It fetches all the rows into a collection first',
          'It locks every row it reads',
          'It commits after each row',
        ],
        why: 'A cursor FOR loop replaces OPEN, FETCH, EXIT WHEN %NOTFOUND and CLOSE, and also closes the cursor when an exception leaves the loop.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-cursor-parameter',
    4,
    ['A cursor can take parameters, like a function.'],
    [
      {
        key: 'dept',
        tables: true,
        code: `DECLARE
  CURSOR c_dept(p_dept NUMBER) IS
    SELECT name FROM employees WHERE dept_id = p_dept ORDER BY name;
BEGIN
  FOR r IN c_dept(10) LOOP
    DBMS_OUTPUT.PUT_LINE(r.name);
  END LOOP;
  FOR r IN c_dept(30) LOOP
    DBMS_OUTPUT.PUT_LINE(r.name);
  END LOOP;
END;
/`,
        output: 'Ada\nLinus\nAlan',
        why: 'The same cursor runs with a different parameter each time: department 10 (Ada, Linus), then 30 (Alan).',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-cursor-rowcount',
    4,
    ['`%ROWCOUNT` counts the rows fetched so far.'],
    [
      {
        key: 'all',
        tables: true,
        code: `DECLARE
  CURSOR c IS SELECT name FROM employees;
  v_name employees.name%TYPE;
BEGIN
  OPEN c;
  LOOP
    FETCH c INTO v_name;
    EXIT WHEN c%NOTFOUND;
  END LOOP;
  DBMS_OUTPUT.PUT_LINE(c%ROWCOUNT);
  CLOSE c;
END;
/`,
        output: '4',
        why: '`c%ROWCOUNT` is the number of rows fetched so far: all four employees. The final, empty `FETCH` does not count. Read it before `CLOSE`: afterwards it raises INVALID_CURSOR.',
      },
    ],
  ),
  ...plsqlCodeChoiceFamily('plsql-invalid-cursor', 4, 'What state is the cursor in?', [
    {
      key: 'fetch-after-close',
      tables: true,
      question: 'What happens when this block runs?',
      code: `DECLARE
  CURSOR c IS SELECT name FROM employees;
  v_name employees.name%TYPE;
BEGIN
  OPEN c;
  FETCH c INTO v_name;
  CLOSE c;
  FETCH c INTO v_name;
  DBMS_OUTPUT.PUT_LINE(v_name);
END;
/`,
      fails: 'ORA-01001',
      correct: 'It fails with INVALID_CURSOR (ORA-01001): the cursor is closed',
      wrong: [
        'It prints the second employee',
        'It prints the first employee again',
        'It reopens the cursor automatically',
      ],
      why: 'Fetching from (or closing) a cursor that is not open raises `INVALID_CURSOR`. A cursor FOR loop avoids this whole class of mistakes.',
    },
  ]),
  ...plsqlOutputFamily(
    'plsql-where-current-of',
    5,
    ['`FOR UPDATE` locks the rows; `WHERE CURRENT OF` changes the row just fetched.'],
    [
      {
        key: 'raise-dept',
        tables: true,
        code: `DECLARE
  CURSOR c IS SELECT salary FROM employees WHERE dept_id = 10 FOR UPDATE;
  v_total NUMBER;
BEGIN
  FOR r IN c LOOP
    UPDATE employees SET salary = salary + 1000 WHERE CURRENT OF c;
  END LOOP;
  SELECT SUM(salary) INTO v_total FROM employees WHERE dept_id = 10;
  DBMS_OUTPUT.PUT_LINE(v_total);
END;
/`,
        output: '11000',
        why: 'Each of the two rows in department 10 gets 1000 more: 6000 + 5000 = 11000. `FOR UPDATE` locks them when the cursor opens, so no one changes them in between.',
      },
    ],
  ),
];

export const moreExceptionQuestions: readonly QuestionSource[] = [
  ...plsqlConceptFamily('plsql-exception-section', 1, 'A block has up to three sections.', [
    {
      key: 'where',
      question: 'Where do exception handlers go in a PL/SQL block?',
      correct: 'In the EXCEPTION section, after the statements and before END',
      wrong: [
        'In the DECLARE section',
        'Around each statement, in TRY and CATCH',
        'In a separate block after END',
      ],
      why: 'A block is `DECLARE … BEGIN … EXCEPTION … END;`. When a statement raises an error, control jumps to the `EXCEPTION` section of the current block.',
    },
  ]),
  ...plsqlOutputFamily(
    'plsql-reraise',
    4,
    ['RAISE on its own re-raises the current exception.'],
    [
      {
        key: 'log-and-raise',
        code: `DECLARE
  v NUMBER;
BEGIN
  BEGIN
    v := 1 / 0;
  EXCEPTION
    WHEN ZERO_DIVIDE THEN
      DBMS_OUTPUT.PUT_LINE('logged');
      RAISE;
  END;
EXCEPTION
  WHEN ZERO_DIVIDE THEN
    DBMS_OUTPUT.PUT_LINE('outer');
END;
/`,
        output: 'logged\nouter',
        why: 'The inner handler logs, then `RAISE;` passes the same exception on to the enclosing block. This is the right pattern for "log and fail", unlike swallowing the error.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-sqlcode-no-data',
    4,
    ['Not every error code is negative.'],
    [
      {
        key: 'plus-100',
        tables: true,
        code: `DECLARE
  v_name employees.name%TYPE;
BEGIN
  SELECT name INTO v_name FROM employees WHERE id = 99;
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE(SQLCODE);
END;
/`,
        output: '100',
        why: '`NO_DATA_FOUND` is the one predefined exception with a positive `SQLCODE`: +100 (the ANSI "no data" code), even though its message is ORA-01403.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-declare-exception',
    5,
    ['Where is an error in the DECLARE section handled?'],
    [
      {
        key: 'initializer',
        code: `BEGIN
  DECLARE
    v NUMBER(2) := 100;
  BEGIN
    NULL;
  EXCEPTION
    WHEN VALUE_ERROR THEN
      DBMS_OUTPUT.PUT_LINE('inner');
  END;
EXCEPTION
  WHEN VALUE_ERROR THEN
    DBMS_OUTPUT.PUT_LINE('outer');
END;
/`,
        output: 'outer',
        why: "100 does not fit in `NUMBER(2)`, but the error happens while declaring, before the inner block's `BEGIN`. A block's handlers only cover its executable section, so the enclosing block handles it.",
      },
    ],
  ),
  ...plsqlCodeChoiceFamily('plsql-others-last', 5, 'Where must the catch-all handler be?', [
    {
      key: 'order',
      tables: true,
      question: 'What happens when this block runs?',
      code: `DECLARE
  v_name employees.name%TYPE;
BEGIN
  SELECT name INTO v_name FROM employees WHERE id = 99;
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('something failed');
  WHEN NO_DATA_FOUND THEN
    DBMS_OUTPUT.PUT_LINE('not found');
END;
/`,
      fails: 'ORA-06550',
      correct: 'It does not compile: WHEN OTHERS must be the last handler (PLS-00370)',
      wrong: ['It prints something failed', 'It prints not found', 'It prints both lines'],
      why: '`WHEN OTHERS` catches everything, so Oracle requires it to come last; with it first, the block does not compile.',
    },
  ]),
];
