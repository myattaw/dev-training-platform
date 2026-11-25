// Test entry point compiled together with the learner's Solution.swift and the
// challenge's adapter (Support.swift). Runs ONE test per process, so a crash
// (fatalError, a force-unwrapped nil, an index out of range) fails only that test.
//
// stdin:  {"nonce": "...", "test": TestInput}
// stdout: whatever the learner prints, then "\n<nonce><RawOutcome JSON>\n"
//
// The adapter (written per challenge, public and read-only) declares:
//   enum PracStackEntry {
//     static func call(_ args: [Any]) throws -> Any?                       // call tests
//     static func make(_ args: [Any]) throws -> AnyObject                  // operations tests
//     static func invoke(_ object: AnyObject, _ method: String, _ args: [Any]) throws -> Any?
//   }
// and converts arguments with `try arg(args, 0) as String` etc.
import Foundation

/// Thrown when a test input does not fit the adapter's parameter types.
struct PracStackArgumentError: Error, CustomStringConvertible {
    let description: String
}

/// Thrown by an adapter for an operations step it does not know.
struct PracStackUnknownMethod: Error, CustomStringConvertible {
    let name: String
    var description: String { "no method named \"\(name)\"" }
}

/// Marks a method that returns nothing (encoded as undefined, like a JavaScript void).
struct PracStackVoid {}

/// Values a JSON test input can be converted into.
protocol PracStackDecodable {
    static func pracstackDecode(_ value: Any) throws -> Self
}

extension Int: PracStackDecodable {
    static func pracstackDecode(_ value: Any) throws -> Int {
        if let n = value as? NSNumber, !(value is Bool) { return n.intValue }
        if let n = value as? Int { return n }
        throw PracStackArgumentError(description: "expected an integer, got \(value)")
    }
}
extension Double: PracStackDecodable {
    static func pracstackDecode(_ value: Any) throws -> Double {
        if let n = value as? NSNumber { return n.doubleValue }
        throw PracStackArgumentError(description: "expected a number, got \(value)")
    }
}
extension Bool: PracStackDecodable {
    static func pracstackDecode(_ value: Any) throws -> Bool {
        if let b = value as? Bool { return b }
        throw PracStackArgumentError(description: "expected a Boolean, got \(value)")
    }
}
extension String: PracStackDecodable {
    static func pracstackDecode(_ value: Any) throws -> String {
        if let s = value as? String { return s }
        throw PracStackArgumentError(description: "expected a string, got \(value)")
    }
}
extension Character: PracStackDecodable {
    static func pracstackDecode(_ value: Any) throws -> Character {
        if let s = value as? String, s.count == 1, let c = s.first { return c }
        throw PracStackArgumentError(description: "expected a single character, got \(value)")
    }
}
extension Array: PracStackDecodable where Element: PracStackDecodable {
    static func pracstackDecode(_ value: Any) throws -> [Element] {
        guard let items = value as? [Any] else {
            throw PracStackArgumentError(description: "expected an array, got \(value)")
        }
        return try items.map { try Element.pracstackDecode($0) }
    }
}
extension Optional: PracStackDecodable where Wrapped: PracStackDecodable {
    static func pracstackDecode(_ value: Any) throws -> Wrapped? {
        if value is NSNull { return nil }
        return try Wrapped.pracstackDecode(value)
    }
}
extension Dictionary: PracStackDecodable where Key == String, Value: PracStackDecodable {
    static func pracstackDecode(_ value: Any) throws -> [String: Value] {
        guard let object = value as? [String: Any] else {
            throw PracStackArgumentError(description: "expected an object, got \(value)")
        }
        return try object.mapValues { try Value.pracstackDecode($0) }
    }
}

/// The `index`-th argument, converted to the type the adapter asks for.
func arg<T: PracStackDecodable>(_ args: [Any], _ index: Int) throws -> T {
    guard index < args.count else {
        throw PracStackArgumentError(description: "missing argument \(index + 1)")
    }
    return try T.pracstackDecode(args[index])
}

// MARK: - Encoding results (the format of challenge-runtime/src/values.ts)

func pracstackJSONString(_ s: String) -> String {
    var out = "\""
    for scalar in s.unicodeScalars {
        switch scalar {
        case "\"": out += "\\\""
        case "\\": out += "\\\\"
        case "\n": out += "\\n"
        case "\r": out += "\\r"
        case "\t": out += "\\t"
        default:
            if scalar.value < 0x20 {
                out += String(format: "\\u%04x", scalar.value)
            } else {
                out.unicodeScalars.append(scalar)
            }
        }
    }
    return out + "\""
}

func pracstackTagged(_ tag: String) -> String { "{\"$pracstack\":\(pracstackJSONString(tag))}" }

