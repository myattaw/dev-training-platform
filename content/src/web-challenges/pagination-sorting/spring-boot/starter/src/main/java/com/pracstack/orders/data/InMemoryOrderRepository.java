package com.pracstack.orders.data;

import com.pracstack.orders.model.Order;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Repository;

/** The order history, seeded with 25 orders. It never changes while the application runs. */
@Repository
public class InMemoryOrderRepository implements OrderRepository {
    private static final List<Order> ORDERS = List.of(
            order(1, "Olivia Brown", "120.00", "2026-03-02", "Delivered"),
            order(2, "Liam Smith", "45.50", "2026-03-01", "Delivered"),
            order(3, "Emma Johnson", "89.99", "2026-03-05", "Shipped"),
            order(4, "Noah Williams", "45.50", "2026-03-03", "Delivered"),
            order(5, "Ava Jones", "210.00", "2026-03-01", "Pending"),
            order(6, "Olivia Brown", "15.25", "2026-03-07", "Shipped"),
            order(7, "Mason Garcia", "89.99", "2026-03-04", "Delivered"),
            order(8, "Sophia Miller", "300.00", "2026-03-06", "Pending"),
            order(9, "Liam Smith", "45.50", "2026-03-02", "Shipped"),
            order(10, "Isabella Davis", "72.40", "2026-03-08", "Delivered"),
            order(11, "Ethan Martinez", "19.99", "2026-03-05", "Pending"),
            order(12, "Emma Johnson", "150.00", "2026-03-09", "Delivered"),
            order(13, "Lucas Wilson", "89.99", "2026-03-01", "Shipped"),
            order(14, "Mia Anderson", "64.00", "2026-03-10", "Delivered"),
            order(15, "Ava Jones", "15.25", "2026-03-03", "Pending"),
            order(16, "Logan Thomas", "99.00", "2026-03-11", "Shipped"),
            order(17, "Charlotte Moore", "45.50", "2026-03-12", "Delivered"),
            order(18, "Olivia Brown", "250.75", "2026-03-06", "Pending"),
            order(19, "James Taylor", "33.10", "2026-03-13", "Shipped"),
            order(20, "Amelia White", "120.00", "2026-03-04", "Delivered"),
            order(21, "Liam Smith", "8.99", "2026-03-14", "Pending"),
            order(22, "Harper Clark", "175.20", "2026-03-10", "Shipped"),
            order(23, "Benjamin Lee", "120.00", "2026-03-15", "Delivered"),
            order(24, "Evelyn Hall", "60.00", "2026-03-12", "Pending"),
            order(25, "Emma Johnson", "300.00", "2026-03-15", "Shipped"));

    private static Order order(long id, String customer, String total, String date, String status) {
        return new Order(id, customer, new BigDecimal(total), LocalDate.parse(date), status);
    }

    @Override
    public List<Order> findAll() {
        return ORDERS;
    }
}
