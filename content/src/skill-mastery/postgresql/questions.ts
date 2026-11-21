import type { QuestionSource, SqlQuestionSource } from '@pracstack/content-model';
import { text } from '../helpers';
import { companyDb } from './company-db';

type SqlQuestion = Omit<SqlQuestionSource, 'format' | 'dialect' | 'database' | 'version'>;

/** A SQL question against the company database. */
const sql = (q: SqlQuestion): QuestionSource => ({
  version: 1,
  format: 'sql-query',
  dialect: 'postgresql',
  database: companyDb,
  ...q,
});

export const selectWhereQuestions: readonly QuestionSource[] = [
  sql({
    id: 'pg-select-name-salary',
    difficulty: 1,
    prompt: text('List the `name` and `salary` of every employee.'),
    ordered: false,
    answer: { referenceQuery: 'SELECT name, salary FROM employees' },
    hints: ['Name the columns you want after `SELECT`, then the table after `FROM`.'],
    explanation: text(
      '`SELECT name, salary FROM employees` returns those two columns for every row. Without `ORDER BY`, the row order is not guaranteed, so it is not graded here.',
    ),
  }),
  sql({
    id: 'pg-where-title',
    difficulty: 2,
    prompt: text('List the `name` of every employee whose `title` is exactly `Engineer`.'),
    ordered: false,
    answer: { referenceQuery: "SELECT name FROM employees WHERE title = 'Engineer'" },
    hints: ["Filter rows with `WHERE`. Text values go in single quotes: `'Engineer'`."],
    explanation: text(
      "`WHERE title = 'Engineer'` keeps only rows whose title matches exactly. `Lead Engineer` does not match, because `=` compares the whole value.",
    ),
  }),
  {
    id: 'pg-where-is-null',
    version: 1,
    difficulty: 3,
    format: 'multiple-choice',
    prompt: text(
      'Which condition finds employees who have no department (`department_id` is NULL)?',
    ),
    options: [
      { id: 'a', text: '`WHERE department_id IS NULL`' },
      { id: 'b', text: '`WHERE department_id = NULL`' },
      { id: 'c', text: '`WHERE department_id = 0`' },
      { id: 'd', text: "`WHERE department_id = ''`" },
    ],
    selection: 'single',
    answer: { correct: ['a'] },
    hints: ['Comparing anything with NULL using `=` gives NULL, not true.'],
    explanation: text(
      'NULL means "unknown", so `department_id = NULL` is never true. Use `IS NULL` (or `IS NOT NULL`) to test for missing values.',
    ),
  },
  sql({
    id: 'pg-where-and',
    difficulty: 4,
    prompt: text(
      'List the `name` of every employee who earns at least 90,000 and was hired before 1 January 2021.',
    ),
    ordered: false,
    answer: {
      referenceQuery:
        "SELECT name FROM employees WHERE salary >= 90000 AND hired_on < DATE '2021-01-01'",
    },
    hints: [
      'Combine two conditions with `AND`.',
      "Dates can be compared with a literal such as `'2021-01-01'`.",
    ],
    explanation: text(
      '`salary >= 90000 AND hired_on < \'2021-01-01\'` keeps rows where both conditions are true. "At least" includes 90,000 itself, so use `>=`.',
    ),
  }),
  sql({
    id: 'pg-where-null-pitfall',
    difficulty: 5,
    prompt: text(
      'List the `name` of every employee who is not in department `2`. Employees without a department count as "not in department 2".',
    ),
    ordered: false,
    answer: {
      referenceQuery: 'SELECT name FROM employees WHERE department_id IS DISTINCT FROM 2',
    },
    hints: [
      'What does `department_id <> 2` evaluate to when `department_id` is NULL?',
      'Either add `OR department_id IS NULL`, or use `IS DISTINCT FROM`.',
    ],
    explanation: text(
      '`department_id <> 2` is NULL (not true) when `department_id` is NULL, so those employees disappear. `department_id IS DISTINCT FROM 2` treats NULL as an ordinary value; `department_id <> 2 OR department_id IS NULL` also works.',
    ),
  }),
];

