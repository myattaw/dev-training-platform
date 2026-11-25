package com.pracstack.quotes.notifications;

import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/** Every notification handed to a channel (a singleton standing in for a mail relay). */
@Component
public class Outbox {
    private final List<Notification> sent = new ArrayList<>();
    private int nextId = 1;

    public synchronized Notification add(String channel, String recipient, String message) {
        Notification notification = new Notification(nextId++, channel, recipient, message);
        sent.add(notification);
        return notification;
    }

    public synchronized List<Notification> all() {
        return List.copyOf(sent);
    }
}
