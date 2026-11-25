package com.pracstack.registration.model;

/**
 * A stored account. Only a salted hash of the password is kept, and this type
 * is never returned by the API (see RegistrationResponse).
 */
public record UserAccount(long id, String email, String displayName, String passwordHash) {}
