package com.unimedlorena.tools;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handle(Exception ex) {
        ex.printStackTrace(); // imprime stack trace no terminal do backend
        return ResponseEntity.internalServerError()
            .body(Map.of("message", ex.getClass().getSimpleName() + ": " + ex.getMessage()));
    }
}
