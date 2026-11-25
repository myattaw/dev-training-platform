package com.pracstack.quotes.catalog;

import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/** Read-only product catalog (a singleton). */
@Component
public class ProductCatalog {
    private final Map<String, Product> products = Map.of(
            "PEN-01", new Product("PEN-01", "Gel pen", 250),
            "NB-A5", new Product("NB-A5", "Notebook A5", 899),
            "DESK-LAMP", new Product("DESK-LAMP", "Desk lamp", 4599),
            "CHAIR-ERG", new Product("CHAIR-ERG", "Ergonomic chair", 18900));

    public Optional<Product> find(String sku) {
        return sku == null ? Optional.empty() : Optional.ofNullable(products.get(sku));
    }
}
