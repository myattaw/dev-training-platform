import type { QuestionSource, SqlQuestionSource } from '@pracstack/content-model';
import { sql as sqlCode, text } from '../helpers';
import { oracleCompanyDb } from './company-db';

type SqlQuestion = Omit<SqlQuestionSource, 'format' | 'dialect' | 'database' | 'version'>;

/** A SQL-writing question against the Oracle company database. */
const sql = (q: SqlQuestion): QuestionSource => ({
  version: 1,
  format: 'sql-query',
  dialect: 'oracle',
  database: oracleCompanyDb,
  ...q,
});

/* ---------------------------------------------------------------- row limiting */

export const rowLimitingQuestions: readonly QuestionSource[] = [
  {
    id: 'ora-dual-count',
    version: 1,
    difficulty: 1,
    format: 'predict-output',
    prompt: text('`DUAL` is a built-in Oracle table. What does this query return?'),
    code: sqlCode('SELECT COUNT(*) FROM dual;'),
    answer: { output: '1' },
    hints: [
      '`DUAL` exists so you can select expressions from a table. How many rows does it have?',
    ],
    explanation: text(
      '`DUAL` has exactly one row and one column. Selecting from it evaluates an expression once, e.g. `SELECT SYSDATE FROM dual`.',
    ),
  },
  sql({
    id: 'ora-fetch-first-top3',
    difficulty: 2,
    prompt: text(
      'List the `name` and `salary` of the three highest-paid employees, highest salary first.',
    ),
    ordered: true,
    answer: {
      referenceQuery:
        'SELECT name, salary FROM employees ORDER BY salary DESC FETCH FIRST 3 ROWS ONLY',
    },
    hints: [
      'Sort with `ORDER BY salary DESC`.',
      'Oracle limits rows with `FETCH FIRST n ROWS ONLY` after `ORDER BY`.',
    ],
    explanation: text(
      '`ORDER BY salary DESC FETCH FIRST 3 ROWS ONLY` sorts first and then keeps three rows. The row-limiting clause always applies after `ORDER BY`.',
    ),
  }),
  {
    id: 'ora-rownum-order-pitfall',
    version: 1,
    difficulty: 3,
    format: 'multiple-choice',
    prompt: text(
      'What does `SELECT name FROM employees WHERE ROWNUM <= 3 ORDER BY salary DESC` return?',
    ),
    options: [
      { id: 'a', text: 'The three highest-paid employees, highest first' },
      { id: 'b', text: 'Some three employees (whichever came first), then sorted by salary' },
      { id: 'c', text: 'An error: ROWNUM cannot be combined with ORDER BY' },
      { id: 'd', text: 'Every employee, sorted by salary' },
    ],
    selection: 'single',
    answer: { correct: ['b'] },
    hints: ['`ROWNUM` is assigned while rows are fetched. When does sorting happen?'],
    explanation: text(
      '`ROWNUM` is numbered before `ORDER BY` runs, so the query picks any three rows and only then sorts them. To get the top three, sort in a subquery first, or use `FETCH FIRST 3 ROWS ONLY`.',
    ),
  },
  {
    id: 'ora-fetch-keyword',
    version: 1,
    difficulty: 3,
    format: 'fill-in-blank',
    prompt: text('Complete the query so it returns the five most recently hired employees.'),
    template: sqlCode(
      'SELECT name, hired_on\nFROM employees\nORDER BY hired_on DESC\nFETCH {{blank:kw}} 5 ROWS ONLY;',
    ),
    answer: { blanks: { kw: { accepted: ['FIRST', 'NEXT'] } } },
    hints: ['The row-limiting clause reads like English: fetch the … five rows only.'],
    explanation: text(
      '`FETCH FIRST 5 ROWS ONLY` (or the equivalent `FETCH NEXT 5 ROWS ONLY`) keeps the first five rows of the sorted result.',
    ),
  },
  sql({
    id: 'ora-offset-page',
    difficulty: 4,
    prompt: text(
      'Show the second "page" of employees by hire date: the `name` and `hired_on` of the 4th, 5th and 6th earliest-hired employees, earliest first.',
    ),
    ordered: true,
    answer: {
      referenceQuery:
        'SELECT name, hired_on FROM employees ORDER BY hired_on OFFSET 3 ROWS FETCH NEXT 3 ROWS ONLY',
    },
    hints: [
      'Skip rows with `OFFSET n ROWS` before the `FETCH` clause.',
      'Page 2 of size 3 skips the first 3 rows.',
    ],
    explanation: text(
      '`OFFSET 3 ROWS FETCH NEXT 3 ROWS ONLY` skips the first page and keeps the next three rows, in `ORDER BY` order.',
    ),
  }),
  sql({
    id: 'ora-top-per-department',
    difficulty: 5,
    prompt: text(
      'For every department that has employees, show the best-paid employee: `department_id`, `name` and `salary`. Order by `department_id`. Leave out employees without a department.',
    ),
    ordered: true,
    answer: {
      referenceQuery: `SELECT department_id, name, salary
FROM (
  SELECT department_id, name, salary,
         ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY salary DESC) AS rn
  FROM employees
  WHERE department_id IS NOT NULL
)
WHERE rn = 1
ORDER BY department_id`,
    },
    hints: [
      '`FETCH FIRST` limits the whole result, not each group.',
      'Number the rows within each department with `ROW_NUMBER() OVER (PARTITION BY … ORDER BY …)`, then keep number 1.',
    ],
    explanation: text(
      'A window function numbers rows per department, highest salary first. Filtering on that number must happen in an outer query, because window functions cannot appear in `WHERE`.',
    ),
  }),
];

