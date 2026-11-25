package com.pracstack.inventory.model;

/** The JSON body of POST /api/items. Any field may be missing (null). */
public record CreateItemRequest(String sku, String name, Integer quantity) {}
