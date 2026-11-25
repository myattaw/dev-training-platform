package com.pracstack.inventory.errors;

/**
 * The requested item does not exist (404, code not_found). Like ConflictException
 * and InvalidInputException, its message is written for API clients and is safe
 * to return. Any other exception is unexpected: its details are internal.
 */
public class NotFoundException extends RuntimeException {
    public NotFoundException(String message) {
        super(message);
    }
}