/* ---------------------------------------------------------------- NULLs */

export const nullQuestions: readonly QuestionSource[] = [
  {
    id: 'ora-empty-string-null',
    version: 1,
    difficulty: 1,
    format: 'multiple-choice',
    prompt: text(
      "In Oracle, what is stored when you insert `''` (an empty string) into a VARCHAR2 column?",
    ),
    options: [
      { id: 'a', text: 'An empty string' },
      { id: 'b', text: 'NULL' },
      { id: 'c', text: 'A single space' },
      { id: 'd', text: 'Nothing: the insert fails' },
    ],
    selection: 'single',
    answer: { correct: ['b'] },
    hints: ['Oracle differs from most databases here.'],
    explanation: text(
      "Oracle treats `''` as NULL. So `WHERE code = ''` never matches anything; use `WHERE code IS NULL` instead.",
    ),
  },
  {
    id: 'ora-nvl2-output',
    version: 1,
    difficulty: 2,
    format: 'predict-output',
    prompt: text('What does this query return?'),
    code: sqlCode("SELECT NVL2(NULL, 'yes', 'no') FROM dual;"),
    answer: { output: 'no' },
    hints: ['`NVL2(x, a, b)` returns `a` when `x` is not NULL, otherwise `b`.'],
    explanation: text(
      '`NVL2` picks its second argument for non-NULL values and its third for NULL. The first argument is NULL, so the result is `no`.',
    ),
  },
  sql({
    id: 'ora-nvl-total-pay',
    difficulty: 2,
    prompt: text(
      "List every employee's `name` and total pay in a column named `total_pay`: salary plus commission, where a missing commission counts as 0.",
    ),
    ordered: false,
    answer: {
      referenceQuery: 'SELECT name, salary + NVL(commission, 0) AS total_pay FROM employees',
      checkColumnNames: true,
    },
    hints: [
      'What is `salary + NULL`?',
      '`NVL(value, replacement)` returns the replacement when the value is NULL.',
    ],
    explanation: text(
      'Arithmetic with NULL gives NULL, so `salary + commission` is NULL for employees without a commission. `NVL(commission, 0)` turns NULL into 0 first.',
    ),
  }),
  sql({
    id: 'ora-no-commission',
    difficulty: 3,
    prompt: text(
      'List the `name` of every employee who has no commission at all (commission is NULL). An employee with a commission of 0 does have one.',
    ),
    ordered: false,
    answer: { referenceQuery: 'SELECT name FROM employees WHERE commission IS NULL' },
    hints: [
      'NULL is not equal to anything, not even NULL.',
      'Is `NVL(commission, 0) = 0` the same test?',
    ],
    explanation: text(
      '`commission IS NULL` matches exactly the missing values. `NVL(commission, 0) = 0` would also match a real commission of 0, which the task excludes.',
    ),
  }),
  {
    id: 'ora-coalesce-args',
    version: 1,
    difficulty: 4,
    format: 'multiple-choice',
    prompt: text(
      'Which expression returns `commission` if it is not NULL, otherwise `bonus` if that is not NULL, otherwise 0?',
    ),
    options: [
      { id: 'a', text: '`COALESCE(commission, bonus, 0)`' },
      { id: 'b', text: '`NVL(commission, bonus, 0)`' },
      { id: 'c', text: '`NULLIF(commission, bonus)`' },
      { id: 'd', text: '`NVL2(commission, bonus, 0)`' },
    ],
    selection: 'single',
    answer: { correct: ['a'] },
    hints: ['One of these functions takes exactly two arguments; another takes any number.'],
    explanation: text(
      '`COALESCE` returns its first non-NULL argument and accepts any number of them. `NVL` takes exactly two, `NULLIF` returns NULL when its arguments are equal, and `NVL2` would return `bonus` when commission is NOT NULL.',
    ),
  },
  sql({
    id: 'ora-unassigned-department',
    difficulty: 5,
    prompt: text(
      "List every employee's `name` and their department's name in a column named `department`. For employees without a department, show `Unassigned`.",
    ),
    ordered: false,
    answer: {
      referenceQuery: `SELECT e.name, NVL(d.name, 'Unassigned') AS department
FROM employees e
LEFT JOIN departments d ON d.id = e.department_id`,
      checkColumnNames: true,
    },
    hints: [
      'An inner join drops employees without a department. Which join keeps them?',
      'Replace the missing department name with `NVL`.',
    ],
    explanation: text(
      "`LEFT JOIN` keeps every employee; the department columns are NULL when there is no match, and `NVL(d.name, 'Unassigned')` fills them in.",
    ),
  }),
];

