package com.pracstack.orders.service;

import com.pracstack.orders.model.Order;
import com.pracstack.orders.model.PagedResult;
import java.util.List;
import java.util.Map;

/** The outcome of asking for one page of orders. */
public sealed interface PageResult {
    record Found(PagedResult<Order> page) implements PageResult {}

    /** Invalid query parameters: parameter name (page, pageSize, sort, direction) to messages. */
    record Invalid(Map<String, List<String>> errors) implements PageResult {}
}
