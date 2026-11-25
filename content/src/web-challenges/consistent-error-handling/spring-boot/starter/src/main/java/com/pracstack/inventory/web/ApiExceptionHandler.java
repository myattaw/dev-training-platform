package com.pracstack.inventory.web;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Central error handling for every controller.
 *
 * TODO: every error response must use the documented format
 * { "error": { "code": "...", "message": "..." } } (plus "fields" for
 * validation_failed). Map NotFoundException, ConflictException and
 * InvalidInputException, answer a request body that cannot be read with
 * validation_failed, keep the framework's own client errors (an unknown route
 * is 404, not 500), and answer anything else with 500 "internal" and a generic
 * message, logging the details on the server only.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    // Temporary: added while debugging. It answers 500 for every error and
    // shows the exception's message, class and stack trace to any client.
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handle(Exception ex) {
        StringWriter trace = new StringWriter();
        ex.printStackTrace(new PrintWriter(trace));
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                "error", String.valueOf(ex.getMessage()),
                "exception", ex.getClass().getName(),
                "stackTrace", trace.toString()));
    }
}
