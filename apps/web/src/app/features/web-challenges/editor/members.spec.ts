import { findJavaMemberProblems, membersAt, parseClass, receiverChain } from './members';

const REQUEST = `package com.pracstack.employees.model;

/** The JSON body of POST /api/employees. Any field may be missing (null). */
public record CreateEmployeeRequest(String name, String email, String department) {}
`;

const EMPLOYEE = `package com.pracstack.employees.model;

public class Employee extends Person {
    public static final int MAX_NAME = 100;
    private final long id;
    private String email;
    String department;

    public Employee(long id, String email) {
        this.id = id;
        this.email = email;
    }

    public long getId() { return id; }

    public String getEmail() {
        return email;
    }

    public static Employee of(long id, String email) {
        return new Employee(id, email);
    }

    private void secret() {}
}
`;

const PERSON = `package com.pracstack.employees.model;

public abstract class Person {
    private int hidden;
    public String getName() { return "x"; }
}
`;

const STATUS = `package com.pracstack.employees.model;

public enum Status {
    ACTIVE("a"), INACTIVE("i");

    private final String code;
    Status(String code) { this.code = code; }
    public String code() { return code; }
}
`;

const SERVICE_PATH = 'src/main/java/com/pracstack/employees/service/EmployeeService.java';
const service = (body: string) => `package com.pracstack.employees.service;

import com.pracstack.employees.model.*;
import java.util.List;

public class EmployeeService {
    private final EmployeeRepository repository;
    private Employee last;

    public EmployeeService(EmployeeRepository repository) {
        this.repository = repository;
    }

    public CreateEmployeeRequest sample() { return null; }

    public void create(CreateEmployeeRequest request) {
        ${body}
    }
}
`;

const files = (body: string): Record<string, string> => ({
  'src/main/java/com/pracstack/employees/model/CreateEmployeeRequest.java': REQUEST,
  'src/main/java/com/pracstack/employees/model/Employee.java': EMPLOYEE,
  'src/main/java/com/pracstack/employees/model/Person.java': PERSON,
  'src/main/java/com/pracstack/employees/model/Status.java': STATUS,
  'src/main/java/com/pracstack/employees/repository/EmployeeRepository.java': `package com.pracstack.employees.repository;

public interface EmployeeRepository {
    List<Employee> findAll();
    Employee save(Employee employee);
}
`,
  [SERVICE_PATH]: service(body),
});

/** Members offered after the last `.` of `body` (the cursor right after it). */
function namesAfter(body: string): string[] | undefined {
  const all = files(body);
  const text = all[SERVICE_PATH]!;
  const dot = text.indexOf(body) + body.lastIndexOf('.');
  const found = membersAt(all, SERVICE_PATH, dot);
  return found?.info ? found.members.map((m) => m.name) : undefined;
}

describe('parseClass', () => {
  it('reads a record’s components as accessor methods', () => {
    const info = parseClass('CreateEmployeeRequest.java', REQUEST, 'CreateEmployeeRequest');
    expect(info?.members.map((m) => [m.name, m.kind, m.type])).toEqual([
      ['name', 'method', 'String'],
      ['email', 'method', 'String'],
      ['department', 'method', 'String'],
    ]);
  });

  it('reads fields and methods, but not constructors, with their modifiers', () => {
    const info = parseClass('Employee.java', EMPLOYEE, 'Employee')!;
    expect(info.supertypes).toEqual(['Person']);
    expect(
      info.members.map(
        (m) => `${m.isStatic ? 'static ' : ''}${m.isPrivate ? 'private ' : ''}${m.name}`,
      ),
    ).toEqual([
      'static MAX_NAME',
      'private id',
      'private email',
      'department',
      'getId',
      'getEmail',
      'static of',
      'private secret',
    ]);
  });

  it('reads enum constants', () => {
    const info = parseClass('Status.java', STATUS, 'Status')!;
    expect(info.members.map((m) => [m.name, m.kind])).toEqual([
      ['ACTIVE', 'constant'],
      ['INACTIVE', 'constant'],
      ['code', 'field'],
      ['code', 'method'],
    ]);
  });

  it('reads C# records and properties', () => {
    const source = `namespace Shop;

public record CreateOrder(string Customer, int Quantity);

public class Order : Entity, IOrder
{
    private readonly List<string> _lines = new() { "a" };
    public string Customer { get; set; } = "";
    public int Total => _lines.Count;
    public decimal Price { get { return 1; } }
    public void AddLine(string line, int count = 1) { _lines.Add(line); }
}
`;
    expect(
      parseClass('Order.cs', source, 'CreateOrder')?.members.map((m) => [m.name, m.kind]),
    ).toEqual([
      ['Customer', 'property'],
      ['Quantity', 'property'],
    ]);
    const order = parseClass('Order.cs', source, 'Order')!;
    expect(order.supertypes).toEqual(['Entity', 'IOrder']);
    expect(order.members.map((m) => [m.name, m.kind, m.isPrivate])).toEqual([
      ['_lines', 'field', true],
      ['Customer', 'property', false],
      ['Total', 'property', false],
      ['Price', 'property', false],
      ['AddLine', 'method', false],
    ]);
  });
});

