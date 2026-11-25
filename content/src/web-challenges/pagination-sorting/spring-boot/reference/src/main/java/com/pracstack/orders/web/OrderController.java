package com.pracstack.orders.web;

import com.pracstack.orders.service.OrderService;
import com.pracstack.orders.service.PageResult;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orders")
public class OrderController {
    private final OrderService orders;

    public OrderController(OrderService orders) {
        this.orders = orders;
    }

    // GET /api/orders?page=&pageSize=&sort=&direction=
    @GetMapping
    public ResponseEntity<?> getPage(
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String pageSize,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String direction) {
        return switch (orders.getPage(page, pageSize, sort, direction)) {
            case PageResult.Found found -> ResponseEntity.ok(found.page());
            case PageResult.Invalid invalid ->
                    ResponseEntity.badRequest().body(Map.of("errors", invalid.errors()));
        };
    }
}
