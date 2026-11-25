package com.pracstack.inventory.service;

import com.pracstack.inventory.data.ItemRepository;
import com.pracstack.inventory.errors.ConflictException;
import com.pracstack.inventory.errors.InvalidInputException;
import com.pracstack.inventory.errors.NotFoundException;
import com.pracstack.inventory.model.CreateItemRequest;
import com.pracstack.inventory.model.Item;
import com.pracstack.inventory.model.ReservationRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/**
 * Inventory rules. Failures are reported by throwing NotFoundException,
 * ConflictException or InvalidInputException (package errors).
 */
@Service
public class InventoryService {
    private static final Pattern SKU = Pattern.compile("^[A-Z]{3}-[0-9]{3}$");

    private final ItemRepository repository;
    private final SupplierGatewayClient supplier;

    public InventoryService(ItemRepository repository, SupplierGatewayClient supplier) {
        this.repository = repository;
        this.supplier = supplier;
    }

    public List<Item> findAll() {
        return repository.findAll();
    }

    public Item get(String sku) {
        return repository.findBySku(sku).orElseThrow(() -> new NotFoundException("Item " + sku + " was not found."));
    }

    public Item create(CreateItemRequest request) {
        String sku = request.sku() == null ? "" : request.sku().trim();
        String name = request.name() == null ? "" : request.name().trim();
        Integer quantity = request.quantity();
        Map<String, List<String>> fields = new LinkedHashMap<>();
        if (sku.isEmpty()) fields.put("sku", List.of("SKU is required."));
        else if (!SKU.matcher(sku).matches()) fields.put("sku", List.of("SKU must look like ABC-123."));
        if (name.isEmpty() || name.length() > 80) fields.put("name", List.of("Name is required (1-80 characters)."));
        if (quantity == null || quantity < 0 || quantity > 10_000) {
            fields.put("quantity", List.of("Quantity must be a whole number from 0 to 10000."));
        }
        if (!fields.isEmpty()) throw new InvalidInputException(fields);

        return repository.atomically(() -> {
            if (repository.findBySku(sku).isPresent()) throw new ConflictException("Item " + sku + " already exists.");
            Item item = new Item(sku, name, quantity);
            repository.save(item);
            return item;
        });
    }

    public Item reserve(String sku, ReservationRequest request) {
        Integer quantity = request.quantity();
        if (quantity == null || quantity < 1) {
            throw new InvalidInputException(Map.of("quantity", List.of("Quantity must be a whole number of at least 1.")));
        }
        return repository.atomically(() -> {
            Item item = get(sku);
            if (quantity > item.quantity()) {
                throw new ConflictException("Only " + item.quantity() + " units of " + sku + " are in stock.");
            }
            Item updated = new Item(item.sku(), item.name(), item.quantity() - quantity);
            repository.save(updated);
            return updated;
        });
    }

    public Map<String, Object> supplierQuote(String sku) {
        Item item = get(sku);
        return Map.of("sku", item.sku(), "unitPrice", supplier.quoteUnitPrice(item.sku()));
    }
}
