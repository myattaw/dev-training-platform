// Reference solution. Private: used only to prove the tests are correct.
import java.util.ArrayDeque;
import java.util.Deque;

class Solution {
    static boolean isBalanced(String text) {
        Deque<Character> stack = new ArrayDeque<>();
        for (char c : text.toCharArray()) {
            switch (c) {
                case '(', '[', '{' -> stack.push(c);
                case ')' -> { if (stack.isEmpty() || stack.pop() != '(') return false; }
                case ']' -> { if (stack.isEmpty() || stack.pop() != '[') return false; }
                case '}' -> { if (stack.isEmpty() || stack.pop() != '{') return false; }
                default -> { }
            }
        }
        return stack.isEmpty();
    }
}
