import { explainDiagnostic } from './hints';

const CONTROLLER_PATH = 'src/main/java/com/x/web/EmployeeController.java';
const files = {
  [CONTROLLER_PATH]: [
    'package com.x.web;',
    '',
    'class EmployeeController {',
    '    Object a() { return ResponseBody.ok(1); }',
    '    Object b() { return ResponseEntity.notFound().build(); }',
    '    @RestControler',
    '    Object c() { return null; }',
    '}',
  ].join('\n'),
  'Controllers/EmployeesController.cs': 'public class C { public object Get() => Okk(); }',
  'employees/views.py': 'class EmployeeListView(APIVeiw):\n    pass\n',
};

describe('explainDiagnostic', () => {
  it('suggests the known name with the member used (the ResponseBody typo)', () => {
    expect(
      explainDiagnostic(
        { file: CONTROLLER_PATH, line: 4, column: 25, message: 'cannot find symbol: ResponseBody' },
        files,
      ),
    ).toEqual({
      file: CONTROLLER_PATH,
      line: 4,
      column: 25,
      message: 'cannot find symbol: ResponseBody. Did you mean ResponseEntity?',
      fix: {
        kind: 'replace',
        with: 'ResponseEntity',
        target: { name: 'ResponseEntity', module: 'org.springframework.http' },
      },
    });
  });

  it('names the missing import of a known class', () => {
    expect(
      explainDiagnostic(
        { file: CONTROLLER_PATH, line: 5, message: 'cannot find symbol: ResponseEntity' },
        files,
      ).message,
    ).toBe(
      'cannot find symbol: ResponseEntity. Missing import: import org.springframework.http.ResponseEntity;',
    );
  });

  it('matches an annotation with an annotation', () => {
    expect(
      explainDiagnostic(
        { file: CONTROLLER_PATH, line: 6, column: 6, message: 'cannot find symbol: RestControler' },
        files,
      ).message,
    ).toBe('cannot find symbol: RestControler. Did you mean RestController?');
  });

  it('explains C# and Python unknown names too', () => {
    expect(
      explainDiagnostic(
        {
          file: 'employees/views.py',
          line: 1,
          message: "NameError: name 'APIVeiw' is not defined",
        },
        files,
      ).message,
    ).toBe("NameError: name 'APIVeiw' is not defined. Did you mean APIView?");
    expect(
      explainDiagnostic(
        {
          file: 'Controllers/EmployeesController.cs',
          line: 1,
          message: "CS0246: The type or namespace name 'ControllerBas' could not be found",
        },
        files,
      ).message,
    ).toBe(
      "CS0246: The type or namespace name 'ControllerBas' could not be found. Did you mean ControllerBase?",
    );
  });

  it('leaves other errors as they are', () => {
    const d = { file: CONTROLLER_PATH, line: 3, message: "';' expected" };
    expect(explainDiagnostic(d, files)).toBe(d);
    expect(explainDiagnostic({ message: 'Build failed' }, files)).toEqual({
      message: 'Build failed',
    });
  });
});
