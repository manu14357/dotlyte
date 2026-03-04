package dev.dotlyte;

/**
 * A single schema validation failure.
 */
public class SchemaViolation {

    private final String key;
    private final String message;
    private final String rule;

    public SchemaViolation(String key, String message, String rule) {
        this.key = key;
        this.message = message;
        this.rule = rule;
    }

    public String getKey() { return key; }
    public String getMessage() { return message; }
    public String getRule() { return rule; }

    @Override
    public String toString() {
        return key + ": " + message + " (" + rule + ")";
    }
}
