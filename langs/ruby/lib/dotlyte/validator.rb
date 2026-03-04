# frozen_string_literal: true

module Dotlyte
  # Schema rule for a single config key.
  class SchemaRule
    attr_accessor :type, :required, :format, :pattern, :enum_values,
                  :min, :max, :default_value, :sensitive, :doc

    def initialize(**kwargs)
      @type = kwargs[:type]
      @required = kwargs.fetch(:required, false)
      @format = kwargs[:format]
      @pattern = kwargs[:pattern]
      @enum_values = kwargs[:enum_values]
      @min = kwargs[:min]
      @max = kwargs[:max]
      @default_value = kwargs[:default_value]
      @sensitive = kwargs.fetch(:sensitive, false)
      @doc = kwargs[:doc]
    end
  end

  # A single schema violation.
  class SchemaViolation
    attr_reader :key, :message, :rule

    def initialize(key:, message:, rule:)
      @key = key
      @message = message
      @rule = rule
    end

    def to_s
      "[#{rule}] #{key}: #{message}"
    end
  end

  # Schema validation engine for DOTLYTE v2.
  module Validator
    FORMAT_PATTERNS = {
      "email" => /\A[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\z/,
      "uuid"  => /\A[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\z/,
      "date"  => /\A\d{4}-\d{2}-\d{2}\z/,
      "ipv4"  => /\A\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\z/
    }.freeze

    # Validate config data against a schema.
    #
    # @param data [Hash] the config data
    # @param schema [Hash<String, SchemaRule>] the schema
    # @param strict [Boolean] reject unknown keys
    # @return [Array<SchemaViolation>]
    def self.validate(data, schema, strict: false)
      violations = []

      schema.each do |key, rule|
        val = get_nested(data, key)

        if val.nil?
          if rule.required
            violations << SchemaViolation.new(
              key: key, message: "required key '#{key}' is missing", rule: "required"
            )
          end
          next
        end

        # Type check
        if rule.type && !check_type(val, rule.type)
          violations << SchemaViolation.new(
            key: key,
            message: "expected type '#{rule.type}', got #{val.class}",
            rule: "type"
          )
        end

        # Format check
        if rule.format && val.is_a?(String) && !check_format(val, rule.format)
          violations << SchemaViolation.new(
            key: key,
            message: "value '#{val}' does not match format '#{rule.format}'",
            rule: "format"
          )
        end

        # Pattern check
        if rule.pattern && val.is_a?(String) && !val.match?(Regexp.new(rule.pattern))
          violations << SchemaViolation.new(
            key: key,
            message: "value '#{val}' does not match pattern '#{rule.pattern}'",
            rule: "pattern"
          )
        end

        # Enum check
        if rule.enum_values && !rule.enum_values.include?(val)
          violations << SchemaViolation.new(
            key: key,
            message: "value #{val} not in allowed values: #{rule.enum_values}",
            rule: "enum"
          )
        end

        # Min/Max
        if val.is_a?(Numeric)
          if rule.min && val < rule.min
            violations << SchemaViolation.new(
              key: key, message: "value #{val} is less than minimum #{rule.min}", rule: "min"
            )
          end
          if rule.max && val > rule.max
            violations << SchemaViolation.new(
              key: key, message: "value #{val} is greater than maximum #{rule.max}", rule: "max"
            )
          end
        end
      end

      # Strict mode
      if strict
        flat_keys = flatten_keys(data)
        flat_keys.each do |k|
          unless schema.key?(k)
            violations << SchemaViolation.new(
              key: k, message: "unknown key '#{k}' (strict mode)", rule: "strict"
            )
          end
        end
      end

      violations
    end

    # Apply schema defaults to data.
    def self.apply_defaults(data, schema)
      schema.each do |key, rule|
        next if rule.default_value.nil?
        next unless get_nested(data, key).nil?

        set_nested(data, key, rule.default_value)
      end
    end

    # Get all sensitive keys from schema.
    def self.sensitive_keys(schema)
      schema.select { |_, rule| rule.sensitive }.keys
    end

    # Assert valid — raises ValidationError on failure.
    def self.assert_valid!(data, schema, strict: false)
      violations = validate(data, schema, strict: strict)
      return if violations.empty?

      msg = "Schema validation failed:\n" +
            violations.map { |v| "  - #{v}" }.join("\n")
      raise ValidationError.new(msg, violations: violations)
    end

    # Get a nested value via dot-notation key.
    def self.get_nested(data, key)
      parts = key.to_s.split(".")
      current = data
      parts.each do |part|
        return nil unless current.is_a?(Hash)

        current = current.key?(part) ? current[part] : current[part.to_sym]
        return nil if current.nil?
      end
      current
    end

    # Set a nested value via dot-notation key.
    def self.set_nested(data, key, value)
      parts = key.to_s.split(".")
      current = data
      parts[0..-2].each do |part|
        current[part] ||= {}
        current[part] = {} unless current[part].is_a?(Hash)
        current = current[part]
      end
      current[parts.last] = value
    end

    class << self
      private

      def check_type(val, expected)
        case expected
        when "string"  then val.is_a?(String)
        when "number"  then val.is_a?(Numeric)
        when "boolean" then [true, false].include?(val)
        when "array"   then val.is_a?(Array)
        when "hash", "object" then val.is_a?(Hash)
        else true
        end
      end

      def check_format(val, fmt)
        case fmt
        when "url"
          val.start_with?("http://") || val.start_with?("https://")
        when "ip", "ipv4"
          FORMAT_PATTERNS["ipv4"].match?(val)
        when "port"
          p = Integer(val, exception: false)
          p && p >= 1 && p <= 65_535
        when "email"
          FORMAT_PATTERNS["email"].match?(val)
        when "uuid"
          FORMAT_PATTERNS["uuid"].match?(val)
        when "date"
          FORMAT_PATTERNS["date"].match?(val)
        else
          val.match?(Regexp.new(fmt))
        end
      end

      def flatten_keys(data, prefix = "", out = [])
        data.each do |key, value|
          full_key = prefix.empty? ? key.to_s : "#{prefix}.#{key}"
          if value.is_a?(Hash)
            flatten_keys(value, full_key, out)
          else
            out << full_key
          end
        end
        out
      end
    end
  end
end
