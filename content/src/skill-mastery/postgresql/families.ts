import type { QuestionDifficulty, QuestionSource } from '@pracstack/content-model';
import { choice, family, type FamilyQuestion } from '../family';
import { text } from '../helpers';
import { companyDb } from './company-db';

/**
 * PostgreSQL question families against the company database
 * (`departments`, `employees`). Every variant's reference query is executed
 * at build time on the sample data and both hidden datasets; the build fails
 * if a query errors, and warns if the hidden data could not catch an answer
 * hard-coded from the sample (content.spec.ts turns that warning into a test
 * failure for this track).
 */

interface SqlVariant {
  readonly key: string;
  /** The task, in Markdown-ish inline text. */
  readonly task: string;
  readonly query: string;
  /** Extra sentence for the explanation, specific to this variant. */
  readonly why?: string;
}

const sqlFamily = (
  id: string,
  difficulty: QuestionDifficulty,
  options: {
    readonly ordered: boolean;
    readonly hints: readonly string[];
    /** The general explanation of the concept, shared by every variant. */
    readonly concept: string;
  },
  variants: readonly SqlVariant[],
): QuestionSource[] =>
  family(id, variants, (v): FamilyQuestion => ({
    difficulty,
    format: 'sql-query',
    dialect: 'postgresql',
    database: companyDb,
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

// ---------------------------------------------------------------- SELECT and WHERE

export const selectWhereFamilies: readonly QuestionSource[] = [
  ...sqlFamily(
    'pg-select-columns',
    1,
    {
      ordered: false,
      hints: ['List the columns after `SELECT`, separated by commas, then the table after `FROM`.'],
      concept: '`SELECT` chooses the columns; `FROM` names the table. Every row is returned.',
    },
    [
      {
        key: 'name-title',
        task: 'List the `name` and `title` of every employee.',
        query: 'SELECT name, title FROM employees',
      },
      {
        key: 'name-hired',
        task: 'List the `name` and `hired_on` date of every employee.',
        query: 'SELECT name, hired_on FROM employees',
      },
      {
        key: 'title-salary',
        task: 'List the `title` and `salary` of every employee.',
        query: 'SELECT title, salary FROM employees',
      },
      {
        key: 'departments',
        task: 'List the `name` and `location` of every department.',
        query: 'SELECT name, location FROM departments',
      },
      {
        key: 'name-department',
        task: 'List the `name` and `department_id` of every employee.',
        query: 'SELECT name, department_id FROM employees',
      },
    ],
  ),
  ...sqlFamily(
    'pg-where-equals',
    2,
    {
      ordered: false,
      hints: ["Filter with `WHERE column = value`. Text goes in single quotes, numbers don't."],
      concept:
        '`WHERE` keeps only the rows for which the condition is true. `=` compares the whole value.',
    },
    [
      {
        key: 'contractor',
        task: 'List the `name` of every employee whose `title` is `Contractor`.',
        query: "SELECT name FROM employees WHERE title = 'Contractor'",
      },
      {
        key: 'support-engineer',
        task: 'List the `name` and `salary` of every `Support Engineer`.',
        query: "SELECT name, salary FROM employees WHERE title = 'Support Engineer'",
      },
      {
        key: 'berlin',
        task: 'List the `name` of every department located in `Berlin`.',
        query: "SELECT name FROM departments WHERE location = 'Berlin'",
      },
      {
        key: 'department-1',
        task: 'List the `name` of every employee in department `1`.',
        query: 'SELECT name FROM employees WHERE department_id = 1',
      },
    ],
  ),
  ...sqlFamily(
    'pg-where-compare',
    2,
    {
      ordered: false,
      hints: ['Use `>`, `<`, `>=` or `<=`. Dates compare like numbers: earlier is smaller.'],
      concept:
        'Comparison operators work on numbers, dates and text. "More than" is `>`; "at least" is `>=`.',
    },
    [
      {
        key: 'over-100k',
        task: 'List the `name` of every employee who earns more than 100,000.',
        query: 'SELECT name FROM employees WHERE salary > 100000',
      },
      {
        key: 'under-70k',
        task: 'List the `name` and `salary` of every employee who earns less than 70,000.',
        query: 'SELECT name, salary FROM employees WHERE salary < 70000',
      },
      {
        key: 'hired-since-2021',
        task: 'List the `name` of every employee hired on or after 1 January 2021.',
        query: "SELECT name FROM employees WHERE hired_on >= DATE '2021-01-01'",
      },
    ],
  ),
  ...sqlFamily(
    'pg-where-in',
    3,
    {
      ordered: false,
      hints: ['`column IN (a, b, c)` is short for `column = a OR column = b OR column = c`.'],
      concept: '`IN` tests a value against a list.',
    },
    [
      {
        key: 'titles',
        task: 'List the `name` of every employee whose `title` is `Engineer` or `Contractor`.',
        query: "SELECT name FROM employees WHERE title IN ('Engineer', 'Contractor')",
      },
      {
        key: 'departments',
        task: 'List the `name` of every employee in department `2` or `3`.',
        query: 'SELECT name FROM employees WHERE department_id IN (2, 3)',
      },
    ],
  ),
  ...sqlFamily(
    'pg-where-between',
    3,
    {
      ordered: false,
      hints: ['`BETWEEN low AND high` includes both ends.'],
      concept: '`x BETWEEN a AND b` means `x >= a AND x <= b`: both limits are included.',
    },
    [
      {
        key: 'salary',
        task: 'List the `name` of every employee who earns from 70,000 to 100,000 (inclusive).',
        query: 'SELECT name FROM employees WHERE salary BETWEEN 70000 AND 100000',
      },
      {
        key: 'hired',
        task: 'List the `name` of every employee hired in 2019 or 2020.',
        query:
          "SELECT name FROM employees WHERE hired_on BETWEEN DATE '2019-01-01' AND DATE '2020-12-31'",
      },
    ],
  ),
  ...sqlFamily(
    'pg-where-like',
    3,
    {
      ordered: false,
      hints: ['In `LIKE` patterns, `%` matches any run of characters (including none).'],
      concept:
        '`LIKE` matches text against a pattern: `%` is any sequence of characters, `_` exactly one. It is case-sensitive in PostgreSQL; `ILIKE` is not.',
    },
    [
      {
        key: 'title-contains',
        task: 'List the `name` and `title` of every employee whose title contains the word `Engineer` anywhere.',
        query: "SELECT name, title FROM employees WHERE title LIKE '%Engineer%'",
      },
      {
        key: 'name-starts',
        task: 'List the `name` of every employee whose name starts with `A`.',
        query: "SELECT name FROM employees WHERE name LIKE 'A%'",
      },
      {
        key: 'title-ends',
        task: 'List the `name` of every employee whose title ends with `Lead`.',
        query: "SELECT name FROM employees WHERE title LIKE '%Lead'",
      },
    ],
  ),
  ...sqlFamily(
    'pg-where-not-null',
    3,
    {
      ordered: false,
      hints: ['`= NULL` is never true. Test for missing values with `IS NULL` / `IS NOT NULL`.'],
      concept: 'NULL means "unknown", so it can only be tested with `IS NULL` or `IS NOT NULL`.',
    },
    [
      {
        key: 'has-department',
        task: 'List the `name` of every employee who belongs to a department.',
        query: 'SELECT name FROM employees WHERE department_id IS NOT NULL',
      },
      {
        key: 'no-department',
        task: 'List the `name` and `title` of every employee without a department.',
        query: 'SELECT name, title FROM employees WHERE department_id IS NULL',
      },
    ],
  ),
  ...sqlFamily(
    'pg-where-and-or',
    4,
    {
      ordered: false,
      hints: [
        '`AND` binds more tightly than `OR`.',
        'Use parentheses to make the grouping explicit.',
      ],
      concept:
        '`AND` is evaluated before `OR`, so `a OR b AND c` means `a OR (b AND c)`. Parentheses make the intent explicit.',
    },
    [
      {
        key: 'dept-or-cheap',
        task: 'List the `name` of every employee who is in department `1` or earns less than 60,000.',
        query: 'SELECT name FROM employees WHERE department_id = 1 OR salary < 60000',
      },
      {
        key: 'engineer-under',
        task: 'List the `name` of every employee whose title contains `Engineer` and who earns less than 110,000.',
        query: "SELECT name FROM employees WHERE title LIKE '%Engineer%' AND salary < 110000",
      },
      {
        key: 'precedence',
        task: 'List the `name` of every employee who is in department `2` or `3`, and earns more than 80,000.',
        query:
          'SELECT name FROM employees WHERE (department_id = 2 OR department_id = 3) AND salary > 80000',
        why: 'Without the parentheses, `department_id = 2 OR department_id = 3 AND salary > 80000` would return everyone in department 2, whatever they earn.',
      },
    ],
  ),
  ...sqlFamily(
    'pg-where-null-safe',
    5,
    {
      ordered: false,
      hints: [
        'What does `department_id <> 1` give when `department_id` is NULL?',
        'Add `OR department_id IS NULL`, or use `IS DISTINCT FROM`.',
      ],
      concept:
        'Comparisons with NULL are NULL, not true, so `<>` and `NOT IN` silently drop rows whose value is NULL. `IS DISTINCT FROM` treats NULL as an ordinary value.',
    },
    [
      {
        key: 'not-dept-1',
        task: 'List the `name` of every employee who is not in department `1`. Employees without a department count as "not in department 1".',
        query: 'SELECT name FROM employees WHERE department_id IS DISTINCT FROM 1',
      },
      {
        key: 'not-dept-3',
        task: 'List the `name` and `title` of every employee outside department `3`, including employees without a department.',
        query: 'SELECT name, title FROM employees WHERE department_id IS DISTINCT FROM 3',
      },
      {
        key: 'not-in-list',
        task: 'List the `name` of every employee who is in neither department `1` nor department `2`. Employees without a department must be included.',
        query:
          'SELECT name FROM employees WHERE department_id NOT IN (1, 2) OR department_id IS NULL',
      },
    ],
  ),
  ...choiceFamily(
    'pg-three-valued-logic',
    4,
    'SQL logic has three values: TRUE, FALSE and NULL (unknown).',
    [
      {
        key: 'null-equals-null',
        question: 'What does `NULL = NULL` evaluate to in PostgreSQL?',
        correct: '`NULL`',
        wrong: ['`TRUE`', '`FALSE`', 'An error'],
        why: 'Comparing two unknown values gives an unknown result: NULL. Use `IS NULL` or `IS NOT DISTINCT FROM` to compare with NULL.',
      },
      {
        key: 'null-or-true',
        question: 'What does `NULL OR TRUE` evaluate to?',
        correct: '`TRUE`',
        wrong: ['`NULL`', '`FALSE`', 'An error'],
        why: 'Whatever the unknown value is, `... OR TRUE` is true.',
      },
      {
        key: 'null-and-false',
        question: 'What does `NULL AND FALSE` evaluate to?',
        correct: '`FALSE`',
        wrong: ['`NULL`', '`TRUE`', 'An error'],
        why: 'Whatever the unknown value is, `... AND FALSE` is false.',
      },
      {
        key: 'not-null',
        question: 'What does `NOT (NULL = 1)` evaluate to?',
        correct: '`NULL`',
        wrong: ['`TRUE`', '`FALSE`', 'An error'],
        why: '`NULL = 1` is NULL, and the negation of unknown is still unknown.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- ORDER BY and LIMIT

export const orderLimitFamilies: readonly QuestionSource[] = [
  ...sqlFamily(
    'pg-order-ascending',
    1,
    {
      ordered: true,
      hints: ['Add `ORDER BY column` at the end. Ascending (smallest first) is the default.'],
      concept:
        '`ORDER BY` sorts the result; without it, PostgreSQL returns rows in no guaranteed order.',
    },
    [
      {
        key: 'salary',
        task: 'List the `name` and `salary` of every employee, lowest salary first.',
        query: 'SELECT name, salary FROM employees ORDER BY salary',
      },
      {
        key: 'hired',
        task: 'List the `name` of every employee, earliest hire date first.',
        query: 'SELECT name FROM employees ORDER BY hired_on',
      },
      {
        key: 'locations',
        task: 'List the `location` of every department in alphabetical order (a location appears once per department).',
        query: 'SELECT location FROM departments ORDER BY location',
      },
    ],
  ),
  ...sqlFamily(
    'pg-order-descending',
    2,
    {
      ordered: true,
      hints: ['`DESC` after a column sorts it largest (or latest) first.'],
      concept: '`ORDER BY column DESC` reverses the order.',
    },
    [
      {
        key: 'newest',
        task: 'List the `name` and `hired_on` of every employee, most recently hired first.',
        query: 'SELECT name, hired_on FROM employees ORDER BY hired_on DESC',
      },
      {
        key: 'z-to-a',
        task: 'List every employee `name` in reverse alphabetical order (Z to A).',
        query: 'SELECT name FROM employees ORDER BY name DESC',
      },
    ],
  ),
  ...sqlFamily(
    'pg-limit-top',
    2,
    {
      ordered: true,
      hints: ['Sort first with `ORDER BY`, then keep the first rows with `LIMIT n`.'],
      concept:
        '`LIMIT n` keeps the first n rows of the sorted result. Without `ORDER BY`, "the first rows" are arbitrary.',
    },
    [
      {
        key: 'top-3-paid',
        task: 'List the `name` of the three highest-paid employees, highest first.',
        query: 'SELECT name FROM employees ORDER BY salary DESC LIMIT 3',
      },
      {
        key: 'first-2-hired',
        task: 'List the `name` and `hired_on` of the two longest-serving employees (earliest hired first).',
        query: 'SELECT name, hired_on FROM employees ORDER BY hired_on LIMIT 2',
      },
      {
        key: 'lowest-paid',
        task: 'Show the `name` and `salary` of the lowest-paid employee.',
        query: 'SELECT name, salary FROM employees ORDER BY salary LIMIT 1',
      },
    ],
  ),
  ...sqlFamily(
    'pg-order-two-columns',
    3,
    {
      ordered: true,
      hints: ['List several sort keys separated by commas; later keys break ties in earlier ones.'],
      concept:
        'With `ORDER BY a, b`, rows are sorted by `a`, and rows with the same `a` are sorted by `b`. Each key can have its own `ASC`/`DESC`.',
    },
    [
      {
        key: 'title-name',
        task: 'List the `title` and `name` of every employee, sorted by title, then by name.',
        query: 'SELECT title, name FROM employees ORDER BY title, name',
      },
      {
        key: 'department-salary',
        task: 'List the `department_id`, `name` and `salary` of every employee, by department (ascending), and highest salary first within a department.',
        query:
          'SELECT department_id, name, salary FROM employees ORDER BY department_id, salary DESC',
      },
    ],
  ),
  ...sqlFamily(
    'pg-offset',
    3,
    {
      ordered: true,
      hints: ['`OFFSET n` skips the first n rows; combine it with `LIMIT`.'],
      concept:
        '`LIMIT m OFFSET n` skips n rows and returns the next m, which is how results are paged.',
    },
    [
      {
        key: 'second-highest',
        task: 'Show the `name` and `salary` of the employee with the second-highest salary.',
        query: 'SELECT name, salary FROM employees ORDER BY salary DESC LIMIT 1 OFFSET 1',
      },
      {
        key: 'page-2',
        task: 'Employee names are shown in alphabetical order, three per page. List the `name`s on page 2.',
        query: 'SELECT name FROM employees ORDER BY name LIMIT 3 OFFSET 3',
      },
    ],
  ),
  ...sqlFamily(
    'pg-order-nulls-placement',
    4,
    {
      ordered: true,
      hints: [
        'PostgreSQL sorts NULL as larger than any value. `NULLS FIRST` / `NULLS LAST` override that.',
      ],
      concept:
        'By default NULLs come last in ascending order and first in descending order. `NULLS FIRST` and `NULLS LAST` choose explicitly.',
    },
    [
      {
        key: 'nulls-first',
        task: 'List the `name` and `department_id` of every employee, by department ascending, with employees without a department first; then by name.',
        query: 'SELECT name, department_id FROM employees ORDER BY department_id NULLS FIRST, name',
      },
      {
        key: 'desc-nulls-last',
        task: 'List the `name` and `department_id` of every employee, by department descending, with employees without a department last; then by name.',
        query:
          'SELECT name, department_id FROM employees ORDER BY department_id DESC NULLS LAST, name',
      },
    ],
  ),
  ...sqlFamily(
    'pg-order-expression',
    4,
    {
      ordered: true,
      hints: ['You can sort by an expression, such as a function of a column.'],
      concept: '`ORDER BY` accepts any expression, not only column names.',
    },
    [
      {
        key: 'name-length',
        task: 'List every employee `name`, shortest name first; names of equal length in alphabetical order.',
        query: 'SELECT name FROM employees ORDER BY length(name), name',
      },
      {
        key: 'monthly',
        task: 'List the `name` of every employee by monthly salary (`salary / 12`), highest first.',
        query: 'SELECT name FROM employees ORDER BY salary / 12 DESC',
      },
    ],
  ),
  ...sqlFamily(
    'pg-distinct-on',
    5,
    {
      ordered: false,
      hints: [
        '`DISTINCT ON (column)` keeps the first row of each group…',
        '…where "first" is decided by `ORDER BY`, which must start with the same column.',
      ],
      concept:
        "`DISTINCT ON (key)` is PostgreSQL's way to keep one row per key: the first in the `ORDER BY` order. Window functions or a correlated subquery also work.",
    },
    [
      {
        key: 'top-paid',
        task: 'For each `department_id` (including employees without a department), show the department and the `name` of its highest-paid employee.',
        query:
          'SELECT DISTINCT ON (department_id) department_id, name FROM employees ORDER BY department_id, salary DESC',
      },
      {
        key: 'newest',
        task: 'For each `department_id` (including employees without a department), show the department and the `name` of its most recently hired employee.',
        query:
          'SELECT DISTINCT ON (department_id) department_id, name FROM employees ORDER BY department_id, hired_on DESC',
      },
    ],
  ),
  ...choiceFamily(
    'pg-order-pitfalls',
    5,
    'Think about what SQL guarantees, not what usually happens.',
    [
      {
        key: 'limit-without-order',
        question: 'What does `SELECT name FROM employees LIMIT 3` return?',
        correct: 'Any three rows; which ones is not guaranteed',
        wrong: [
          'The first three rows inserted',
          'The three rows with the lowest `id`',
          'The first three names alphabetically',
        ],
        why: 'Without `ORDER BY`, the database may return rows in any order, so `LIMIT` picks arbitrary rows. Always sort before limiting.',
      },
      {
        key: 'order-by-position',
        question:
          'In `SELECT name, salary FROM employees ORDER BY 2 DESC`, what does `2` refer to?',
        correct: 'The second column of the result, `salary`',
        wrong: [
          'The number 2, so the order is unchanged',
          'The second row',
          'The column with id 2',
        ],
        why: 'A number in `ORDER BY` refers to a result column by position. It works, but naming the column is clearer.',
      },
      {
        key: 'alias-in-where',
        question:
          'Which clause can use a column alias defined in the `SELECT` list (for example `salary / 12 AS monthly`)?',
        correct: '`ORDER BY`',
        wrong: ['`WHERE`', '`GROUP BY` only', 'None of them'],
        why: '`ORDER BY` runs after `SELECT`, so it can see aliases. `WHERE` runs before `SELECT` and cannot.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- GROUP BY and HAVING

export const groupByFamilies: readonly QuestionSource[] = [
  ...sqlFamily(
    'pg-aggregate-whole-table',
    1,
    {
      ordered: false,
      hints: ['Aggregate functions such as `max`, `min` and `sum` turn many rows into one value.'],
      concept:
        'Without `GROUP BY`, an aggregate function summarizes the whole table into a single row.',
    },
    [
      {
        key: 'max-salary',
        task: 'Show the highest `salary` of any employee.',
        query: 'SELECT max(salary) FROM employees',
      },
      {
        key: 'earliest-hire',
        task: 'Show the earliest `hired_on` date of any employee.',
        query: 'SELECT min(hired_on) FROM employees',
      },
      {
        key: 'total-salary',
        task: 'Show the total of all salaries.',
        query: 'SELECT sum(salary) FROM employees',
      },
    ],
  ),
  ...sqlFamily(
    'pg-aggregate-per-group',
    2,
    {
      ordered: false,
      hints: ['Put the grouping column in both `SELECT` and `GROUP BY`.'],
      concept:
        '`GROUP BY` splits the rows into groups; each aggregate is computed per group. NULL keys form a group of their own.',
    },
    [
      {
        key: 'count-title',
        task: 'For each `title`, show the title and how many employees have it.',
        query: 'SELECT title, count(*) FROM employees GROUP BY title',
      },
      {
        key: 'max-department',
        task: 'For each `department_id` (including employees without a department), show the department and its highest salary.',
        query: 'SELECT department_id, max(salary) FROM employees GROUP BY department_id',
      },
      {
        key: 'sum-department',
        task: 'For each `department_id` (including employees without a department), show the department and the total of its salaries.',
        query: 'SELECT department_id, sum(salary) FROM employees GROUP BY department_id',
      },
    ],
  ),
  ...sqlFamily(
    'pg-count-variants',
    3,
    {
      ordered: false,
      hints: [
        '`count(*)` counts rows; `count(column)` counts non-NULL values; `count(DISTINCT column)` counts different values.',
      ],
      concept:
        'The three forms of `count` answer different questions; only `count(*)` counts every row.',
    },
    [
      {
        key: 'with-department',
        task: 'Show how many employees belong to a department, using a single aggregate.',
        query: 'SELECT count(department_id) FROM employees',
      },
      {
        key: 'distinct-titles',
        task: 'Show how many different job titles there are.',
        query: 'SELECT count(DISTINCT title) FROM employees',
      },
    ],
  ),
  ...sqlFamily(
    'pg-having-filter',
    3,
    {
      ordered: false,
      hints: ['`WHERE` filters rows before grouping; `HAVING` filters groups after aggregating.'],
      concept:
        'Conditions on aggregates belong in `HAVING`, because they only exist after grouping.',
    },
    [
      {
        key: 'busy-departments',
        task: 'List the `department_id` of every department with more than one employee (ignore employees without a department).',
        query:
          'SELECT department_id FROM employees WHERE department_id IS NOT NULL GROUP BY department_id HAVING count(*) > 1',
      },
      {
        key: 'expensive-titles',
        task: 'List each `title` whose salaries add up to more than 100,000, with that total.',
        query:
          'SELECT title, sum(salary) FROM employees GROUP BY title HAVING sum(salary) > 100000',
      },
    ],
  ),
  ...sqlFamily(
    'pg-group-joined',
    4,
    {
      ordered: false,
      hints: ['Join first, then group by a column of the joined table.'],
      concept:
        'You can group by any column of the joined rows, such as the department name or location.',
    },
    [
      {
        key: 'per-name',
        task: 'For each department that has employees, show the department `name` and its number of employees.',
        query:
          'SELECT d.name, count(*) FROM employees e JOIN departments d ON d.id = e.department_id GROUP BY d.name',
      },
      {
        key: 'per-location',
        task: 'For each `location` with at least one employee, show the location and the highest salary there.',
        query:
          'SELECT d.location, max(e.salary) FROM employees e JOIN departments d ON d.id = e.department_id GROUP BY d.location',
      },
    ],
  ),
  ...sqlFamily(
    'pg-aggregate-filter',
    4,
    {
      ordered: false,
      hints: ['`count(*) FILTER (WHERE condition)` counts only the rows matching the condition.'],
      concept:
        "PostgreSQL's `FILTER` clause applies a condition to one aggregate, so several counts fit in one row. `sum(CASE WHEN … THEN 1 ELSE 0 END)` works everywhere.",
    },
    [
      {
        key: 'high-earners',
        task: 'In one row, show the total number of employees and the number earning more than 100,000, in that order.',
        query: 'SELECT count(*), count(*) FILTER (WHERE salary > 100000) FROM employees',
      },
      {
        key: 'recent-hires',
        task: 'For each `department_id` (including employees without a department), show the department and how many of its employees were hired in 2020 or later.',
        query:
          "SELECT department_id, count(*) FILTER (WHERE hired_on >= DATE '2020-01-01') FROM employees GROUP BY department_id",
      },
    ],
  ),
  ...sqlFamily(
    'pg-group-include-empty',
    5,
    {
      ordered: false,
      hints: [
        'A department without employees has no rows in `employees`. Which join keeps it?',
        'With a `LEFT JOIN`, `count(*)` counts the NULL row too. Count a column of `employees` instead.',
      ],
      concept:
        'Start from `departments` and `LEFT JOIN` the employees; `count(e.id)` ignores the NULLs of unmatched departments, giving 0.',
    },
    [
      {
        key: 'count-per-department',
        task: 'For every department, including those without employees, show the department `name` and its number of employees.',
        query:
          'SELECT d.name, count(e.id) FROM departments d LEFT JOIN employees e ON e.department_id = d.id GROUP BY d.name',
      },
      {
        key: 'count-per-location',
        task: 'For every `location`, including those without employees, show the location and its number of employees.',
        query:
          'SELECT d.location, count(e.id) FROM departments d LEFT JOIN employees e ON e.department_id = d.id GROUP BY d.location',
      },
    ],
  ),
  ...choiceFamily('pg-grouping-rules', 5, 'Every selected column must have one value per group.', [
    {
      key: 'ungrouped-column',
      question:
        'Why does `SELECT department_id, name, count(*) FROM employees GROUP BY department_id` fail?',
      correct: '`name` is neither grouped nor aggregated, so a group has no single value for it',
      wrong: [
        '`count(*)` cannot be used with `GROUP BY`',
        '`department_id` can be NULL',
        'Columns must be listed in the same order as in the table',
      ],
      why: 'Each output row stands for a whole group, so every selected column must be in `GROUP BY` or inside an aggregate.',
    },
    {
      key: 'where-vs-having',
      question: 'Which query lists departments whose average salary is above 80,000?',
      correct: '`... GROUP BY department_id HAVING avg(salary) > 80000`',
      wrong: [
        '`... WHERE avg(salary) > 80000 GROUP BY department_id`',
        '`... GROUP BY department_id WHERE avg(salary) > 80000`',
        '`... WHERE salary > 80000 GROUP BY department_id`',
      ],
      why: 'Aggregates are not available in `WHERE`, which filters individual rows before grouping. `HAVING` filters the groups.',
    },
    {
      key: 'avg-nulls',
      question: 'A column holds the values 10, 20 and NULL. What does `avg(column)` return?',
      correct: '15',
      wrong: ['10', 'NULL', '30'],
      why: 'Aggregate functions other than `count(*)` ignore NULLs: the average of 10 and 20 is 15.',
    },
  ]),
];

// ---------------------------------------------------------------- Joins

export const joinFamilies: readonly QuestionSource[] = [
  ...choiceFamily(
    'pg-join-reading',
    1,
    'The `ON` condition says which rows of the two tables belong together.',
    [
      {
        key: 'on',
        question:
          'In `FROM employees e JOIN departments d ON d.id = e.department_id`, what does the `ON` condition do?',
        correct:
          "Pairs each employee with the department whose `id` is the employee's `department_id`",
        wrong: [
          'Sorts employees by department',
          'Copies department rows into the employees table',
          'Keeps only departments with an `id`',
        ],
        why: 'A join combines rows of two tables; `ON` decides which pairs of rows match.',
      },
      {
        key: 'alias',
        question: 'In `FROM employees e JOIN departments d …`, what are `e` and `d`?',
        correct: 'Short aliases for the two tables, used as `e.name` and `d.name`',
        wrong: ['New tables', 'Column names', 'Join types'],
        why: 'Table aliases shorten column references and tell apart columns with the same name, such as `e.name` and `d.name`.',
      },
    ],
  ),
  ...sqlFamily(
    'pg-inner-join',
    2,
    {
      ordered: false,
      hints: [
        '`FROM employees e JOIN departments d ON d.id = e.department_id` pairs each employee with their department.',
      ],
      concept:
        'An inner join keeps only the pairs of rows that match the `ON` condition, so employees without a department are left out.',
    },
    [
      {
        key: 'location',
        task: 'List each employee `name` with the `location` of their department. Leave out employees without a department.',
        query:
          'SELECT e.name, d.location FROM employees e JOIN departments d ON d.id = e.department_id',
      },
      {
        key: 'title-department',
        task: 'List each employee `title` with the `name` of their department (as two columns: title, department name). Leave out employees without a department.',
        query:
          'SELECT e.title, d.name FROM employees e JOIN departments d ON d.id = e.department_id',
      },
    ],
  ),
  ...sqlFamily(
    'pg-left-join',
    3,
    {
      ordered: false,
      hints: ['A `LEFT JOIN` keeps every row of the left table, with NULLs where nothing matches.'],
      concept:
        '`LEFT JOIN` keeps all rows from the first table; columns from the second are NULL when there is no match.',
    },
    [
      {
        key: 'all-employees',
        task: 'List every employee `name` with the `name` of their department; employees without a department get NULL.',
        query:
          'SELECT e.name, d.name FROM employees e LEFT JOIN departments d ON d.id = e.department_id',
      },
      {
        key: 'all-departments',
        task: 'List every department `name` with the `name` of each of its employees; departments without employees appear once, with NULL.',
        query:
          'SELECT d.name, e.name FROM departments d LEFT JOIN employees e ON e.department_id = d.id',
      },
    ],
  ),
  ...sqlFamily(
    'pg-anti-join',
    3,
    {
      ordered: false,
      hints: [
        '`LEFT JOIN`, then keep the rows where the joined table has no match (its key `IS NULL`).',
      ],
      concept:
        'An anti-join finds rows without a partner: left join, then keep rows where the right side is NULL. `NOT EXISTS` does the same.',
    },
    [
      {
        key: 'empty-departments',
        task: 'List the `name` of every department that has no employees.',
        query:
          'SELECT d.name FROM departments d LEFT JOIN employees e ON e.department_id = d.id WHERE e.id IS NULL',
      },
      {
        key: 'empty-locations',
        task: 'List the `name` and `location` of every department without employees.',
        query:
          'SELECT d.name, d.location FROM departments d LEFT JOIN employees e ON e.department_id = d.id WHERE e.id IS NULL',
      },
    ],
  ),
  ...sqlFamily(
    'pg-join-filter',
    4,
    {
      ordered: false,
      hints: ['Join first, then filter with `WHERE` on a column of either table.'],
      concept: 'After a join, `WHERE` can use columns from both tables.',
    },
    [
      {
        key: 'high-earners-location',
        task: 'List the `name` of every employee who earns more than 90,000, with their department `location`.',
        query:
          'SELECT e.name, d.location FROM employees e JOIN departments d ON d.id = e.department_id WHERE e.salary > 90000',
      },
      {
        key: 'engineering',
        task: 'List the `name` and `salary` of every employee in the department named `Engineering`.',
        query:
          "SELECT e.name, e.salary FROM employees e JOIN departments d ON d.id = e.department_id WHERE d.name = 'Engineering'",
      },
    ],
  ),
  ...sqlFamily(
    'pg-self-join',
    5,
    {
      ordered: false,
      hints: [
        'Join `departments` to itself with two aliases.',
        'Use `a.id < b.id` so each pair appears once and no department pairs with itself.',
      ],
      concept:
        'A self-join compares rows of the same table. A condition like `a.id < b.id` avoids pairing a row with itself and listing each pair twice.',
    },
    [
      {
        key: 'same-location',
        task: 'List every pair of departments in the same `location`: the two department `name`s, each pair once (the department with the smaller `id` first).',
        query:
          'SELECT a.name, b.name FROM departments a JOIN departments b ON a.location = b.location AND a.id < b.id',
      },
      {
        key: 'same-title',
        task: 'List every pair of employees with the same `title`: the two employee `name`s, each pair once (the employee with the smaller `id` first).',
        query:
          'SELECT a.name, b.name FROM employees a JOIN employees b ON a.title = b.title AND a.id < b.id',
      },
    ],
  ),
  ...sqlFamily(
    'pg-left-join-condition',
    5,
    {
      ordered: false,
      hints: [
        'A condition on the right table in `WHERE` removes the unmatched rows a `LEFT JOIN` kept.',
        'Put that condition in the `ON` clause instead.',
      ],
      concept:
        'With `LEFT JOIN`, a filter on the right table belongs in `ON`: in `WHERE` it turns NULL rows away and the join behaves like an inner join.',
    },
    [
      {
        key: 'high-earners',
        task: 'For every department, including those with nobody matching, show the department `name` and how many of its employees earn more than 100,000.',
        query:
          'SELECT d.name, count(e.id) FROM departments d LEFT JOIN employees e ON e.department_id = d.id AND e.salary > 100000 GROUP BY d.name',
      },
      {
        key: 'recent',
        task: 'For every department, including those with nobody matching, show the department `name` and how many of its employees were hired in 2021 or later.',
        query:
          "SELECT d.name, count(e.id) FROM departments d LEFT JOIN employees e ON e.department_id = d.id AND e.hired_on >= DATE '2021-01-01' GROUP BY d.name",
      },
    ],
  ),
];

// ---------------------------------------------------------------- Functions and expressions (new skill)

export const functionFamilies: readonly QuestionSource[] = [
  ...choiceFamily(
    'pg-function-basics',
    1,
    'Each of these functions takes a value and returns a transformed value.',
    [
      {
        key: 'upper',
        question: "What does `upper('Ada')` return?",
        correct: "`'ADA'`",
        wrong: ["`'ada'`", "`'Ada'`", '`3`'],
        why: '`upper` converts text to upper case; `lower` does the opposite.',
      },
      {
        key: 'length',
        question: "What does `length('SQL')` return?",
        correct: '`3`',
        wrong: ["`'SQL'`", '`0`', '`NULL`'],
        why: '`length` returns the number of characters.',
      },
      {
        key: 'concat-null',
        question: "What does `'a' || NULL` return in PostgreSQL?",
        correct: '`NULL`',
        wrong: ["`'a'`", "`'aNULL'`", 'An error'],
        why: "Concatenating with NULL gives NULL. `concat('a', NULL)` ignores NULLs and returns `'a'`.",
      },
    ],
  ),
  ...sqlFamily(
    'pg-text-functions',
    2,
    {
      ordered: false,
      hints: ['`upper(x)`, `lower(x)` and `length(x)` work on text columns.'],
      concept: 'Functions in the `SELECT` list compute a new value for every row.',
    },
    [
      {
        key: 'upper-names',
        task: 'List every employee name in upper case.',
        query: 'SELECT upper(name) FROM employees',
      },
      {
        key: 'name-lengths',
        task: 'List every employee `name` together with its length in characters.',
        query: 'SELECT name, length(name) FROM employees',
      },
      {
        key: 'lower-locations',
        task: 'List the `name` of every department together with its location in lower case.',
        query: 'SELECT name, lower(location) FROM departments',
      },
    ],
  ),
  ...sqlFamily(
    'pg-concatenation',
    2,
    {
      ordered: false,
      hints: ["`||` joins text. Literal text goes in single quotes, e.g. `' – '`."],
      concept:
        '`||` concatenates text values; `concat(...)` does the same but treats NULL as empty text.',
    },
    [
      {
        key: 'name-title',
        task: 'List one label per employee in the form `Ada Lovelace (Engineer)`: the name, a space, and the title in parentheses.',
        query: "SELECT name || ' (' || title || ')' FROM employees",
      },
      {
        key: 'department-location',
        task: 'List one label per department in the form `Engineering - Berlin`: the name, space, hyphen, space, and location.',
        query: "SELECT name || ' - ' || location FROM departments",
      },
    ],
  ),
  ...sqlFamily(
    'pg-numeric-expressions',
    3,
    {
      ordered: false,
      hints: ['Arithmetic works on columns; `round(value, 2)` rounds to two decimal places.'],
      concept:
        'Expressions such as `salary / 12` are computed per row; `round` controls the precision.',
    },
    [
      {
        key: 'monthly',
        task: 'List every employee `name` with their monthly salary (`salary` divided by 12), rounded to 2 decimal places.',
        query: 'SELECT name, round(salary / 12, 2) FROM employees',
      },
      {
        key: 'raise',
        task: 'List every employee `name` with their salary after a 5% raise, rounded to whole units.',
        query: 'SELECT name, round(salary * 1.05) FROM employees',
      },
    ],
  ),
  ...sqlFamily(
    'pg-date-parts',
    3,
    {
      ordered: false,
      hints: ['`EXTRACT(YEAR FROM date)` returns the year as a number.'],
      concept:
        '`EXTRACT(field FROM date)` pulls out the year, month, day and so on. `date_part` is the same as a function.',
    },
    [
      {
        key: 'hire-year',
        task: 'List every employee `name` with the year they were hired.',
        query: 'SELECT name, EXTRACT(YEAR FROM hired_on) FROM employees',
      },
      {
        key: 'hired-2019',
        task: 'List the `name` of every employee hired in 2019, using the year of `hired_on`.',
        query: 'SELECT name FROM employees WHERE EXTRACT(YEAR FROM hired_on) = 2019',
      },
      {
        key: 'hire-month',
        task: 'List every employee `name` with the month number (1–12) they were hired in.',
        query: 'SELECT name, EXTRACT(MONTH FROM hired_on) FROM employees',
      },
    ],
  ),
  ...sqlFamily(
    'pg-case-expression',
    4,
    {
      ordered: false,
      hints: [
        "`CASE WHEN condition THEN 'a' WHEN … THEN 'b' ELSE 'c' END` picks the first matching branch.",
        'Order the branches from the most to the least specific.',
      ],
      concept:
        '`CASE` returns the result of the first `WHEN` whose condition is true, or the `ELSE` value.',
    },
    [
      {
        key: 'salary-band',
        task: 'List every employee `name` with a band: `high` for salaries of 100,000 or more, `medium` from 70,000, and `low` otherwise.',
        query:
          "SELECT name, CASE WHEN salary >= 100000 THEN 'high' WHEN salary >= 70000 THEN 'medium' ELSE 'low' END FROM employees",
      },
      {
        key: 'tenure',
        task: 'List every employee `name` with `veteran` if they were hired before 2020, and `newer` otherwise.',
        query:
          "SELECT name, CASE WHEN hired_on < DATE '2020-01-01' THEN 'veteran' ELSE 'newer' END FROM employees",
      },
    ],
  ),
  ...sqlFamily(
    'pg-coalesce',
    4,
    {
      ordered: false,
      hints: ['`coalesce(a, b)` returns the first argument that is not NULL.'],
      concept: '`coalesce` replaces NULLs with a fallback value.',
    },
    [
      {
        key: 'department-name',
        task: "List every employee `name` with their department's `name`, or `No department` when they have none.",
        query:
          "SELECT e.name, coalesce(d.name, 'No department') FROM employees e LEFT JOIN departments d ON d.id = e.department_id",
      },
      {
        key: 'department-id',
        task: 'List every employee `name` with their `department_id`, showing `0` instead of NULL.',
        query: 'SELECT name, coalesce(department_id, 0) FROM employees',
      },
    ],
  ),
  ...sqlFamily(
    'pg-case-aggregate',
    5,
    {
      ordered: false,
      hints: [
        'You can `GROUP BY` a `CASE` expression.',
        'Repeat the expression in `GROUP BY`, or group by its position (`GROUP BY 1`).',
      ],
      concept:
        'Grouping by a computed expression, such as a `CASE` band, counts rows per computed category.',
    },
    [
      {
        key: 'band-counts',
        task: 'Count employees per salary band: `high` (100,000 or more), `medium` (70,000 or more) and `low` (the rest). Show the band and the count; bands without employees can be left out.',
        query:
          "SELECT CASE WHEN salary >= 100000 THEN 'high' WHEN salary >= 70000 THEN 'medium' ELSE 'low' END AS band, count(*) FROM employees GROUP BY 1",
      },
      {
        key: 'year-counts',
        task: 'For each hire year that has employees, show the year and how many employees were hired that year.',
        query: 'SELECT EXTRACT(YEAR FROM hired_on), count(*) FROM employees GROUP BY 1',
      },
      {
        key: 'pivot',
        task: 'In one row, show three counts, in this order: employees in department `1`, employees in other departments, and employees without a department. Use `sum(CASE …)` or `count(*) FILTER (…)`.',
        query:
          'SELECT sum(CASE WHEN department_id = 1 THEN 1 ELSE 0 END), sum(CASE WHEN department_id <> 1 THEN 1 ELSE 0 END), sum(CASE WHEN department_id IS NULL THEN 1 ELSE 0 END) FROM employees',
        why: 'Each `sum(CASE …)` counts the rows its condition matches, so one pass over the table produces several counts side by side (a pivot). Note that `department_id <> 1` is not true for NULL, so the second count leaves out employees without a department.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Subqueries (new skill)

export const subqueryFamilies: readonly QuestionSource[] = [
  ...choiceFamily(
    'pg-subquery-reading',
    1,
    'The subquery is the complete SELECT written inside parentheses.',
    [
      {
        key: 'which-part',
        question:
          'In `SELECT name FROM employees WHERE salary > (SELECT avg(salary) FROM employees)`, what is the subquery?',
        correct: '`SELECT avg(salary) FROM employees`',
        wrong: ['`SELECT name FROM employees`', '`salary > avg(salary)`', '`WHERE salary`'],
        why: 'The query in parentheses is the subquery. Here it computes one value, the average salary, which the outer query compares each salary with.',
      },
      {
        key: 'runs-first',
        question:
          "In `SELECT name FROM employees WHERE department_id IN (SELECT id FROM departments WHERE location = 'Berlin')`, what does the subquery produce?",
        correct: 'The ids of the departments located in Berlin',
        wrong: [
          'The names of employees in Berlin',
          'A single number',
          'The number of departments in Berlin',
        ],
        why: 'The subquery selects `id` from `departments` where the location is Berlin; the outer query keeps employees whose `department_id` is in that list.',
      },
    ],
  ),
  ...choiceFamily(
    'pg-subquery-concepts',
    2,
    'A subquery is a complete `SELECT` inside another statement.',
    [
      {
        key: 'scalar',
        question:
          'Where can a subquery that returns exactly one value (a scalar subquery) be used?',
        correct: 'Anywhere a single value is allowed, such as in `WHERE salary > (…)`',
        wrong: ['Only in `FROM`', 'Only in `HAVING`', 'Nowhere: subqueries must return a table'],
        why: 'A scalar subquery acts like a single value, so it can appear in `SELECT`, `WHERE` and other expressions.',
      },
      {
        key: 'exists',
        question: 'What does `EXISTS (subquery)` test?',
        correct: 'Whether the subquery returns at least one row',
        wrong: [
          'Whether the subquery returns non-NULL values only',
          'Whether a table exists',
          'Whether the subquery returns exactly one row',
        ],
        why: '`EXISTS` is true as soon as the subquery produces any row; the selected values do not matter.',
      },
    ],
  ),
  ...sqlFamily(
    'pg-scalar-subquery',
    3,
    {
      ordered: false,
      hints: [
        'Compute the single value with a subquery in parentheses, e.g. `(SELECT avg(salary) FROM employees)`.',
      ],
      concept: 'A scalar subquery is computed once and compared with every row.',
    },
    [
      {
        key: 'above-average',
        task: 'List the `name` of every employee who earns more than the average salary.',
        query: 'SELECT name FROM employees WHERE salary > (SELECT avg(salary) FROM employees)',
      },
      {
        key: 'top-earner',
        task: 'Show the `name` of the employee with the highest salary, using a subquery for the maximum.',
        query: 'SELECT name FROM employees WHERE salary = (SELECT max(salary) FROM employees)',
      },
      {
        key: 'below-average',
        task: 'List the `name` and `salary` of every employee who earns less than the average salary.',
        query:
          'SELECT name, salary FROM employees WHERE salary < (SELECT avg(salary) FROM employees)',
      },
    ],
  ),
  ...sqlFamily(
    'pg-in-subquery',
    3,
    {
      ordered: false,
      hints: [
        '`department_id IN (SELECT id FROM departments WHERE …)` tests against every id the subquery returns.',
      ],
      concept: '`IN (subquery)` keeps rows whose value appears in the subquery result.',
    },
    [
      {
        key: 'berlin',
        task: 'List the `name` of every employee whose department is located in `Berlin`, using a subquery (no join).',
        query:
          "SELECT name FROM employees WHERE department_id IN (SELECT id FROM departments WHERE location = 'Berlin')",
      },
      {
        key: 'sales',
        task: 'List the `name` and `title` of every employee in the department named `Sales`, using a subquery (no join).',
        query:
          "SELECT name, title FROM employees WHERE department_id IN (SELECT id FROM departments WHERE name = 'Sales')",
      },
    ],
  ),
  ...sqlFamily(
    'pg-exists',
    4,
    {
      ordered: false,
      hints: [
        '`WHERE EXISTS (SELECT 1 FROM employees e WHERE e.department_id = d.id …)` checks each department.',
      ],
      concept:
        'A correlated `EXISTS` subquery refers to the outer row and is true when at least one inner row matches.',
    },
    [
      {
        key: 'staffed',
        task: 'List the `name` of every department that has at least one employee.',
        query:
          'SELECT d.name FROM departments d WHERE EXISTS (SELECT 1 FROM employees e WHERE e.department_id = d.id)',
      },
      {
        key: 'high-earner',
        task: 'List the `name` of every department with at least one employee earning more than 100,000.',
        query:
          'SELECT d.name FROM departments d WHERE EXISTS (SELECT 1 FROM employees e WHERE e.department_id = d.id AND e.salary > 100000)',
      },
      {
        key: 'recent-hire',
        task: 'List the `name` and `location` of every department that hired someone in 2021 or later.',
        query:
          "SELECT d.name, d.location FROM departments d WHERE EXISTS (SELECT 1 FROM employees e WHERE e.department_id = d.id AND e.hired_on >= DATE '2021-01-01')",
      },
    ],
  ),
  ...sqlFamily(
    'pg-not-exists',
    5,
    {
      ordered: false,
      hints: [
        '`NOT IN (SELECT department_id FROM employees)` fails here: what if that column contains NULL?',
        'Use `NOT EXISTS` with a correlated subquery.',
      ],
      concept:
        'If a `NOT IN` list contains NULL, `x NOT IN (…)` is never true, so it returns no rows. `NOT EXISTS` has no such trap.',
    },
    [
      {
        key: 'empty-departments',
        task: 'List the `name` of every department that has no employees, using a subquery (no join).',
        query:
          'SELECT d.name FROM departments d WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.department_id = d.id)',
      },
      {
        key: 'no-high-earner',
        task: 'List the `name` of every department in which nobody earns more than 100,000 (including departments without employees).',
        query:
          'SELECT d.name FROM departments d WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.department_id = d.id AND e.salary > 100000)',
      },
    ],
  ),
  ...sqlFamily(
    'pg-correlated-subquery',
    5,
    {
      ordered: false,
      hints: [
        'The subquery can refer to the outer row: `WHERE e2.department_id = e.department_id`.',
        'Employees without a department have no department average; they are not part of the answer.',
      ],
      concept:
        'A correlated subquery is evaluated for each outer row, so it can compare a row with its own group.',
    },
    [
      {
        key: 'top-per-department',
        task: 'List the `name` and `department_id` of the highest-paid employee in each department (employees without a department are excluded).',
        query:
          'SELECT e.name, e.department_id FROM employees e WHERE e.salary = (SELECT max(e2.salary) FROM employees e2 WHERE e2.department_id = e.department_id)',
      },
      {
        key: 'newest-per-department',
        task: 'List the `name` and `department_id` of the most recently hired employee in each department (employees without a department are excluded).',
        query:
          'SELECT e.name, e.department_id FROM employees e WHERE e.hired_on = (SELECT max(e2.hired_on) FROM employees e2 WHERE e2.department_id = e.department_id)',
      },
    ],
  ),
];
