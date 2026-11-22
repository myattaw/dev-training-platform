// Reference solution. Private: used only to prove the tests are correct.
class TextBuffer {
    // Text before the cursor, and text after it stored in reverse,
    // so both ends next to the cursor are at the end of a builder.
    private final StringBuilder before = new StringBuilder();
    private final StringBuilder after = new StringBuilder();

    TextBuffer() {
    }

    void insert(String text) {
        before.append(text);
    }

    int backspace(int count) {
        int k = Math.min(count, before.length());
        before.setLength(before.length() - k);
        return k;
    }

    int move(int offset) {
        if (offset < 0) {
            for (int i = 0; i < -offset && before.length() > 0; i++) {
                after.append(before.charAt(before.length() - 1));
                before.setLength(before.length() - 1);
            }
        } else {
            for (int i = 0; i < offset && after.length() > 0; i++) {
                before.append(after.charAt(after.length() - 1));
                after.setLength(after.length() - 1);
            }
        }
        return before.length();
    }

    String textAround(int radius) {
        String left = before.substring(Math.max(0, before.length() - radius));
        String right = new StringBuilder(after.substring(Math.max(0, after.length() - radius)))
            .reverse()
            .toString();
        return left + "|" + right;
    }

    String getText() {
        return before.toString() + new StringBuilder(after).reverse();
    }

    int getCursor() {
        return before.length();
    }
}
