import { importEdit, type TextEdit } from './imports';

/** The text after applying an edit (1-based line and column, like Monaco). */
function apply(text: string, edit: TextEdit | undefined): string {
  if (!edit) return text;
  const lines = text.split('\n');
  const offset = (line: number, column: number) =>
    lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0) + column - 1;
  return (
    text.slice(0, offset(edit.startLine, edit.startColumn)) +
    edit.text +
    text.slice(offset(edit.endLine, edit.endColumn))
  );
}

const RESPONSE_ENTITY = { name: 'ResponseEntity', module: 'org.springframework.http' };

describe('importEdit (Java)', () => {
  const ctx = { path: 'src/main/java/com/x/web/A.java' };

  it('adds the import after the last one', () => {
    const text =
      'package com.x.web;\n\nimport java.util.List;\nimport java.util.Map;\n\nclass A {}\n';
    expect(apply(text, importEdit('java', text, RESPONSE_ENTITY, ctx))).toBe(
      'package com.x.web;\n\nimport java.util.List;\nimport java.util.Map;\nimport org.springframework.http.ResponseEntity;\n\nclass A {}\n',
    );
  });

  it('adds the first import below the package line', () => {
    const text = 'package com.x.web;\n\nclass A {}\n';
    expect(apply(text, importEdit('java', text, RESPONSE_ENTITY, ctx))).toBe(
      'package com.x.web;\n\nimport org.springframework.http.ResponseEntity;\n\nclass A {}\n',
    );
  });

  it('adds nothing when imported (by name or wildcard), in the same package, or java.lang', () => {
    const imported = 'package p;\nimport org.springframework.http.ResponseEntity;\n';
    const wildcard = 'package p;\nimport org.springframework.http.*;\n';
    expect(importEdit('java', imported, RESPONSE_ENTITY, ctx)).toBeUndefined();
    expect(importEdit('java', wildcard, RESPONSE_ENTITY, ctx)).toBeUndefined();
    expect(
      importEdit(
        'java',
        'package com.x.model;\n',
        { name: 'Employee', module: 'com.x.model' },
        ctx,
      ),
    ).toBeUndefined();
    expect(
      importEdit('java', 'package p;\n', { name: 'String', module: 'java.lang' }, ctx),
    ).toBeUndefined();
  });

  it('never adds a second class with the same simple name', () => {
    const text = 'package p;\nimport com.x.catalog.Product;\n';
    expect(
      importEdit('java', text, { name: 'Product', module: 'com.x.orders' }, ctx),
    ).toBeUndefined();
  });
});

describe('importEdit (C#)', () => {
  const ctx = { path: 'Controllers/EmployeesController.cs' };
  const mvc = { name: 'ControllerBase', module: 'Microsoft.AspNetCore.Mvc' };

  it('adds a using after the last one', () => {
    const text = 'using EmployeeApi.Models;\n\nnamespace EmployeeApi.Controllers;\n';
    expect(apply(text, importEdit('csharp', text, mvc, ctx))).toBe(
      'using EmployeeApi.Models;\nusing Microsoft.AspNetCore.Mvc;\n\nnamespace EmployeeApi.Controllers;\n',
    );
  });

  it('adds nothing for implicit, global, present or enclosing namespaces', () => {
    const text = 'namespace EmployeeApi.Controllers;\n';
    expect(
      importEdit('csharp', text, { name: 'List', module: 'System.Collections.Generic' }, ctx),
    ).toBeUndefined();
    expect(
      importEdit('csharp', text, mvc, {
        ...ctx,
        globalUsings: new Set(['Microsoft.AspNetCore.Mvc']),
      }),
    ).toBeUndefined();
    expect(importEdit('csharp', text, { name: 'X', module: 'EmployeeApi' }, ctx)).toBeUndefined();
    expect(
      importEdit('csharp', `using Microsoft.AspNetCore.Mvc;\n${text}`, mvc, ctx),
    ).toBeUndefined();
  });
});

describe('importEdit (Python)', () => {
  const ctx = { path: 'employees/views.py' };

  it('adds the name to an existing `from … import` line', () => {
    const text = 'from rest_framework.views import APIView\n';
    expect(
      apply(
        text,
        importEdit(
          'python',
          text,
          { name: 'exception_handler', module: 'rest_framework.views' },
          ctx,
        ),
      ),
    ).toBe('from rest_framework.views import APIView, exception_handler\n');
  });

  it('adds a new line after the imports, relative for a sibling module', () => {
    const text = 'from rest_framework.views import APIView\n\n\nclass V(APIView):\n    pass\n';
    expect(
      apply(
        text,
        importEdit('python', text, { name: 'Employee', module: 'employees.models' }, ctx),
      ),
    ).toBe(
      'from rest_framework.views import APIView\nfrom .models import Employee\n\n\nclass V(APIView):\n    pass\n',
    );
  });

  it('imports a plain module with `import`, once', () => {
    const text = 'import re\n';
    expect(
      importEdit('python', text, { name: 're', module: 're', plainImport: true }, ctx),
    ).toBeUndefined();
    expect(
      apply('', importEdit('python', '', { name: 'json', module: 'json', plainImport: true }, ctx)),
    ).toBe('import json\n');
  });
});
