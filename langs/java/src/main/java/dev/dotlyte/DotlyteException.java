package dev.dotlyte;

import java.util.Collections;
import java.util.List;

/**
 * Base exception for all DOTLYTE errors.
 */
public class DotlyteException extends RuntimeException {

    private final String key;

    public DotlyteException(String message) {
        this(message, (String) null);
    }

    public DotlyteException(String message, String key) {
        super(message);
        this.key = key;
    }

    public DotlyteException(String message, Throwable cause) {
        super(message, cause);
        this.key = null;
    }

    /** The config key that caused the error (may be null). */
    public String getKey() {
        return key;
    }

    // ── Subclasses ──────────────────────────────────────────────

    /** Thrown when a required key is missing. */
    public static class MissingKeyException extends DotlyteException {
        private final List<String> sourcesChecked;

        public MissingKeyException(String key, List<String> sourcesChecked) {
            super("Required config key '" + key + "' is missing. " +
                  "Checked: " + sourcesChecked + ". " +
                  "Set it in your .env file or as an environment variable.", key);
            this.sourcesChecked = Collections.unmodifiableList(sourcesChecked);
        }

        public List<String> getSourcesChecked() { return sourcesChecked; }
    }

    /** Thrown when a config file cannot be read or parsed. */
    public static class FileException extends DotlyteException {
        private final String filePath;

        public FileException(String filePath, String message) {
            super("Error reading '" + filePath + "': " + message);
            this.filePath = filePath;
        }

        public FileException(String filePath, String message, Throwable cause) {
            super("Error reading '" + filePath + "': " + message, cause);
            this.filePath = filePath;
        }

        public String getFilePath() { return filePath; }
    }

    /** Thrown when schema validation fails. */
    public static class ValidationException extends DotlyteException {
        private final List<SchemaViolation> violations;

        public ValidationException(List<SchemaViolation> violations) {
            super(buildMessage(violations));
            this.violations = Collections.unmodifiableList(violations);
        }

        public List<SchemaViolation> getViolations() { return violations; }

        private static String buildMessage(List<SchemaViolation> violations) {
            StringBuilder sb = new StringBuilder("Schema validation failed:\n");
            for (SchemaViolation v : violations) {
                sb.append("  - ").append(v).append("\n");
            }
            return sb.toString();
        }
    }

    /** Thrown when variable interpolation fails. */
    public static class InterpolationException extends DotlyteException {
        public InterpolationException(String message) {
            super(message);
        }
    }

    /** Thrown when decryption fails. */
    public static class DecryptionException extends DotlyteException {
        public DecryptionException(String message) {
            super(message);
        }

        public DecryptionException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
