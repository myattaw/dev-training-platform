import { blankJava } from './names';
import { languageOfPath } from './project-symbols';

/*
 * Members of the project's own classes, for suggestions after `expression.`
 * (Java and C#). Read from the source with patterns, not a compiler: it finds
 * the declared type of a variable, parameter or field, follows `a.b().c`
 * through the members' declared types, and lists the fields, properties,
 * methods and record components of the project class it lands on.
 */

export interface ClassMember {
  readonly name: string;
  /** Declared type (a method's return type); '' when unknown. */
  readonly type: string;
  readonly kind: 'field' | 'property' | 'method' | 'constant';
  /** Method parameters as written (`String name, int age`); '' for none. */
  readonly params: string;
  readonly isStatic: boolean;
  readonly isPrivate: boolean;
}

export interface ClassInfo {
  readonly name: string;
  readonly path: string;
  readonly members: readonly ClassMember[];
  /** Base classes and interfaces named in the declaration. */
  readonly supertypes: readonly string[];
}

export interface MemberLookup {
  /** The project class the expression is, or `undefined` (not a project class / unknown). */
  readonly info?: ClassInfo;
  /** The type's simple name when resolved (also for library types such as `String`). */
  readonly type?: string;
  /** `Name.` on a class itself: only its static members. */
  readonly isStatic: boolean;
  /** Members to offer, inherited ones included, private ones only from their own file. */
  readonly members: readonly ClassMember[];
}

const IDENT = '[A-Za-z_$][\\w$]*';
const NOT_TYPES = new Set(
  `return new throw else case yield await in out ref is as instanceof extends implements import
  package using namespace goto break continue default do try catch finally static`.split(/\s+/),
);

/** `List<Employee>` → `List`, `com.x.Foo[]` → `Foo[]`, `string?` → `string`. */
export function simpleType(type: string): string {
  let t = type
    .replace(/<[\s\S]*>/, '')
    .replace(/\?/g, '')
    .replace(/\s+/g, '');
  t = t.slice(t.lastIndexOf('.') + 1);
  return t;
}

/** Removes Java annotations (`@X`, `@X(…)`) and C# attributes (`[X]`) from a member's text. */
function stripAnnotations(text: string): string {
  return text
    .replace(/@[\w.]+(?:\s*\((?:[^()]|\([^()]*\))*\))?/g, ' ')
    .replace(/^\s*(?:\[[^\]]*\]\s*)+/g, ' ');
}

/** Index of the `close` that balances the `open` at `start`; -1 when none. */
function matching(code: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    if (code[i] === open) depth++;
    else if (code[i] === close && --depth === 0) return i;
  }
  return -1;
}

/** Splits on commas outside (), <>, [] and {}. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ('(<[{'.includes(c!)) depth++;
    else if (')>]}'.includes(c!)) depth--;
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** `final String name` / `string Name = "x"` → { type, name }. */
function typedName(text: string): { type: string; name: string } | undefined {
  const t = stripAnnotations(text)
    .replace(/=[\s\S]*$/, '')
    .trim();
  const m = new RegExp(
    `^(?:(?:final|params|this|ref|out|in|scoped)\\s+)*([\\s\\S]+?)\\s+(${IDENT})$`,
  ).exec(t);
  return m ? { type: m[1]!.trim(), name: m[2]! } : undefined;
}

const MODIFIERS =
  /^(?:public|protected|private|internal|static|final|abstract|default|synchronized|native|transient|volatile|strictfp|readonly|virtual|override|sealed|async|extern|unsafe|new|partial|const|required|file)\b/;

/** Splits leading modifiers off a member's text. */
function modifiers(text: string): { mods: Set<string>; rest: string } {
  const mods = new Set<string>();
  let rest = text.trim();
  for (let m = MODIFIERS.exec(rest); m; m = MODIFIERS.exec(rest)) {
    mods.add(m[0]);
    rest = rest.slice(m[0].length).trim();
  }
  return { mods, rest };
}

