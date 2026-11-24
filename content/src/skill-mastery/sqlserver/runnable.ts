import type { QuestionDifficulty, QuestionSource } from '@pracstack/content-model';
import { text } from '../helpers';
import { sqlServerShopDb } from './shop-db';

/*
 * Runnable T-SQL: the learner writes a query that runs on SQL Server against
 * the shop database (`customers`, `orders`). Every reference query is executed
 * on the sample data and both hidden datasets by
 * content/src/checks/sqlserver-questions.spec.ts, which fails on any error or
 * warning. On a server without a SQL Server engine these questions are not
 * served; the hand-reviewed questions of each skill still are.
 */

interface RunnableTask {
  readonly id: string;
  readonly difficulty: QuestionDifficulty;
  readonly task: string;
  readonly query: string;
  readonly ordered: boolean;
  /** The task names the result columns, so their names are graded. */
  readonly namesColumns?: boolean;
  readonly hints: readonly string[];
  readonly why: string;
}

const runnable = (t: RunnableTask): QuestionSource => ({
  version: 1,
  id: t.id,
  difficulty: t.difficulty,
  format: 'sql-query',
  dialect: 'sqlserver',
  database: sqlServerShopDb,
  prompt: text(t.task),
  ordered: t.ordered,
  answer: {
    referenceQuery: t.query,
    ...(t.namesColumns ? { checkColumnNames: true } : {}),
  },
  hints: [...t.hints],
  explanation: text(t.why, `One answer: \`${t.query}\``),
});

// ---------------------------------------------------------------- Filtering, sorting and NULLs

export const runnableQueryingTasks: readonly QuestionSource[] = [
  runnable({
    id: 'mssql-run-shipped-by-total',
    difficulty: 1,
    task: 'Return the `order_id` and `total` of every order whose `status` is `Shipped`, largest total first.',
    query: "SELECT order_id, total FROM orders WHERE status = 'Shipped' ORDER BY total DESC;",
    ordered: true,
    hints: ['Filter with `WHERE`, then sort with `ORDER BY ... DESC`.'],
    why: 'Filtering happens before sorting; `DESC` puts the largest value first.',
  }),
  runnable({
    id: 'mssql-run-top-three',
    difficulty: 2,
    task: 'Return the three most expensive orders that were not cancelled (`status` is not `Cancelled`): `order_id` and `total`, largest first.',
    query:
      "SELECT TOP (3) order_id, total FROM orders WHERE status <> 'Cancelled' ORDER BY total DESC;",
    ordered: true,
    hints: [
      '`TOP (n)` limits the rows; which rows count as the "top" ones is decided by `ORDER BY`.',
    ],
    why: '`TOP` without `ORDER BY` returns an arbitrary set of rows. With `ORDER BY total DESC`, `TOP (3)` returns the three largest totals.',
  }),
  runnable({
    id: 'mssql-run-page-two',
    difficulty: 2,
    task: 'A screen lists orders five per page, oldest `order_date` first. Return page 2: `order_id` and `order_date`.',
    query:
      'SELECT order_id, order_date FROM orders ORDER BY order_date OFFSET 5 ROWS FETCH NEXT 5 ROWS ONLY;',
    ordered: true,
    hints: [
      'Skip the first page with `OFFSET`, then take one page with `FETCH NEXT`.',
      '`OFFSET`/`FETCH` is part of the `ORDER BY` clause.',
    ],
    why: 'Page 2 skips the 5 rows of page 1 (`OFFSET 5 ROWS`) and takes the next 5 (`FETCH NEXT 5 ROWS ONLY`). A unique sort key keeps page boundaries stable.',
  }),
  runnable({
    id: 'mssql-run-missing-email',
    difficulty: 2,
    task: 'Return the `name` of every customer who has no email address (`email` is NULL).',
    query: 'SELECT name FROM customers WHERE email IS NULL;',
    ordered: false,
    hints: ['`email = NULL` is never true. Which operator tests for NULL?'],
    why: 'Comparing anything with NULL gives UNKNOWN, so `= NULL` matches no rows. `IS NULL` is the test for a missing value.',
  }),
  runnable({
    id: 'mssql-run-charged-amount',
    difficulty: 3,
    task: 'For every order return `order_id` and the amount charged in a column named `charged`: `total` minus `discount`, where a missing discount counts as 0.',
    query: 'SELECT order_id, total - ISNULL(discount, 0) AS charged FROM orders;',
    ordered: false,
    namesColumns: true,
    hints: [
      'What is `total - NULL`?',
      '`ISNULL(value, replacement)` or `COALESCE(value, replacement)` replaces NULL.',
    ],
    why: 'Arithmetic with NULL gives NULL, so `total - discount` is NULL for orders without a discount. `ISNULL(discount, 0)` (or `COALESCE`) turns NULL into 0 first.',
  }),
  runnable({
    id: 'mssql-run-size-label',
    difficulty: 3,
    task: 'Label every order by size in a column named `size`: `Large` when `total` is at least 150, `Medium` when it is at least 75, otherwise `Small`. Return `order_id` and `size`.',
    query:
      "SELECT order_id, CASE WHEN total >= 150 THEN 'Large' WHEN total >= 75 THEN 'Medium' ELSE 'Small' END AS size FROM orders;",
    ordered: false,
    namesColumns: true,
    hints: [
      'A searched `CASE` checks its `WHEN` conditions in order and stops at the first true one.',
      'Check the boundaries: is a total of exactly 150 `Large`?',
    ],
    why: '`CASE` returns the result of the first true `WHEN`, so test the largest threshold first. "At least" means `>=`, so 150 is `Large` and 75 is `Medium`.',
  }),
];