/* ---------------------------------------------------------------- dates */

export const dateQuestions: readonly QuestionSource[] = [
  {
    id: 'ora-to-char-year',
    version: 1,
    difficulty: 1,
    format: 'predict-output',
    prompt: text('What does this query return?'),
    code: sqlCode("SELECT TO_CHAR(DATE '2024-03-05', 'YYYY') FROM dual;"),
    answer: { output: '2024' },
    hints: ["`TO_CHAR` formats a date using a format model; `'YYYY'` is the four-digit year."],
    explanation: text(
      "`DATE '2024-03-05'` is a date literal, and `TO_CHAR(…, 'YYYY')` turns it into the text `2024`.",
    ),
  },
  sql({
    id: 'ora-hire-year',
    difficulty: 2,
    prompt: text(
      "List every employee's `name` and the year they were hired, in a column named `hire_year`.",
    ),
    ordered: false,
    answer: {
      referenceQuery: 'SELECT name, EXTRACT(YEAR FROM hired_on) AS hire_year FROM employees',
      checkColumnNames: true,
    },
    hints: ['`EXTRACT(YEAR FROM some_date)` returns the year as a number.'],
    explanation: text(
      "`EXTRACT(YEAR FROM hired_on)` gives the year; `TO_CHAR(hired_on, 'YYYY')` works too (as text).",
    ),
  }),
  {
    id: 'ora-add-months-end',
    version: 1,
    difficulty: 3,
    format: 'multiple-choice',
    prompt: text("What does `ADD_MONTHS(DATE '2024-01-31', 1)` return?"),
    options: [
      { id: 'a', text: '29 February 2024' },
      { id: 'b', text: '2 March 2024' },
      { id: 'c', text: '28 February 2024' },
      { id: 'd', text: 'An error, because 31 February does not exist' },
    ],
    selection: 'single',
    answer: { correct: ['a'] },
    hints: ['ADD_MONTHS treats the last day of a month specially. Is 2024 a leap year?'],
    explanation: text(
      'When the input is the last day of its month, `ADD_MONTHS` returns the last day of the target month: 29 February in the leap year 2024.',
    ),
  },
  sql({
    id: 'ora-first-quarter-hires',
    difficulty: 3,
    prompt: text(
      'List the `name` of every employee hired in the first quarter (January to March) of any year.',
    ),
    ordered: false,
    answer: {
      referenceQuery: 'SELECT name FROM employees WHERE EXTRACT(MONTH FROM hired_on) <= 3',
    },
    hints: [
      'Extract the month from the hire date and compare it.',
      "`TO_CHAR(hired_on, 'Q')` gives the quarter.",
    ],
    explanation: text(
      "`EXTRACT(MONTH FROM hired_on) <= 3` keeps January to March of every year; `TO_CHAR(hired_on, 'Q') = '1'` is equivalent.",
    ),
  }),
  {
    id: 'ora-date-format-model',
    version: 1,
    difficulty: 4,
    format: 'fill-in-blank',
    prompt: text(
      'Complete the format model so hire dates are shown as day/month/year, like `05/03/2024`.',
    ),
    template: sqlCode("SELECT name, TO_CHAR(hired_on, '{{blank:fmt}}') AS hired\nFROM employees;"),
    answer: { blanks: { fmt: { accepted: ['DD/MM/YYYY'], caseSensitive: false } } },
    hints: ['Day of month is `DD`, month number is `MM`, four-digit year is `YYYY`.'],
    explanation: text(
      "`'DD/MM/YYYY'` prints the two-digit day, the two-digit month and the year, separated by slashes. Note `MM` is the month; `MI` would be minutes.",
    ),
  },
  sql({
    id: 'ora-years-of-service',
    difficulty: 5,
    prompt: text(
      "List every employee's `name` and how many complete years they had worked on 1 January 2025, in a column named `years`.",
    ),
    ordered: false,
    answer: {
      referenceQuery:
        "SELECT name, TRUNC(MONTHS_BETWEEN(DATE '2025-01-01', hired_on) / 12) AS years FROM employees",
      checkColumnNames: true,
    },
    hints: [
      '`MONTHS_BETWEEN(later, earlier)` returns the number of months, possibly with a fraction.',
      'Complete years means rounding down: `TRUNC`.',
    ],
    explanation: text(
      '`MONTHS_BETWEEN` divided by 12 gives years with a fraction; `TRUNC` keeps only the complete years. Subtracting the years alone would count partial years as full ones.',
    ),
  }),
];

