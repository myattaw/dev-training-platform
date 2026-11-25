package com.pracstack.orders.model;

import java.math.BigDecimal;
import java.util.List;

/** An order as stored and returned by the API. Amounts have 2 decimal places. */
public record Order(
        long id,
        String customerId,
        List<OrderLine> lines,
        BigDecimal subtotal,
        BigDecimal discount,
        BigDecimal total) {}
