package com.pracstack.quotes.web;

/** Body of POST /api/notifications. */
public record NotificationRequest(String recipient, String message) {}
