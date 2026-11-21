// Reference solution. Private: used only to prove the tests are correct.
class Solution {
    static boolean isPangram(String sentence) {
        return sentence.toLowerCase().chars().filter(c -> c >= 'a' && c <= 'z').distinct().count() == 26;
    }
}
