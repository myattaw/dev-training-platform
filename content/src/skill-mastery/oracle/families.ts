import type { QuestionDifficulty, QuestionSource } from '@pracstack/content-model';
import { choice, family, type FamilyQuestion } from '../family';
import { text } from '../helpers';
import { oracleCompanyDb } from './company-db';

/**
 * Oracle SQL question families against the Oracle company database
 * (`departments`, `employees` with `manager_id` and `commission`). Every
 * reference query is executed in Oracle Database Free on the sample data and
 * both hidden datasets by content/src/checks/oracle-questions.spec.ts, which
 * fails on any error or warning.
 */

interface SqlVariant {
  readonly key: string;
  readonly task: string;
  readonly query: string;
  readonly why?: string;
}

const sqlFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  options: {
    readonly ordered: boolean;
    readonly hints: readonly string[];
    readonly concept: string;
  },
  variants: readonly SqlVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty,
    format: 'sql-query',
    dialect: 'oracle',
    database: oracleCompanyDb,
    prompt: text(v.task),
    ordered: options.ordered,
    answer: { referenceQuery: v.query },
    hints: [...options.hints],
    explanation: text(options.concept, ...(v.why ? [v.why] : []), `One answer: \`${v.query}\``),
  }));

interface ChoiceVariant {
  readonly key: string;
  readonly question: string;
  readonly correct: string;
  readonly wrong: readonly string[];
  readonly why: string;
}

const choiceFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  hint: string,
  variants: readonly ChoiceVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty,
    format: 'multiple-choice',
    prompt: text(v.question),
    ...choice(`${id}-${v.key}`, v.correct, v.wrong),
    hints: [hint],
    explanation: text(v.why),
  }));

// ---------------------------------------------------------------- Row limiting

