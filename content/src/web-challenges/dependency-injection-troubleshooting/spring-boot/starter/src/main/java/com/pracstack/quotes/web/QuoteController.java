package com.pracstack.quotes.web;

import com.pracstack.quotes.catalog.Product;
import com.pracstack.quotes.catalog.ProductCatalog;
import com.pracstack.quotes.pricing.QuoteService;
import java.util.AbstractMap.SimpleEntry;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/quotes")
public class QuoteController {
    private final ProductCatalog catalog;
    private final QuoteService quotes;

    public QuoteController(ProductCatalog catalog, QuoteService quotes) {
        this.catalog = catalog;
        this.quotes = quotes;
    }

    // POST /api/quotes
    @PostMapping
    public ResponseEntity<?> create(@RequestBody QuoteRequest request) {
        List<String> errors = new ArrayList<>();
        List<Map.Entry<Product, Integer>> lines = new ArrayList<>();
        List<QuoteRequest.Line> requested = request.lines() == null ? List.of() : request.lines();
        if (requested.isEmpty()) errors.add("At least one line is required.");
        for (QuoteRequest.Line line : requested) {
            String sku = line == null ? null : line.sku();
            Optional<Product> product = catalog.find(sku);
            if (product.isEmpty()) {
                errors.add("Unknown product '" + sku + "'.");
            } else if (line.quantity() == null || line.quantity() < 1 || line.quantity() > 999) {
                errors.add("Quantity for " + sku + " must be between 1 and 999.");
            } else {
                lines.add(new SimpleEntry<>(product.get(), line.quantity()));
            }
        }
        if (!errors.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("errors", Map.of("lines", errors)));
        }
        return ResponseEntity.ok(quotes.price(lines));
    }
}