/* ---------------------------------------------------------------- DECODE and CASE */

export const conditionalQuestions: readonly QuestionSource[] = [
  {
    id: 'ora-decode-output',
    version: 1,
    difficulty: 1,
    format: 'predict-output',
    prompt: text('What does this query return?'),
    code: sqlCode("SELECT DECODE(2, 1, 'one', 2, 'two', 'many') FROM dual;"),
    answer: { output: 'two' },
    hints: [
      '`DECODE(value, search1, result1, search2, result2, default)` compares the value with each search in turn.',
    ],
    explanation: text('The value 2 matches the second search, so the result is `two`.'),
  },
  sql({
    id: 'ora-case-band',
    difficulty: 2,
    prompt: text(
      "List every employee's `name` and a column named `band` that says `high` when the salary is at least 100000 and `standard` otherwise.",
    ),
    ordered: false,
    answer: {
      referenceQuery:
        "SELECT name, CASE WHEN salary >= 100000 THEN 'high' ELSE 'standard' END AS band FROM employees",
      checkColumnNames: true,
    },
    hints: ['A searched `CASE WHEN condition THEN … ELSE … END` handles ranges.'],
    explanation: text(
      '`CASE WHEN salary >= 100000 THEN … ELSE … END` checks a condition; `DECODE` only compares for equality, so it does not fit ranges.',
    ),
  }),
  {
    id: 'ora-decode-null',
    version: 1,
    difficulty: 3,
    format: 'multiple-choice',
    prompt: text(
      "What does `DECODE(commission, NULL, 'none', 'some')` return when commission is NULL?",
    ),
    options: [
      { id: 'a', text: "`'none'`" },
      { id: 'b', text: "`'some'`" },
      { id: 'c', text: 'NULL' },
      { id: 'd', text: 'An error' },
    ],
    selection: 'single',
    answer: { correct: ['a'] },
    hints: ['DECODE compares NULL with NULL differently from `=`.'],
    explanation: text(
      "`DECODE` treats two NULLs as equal, so it returns `'none'`. A `CASE commission WHEN NULL THEN …` would not match, because it compares with `=`; there you need `CASE WHEN commission IS NULL THEN …`.",
    ),
  },
  sql({
    id: 'ora-city-code',
    difficulty: 3,
    prompt: text(
      "List every department's `name` and a column named `city_code`: `BER` for Berlin, `LON` for London and `OTHER` for any other location.",
    ),
    ordered: false,
    answer: {
      referenceQuery:
        "SELECT name, DECODE(location, 'Berlin', 'BER', 'London', 'LON', 'OTHER') AS city_code FROM departments",
      checkColumnNames: true,
    },
    hints: ['Equality on one column maps well to `DECODE` (or a simple `CASE location WHEN …`).'],
    explanation: text(
      "`DECODE(location, 'Berlin', 'BER', 'London', 'LON', 'OTHER')` maps each value and falls back to the default for anything else.",
    ),
  }),
  {
    id: 'ora-decode-keyword',
    version: 1,
    difficulty: 4,
    format: 'fill-in-blank',
    prompt: text(
      "Complete the query: show `none` for employees without a department and `assigned` for the rest, using Oracle's compact comparison function.",
    ),
    template: sqlCode(
      "SELECT name, {{blank:fn}}(department_id, NULL, 'none', 'assigned') AS status\nFROM employees;",
    ),
    answer: { blanks: { fn: { accepted: ['DECODE'], caseSensitive: false } } },
    hints: ['Its arguments alternate: value, search, result, …, default.'],
    explanation: text(
      '`DECODE(department_id, NULL, …)` works because DECODE treats NULLs as equal. With `=` or a simple CASE, NULL would never match.',
    ),
  },
  sql({
    id: 'ora-conditional-count',
    difficulty: 5,
    prompt: text(
      'For each department that has employees, show `department_id`, the number of employees as `headcount`, and the number of them earning at least 100000 as `high_earners`. Order by `department_id`. Leave out employees without a department.',
    ),
    ordered: true,
    answer: {
      referenceQuery: `SELECT department_id,
       COUNT(*) AS headcount,
       COUNT(CASE WHEN salary >= 100000 THEN 1 END) AS high_earners
FROM employees
WHERE department_id IS NOT NULL
GROUP BY department_id
ORDER BY department_id`,
      checkColumnNames: true,
    },
    hints: [
      'Group by department and count all rows for the headcount.',
      '`COUNT(expression)` skips NULLs, so `COUNT(CASE WHEN … THEN 1 END)` counts only matching rows.',
    ],
    explanation: text(
      'A CASE without ELSE yields NULL for non-matching rows, and COUNT ignores NULLs. `SUM(CASE WHEN … THEN 1 ELSE 0 END)` or `SUM(DECODE(…))` work too, but return NULL-safe sums only with the ELSE branch.',
    ),
  }),
];