export const orderLimitQuestions: readonly QuestionSource[] = [
  sql({
    id: 'pg-order-by-name',
    difficulty: 1,
    prompt: text('List every employee `name` in alphabetical order.'),
    ordered: true,
    answer: { referenceQuery: 'SELECT name FROM employees ORDER BY name' },
    hints: ['`ORDER BY` sorts the result; ascending is the default.'],
    explanation: text('`ORDER BY name` sorts text alphabetically (A to Z).'),
  }),
  sql({
    id: 'pg-order-by-desc',
    difficulty: 2,
    prompt: text('List the `name` and `salary` of every employee, highest salary first.'),
    ordered: true,
    answer: { referenceQuery: 'SELECT name, salary FROM employees ORDER BY salary DESC' },
    hints: ['Add `DESC` after the column to sort in descending order.'],
    explanation: text('`ORDER BY salary DESC` puts the largest values first.'),
  }),
  {
    id: 'pg-order-nulls',
    version: 1,
    difficulty: 3,
    format: 'multiple-choice',
    prompt: text(
      'In PostgreSQL, where do NULL values appear when you sort with `ORDER BY department_id` (ascending)?',
    ),
    options: [
      { id: 'a', text: 'Last' },
      { id: 'b', text: 'First' },
      { id: 'c', text: 'They are left out of the result' },
      { id: 'd', text: 'The query fails' },
    ],
    selection: 'single',
    answer: { correct: ['a'] },
    hints: ['PostgreSQL treats NULL as larger than any other value when sorting.'],
    explanation: text(
      'PostgreSQL sorts NULL as if it were larger than every value: last for ascending order, first for descending. Use `NULLS FIRST` or `NULLS LAST` to choose explicitly.',
    ),
  },
  sql({
    id: 'pg-order-two-keys',
    difficulty: 4,
    prompt: text(
      'List `department_id`, `name` and `salary` of every employee, sorted by `department_id` (ascending), and within each department by `salary` (highest first). Employees without a department come last.',
    ),
    ordered: true,
    answer: {
      referenceQuery:
        'SELECT department_id, name, salary FROM employees ORDER BY department_id ASC NULLS LAST, salary DESC',
    },
    hints: [
      '`ORDER BY` accepts several columns, separated by commas; each can have its own direction.',
    ],
    explanation: text(
      '`ORDER BY department_id, salary DESC` sorts by department first and uses salary only to order rows within the same department. Ascending order already puts NULL last in PostgreSQL; `NULLS LAST` makes it explicit.',
    ),
  }),
  sql({
    id: 'pg-limit-offset',
    difficulty: 5,
    prompt: text('Show the `name` of the employee with the second-highest salary.'),
    ordered: false,
    answer: { referenceQuery: 'SELECT name FROM employees ORDER BY salary DESC LIMIT 1 OFFSET 1' },
    hints: ['Sort by salary, then skip one row and take one.'],
    explanation: text(
      '`ORDER BY salary DESC LIMIT 1 OFFSET 1` skips the highest-paid employee and returns the next one. Without `ORDER BY`, `LIMIT` would return an arbitrary row.',
    ),
  }),
];

export const groupByQuestions: readonly QuestionSource[] = [
  sql({
    id: 'pg-count-all',
    difficulty: 1,
    prompt: text('How many employees are there? Return a single number.'),
    ordered: false,
    answer: { referenceQuery: 'SELECT count(*) FROM employees' },
    hints: ['`count(*)` counts rows.'],
    explanation: text(
      '`SELECT count(*) FROM employees` returns one row with the number of rows in the table.',
    ),
  }),
  {
    id: 'pg-having-concept',
    version: 1,
    difficulty: 2,
    format: 'multiple-choice',
    prompt: text('Which clause filters groups after they have been aggregated with `GROUP BY`?'),
    options: [
      { id: 'a', text: '`HAVING`' },
      { id: 'b', text: '`WHERE`' },
      { id: 'c', text: '`ORDER BY`' },
      { id: 'd', text: '`LIMIT`' },
    ],
    selection: 'single',
    answer: { correct: ['a'] },
    hints: ['`WHERE` runs before grouping, on individual rows.'],
    explanation: text(
      '`WHERE` filters rows before they are grouped; `HAVING` filters the groups afterwards, so it can use aggregates such as `count(*) > 1`.',
    ),
  },
  sql({
    id: 'pg-count-per-department',
    difficulty: 3,
    prompt: text(
      'For each `department_id` (including employees without a department), return the `department_id` and the number of employees.',
    ),
    ordered: false,
    answer: {
      referenceQuery: 'SELECT department_id, count(*) FROM employees GROUP BY department_id',
    },
    hints: [
      '`GROUP BY department_id` makes one group per department, and `count(*)` counts each group.',
    ],
    explanation: text(
      '`GROUP BY department_id` puts rows with the same department into one group; NULL forms its own group. `count(*)` is then computed per group.',
    ),
  }),
  sql({
    id: 'pg-avg-rounded',
    difficulty: 4,
    prompt: text(
      'For each department, return the `department_id` and the average salary rounded to 2 decimal places. Leave out employees without a department.',
    ),
    ordered: false,
    answer: {
      referenceQuery:
        'SELECT department_id, round(avg(salary), 2) FROM employees WHERE department_id IS NOT NULL GROUP BY department_id',
    },
    hints: [
      '`avg(salary)` computes the average; `round(value, 2)` rounds it.',
      'Filter out NULL departments with `WHERE` before grouping.',
    ],
    explanation: text(
      '`WHERE department_id IS NOT NULL` removes the employees without a department before grouping; `round(avg(salary), 2)` averages each group.',
    ),
  }),
  sql({
    id: 'pg-having-sum',
    difficulty: 5,
    prompt: text(
      'List each department that has more than one employee, with its total salary cost. Return columns named `department_id` and `total_salary`. Ignore employees without a department.',
    ),
    ordered: false,
    answer: {
      referenceQuery:
        'SELECT department_id, sum(salary) AS total_salary FROM employees WHERE department_id IS NOT NULL GROUP BY department_id HAVING count(*) > 1',
      checkColumnNames: true,
    },
    hints: [
      'Use `AS total_salary` to name a column.',
      'Filter the groups with `HAVING count(*) > 1`.',
    ],
    explanation: text(
      '`GROUP BY department_id` with `sum(salary) AS total_salary` totals each department, and `HAVING count(*) > 1` keeps only departments with more than one employee.',
    ),
  }),
];

