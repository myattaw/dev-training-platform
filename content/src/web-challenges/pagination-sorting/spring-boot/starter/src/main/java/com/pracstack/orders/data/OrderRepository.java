package com.pracstack.orders.data;

import com.pracstack.orders.model.Order;
import java.util.List;

/** Read-only access to the order history. */
public interface OrderRepository {
    /** Every order, in no guaranteed order. */
    List<Order> findAll();
}
