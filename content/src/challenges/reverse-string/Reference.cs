// Reference solution. Private: used only to prove the tests are correct.
public static class Solution
{
    public static string Reverse(string input)
    {
        // Reverse by Unicode scalar value, so surrogate pairs (such as emoji) stay intact.
        var runes = input.EnumerateRunes().ToArray();
        Array.Reverse(runes);
        var result = new StringBuilder(input.Length);
        foreach (var rune in runes) result.Append(rune.ToString());
        return result.ToString();
    }
}
