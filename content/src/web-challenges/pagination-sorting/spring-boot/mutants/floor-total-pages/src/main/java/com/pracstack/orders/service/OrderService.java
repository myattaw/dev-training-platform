package com.pracstack.orders.service;

import com.pracstack.orders.data.OrderRepository;
import com.pracstack.orders.model.Order;
import com.pracstack.orders.model.PagedResult;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/** Pages through the order history. */
@Service
public class OrderService {
    public static final int DEFAULT_PAGE_SIZE = 10;
    public static final int MAX_PAGE_SIZE = 50;
    public static final List<String> SORT_FIELDS = List.of("id", "customer", "total", "orderDate");

    private static final Pattern WHOLE_NUMBER = Pattern.compile("-?[0-9]+");

    private final OrderRepository repository;

    public OrderService(OrderRepository repository) {
        this.repository = repository;
    }

    /**
     * One page of orders. Every argument is the raw query-string value, or null
     * when the parameter is missing.
     */
    public PageResult getPage(String page, String pageSize, String sort, String direction) {
        Map<String, List<String>> errors = new LinkedHashMap<>();
        int pageNumber = parseNumber("page", page, 1, 1, Integer.MAX_VALUE, errors);
        int size = parseNumber("pageSize", pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE, errors);
        String field = clean(sort) == null ? "id" : clean(sort);
        if (!SORT_FIELDS.contains(field)) {
            errors.put("sort", List.of("sort must be one of: " + String.join(", ", SORT_FIELDS) + "."));
        }
        String order = clean(direction) == null ? "asc" : clean(direction);
        if (!order.equals("asc") && !order.equals("desc")) {
            errors.put("direction", List.of("direction must be asc or desc."));
        }
        if (!errors.isEmpty()) {
            return new PageResult.Invalid(errors);
        }

        Comparator<Order> comparator = switch (field) {
            case "customer" -> Comparator.comparing(Order::customer);
            case "total" -> Comparator.comparing(Order::total);
            case "orderDate" -> Comparator.comparing(Order::orderDate);
            default -> Comparator.comparingLong(Order::id);
        };
        if (order.equals("desc")) {
            comparator = comparator.reversed();
        }
        comparator = comparator.thenComparingLong(Order::id);

        List<Order> all = repository.findAll();
        long skip = (long) (pageNumber - 1) * size;
        List<Order> items = all.stream().sorted(comparator).skip(skip).limit(size).toList();
        int totalPages = all.size() / size;
        return new PageResult.Found(new PagedResult<>(items, pageNumber, size, all.size(), totalPages));
    }

    /** Trims a value; a blank value counts as missing (null). */
    private static String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static int parseNumber(
            String name, String raw, int fallback, int min, int max, Map<String, List<String>> errors) {
        String text = clean(raw);
        if (text == null) {
            return fallback;
        }
        Integer value = null;
        if (WHOLE_NUMBER.matcher(text).matches()) {
            try {
                value = Integer.parseInt(text);
            } catch (NumberFormatException tooLarge) {
                value = null;
            }
        }
        if (value == null || value < min || value > max) {
            errors.put(name, List.of(max == Integer.MAX_VALUE
                    ? name + " must be a whole number of at least " + min + "."
                    : name + " must be a whole number from " + min + " to " + max + "."));
            return fallback;
        }
        return value;
    }
}
