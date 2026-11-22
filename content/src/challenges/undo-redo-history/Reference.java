// Reference solution. Private: used only to prove the tests are correct.
import java.util.ArrayDeque;
import java.util.Deque;

class EditHistory {
    private record Edit(boolean typed, String text) { }

    private final StringBuilder text = new StringBuilder();
    private final Deque<Edit> done = new ArrayDeque<>();
    private final Deque<Edit> undone = new ArrayDeque<>();

    EditHistory() {
    }

    void type(String value) {
        if (value.isEmpty()) return;
        Edit edit = new Edit(true, value);
        apply(edit);
        done.push(edit);
        undone.clear();
    }

    void erase(int count) {
        int start = Math.max(0, text.length() - count);
        String removed = text.substring(start);
        if (removed.isEmpty()) return;
        Edit edit = new Edit(false, removed);
        apply(edit);
        done.push(edit);
        undone.clear();
    }

    boolean undo() {
        if (done.isEmpty()) return false;
        Edit edit = done.pop();
        apply(new Edit(!edit.typed(), edit.text()));
        undone.push(edit);
        return true;
    }

    boolean redo() {
        if (undone.isEmpty()) return false;
        Edit edit = undone.pop();
        apply(edit);
        done.push(edit);
        return true;
    }

    String getText() {
        return text.toString();
    }

    private void apply(Edit edit) {
        if (edit.typed()) text.append(edit.text());
        else text.setLength(text.length() - edit.text().length());
    }
}