// ---------------------------------------------------------------- Joins and aggregation

export const runnableJoinTasks: readonly QuestionSource[] = [
  runnable({
    id: 'mssql-run-shipped-with-customer',
    difficulty: 2,
    task: "Return the `order_id` of every `Shipped` order together with the customer's `name`.",
    query:
      "SELECT o.order_id, c.name FROM orders AS o JOIN customers AS c ON c.customer_id = o.customer_id WHERE o.status = 'Shipped';",
    ordered: false,
    hints: ['Join `orders` to `customers` on `customer_id`.'],
    why: 'An inner join pairs each order with its customer; `WHERE` then keeps the shipped orders.',
  }),
  runnable({
    id: 'mssql-run-order-count',
    difficulty: 3,
    task: 'For every customer, including customers without orders, return `name` and their number of orders as `order_count`, ordered by `name`.',
    query:
      'SELECT c.name, COUNT(o.order_id) AS order_count FROM customers AS c LEFT JOIN orders AS o ON o.customer_id = c.customer_id GROUP BY c.customer_id, c.name ORDER BY c.name;',
    ordered: true,
    namesColumns: true,
    hints: [
      'An inner join drops customers without orders. Which join keeps them?',
      '`COUNT(*)` counts the NULL-extended row of a customer without orders; `COUNT(column)` does not.',
    ],
    why: 'The `LEFT JOIN` keeps every customer. A customer without orders gets one row with NULL order columns, so `COUNT(o.order_id)` gives 0 where `COUNT(*)` would wrongly give 1.',
  }),
  runnable({
    id: 'mssql-run-busy-cities',
    difficulty: 3,
    task: 'Return each `city` whose customers placed at least 2 orders that were not cancelled, with that number of orders as `orders`.',
    query:
      "SELECT c.city, COUNT(*) AS orders FROM customers AS c JOIN orders AS o ON o.customer_id = c.customer_id WHERE o.status <> 'Cancelled' GROUP BY c.city HAVING COUNT(*) >= 2;",
    ordered: false,
    namesColumns: true,
    hints: ['`WHERE` filters rows before grouping; `HAVING` filters groups after it.'],
    why: 'Cancelled orders are removed row by row in `WHERE`; the "at least 2" condition is about each group, so it belongs in `HAVING`.',
  }),
  runnable({
    id: 'mssql-run-pending-per-customer',
    difficulty: 4,
    task: 'For every customer return `name` and their number of `Pending` orders as `pending_orders`; customers without pending orders show 0.',
    query:
      "SELECT c.name, COUNT(o.order_id) AS pending_orders FROM customers AS c LEFT JOIN orders AS o ON o.customer_id = c.customer_id AND o.status = 'Pending' GROUP BY c.customer_id, c.name;",
    ordered: false,
    namesColumns: true,
    hints: [
      "A `WHERE o.status = 'Pending'` after a `LEFT JOIN` removes the customers whose order columns are NULL.",
      'Put the status condition in the `ON` clause instead.',
    ],
    why: 'In the `ON` clause the status condition only decides which orders match, so every customer is kept (with NULLs when nothing matches). In `WHERE`, it would turn the outer join back into an inner join and drop customers with 0 pending orders.',
  }),
  runnable({
    id: 'mssql-run-referrer',
    difficulty: 4,
    task: 'For every customer who was referred by another customer, return the customer as `customer` and the referring customer as `referrer` (their names).',
    query:
      'SELECT c.name AS customer, r.name AS referrer FROM customers AS c JOIN customers AS r ON r.customer_id = c.referred_by;',
    ordered: false,
    namesColumns: true,
    hints: ['Join `customers` to itself, with a different alias for each role.'],
    why: 'A self join uses the same table twice: `c` is the referred customer and `r` the referrer, matched on `r.customer_id = c.referred_by`. Customers without a referrer drop out of the inner join.',
  }),
  runnable({
    id: 'mssql-run-city-names',
    difficulty: 4,
    task: "For every `city`, return the city and its customers' names in one text column named `customers`, alphabetical and separated by a comma and a space (for example `Ben Carter, Chen Wei`).",
    query:
      "SELECT city, STRING_AGG(name, ', ') WITHIN GROUP (ORDER BY name) AS customers FROM customers GROUP BY city;",
    ordered: false,
    namesColumns: true,
    hints: [
      '`STRING_AGG(expression, separator)` concatenates the values of a group.',
      '`WITHIN GROUP (ORDER BY ...)` sets the order inside the list.',
    ],
    why: '`STRING_AGG` joins the names of each group with the separator. Without `WITHIN GROUP (ORDER BY name)` the order inside each list is not guaranteed.',
  }),
  runnable({
    id: 'mssql-run-latest-order-total',
    difficulty: 5,
    task: 'For every customer, return `name` and the `total` of their most recent order (latest `order_date`); customers without orders show NULL.',
    query:
      'SELECT c.name, o.total FROM customers AS c OUTER APPLY (SELECT TOP (1) total FROM orders WHERE orders.customer_id = c.customer_id ORDER BY order_date DESC) AS o;',
    ordered: false,
    hints: [
      '`APPLY` runs a table expression once per outer row, and it may use `TOP` and `ORDER BY`.',
      '`CROSS APPLY` drops customers for which it returns nothing; `OUTER APPLY` keeps them.',
    ],
    why: '`OUTER APPLY` runs the `TOP (1) ... ORDER BY order_date DESC` subquery for each customer and keeps customers without orders with NULL. A window function (`ROW_NUMBER`) with a `LEFT JOIN` works too.',
  }),
];