export const rowLimitingFamilies: readonly QuestionSource[] = [
  ...choiceFamily('ora-dual-basics', 1, '`DUAL` has exactly one row.', [
    {
      key: 'expression',
      question: 'What does `SELECT 2 + 3 FROM dual` return?',
      correct: 'One row with the value 5',
      wrong: ['An error: there is no table', 'No rows', 'One row per table in the database'],
      why: 'Selecting an expression from the one-row `DUAL` table evaluates it once.',
    },
    {
      key: 'why',
      question: 'Why does Oracle need `FROM dual` in `SELECT SYSDATE FROM dual`?',
      correct: 'Oracle requires a FROM clause, and DUAL is a one-row table for exactly this',
      wrong: [
        'DUAL stores the current date',
        'It makes the query run twice',
        'It is optional decoration',
      ],
      why: 'Before Oracle 23ai, every `SELECT` needed a `FROM` clause; `DUAL` provides a single row to select expressions from.',
    },
  ]),
  ...sqlFamily(
    'ora-fetch-first',
    2,
    {
      ordered: true,
      hints: ['Sort with `ORDER BY`, then add `FETCH FIRST n ROWS ONLY`.'],
      concept:
        '`FETCH FIRST n ROWS ONLY` (Oracle 12c and later) keeps the first rows of the sorted result.',
    },
    [
      {
        key: 'lowest-paid',
        task: 'List the `name` and `salary` of the two lowest-paid employees, lowest first.',
        query: 'SELECT name, salary FROM employees ORDER BY salary FETCH FIRST 2 ROWS ONLY',
      },
      {
        key: 'newest',
        task: 'List the `name` and `hired_on` of the three most recently hired employees, newest first.',
        query:
          'SELECT name, hired_on FROM employees ORDER BY hired_on DESC FETCH FIRST 3 ROWS ONLY',
      },
      {
        key: 'alphabetical',
        task: 'List the first four employee `name`s in alphabetical order.',
        query: 'SELECT name FROM employees ORDER BY name FETCH FIRST 4 ROWS ONLY',
      },
    ],
  ),
  ...sqlFamily(
    'ora-offset-fetch',
    3,
    {
      ordered: true,
      hints: ['`OFFSET n ROWS` skips rows; `FETCH NEXT m ROWS ONLY` then takes the next ones.'],
      concept: '`OFFSET … ROWS FETCH NEXT … ROWS ONLY` pages through a sorted result.',
    },
    [
      {
        key: 'second-highest',
        task: 'Show the `name` and `salary` of the employee with the second-highest salary.',
        query:
          'SELECT name, salary FROM employees ORDER BY salary DESC OFFSET 1 ROWS FETCH NEXT 1 ROWS ONLY',
      },
      {
        key: 'page-2',
        task: 'Employee names are listed alphabetically, three per page. List the `name`s on page 2.',
        query: 'SELECT name FROM employees ORDER BY name OFFSET 3 ROWS FETCH NEXT 3 ROWS ONLY',
      },
    ],
  ),
  ...sqlFamily(
    'ora-rownum-subquery',
    4,
    {
      ordered: true,
      hints: [
        '`ROWNUM` is assigned before `ORDER BY` runs in the same query.',
        'Sort in a subquery, then filter on `ROWNUM` outside it (or use `FETCH FIRST`).',
      ],
      concept:
        'In older Oracle code, top-N queries sort in an inline view and apply `ROWNUM <= n` outside it, because `ROWNUM` is numbered before sorting.',
    },
    [
      {
        key: 'top-2-paid',
        task: 'Using `ROWNUM` (not `FETCH FIRST`), list the `name` of the two highest-paid employees, highest first.',
        query:
          'SELECT name FROM (SELECT name FROM employees ORDER BY salary DESC) WHERE ROWNUM <= 2',
      },
      {
        key: 'longest-serving',
        task: 'Using `ROWNUM` (not `FETCH FIRST`), list the `name` and `hired_on` of the three longest-serving employees, earliest first.',
        query:
          'SELECT name, hired_on FROM (SELECT name, hired_on FROM employees ORDER BY hired_on) WHERE ROWNUM <= 3',
      },
    ],
  ),
  ...sqlFamily(
    'ora-fetch-percent',
    4,
    {
      ordered: true,
      hints: ['`FETCH FIRST n PERCENT ROWS ONLY` keeps a share of the rows, rounded up.'],
      concept:
        '`FETCH FIRST n PERCENT ROWS ONLY` returns the given percentage of rows (rounded up) of the sorted result.',
    },
    [
      {
        key: 'top-20-percent',
        task: 'List the `name` and `salary` of the top 20 percent of earners, highest first.',
        query:
          'SELECT name, salary FROM employees ORDER BY salary DESC FETCH FIRST 20 PERCENT ROWS ONLY',
      },
      {
        key: 'newest-30-percent',
        task: 'List the `name` of the most recently hired 30 percent of employees, newest first.',
        query: 'SELECT name FROM employees ORDER BY hired_on DESC FETCH FIRST 30 PERCENT ROWS ONLY',
      },
    ],
  ),
  ...sqlFamily(
    'ora-row-number-per-group',
    5,
    {
      ordered: false,
      hints: [
        '`ROW_NUMBER() OVER (PARTITION BY … ORDER BY …)` numbers the rows within each group.',
        'Number the rows in a subquery, then keep the ones you want outside it.',
      ],
      concept:
        '`ROW_NUMBER()` with `PARTITION BY` restarts numbering for every group, so filtering on it gives the top rows per group. NULL department ids form a group of their own.',
    },
    [
      {
        key: 'top-paid',
        task: 'For every `department_id` (including employees without a department), show the department and the `name` of its highest-paid employee.',
        query:
          'SELECT department_id, name FROM (SELECT department_id, name, ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY salary DESC) AS rn FROM employees) WHERE rn = 1',
      },
      {
        key: 'newest',
        task: 'For every `department_id` (including employees without a department), show the department and the `name` of its most recently hired employee.',
        query:
          'SELECT department_id, name FROM (SELECT department_id, name, ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY hired_on DESC) AS rn FROM employees) WHERE rn = 1',
      },
      {
        key: 'top-two',
        task: 'For every `department_id` (including employees without a department), list the `name`s of its two highest-paid employees, with the department.',
        query:
          'SELECT department_id, name FROM (SELECT department_id, name, ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY salary DESC) AS rn FROM employees) WHERE rn <= 2',
      },
    ],
  ),
  ...choiceFamily(
    'ora-rownum-pitfalls',
    5,
    '`ROWNUM` is assigned to a row only when the row passes the WHERE clause.',
    [
      {
        key: 'equals-two',
        question: 'What does `SELECT name FROM employees WHERE ROWNUM = 2` return?',
        correct: 'No rows',
        wrong: ['The second employee', 'The first two employees', 'An error'],
        why: 'The first candidate row would get ROWNUM 1, fails `= 2` and is discarded, so the next candidate is also numbered 1, and so on: no row ever reaches 2.',
      },
      {
        key: 'greater-than',
        question: 'What does `SELECT name FROM employees WHERE ROWNUM > 1` return?',
        correct: 'No rows',
        wrong: ['Every employee except the first', 'Every employee', 'An error'],
        why: 'For the same reason as `ROWNUM = 2`: every candidate is numbered 1 and fails the condition. Use `OFFSET` or `ROW_NUMBER()` to skip rows.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- NULLs

export const nullFamilies: readonly QuestionSource[] = [
  ...choiceFamily(
    'ora-nvl-basics',
    1,
    '`NVL(a, b)` returns `b` when `a` is NULL, and `a` otherwise.',
    [
      {
        key: 'null',
        question: 'What does `NVL(NULL, 5)` return?',
        correct: '5',
        wrong: ['NULL', '0', 'An error'],
        why: 'The first argument is NULL, so the fallback is returned.',
      },
      {
        key: 'value',
        question: 'What does `NVL(3, 5)` return?',
        correct: '3',
        wrong: ['5', 'NULL', '8'],
        why: 'The first argument is not NULL, so it is returned unchanged.',
      },
    ],
  ),
  ...sqlFamily(
    'ora-nvl-columns',
    2,
    {
      ordered: false,
      hints: ['`NVL(column, fallback)` replaces NULL with the fallback.'],
      concept:
        '`NVL` is Oracle’s two-argument way to replace NULL; `COALESCE` is the standard equivalent.',
    },
    [
      {
        key: 'commission',
        task: 'List every employee `name` with their `commission`, showing `0` when they have none.',
        query: 'SELECT name, NVL(commission, 0) FROM employees',
      },
      {
        key: 'manager',
        task: 'List every employee `name` with their `manager_id`, showing `0` for the employee without a manager.',
        query: 'SELECT name, NVL(manager_id, 0) FROM employees',
      },
    ],
  ),
  ...sqlFamily(
    'ora-null-filters',
    3,
    {
      ordered: false,
      hints: ['NULL is not a value you can compare with `=`; and NULL is not the same as 0.'],
      concept:
        '`IS NULL` / `IS NOT NULL` test for missing values. A commission of 0 is a value, not NULL; `NVL(commission, 0) = 0` treats both as "no commission".',
    },
    [
      {
        key: 'has-commission',
        task: 'List the `name` and `commission` of every employee who has a commission recorded (it may be 0).',
        query: 'SELECT name, commission FROM employees WHERE commission IS NOT NULL',
      },
      {
        key: 'no-commission',
        task: 'List the `name` of every employee who earns no commission: none recorded, or zero.',
        query: 'SELECT name FROM employees WHERE NVL(commission, 0) = 0',
      },
    ],
  ),
  ...sqlFamily(
    'ora-nvl2',
    4,
    {
      ordered: false,
      hints: [
        '`NVL2(x, if_not_null, if_null)` picks one of two values depending on whether `x` is NULL.',
      ],
      concept:
        '`NVL2` returns its second argument when the first is not NULL, and its third when it is NULL.',
    },
    [
      {
        key: 'commission-label',
        task: 'List every employee `name` with `commission` if a commission is recorded (even 0), and `salary only` otherwise.',
        query: "SELECT name, NVL2(commission, 'commission', 'salary only') FROM employees",
      },
      {
        key: 'manager-label',
        task: 'List every employee `name` with `reports` if they have a manager, and `top` otherwise.',
        query: "SELECT name, NVL2(manager_id, 'reports', 'top') FROM employees",
      },
    ],
  ),
  ...sqlFamily(
    'ora-null-aggregates',
    5,
    {
      ordered: false,
      hints: [
        'Aggregates such as `AVG` and `COUNT(column)` skip NULLs.',
        'Replace NULL with 0 first if missing values should count as zero.',
      ],
      concept:
        '`AVG(commission)` averages only the recorded commissions; `AVG(NVL(commission, 0))` counts everyone, treating missing commissions as 0.',
    },
    [
      {
        key: 'avg-everyone',
        task: 'Show the average commission over all employees, counting a missing commission as 0, rounded to 2 decimal places.',
        query: 'SELECT ROUND(AVG(NVL(commission, 0)), 2) FROM employees',
      },
      {
        key: 'count-recorded',
        task: 'In one row, show the number of employees and the number with a commission recorded, in that order.',
        query: 'SELECT COUNT(*), COUNT(commission) FROM employees',
      },
    ],
  ),
  ...sqlFamily(
    'ora-not-in-null',
    5,
    {
      ordered: false,
      hints: [
        '`manager_id` is NULL for the top manager. What does `id NOT IN (…, NULL)` evaluate to?',
        'Use `NOT EXISTS` with a correlated subquery.',
      ],
      concept:
        'If the list in `NOT IN` contains NULL, `x NOT IN (…)` is never true, so `WHERE id NOT IN (SELECT manager_id FROM employees)` returns no rows at all. `NOT EXISTS` is unaffected.',
    },
    [
      {
        key: 'no-reports',
        task: 'List the `name` of every employee who manages nobody.',
        query:
          'SELECT e.name FROM employees e WHERE NOT EXISTS (SELECT 1 FROM employees r WHERE r.manager_id = e.id)',
      },
      {
        key: 'empty-departments',
        task: 'List the `name` of every department with no employees.',
        query:
          'SELECT d.name FROM departments d WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.department_id = d.id)',
      },
    ],
  ),
  ...choiceFamily(
    'ora-empty-string',
    4,
    'In Oracle, an empty string and NULL are the same thing.',
    [
      {
        key: 'length',
        question: "What does `LENGTH('')` return in Oracle?",
        correct: 'NULL',
        wrong: ['0', '1', 'An error'],
        why: "Oracle treats `''` as NULL, and `LENGTH(NULL)` is NULL.",
      },
      {
        key: 'is-null',
        question: "In Oracle, is `'' IS NULL` true?",
        correct: 'Yes',
        wrong: ['No', 'Only in PL/SQL', 'It is an error'],
        why: 'A zero-length string is stored and compared as NULL in Oracle (unlike PostgreSQL).',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Dates

export const dateFamilies: readonly QuestionSource[] = [
  ...choiceFamily(
    'ora-date-basics',
    1,
    'Oracle’s DATE type stores both a date and a time of day.',
    [
      {
        key: 'time',
        question: 'What does an Oracle `DATE` value contain?',
        correct: 'A date and a time (to the second)',
        wrong: ['Only a date', 'Only a time', 'A date and a time zone'],
        why: 'Unlike the SQL standard `DATE`, Oracle’s `DATE` always includes hours, minutes and seconds.',
      },
      {
        key: 'sysdate',
        question: 'What does `SYSDATE` return?',
        correct: 'The current date and time of the database server',
        wrong: ['Midnight today', 'The date the table was created', 'The date of the last commit'],
        why: '`SYSDATE` is the current date and time; `TRUNC(SYSDATE)` gives midnight today.',
      },
    ],
  ),
  ...sqlFamily(
    'ora-extract',
    2,
    {
      ordered: false,
      hints: ['`EXTRACT(YEAR FROM date)` returns the year as a number.'],
      concept: '`EXTRACT` pulls the year, month or day out of a date.',
    },
    [
      {
        key: 'hired-2022',
        task: 'List the `name` of every employee hired in 2022.',
        query: 'SELECT name FROM employees WHERE EXTRACT(YEAR FROM hired_on) = 2022',
      },
      {
        key: 'hire-month',
        task: 'List every employee `name` with the month number (1–12) they were hired in.',
        query: 'SELECT name, EXTRACT(MONTH FROM hired_on) FROM employees',
      },
    ],
  ),
  ...sqlFamily(
    'ora-to-char-dates',
    3,
    {
      ordered: false,
      hints: ["`TO_CHAR(date, 'YYYY-MM')` formats a date with a format model."],
      concept:
        '`TO_CHAR` turns a date into text using a format model such as `YYYY` (year), `MM` (month) and `DD` (day).',
    },
    [
      {
        key: 'year-month',
        task: 'List every employee `name` with their hire date formatted as `YYYY-MM` (for example `2019-04`).',
        query: "SELECT name, TO_CHAR(hired_on, 'YYYY-MM') FROM employees",
      },
      {
        key: 'day-month-year',
        task: 'List every employee `name` with their hire date formatted as `DD.MM.YYYY` (for example `01.04.2019`).',
        query: "SELECT name, TO_CHAR(hired_on, 'DD.MM.YYYY') FROM employees",
      },
    ],
  ),
  ...sqlFamily(
    'ora-date-ranges',
    3,
    {
      ordered: false,
      hints: ["Compare with a date literal: `DATE '2020-01-01'`."],
      concept:
        "An ANSI date literal (`DATE 'YYYY-MM-DD'`) does not depend on session date-format settings, unlike a plain string.",
    },
    [
      {
        key: 'before-2018',
        task: 'List the `name` of every employee hired before 1 January 2018.',
        query: "SELECT name FROM employees WHERE hired_on < DATE '2018-01-01'",
      },
      {
        key: 'between',
        task: 'List the `name` and `hired_on` of every employee hired from 2019 to 2021 (inclusive).',
        query:
          "SELECT name, hired_on FROM employees WHERE hired_on >= DATE '2019-01-01' AND hired_on < DATE '2022-01-01'",
      },
    ],
  ),
  ...sqlFamily(
    'ora-month-arithmetic',
    4,
    {
      ordered: false,
      hints: [
        '`MONTHS_BETWEEN(later, earlier)` gives a (fractional) number of months; `ADD_MONTHS(date, n)` moves a date by months.',
      ],
      concept:
        '`MONTHS_BETWEEN` and `ADD_MONTHS` work in calendar months, which plain day arithmetic cannot.',
    },
    [
      {
        key: 'service-months',
        task: 'List every employee `name` with their complete months of service on 1 January 2025 (`MONTHS_BETWEEN`, rounded down).',
        query: "SELECT name, TRUNC(MONTHS_BETWEEN(DATE '2025-01-01', hired_on)) FROM employees",
      },
      {
        key: 'probation-end',
        task: 'List every employee `name` with the end of their six-month probation: the hire date plus 6 months.',
        query: 'SELECT name, ADD_MONTHS(hired_on, 6) FROM employees',
      },
    ],
  ),
  ...sqlFamily(
    'ora-hires-per-year',
    4,
    {
      ordered: true,
      hints: ['Group by the year of `hired_on`, and sort by it.'],
      concept:
        'Grouping by an expression such as `EXTRACT(YEAR FROM hired_on)` counts rows per year.',
    },
    [
      {
        key: 'count',
        task: 'For each year with hires, show the year and the number of employees hired, earliest year first.',
        query:
          'SELECT EXTRACT(YEAR FROM hired_on) AS hire_year, COUNT(*) FROM employees GROUP BY EXTRACT(YEAR FROM hired_on) ORDER BY hire_year',
      },
      {
        key: 'payroll',
        task: 'For each year with hires, show the year and the total salary of the employees hired that year, earliest year first.',
        query:
          'SELECT EXTRACT(YEAR FROM hired_on) AS hire_year, SUM(salary) FROM employees GROUP BY EXTRACT(YEAR FROM hired_on) ORDER BY hire_year',
      },
    ],
  ),
  ...sqlFamily(
    'ora-date-self-join',
    5,
    {
      ordered: false,
      hints: [
        'Join `employees` to itself: one alias for the employee, one for the manager.',
        '`MONTHS_BETWEEN(e.hired_on, m.hired_on)` compares the two hire dates.',
      ],
      concept:
        'A self-join on `manager_id` pairs each employee with their manager; date functions then compare the two rows.',
    },
    [
      {
        key: 'five-years-after',
        task: 'List the `name` of every employee hired more than 60 months after their manager.',
        query:
          'SELECT e.name FROM employees e JOIN employees m ON m.id = e.manager_id WHERE MONTHS_BETWEEN(e.hired_on, m.hired_on) > 60',
      },
      {
        key: 'within-three-years',
        task: "List the `name` of every employee hired within 36 months (inclusive) after their manager, with the manager's `name`.",
        query:
          'SELECT e.name, m.name FROM employees e JOIN employees m ON m.id = e.manager_id WHERE MONTHS_BETWEEN(e.hired_on, m.hired_on) <= 36',
      },
    ],
  ),
  ...choiceFamily('ora-date-pitfalls', 5, 'Remember that DATE values include a time of day.', [
    {
      key: 'trunc',
      question:
        "A row has `hired_on` = 2024-03-05 14:30. Does `WHERE hired_on = DATE '2024-03-05'` match it?",
      correct: 'No: the literal is midnight, and the times differ',
      wrong: [
        'Yes: only the date part is compared',
        'Yes, but only with TRUNC on the literal',
        'It is an error',
      ],
      why: "`DATE '2024-03-05'` is midnight. Compare `TRUNC(hired_on) = DATE '2024-03-05'`, or use a range `>= DATE '2024-03-05' AND < DATE '2024-03-06'`.",
    },
    {
      key: 'subtract',
      question: "What is the type of `DATE '2024-03-05' - DATE '2024-03-01'` in Oracle?",
      correct: 'A number of days (4)',
      wrong: ['A DATE', 'An INTERVAL of 4 months', 'A string'],
      why: 'Subtracting two DATE values gives the difference in days, as a number (with a fraction for times).',
    },
  ]),
];

// ---------------------------------------------------------------- DECODE and CASE

export const conditionalFamilies: readonly QuestionSource[] = [
  ...choiceFamily(
    'ora-decode-basics',
    1,
    '`DECODE(expr, search1, result1, …, default)` compares `expr` with each search value.',
    [
      {
        key: 'default',
        question: "What does `DECODE(2, 1, 'one', 'other')` return?",
        correct: "'other'",
        wrong: ["'one'", 'NULL', '2'],
        why: '2 matches no search value, so the default is returned.',
      },
      {
        key: 'match',
        question: "What does `DECODE(1, 1, 'one', 2, 'two', 'other')` return?",
        correct: "'one'",
        wrong: ["'two'", "'other'", '1'],
        why: 'The first search value equals the expression, so its result is returned.',
      },
    ],
  ),
  ...sqlFamily(
    'ora-decode-labels',
    2,
    {
      ordered: false,
      hints: ["`DECODE(column, value1, 'label1', value2, 'label2', 'default')`."],
      concept: '`DECODE` maps specific values to results, like a simple `CASE`.',
    },
    [
      {
        key: 'department',
        task: 'List every employee `name` with `main` if their `department_id` is 10, `sales` if it is 20, and `other` otherwise.',
        query:
          "SELECT name, DECODE(department_id, 10, 'main', 20, 'sales', 'other') FROM employees",
      },
      {
        key: 'title',
        task: 'List every employee `name` with `exec` if their title is `CEO`, and `staff` otherwise.',
        query: "SELECT name, DECODE(title, 'CEO', 'exec', 'staff') FROM employees",
      },
    ],
  ),
  ...sqlFamily(
    'ora-searched-case',
    3,
    {
      ordered: false,
      hints: ['`CASE WHEN condition THEN … WHEN … ELSE … END`: the first true condition wins.'],
      concept:
        'A searched `CASE` evaluates conditions in order and returns the result of the first one that is true.',
    },
    [
      {
        key: 'salary-band',
        task: 'List every employee `name` with `high` for salaries of 100,000 or more, `medium` from 70,000, and `low` otherwise.',
        query:
          "SELECT name, CASE WHEN salary >= 100000 THEN 'high' WHEN salary >= 70000 THEN 'medium' ELSE 'low' END FROM employees",
      },
      {
        key: 'seniority',
        task: 'List every employee `name` with `senior` if hired before 2018, `mid` if hired from 2018 to 2020, and `junior` otherwise.',
        query:
          "SELECT name, CASE WHEN hired_on < DATE '2018-01-01' THEN 'senior' WHEN hired_on < DATE '2021-01-01' THEN 'mid' ELSE 'junior' END FROM employees",
      },
    ],
  ),
  ...sqlFamily(
    'ora-case-aggregates',
    4,
    {
      ordered: false,
      hints: ['`SUM(CASE WHEN condition THEN 1 ELSE 0 END)` counts the rows that match.'],
      concept:
        'Conditional aggregation computes several counts or sums in one pass, one `CASE` per column.',
    },
    [
      {
        key: 'band-pivot',
        task: 'In one row, show the number of employees earning 100,000 or more, and the number earning less, in that order.',
        query:
          'SELECT SUM(CASE WHEN salary >= 100000 THEN 1 ELSE 0 END), SUM(CASE WHEN salary < 100000 THEN 1 ELSE 0 END) FROM employees',
      },
      {
        key: 'commission-per-department',
        task: 'For each `department_id` (including employees without a department), show the department and how many of its employees have a commission greater than 0.',
        query:
          'SELECT department_id, SUM(CASE WHEN commission > 0 THEN 1 ELSE 0 END) FROM employees GROUP BY department_id',
      },
    ],
  ),
  ...sqlFamily(
    'ora-decode-null-match',
    5,
    {
      ordered: false,
      hints: [
        '`DECODE` considers two NULLs equal; `CASE x WHEN NULL` never matches.',
        'With `CASE`, write `CASE WHEN x IS NULL THEN …`.',
      ],
      concept:
        'Unlike `=` and simple `CASE`, `DECODE` treats NULL as matching NULL, so `DECODE(x, NULL, …)` works.',
    },
    [
      {
        key: 'commission',
        task: 'List every employee `name` with `none` if no commission is recorded, and `recorded` otherwise.',
        query: "SELECT name, DECODE(commission, NULL, 'none', 'recorded') FROM employees",
      },
      {
        key: 'department',
        task: 'List every employee `name` with `unassigned` if they have no department, and their `department_id` (as text) otherwise.',
        query:
          "SELECT name, DECODE(department_id, NULL, 'unassigned', TO_CHAR(department_id)) FROM employees",
      },
    ],
  ),
  ...choiceFamily('ora-case-null-pitfall', 5, 'A simple CASE compares with `=`.', [
    {
      key: 'simple-case',
      question:
        "For an employee whose `commission` is NULL, what does `CASE commission WHEN NULL THEN 'none' ELSE 'has' END` return?",
      correct: "'has'",
      wrong: ["'none'", 'NULL', 'An error'],
      why: "A simple `CASE` compares `commission = NULL`, which is never true, so the `ELSE` branch wins. Write `CASE WHEN commission IS NULL THEN 'none' ELSE 'has' END`.",
    },
    {
      key: 'no-else',
      question: "What does `CASE WHEN 1 = 2 THEN 'x' END` return?",
      correct: 'NULL',
      wrong: ["'x'", "''", 'An error'],
      why: 'Without an `ELSE`, a `CASE` with no true condition returns NULL.',
    },
  ]),
];

// ---------------------------------------------------------------- Hierarchical queries

export const hierarchyFamilies: readonly QuestionSource[] = [
  ...choiceFamily(
    'ora-hierarchy-basics',
    1,
    '`manager_id` points at another row of the same table.',
    [
      {
        key: 'top',
        question:
          'In the `employees` table, how do you recognise the employee at the top of the hierarchy?',
        correct: '`manager_id` is NULL',
        wrong: ['`id` is 1', 'The highest salary', '`department_id` is NULL'],
        why: 'The top manager reports to nobody, so their `manager_id` is NULL. That is what `START WITH manager_id IS NULL` selects.',
      },
      {
        key: 'prior',
        question: 'In `CONNECT BY PRIOR id = manager_id`, what does `PRIOR id` refer to?',
        correct: 'The `id` of the parent row, from the previous level',
        wrong: ['The previous row in the table', 'The smallest id', 'The id of the root row only'],
        why: 'Each child row is connected to the parent whose `id` equals the child’s `manager_id`.',
      },
    ],
  ),
  ...sqlFamily(
    'ora-direct-reports',
    2,
    {
      ordered: false,
      hints: ['Find the top manager (`manager_id IS NULL`) in a subquery.'],
      concept: 'One level of a hierarchy is an ordinary query on `manager_id`.',
    },
    [
      {
        key: 'top-reports',
        task: 'List the `name` of everyone who reports directly to the top manager (the employee without a manager).',
        query:
          'SELECT name FROM employees WHERE manager_id = (SELECT id FROM employees WHERE manager_id IS NULL)',
      },
      {
        key: 'with-manager',
        task: "List every employee `name` with their manager's `name`; leave out the top manager.",
        query: 'SELECT e.name, m.name FROM employees e JOIN employees m ON m.id = e.manager_id',
      },
    ],
  ),
  ...sqlFamily(
    'ora-level',
    3,
    {
      ordered: false,
      hints: [
        '`START WITH manager_id IS NULL CONNECT BY PRIOR id = manager_id`, and `LEVEL` is the depth (1 at the top).',
      ],
      concept: '`LEVEL` is a pseudocolumn giving each row’s depth in the hierarchy.',
    },
    [
      {
        key: 'all-levels',
        task: 'List every employee `name` with their level in the management hierarchy (the top manager is level 1).',
        query:
          'SELECT name, LEVEL FROM employees START WITH manager_id IS NULL CONNECT BY PRIOR id = manager_id',
      },
      {
        key: 'third-level',
        task: 'List the `name` of every employee at level 3 of the hierarchy (two levels below the top manager).',
        query:
          'SELECT name FROM (SELECT name, LEVEL AS lvl FROM employees START WITH manager_id IS NULL CONNECT BY PRIOR id = manager_id) WHERE lvl = 3',
      },
    ],
  ),
  ...sqlFamily(
    'ora-hierarchy-walks',
    4,
    {
      ordered: false,
      hints: [
        'To walk down from someone, start with them and use `CONNECT BY PRIOR id = manager_id`.',
        'To walk up, reverse it: `CONNECT BY PRIOR manager_id = id`.',
      ],
      concept:
        'The direction of `PRIOR` decides whether the query walks down to reports or up to managers.',
    },
    [
      {
        key: 'up-from-contractor',
        task: 'List the `name` of the contractor (title `Contractor`) and everyone above them in the management chain.',
        query:
          "SELECT name FROM employees START WITH title = 'Contractor' CONNECT BY PRIOR manager_id = id",
      },
      {
        key: 'path',
        task: "List every employee `name` with their management path from the top, built with `SYS_CONNECT_BY_PATH(name, '/')`.",
        query:
          "SELECT name, SYS_CONNECT_BY_PATH(name, '/') FROM employees START WITH manager_id IS NULL CONNECT BY PRIOR id = manager_id",
      },
    ],
  ),
  ...sqlFamily(
    'ora-hierarchy-pseudocolumns',
    5,
    {
      ordered: false,
      hints: [
        '`CONNECT_BY_ROOT column` gives the value from the row the walk started at.',
        '`CONNECT_BY_ISLEAF` is 1 for rows without children.',
      ],
      concept:
        'Hierarchical queries offer pseudocolumns: `LEVEL`, `CONNECT_BY_ISLEAF`, and the operator `CONNECT_BY_ROOT`.',
    },
    [
      {
        key: 'branch',
        task: "For everyone below the top manager, show their `name` and the `name` of the top manager's direct report whose branch they are in (a direct report is in their own branch).",
        query:
          'SELECT name, CONNECT_BY_ROOT name FROM employees START WITH manager_id = (SELECT id FROM employees WHERE manager_id IS NULL) CONNECT BY PRIOR id = manager_id',
      },
      {
        key: 'leaves',
        task: 'Using a hierarchical query, list the `name` of every employee who has no reports.',
        query:
          'SELECT name FROM employees WHERE CONNECT_BY_ISLEAF = 1 START WITH manager_id IS NULL CONNECT BY PRIOR id = manager_id',
      },
      {
        key: 'team-size',
        task: 'For each direct report of the top manager, show their `name` and the number of people in their branch, including themselves.',
        query:
          'SELECT root_name, COUNT(*) FROM (SELECT CONNECT_BY_ROOT name AS root_name FROM employees START WITH manager_id = (SELECT id FROM employees WHERE manager_id IS NULL) CONNECT BY PRIOR id = manager_id) GROUP BY root_name',
      },
    ],
  ),
  ...choiceFamily(
    'ora-hierarchy-ordering',
    4,
    'A plain `ORDER BY` sorts the whole result and loses the tree order.',
    [
      {
        key: 'siblings',
        question:
          'How do you sort employees by name within each level while keeping the tree order of a hierarchical query?',
        correct: '`ORDER SIBLINGS BY name`',
        wrong: ['`ORDER BY LEVEL, name`', '`ORDER BY name`', '`GROUP BY LEVEL`'],
        why: '`ORDER SIBLINGS BY` sorts the children of each parent and keeps each subtree under its parent.',
      },
      {
        key: 'where-timing',
        question: 'In a hierarchical query, when is the `WHERE` clause applied?',
        correct: 'After the hierarchy is built: it removes rows but not their descendants',
        wrong: ['Before the hierarchy is built', 'Only to the root rows', 'It is not allowed'],
        why: 'Oracle builds the hierarchy first, then filters rows with `WHERE`; descendants of a filtered-out row can still appear.',
      },
    ],
  ),
];
