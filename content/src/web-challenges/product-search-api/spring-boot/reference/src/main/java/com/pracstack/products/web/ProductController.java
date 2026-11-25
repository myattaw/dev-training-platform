package com.pracstack.products.web;

import com.pracstack.products.model.Product;
import com.pracstack.products.service.ProductSearchService;
import com.pracstack.products.service.SearchResult;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/products")
public class ProductController {
    private final ProductSearchService products;

    public ProductController(ProductSearchService products) {
        this.products = products;
    }

    // GET /api/products?q=&category=&minPrice=&maxPrice=
    @GetMapping
    public ResponseEntity<?> search(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String minPrice,
            @RequestParam(required = false) String maxPrice) {
        return switch (products.search(q, category, minPrice, maxPrice)) {
            case SearchResult.Found found -> ResponseEntity.ok(found.products());
            case SearchResult.Invalid invalid ->
                    ResponseEntity.badRequest().body(Map.of("errors", invalid.errors()));
        };
    }

    @GetMapping("/{id}")
    public ResponseEntity<Product> getById(@PathVariable long id) {
        return ResponseEntity.of(products.findById(id));
    }
}
