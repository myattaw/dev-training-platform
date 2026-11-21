import type { SqlDatabase, SqlTable } from '@pracstack/content-model';

/**
 * The practice database for the Oracle SQL track (Oracle types and syntax).
 *
 * Employees form a management hierarchy (manager_id) for CONNECT BY, and
 * have an optional commission (NULL, and in a hidden dataset also 0, so NULL
 * handling is really tested). Hidden datasets use different names, values,
 * hierarchy depths and locations so answers hard-coded from the sample fail;
 * one has a name with an apostrophe. Within a dataset salaries, names and
 * hire dates are unique, so ordered answers have no ties.
 */
const SCHEMA = `CREATE TABLE departments (
  id NUMBER PRIMARY KEY,
  name VARCHAR2(40) NOT NULL,
  location VARCHAR2(40) NOT NULL
);

CREATE TABLE employees (
  id NUMBER PRIMARY KEY,
  name VARCHAR2(60) NOT NULL,
  department_id NUMBER REFERENCES departments (id),
  manager_id NUMBER REFERENCES employees (id),
  title VARCHAR2(40) NOT NULL,
  salary NUMBER(10, 2) NOT NULL,
  commission NUMBER(10, 2),
  hired_on DATE NOT NULL
);`;

const DEPARTMENT_COLUMNS = ['id', 'name', 'location'];
const EMPLOYEE_COLUMNS = [
  'id',
  'name',
  'department_id',
  'manager_id',
  'title',
  'salary',
  'commission',
  'hired_on',
];

const dataset = (
  departments: (string | number)[][],
  employees: (string | number | null)[][],
): SqlTable[] => [
  { table: 'departments', columns: DEPARTMENT_COLUMNS, rows: departments },
  { table: 'employees', columns: EMPLOYEE_COLUMNS, rows: employees },
];

export const oracleCompanyDb: SqlDatabase = {
  id: 'oracle-company',
  schema: SCHEMA,
  sample: dataset(
    [
      [10, 'Engineering', 'Berlin'],
      [20, 'Sales', 'London'],
      [30, 'Support', 'Berlin'],
      [40, 'Research', 'Toronto'],
    ],
    [
      [1, 'Rosalind Franklin', 10, null, 'CEO', 180000, null, '2015-03-02'],
      [2, 'Ada Lovelace', 10, 1, 'Engineering Manager', 140000, null, '2016-07-18'],
      [3, 'Alan Turing', 10, 2, 'Engineer', 98000, null, '2021-01-11'],
      [4, 'Katherine Johnson', 10, 2, 'Engineer', 104500, null, '2019-04-01'],
      [5, 'Barbara Liskov', 20, 1, 'Sales Director', 120000, 15000, '2017-02-20'],
      [6, 'Ken Thompson', 20, 5, 'Account Manager', 72000, 8000, '2020-06-01'],
      [7, 'Hedy Lamarr', 20, 5, 'Account Manager', 69500, null, '2022-09-12'],
      [8, 'Margaret Hamilton', 30, 1, 'Support Lead', 82000, null, '2018-11-30'],
      [9, 'Linus Torvalds', 30, 8, 'Support Engineer', 65000, null, '2022-03-07'],
      [10, 'Dennis Ritchie', null, 1, 'Contractor', 50000, null, '2023-05-02'],
    ],
  ),
  hidden: [
    dataset(
      [
        [10, 'Platform', 'Lisbon'],
        [20, 'Marketing', 'Madrid'],
        [30, 'Operations', 'Lisbon'],
      ],
      [
        [1, 'Mae Jemison', 10, null, 'CEO', 210000, null, '2012-01-09'],
        [2, 'Tim Berners-Lee', 10, 1, 'Engineering Manager', 150500, null, '2014-05-26'],
        [3, 'Radia Perlman', 10, 2, 'Engineer', 112000, null, '2016-10-03'],
        [4, 'Edsger Dijkstra', 10, 3, 'Engineer', 99500, null, '2020-08-17'],
        [5, 'Frances Allen', 20, 1, 'Marketing Director', 126000, 22000, '2013-12-02'],
        [6, "John O'Neil", 20, 5, 'Account Manager', 71000, 0, '2021-02-15'],
        [7, 'Sophie Wilson', 30, 1, 'Operations Lead', 88000, null, '2015-06-30'],
        [8, 'Guido van Rossum', null, 7, 'Contractor', 47000, null, '2024-01-08'],
        [9, 'Shafi Goldwasser', 30, 7, 'Analyst', 77500, 5000, '2019-09-23'],
      ],
    ),
    dataset(
      [
        [1, 'Engineering', 'Oslo'],
        [2, 'Sales', 'Oslo'],
        [3, 'Legal', 'Bergen'],
        [4, 'Design', 'Tromso'],
      ],
      [
        [1, 'Joan Clarke', 1, null, 'CEO', 195000, null, '2010-02-01'],
        [2, 'Bjarne Stroustrup', 1, 1, 'Engineer', 101000, null, '2018-03-19'],
        [3, 'Anita Borg', 2, 1, 'Sales Director', 133000, 18000, '2011-11-11'],
        [4, 'Charles Babbage', 2, 3, 'Account Manager', 68000, 7000, '2019-07-01'],
        [5, 'Annie Easley', 3, 1, 'Counsel', 121000, null, '2016-04-04'],
        [6, 'Claude Shannon', null, 5, 'Contractor', 55000, null, '2022-12-12'],
        [7, 'Donald Knuth', 2, 4, 'Account Manager', 70500, null, '2023-08-28'],
      ],
    ),
  ],
};
