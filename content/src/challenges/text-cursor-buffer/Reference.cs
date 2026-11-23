// Reference solution. Private: used only to prove the tests are correct.
public class TextBuffer
{
    // Characters before the cursor, in order, and characters after it with the one
    // next to the cursor on top: typing, backspace and moving touch only the ends.
    private readonly List<char> _before = [];
    private readonly Stack<char> _after = new();

    public void Insert(string text) => _before.AddRange(text);

    public int Backspace(int count)
    {
        var k = Math.Min(count, _before.Count);
        _before.RemoveRange(_before.Count - k, k);
        return k;
    }

    public int Move(int offset)
    {
        for (; offset < 0 && _before.Count > 0; offset++)
        {
            _after.Push(_before[^1]);
            _before.RemoveAt(_before.Count - 1);
        }
        for (; offset > 0 && _after.Count > 0; offset--)
        {
            _before.Add(_after.Pop());
        }
        return _before.Count;
    }

    public string TextAround(int radius)
    {
        var left = _before.Skip(Math.Max(0, _before.Count - radius));
        var right = _after.Take(radius); // a Stack enumerates from the top: nearest first
        return string.Concat(left) + "|" + string.Concat(right);
    }

    public string GetText() => string.Concat(_before) + string.Concat(_after);

    public int GetCursor() => _before.Count;
}
