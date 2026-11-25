package com.pracstack.expenses.data;

import com.pracstack.expenses.model.ExpenseReport;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * In-memory expense reports (a singleton), seeded with three reports.
 * Thread-safe. It stores what it is given: it does not check permissions.
 */
@Component
public class ReportRepository {
    private final List<ExpenseReport> reports = new ArrayList<>(List.of(
            new ExpenseReport(1, "alice", "Client dinner", 8450, "submitted", null),
            new ExpenseReport(2, "bob", "Train tickets", 12900, "submitted", null),
            new ExpenseReport(3, "alice", "Conference pass", 49900, "approved", "admin")));
    private int nextId = 4;

    public synchronized List<ExpenseReport> findAll() {
        return reports.stream().sorted(Comparator.comparingInt(ExpenseReport::id)).toList();
    }

    public synchronized Optional<ExpenseReport> findById(int id) {
        return reports.stream().filter(r -> r.id() == id).findFirst();
    }

    public synchronized ExpenseReport add(String owner, String title, long amountCents) {
        ExpenseReport report = new ExpenseReport(nextId++, owner, title, amountCents, "submitted", null);
        reports.add(report);
        return report;
    }

    /** Marks a report approved by {@code approver}; empty if it does not exist. */
    public synchronized Optional<ExpenseReport> approve(int id, String approver) {
        for (int i = 0; i < reports.size(); i++) {
            if (reports.get(i).id() == id) {
                ExpenseReport approved = reports.get(i).withApproval(approver);
                reports.set(i, approved);
                return Optional.of(approved);
            }
        }
        return Optional.empty();
    }
}
