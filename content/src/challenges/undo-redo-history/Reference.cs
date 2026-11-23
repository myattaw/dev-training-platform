// Reference solution. Private: used only to prove the tests are correct.
public class EditHistory
{
    /// <summary>An edit at the end of the document: text that was typed, or text that was erased.</summary>
    private sealed record Edit(bool Typed, string Text);

    private readonly StringBuilder _text = new();
    private readonly Stack<Edit> _done = new();
    private readonly Stack<Edit> _undone = new();

    public void Type(string text)
    {
        if (text.Length == 0) return;
        Record(new Edit(Typed: true, text));
    }

    public void Erase(int count)
    {
        var k = Math.Clamp(count, 0, _text.Length);
        if (k == 0) return;
        Record(new Edit(Typed: false, _text.ToString(_text.Length - k, k)));
    }

    public bool Undo()
    {
        if (!_done.TryPop(out var edit)) return false;
        Apply(edit with { Typed = !edit.Typed });
        _undone.Push(edit);
        return true;
    }

    public bool Redo()
    {
        if (!_undone.TryPop(out var edit)) return false;
        Apply(edit);
        _done.Push(edit);
        return true;
    }

    public string GetText() => _text.ToString();

    private void Record(Edit edit)
    {
        Apply(edit);
        _done.Push(edit);
        _undone.Clear();
    }

    private void Apply(Edit edit)
    {
        if (edit.Typed) _text.Append(edit.Text);
        else _text.Length -= edit.Text.Length;
    }
}
