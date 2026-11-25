package com.pracstack.quotes.notifications;

/** Hands a notification to a delivery channel. */
public interface NotificationSender {
    Notification send(String recipient, String message);
}
