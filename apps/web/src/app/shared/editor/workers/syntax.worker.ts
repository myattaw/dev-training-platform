/// <reference lib="webworker" />
/*
 * Syntax checking for languages the browser cannot compile (C#, Java), with
 * Tree-sitter grammars compiled to WebAssembly: syntax errors, and names used
 * but declared nowhere in the file. Types and members are checked by the real
 * compiler when the code runs on the server.
 *
 * Workers get the worker Content-Security-Policy, which allows compiling
 * WebAssembly but denies all network access, so the page fetches the
 * runtime and grammars and passes their bytes in (see syntax-checker.ts).
 */
import { Language, type Node, Parser } from 'web-tree-sitter';
import type { SyntaxRequest, SyntaxResponse } from './syntax.models';
import { undefinedNames } from './undefined-names';

/** Reported per check, so a badly broken file stays readable. */
const MAX_ERRORS = 20;

let ready: Promise<void> | undefined;
const parsers = new Map<string, Parser>();

addEventListener('message', ({ data }: MessageEvent<SyntaxRequest>) => {
  void handle(data).then(
    (response) => postMessage(response),
    (err: unknown) =>
      postMessage({
        id: data.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      } satisfies SyntaxResponse),
  );
});

async function handle(request: SyntaxRequest): Promise<SyntaxResponse> {
  ready ??= Parser.init({ wasmBinary: request.runtime });
  await ready;
  let parser = parsers.get(request.language);
  if (!parser) {
    if (!request.grammar) throw new Error(`No grammar for ${request.language}.`);
    parser = new Parser();
    parser.setLanguage(await Language.load(new Uint8Array(request.grammar)));
    parsers.set(request.language, parser);
  }
  const tree = parser.parse(request.code);
  if (!tree) return { id: request.id, ok: true, diagnostics: [] };
  try {
    const diagnostics: { line: number; column: number; message: string }[] = [];
    collect(tree.rootNode, diagnostics);
    // Names used but declared nowhere (`return ew;`): see undefined-names.ts.
    diagnostics.push(...undefinedNames(tree.rootNode, request.language));
    return { id: request.id, ok: true, diagnostics };
  } finally {
    tree.delete();
  }
}

function collect(node: Node, out: { line: number; column: number; message: string }[]): void {
  if (out.length >= MAX_ERRORS) return;
  if (node.isMissing) {
    out.push({ ...position(node), message: `Syntax error: missing ${describe(node.type)}.` });
    return;
  }
  if (node.isError) {
    const text = node.text.trim().split('\n')[0] ?? '';
    out.push({
      ...position(node),
      message: text
        ? `Syntax error: unexpected ${JSON.stringify(text.length > 40 ? `${text.slice(0, 40)}…` : text)}.`
        : 'Syntax error.',
    });
    return;
  }
  if (!node.hasError) return;
  const before = out.length;
  for (const child of node.children) if (child) collect(child, out);
  if (out.length === before) {
    // The error is in a hidden token the tree does not list as a child, e.g. the
    // missing name in `e.;` (an identifier whose only token is MISSING).
    out.push({
      ...position(node),
      message:
        node.startIndex === node.endIndex
          ? `Syntax error: missing ${describe(node.type)}.`
          : `Syntax error in this ${describe(node.type)}.`,
    });
  }
}

const position = (node: Node) => ({
  line: node.startPosition.row + 1,
  column: node.startPosition.column + 1,
});

/** Grammar node types read as words: `identifier`, `";"` → `";"`. */
function describe(type: string): string {
  return /^[a-z_]+$/.test(type) ? type.replace(/_/g, ' ') : JSON.stringify(type);
}
