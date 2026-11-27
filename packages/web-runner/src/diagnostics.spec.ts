import { describe, expect, it } from 'vitest';
import { parseDiagnostics } from './diagnostics';

const CONTROLLER = 'src/main/java/com/pracstack/employees/web/EmployeeController.java';

describe('parseDiagnostics', () => {
  it('names the unknown symbol and points at it (javac, as the Spring Boot runner prints it)', () => {
    expect(
      parseDiagnostics('spring-boot', [
        `${CONTROLLER}:36: error: cannot find symbol`,
        '        return ResponseBody.of(employees.findById(id));',
        '               ^',
        '  symbol:   variable ResponseBody',
        '  location: class EmployeeController',
        '1 error',
      ]),
    ).toEqual([
      { file: CONTROLLER, line: 36, column: 16, message: 'cannot find symbol: ResponseBody' },
    ]);
  });

  it('says which type a missing method was looked for in', () => {
    const [d] = parseDiagnostics('spring-boot', [
      `${CONTROLLER}:21: error: cannot find symbol`,
      '        return employees.fndById(id);',
      '                        ^',
      '  symbol:   method fndById(long)',
      '  location: variable employees of type EmployeeService',
    ]);
    expect(d).toMatchObject({
      line: 21,
      column: 25,
      message: 'cannot find symbol: method fndById(long) in EmployeeService',
    });
  });

  it('keeps several javac errors apart, each with its own column', () => {
    const found = parseDiagnostics('spring-boot', [
      `${CONTROLLER}:10: error: cannot find symbol`,
      '@RestControler',
      ' ^',
      '  symbol: class RestControler',
      `${CONTROLLER}:14: error: ';' expected`,
      '    private final EmployeeService employees',
      '                                           ^',
      '2 errors',
    ]);
    expect(found).toEqual([
      { file: CONTROLLER, line: 10, column: 2, message: 'cannot find symbol: RestControler' },
      { file: CONTROLLER, line: 14, column: 44, message: "';' expected" },
    ]);
  });

  it('reads dotnet errors with their position and code', () => {
    expect(
      parseDiagnostics('aspnetcore', [
        "/tmp/app/Controllers/EmployeesController.cs(18,20): error CS0103: The name 'Okk' does not exist in the current context [/tmp/app/EmployeeApi.csproj]",
      ]),
    ).toEqual([
      {
        file: 'Controllers/EmployeesController.cs',
        line: 18,
        column: 20,
        message: "CS0103: The name 'Okk' does not exist in the current context",
      },
    ]);
  });

  it('reads Python syntax errors from the syntax check', () => {
    expect(
      parseDiagnostics('django', ['employees/views.py:4:7: error: SyntaxError: invalid syntax']),
    ).toEqual([
      { file: 'employees/views.py', line: 4, column: 7, message: 'SyntaxError: invalid syntax' },
    ]);
  });

  it('points a Python traceback at the last frame in the project', () => {
    expect(
      parseDiagnostics('django', [
        'Traceback (most recent call last):',
        '  File "/tmp/app/manage.py", line 10, in <module>',
        '    main()',
        '  File "/usr/lib/python3.12/site-packages/django/urls/resolvers.py", line 720, in urlconf_module',
        '    return import_module(self.urlconf_name)',
        '  File "/tmp/app/employees/views.py", line 12, in <module>',
        '    class EmployeeList(APIVeiw):',
        "NameError: name 'APIVeiw' is not defined",
      ]),
    ).toEqual([
      {
        file: 'employees/views.py',
        line: 12,
        message: "NameError: name 'APIVeiw' is not defined",
      },
    ]);
  });

  it('falls back to the end of the output when nothing is recognized', () => {
    expect(parseDiagnostics('django', ['', 'something odd happened'])).toEqual([
      { message: 'something odd happened' },
    ]);
  });
});
