package com.pracstack.orders.web;

import com.pracstack.orders.service.OrderService;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orders")
public class OrderController {
    private final OrderService orders;

    public OrderController(OrderService orders) {
        this.orders = orders;
    }

    // TODO: GET /api/orders/{id}: 200 with the order, or 404.

    // TODO: POST /api/orders: 201 with a Location header and the order,
    // 400 with { "errors": { ... } } for invalid input,
    // 409 with { "message", "productId" } when a product does not have enough stock.
}