/** The members one declaration declares (its text before the `;` or `{`); none when it is not one. */
function parseMember(
  raw: string,
  className: string,
  language: 'java' | 'csharp',
  inInterface: boolean,
  property = false,
): ClassMember[] {
  const { mods, rest: afterMods } = modifiers(stripAnnotations(raw));
  const rest = afterMods.replace(/^<[^>]*>\s*/, ''); // generic method `<T> T foo()`
  if (!rest || /^(?:class|interface|enum|record|struct|@interface)\b/.test(rest)) return [];
  const isStatic = mods.has('static') || mods.has('const');
  const isPrivate =
    mods.has('private') ||
    (language === 'csharp' &&
      !inInterface &&
      !['public', 'protected', 'internal'].some((m) => mods.has(m)));
  const paren = rest.indexOf('(');
  const equals = rest.search(/=(?!>)/);
  if (paren >= 0 && (equals < 0 || paren < equals)) {
    const head = rest.slice(0, paren).trim();
    const m = new RegExp(`^(?:([\\s\\S]+?)\\s+)?(${IDENT})$`).exec(head);
    if (!m || !m[1] || m[2] === className || NOT_TYPES.has(m[1])) return [];
    const close = matching(rest, paren, '(', ')');
    return [
      {
        name: m[2]!,
        type: m[1].trim(),
        kind: 'method',
        params: close > paren ? rest.slice(paren + 1, close).trim() : '',
        isStatic,
        isPrivate,
      },
    ];
  }
  // Fields (`int a, b = 1`) and C# properties (`string Name` before `{ get; }` or `=>`).
  const parts = splitTopLevel(rest.replace(/=>[\s\S]*$/, ''));
  const first = typedName(parts[0] ?? '');
  if (!first || NOT_TYPES.has(first.type)) return [];
  const names = [first.name, ...parts.slice(1).map((p) => /^\s*([A-Za-z_$][\w$]*)/.exec(p)?.[1])];
  const isProperty = language === 'csharp' && (property || /=>/.test(rest));
  return names
    .filter((n): n is string => !!n)
    .map((name) => ({
      name,
      type: first.type,
      kind: isProperty ? 'property' : 'field',
      params: '',
      isStatic: isStatic || (inInterface && language === 'java'),
      isPrivate,
    }));
}

/** The members declared directly in a class body (`body` is between its braces). */
function bodyMembers(
  body: string,
  className: string,
  language: 'java' | 'csharp',
  keyword: string,
): ClassMember[] {
  const members: ClassMember[] = [];
  const inInterface = keyword === 'interface';
  let segment = '';
  let i = 0;
  if (keyword === 'enum') {
    // Constants first: up to the first `;` (Java) or the end (C#).
    let depth = 0;
    let end = body.length;
    for (let j = 0; j < body.length; j++) {
      const c = body[j];
      if (c === '(' || c === '{') depth++;
      else if (c === ')' || c === '}') depth--;
      else if (c === ';' && depth === 0) {
        end = j;
        break;
      }
    }
    for (const part of splitTopLevel(body.slice(0, end))) {
      const name = new RegExp(`^(?:\\[[^\\]]*\\]\\s*)*(${IDENT})`).exec(
        stripAnnotations(part).trim(),
      )?.[1];
      if (name)
        members.push({
          name,
          type: className,
          kind: 'constant',
          params: '',
          isStatic: true,
          isPrivate: false,
        });
    }
    i = end + 1;
  }
  for (; i < body.length; i++) {
    const c = body[i]!;
    if (c === ';') {
      members.push(...parseMember(segment, className, language, inInterface));
      segment = '';
    } else if (c === '{') {
      const end = matching(body, i, '{', '}');
      const close = end < 0 ? body.length : end;
      // An initializer (`= new X() { … }`, `= { 1, 2 }`, a lambda) belongs to the field.
      if (/=(?!>)/.test(segment.replace(/\([^()]*\)/g, ''))) {
        segment += body.slice(i, close + 1);
        i = close;
        continue;
      }
      const inner = body.slice(i + 1, close);
      const property =
        language === 'csharp' &&
        !segment.includes('(') &&
        /^\s*(?:\w+\s+)?(?:get|set|init)\b/.test(inner);
      members.push(...parseMember(segment, className, language, inInterface, property));
      segment = '';
      i = close;
    } else if (c === '}') {
      segment = '';
    } else {
      segment += c;
    }
  }
  return members;
}

