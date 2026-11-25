package com.pracstack.quotes.notifications;

/** Sends notifications by email (through the outbox). */
// TODO (support ticket): POST /api/notifications answers 500 Internal Server Error.
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
