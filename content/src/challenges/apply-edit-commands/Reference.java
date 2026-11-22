// Reference solution. Private: used only to prove the tests are correct.
class Solution {
    static String applyEdits(String[] commands) {
        StringBuilder text = new StringBuilder();
        int cursor = 0;
        for (String command : commands) {
            int space = command.indexOf(' ');
            String name = space < 0 ? command : command.substring(0, space);
            String arg = space < 0 ? "" : command.substring(space + 1);
            if (name.equals("type") && space >= 0) {
                text.insert(cursor, arg);
                cursor += arg.length();
                continue;
            }
            if (name.equals("home")) {
                cursor = 0;
                continue;
            }
            if (name.equals("end")) {
                cursor = text.length();
                continue;
            }
            if (!arg.matches("\\d+")) continue;
            long n = Long.parseLong(arg.length() > 12 ? "999999999999" : arg);
            switch (name) {
                case "left" -> cursor = (int) Math.max(0, cursor - n);
                case "right" -> cursor = (int) Math.min(text.length(), cursor + n);
                case "backspace" -> {
                    int start = (int) Math.max(0, cursor - n);
                    text.delete(start, cursor);
                    cursor = start;
                }
                case "delete" -> text.delete(cursor, (int) Math.min(text.length(), cursor + n));
                default -> { }
            }
        }
        return text.toString();
    }
}
