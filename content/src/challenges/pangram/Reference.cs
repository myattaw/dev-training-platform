// Reference solution. Private: used only to prove the tests are correct.
public static class Solution
{
    public static bool IsPangram(string sentence)
    {
        var seen = new HashSet<char>();
        foreach (var c in sentence)
        {
            var lower = char.ToLowerInvariant(c);
            if (char.IsAsciiLetterLower(lower)) seen.Add(lower);
        }
        return seen.Count == 26;
    }
}
