package com.pracstack.inventory.web;

import com.pracstack.inventory.errors.ConflictException;
import com.pracstack.inventory.errors.InvalidInputException;
import com.pracstack.inventory.errors.NotFoundException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Central error handling for every controller: the documented error format, and no internals. */
@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(InvalidInputException.class)
    public ResponseEntity<Map<String, Object>> invalidInput(InvalidInputException ex) {
        return respond(HttpStatus.BAD_REQUEST.value(), "validation_failed", ex.getMessage(), ex.fields());
    }

    /** Malformed JSON or a value of the wrong type: the serializer's message names internal classes. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> unreadableBody(HttpMessageNotReadableException ex) {
        return respond(HttpStatus.BAD_REQUEST.value(), "validation_failed", "The request body could not be read.", Map.of());
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<Map<String, Object>> notFound(NotFoundException ex) {
        return respond(HttpStatus.NOT_FOUND.value(), "not_found", ex.getMessage(), null);
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<Map<String, Object>> conflict(ConflictException ex) {
        return respond(HttpStatus.CONFLICT.value(), "conflict", ex.getMessage(), null);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> unexpected(Exception ex) {
        // Spring MVC's own client errors (unknown route, unsupported method, ...)
        // also arrive here: keep their status instead of turning them into a 500.
        if (ex instanceof ErrorResponse framework && framework.getStatusCode().is4xxClientError()) {
            int status = framework.getStatusCode().value();
            return status == 404
                    ? respond(status, "not_found", "No endpoint matches this request.", null)
                    : respond(status, "validation_failed", "The request is not supported.", Map.of());
        }
        log.error("Unhandled exception", ex); // the details stay in the server log
        return respond(HttpStatus.INTERNAL_SERVER_ERROR.value(), "internal", String.valueOf(ex.getMessage()), null);
    }

    private static ResponseEntity<Map<String, Object>> respond(
            int status, String code, String message, Map<String, List<String>> fields) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("code", code);
        error.put("message", message);
        if (fields != null) error.put("fields", fields);
        return ResponseEntity.status(status).body(Map.of("error", error));
    }
}
