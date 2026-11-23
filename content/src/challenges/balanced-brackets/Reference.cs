// Reference solution. Private: used only to prove the tests are correct.
public static class Solution
{
    public static bool IsBalanced(string text)
    {
        var open = new Stack<char>();
        foreach (var c in text)
        {
            switch (c)
            {
                case '(' or '[' or '{':
                    open.Push(c);
                    break;
                case ')' or ']' or '}':
                    var expected = c switch { ')' => '(', ']' => '[', _ => '{' };
                    if (!open.TryPop(out var top) || top != expected) return false;
                    break;
            }
        }
        return open.Count == 0;
    }
}
