package com.pracstack.quotes.notifications;

/** A notification handed to a channel. */
public record Notification(int id, String channel, String recipient, String message) {}
