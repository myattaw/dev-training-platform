package com.pracstack.expenses.model;

/**
 * Body of POST /api/reports. {@code owner} is still sent by the old mobile app;
 * the server must not trust it.
 */
public record CreateReportRequest(String title, Long amountCents, String owner) {}
