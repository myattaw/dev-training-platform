// Reference solution. Private: used only to prove the tests are correct.
func applyEdits(_ commands: [String]) -> String {
    // Characters before the cursor, and characters after it.
    var before: [Character] = []
    var after: [Character] = []
    for command in commands {
        let parts = command.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: false)
        let name = parts[0]
        let arg = parts.count > 1 ? String(parts[1]) : ""
        if name == "type" && parts.count > 1 {
            before += arg
            continue
        }
        if name == "home" {
            after = before + after
            before = []
            continue
        }
        if name == "end" {
            before += after
            after = []
            continue
        }
        guard !arg.isEmpty, arg.allSatisfy({ $0 >= "0" && $0 <= "9" }) else { continue }
        let n = Int(arg) ?? Int.max  // a huge count means "as many as there are"
        switch name {
        case "left":
            let k = min(n, before.count)
            after = Array(before.suffix(k)) + after
            before.removeLast(k)
        case "right":
            let k = min(n, after.count)
            before += after.prefix(k)
            after.removeFirst(k)
        case "backspace":
            before.removeLast(min(n, before.count))
        case "delete":
            after.removeFirst(min(n, after.count))
        default:
            break
        }
    }
    return String(before + after)
}
