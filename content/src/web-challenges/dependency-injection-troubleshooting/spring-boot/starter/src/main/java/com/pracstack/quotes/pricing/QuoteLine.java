package com.pracstack.quotes.pricing;

public record QuoteLine(String sku, int quantity, long unitPriceCents, long lineTotalCents) {}
