package com.pracstack.inventory.web;

import com.pracstack.inventory.model.CreateItemRequest;
import com.pracstack.inventory.model.Item;
import com.pracstack.inventory.model.ReservationRequest;
import com.pracstack.inventory.service.InventoryService;
import java.net.URI;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The HTTP layer only maps requests to the service. It does not catch
 * exceptions: errors are turned into responses in one central place.
 */
@RestController
@RequestMapping("/api/items")
public class ItemController {
    private final InventoryService inventory;

    public ItemController(InventoryService inventory) {
        this.inventory = inventory;
    }

    @GetMapping
    public List<Item> getAll() {
        return inventory.findAll();
    }

    @GetMapping("/{sku}")
    public Item get(@PathVariable String sku) {
        return inventory.get(sku);
    }

    @PostMapping
    public ResponseEntity<Item> create(@RequestBody CreateItemRequest request) {
        Item item = inventory.create(request);
        return ResponseEntity.created(URI.create("/api/items/" + item.sku())).body(item);
    }

    @PostMapping("/{sku}/reservations")
    public Item reserve(@PathVariable String sku, @RequestBody ReservationRequest request) {
        return inventory.reserve(sku, request);
    }

    @GetMapping("/{sku}/supplier-quote")
    public Map<String, Object> supplierQuote(@PathVariable String sku) {
        return inventory.supplierQuote(sku);
    }
}
