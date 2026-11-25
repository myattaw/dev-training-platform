enum PracStackEntry {
    static func call(_ args: [Any]) throws -> Any? { double(try arg(args, 0)) }
    static func make(_ args: [Any]) throws -> AnyObject { throw PracStackUnknownMethod(name: "init") }
    static func invoke(_ object: AnyObject, _ method: String, _ args: [Any]) throws -> Any? {
        throw PracStackUnknownMethod(name: method)
    }
}
