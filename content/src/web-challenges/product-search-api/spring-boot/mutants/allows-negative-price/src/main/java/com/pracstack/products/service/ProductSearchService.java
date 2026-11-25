package com.pracstack.products.service;

import com.pracstack.products.data.ProductRepository;
import com.pracstack.products.model.Product;
import java.math.BigDecimal;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;

/** Searches the product catalog. */
@Service
public class ProductSearchService {
    private static final Pattern DECIMAL_NUMBER = Pattern.compile("-?[0-9]+(\\.[0-9]+)?");

    private final ProductRepository repository;

    public ProductSearchService(ProductRepository repository) {
        this.repository = repository;
    }

    public Optional<Product> findById(long id) {
        return repository.findById(id);
    }

    /**
     * Filters the catalog. Every argument is the raw query-string value, or null
     * when the parameter is missing.
     */
    public SearchResult search(String q, String category, String minPrice, String maxPrice) {
        Map<String, List<String>> errors = new LinkedHashMap<>();
        BigDecimal min = parsePrice("minPrice", minPrice, errors);
        BigDecimal max = parsePrice("maxPrice", maxPrice, errors);
        if (min != null && max != null && min.compareTo(max) > 0) {
            errors.put("maxPrice", List.of("maxPrice must be greater than or equal to minPrice."));
        }
        if (!errors.isEmpty()) {
            return new SearchResult.Invalid(errors);
        }

        String text = clean(q);
        String exactCategory = clean(category);
        Stream<Product> results = repository.findAll().stream();
        if (text != null) {
            String needle = text.toLowerCase(Locale.ROOT);
            results = results.filter(p -> p.name().toLowerCase(Locale.ROOT).contains(needle));
        }
        if (exactCategory != null) {
            results = results.filter(p -> p.category().equals(exactCategory));
        }
        if (min != null) {
            results = results.filter(p -> p.price().compareTo(min) >= 0);
        }
        if (max != null) {
            results = results.filter(p -> p.price().compareTo(max) <= 0);
        }
        return new SearchResult.Found(results.sorted(Comparator.comparingLong(Product::id)).toList());
    }

    /** Trims a value; a blank value counts as missing (null). */
    private static String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static BigDecimal parsePrice(String name, String raw, Map<String, List<String>> errors) {
        String text = clean(raw);
        if (text == null) {
            return null;
        }
        if (!DECIMAL_NUMBER.matcher(text).matches()) {
            errors.put(name, List.of(name + " must be a number."));
            return null;
        }
        return new BigDecimal(text);
    }
}