describe('receiverChain', () => {
  it('reads names and calls back from the dot', () => {
    const code = 'x = this.repo.find(a, b(c)).items.';
    expect(receiverChain(code, code.length - 1)?.parts).toEqual([
      { name: 'this', call: false },
      { name: 'repo', call: false },
      { name: 'find', call: true },
      { name: 'items', call: false },
    ]);
  });
});

describe('membersAt', () => {
  it('offers a parameter’s record components', () => {
    expect(namesAfter('String name = request.')).toEqual(['name', 'email', 'department']);
  });

  it('follows fields, this and method return types', () => {
    expect(namesAfter('repository.')).toEqual(['findAll', 'save']);
    expect(namesAfter('this.repository.')).toEqual(['findAll', 'save']);
    expect(namesAfter('sample().')).toEqual(['name', 'email', 'department']);
    expect(namesAfter('repository.save(last).')).toEqual([
      'MAX_NAME',
      'department',
      'getId',
      'getEmail',
      'of',
      'getName',
    ]);
  });

  it('shows locals (var with new, too) and hides other files’ private members', () => {
    expect(namesAfter('Employee e = last; e.')).toContain('getName');
    expect(namesAfter('Employee e = last; e.')).not.toContain('secret');
    expect(namesAfter('var e = new Employee(1, "a"); e.')).toContain('getEmail');
  });

  it('offers only static members after a class name', () => {
    expect(namesAfter('Employee.')).toEqual(['MAX_NAME', 'of']);
    expect(namesAfter('Status.')).toEqual(['ACTIVE', 'INACTIVE']);
  });

  it('gives up on library types and unknown names', () => {
    expect(namesAfter('request.name().')).toBeUndefined();
    expect(namesAfter('unknown.')).toBeUndefined();
  });
});

const RESULT = `package com.pracstack.employees.service;

public sealed interface CreateResult {
    record Created(Employee employee) implements CreateResult {}
    record Invalid(Map<String, List<String>> errors) implements CreateResult {}
    record Duplicate() implements CreateResult {}
}
`;

const CONTROLLER_PATH = 'src/main/java/com/pracstack/employees/web/EmployeeController.java';
const controller = (body: string): Record<string, string> => ({
  ...files(''),
  'src/main/java/com/pracstack/employees/service/CreateResult.java': RESULT,
  [SERVICE_PATH]: `package com.pracstack.employees.service;

public class EmployeeService {
    public CreateResult create(CreateEmployeeRequest request) { return null; }
}
`,
  [CONTROLLER_PATH]: `package com.pracstack.employees.web;

public class EmployeeController {
    private final EmployeeService employees;

    public void other(Employee result) {}

    public CreateResult addEmployee(CreateEmployeeRequest request) {
        ${body}
    }
}
`,
});

const problemsIn = (body: string) =>
  findJavaMemberProblems(controller(body), CONTROLLER_PATH).map((p) => p.message);

describe('nested types and scope', () => {
  const after = (body: string) => {
    const all = controller(body);
    const text = all[CONTROLLER_PATH]!;
    return membersAt(all, CONTROLLER_PATH, text.indexOf(body) + body.lastIndexOf('.'))?.members.map(
      (m) => m.name,
    );
  };

  it('offers nested types after the outer class name', () => {
    expect(after('CreateResult.')).toEqual(['Created', 'Invalid', 'Duplicate']);
  });

  it('reads a pattern variable’s type', () => {
    expect(after('if (r instanceof CreateResult.Created created) { created.')).toEqual([
      'employee',
    ]);
  });

  it('uses the declaration in scope, not one in another method', () => {
    // `result` is an Employee parameter in other(), a CreateResult here.
    expect(after('CreateResult result = employees.create(request); result.')).toEqual([]);
  });
});

describe('findJavaMemberProblems', () => {
  it('flags a method the class does not have, with the closest one', () => {
    const all = controller('CreateResult result = employees.createx(request);');
    const [problem, ...rest] = findJavaMemberProblems(all, CONTROLLER_PATH);
    expect(rest).toEqual([]);
    expect(problem?.message).toBe('EmployeeService has no method createx(…). Did you mean create?');
    expect(problem?.fix).toEqual({ kind: 'replace', with: 'create' });
    const line = all[CONTROLLER_PATH]!.split('\n')[(problem?.line ?? 0) - 1]!;
    expect(line.slice(problem!.startColumn - 1, problem!.endColumn - 1)).toBe('createx');
  });

  it('flags a record component used without ()', () => {
    expect(problemsIn('String n = request.name;')).toEqual([
      'CreateEmployeeRequest.name is a method: call it as name().',
    ]);
  });

  it('accepts correct code: calls, nested types, new Outer.Inner, Object methods', () => {
    expect(
      problemsIn(`CreateResult result = employees.create(request);
        if (result instanceof CreateResult.Created created) { created.employee().getEmail(); }
        result = new CreateResult.Duplicate();
        request.name().trim();
        result.toString();`),
    ).toEqual([]);
  });

  it('flags private members of another class', () => {
    expect(problemsIn('Employee e = null; e.secret();')).toEqual(['Employee.secret is private.']);
  });
});
