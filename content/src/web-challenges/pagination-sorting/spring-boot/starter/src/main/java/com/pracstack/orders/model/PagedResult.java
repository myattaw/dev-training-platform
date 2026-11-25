package com.pracstack.orders.model;

import java.util.List;

/** One page of a sorted list, plus the numbers a client needs to page through it. */
public record PagedResult<T>(List<T> items, int page, int pageSize, int totalCount, int totalPages) {}
