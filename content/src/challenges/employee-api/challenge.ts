import { readFileSync } from 'node:fs';
import type { ChallengeSource, ChallengeTest, OperationStep } from '@pracstack/content-model';

/**
 * Enterprise challenge: an ASP.NET Core minimal API, graded by integration tests.
 * TestDriver.cs (public, read-only) hosts the learner's endpoints on a loopback
 * port inside the sandbox and sends real HTTP requests; every test is a fresh
 * app instance. Expected values stay in this file (the API), as for every challenge.
 */

const driver = readFileSync(new URL('./TestDriver.cs', import.meta.url), 'utf8');

type Body = Readonly<Record<string, unknown>> | string | null;
const json = (body: Body): string | null =>
  body === null ? null : typeof body === 'string' ? body : JSON.stringify(body);

/** Sends a request; checks the status code. */
const status = (method: string, path: string, body: Body, expected: number): OperationStep => ({
  call: 'status',
  args: [method, path, json(body)],
  expected,
});
/** Sends a request; checks a value in the JSON response (see TestDriver.Field). */
const field = (
  method: string,
  path: string,
  body: Body,
  name: string,
  expected: string | null,
): OperationStep => ({ call: 'field', args: [method, path, json(body), name], expected });
/** Sends a request; checks a response header. */
const header = (
  method: string,
  path: string,
  body: Body,
  name: string,
  expected: string | null,
): OperationStep => ({ call: 'header', args: [method, path, json(body), name], expected });

const ada = { name: 'Ada Lovelace', email: 'ada@example.com', department: 'Engineering' };
const grace = { name: 'Grace Hopper', email: 'grace@example.com', department: 'Engineering' };
const linus = { name: 'Linus Torvalds', email: 'linus@example.com', department: 'Support' };
const post = (body: Body, expected: number) => status('POST', '/employees', body, expected);

const test = (description: string, steps: OperationStep[]): ChallengeTest => ({
  kind: 'operations',
  description,
  constructorArgs: [],
  steps,
});

