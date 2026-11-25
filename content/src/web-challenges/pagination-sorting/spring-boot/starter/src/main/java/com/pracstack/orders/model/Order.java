package com.pracstack.orders.model;

import java.math.BigDecimal;
import java.time.LocalDate;

/** An order as stored and returned by the API. Totals have two decimal places. */
public record Order(long id, String customer, BigDecimal total, LocalDate orderDate, String status) {}
