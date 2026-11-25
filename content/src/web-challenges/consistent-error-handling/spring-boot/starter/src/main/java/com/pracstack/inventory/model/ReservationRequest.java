package com.pracstack.inventory.model;

/** The JSON body of POST /api/items/{sku}/reservations. */
public record ReservationRequest(Integer quantity) {}