export const joinQuestions: readonly QuestionSource[] = [
  {
    id: 'pg-inner-join-concept',
    version: 1,
    difficulty: 1,
    format: 'multiple-choice',
    prompt: text(
      'What does `employees JOIN departments ON departments.id = employees.department_id` return?',
    ),
    options: [
      { id: 'a', text: 'Only employees that have a matching department' },
      { id: 'b', text: 'Every employee, with NULL department columns when there is no match' },
      { id: 'c', text: 'Every combination of employee and department' },
      { id: 'd', text: 'Only departments that have no employees' },
    ],
    selection: 'single',
    answer: { correct: ['a'] },
    hints: ['`JOIN` on its own means `INNER JOIN`.'],
    explanation: text(
      '`JOIN` is an inner join: rows appear only when the `ON` condition matches. Employees without a department (NULL) are left out; a `LEFT JOIN` would keep them.',
    ),
  },
  sql({
    id: 'pg-join-names',
    difficulty: 2,
    prompt: text(
      'List each employee name together with the name of their department (two columns: employee name, department name). Leave out employees without a department.',
    ),
    ordered: false,
    answer: {
      referenceQuery:
        'SELECT e.name, d.name FROM employees e JOIN departments d ON d.id = e.department_id',
    },
    hints: [
      'Join `employees` to `departments` on `departments.id = employees.department_id`.',
      'Table aliases (`employees e`) keep the query short.',
    ],
    explanation: text(
      'An inner join matches each employee to the department with the same id. Employees whose `department_id` is NULL have no match, so they are left out automatically.',
    ),
  }),
  sql({
    id: 'pg-join-where-location',
    difficulty: 3,
    prompt: text(
      'List the `name` of every employee who works in a department located in `Berlin`.',
    ),
    ordered: false,
    answer: {
      referenceQuery:
        "SELECT e.name FROM employees e JOIN departments d ON d.id = e.department_id WHERE d.location = 'Berlin'",
    },
    hints: ['The location is in `departments`; join first, then filter with `WHERE`.'],
    explanation: text(
      "Joining makes the department's columns available on each employee row, so `WHERE d.location = 'Berlin'` can filter on them.",
    ),
  }),
  sql({
    id: 'pg-left-join-count',
    difficulty: 4,
    prompt: text(
      'List every department `name` with its number of employees. Include departments that have no employees (with a count of 0).',
    ),
    ordered: false,
    answer: {
      referenceQuery:
        'SELECT d.name, count(e.id) FROM departments d LEFT JOIN employees e ON e.department_id = d.id GROUP BY d.id, d.name',
    },
    hints: [
      'An inner join would drop departments without employees. Which join keeps every department?',
      '`count(e.id)` counts only matched employees; `count(*)` would count 1 for an empty department.',
    ],
    explanation: text(
      '`LEFT JOIN` keeps every department, with NULL employee columns when there is no match. `count(e.id)` ignores those NULLs, so empty departments get 0.',
    ),
  }),
  sql({
    id: 'pg-above-department-average',
    difficulty: 5,
    prompt: text(
      'List the `name` of every employee who earns more than the average salary of their own department. Employees without a department are not included.',
    ),
    ordered: false,
    answer: {
      referenceQuery: `SELECT e.name
FROM employees e
JOIN (
  SELECT department_id, avg(salary) AS avg_salary
  FROM employees
  GROUP BY department_id
) a ON a.department_id = e.department_id
WHERE e.salary > a.avg_salary`,
    },
    hints: [
      'First compute the average salary per department, for example in a subquery or a `WITH` clause.',
      'Then join each employee to their department average and compare.',
    ],
    explanation: text(
      'A subquery (or CTE) computes each department average; joining it back to `employees` on `department_id` lets each row compare its salary with its own department average. A correlated subquery in the `WHERE` clause works too.',
    ),
  }),
];
