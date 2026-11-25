import type { QuestionSource } from '@pracstack/content-model';
import {
  plsqlBlankFamily,
  plsqlCodeChoiceFamily,
  plsqlConceptFamily,
  plsqlOutputFamily,
} from './builders';

/** More bulk-processing and trigger questions, so every tier has enough new questions. */

export const moreBulkQuestions: readonly QuestionSource[] = [
  ...plsqlOutputFamily(
    'plsql-collection-count',
    1,
    ['A nested table built from a list has one element per value.'],
    [
      {
        key: 'constructor',
        code: `DECLARE
  TYPE num_list IS TABLE OF NUMBER;
  v num_list := num_list(5, 10, 15);
BEGIN
  DBMS_OUTPUT.PUT_LINE(v.COUNT);
  DBMS_OUTPUT.PUT_LINE(v(2));
END;
/`,
        output: '3\n10',
        why: 'The constructor `num_list(5, 10, 15)` creates three elements, numbered from 1, so element 2 is 10.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-collection-extend',
    2,
    ['A nested table grows with EXTEND before you assign the new element.'],
    [
      {
        key: 'extend',
        code: `DECLARE
  TYPE num_list IS TABLE OF NUMBER;
  v num_list := num_list();
BEGIN
  v.EXTEND;
  v(1) := 7;
  v.EXTEND(2);
  DBMS_OUTPUT.PUT_LINE(v.COUNT || ' ' || v(1));
END;
/`,
        output: '3 7',
        why: '`num_list()` is empty; `EXTEND` adds one (NULL) element and `EXTEND(2)` two more, so there are 3 and the first is 7.',
      },
      {
        key: 'index-by',
        code: `DECLARE
  TYPE salary_map IS TABLE OF NUMBER INDEX BY VARCHAR2(30);
  v salary_map;
BEGIN
  v('Ada') := 5000;
  v('Grace') := 4500;
  DBMS_OUTPUT.PUT_LINE(v.COUNT || ' ' || v('Grace'));
END;
/`,
        output: '2 4500',
        why: 'An associative array (`INDEX BY`) needs no constructor or `EXTEND`: assigning to a new key adds it. Keys can be text, like a dictionary.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-bulk-empty',
    3,
    ['What does BULK COLLECT do when no row matches?'],
    [
      {
        key: 'no-rows',
        tables: true,
        code: `DECLARE
  TYPE name_list IS TABLE OF employees.name%TYPE;
  v_names name_list;
BEGIN
  SELECT name BULK COLLECT INTO v_names FROM employees WHERE dept_id = 99;
  DBMS_OUTPUT.PUT_LINE(v_names.COUNT);
END;
/`,
        output: '0',
        why: 'Unlike a plain `SELECT … INTO`, `BULK COLLECT` never raises `NO_DATA_FOUND`: it returns an empty collection. Check `.COUNT`.',
      },
    ],
  ),
  ...plsqlCodeChoiceFamily(
    'plsql-subscript-beyond',
    4,
    'How many elements does the collection have?',
    [
      {
        key: 'third',
        question: 'What happens when this block runs?',
        code: `DECLARE
  TYPE num_list IS TABLE OF NUMBER;
  v num_list := num_list(1, 2);
BEGIN
  DBMS_OUTPUT.PUT_LINE(v(3));
END;
/`,
        fails: 'ORA-06533',
        correct: 'It fails with SUBSCRIPT_BEYOND_COUNT (ORA-06533)',
        wrong: [
          'It prints an empty line (NULL)',
          'It prints 2',
          'It extends the collection to 3 elements',
        ],
        why: 'A nested table has exactly `.COUNT` elements; reading past them raises `SUBSCRIPT_BEYOND_COUNT`. Loop from 1 to `.COUNT`, or `EXTEND` first.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-bulk-rowcount',
    4,
    ['`SQL%BULK_ROWCOUNT(i)` is the row count of the i-th statement of a FORALL.'],
    [
      {
        key: 'per-dept',
        tables: true,
        code: `DECLARE
  TYPE id_list IS TABLE OF NUMBER;
  v_depts id_list := id_list(10, 20);
BEGIN
  FORALL i IN 1..v_depts.COUNT
    UPDATE employees SET salary = salary + 1 WHERE dept_id = v_depts(i);
  DBMS_OUTPUT.PUT_LINE(SQL%BULK_ROWCOUNT(1) || ' ' || SQL%BULK_ROWCOUNT(2));
END;
/`,
        output: '2 1',
        why: 'The update for department 10 changed 2 rows and the one for department 20 changed 1. `SQL%ROWCOUNT` would give the total, 3.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-save-exceptions',
    5,
    ['With SAVE EXCEPTIONS, FORALL keeps going and reports the failures at the end.'],
    [
      {
        key: 'one-failure',
        tables: true,
        code: `DECLARE
  TYPE id_list IS TABLE OF NUMBER;
  v_ids id_list := id_list(1, 2, 3);
  e_bulk EXCEPTION;
  PRAGMA EXCEPTION_INIT(e_bulk, -24381);
  v_updated NUMBER;
BEGIN
  FORALL i IN 1..v_ids.COUNT SAVE EXCEPTIONS
    UPDATE employees SET salary = salary / (id - 2) WHERE id = v_ids(i);
EXCEPTION
  WHEN e_bulk THEN
    v_updated := SQL%ROWCOUNT;
    DBMS_OUTPUT.PUT_LINE(SQL%BULK_EXCEPTIONS.COUNT || ' failed at index '
                         || SQL%BULK_EXCEPTIONS(1).ERROR_INDEX);
END;
/`,
        output: '1 failed at index 2',
        why: 'Employee 2 divides by zero. With `SAVE EXCEPTIONS` the other updates still run; at the end ORA-24381 is raised and `SQL%BULK_EXCEPTIONS` lists each failure with its index in the collection.',
      },
    ],
  ),
  ...plsqlConceptFamily('plsql-forall-not-loop', 5, 'FORALL is not a loop.', [
    {
      key: 'body',
      question: 'What can the body of a FORALL statement contain?',
      correct: 'Exactly one DML statement (INSERT, UPDATE, DELETE or MERGE)',
      wrong: [
        'Any PL/SQL statements, like a FOR loop',
        'One SELECT … INTO per element',
        'Several DML statements, run in order for each element',
      ],
      why: '`FORALL` sends one DML statement to SQL with a whole collection of bind values. For other logic per element, prepare the collections first, then run `FORALL`.',
    },
  ]),
];

export const moreTriggerQuestions: readonly QuestionSource[] = [
  ...plsqlConceptFamily(
    'plsql-trigger-before-when',
    1,
    'BEFORE runs first, so it can still check or change the data.',
    [
      {
        key: 'before-insert',
        question: 'When does a BEFORE INSERT row trigger run?',
        correct: 'Before each row is inserted, so it can check or change the values',
        wrong: [
          'Before the session connects',
          'After the transaction commits',
          'Only when the insert fails',
        ],
        why: 'BEFORE row triggers are the place to validate or adjust `:NEW` values; AFTER triggers see the final row, for auditing or follow-up work.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-trigger-normalize',
    2,
    ['A BEFORE trigger can change :NEW.'],
    [
      {
        key: 'upper',
        tables: true,
        code: `CREATE OR REPLACE TRIGGER employees_name_upper
BEFORE INSERT ON employees
FOR EACH ROW
BEGIN
  :NEW.name := UPPER(:NEW.name);
END;
/
DECLARE
  v_name employees.name%TYPE;
BEGIN
  INSERT INTO employees VALUES (5, 'barbara', 20, 4200);
  SELECT name INTO v_name FROM employees WHERE id = 5;
  DBMS_OUTPUT.PUT_LINE(v_name);
END;
/`,
        output: 'BARBARA',
        why: 'The trigger changes `:NEW.name` before the row is written, so the stored name is in capitals.',
      },
    ],
  ),
  ...plsqlBlankFamily(
    'plsql-trigger-timing',
    2,
    'Only one timing lets the trigger change the row.',
    [
      {
        key: 'before',
        tables: true,
        prompt: 'Complete the trigger so it can change the name being inserted.',
        template: `CREATE OR REPLACE TRIGGER employees_initcap
{{blank:timing}} INSERT ON employees
FOR EACH ROW
BEGIN
  :NEW.name := INITCAP(:NEW.name);
END;
/`,
        blanks: { timing: ['BEFORE'] },
        why: 'Only a BEFORE row trigger can assign to `:NEW`; in an AFTER trigger the row is already written (ORA-04084).',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-trigger-default',
    3,
    ['NOT NULL is checked after BEFORE row triggers have run.'],
    [
      {
        key: 'salary',
        tables: true,
        code: `CREATE OR REPLACE TRIGGER default_salary
BEFORE INSERT ON employees
FOR EACH ROW
BEGIN
  IF :NEW.salary IS NULL THEN
    :NEW.salary := 3000;
  END IF;
END;
/
DECLARE
  v_salary employees.salary%TYPE;
BEGIN
  INSERT INTO employees (id, name, dept_id) VALUES (5, 'Barbara', 20);
  SELECT salary INTO v_salary FROM employees WHERE id = 5;
  DBMS_OUTPUT.PUT_LINE(v_salary);
END;
/`,
        output: '3000',
        why: 'The insert gives no salary, but the BEFORE trigger fills one in before the NOT NULL constraint is checked, so the row is stored with 3000.',
      },
      {
        key: 'predicates',
        tables: true,
        code: `CREATE TABLE audit_log (message VARCHAR2(100));

CREATE OR REPLACE TRIGGER employees_changes
AFTER INSERT OR UPDATE ON employees
FOR EACH ROW
BEGIN
  IF INSERTING THEN
    INSERT INTO audit_log VALUES ('insert ' || :NEW.name);
  ELSIF UPDATING THEN
    INSERT INTO audit_log VALUES ('update ' || :NEW.name);
  END IF;
END;
/
DECLARE
  v_message audit_log.message%TYPE;
BEGIN
  UPDATE employees SET salary = salary + 1 WHERE id = 3;
  SELECT message INTO v_message FROM audit_log;
  DBMS_OUTPUT.PUT_LINE(v_message);
END;
/`,
        output: 'update Grace',
        why: 'One trigger can handle several events; `INSERTING`, `UPDATING` and `DELETING` tell which one fired it.',
      },
    ],
  ),
  ...plsqlCodeChoiceFamily(
    'plsql-mutating-table',
    4,
    'The trigger reads the table that the UPDATE is in the middle of changing.',
    [
      {
        key: 'avg',
        tables: true,
        question: 'The trigger compiles. What happens when the UPDATE runs?',
        code: `CREATE OR REPLACE TRIGGER check_average
AFTER UPDATE OF salary ON employees
FOR EACH ROW
DECLARE
  v_avg NUMBER;
BEGIN
  SELECT AVG(salary) INTO v_avg FROM employees;
END;
/
BEGIN
  UPDATE employees SET salary = salary + 100 WHERE dept_id = 10;
END;
/`,
        fails: 'ORA-04091',
        correct:
          'It fails with ORA-04091: employees is mutating, so the row trigger cannot read it',
        wrong: [
          'It works, reading the average before the update',
          'It works, reading the average after the update',
          'The trigger is skipped for this update',
        ],
        why: 'A row-level trigger may not query the table its statement is changing. Use a statement-level AFTER trigger or a compound trigger for checks across rows.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-trigger-when',
    4,
    ['A WHEN clause decides per row whether the trigger body runs.'],
    [
      {
        key: 'high-earners',
        tables: true,
        code: `CREATE TABLE audit_log (message VARCHAR2(100));

CREATE OR REPLACE TRIGGER audit_high_salaries
AFTER UPDATE OF salary ON employees
FOR EACH ROW
WHEN (NEW.salary > 4500)
BEGIN
  INSERT INTO audit_log VALUES (:NEW.name);
END;
/
DECLARE
  v_count NUMBER;
BEGIN
  UPDATE employees SET salary = salary + 0;
  SELECT COUNT(*) INTO v_count FROM audit_log;
  DBMS_OUTPUT.PUT_LINE(v_count);
END;
/`,
        output: '1',
        why: 'All four rows are updated, but only Ada (5000) passes `WHEN (NEW.salary > 4500)`; Grace has exactly 4500. In the `WHEN` clause, NEW is written without the colon.',
      },
    ],
  ),
  ...plsqlCodeChoiceFamily(
    'plsql-statement-trigger-new',
    5,
    'Which trigger level has a "current row"?',
    [
      {
        key: 'no-row',
        tables: true,
        question: 'What happens when this trigger is created?',
        code: `CREATE OR REPLACE TRIGGER log_salary
AFTER UPDATE OF salary ON employees
BEGIN
  DBMS_OUTPUT.PUT_LINE(:NEW.salary);
END;
/`,
        fails: 'compile',
        correct:
          'It is created with compilation errors: a statement-level trigger has no :NEW row (PLS-00049, bad bind variable)',
        wrong: [
          'It prints the new salary of every updated row',
          'It prints the last updated salary once',
          'It prints NULL once per UPDATE',
        ],
        why: 'Without `FOR EACH ROW` the trigger runs once per statement and has no current row, so `:NEW.salary` is an unknown bind variable. The trigger is stored but invalid, and UPDATEs on the table then fail until it is fixed: add `FOR EACH ROW`.',
      },
    ],
  ),
];
