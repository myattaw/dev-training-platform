// Reference solution. Private: used only to prove the tests are correct.
public static class Solution
{
    public static string ApplyEdits(string[] commands)
    {
        var text = new StringBuilder();
        var cursor = 0;
        foreach (var command in commands)
        {
            var space = command.IndexOf(' ');
            var name = space < 0 ? command : command[..space];
            var arg = space < 0 ? "" : command[(space + 1)..];

            switch (name)
            {
                case "type" when space >= 0:
                    text.Insert(cursor, arg);
                    cursor += arg.Length;
                    continue;
                case "home":
                    cursor = 0;
                    continue;
                case "end":
                    cursor = text.Length;
                    continue;
            }

            if (!TryParseCount(arg, out var n)) continue;
            switch (name)
            {
                case "left":
                    cursor -= Math.Min(n, cursor);
                    break;
                case "right":
                    cursor += Math.Min(n, text.Length - cursor);
                    break;
                case "backspace":
                    var before = Math.Min(n, cursor);
                    text.Remove(cursor - before, before);
                    cursor -= before;
                    break;
                case "delete":
                    text.Remove(cursor, Math.Min(n, text.Length - cursor));
                    break;
            }
        }
        return text.ToString();
    }

    /// <summary>A whole number written with ASCII digits only. Huge values saturate at int.MaxValue.</summary>
    private static bool TryParseCount(string arg, out int n)
    {
        n = 0;
        if (arg.Length == 0 || !arg.All(char.IsAsciiDigit)) return false;
        long value = 0;
        foreach (var digit in arg)
        {
            value = Math.Min(value * 10 + (digit - '0'), int.MaxValue);
        }
        n = (int)value;
        return true;
    }
}
