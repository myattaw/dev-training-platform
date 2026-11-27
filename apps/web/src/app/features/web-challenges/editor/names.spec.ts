import { blankJava, closestName, editDistance, findJavaNameProblems } from './names';
import { projectSymbols } from './project-symbols';

const CONTROLLER = `package com.pracstack.employees.web;

import com.pracstack.employees.model.Employee;
import com.pracstack.employees.service.EmployeeService;
import java.util.List;
import java.util.Optional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/employees")
public class EmployeeController {
    private final EmployeeService employees;

    public EmployeeController(EmployeeService employees) {
        this.employees = employees;
    }

    @GetMapping("/{id}")
    public ResponseEntity<Employee> getEmployee(@PathVariable long id) {
        Optional<Employee> employee = employees.findById(id);
        if (employee.isPresent()) {
            return ResponseBody.ok(employee.get());
        }
        return ResponseEntity.notFound().build();
    }
}
`;

const PROJECT = projectSymbols({
  'src/main/java/com/pracstack/employees/web/EmployeeController.java': CONTROLLER,
  'src/main/java/com/pracstack/employees/model/Employee.java':
    'package com.pracstack.employees.model;\n\npublic record Employee(long id, String name) {}\n',
  'src/main/java/com/pracstack/employees/service/EmployeeService.java':
    'package com.pracstack.employees.service;\n\npublic class EmployeeService {}\n',
}).symbols;

describe('the live Java name check', () => {
  it('catches the ResponseBody typo and the missing ResponseEntity import', () => {
    const problems = findJavaNameProblems(CONTROLLER, PROJECT);
    expect(problems.map((p) => [p.name, p.line, p.severity, p.message])).toEqual([
      [
        'ResponseEntity',
        22,
        'error',
        'ResponseEntity is not imported. Add: import org.springframework.http.ResponseEntity;',
      ],
      ['ResponseBody', 25, 'warning', 'Unknown name ResponseBody. Did you mean ResponseEntity?'],
      [
        'ResponseEntity',
        27,
        'error',
        'ResponseEntity is not imported. Add: import org.springframework.http.ResponseEntity;',
      ],
    ]);
    const typo = problems[1]!;
    expect(CONTROLLER.split('\n')[24]!.slice(typo.startColumn - 1, typo.endColumn - 1)).toBe(
      'ResponseBody',
    );
    expect(typo.fix).toEqual({
      kind: 'replace',
      with: 'ResponseEntity',
      target: { name: 'ResponseEntity', module: 'org.springframework.http' },
    });
  });

  it('accepts imported, java.lang, same-package, nested and generic names, and ignores strings and comments', () => {
    const code = `package com.x.web;

import java.util.Map;
import org.springframework.http.ResponseEntity;

// ResponseBdy in a comment, and "UnknownThing" in a string
public class Things<T> {
    record Pair(String key, Integer value) {}
    static <K, V> Map<K, V> copy(Map<K, V> map) { return map; }
    Object use() {
        Helper h = new Helper();
        String text = """
            NotAClass here
            """;
        Map.Entry<String, Integer> e = null;
        return ResponseEntity.ok(new Pair(text, MAX_SIZE));
    }
}
`;
    const project = projectSymbols({
      'Helper.java': 'package com.x.web;\nclass Helper {}\n',
    }).symbols;
    expect(findJavaNameProblems(code, project)).toEqual([]);
  });

  it('does not offer an annotation for a name used as a value, or the other way around', () => {
    const problems = findJavaNameProblems(
      'package p;\n\nclass A {\n    @RestControler\n    Object x = HttpStatuss.OK;\n}\n',
      [],
    );
    expect(problems.map((p) => p.message)).toEqual([
      'Unknown name RestControler. Did you mean RestController?',
      'Unknown name HttpStatuss. Did you mean HttpStatus?',
    ]);
  });
});

describe('closestName', () => {
  it('prefers a small edit, and a shared prefix with the member used', () => {
    expect(closestName('Optinal', ['Optional', 'List'])).toBe('Optional');
    expect(closestName('RequestBdy', ['ResponseEntity', 'RequestBody'])).toBe('RequestBody');
    expect(closestName('ResponseBody', ['ResponseEntity', 'Map'])).toBeUndefined();
    expect(
      closestName('ResponseBody', ['ResponseEntity', 'Map'], {
        withMember: (c) => c === 'ResponseEntity',
      }),
    ).toBe('ResponseEntity');
    expect(closestName('Xyz', ['ResponseEntity'])).toBeUndefined();
  });

  it('measures edit distance', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('same', 'same')).toBe(0);
  });
});

describe('blankJava', () => {
  it('keeps positions and line breaks, and blanks literals and comments', () => {
    const code = 'a("x\\"y") // c\nb(\'z\') /* d\ne */ f';
    const blank = blankJava(code);
    expect(blank).toHaveLength(code.length);
    expect(blank.split('\n')).toHaveLength(3);
    expect(blank).not.toMatch(/[xyzcde]/);
    expect(blank).toContain('a(');
    expect(blank).toContain(' f');
  });
});
