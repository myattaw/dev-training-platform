import type { QuestionSource } from '@pracstack/content-model';
import { plsqlCodeChoiceFamily, plsqlOutputFamily } from './builders';

/** More block and control questions, so every tier has enough new questions. */

export const moreBlockQuestions: readonly QuestionSource[] = [
  ...plsqlOutputFamily(
    'plsql-number-precision',
    4,
    ['`NUMBER(p, s)` keeps s digits after the decimal point.'],
    [
      {
        key: 'round',
        code: `DECLARE
  v_amount NUMBER(5, 2) := 123.456;
BEGIN
  DBMS_OUTPUT.PUT_LINE(v_amount);
END;
/`,
        output: '123.46',
        why: '`NUMBER(5, 2)` has 2 digits after the point, so 123.456 is rounded (not truncated) to 123.46 on assignment. A value needing more than 3 digits before the point would raise ORA-06502 instead.',
      },
    ],
  ),
  ...plsqlCodeChoiceFamily('plsql-value-error', 5, 'How long can the value of a VARCHAR2(3) be?', [
    {
      key: 'too-long',
      question: 'What happens when this block runs?',
      code: `DECLARE
  v_code VARCHAR2(3);
BEGIN
  v_code := 'Oracle';
  DBMS_OUTPUT.PUT_LINE(v_code);
END;
/`,
      fails: 'ORA-06502',
      correct: 'It fails with VALUE_ERROR (ORA-06502): the text does not fit in 3 characters',
      wrong: ['It prints Ora', 'It prints Oracle', 'It does not compile'],
      why: 'PL/SQL never truncates silently: assigning a value longer than the variable raises `VALUE_ERROR` (ORA-06502, character string buffer too small) at run time. Size variables with `%TYPE` to avoid it.',
    },
  ]),
  ...plsqlOutputFamily(
    'plsql-empty-string',
    5,
    ["Oracle's rule for zero-length strings."],
    [
      {
        key: 'is-null',
        code: `DECLARE
  v_text VARCHAR2(10) := '';
BEGIN
  IF v_text IS NULL THEN
    DBMS_OUTPUT.PUT_LINE('empty string is NULL');
  ELSE
    DBMS_OUTPUT.PUT_LINE('empty string is not NULL');
  END IF;
END;
/`,
        output: 'empty string is NULL',
        why: "In Oracle a zero-length string is NULL, in SQL and PL/SQL alike, so `v_text = ''` would never be true; test with `IS NULL`. (PostgreSQL and SQL Server treat '' and NULL differently.)",
      },
    ],
  ),
];

export const moreControlQuestions: readonly QuestionSource[] = [
  ...plsqlOutputFamily(
    'plsql-if-basic',
    1,
    ['IF runs its statements only when the condition is true.'],
    [
      {
        key: 'big',
        code: `DECLARE
  v NUMBER := 7;
BEGIN
  IF v > 5 THEN
    DBMS_OUTPUT.PUT_LINE('big');
  END IF;
  DBMS_OUTPUT.PUT_LINE('done');
END;
/`,
        output: 'big\ndone',
        why: '7 > 5 is true, so the `IF` body runs; the statement after `END IF;` runs either way.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-nested-loops',
    3,
    ['The inner loop runs completely for every turn of the outer loop.'],
    [
      {
        key: 'count',
        code: `DECLARE
  v_count NUMBER := 0;
BEGIN
  FOR i IN 1..3 LOOP
    FOR j IN 1..2 LOOP
      v_count := v_count + 1;
    END LOOP;
  END LOOP;
  DBMS_OUTPUT.PUT_LINE(v_count);
END;
/`,
        output: '6',
        why: 'The inner loop runs 2 times for each of the 3 outer iterations: 3 × 2 = 6.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-for-bounds',
    4,
    ['When are the bounds of a FOR loop evaluated?'],
    [
      {
        key: 'evaluated-once',
        code: `DECLARE
  n NUMBER := 3;
BEGIN
  FOR i IN 1..n LOOP
    n := n + 1;
  END LOOP;
  DBMS_OUTPUT.PUT_LINE(n);
END;
/`,
        output: '6',
        why: 'The bounds are evaluated once, when the loop starts: it runs 3 times even though `n` grows, so `n` ends at 6.',
      },
      {
        key: 'empty-range',
        code: `BEGIN
  FOR i IN 3..1 LOOP
    DBMS_OUTPUT.PUT_LINE(i);
  END LOOP;
  DBMS_OUTPUT.PUT_LINE('done');
END;
/`,
        output: 'done',
        why: 'When the lower bound is greater than the upper bound the loop does not run at all. To count down, write `REVERSE 1..3`.',
      },
    ],
  ),
  ...plsqlOutputFamily(
    'plsql-loop-label',
    5,
    ['`EXIT label` leaves the labeled loop, not just the innermost one.'],
    [
      {
        key: 'exit-outer',
        code: `DECLARE
  v_count NUMBER := 0;
BEGIN
  <<outer>>
  FOR i IN 1..3 LOOP
    FOR j IN 1..3 LOOP
      EXIT outer WHEN i * j = 4;
      v_count := v_count + 1;
    END LOOP;
  END LOOP;
  DBMS_OUTPUT.PUT_LINE(v_count);
END;
/`,
        output: '4',
        why: 'i = 1 runs j = 1, 2, 3 (3 additions); i = 2 adds once for j = 1, then at j = 2 the product is 4 and `EXIT outer` leaves both loops: 4 in total.',
      },
    ],
  ),
  ...plsqlCodeChoiceFamily(
    'plsql-case-not-found',
    5,
    'What does a CASE statement do when no WHEN matches and there is no ELSE?',
    [
      {
        key: 'no-else',
        question: 'What happens when this block runs?',
        code: `DECLARE
  v_grade CHAR(1) := 'D';
BEGIN
  CASE v_grade
    WHEN 'A' THEN DBMS_OUTPUT.PUT_LINE('Excellent');
    WHEN 'B' THEN DBMS_OUTPUT.PUT_LINE('Good');
  END CASE;
END;
/`,
        fails: 'ORA-06592',
        correct: 'It fails with CASE_NOT_FOUND (ORA-06592)',
        wrong: ['It prints nothing', 'It prints Good', 'It does not compile without ELSE'],
        why: 'A CASE statement with no matching WHEN and no ELSE raises `CASE_NOT_FOUND`. (A CASE expression returns NULL in that situation instead.) Add `ELSE NULL;` if doing nothing is intended.',
      },
    ],
  ),
];
