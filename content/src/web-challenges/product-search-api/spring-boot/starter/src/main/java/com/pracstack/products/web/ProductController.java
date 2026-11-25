package com.pracstack.products.web;

import com.pracstack.products.service.ProductSearchService;
import com.pracstack.products.service.SearchResult;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/products")
public class ProductController {
    private final ProductSearchService products;

    public ProductController(ProductSearchService products) {
        this.products = products;
    }

    // GET /api/products
    // TODO: read the optional query parameters q, category, minPrice and maxPrice,
    // and answer 400 with { "errors": { parameter: [messages] } } when they are invalid.
    @GetMapping
    public ResponseEntity<?> search() {
        return switch (products.search(null, null, null, null)) {
            case SearchResult.Found found -> ResponseEntity.ok(found.products());
            case SearchResult.Invalid invalid -> ResponseEntity.internalServerError().build();
        };
    }

    // TODO: GET /api/products/{id}: 200 with the product, or 404.
}
