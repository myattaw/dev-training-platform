package com.pracstack.orders.data;

import com.pracstack.orders.model.Order;
import com.pracstack.orders.model.OrderLine;
import com.pracstack.orders.model.Product;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import org.springframework.stereotype.Repository;

/**
 * In-memory storage for products and orders (a singleton bean), seeded with the
 * product catalog. Every method is synchronized on this store. To check and
 * change several products as one atomic step, hold the same lock around the
 * whole step: {@code synchronized (store) { ... }} (the lock is re-entrant).
 */
@Repository
public class ShopStore {
    private final Map<Long, Product> products = new TreeMap<>();
    private final Map<Long, Order> orders = new HashMap<>();
    private long nextOrderId = 1;

    public ShopStore() {
        add(new Product(1, "USB-C Cable", new BigDecimal("19.99"), 500));
        add(new Product(2, "Cable Tie", new BigDecimal("0.10"), 1000));
        add(new Product(3, "Notebook", new BigDecimal("50.00"), 200));
        add(new Product(4, "Monitor Arm", new BigDecimal("199.99"), 100));
        add(new Product(5, "Limited Edition Mouse", new BigDecimal("35.00"), 3));
        add(new Product(6, "Webcam", new BigDecimal("64.95"), 40));
        add(new Product(7, "Laptop Stand", new BigDecimal("45.50"), 10));
        add(new Product(8, "Desk Mat", new BigDecimal("24.99"), 5));
    }

    private void add(Product product) {
        products.put(product.id(), product);
    }

    public synchronized List<Product> products() {
        return List.copyOf(products.values());
    }

    public synchronized Optional<Product> findProduct(long id) {
        return Optional.ofNullable(products.get(id));
    }

    /** Sets the stock of an existing product. */
    public synchronized void setStock(long productId, int stock) {
        products.put(productId, products.get(productId).withStock(stock));
    }

    /** Stores a new order with the next id and returns it. */
    public synchronized Order addOrder(
            String customerId, List<OrderLine> lines, BigDecimal subtotal, BigDecimal discount, BigDecimal total) {
        Order order = new Order(nextOrderId++, customerId, List.copyOf(lines), subtotal, discount, total);
        orders.put(order.id(), order);
        return order;
    }

    public synchronized Optional<Order> findOrder(long id) {
        return Optional.ofNullable(orders.get(id));
    }
}
