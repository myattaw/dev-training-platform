// Reference solution. Private: used only to prove the tests are correct.
final class EditHistory {
    private struct Edit {
        let typed: Bool
        let text: String
    }

    private var text = ""
    private var done: [Edit] = []
    private var undone: [Edit] = []

    func type(_ value: String) {
        if !value.isEmpty { record(Edit(typed: true, text: value)) }
    }

    func erase(_ count: Int) {
        let removed = String(text.suffix(max(0, count)))
        if !removed.isEmpty { record(Edit(typed: false, text: removed)) }
    }

    func undo() -> Bool {
        guard let edit = done.popLast() else { return false }
        apply(Edit(typed: !edit.typed, text: edit.text))
        undone.append(edit)
        return true
    }

    func redo() -> Bool {
        guard let edit = undone.popLast() else { return false }
        apply(edit)
        done.append(edit)
        return true
    }

    func getText() -> String {
        text
    }

    private func record(_ edit: Edit) {
        apply(edit)
        done.append(edit)
        undone.removeAll()
    }

    private func apply(_ edit: Edit) {
        if edit.typed {
            text += edit.text
        } else {
            text.removeLast(edit.text.count)
        }
    }
}
