// Reference solution. Private: used only to prove the tests are correct.
func isBalanced(_ text: String) -> Bool {
    let pairs: [Character: Character] = [")": "(", "]": "[", "}": "{"]
    var stack: [Character] = []
    for c in text {
        if "([{".contains(c) {
            stack.append(c)
        } else if let opening = pairs[c], stack.popLast() != opening {
            return false
        }
    }
    return stack.isEmpty
}
