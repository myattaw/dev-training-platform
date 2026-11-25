import type { Node } from 'web-tree-sitter';
import type { CompileDiagnostic } from '../compile.models';
import type { SyntaxLanguage } from './syntax.models';

/*
 * A light "does this name exist?" check while typing, before the real compiler
 * (on the server) runs. It flags a name that is used but declared nowhere in
 * the file, like `ew` in `return ew;`.
 *
 * Deliberately narrow, so it never flags correct code:
 * - only names starting with a lowercase letter: locals, parameters and
 *   fields are written that way in C# and Java, while types, namespaces and
 *   .NET members (Console, Math, HashSet) are PascalCase and may come from
 *   anywhere;
 * - a name declared anywhere in the file counts, whatever its scope;
 * - member names (`x.length`, `s.ToLower()`), method names in calls,
 *   named arguments, labels and object-initializer members are never checked.
 */

interface Rules {
  /** Is this identifier (by parent type and field) a declaration? */
  readonly declares: (parent: string, field: string | null) => boolean;
  /** Is this identifier not a plain name lookup (a member, a label, a type…)? */
  readonly ignored: (parent: Node, field: string | null) => boolean;
  /** Names that exist without a declaration in the file. */
  readonly builtIn: ReadonlySet<string>;
}

const RULES: Readonly<Record<SyntaxLanguage, Rules>> = {
  csharp: {
    declares: (parent, field) =>
      (field === 'name' &&
        ![
          'member_access_expression',
          'argument',
          'qualified_name',
          'member_binding_expression',
        ].includes(parent)) ||
      (parent === 'foreach_statement' && field === 'left') ||
      // Query variables: `from x`, `let x`, `join x`, `into x` (a direct child of the query).
      [
        'let_clause',
        'join_clause',
        'join_into_clause',
        'query_continuation',
        'query_expression',
        'from_clause',
        'labeled_statement',
      ].includes(parent),
    ignored: (parent, field) =>
      field === 'name' ||
      field === 'type' ||
      [
        'qualified_name',
        'using_directive',
        'generic_name',
        'goto_statement',
        'name_colon',
        'attribute',
        'labeled_statement',
        'type_argument_list',
        // `new { error = 1 }`: a member name.
        'anonymous_object_creation_expression',
      ].includes(parent.type) ||
      // `new P { name = 1 }`: a member of P, not a variable here.
      (parent.type === 'assignment_expression' &&
        field === 'left' &&
        parent.parent?.type === 'initializer_expression'),
    builtIn: new Set([
      'value',
      'nameof',
      'var',
      'dynamic',
      'args',
      'global',
      'when',
      'and',
      'or',
      'not',
    ]),
  },
  java: {
    declares: (parent, field) =>
      (field === 'name' &&
        !['method_invocation', 'scoped_identifier', 'field_access', 'method_reference'].includes(
          parent,
        )) ||
      (parent === 'lambda_expression' && field === 'parameters') ||
      ['inferred_parameters', 'labeled_statement'].includes(parent),
    ignored: (parent, field) =>
      field === 'name' ||
      field === 'field' ||
      field === 'type' ||
      [
        'scoped_identifier',
        'import_declaration',
        'package_declaration',
        'labeled_statement',
        'break_statement',
        'continue_statement',
        'method_reference',
        'annotation',
        'marker_annotation',
      ].includes(parent.type),
    builtIn: new Set(['length', 'var', 'args']),
  },
};

const IDENTIFIER_TYPES = new Set(['identifier', 'implicit_parameter']);
const MAX_FINDINGS = 20;

export function undefinedNames(root: Node, language: SyntaxLanguage): CompileDiagnostic[] {
  const rules = RULES[language];
  const declared = new Set<string>();
  const uses: Node[] = [];

  const walk = (node: Node): void => {
    if (node.isError) return; // a syntax error is already reported there
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;
      if (IDENTIFIER_TYPES.has(child.type)) {
        const field = node.fieldNameForChild(i);
        if (child.type === 'implicit_parameter' || rules.declares(node.type, field)) {
          declared.add(child.text);
        } else if (!rules.ignored(node, field)) {
          uses.push(child);
        }
      }
      walk(child);
    }
  };
  walk(root);

  const out: CompileDiagnostic[] = [];
  for (const use of uses) {
    const name = use.text;
    if (!/^[a-z]/.test(name) || declared.has(name) || rules.builtIn.has(name)) continue;
    out.push({
      line: use.startPosition.row + 1,
      column: use.startPosition.column + 1,
      message: `The name '${name}' does not exist here: it is not declared in this file.`,
    });
    if (out.length >= MAX_FINDINGS) break;
  }
  return out;
}
