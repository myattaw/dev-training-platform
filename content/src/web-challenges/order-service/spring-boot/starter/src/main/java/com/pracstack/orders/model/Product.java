package com.pracstack.orders.model;

import java.math.BigDecimal;

/** A product as stored and returned by the API. Prices are exact decimals. */
public record Product(long id, String name, BigDecimal unitPrice, int stock) {
    /** A copy of this product with another stock level. */
    public Product withStock(int newStock) {
        return new Product(id, name, unitPrice, newStock);
    }
}
