import type { SqlDatabase, SqlTable } from '@pracstack/content-model';

/**
 * The practice database for the PostgreSQL track.
 *
 * Hidden datasets use different names, values and group sizes so that
 * answers hard-coded from the sample data fail. Within each dataset,
 * salaries, names and hire dates are unique, so ordered answers have no ties.
 * Each dataset contains an employee without a department (NULL), and one
 * hidden dataset has a name with an apostrophe.
 */
const SCHEMA = `CREATE TABLE departments (
  id integer PRIMARY KEY,
  name text NOT NULL,
  location text NOT NULL
);

CREATE TABLE employees (
  id integer PRIMARY KEY,
  name text NOT NULL,
  department_id integer REFERENCES departments (id),
  title text NOT NULL,
  salary numeric(10, 2) NOT NULL,
  hired_on date NOT NULL
);`;

const DEPARTMENT_COLUMNS = ['id', 'name', 'location'];
const EMPLOYEE_COLUMNS = ['id', 'name', 'department_id', 'title', 'salary', 'hired_on'];

const dataset = (
  departments: (string | number)[][],
  employees: (string | number | null)[][],
): SqlTable[] => [
  { table: 'departments', columns: DEPARTMENT_COLUMNS, rows: departments },
  { table: 'employees', columns: EMPLOYEE_COLUMNS, rows: employees },
];

export const companyDb: SqlDatabase = {
  id: 'company',
  schema: SCHEMA,
  sample: dataset(
    [
      [1, 'Engineering', 'Berlin'],
      [2, 'Sales', 'London'],
      [3, 'Support', 'Berlin'],
      [4, 'Research', 'Toronto'],
    ],
    [
      [1, 'Ada Lovelace', 1, 'Engineer', 120000, '2019-04-01'],
      [2, 'Grace Hopper', 1, 'Lead Engineer', 145000, '2017-09-15'],
      [3, 'Alan Turing', 1, 'Engineer', 98000, '2021-01-11'],
      [4, 'Ken Thompson', 2, 'Account Manager', 72000, '2020-06-01'],
      [5, 'Barbara Liskov', 2, 'Sales Director', 110000, '2018-02-20'],
      [6, 'Linus Torvalds', 3, 'Support Engineer', 65000, '2022-03-07'],
      [7, 'Margaret Hamilton', 3, 'Support Lead', 82000, '2019-11-30'],
      [8, 'Dennis Ritchie', null, 'Contractor', 50000, '2023-05-02'],
    ],
  ),
  hidden: [
    dataset(
      [
        [1, 'Engineering', 'Paris'],
        [2, 'Sales', 'Berlin'],
        [3, 'Support', 'Paris'],
        [4, 'Research', 'Oslo'],
      ],
      [
        [1, 'Edsger Dijkstra', 1, 'Engineer', 101000, '2018-08-08'],
        [2, 'Frances Allen', 1, 'Lead Engineer', 150500, '2016-03-03'],
        [3, 'John Backus', 2, 'Account Manager', 69000, '2021-10-10'],
        [4, 'Radia Perlman', 4, 'Researcher', 123000, '2020-01-20'],
        [5, 'Tim Berners-Lee', 3, 'Support Engineer', 61000, '2022-12-12'],
        [6, 'Hedy Lamarr', null, 'Contractor', 47000, '2023-02-14'],
      ],
    ),
    dataset(
      [
        [1, 'Engineering', 'Berlin'],
        [2, 'Sales', 'Berlin'],
        [3, 'Support', 'London'],
        [4, 'Research', 'London'],
      ],
      [
        [1, 'Bjarne Stroustrup', 1, 'Engineer', 105500, '2019-05-05'],
        [2, 'Guido van Rossum', 2, 'Sales Director', 99000, '2017-07-07'],
        [3, 'James Gosling', 2, 'Account Manager', 88000, '2020-09-09'],
        [4, 'Anders Hejlsberg', 2, 'Account Manager', 91000, '2018-12-01'],
        [5, 'Brendan Eich', 3, 'Support Lead', 76000, '2021-04-04'],
        [6, 'Yukihiro Matsumoto', 3, 'Support Engineer', 58000, '2023-06-06'],
        [7, "Sophie O'Neil", 1, 'Engineer', 97000, '2022-02-22'],
        [8, 'Joan Clarke', null, 'Contractor', 52000, '2024-01-15'],
      ],
    ),
  ],
};
