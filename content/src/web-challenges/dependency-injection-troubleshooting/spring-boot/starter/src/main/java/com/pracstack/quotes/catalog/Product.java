package com.pracstack.quotes.catalog;

/** A catalog product. Prices are in cents. */
public record Product(String sku, String name, long unitPriceCents) {}