/* ---------------------------------------------------------------- hierarchical queries */

export const hierarchyQuestions: readonly QuestionSource[] = [
  {
    id: 'ora-prior-meaning',
    version: 1,
    difficulty: 1,
    format: 'multiple-choice',
    prompt: text('In `CONNECT BY PRIOR id = manager_id`, what does `PRIOR id` refer to?'),
    options: [
      { id: 'a', text: 'The `id` of the parent row: the row found at the previous level' },
      { id: 'b', text: 'The `id` of the previous row in the result, in output order' },
      { id: 'c', text: 'The smallest `id` in the table' },
      { id: 'd', text: 'The `id` the row had before the last update' },
    ],
    selection: 'single',
    answer: { correct: ['a'] },
    hints: ['A hierarchical query walks from parents to children.'],
    explanation: text(
      "`PRIOR` marks the parent side of the relationship. `PRIOR id = manager_id` means: children are the rows whose `manager_id` equals the parent's `id`.",
    ),
  },
  {
    id: 'ora-connect-by-level-output',
    version: 1,
    difficulty: 2,
    format: 'predict-output',
    prompt: text('What does this query return?'),
    code: sqlCode('SELECT MAX(LEVEL) FROM dual CONNECT BY LEVEL <= 4;'),
    answer: { output: '4' },
    hints: ['`CONNECT BY LEVEL <= n` on DUAL generates n rows, numbered by LEVEL.'],
    explanation: text(
      'A common Oracle idiom: `CONNECT BY LEVEL <= 4` on the one-row DUAL table produces rows with LEVEL 1 to 4, so the maximum is 4.',
    ),
  },
  sql({
    id: 'ora-hierarchy-levels',
    difficulty: 2,
    prompt: text(
      "Starting from the employee who has no manager, list every employee's `name` and their level in the management hierarchy as `lvl` (the top is level 1).",
    ),
    ordered: false,
    answer: {
      referenceQuery: `SELECT name, LEVEL AS lvl
FROM employees
START WITH manager_id IS NULL
CONNECT BY PRIOR id = manager_id`,
      checkColumnNames: true,
    },
    hints: [
      '`START WITH` picks the root rows.',
      "`CONNECT BY PRIOR id = manager_id` finds each row's direct reports; `LEVEL` is the depth.",
    ],
    explanation: text(
      'The query starts at the employee without a manager and repeatedly adds their reports. `LEVEL` is 1 for the root, 2 for direct reports, and so on.',
    ),
  }),
  sql({
    id: 'ora-level-three',
    difficulty: 3,
    prompt: text(
      'List the `name` of every employee exactly three levels down from the top of the hierarchy (the top is level 1, so these are level 3).',
    ),
    ordered: false,
    answer: {
      referenceQuery: `SELECT name
FROM employees
WHERE LEVEL = 3
START WITH manager_id IS NULL
CONNECT BY PRIOR id = manager_id`,
    },
    hints: ['Build the hierarchy as before, then filter on `LEVEL`.'],
    explanation: text(
      'A `WHERE` clause in a hierarchical query filters rows after the hierarchy is built, so `WHERE LEVEL = 3` keeps the third level without cutting the tree short.',
    ),
  }),
  {
    id: 'ora-prior-keyword',
    version: 1,
    difficulty: 4,
    format: 'fill-in-blank',
    prompt: text('Complete the query so it walks from each manager down to their reports.'),
    template: sqlCode(
      'SELECT name, LEVEL\nFROM employees\nSTART WITH manager_id IS NULL\nCONNECT BY {{blank:kw}} id = manager_id;',
    ),
    answer: { blanks: { kw: { accepted: ['PRIOR'], caseSensitive: false } } },
    hints: ['One keyword marks which side of the condition belongs to the parent row.'],
    explanation: text(
      "`PRIOR id = manager_id` makes the parent's `id` match the child's `manager_id`. Writing `id = PRIOR manager_id` would walk upward instead.",
    ),
  },
  sql({
    id: 'ora-management-chain',
    difficulty: 5,
    prompt: text(
      "List every employee's `name` and their management chain from the top as `chain`, written like `/Top Name/Manager Name/Employee Name`. Order the result by `chain`.",
    ),
    ordered: true,
    answer: {
      referenceQuery: `SELECT name, SYS_CONNECT_BY_PATH(name, '/') AS chain
FROM employees
START WITH manager_id IS NULL
CONNECT BY PRIOR id = manager_id
ORDER BY chain`,
      checkColumnNames: true,
    },
    hints: [
      'Build the hierarchy with `START WITH` and `CONNECT BY PRIOR`.',
      "`SYS_CONNECT_BY_PATH(column, '/')` joins the values from the root to the current row.",
    ],
    explanation: text(
      "`SYS_CONNECT_BY_PATH(name, '/')` concatenates every name on the path from the root, each preceded by `/`. Sorting by the path lists each manager just before their reports.",
    ),
  }),
];
