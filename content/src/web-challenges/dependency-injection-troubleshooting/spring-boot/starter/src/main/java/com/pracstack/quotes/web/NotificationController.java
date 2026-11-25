package com.pracstack.quotes.web;

import com.pracstack.quotes.notifications.Notification;
import com.pracstack.quotes.notifications.NotificationSender;
import com.pracstack.quotes.notifications.Outbox;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {
    private final ObjectProvider<NotificationSender> senders;
    private final Outbox outbox;

    /** The sender is looked up lazily, when a notification is sent. */
    public NotificationController(ObjectProvider<NotificationSender> senders, Outbox outbox) {
        this.senders = senders;
        this.outbox = outbox;
    }

    // GET /api/notifications
    @GetMapping
    public List<Notification> getAll() {
        return outbox.all();
    }

    // POST /api/notifications
    @PostMapping
    public ResponseEntity<?> send(@RequestBody NotificationRequest request) {
        Map<String, List<String>> errors = new LinkedHashMap<>();
        if (request.recipient() == null || request.recipient().isBlank()) {
            errors.put("recipient", List.of("Recipient is required."));
        }
        if (request.message() == null || request.message().isBlank()) {
            errors.put("message", List.of("Message is required."));
        }
        if (!errors.isEmpty()) return ResponseEntity.badRequest().body(Map.of("errors", errors));
        NotificationSender sender = senders.getObject();
        Notification sent = sender.send(request.recipient().trim(), request.message().trim());
        return ResponseEntity.status(HttpStatus.CREATED).body(sent);
    }
}
