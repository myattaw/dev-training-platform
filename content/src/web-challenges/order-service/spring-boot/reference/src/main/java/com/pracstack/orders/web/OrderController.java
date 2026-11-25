package com.pracstack.orders.web;

import com.pracstack.orders.model.CreateOrderRequest;
import com.pracstack.orders.model.Order;
import com.pracstack.orders.service.OrderResult;
import com.pracstack.orders.service.OrderService;
import java.net.URI;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orders")
public class OrderController {
    private final OrderService orders;

    public OrderController(OrderService orders) {
        this.orders = orders;
    }

    @GetMapping("/{id}")
    public ResponseEntity<Order> getById(@PathVariable long id) {
        return ResponseEntity.of(orders.findById(id));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody CreateOrderRequest request) {
        return switch (orders.place(request)) {
            case OrderResult.Created created ->
                    ResponseEntity.created(URI.create("/api/orders/" + created.order().id()))
                            .body(created.order());
            case OrderResult.Invalid invalid ->
                    ResponseEntity.badRequest().body(Map.of("errors", invalid.errors()));
            case OrderResult.InsufficientStock stock ->
                    ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
                            "message", "Not enough stock for product " + stock.productId() + ".",
                            "productId", stock.productId()));
        };
    }
}
