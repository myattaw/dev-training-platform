package com.pracstack.expenses.model;

/** An expense report. Status: {@code submitted} or {@code approved}. */
public record ExpenseReport(
        int id, String owner, String title, long amountCents, String status, String approvedBy) {

    public ExpenseReport withApproval(String approver) {
        return new ExpenseReport(id, owner, title, amountCents, "approved", approver);
    }
}
