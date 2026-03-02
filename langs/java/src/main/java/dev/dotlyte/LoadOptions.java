package dev.dotlyte;

import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Options for {@link Dotlyte#load(LoadOptions)}.
 */
public class LoadOptions {

    private final List<String> files;
    private final String prefix;
    private final Map<String, Object> defaults;
    private final List<String> sources;
    private final String env;

    private LoadOptions(Builder builder) {
        this.files = builder.files != null
            ? Collections.unmodifiableList(builder.files) : null;
        this.prefix = builder.prefix;
        this.defaults = builder.defaults != null
            ? Collections.unmodifiableMap(builder.defaults) : null;
        this.sources = builder.sources != null
            ? Collections.unmodifiableList(builder.sources) : null;
        this.env = builder.env;
    }

    public List<String> getFiles() { return files; }
    public String getPrefix() { return prefix; }
    public Map<String, Object> getDefaults() { return defaults; }
    public List<String> getSources() { return sources; }
    public String getEnv() { return env; }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private List<String> files;
        private String prefix;
        private Map<String, Object> defaults;
        private List<String> sources;
        private String env;

        public Builder files(List<String> files) { this.files = files; return this; }
        public Builder prefix(String prefix) { this.prefix = prefix; return this; }
        public Builder defaults(Map<String, Object> defaults) { this.defaults = defaults; return this; }
        public Builder sources(List<String> sources) { this.sources = sources; return this; }
        public Builder env(String env) { this.env = env; return this; }

        public LoadOptions build() {
            return new LoadOptions(this);
        }
    }
}
