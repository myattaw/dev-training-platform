package com.pracstack.registration.model;

/** The JSON body of POST /api/registrations. Any field may be missing (null). */
public record RegisterRequest(
        String email, String displayName, String password, String confirmPassword, Boolean acceptTerms) {}
