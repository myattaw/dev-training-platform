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

/**
 * Every request here is authenticated: BearerTokenInterceptor answers 401
 * before an unauthenticated request reaches this controller.
 */
@RestController
@RequestMapping("/api/reports")
public class ReportController {
    private final ReportRepository reports;

    public ReportController(ReportRepository reports) {
        this.reports = reports;
    }

    private static boolean canSee(AppUser caller, ExpenseReport report) {
        return caller.isAdmin() || report.owner().equals(caller.username());
    }

    // GET /api/reports: employees see their own reports, admins see all.
    @GetMapping
    public List<ExpenseReport> getAll(@RequestAttribute(AppUser.REQUEST_ATTRIBUTE) AppUser caller) {
        return reports.findAll().stream().filter(r -> canSee(caller, r)).toList();
    }

    // GET /api/reports/{id}: 404 (not 403) for someone else's report, so ids of
    // other people's reports are not revealed.
    @GetMapping("/{id}")
    public ResponseEntity<ExpenseReport> get(
            @PathVariable int id, @RequestAttribute(AppUser.REQUEST_ATTRIBUTE) AppUser caller) {
        return ResponseEntity.of(reports.findById(id).filter(r -> canSee(caller, r)));
    }

    // POST /api/reports: the owner is the authenticated caller, whatever the body says.
    @PostMapping
    public ResponseEntity<?> create(
            @RequestBody CreateReportRequest request,
            @RequestAttribute(AppUser.REQUEST_ATTRIBUTE) AppUser caller) {
        Map<String, List<String>> errors = validate(request);
        if (!errors.isEmpty()) return ResponseEntity.badRequest().body(Map.of("errors", errors));
        ExpenseReport report = reports.add(request.owner() != null ? request.owner() : caller.username(), request.title().trim(), request.amountCents());
        return ResponseEntity.created(URI.create("/api/reports/" + report.id())).body(report);
    }

    // POST /api/reports/{id}/approve: admins only. The role is checked first, so
    // employees get 403 whether or not the report exists.
    @PostMapping("/{id}/approve")
    public ResponseEntity<?> approve(
            @PathVariable int id, @RequestAttribute(AppUser.REQUEST_ATTRIBUTE) AppUser caller) {
        if (!caller.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only admins can approve reports."));
        }
        Optional<ExpenseReport> report = reports.findById(id);
        if (report.isEmpty()) return ResponseEntity.notFound().build();
        if ("approved".equals(report.get().status())) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "The report is already approved."));
        }
        return ResponseEntity.ok(reports.approve(id, caller.username()).orElseThrow());
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
