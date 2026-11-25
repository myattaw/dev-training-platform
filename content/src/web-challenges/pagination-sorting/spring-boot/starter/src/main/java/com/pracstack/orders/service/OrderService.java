package com.pracstack.orders.service;

import com.pracstack.orders.data.OrderRepository;
import com.pracstack.orders.model.Order;
import com.pracstack.orders.model.PagedResult;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;

/** Pages through the order history. */
@Service
public class OrderService {
    public static final int DEFAULT_PAGE_SIZE = 10;
    public static final int MAX_PAGE_SIZE = 50;
    public static final List<String> SORT_FIELDS = List.of("id", "customer", "total", "orderDate");

    private final OrderRepository repository;

    public OrderService(OrderRepository repository) {
        this.repository = repository;
    }

    /**
     * One page of orders. Every argument is the raw query-string value, or null
     * when the parameter is missing.
     */
    public PageResult getPage(String page, String pageSize, String sort, String direction) {
        // TODO: apply the defaults, validate the four parameters, sort with id as the
        // tie-breaker, then take the requested page and compute the totals.
        // For now: always the first ten orders by id, with placeholder totals.
        List<Order> all = repository.findAll();
        List<Order> first = all.stream()
                .sorted(Comparator.comparingLong(Order::id))
                .limit(DEFAULT_PAGE_SIZE)
                .toList();
        return new PageResult.Found(new PagedResult<>(first, 1, DEFAULT_PAGE_SIZE, all.size(), 1));
    }
}
