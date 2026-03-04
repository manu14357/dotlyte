package dev.dotlyte;

import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Options for {@link Dotlyte#load(LoadOptions)}.
 */
public class LoadOptions {

    // ── Core (v1) ──
    private final List<String> files;
    private final String prefix;
    private final Map<String, Object> defaults;
    private final List<String> sources;
    private final String env;

    // ── V2 additions ──
    private final Map<String, SchemaRule> schema;
    private final boolean strict;
    private final boolean interpolateVars;
    private final Map<String, Object> overrides;
    private final boolean debug;
    private final boolean findUp;
    private final List<String> rootMarkers;
    private final String cwd;
    private final boolean allowAllEnvVars;
    private final boolean watch;
    private final long debounceMs;

    private LoadOptions(Builder builder) {
        this.files = builder.files != null
            ? Collections.unmodifiableList(builder.files) : null;
        this.prefix = builder.prefix;
        this.defaults = builder.defaults != null
            ? Collections.unmodifiableMap(builder.defaults) : null;
        this.sources = builder.sources != null
            ? Collections.unmodifiableList(builder.sources) : null;
        this.env = builder.env;
        this.schema = builder.schema != null
            ? Collections.unmodifiableMap(builder.schema) : null;
        this.strict = builder.strict;
        this.interpolateVars = builder.interpolateVars;
        this.overrides = builder.overrides != null
            ? Collections.unmodifiableMap(builder.overrides) : null;
        this.debug = builder.debug;
        this.findUp = builder.findUp;
        this.rootMarkers = builder.rootMarkers != null
            ? Collections.unmodifiableList(builder.rootMarkers) : null;
        this.cwd = builder.cwd;
        this.allowAllEnvVars = builder.allowAllEnvVars;
        this.watch = builder.watch;
        this.debounceMs = builder.debounceMs;
    }

    // ── Getters ──

    public List<String> getFiles() { return files; }
    public String getPrefix() { return prefix; }
    public Map<String, Object> getDefaults() { return defaults; }
    public List<String> getSources() { return sources; }
    public String getEnv() { return env; }
    public Map<String, SchemaRule> getSchema() { return schema; }
    public boolean isStrict() { return strict; }
    public boolean isInterpolateVars() { return interpolateVars; }
    public Map<String, Object> getOverrides() { return overrides; }
    public boolean isDebug() { return debug; }
    public boolean isFindUp() { return findUp; }
    public List<String> getRootMarkers() { return rootMarkers; }
    public String getCwd() { return cwd; }
    public boolean isAllowAllEnvVars() { return allowAllEnvVars; }
    public boolean isWatch() { return watch; }
    public long getDebounceMs() { return debounceMs; }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private List<String> files;
        private String prefix;
        private Map<String, Object> defaults;
        private List<String> sources;
        private String env;
        private Map<String, SchemaRule> schema;
        private boolean strict;
        private boolean interpolateVars = true;
        private Map<String, Object> overrides;
        private boolean debug;
        private boolean findUp;
        private List<String> rootMarkers;
        private String cwd;
        private boolean allowAllEnvVars;
        private boolean watch;
        private long debounceMs = 300;

        public Builder files(List<String> files) { this.files = files; return this; }
        public Builder prefix(String prefix) { this.prefix = prefix; return this; }
        public Builder defaults(Map<String, Object> defaults) { this.defaults = defaults; return this; }
        public Builder sources(List<String> sources) { this.sources = sources; return this; }
        public Builder env(String env) { this.env = env; return this; }
        public Builder schema(Map<String, SchemaRule> schema) { this.schema = schema; return this; }
        public Builder strict(boolean strict) { this.strict = strict; return this; }
        public Builder interpolateVars(boolean interpolateVars) { this.interpolateVars = interpolateVars; return this; }
        public Builder overrides(Map<String, Object> overrides) { this.overrides = overrides; return this; }
        public Builder debug(boolean debug) { this.debug = debug; return this; }
        public Builder findUp(boolean findUp) { this.findUp = findUp; return this; }
        public Builder rootMarkers(List<String> rootMarkers) { this.rootMarkers = rootMarkers; return this; }
        public Builder cwd(String cwd) { this.cwd = cwd; return this; }
        public Builder allowAllEnvVars(boolean allow) { this.allowAllEnvVars = allow; return this; }
        public Builder watch(boolean watch) { this.watch = watch; return this; }
        public Builder debounceMs(long debounceMs) { this.debounceMs = debounceMs; return this; }

        public LoadOptions build() {
            return new LoadOptions(this);
        }
    }
}
