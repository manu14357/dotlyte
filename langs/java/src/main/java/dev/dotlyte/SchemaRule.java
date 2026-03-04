package dev.dotlyte;

import java.util.*;

/**
 * A single schema rule for one config key.
 */
public class SchemaRule {

    private String type;
    private boolean required;
    private String format;
    private String pattern;
    private List<Object> enumValues;
    private Double min;
    private Double max;
    private Object defaultValue;
    private boolean sensitive;
    private String doc;

    public SchemaRule() {}

    // Builder-style setters
    public SchemaRule type(String type) { this.type = type; return this; }
    public SchemaRule required(boolean required) { this.required = required; return this; }
    public SchemaRule format(String format) { this.format = format; return this; }
    public SchemaRule pattern(String pattern) { this.pattern = pattern; return this; }
    public SchemaRule enumValues(List<Object> values) { this.enumValues = values; return this; }
    public SchemaRule min(double min) { this.min = min; return this; }
    public SchemaRule max(double max) { this.max = max; return this; }
    public SchemaRule defaultValue(Object defaultValue) { this.defaultValue = defaultValue; return this; }
    public SchemaRule sensitive(boolean sensitive) { this.sensitive = sensitive; return this; }
    public SchemaRule doc(String doc) { this.doc = doc; return this; }

    // Getters
    public String getType() { return type; }
    public boolean isRequired() { return required; }
    public String getFormat() { return format; }
    public String getPattern() { return pattern; }
    public List<Object> getEnumValues() { return enumValues; }
    public Double getMin() { return min; }
    public Double getMax() { return max; }
    public Object getDefaultValue() { return defaultValue; }
    public boolean isSensitive() { return sensitive; }
    public String getDoc() { return doc; }
}
