package com.pracstack.quotes.web;

import java.util.List;

/** Body of POST /api/quotes. */
public record QuoteRequest(List<Line> lines) {
    public record Line(String sku, Integer quantity) {}
}
