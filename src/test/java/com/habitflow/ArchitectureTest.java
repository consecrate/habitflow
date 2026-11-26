package com.habitflow;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Enforces the 3-tier rule: GUI -> controller -> database, never skipping a tier. */
class ArchitectureTest {
    private static final Path SRC = Path.of("src/main/java/com/habitflow");

    private static List<String> violations(String pkg, Pattern forbidden) throws IOException {
        try (Stream<Path> files = Files.walk(SRC.resolve(pkg))) {
            return files.filter(p -> p.toString().endsWith(".java")).flatMap(p -> {
                try {
                    return Files.readAllLines(p).stream().filter(l -> forbidden.matcher(l).find()).map(l -> p.getFileName() + ": " + l.trim());
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
            }).toList();
        }
    }

    @Test
    void guiNeverTouchesTheDatabaseTier() throws IOException {
        assertEquals(List.of(), violations("ui", Pattern.compile("java\\.sql|com\\.habitflow\\.db|SELECT |INSERT |UPDATE |DELETE FROM")));
    }

    @Test
    void controllersHaveNoSqlOrJdbc() throws IOException {
        assertEquals(List.of(), violations("controller", Pattern.compile("java\\.sql|PreparedStatement|ResultSet|\"SELECT |\"INSERT |\"UPDATE |\"DELETE |javafx|com\\.habitflow\\.ui")));
    }

    @Test
    void databaseNeverTouchesUpperTiers() throws IOException {
        assertEquals(List.of(), violations("db", Pattern.compile("javafx|com\\.habitflow\\.(controller|ui)")));
    }

    @Test
    void modelIsPureJava() throws IOException {
        assertEquals(List.of(), violations("model", Pattern.compile("java\\.sql|javafx|com\\.habitflow\\.(db|controller|ui)")));
    }
}
