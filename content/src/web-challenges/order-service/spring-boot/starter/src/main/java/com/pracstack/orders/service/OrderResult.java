package com.pracstack.orders.service;

import com.pracstack.orders.model.Order;
import java.util.Map;

/** The outcome of placing an order. */
public sealed interface OrderResult {
    record Created(Order order) implements OrderResult {}

    /**
     * Invalid input. Keys: "customerId" to messages, and "lines" to either
     * messages (the list itself is missing or empty) or one error object per
     * submitted line, in order (an empty object for a valid line), e.g.
     * [ {}, { "productId": ["Unknown product."] } ].
     */
    record Invalid(Map<String, Object> errors) implements OrderResult {}

    /** Not enough stock for this product (the first one in line order). */
    record InsufficientStock(long productId) implements OrderResult {}
}
