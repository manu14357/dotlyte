package dev.dotlyte;

import java.util.*;
import java.util.function.BiConsumer;

/**
 * Boundary-aware configuration that partitions keys into <em>server</em>,
 * <em>client</em>, and <em>shared</em> sets.
 *
 * <p>A {@code BoundaryConfig} wraps a plain data map and provides filtered
 * views. Because Java always runs on the server, {@link #isServerContext()}
 * returns {@code true} and {@link #isClientContext()} returns {@code false}.
 *
 * <pre>{@code
 * Set<String> serverKeys = Set.of("DB_PASSWORD", "API_SECRET");
 * Set<String> clientKeys = Set.of("APP_NAME", "THEME");
 * Set<String> sharedKeys = Set.of("LOG_LEVEL");
 *
 * BoundaryConfig bc = new BoundaryConfig(data, serverKeys, clientKeys, sharedKeys);
 * Map<String, Object> client = bc.clientOnly();
 * }</pre>
 */
public final class BoundaryConfig {

    private final Map<String, Object> data;
    private final Set<String> serverKeys;
    private final Set<String> clientKeys;
    private final Set<String> sharedKeys;
    private BiConsumer<String, String> onSecretAccess;

    /**
     * Create a boundary-aware configuration.
     *
     * @param data       the underlying configuration values
     * @param serverKeys keys that are only available on the server
     * @param clientKeys keys that are only available on the client
     * @param sharedKeys keys available in both contexts
     * @throws NullPointerException if any argument is {@code null}
     */
    public BoundaryConfig(
            final Map<String, Object> data,
            final Set<String> serverKeys,
            final Set<String> clientKeys,
            final Set<String> sharedKeys) {

        Objects.requireNonNull(data, "data must not be null");
        Objects.requireNonNull(serverKeys, "serverKeys must not be null");
        Objects.requireNonNull(clientKeys, "clientKeys must not be null");
        Objects.requireNonNull(sharedKeys, "sharedKeys must not be null");

        this.data = Collections.unmodifiableMap(new LinkedHashMap<>(data));
        this.serverKeys = Collections.unmodifiableSet(new LinkedHashSet<>(serverKeys));
        this.clientKeys = Collections.unmodifiableSet(new LinkedHashSet<>(clientKeys));
        this.sharedKeys = Collections.unmodifiableSet(new LinkedHashSet<>(sharedKeys));
    }

    /**
     * Set a callback that is invoked when a server-only key is accessed.
     *
     * @param onSecretAccess callback receiving {@code (key, value)}
     */
    public void setOnSecretAccess(final BiConsumer<String, String> onSecretAccess) {
        this.onSecretAccess = onSecretAccess;
    }

    // ── Access ─────────────────────────────────────────────────

    /**
     * Retrieve a configuration value, respecting boundary rules.
     *
     * <p>If the key belongs to {@code serverKeys} and we are in a server
     * context, the secret-access callback is invoked (if set).
     *
     * @param key the configuration key
     * @return the value, or {@code null} if the key is not present
     * @throws DotlyteException if the key is not part of any boundary set
     */
    public Object get(final String key) {
        if (!serverKeys.contains(key) && !clientKeys.contains(key)
                && !sharedKeys.contains(key)) {
            throw new DotlyteException(
                    "Key '" + key + "' is not in any boundary set (server, client, shared).", key);
        }

        final Object value = data.get(key);

        if (serverKeys.contains(key) && value != null && onSecretAccess != null) {
            onSecretAccess.accept(key, String.valueOf(value));
        }

        return value;
    }

    // ── Filtered views ─────────────────────────────────────────

    /**
     * Return an unmodifiable map containing only server and shared keys.
     *
     * @return server-only view
     */
    public Map<String, Object> serverOnly() {
        return filterByKeys(serverKeys, sharedKeys);
    }

    /**
     * Return an unmodifiable map containing only client and shared keys.
     *
     * @return client-only view
     */
    public Map<String, Object> clientOnly() {
        return filterByKeys(clientKeys, sharedKeys);
    }

    // ── Context queries ────────────────────────────────────────

    /**
     * Always returns {@code true} because Java runs on the server.
     *
     * @return {@code true}
     */
    public static boolean isServerContext() {
        return true;
    }

    /**
     * Always returns {@code false} because Java runs on the server.
     *
     * @return {@code false}
     */
    public static boolean isClientContext() {
        return false;
    }

    // ── Immutability enforcement ───────────────────────────────

    /**
     * Not supported — BoundaryConfig is immutable.
     *
     * @throws UnsupportedOperationException always
     */
    public void put(final String key, final Object value) {
        throw new UnsupportedOperationException("BoundaryConfig is immutable");
    }

    /**
     * Not supported — BoundaryConfig is immutable.
     *
     * @throws UnsupportedOperationException always
     */
    public void remove(final String key) {
        throw new UnsupportedOperationException("BoundaryConfig is immutable");
    }

    // ── Helpers ────────────────────────────────────────────────

    private Map<String, Object> filterByKeys(final Set<String> primary, final Set<String> shared) {
        final Map<String, Object> result = new LinkedHashMap<>();
        for (final Map.Entry<String, Object> entry : data.entrySet()) {
            if (primary.contains(entry.getKey()) || shared.contains(entry.getKey())) {
                result.put(entry.getKey(), entry.getValue());
            }
        }
        return Collections.unmodifiableMap(result);
    }
}