// ---------------------------------------------------------------- Subqueries, CTEs and window functions

export const runnableAdvancedTasks: readonly QuestionSource[] = [
  runnable({
    id: 'mssql-run-never-ordered',
    difficulty: 3,
    task: 'Return the `name` of every customer who has never placed an order.',
    query:
      'SELECT c.name FROM customers AS c WHERE NOT EXISTS (SELECT 1 FROM orders AS o WHERE o.customer_id = c.customer_id);',
    ordered: false,
    hints: ['A correlated `NOT EXISTS` checks, for each customer, that no matching order exists.'],
    why: '`NOT EXISTS` is true when the subquery finds no row for that customer. It is also safe with NULLs, unlike `NOT IN` over a column that can contain NULL.',
  }),
  runnable({
    id: 'mssql-run-biggest-order-each',
    difficulty: 4,
    task: 'For every customer with orders, return their most expensive order: `name`, `order_id` and `total`, ordered by `name`.',
    query:
      'WITH ranked AS (SELECT c.name, o.order_id, o.total, ROW_NUMBER() OVER (PARTITION BY o.customer_id ORDER BY o.total DESC) AS rn FROM orders AS o JOIN customers AS c ON c.customer_id = o.customer_id) SELECT name, order_id, total FROM ranked WHERE rn = 1 ORDER BY name;',
    ordered: true,
    hints: [
      "Number each customer's orders by total with `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)`.",
      'A window function cannot be used in `WHERE`; filter in an outer query or a CTE.',
    ],
    why: "`ROW_NUMBER` restarts at 1 for every customer (`PARTITION BY`), so `rn = 1` is each customer's largest order. Window functions are computed after `WHERE`, which is why the filter goes in the outer query.",
  }),
  runnable({
    id: 'mssql-run-running-total',
    difficulty: 4,
    task: 'Return every order in `order_date` order with `order_id`, `order_date`, `total` and `running_total`: the sum of the totals of all orders up to and including this one.',
    query:
      'SELECT order_id, order_date, total, SUM(total) OVER (ORDER BY order_date ROWS UNBOUNDED PRECEDING) AS running_total FROM orders ORDER BY order_date;',
    ordered: true,
    namesColumns: true,
    hints: [
      '`SUM(...) OVER (ORDER BY ...)` turns an aggregate into a running one.',
      'Say which rows the frame covers: `ROWS UNBOUNDED PRECEDING`.',
    ],
    why: 'An ordered window sums from the first row to the current one. `ROWS UNBOUNDED PRECEDING` makes the frame explicit; the default with `ORDER BY` is `RANGE`, which adds rows with the same date together and is slower.',
  }),
  runnable({
    id: 'mssql-run-change-from-previous',
    difficulty: 4,
    task: "For every order return `order_id`, `total` and `change`: the difference from the same customer's previous order (by `order_date`), or NULL for a customer's first order. Order by `order_id`.",
    query:
      'SELECT order_id, total, total - LAG(total) OVER (PARTITION BY customer_id ORDER BY order_date) AS change FROM orders ORDER BY order_id;',
    ordered: true,
    namesColumns: true,
    hints: [
      '`LAG(column)` reads a value from the previous row of the window.',
      'Partition by customer so one customer never compares with another.',
    ],
    why: "`LAG(total) OVER (PARTITION BY customer_id ORDER BY order_date)` is the customer's previous order total, NULL for their first order, so the difference is NULL there too.",
  }),
  runnable({
    id: 'mssql-run-referral-levels',
    difficulty: 5,
    task: "Customers referred by nobody are at level 0, the customers they referred at level 1, and so on. Return every customer's `name` and `level`, ordered by `level`, then `name`.",
    query:
      'WITH chain AS (SELECT customer_id, name, 0 AS level FROM customers WHERE referred_by IS NULL UNION ALL SELECT c.customer_id, c.name, chain.level + 1 FROM customers AS c JOIN chain ON c.referred_by = chain.customer_id) SELECT name, level FROM chain ORDER BY level, name;',
    ordered: true,
    namesColumns: true,
    hints: [
      'A recursive CTE has an anchor (the starting rows) and a recursive member joined to the CTE itself, combined with `UNION ALL`.',
      'Start from `referred_by IS NULL` and add 1 to the level at each step.',
    ],
    why: 'The anchor selects the level-0 customers; each recursion finds the customers referred by the previous level. It stops when a step finds no new rows. T-SQL needs `UNION ALL` here and has no `RECURSIVE` keyword.',
  }),
  runnable({
    id: 'mssql-run-monthly-revenue',
    difficulty: 5,
    task: "Monthly revenue: for every month with orders that were not cancelled, return the first day of the month as `month_start` (a date) and the sum of those orders' totals as `revenue`, ordered by month.",
    query:
      "SELECT DATEFROMPARTS(YEAR(order_date), MONTH(order_date), 1) AS month_start, SUM(total) AS revenue FROM orders WHERE status <> 'Cancelled' GROUP BY DATEFROMPARTS(YEAR(order_date), MONTH(order_date), 1) ORDER BY month_start;",
    ordered: true,
    namesColumns: true,
    hints: [
      'Group by the month itself, not by `MONTH(order_date)` alone: January 2025 and January 2026 are different months.',
      '`DATEFROMPARTS(year, month, 1)` or `DATETRUNC(month, order_date)` gives the first day of the month.',
    ],
    why: 'Grouping by `MONTH(order_date)` alone merges the same month of different years. `DATEFROMPARTS(YEAR(...), MONTH(...), 1)` (or `DATETRUNC(month, ...)` on SQL Server 2022) keeps the year and is a real date that sorts correctly.',
  }),
  runnable({
    id: 'mssql-run-city-rank',
    difficulty: 5,
    task: "Rank cities by the total of their customers' `Shipped` orders: return `city`, `shipped_total` and `city_rank` (1 for the highest total), ordered by `city_rank`.",
    query:
      "SELECT c.city, SUM(o.total) AS shipped_total, RANK() OVER (ORDER BY SUM(o.total) DESC) AS city_rank FROM customers AS c JOIN orders AS o ON o.customer_id = c.customer_id WHERE o.status = 'Shipped' GROUP BY c.city ORDER BY city_rank;",
    ordered: true,
    namesColumns: true,
    hints: [
      'Window functions run after `GROUP BY`, so they can rank an aggregate.',
      '`RANK() OVER (ORDER BY SUM(o.total) DESC)`',
    ],
    why: 'Grouping gives one row per city with `SUM(o.total)`; the window function then ranks those grouped rows. This is why `RANK() OVER (ORDER BY SUM(...))` is allowed in the same `SELECT`.',
  }),
];
