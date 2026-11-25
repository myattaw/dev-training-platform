package com.pracstack.orders.web;

import com.pracstack.orders.data.ShopStore;
import com.pracstack.orders.model.Product;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/products")
public class ProductController {
    private final ShopStore store;

    public ProductController(ShopStore store) {
        this.store = store;
    }

    // GET /api/products
    @GetMapping
    public List<Product> getAll() {
        return store.products();
    }

    // GET /api/products/{id}
    @GetMapping("/{id}")
    public ResponseEntity<Product> getById(@PathVariable long id) {
        return ResponseEntity.of(store.findProduct(id));
    }
}
