package com.pracstack.orders.service;

import com.pracstack.orders.data.ShopStore;
import com.pracstack.orders.model.CreateOrderRequest;
import com.pracstack.orders.model.CreateOrderRequest.OrderLineRequest;
import com.pracstack.orders.model.Order;
import com.pracstack.orders.model.OrderLine;
import com.pracstack.orders.model.Product;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
        String customerId = request.customerId() == null ? "" : request.customerId().strip();
        Map<String, Object> errors = new LinkedHashMap<>();
        if (customerId.isEmpty() || customerId.length() > 50) {
            errors.put("customerId", List.of("Customer id is required (1-50 characters)."));
        }

        List<OrderLineRequest> lines = request.lines() == null ? List.of() : request.lines();
        if (lines.isEmpty()) {
            errors.put("lines", List.of("An order needs at least one line."));
        } else {
            List<Map<String, List<String>>> lineErrors = new ArrayList<>();
            boolean anyLineInvalid = false;
            for (OrderLineRequest line : lines) {
                Map<String, List<String>> lineError = new LinkedHashMap<>();
                if (line == null || line.productId() == null || store.findProduct(line.productId()).isEmpty()) {
                    lineError.put("productId", List.of("Unknown product."));
                }
                if (line == null || line.quantity() == null || line.quantity() < 1 || line.quantity() > 100) {
                    lineError.put("quantity", List.of("Quantity must be from 1 to 100."));
                }
                anyLineInvalid |= !lineError.isEmpty();
                lineErrors.add(lineError);
            }
            if (anyLineInvalid) errors.put("lines", lineErrors);
        }
        if (!errors.isEmpty()) return new OrderResult.Invalid(errors);

        synchronized (store) {
            // Check the whole order first: quantities of the same product add up.
            Map<Long, Integer> needed = new LinkedHashMap<>();
            for (OrderLineRequest line : lines) needed.merge(line.productId(), line.quantity(), Integer::sum);
            for (OrderLineRequest line : lines) {
                if (store.findProduct(line.productId()).orElseThrow().stock() < needed.get(line.productId())) {
                    return new OrderResult.InsufficientStock(line.productId());
                }
            }

            List<OrderLine> orderLines = new ArrayList<>();
            BigDecimal subtotal = BigDecimal.ZERO.setScale(2);
            for (OrderLineRequest line : lines) {
                Product product = store.findProduct(line.productId()).orElseThrow();
                BigDecimal lineTotal = BigDecimal.valueOf(product.unitPrice().doubleValue() * line.quantity());
                orderLines.add(new OrderLine(product.id(), product.name(), line.quantity(), product.unitPrice(), lineTotal));
                subtotal = subtotal.add(lineTotal);
            }
            BigDecimal discount = subtotal.compareTo(DISCOUNT_THRESHOLD) >= 0
                    ? subtotal.multiply(DISCOUNT_RATE).setScale(2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO.setScale(2);
            BigDecimal total = subtotal.subtract(discount);

            // Only now change anything: every check has passed.
            needed.forEach((productId, quantity) ->
                    store.setStock(productId, store.findProduct(productId).orElseThrow().stock() - quantity));
            return new OrderResult.Created(store.addOrder(customerId, orderLines, subtotal, discount, total));
        }
    }
}
