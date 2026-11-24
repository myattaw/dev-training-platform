import type { SqlDatabase, SqlTable } from '@pracstack/content-model';

/**
 * The practice database for runnable T-SQL questions (SQL Server types).
 *
 * Customers can be referred by another customer (`referred_by`, for self joins
 * and recursive CTEs); some customers have no orders and some no email, and
 * `discount` is optional (NULL, and in a hidden dataset also 0). Hidden
 * datasets use different names, cities, amounts, dates (one crosses a year
 * boundary) and referral depths, so answers hard-coded from the sample fail;
 * one has a name with an apostrophe and totals exactly on the CASE
 * boundaries. Within a dataset, names, order totals and order dates are
 * unique, so ordered answers have no ties.
 */
const SCHEMA = `CREATE TABLE customers (
  customer_id INT PRIMARY KEY,
  name NVARCHAR(60) NOT NULL,
  city NVARCHAR(40) NOT NULL,
  email NVARCHAR(80) NULL,
  referred_by INT NULL REFERENCES customers (customer_id)
);

CREATE TABLE orders (
  order_id INT PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers (customer_id),
  order_date DATE NOT NULL,
  status VARCHAR(12) NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  discount DECIMAL(10, 2) NULL
);`;

const CUSTOMER_COLUMNS = ['customer_id', 'name', 'city', 'email', 'referred_by'];
const ORDER_COLUMNS = ['order_id', 'customer_id', 'order_date', 'status', 'total', 'discount'];

const dataset = (
  customers: (string | number | null)[][],
  orders: (string | number | null)[][],
): SqlTable[] => [
  { table: 'customers', columns: CUSTOMER_COLUMNS, rows: customers },
  { table: 'orders', columns: ORDER_COLUMNS, rows: orders },
];

export const sqlServerShopDb: SqlDatabase = {
  id: 'sqlserver-shop',
  schema: SCHEMA,
  sample: dataset(
    [
      [1, 'Ana Silva', 'Lisbon', 'ana@example.com', null],
      [2, 'Ben Carter', 'London', null, 1],
      [3, 'Chen Wei', 'London', 'chen@example.com', 1],
      [4, 'Dara Okafor', 'Lagos', 'dara@example.com', 2],
      [5, 'Eva Novak', 'Prague', null, null],
      [6, 'Femi Adeyemi', 'Lagos', 'femi@example.com', 4],
      [7, 'Gus Berg', 'Oslo', 'gus@example.com', null],
      [8, 'Hana Sato', 'Osaka', null, 3],
    ],
    [
      [101, 1, '2025-01-05', 'Shipped', 120, null],
      [102, 1, '2025-01-19', 'Shipped', 75.5, 5],
      [103, 2, '2025-02-02', 'Pending', 210, null],
      [104, 3, '2025-02-14', 'Shipped', 49.99, null],
      [105, 3, '2025-03-01', 'Cancelled', 300, 30],
      [106, 3, '2025-03-08', 'Shipped', 158.25, 10],
      [107, 4, '2025-03-21', 'Shipped', 89, null],
      [108, 4, '2025-04-03', 'Pending', 132.4, null],
      [109, 5, '2025-04-17', 'Shipped', 260, 20],
      [110, 6, '2025-05-02', 'Cancelled', 18.75, null],
      [111, 6, '2025-05-20', 'Shipped', 97.1, null],
      [112, 1, '2025-06-11', 'Pending', 64.3, 4.3],
    ],
  ),
  hidden: [
    dataset(
      [
        [1, 'Iris Moreau', 'Paris', 'iris@example.com', null],
        [2, "Jon O'Hara", 'Dublin', null, 1],
        [3, 'Kofi Mensah', 'Accra', 'kofi@example.com', 2],
        [4, 'Lea Fischer', 'Paris', 'lea@example.com', 3],
        [5, 'Mo Haddad', 'Dublin', null, null],
        [6, 'Nia Brooks', 'Accra', null, null],
        [7, 'Omar Ali', 'Paris', 'omar@example.com', 5],
      ],
      [
        [201, 1, '2024-11-03', 'Shipped', 410, 0],
        [202, 2, '2024-11-17', 'Cancelled', 55, null],
        [203, 2, '2024-12-01', 'Shipped', 145.6, null],
        [204, 3, '2024-12-24', 'Pending', 99.99, 9.99],
        [205, 3, '2025-01-06', 'Shipped', 175, null],
        [206, 4, '2025-01-28', 'Shipped', 12.4, null],
        [207, 5, '2025-02-09', 'Pending', 230.75, 15],
        [208, 1, '2025-02-22', 'Pending', 88.8, null],
        [209, 4, '2025-03-15', 'Cancelled', 150, 25],
      ],
    ),
    dataset(
      [
        [1, 'Pia Lund', 'Bergen', 'pia@example.com', null],
        [2, 'Quinn Reyes', 'Manila', 'quinn@example.com', null],
        [3, 'Rui Costa', 'Bergen', null, 1],
        [4, 'Sara Haile', 'Manila', null, 2],
        [5, 'Tomas Kral', 'Bergen', 'tomas@example.com', 3],
        [6, 'Una Walsh', 'Cork', null, 5],
      ],
      [
        [301, 1, '2025-07-04', 'Shipped', 75, null],
        [302, 2, '2025-07-12', 'Shipped', 512.3, 50],
        [303, 3, '2025-07-30', 'Pending', 33.33, null],
        [304, 2, '2025-08-08', 'Shipped', 149.99, null],
        [305, 4, '2025-08-19', 'Cancelled', 260.4, null],
        [306, 5, '2025-09-01', 'Shipped', 81.25, 1.25],
        [307, 1, '2025-09-14', 'Pending', 199, null],
        [308, 3, '2025-10-02', 'Shipped', 64.1, null],
      ],
    ),
  ],
};
