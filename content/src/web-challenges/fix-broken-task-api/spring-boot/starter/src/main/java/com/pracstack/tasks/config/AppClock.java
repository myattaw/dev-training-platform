package com.pracstack.tasks.config;

import java.time.LocalDate;

/**
 * The business date the service works with. Fixed so that "overdue" is
 * deterministic: every environment (and every test run) agrees on today.
 */
public final class AppClock {
    public static final LocalDate TODAY = LocalDate.of(2026, 3, 15);

    private AppClock() {}
}