func pracstackEncode(_ value: Any?, depth: Int = 0) -> String {
    if depth > 50 { return pracstackTagged("too-deep") }
    guard let value = value else { return "null" }
    switch value {
    case is PracStackVoid: return pracstackTagged("undefined")
    case is Void: return pracstackTagged("undefined")
    case let b as Bool: return b ? "true" : "false"
    case let i as Int:
        return abs(i) > 9_007_199_254_740_991
            ? "{\"$pracstack\":\"bigint\",\"value\":\"\(i)\"}" : String(i)
    case let i as Int64: return pracstackEncode(Int(i), depth: depth)
    case let i as Int32: return String(i)
    case let i as UInt: return pracstackEncode(Int(i), depth: depth)
    case let d as Double:
        if d.isNaN { return pracstackTagged("NaN") }
        if d.isInfinite { return pracstackTagged(d > 0 ? "Infinity" : "-Infinity") }
        if d == d.rounded() && abs(d) < 1e15 { return String(Int(d)) }
        return "\(d)"
    case let f as Float: return pracstackEncode(Double(f), depth: depth)
    case let s as String: return pracstackJSONString(s)
    case let c as Character: return pracstackJSONString(String(c))
    case let s as Substring: return pracstackJSONString(String(s))
    default: break
    }
    let mirror = Mirror(reflecting: value)
    switch mirror.displayStyle {
    case .optional:
        guard let child = mirror.children.first else { return "null" }
        return pracstackEncode(child.value, depth: depth + 1)
    case .collection, .set, .tuple:
        return "[" + mirror.children.map { pracstackEncode($0.value, depth: depth + 1) }.joined(separator: ",") + "]"
    case .dictionary:
        let pairs = mirror.children.compactMap { child -> String? in
            let pair = Mirror(reflecting: child.value).children.map { $0.value }
            guard pair.count == 2 else { return nil }
            return pracstackJSONString(String(describing: pair[0])) + ":" + pracstackEncode(pair[1], depth: depth + 1)
        }
        return "{" + pairs.sorted().joined(separator: ",") + "}"
    case .struct, .class:
        let fields = mirror.children.compactMap { child -> String? in
            guard let label = child.label, !label.hasPrefix("_") else { return nil }
            return pracstackJSONString(label) + ":" + pracstackEncode(child.value, depth: depth + 1)
        }
        return "{" + fields.joined(separator: ",") + "}"
    case .enum:
        return pracstackJSONString(String(describing: value))
    default:
        return pracstackTagged("function")
    }
}

func pracstackDescribe(_ error: Error) -> String {
    let text = String(describing: error)
    let name = String(describing: type(of: error))
    return text == name ? name : "\(name): \(text)"
}

// MARK: - Main

// Everything runs inside a function, so no global name can clash with the learner's code.
func pracstackMain() {
    let inputData = FileHandle.standardInput.readDataToEndOfFile()
    guard
        let input = try? JSONSerialization.jsonObject(with: inputData, options: [.fragmentsAllowed]) as? [String: Any],
        let nonce = input["nonce"] as? String,
        let test = input["test"] as? [String: Any],
        let kind = test["kind"] as? String
    else {
        FileHandle.standardError.write("unreadable test input\n".data(using: .utf8)!)
        exit(2)
    }

    func emit(_ json: String) {
        // print goes through the same buffered stdout as the learner's prints, so order is kept.
        print("\n" + nonce + json)
        fflush(stdout)
    }

    if kind == "call" {
        let args = test["input"] as? [Any] ?? []
        do {
            let value = try PracStackEntry.call(args)
            emit("{\"kind\":\"call\",\"value\":\(pracstackEncode(value))}")
        } catch {
            emit("{\"kind\":\"call\",\"error\":\(pracstackJSONString(pracstackDescribe(error)))}")
        }
    } else {
        let constructorArgs = test["constructorArgs"] as? [Any] ?? []
        let steps = test["steps"] as? [[String: Any]] ?? []
        var values: [String] = []
        func finish(_ error: (Int, String)?) {
            var json = "{\"kind\":\"operations\",\"values\":[\(values.joined(separator: ","))]"
            if let (step, message) = error {
                json += ",\"error\":{\"step\":\(step),\"message\":\(pracstackJSONString(message))}"
            }
            emit(json + "}")
        }
        do {
            let object = try PracStackEntry.make(constructorArgs)
            // Progress line: the object exists (see the driver's crash handling).
            emit("+")
            var failure: (Int, String)? = nil
            for (index, step) in steps.enumerated() {
                let name = step["call"] as? String ?? ""
                do {
                    let value = try PracStackEntry.invoke(object, name, step["args"] as? [Any] ?? [])
                    let encoded = pracstackEncode(value)
                    values.append(encoded)
                    // Progress line: if a later step crashes the process, the driver still knows these values.
                    emit("~" + encoded)
                } catch {
                    failure = (index, pracstackDescribe(error))
                    break
                }
            }
            finish(failure)
        } catch {
            finish((-1, pracstackDescribe(error)))
        }
    }
}

pracstackMain()
