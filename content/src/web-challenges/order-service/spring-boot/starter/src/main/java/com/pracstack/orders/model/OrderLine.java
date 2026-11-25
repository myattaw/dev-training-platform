package com.pracstack.orders.model;

import java.math.BigDecimal;

/** One line of an order: the product, its price at the time of the order, and the line total. */
public record OrderLine(long productId, String productName, int quantity, BigDecimal unitPrice, BigDecimal lineTotal) {}