export const source: ChallengeSource = {
  challenge: {
    id: 'employee-api',
    version: 1,
    title: 'Employee Management API',
    summary:
      'Build a small ASP.NET Core API for an HR system: validation, duplicates, pagination and the right status codes.',
    category: 'enterprise',
    difficulty: 'medium',
    tags: ['rest-apis', 'input-validation'],
    instructions: [
      {
        kind: 'paragraph',
        text: 'The HR team replaces a spreadsheet with an internal service. Your task is the first version of its employee API: an ASP.NET Core minimal API that keeps employees in memory.',
      },
      { kind: 'heading', text: 'Endpoints' },
      {
        kind: 'list',
        items: [
          '`POST /employees` with a JSON body `{ "name", "email", "department" }` creates an employee. Respond 201 Created with a `Location` header `/employees/{id}` and the employee as JSON (`id`, `name`, `email`, `department`).',
          '`GET /employees/{id}` returns 200 with the employee, or 404 if there is none.',
          '`GET /employees?page=1&pageSize=10` returns 200 with `{ "items": [...], "page", "pageSize", "totalCount" }`, employees ordered by id. `page` defaults to 1 and `pageSize` to 10.',
          '`DELETE /employees/{id}` returns 204, or 404 if there is no such employee.',
        ],
      },
      { kind: 'heading', text: 'Business rules' },
      {
        kind: 'list',
        items: [
          'Ids start at 1 and are never reused, even after a delete.',
          'Trim `name`, `email` and `department`. Store the email in lower case.',
          '`name` is required (1–100 characters). `email` must contain exactly one `@` with text on both sides and no spaces. `department` is one of `Engineering`, `Finance`, `Sales`, `Support`.',
          'Invalid input returns 400 with validation problem details (`Results.ValidationProblem`): an `errors` object whose keys are the invalid fields, `name`, `email` or `department`.',
          'Emails are unique, ignoring case: creating a second employee with the same email returns 409 Conflict.',
          '`page` must be at least 1 and `pageSize` between 1 and 50; otherwise return 400 with validation problem details.',
          'A request body that is not valid JSON must return 400 (ASP.NET Core does this for you when binding fails).',
        ],
      },
      { kind: 'heading', text: 'What to write' },
      {
        kind: 'paragraph',
        text: 'Complete `EmployeeApi.ConfigureServices` (register what your endpoints need, e.g. a store as a singleton) and `EmployeeApi.MapEndpoints`. Keep the types the starter code declares; you can add your own.',
      },
      { kind: 'heading', text: 'How your API is tested' },
      {
        kind: 'paragraph',
        text: 'A read-only test driver (`EmployeeApiClient`, below) starts a fresh copy of your API for each test on a loopback port inside the sandbox and sends it real HTTP requests. Tests check status codes, headers and JSON values. Nothing can reach the internet.',
      },
      { kind: 'code', code: driver.trim() },
    ],
    languages: {
      csharp: {
        entryPoint: 'EmployeeApiClient',
        supportCode: driver,
        starterCode: `using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

public record Employee(int Id, string Name, string Email, string Department);

public record CreateEmployeeRequest(string? Name, string? Email, string? Department);

public record EmployeePage(IReadOnlyList<Employee> Items, int Page, int PageSize, int TotalCount);

public static class EmployeeApi
{
    /// <summary>Registers the services your endpoints need.</summary>
    public static void ConfigureServices(IServiceCollection services)
    {
        // TODO: register an in-memory store
    }

    /// <summary>Maps the /employees endpoints.</summary>
    public static void MapEndpoints(IEndpointRouteBuilder app)
    {
        // TODO: implement the endpoints
        app.MapGet("/employees/{id:int}", (int id) => Results.StatusCode(501));
    }
}
`,
      },
    },
    visibleTests: [
      test('creates an employee and reads it back', [
        post(ada, 201),
        field('GET', '/employees/1', null, 'name', 'Ada Lovelace'),
        field('GET', '/employees/1', null, 'department', 'Engineering'),
      ]),
      test('returns the new location, and 404 for an unknown employee', [
        header('POST', '/employees', ada, 'Location', '/employees/1'),
        status('GET', '/employees/2', null, 404),
      ]),
      test('rejects invalid input with validation problem details', [
        post({ name: '', email: 'ada@example.com', department: 'Engineering' }, 400),
        field('POST', '/employees', { ...ada, email: 'not-an-email' }, 'errors.email.length', '1'),
        status('GET', '/employees/1', null, 404),
      ]),
    ],
  },
  hiddenTests: [
    test('trims input and stores the email in lower case', [
      post({ name: '  Grace Hopper ', email: ' Grace@Example.COM ', department: 'Finance ' }, 201),
      field('GET', '/employees/1', null, 'name', 'Grace Hopper'),
      field('GET', '/employees/1', null, 'email', 'grace@example.com'),
      field('GET', '/employees/1', null, 'department', 'Finance'),
    ]),
    test('rejects a duplicate email regardless of case', [
      post(ada, 201),
      post({ ...grace, email: ' ADA@example.com' }, 409),
      field('GET', '/employees', null, 'totalCount', '1'),
    ]),
    test('reports every invalid field at once', [
      field(
        'POST',
        '/employees',
        { name: '', email: 'a@@b', department: 'Legal' },
        'errors.name.length',
        '1',
      ),
      field(
        'POST',
        '/employees',
        { name: 'x'.repeat(101), email: 'a b@c.io', department: 'Sales' },
        'errors.email.length',
        '1',
      ),
      field(
        'POST',
        '/employees',
        { name: 'x', email: '@c.io', department: 'Engineering' },
        'errors.email.length',
        '1',
      ),
      field(
        'POST',
        '/employees',
        { name: 'x', email: 'a@c.io', department: 'Legal' },
        'errors.department.length',
        '1',
      ),
      field('GET', '/employees', null, 'totalCount', '0'),
    ]),
    test('paginates in id order with totals', [
      post(ada, 201),
      post(grace, 201),
      post(linus, 201),
      field('GET', '/employees?page=2&pageSize=2', null, 'items.length', '1'),
      field('GET', '/employees?page=2&pageSize=2', null, 'items.0.email', 'linus@example.com'),
      field('GET', '/employees?page=2&pageSize=2', null, 'totalCount', '3'),
      field('GET', '/employees', null, 'items.0.name', 'Ada Lovelace'),
      field('GET', '/employees', null, 'pageSize', '10'),
      field('GET', '/employees?page=3&pageSize=2', null, 'items.length', '0'),
    ]),
    test('rejects out-of-range paging parameters', [
      status('GET', '/employees?page=0', null, 400),
      status('GET', '/employees?pageSize=0', null, 400),
      status('GET', '/employees?pageSize=51', null, 400),
      status('GET', '/employees?pageSize=50', null, 200),
    ]),
    test('deletes, and never reuses ids', [
      post(ada, 201),
      post(grace, 201),
      status('DELETE', '/employees/2', null, 204),
      status('DELETE', '/employees/2', null, 404),
      status('GET', '/employees/2', null, 404),
      header('POST', '/employees', linus, 'Location', '/employees/3'),
      field('GET', '/employees', null, 'totalCount', '2'),
    ]),
    test('rejects a body that is not JSON', [
      status('POST', '/employees', '{"name": "Ada"', 400),
      status('DELETE', '/employees/1', null, 404),
    ]),
  ],
};
