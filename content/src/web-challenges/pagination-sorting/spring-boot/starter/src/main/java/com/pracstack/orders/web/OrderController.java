package com.pracstack.orders.web;

import com.pracstack.orders.service.OrderService;
import com.pracstack.orders.service.PageResult;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orders")
public class OrderController {
    private final OrderService orders;

    public OrderController(OrderService orders) {
        this.orders = orders;
    }

    // GET /api/orders
    // TODO: read the optional query parameters page, pageSize, sort and direction,
    // and answer 400 with { "errors": { parameter: [messages] } } when they are invalid.
    @GetMapping
    public ResponseEntity<?> getPage() {
        return switch (orders.getPage(null, null, null, null)) {
            case PageResult.Found found -> ResponseEntity.ok(found.page());
            case PageResult.Invalid invalid -> ResponseEntity.internalServerError().build();
        };
    }
}
