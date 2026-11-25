/*
 * Swift adapters (support code). Swift cannot call a function or method by name at
 * run time, so each challenge ships a small typed adapter that converts the JSON
 * test arguments (`try arg(args, 0)` infers the parameter type) and calls the
 * learner's code. Public and read-only; see packages/code-runner/docker/swift.
 */

/** Adapter for function-style tests: `call` is the Swift expression that calls the learner's function. */
export function callAdapter(call: string): string {
  return `// Calls your function with each test's input.
enum PracStackEntry {
    static func call(_ args: [Any]) throws -> Any? {
        ${call}
    }

    // This challenge has no class to construct.
    static func make(_ args: [Any]) throws -> AnyObject {
        throw PracStackUnknownMethod(name: "init")
    }

    static func invoke(_ object: AnyObject, _ method: String, _ args: [Any]) throws -> Any? {
        throw PracStackUnknownMethod(name: method)
    }
}
`;
}

/**
 * Adapter for class-style tests. `make` constructs the learner's class; each
 * method maps a test step name to a Swift statement list that calls it on
 * `object` and returns its value (`PracStackVoid()` for methods without one).
 */
export function operationsAdapter(
  className: string,
  make: string,
  methods: Readonly<Record<string, string>>,
): string {
  const cases = Object.entries(methods)
    .map(([name, body]) => `        case "${name}": ${body}`)
    .join('\n');
  return `// Creates your ${className} and calls its methods, one test step at a time.
enum PracStackEntry {
    // This challenge has no function to call.
    static func call(_ args: [Any]) throws -> Any? {
        throw PracStackUnknownMethod(name: "call")
    }

    static func make(_ args: [Any]) throws -> AnyObject {
        ${make}
    }

    static func invoke(_ object: AnyObject, _ method: String, _ args: [Any]) throws -> Any? {
        let object = object as! ${className}
        switch method {
${cases}
        default: throw PracStackUnknownMethod(name: method)
        }
    }
}
`;
}
