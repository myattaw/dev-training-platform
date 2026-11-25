import type { QuestionSource } from '@pracstack/content-model';
import { plsqlBlankFamily, plsqlConceptFamily, plsqlOutputFamily } from './builders';

// ---------------------------------------------------------------- Bulk processing

export const bulkQuestions: readonly QuestionSource[] = [
  ...plsqlConceptFamily(
    'plsql-bulk-why',
    1,
    'Count the trips between the PL/SQL engine and the SQL engine.',
    [
      {
        key: 'context-switch',
        question: 'Why use BULK COLLECT and FORALL instead of row-by-row loops?',
        correct:
          'They move many rows between PL/SQL and SQL in one step, instead of one switch per row',
        wrong: [
          'They let PL/SQL skip the table locks',
          'They are the only way to read more than one row',
          'They make the statements run in parallel on several servers',
        ],
        why: 'Every SQL statement run from PL/SQL is a context switch between the two engines. `BULK COLLECT` fetches a whole batch into a collection, and `FORALL` sends a batch of DML at once, which is much faster for large row counts.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-bulk-collect',
    2,
    ['BULK COLLECT fills a collection with all the rows at once.'],
    [
      {
        key: 'names',
        tables: true,
        code: `DECLARE
  TYPE name_list IS TABLE OF employees.name%TYPE;
  v_names name_list;
BEGIN
  SELECT name BULK COLLECT INTO v_names FROM employees ORDER BY id;
  DBMS_OUTPUT.PUT_LINE(v_names.COUNT || ' ' || v_names(1));
END;
/`,
        output: '4 Ada',
        why: 'All four names are fetched into the nested table in one step. `.COUNT` is the number of elements, and elements are numbered from 1.',
      },
    ],
  ),
  ...plsqlBlankFamily(
    'plsql-bulk-collect-blank',
    3,
    'Two words turn SELECT … INTO into a multi-row fetch.',
    [
      {
        key: 'salaries',
        tables: true,
        prompt: 'Complete the query so it fetches every salary into the collection.',
        template: `DECLARE
  TYPE salary_list IS TABLE OF employees.salary%TYPE;
  v_salaries salary_list;
BEGIN
  SELECT salary {{blank:bulk}} INTO v_salaries FROM employees;
  DBMS_OUTPUT.PUT_LINE(v_salaries.COUNT);
END;
/`,
        blanks: { bulk: ['BULK COLLECT'] },
        why: '`SELECT … BULK COLLECT INTO collection` fetches all rows. Without it, `SELECT … INTO` expects exactly one row.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-forall',
    3,
    ['FORALL sends one DML statement for a whole collection of values.'],
    [
      {
        key: 'raise',
        tables: true,
        code: `DECLARE
  TYPE id_list IS TABLE OF NUMBER;
  v_ids id_list := id_list(1, 3);
BEGIN
  FORALL i IN 1..v_ids.COUNT
    UPDATE employees SET salary = salary + 100 WHERE id = v_ids(i);
  DBMS_OUTPUT.PUT_LINE(SQL%ROWCOUNT);
END;
/`,
        output: '2',
        why: '`FORALL` runs the `UPDATE` for each element in one round trip, and `SQL%ROWCOUNT` is the total over all of them: one row for id 1 and one for id 3.',
      },
    ],
  ),
  ...plsqlBlankFamily(
    'plsql-bulk-limit',
    4,
    'Fetch in batches so a huge table does not fill memory.',
    [
      {
        key: 'batch',
        tables: true,
        prompt: 'Complete the fetch so it reads at most 100 rows at a time.',
        template: `DECLARE
  CURSOR c IS SELECT name FROM employees;
  TYPE name_list IS TABLE OF employees.name%TYPE;
  v_names name_list;
BEGIN
  OPEN c;
  LOOP
    FETCH c BULK COLLECT INTO v_names {{blank:limit}} 100;
    EXIT WHEN v_names.COUNT = 0;
    DBMS_OUTPUT.PUT_LINE(v_names.COUNT || ' fetched');
  END LOOP;
  CLOSE c;
END;
/`,
        blanks: { limit: ['LIMIT'] },
        why: '`FETCH … BULK COLLECT INTO … LIMIT n` reads at most n rows per fetch, keeping memory bounded. Exit on `.COUNT = 0` (not `%NOTFOUND`, which is already TRUE after a last, partial batch).',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-collection-methods',
    4,
    ['DELETE(n) removes one element; COUNT counts what is left.'],
    [
      {
        key: 'delete',
        code: `DECLARE
  TYPE num_list IS TABLE OF NUMBER;
  v num_list := num_list(10, 20, 30, 40);
BEGIN
  v.DELETE(2);
  DBMS_OUTPUT.PUT_LINE(v.COUNT || ' ' || v.FIRST || ' ' || v.NEXT(1));
END;
/`,
        output: '3 1 3',
        why: 'Deleting element 2 leaves a gap: 3 elements remain, the first index is 1, and the index after 1 is now 3. Loop with `FIRST`/`NEXT` (not `1..COUNT`) over a collection that may have gaps.',
      },
    ],
  ),
  ...plsqlConceptFamily('plsql-bulk-limit-why', 5, 'Think about a table with 50 million rows.', [
    {
      key: 'memory',
      question:
        'What is the risk of `SELECT … BULK COLLECT INTO` without LIMIT on a very large table?',
      correct: 'Every row is loaded into session memory at once, which can exhaust the PGA',
      wrong: [
        'It silently stops after 10,000 rows',
        'It locks the table until the collection is freed',
        'It raises TOO_MANY_ROWS',
      ],
      why: 'Collections live in session (PGA) memory. Fetch in batches with an explicit cursor and `LIMIT` (often 100 to 1,000 rows), process each batch, and repeat.',
    },
  ]),
];

// ---------------------------------------------------------------- Triggers

export const triggerQuestions: readonly QuestionSource[] = [
  ...plsqlConceptFamily(
    'plsql-trigger-new-old',
    1,
    'One holds the row before the change, the other after it.',
    [
      {
        key: 'new',
        question: 'In a row-level UPDATE trigger, what does `:NEW.salary` hold?',
        correct: 'The salary the row will have after the update',
        wrong: [
          'The salary before the update',
          'The salary of the most recently inserted row',
          'The difference between the new and the old salary',
        ],
        why: '`:OLD` is the row before the change and `:NEW` the row after it. In an `INSERT` trigger `:OLD` values are NULL; in a `DELETE` trigger `:NEW` values are.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-trigger-insert',
    2,
    ['A row trigger runs for every row the statement touches.'],
    [
      {
        key: 'audit',
        tables: true,
        code: `CREATE TABLE audit_log (message VARCHAR2(100));

CREATE OR REPLACE TRIGGER employees_audit
AFTER INSERT ON employees
FOR EACH ROW
BEGIN
  INSERT INTO audit_log VALUES ('Hired ' || :NEW.name);
END;
/
DECLARE
  v_message audit_log.message%TYPE;
BEGIN
  INSERT INTO employees VALUES (5, 'Barbara', 20, 4200);
  SELECT message INTO v_message FROM audit_log;
  DBMS_OUTPUT.PUT_LINE(v_message);
END;
/`,
        output: 'Hired Barbara',
        why: 'The trigger fires after each inserted row, and `:NEW.name` is the name being inserted, so the audit table gets one message.',
      },
    ],
  ),
  ...plsqlBlankFamily(
    'plsql-trigger-each-row',
    3,
    'Without this clause a trigger fires once per statement.',
    [
      {
        key: 'row-level',
        tables: true,
        prompt: 'Make the trigger fire once for every updated row, so it can use `:NEW`.',
        template: `CREATE OR REPLACE TRIGGER salary_floor
BEFORE UPDATE OF salary ON employees
{{blank:each}}
BEGIN
  IF :NEW.salary < 1000 THEN
    :NEW.salary := 1000;
  END IF;
END;
/`,
        blanks: { each: ['FOR EACH ROW'] },
        why: '`FOR EACH ROW` makes it a row-level trigger: it runs per row and can read and (in a BEFORE trigger) change `:NEW`. A statement-level trigger cannot use `:NEW` or `:OLD`.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-trigger-before',
    4,
    ['A BEFORE row trigger can change :NEW before the row is written.'],
    [
      {
        key: 'no-pay-cut',
        tables: true,
        code: `CREATE OR REPLACE TRIGGER no_pay_cut
BEFORE UPDATE OF salary ON employees
FOR EACH ROW
BEGIN
  IF :NEW.salary < :OLD.salary THEN
    :NEW.salary := :OLD.salary;
  END IF;
END;
/
DECLARE
  v_salary employees.salary%TYPE;
BEGIN
  UPDATE employees SET salary = 100 WHERE id = 1;
  SELECT salary INTO v_salary FROM employees WHERE id = 1;
  DBMS_OUTPUT.PUT_LINE(v_salary);
END;
/`,
        output: '5000',
        why: "The update tries to lower Ada's salary to 100; the trigger sets `:NEW.salary` back to the old 5000 before the row is written. (Only BEFORE row triggers can change `:NEW`.)",
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-trigger-level',
    5,
    ['Count how often each kind of trigger fires for one UPDATE.'],
    [
      {
        key: 'row',
        tables: true,
        code: `CREATE TABLE audit_log (message VARCHAR2(100));

CREATE OR REPLACE TRIGGER salary_audit
AFTER UPDATE OF salary ON employees
FOR EACH ROW
BEGIN
  INSERT INTO audit_log VALUES (:OLD.name);
END;
/
DECLARE
  v_count NUMBER;
BEGIN
  UPDATE employees SET salary = salary + 1 WHERE dept_id = 10;
  SELECT COUNT(*) INTO v_count FROM audit_log;
  DBMS_OUTPUT.PUT_LINE(v_count);
END;
/`,
        output: '2',
        why: 'A row-level trigger (`FOR EACH ROW`) fires once per updated row: two employees are in department 10.',
      },
      {
        key: 'statement',
        tables: true,
        code: `CREATE TABLE audit_log (message VARCHAR2(100));

CREATE OR REPLACE TRIGGER salary_audit
AFTER UPDATE OF salary ON employees
BEGIN
  INSERT INTO audit_log VALUES ('salaries changed');
END;
/
DECLARE
  v_count NUMBER;
BEGIN
  UPDATE employees SET salary = salary + 1 WHERE dept_id = 10;
  SELECT COUNT(*) INTO v_count FROM audit_log;
  DBMS_OUTPUT.PUT_LINE(v_count);
END;
/`,
        output: '1',
        why: 'Without `FOR EACH ROW` the trigger is statement-level: it fires once for the `UPDATE`, however many rows it changes (even none).',
      },
    ],
  ),
  ...plsqlConceptFamily(
    'plsql-trigger-mutating',
    5,
    'A row trigger looks at the table while the statement is still changing it.',
    [
      {
        key: 'ora-04091',
        question:
          'A row-level trigger on `employees` runs `SELECT AVG(salary) FROM employees` during an UPDATE of several rows. What happens?',
        correct: 'ORA-04091: the table is mutating, so the trigger cannot read it',
        wrong: [
          'It reads the average before the UPDATE started',
          'It reads the average after the UPDATE finished',
          'It works, but only in BEFORE triggers',
        ],
        why: 'While a statement is changing a table, its row-level triggers may not query that table, because its contents are half-changed. Use a compound trigger, or move the logic out of the trigger.',
      },
    ],
  ),
];
