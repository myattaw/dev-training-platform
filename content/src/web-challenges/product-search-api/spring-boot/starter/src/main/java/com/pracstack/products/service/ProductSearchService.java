package com.pracstack.products.service;

import com.pracstack.products.data.ProductRepository;
import com.pracstack.products.model.Product;
import java.util.Optional;
import org.springframework.stereotype.Service;

/** Searches the product catalog. */
@Service
public class ProductSearchService {
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
        // TODO: treat missing or blank parameters as "no filter", validate minPrice
        // and maxPrice, then keep only the products that match every filter (by id).
        return new SearchResult.Found(repository.findAll());
    }
}
