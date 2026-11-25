package com.pracstack.inventory.model;

/** A stocked item, as stored and returned by the API. */
public record Item(String sku, String name, int quantity) {}
