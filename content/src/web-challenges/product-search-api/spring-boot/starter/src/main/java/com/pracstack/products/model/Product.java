package com.pracstack.products.model;

import java.math.BigDecimal;

/** A product as stored and returned by the API. Prices have two decimal places. */
public record Product(long id, String name, String category, BigDecimal price, boolean inStock) {}
