package com.pracstack.products.data;

import com.pracstack.products.model.Product;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Repository;

/** The catalog, seeded with fifteen products. It never changes while the application runs. */
@Repository
public class InMemoryProductRepository implements ProductRepository {
    private static final List<Product> PRODUCTS = List.of(
            product(1, "Wireless Mouse", "Electronics", "24.99", true),
            product(2, "Mechanical Keyboard", "Electronics", "89.00", true),
            product(3, "USB-C Hub", "Electronics", "39.50", false),
            product(4, "Noise Cancelling Headphones", "Electronics", "199.99", true),
            product(5, "Desk Lamp", "Office", "34.95", true),
            product(6, "Ergonomic Office Chair", "Office", "249.00", false),
            product(7, "Standing Desk Mat", "Office", "19.99", true),
            product(8, "Notebook Set", "Office", "12.50", true),
            product(9, "Chef Knife", "Kitchen", "59.90", true),
            product(10, "Cast Iron Skillet", "Kitchen", "44.00", true),
            product(11, "Coffee Grinder", "Kitchen", "19.99", false),
            product(12, "Camping Lantern", "Outdoor", "29.99", true),
            product(13, "Hiking Backpack", "Outdoor", "119.00", true),
            product(14, "Water Bottle", "Outdoor", "15.00", true),
            product(15, "Lamp Oil Refill", "Outdoor", "9.99", true));

    private static Product product(long id, String name, String category, String price, boolean inStock) {
        return new Product(id, name, category, new BigDecimal(price), inStock);
    }

    @Override
    public List<Product> findAll() {
        return PRODUCTS;
    }

    @Override
    public Optional<Product> findById(long id) {
        return PRODUCTS.stream().filter(p -> p.id() == id).findFirst();
    }
}
