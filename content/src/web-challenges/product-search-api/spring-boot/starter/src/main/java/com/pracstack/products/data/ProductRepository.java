package com.pracstack.products.data;

import com.pracstack.products.model.Product;
import java.util.List;
import java.util.Optional;

/** Read-only access to the product catalog. */
public interface ProductRepository {
    /** Every product, ordered by id. */
    List<Product> findAll();

    Optional<Product> findById(long id);
}
