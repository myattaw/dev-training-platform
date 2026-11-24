import type { ScenarioSource } from '@pracstack/content-model';
import { cs, plain, sql, text } from '../skill-mastery/helpers';
import { blanks, challengeTask, multiple, predict, questionTask, single } from './builders';

const ID = 'employee-management-api';

export const employeeManagementApi: ScenarioSource = {
  id: ID,
  version: 1,
  title: 'Employee Management API',
  summary:
    'Replace an HR spreadsheet with a small ASP.NET Core API: validation, unique emails, pagination and the right status codes.',
  difficulty: 'medium',
  estimatedMinutes: 75,
  technologies: ['C#', 'ASP.NET Core', 'REST', 'SQL Server'],
  relatedSkillIds: [
    'aspnet-http-rest',
    'aspnet-minimal-apis-routing',
    'cs-linq',
    'cs-collections',
    'eng-testing',
    'mssql-transactions',
    'mssql-data-modeling',
  ],
  context: text(
    'Northwind Harbor Logistics (a fictional 900-person freight forwarder) still keeps its employee register in a shared spreadsheet. Last quarter two people were created twice with the same email address, which broke single sign-on provisioning, and a payroll export paged through the sheet and skipped rows.',
    'You join the People Systems team, which is replacing the spreadsheet with an internal service. The first milestone is the employee API that the new HR portal and the payroll export will call. Version 1 keeps data in memory; the next milestone moves it to SQL Server.',
  ),
  requirements: [
    {
      kind: 'list',
      items: [
        'Create, read, list (paged) and delete employees over HTTP, with the status codes REST clients expect.',
        'Validate input and report every invalid field at once, as validation problem details.',
        'Email addresses are unique, ignoring case, and must stay unique when two HR admins save at the same moment.',
        'Paging must be stable and predictable for the payroll export.',
      ],
    },
  ],
  acceptanceCriteria: [
    'The API passes the hidden HTTP integration tests (create, read, list, delete, validation, duplicates, paging).',
    'A duplicate email, in any letter case, returns 409 Conflict and creates nothing.',
    'Invalid paging parameters return 400; a page past the end returns 200 with no items.',
    'The plan for SQL Server enforces unique emails in the database, not only in application code.',
    'The test plan covers the rules that caused last quarter’s incidents.',
  ],
  artifacts: [
    {
      id: 'api-contract',
      title: 'Agreed API contract (excerpt)',
      description: 'What the HR portal team expects from the API.',
      snippet: plain(`POST /employees
Content-Type: application/json
{ "name": "Ada Lovelace", "email": "Ada@Example.com", "department": "Engineering" }

HTTP/1.1 201 Created
Location: /employees/1
{ "id": 1, "name": "Ada Lovelace", "email": "ada@example.com", "department": "Engineering" }

GET /employees?page=2&pageSize=2
HTTP/1.1 200 OK
{ "items": [ { "id": 3, ... } ], "page": 2, "pageSize": 2, "totalCount": 3 }

POST /employees  (same email, different case)
HTTP/1.1 409 Conflict`),
    },
    {
      id: 'target-table',
      title: 'Target SQL Server table (milestone 2)',
      description: 'The table the in-memory store will be replaced with.',
      snippet: sql(`CREATE TABLE dbo.Employees (
    EmployeeId  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Employees PRIMARY KEY,
    Name        NVARCHAR(100) NOT NULL,
    Email       NVARCHAR(256) NOT NULL,   -- stored trimmed and in lower case
    Department  NVARCHAR(20)  NOT NULL,
    CreatedAt   DATETIME2(0)  NOT NULL CONSTRAINT DF_Employees_CreatedAt DEFAULT SYSUTCDATETIME()
);
-- Database collation: SQL_Latin1_General_CP1_CI_AS (case-insensitive)`),
    },
    {
      id: 'incident-log',
      title: 'Incident notes from the spreadsheet era',
      description: 'Why the rules exist.',
      snippet:
        plain(`INC-2291  SSO provisioning failed: two rows with email "j.berg@nhl.example" and "J.Berg@nhl.example"
INC-2304  Payroll export skipped 14 employees: rows were deleted while the export read pages 3-9
INC-2310  Employee #212 re-created with id 212 after a delete; access badges pointed at the wrong person`),
    },
  ],
  tasks: [
    challengeTask(
      'build-the-api',
      'Build the employee API',
      'employee-api',
      'Implement the API in ASP.NET Core minimal APIs. The hidden tests send real HTTP requests to your endpoints and check status codes, headers and JSON.',
    ),
    questionTask(
      'status-codes',
      'Choose the status codes',
      blanks({
        id: `${ID}-status-codes`,
        difficulty: 2,
        prompt:
          'Complete the result helpers with the `Results` method each situation calls for (only the method name, for example `Ok`).',
        template: cs(`using Microsoft.AspNetCore.Http;

public static class EmployeeResults
{
    // GET /employees/42 when there is no employee 42
    public static IResult Missing() => Results.{{blank:missing}}();

    // POST /employees with an email that another employee already uses
    public static IResult Duplicate() => Results.{{blank:duplicate}}(new { error = "Email already in use." });

    // DELETE /employees/7 succeeded; there is nothing to return
    public static IResult Deleted() => Results.{{blank:deleted}}();
}`),
        accepted: { missing: ['NotFound'], duplicate: ['Conflict'], deleted: ['NoContent'] },
        caseSensitive: true,
        hint: 'A missing resource, a clash with the current state of a resource, and success without a body each have their own status code.',
        why: [
          {
            kind: 'list',
            items: [
              '`NotFound()` (404): the resource does not exist.',
              '`Conflict(...)` (409): the request is well-formed but conflicts with existing state (another employee owns the email). A 400 would tell the client its request was malformed, which it is not.',
              '`NoContent()` (204): the delete succeeded and there is no body. A 200 with an empty body works too, but 204 states the intent and is what the contract agreed.',
            ],
          },
        ],
      }),
    ),
    questionTask(
      'page-past-the-end',
      'Predict a page past the end',
      predict({
        id: `${ID}-page-past-the-end`,
        difficulty: 2,
        prompt: 'The list endpoint pages with `Skip` and `Take`. What does this program print?',
        code: cs(`int[] ids = [1, 2, 3, 4, 5, 6, 7];
int pageSize = 3;
foreach (var page in new[] { 3, 4 })
{
    var items = ids.Skip((page - 1) * pageSize).Take(pageSize).ToArray();
    Console.WriteLine($"page {page}: [{string.Join(",", items)}] total={ids.Length}");
}`),
        output: 'page 3: [7] total=7\npage 4: [] total=7',
        hint: '`Skip` past the end of a sequence does not throw.',
        why: 'Page 3 skips 6 ids and takes the one that is left. Page 4 skips past the end and returns an empty page, which is why the API answers 200 with no items (and the total, so clients can stop) rather than 404: the collection exists, the page is simply empty.',
      }),
    ),
    questionTask(
      'stable-paging',
      'Make paging stable for the payroll export',
      single({
        id: `${ID}-stable-paging`,
        difficulty: 3,
        prompt:
          'After the move to SQL Server, the payroll export reads all 40,000 employees with `ORDER BY EmployeeId OFFSET (@page - 1) * 100 ROWS FETCH NEXT 100 ROWS ONLY` while HR deletes leavers. INC-2304 happens again: some employees are skipped. What is the best fix?',
        correct:
          'Keyset (seek) paging: return a continuation token with the last id, and read the next page with `WHERE EmployeeId > @lastId ORDER BY EmployeeId`, so deletes cannot shift rows between pages',
        wrong: [
          'Raise the maximum `pageSize` to 1,000 so the export needs fewer pages',
          'Order by `Name` instead of `EmployeeId`, because names do not change',
          'Cache `totalCount` at the start of the export and stop when it is reached',
        ],
        hint: 'With OFFSET, the position of every later row moves when an earlier row is deleted.',
        why: 'OFFSET counts rows: when a row on an earlier page is deleted, every later row moves up one position and the next page starts one row too far, skipping an employee. Keyset paging remembers where it stopped (the last id) instead of counting, so deletes and inserts elsewhere do not shift it, and it is also faster because SQL Server seeks on the primary key instead of reading and discarding the offset rows. Bigger pages only make the window smaller; ordering by a non-unique column makes paging non-deterministic.',
      }),
    ),
    questionTask(
      'unique-email-in-the-database',
      'Enforce unique emails in SQL Server',
      single({
        id: `${ID}-unique-email`,
        difficulty: 4,
        prompt:
          'Milestone 2 stores employees with EF Core in SQL Server. The first draft checks for the email and then inserts. Two HR admins submit the same new starter at the same moment and both get 201. What is the robust fix?',
        code: plain(`// EmployeeService.CreateAsync (draft, EF Core)
var email = request.Email.Trim().ToLowerInvariant();
if (await db.Employees.AnyAsync(e => e.Email == email))
    return Results.Conflict();
db.Employees.Add(new Employee { Name = name, Email = email, Department = department });
await db.SaveChangesAsync();
return Results.Created($"/employees/{employee.Id}", employee);`),
        correct:
          'Add a unique index on `Email` (`CREATE UNIQUE INDEX UX_Employees_Email ON dbo.Employees (Email)`), keep the pre-check only for a friendly fast path, and translate the duplicate-key error (SQL Server 2601/2627, a `DbUpdateException`) into 409',
        wrong: [
          'Wrap the check and the insert in a C# `lock` so only one request runs them at a time',
          'Run the check and the insert in a transaction with the default READ COMMITTED isolation level',
          'After `SaveChangesAsync`, query for the email again and delete the newer row if there are two',
        ],
        hint: 'Between the check and the insert, another request can do exactly the same check. Only one component sees every write.',
        why: 'Check-then-insert is a race: both requests run `AnyAsync` before either inserts, so both see no row. Only the database sees every write, so the rule belongs there as a unique index; the losing insert fails with error 2601 (unique index) or 2627 (unique constraint), which the API turns into 409. A C# `lock` only covers one process, and the API runs on several instances. READ COMMITTED does not stop two transactions from both reading "no row" (you would need SERIALIZABLE or locking hints, and the unique index is simpler and cheaper). Deleting afterwards still lets both clients see 201.',
      }),
    ),
    questionTask(
      'tests-to-add',
      'Choose the tests to add',
      multiple({
        id: `${ID}-tests-to-add`,
        difficulty: 3,
        prompt:
          'The team adds integration tests that call the API over HTTP. Which of these tests protect against the incidents in the notes, or against real regressions? Select all that apply.',
        options: [
          {
            text: 'Creating `ada@example.com`, then `ADA@example.com`, returns 409 and the list still has one employee',
            correct: true,
          },
          {
            text: 'After deleting employee 2, the next employee created gets id 3, and `GET /employees/2` returns 404',
            correct: true,
          },
          {
            text: 'Against a real SQL Server, two concurrent POSTs with the same email produce exactly one 201 and one 409',
            correct: true,
          },
          {
            text: 'A mock verifies that `EmployeeStore.TryAdd` is called exactly once per POST, without checking the response',
            correct: false,
          },
          {
            text: 'Reflection checks that `EmployeeStore` has a private field named `_byId`',
            correct: false,
          },
        ],
        hint: 'Good tests check behavior a client can observe; they survive a refactoring of the internals.',
        why: 'The first three pin observable behavior behind INC-2291 (case-insensitive duplicates), INC-2310 (ids reused after a delete) and the race in the database version, which only a test against the real database can show. Asserting that an internal method was called, or that a private field exists, couples the tests to the implementation: they break on a harmless refactoring and still pass when the API returns the wrong status code.',
      }),
    ),
  ],
  limitations:
    'The API task is graded by real HTTP tests against an in-memory store; nothing runs against SQL Server, so the unique-index, keyset-paging and concurrency answers are assessed as questions, not executed.',
};
