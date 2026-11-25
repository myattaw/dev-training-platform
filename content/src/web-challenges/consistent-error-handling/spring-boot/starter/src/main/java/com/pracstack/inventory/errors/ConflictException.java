package com.pracstack.inventory.errors;

/** The request conflicts with the current state, e.g. not enough stock (409, code conflict). */
public class ConflictException extends RuntimeException {
    public ConflictException(String message) {
        super(message);
    }
}