/** Finds the declaration of `name` in a file and reads its members. */
export function parseClass(path: string, source: string, name: string): ClassInfo | undefined {
  const language = languageOfPath(path);
  if (language !== 'java' && language !== 'csharp') return undefined;
  const code = blankJava(source);
  const decl = new RegExp(
    `\\b(class|interface|enum|record(?:\\s+struct|\\s+class)?|struct)\\s+(${name.replace(/\$/g, '\\$')})\\b`,
  ).exec(code);
  if (!decl) return undefined;
  const keyword = decl[1]!.split(/\s+/)[0]!;
  let at = decl.index + decl[0].length;
  const members: ClassMember[] = [];
  // Generic parameters, then a record's components.
  while (/\s/.test(code[at] ?? '')) at++;
  if (code[at] === '<') at = matching(code, at, '<', '>') + 1;
  while (/\s/.test(code[at] ?? '')) at++;
  if (code[at] === '(') {
    const close = matching(code, at, '(', ')');
    for (const part of splitTopLevel(code.slice(at + 1, close))) {
      const p = typedName(part);
      if (!p) continue;
      members.push(
        language === 'java'
          ? {
              name: p.name,
              type: p.type,
              kind: 'method',
              params: '',
              isStatic: false,
              isPrivate: false,
            }
          : {
              name: p.name,
              type: p.type,
              kind: 'property',
              params: '',
              isStatic: false,
              isPrivate: false,
            },
      );
    }
    at = close + 1;
  }
  const open = code.indexOf('{', at);
  const semi = code.indexOf(';', at);
  const header = code.slice(at, open < 0 ? undefined : semi >= 0 && semi < open ? semi : open);
  const supertypes: string[] = [];
  const java = /\b(?:extends|implements)\s+([\s\S]*)/.exec(header);
  const csharp = language === 'csharp' ? /^\s*:\s*([\s\S]*?)(?:\bwhere\b|$)/.exec(header) : null;
  for (const list of (java?.[1] ?? csharp?.[1] ?? '').split(/\b(?:extends|implements)\b/)) {
    for (const t of splitTopLevel(list)) supertypes.push(simpleType(t.replace(/\([\s\S]*$/, '')));
  }
  if (open >= 0 && (semi < 0 || open < semi || keyword !== 'record')) {
    const close = matching(code, open, '{', '}');
    members.push(
      ...bodyMembers(code.slice(open + 1, close < 0 ? undefined : close), name, language, keyword),
    );
  }
  return { name, path, members, supertypes };
}

/** The project's declaration of a class by simple name (this file first). */
export function findClass(
  files: Readonly<Record<string, string>>,
  name: string,
  preferPath?: string,
): ClassInfo | undefined {
  const paths = Object.keys(files).filter((p) => p.endsWith('.java') || p.endsWith('.cs'));
  if (preferPath) paths.sort((a, b) => (a === preferPath ? -1 : b === preferPath ? 1 : 0));
  const decl = new RegExp(
    `\\b(?:class|interface|enum|record|struct)\\s+${name.replace(/\$/g, '\\$')}\\b`,
  );
  for (const path of paths) {
    const text = files[path]!;
    if (decl.test(text)) {
      const info = parseClass(path, text, name);
      if (info) return info;
    }
  }
  return undefined;
}

/** A class's members with the ones it inherits from project classes (theirs after its own). */
function allMembers(
  files: Readonly<Record<string, string>>,
  info: ClassInfo,
  seen = new Set<string>(),
): ClassMember[] {
  seen.add(info.name);
  const own = [...info.members];
  for (const s of info.supertypes) {
    if (seen.has(s)) continue;
    const base = findClass(files, s);
    if (!base) continue;
    for (const m of allMembers(files, base, seen)) {
      // Private members are not inherited.
      if (!m.isPrivate && !own.some((o) => o.name === m.name && o.kind === m.kind)) own.push(m);
    }
  }
  return own;
}

/** The class whose body contains `offset` (the innermost one). */
function enclosingClass(code: string, offset: number): string | undefined {
  let best: { name: string; start: number } | undefined;
  for (const m of code.matchAll(
    new RegExp(`\\b(?:class|interface|enum|record|struct)\\s+(${IDENT})`, 'g'),
  )) {
    const open = code.indexOf('{', m.index);
    if (open < 0 || open > offset) continue;
    const close = matching(code, open, '{', '}');
    if ((close < 0 || close >= offset) && (!best || m.index > best.start))
      best = { name: m[1]!, start: m.index };
  }
  return best?.name;
}

/** The declared type of a local, parameter or field named `name`, seen from `offset`. */
export function declaredType(code: string, offset: number, name: string): string | undefined {
  const escaped = name.replace(/\$/g, '\\$');
  const pattern = new RegExp(
    `([A-Za-z_$][\\w$.]*(?:\\s*<[^;{}()=]*?>)?(?:\\s*\\[\\s*\\])*\\??)\\s+${escaped}\\s*(?=[=;,):]|$|\\bin\\b)`,
    'gm',
  );
  let before: { type: string; at: number } | undefined;
  let after: { type: string; at: number } | undefined;
  for (const m of code.matchAll(pattern)) {
    const type = m[1]!.trim();
    if (NOT_TYPES.has(type) || /^(?:public|private|protected|final|static)$/.test(type)) continue;
    // `name =` after `this.` is an assignment, not a declaration.
    if (/\.\s*$/.test(code.slice(0, m.index))) continue;
    if (m.index < offset) before = { type, at: m.index };
    else after ??= { type, at: m.index };
  }
  const found = before ?? after;
  if (!found) return undefined;
  if (found.type === 'var') {
    const init = new RegExp(`\\bvar\\s+${escaped}\\s*=\\s*new\\s+([\\w$.]+)`).exec(
      code.slice(found.at),
    );
    return init?.[1];
  }
  return found.type;
}

/** `a.b(x).c.` before the cursor → [{a}, {b, call}, {c}]; undefined when it is not that shape. */
export function receiverChain(
  code: string,
  dot: number,
): { parts: { name: string; call: boolean }[]; isNew: boolean } | undefined {
  const parts: { name: string; call: boolean }[] = [];
  let i = dot - 1;
  const skip = () => {
    while (i >= 0 && /\s/.test(code[i]!)) i--;
  };
  for (;;) {
    skip();
    let call = false;
    if (code[i] === ')') {
      let depth = 0;
      for (; i >= 0; i--) {
        if (code[i] === ')') depth++;
        else if (code[i] === '(' && --depth === 0) break;
      }
      i--;
      skip();
      call = true;
    }
    const end = i + 1;
    while (i >= 0 && /[\w$]/.test(code[i]!)) i--;
    const name = code.slice(i + 1, end);
    if (!name || /^\d/.test(name)) return undefined;
    parts.unshift({ name, call });
    skip();
    if (code[i] === '.') {
      i--;
      continue;
    }
    const isNew = /\bnew\s*$/.test(code.slice(Math.max(0, i - 4), i + 1));
    return { parts, isNew };
  }
}

/**
 * What to offer after the `.` at `dot` in `path`: the members of the project class
 * the expression before it is (resolved through declared types), or just its type
 * name when that is not a project class.
 */
export function membersAt(
  files: Readonly<Record<string, string>>,
  path: string,
  dot: number,
): MemberLookup | undefined {
  const source = files[path];
  if (source === undefined) return undefined;
  const code = blankJava(source);
  const chain = receiverChain(code, dot);
  if (!chain || chain.parts.length === 0) return undefined;
  const here = enclosingClass(code, dot);

  const lookup = (type: string | undefined, isStatic: boolean): MemberLookup | undefined => {
    if (!type) return undefined;
    const name = simpleType(type);
    if (name.endsWith('[]')) return { type: name, isStatic: false, members: [] };
    const info = findClass(files, name, path);
    if (!info) return { type: name, isStatic, members: [] };
    const members = allMembers(files, info).filter(
      (m) =>
        (!m.isPrivate || info.path === path) && (isStatic ? m.isStatic : m.kind !== 'constant'),
    );
    return { info, type: name, isStatic, members };
  };

  const [head, ...rest] = chain.parts;
  let current: MemberLookup | undefined;
  if (chain.isNew) current = lookup(head!.name, false);
  else if (head!.name === 'this') current = lookup(here, false);
  else if (head!.call) {
    const m = here
      ? lookup(here, false)?.members.find((x) => x.name === head!.name && x.kind === 'method')
      : undefined;
    current = lookup(m?.type, false);
  } else {
    const type = declaredType(code, dot, head!.name);
    if (type) current = lookup(type, false);
    else if (/^[A-Z]/.test(head!.name)) current = lookup(head!.name, true);
    else if (here) {
      // A field of the enclosing class (or one it inherits) without `this.`.
      const m = lookup(here, false)?.members.find(
        (x) => x.name === head!.name && x.kind !== 'method',
      );
      current = lookup(m?.type, false);
    }
  }
  for (const part of rest) {
    if (!current?.info) return undefined;
    const named = current.members.filter((x) => x.name === part.name);
    const m = named.find((x) => (x.kind === 'method') === part.call) ?? named[0];
    if (!m) return undefined;
    current = lookup(m.type, false);
  }
  return current;
}
