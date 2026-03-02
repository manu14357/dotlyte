package dev.dotlyte;

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

    /**
     * The config key that caused the error (may be null).
     */
    public String getKey() {
        return key;
    }
}
