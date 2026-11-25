package com.pracstack.inventory.data;

import com.pracstack.inventory.model.Item;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;
import org.springframework.stereotype.Repository;

/** In-memory storage by SKU, seeded with three items. Thread-safe. */
@Repository
public class ItemRepository {
    private final Map<String, Item> items = new HashMap<>(Map.of(
            "KBD-101", new Item("KBD-101", "Mechanical keyboard", 25),
            "MON-202", new Item("MON-202", "27-inch monitor", 8),
            "CBL-303", new Item("CBL-303", "USB-C cable", 140)));

    public synchronized List<Item> findAll() {
        return items.values().stream().sorted(Comparator.comparing(Item::sku)).toList();
    }

    public synchronized Optional<Item> findBySku(String sku) {
        return Optional.ofNullable(items.get(sku));
    }

    public synchronized void save(Item item) {
        items.put(item.sku(), item);
    }

    /** Runs the action while no other change can happen. */
    public synchronized <T> T atomically(Supplier<T> action) {
        return action.get();
    }
}
