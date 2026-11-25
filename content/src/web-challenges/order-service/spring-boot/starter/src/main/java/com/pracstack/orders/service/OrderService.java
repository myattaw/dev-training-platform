package com.pracstack.orders.service;

import com.pracstack.orders.data.ShopStore;
import com.pracstack.orders.model.CreateOrderRequest;
import com.pracstack.orders.model.Order;
import java.math.BigDecimal;
import java.util.Optional;
import org.springframework.stereotype.Service;

/** Business rules for orders. */
@Service
public class OrderService {
    public static final BigDecimal DISCOUNT_THRESHOLD = new BigDecimal("200.00");
    public static final BigDecimal DISCOUNT_RATE = new BigDecimal("0.10");

    private final ShopStore store;

    public OrderService(ShopStore store) {
        this.store = store;
    }

    public Optional<Order> findById(long id) {
        return store.findOrder(id);
    }

    public OrderResult place(CreateOrderRequest request) {
        // TODO:
        // 1. Validate: customerId (trimmed, 1-50 characters), at least one line,
        //    every line with a known productId and a quantity from 1 to 100.
        //    Report every invalid field (see OrderResult.Invalid for the shape).
        // 2. Check stock for the whole order (quantities of the same product add up).
        // 3. Compute line totals, subtotal, discount (half-up to 2 places) and total.
        // 4. Reduce stock and store the order, all or nothing.
        throw new UnsupportedOperationException("Not implemented yet");
    }
}
