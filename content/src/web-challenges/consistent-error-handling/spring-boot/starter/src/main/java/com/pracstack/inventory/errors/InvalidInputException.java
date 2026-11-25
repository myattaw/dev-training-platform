package com.pracstack.inventory.errors;

import java.util.List;
import java.util.Map;

/** Invalid input (400, code validation_failed). fields maps field name to messages. */
public class InvalidInputException extends RuntimeException {
    private final Map<String, List<String>> fields;

    public InvalidInputException(Map<String, List<String>> fields) {
        super("One or more fields are invalid.");
        this.fields = Map.copyOf(fields);
    }

    public Map<String, List<String>> fields() {
        return fields;
    }
}
