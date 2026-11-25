package com.pracstack.quotes.notifications;

import org.springframework.stereotype.Service;

/** Sends notifications by email (through the outbox). */
@Service
public class EmailNotificationSender implements NotificationSender {
    private final Outbox outbox;

    public EmailNotificationSender(Outbox outbox) {
        this.outbox = outbox;
    }

    @Override
    public Notification send(String recipient, String message) {
        return outbox.add("email", recipient, message);
    }
}
