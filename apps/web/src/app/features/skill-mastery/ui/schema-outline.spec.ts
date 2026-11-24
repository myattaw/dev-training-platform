import { describe, expect, it } from 'vitest';
import { outlineSchema } from './schema-outline';

describe('outlineSchema', () => {
  it('reads PostgreSQL tables, types, keys and references', () => {
    const tables = outlineSchema(`CREATE TABLE departments (
  id integer PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE employees (
  id integer PRIMARY KEY,
  department_id integer REFERENCES departments (id),
  salary numeric(10, 2) NOT NULL,
  hired_on date NOT NULL DEFAULT CURRENT_DATE
);`);
    expect(tables.map((t) => t.name)).toEqual(['departments', 'employees']);
    expect(tables[1]?.columns).toEqual([
      { name: 'id', type: 'integer', primaryKey: true, notNull: true },
      {
        name: 'department_id',
        type: 'integer',
        primaryKey: false,
        notNull: false,
        references: 'departments.id',
      },
      { name: 'salary', type: 'numeric(10, 2)', primaryKey: false, notNull: true },
      { name: 'hired_on', type: 'date', primaryKey: false, notNull: true },
    ]);
  });

  it('reads Oracle types and table-level keys', () => {
    const [t] = outlineSchema(`CREATE TABLE enrollments (
  student_id NUMBER NOT NULL,
  course_id NUMBER NOT NULL,
  grade VARCHAR2(2),
  PRIMARY KEY (student_id, course_id),
  FOREIGN KEY (course_id) REFERENCES courses (id)
);`);
    expect(t?.columns).toEqual([
      { name: 'student_id', type: 'NUMBER', primaryKey: true, notNull: true },
      {
        name: 'course_id',
        type: 'NUMBER',
        primaryKey: true,
        notNull: true,
        references: 'courses.id',
      },
      { name: 'grade', type: 'VARCHAR2(2)', primaryKey: false, notNull: false },
    ]);
  });

  it('reads SQL Server types, explicit NULL and self references', () => {
    const [t] = outlineSchema(`CREATE TABLE customers (
  customer_id INT PRIMARY KEY,
  name NVARCHAR(60) NOT NULL,
  total DECIMAL(10, 2) NULL,
  referred_by INT NULL REFERENCES customers (customer_id)
);`);
    expect(t?.columns).toEqual([
      { name: 'customer_id', type: 'INT', primaryKey: true, notNull: true },
      { name: 'name', type: 'NVARCHAR(60)', primaryKey: false, notNull: true },
      { name: 'total', type: 'DECIMAL(10, 2)', primaryKey: false, notNull: false },
      {
        name: 'referred_by',
        type: 'INT',
        primaryKey: false,
        notNull: false,
        references: 'customers.customer_id',
      },
    ]);
  });

  it('ignores text it does not understand instead of failing', () => {
    expect(outlineSchema('SELECT 1;')).toEqual([]);
    expect(outlineSchema('CREATE TABLE broken (id int')).toEqual([]);
  });
});
