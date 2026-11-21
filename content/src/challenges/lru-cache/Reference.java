// Reference solution. Private: used only to prove the tests are correct.
import java.util.LinkedHashMap;
import java.util.Map;

class LRUCache {
    private final int capacity;
    private final LinkedHashMap<Integer, Integer> entries;

    LRUCache(int capacity) {
        this.capacity = capacity;
        // Access order: get() and put() move a key to the end; the eldest is least recently used.
        this.entries = new LinkedHashMap<>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<Integer, Integer> eldest) {
                return size() > LRUCache.this.capacity;
            }
        };
    }

    int get(int key) {
        Integer value = entries.get(key);
        return value == null ? -1 : value;
    }

    void put(int key, int value) {
        entries.put(key, value);
    }
}
