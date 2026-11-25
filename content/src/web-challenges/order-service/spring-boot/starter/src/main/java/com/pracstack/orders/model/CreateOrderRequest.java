package com.pracstack.orders.model;

import java.util.List;

/** The JSON body of POST /api/orders. Any field may be missing (null). */
public record CreateOrderRequest(String customerId, List<OrderLineRequest> lines) {
    /** One requested line. Any field may be missing (null). */
    public record OrderLineRequest(Long productId, Integer quantity) {}
}
