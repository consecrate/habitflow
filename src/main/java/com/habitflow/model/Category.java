package com.habitflow.model;

/** A user-defined group of habits with a colour. */
public record Category(int id, String name, String color) {
    @Override public String toString() { return name; }
}
