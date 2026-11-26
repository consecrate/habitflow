package com.habitflow.db;

/** Unchecked wrapper so the controller tier never has to import java.sql. */
public class DataAccessException extends RuntimeException {
    public DataAccessException(String message, Throwable cause) {
        super(message, cause);
    }
}
