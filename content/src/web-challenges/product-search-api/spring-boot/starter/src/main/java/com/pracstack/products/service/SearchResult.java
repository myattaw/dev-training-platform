package com.pracstack.products.service;

import com.pracstack.products.model.Product;
import java.util.List;
import java.util.Map;

/** The outcome of a product search. */
public sealed interface SearchResult {
    /** The matching products, ordered by id (possibly none). */
    record Found(List<Product> products) implements SearchResult {}

    /** Invalid query parameters: parameter name (minPrice, maxPrice) to messages. */
    record Invalid(Map<String, List<String>> errors) implements SearchResult {}
}
