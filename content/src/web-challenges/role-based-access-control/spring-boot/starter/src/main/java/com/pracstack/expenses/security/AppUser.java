package com.pracstack.expenses.security;

/** A user of the expense system. Roles: {@code employee} or {@code admin}. */
public record AppUser(String username, String role) {
    /** Request attribute under which the authenticated user is stored. */
    public static final String REQUEST_ATTRIBUTE = "com.pracstack.expenses.currentUser";

    public boolean isAdmin() {
        return "admin".equals(role);
    }
}
