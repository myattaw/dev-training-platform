package com.pracstack.expenses.web;

import com.pracstack.expenses.data.ReportRepository;
import com.pracstack.expenses.model.CreateReportRequest;
import com.pracstack.expenses.model.ExpenseReport;
import com.pracstack.expenses.security.AppUser;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reports")
public class ReportController {
    private final ReportRepository reports;

    public ReportController(ReportRepository reports) {
        this.reports = reports;
    }

    // The authenticated user is available as
    // @RequestAttribute(name = AppUser.REQUEST_ATTRIBUTE, required = false) AppUser caller

    // GET /api/reports
    // TODO: employees see only their own reports; admins see every report.
    @GetMapping
    public List<ExpenseReport> getAll() {
        return reports.findAll();
    }

    // GET /api/reports/{id}
    // TODO: only the owner or an admin may read a report; anyone else gets 404.
    @GetMapping("/{id}")
    public ResponseEntity<ExpenseReport> get(@PathVariable int id) {
        return ResponseEntity.of(reports.findById(id));
    }

    // POST /api/reports
    // TODO: the owner is the caller, never a value from the body.
    @PostMapping
    public ResponseEntity<?> create(@RequestBody CreateReportRequest request) {
        Map<String, List<String>> errors = validate(request);
        if (!errors.isEmpty()) return ResponseEntity.badRequest().body(Map.of("errors", errors));
        String owner = request.owner() == null ? "unknown" : request.owner();
        ExpenseReport report = reports.add(owner, request.title().trim(), request.amountCents());
        return ResponseEntity.created(URI.create("/api/reports/" + report.id())).body(report);
    }

    // POST /api/reports/{id}/approve
    // TODO: admins only (403 for everyone else).
    @PostMapping("/{id}/approve")
    public ResponseEntity<?> approve(
            @PathVariable int id,
            @RequestAttribute(name = AppUser.REQUEST_ATTRIBUTE, required = false) AppUser caller) {
        Optional<ExpenseReport> report = reports.findById(id);
        if (report.isEmpty()) return ResponseEntity.notFound().build();
        if ("approved".equals(report.get().status())) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "The report is already approved."));
        }
        String approver = caller == null ? "unknown" : caller.username();
        return ResponseEntity.ok(reports.approve(id, approver).orElseThrow());
    }

    private static Map<String, List<String>> validate(CreateReportRequest request) {
        Map<String, List<String>> errors = new LinkedHashMap<>();
        String title = request.title() == null ? "" : request.title().trim();
        if (title.isEmpty()) errors.put("title", List.of("Title is required."));
        else if (title.length() > 100) errors.put("title", List.of("Title must be at most 100 characters."));
        Long amount = request.amountCents();
        if (amount == null || amount < 1 || amount > 1_000_000) {
            errors.put("amountCents", List.of("Amount must be between 1 and 1000000 cents."));
        }
        return errors;
    }
}
