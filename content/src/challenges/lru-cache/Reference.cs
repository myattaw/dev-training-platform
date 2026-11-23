// Reference solution. Private: used only to prove the tests are correct.
public class LRUCache
{
    private readonly int _capacity;
    // Most recently used first; the dictionary finds a key's node in O(1).
    private readonly LinkedList<(int Key, int Value)> _order = new();
    private readonly Dictionary<int, LinkedListNode<(int Key, int Value)>> _nodes = new();

    public LRUCache(int capacity)
    {
        _capacity = capacity;
    }

    public int Get(int key)
    {
        if (!_nodes.TryGetValue(key, out var node)) return -1;
        _order.Remove(node);
        _order.AddFirst(node);
        return node.Value.Value;
    }

    public void Put(int key, int value)
    {
        if (_nodes.TryGetValue(key, out var existing))
        {
            _order.Remove(existing);
        }
        _nodes[key] = _order.AddFirst((key, value));
        if (_nodes.Count > _capacity)
        {
            var oldest = _order.Last!.Value;
            _order.RemoveLast();
            _nodes.Remove(oldest.Key);
        }
    }
}
