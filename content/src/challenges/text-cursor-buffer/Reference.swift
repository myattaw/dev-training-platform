// Reference solution. Private: used only to prove the tests are correct.
final class TextBuffer {
    /// Characters before the cursor, in order.
    private var before: [Character] = []
    /// Characters after the cursor, reversed: the last element is next to the cursor.
    private var after: [Character] = []

    func insert(_ text: String) {
        before.append(contentsOf: text)
    }

    func backspace(_ count: Int) -> Int {
        let k = min(count, before.count)
        before.removeLast(k)
        return k
    }

    func move(_ offset: Int) -> Int {
        if offset < 0 {
            for _ in 0..<min(-offset, before.count) { after.append(before.removeLast()) }
        } else {
            for _ in 0..<min(offset, after.count) { before.append(after.removeLast()) }
        }
        return before.count
    }

    func textAround(_ radius: Int) -> String {
        String(before.suffix(radius)) + "|" + String(after.suffix(radius).reversed())
    }

    func getText() -> String {
        String(before) + String(after.reversed())
    }

    func getCursor() -> Int {
        before.count
    }
}
