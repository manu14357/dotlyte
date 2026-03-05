# frozen_string_literal: true

require "set"

module Dotlyte
  # Typed configuration builder with schema-driven validation and type coercion.
  #
  # A FieldDescriptor is a Hash with keys:
  #   :type       - "string", "integer", "float", "boolean", "array" (default: "string")
  #   :required   - Boolean (default: false)
  #   :default    - Default value if not set
  #   :enum       - Array of allowed values
  #   :min        - Minimum value (numeric types)
  #   :max        - Maximum value (numeric types)
  #   :sensitive  - Boolean, marks the field as sensitive (default: false)
  #   :doc        - Documentation string
  #
  # @example
  #   config = Dotlyte::TypedConfig.create(
  #     "PORT"     => { type: "integer", required: true, min: 1, max: 65535 },
  #     "DEBUG"    => { type: "boolean", default: false },
  #     "LOG_LEVEL" => { type: "string", enum: %w[debug info warn error], default: "info" }
  #   )
  #   config["PORT"]  #=> 8080
  class TypedConfig
    BOOLEAN_TRUE  = Set.new(%w[true yes 1 on]).freeze
    BOOLEAN_FALSE = Set.new(%w[false no 0 off]).freeze

    # Create a typed configuration from environment variables.
    #
    # @param schema [Hash{String => Hash}] key => FieldDescriptor mapping
    # @param skip_validation [Boolean] skip validation after coercion (default: false)
    # @param on_secret_access [Proc, nil] callback invoked when a sensitive key is accessed
    # @return [Hash] frozen Hash-like object with coerced, validated values
    # @raise [Dotlyte::Error] if validation fails
    def self.create(schema, skip_validation: false, on_secret_access: nil)
      new(schema, skip_validation: skip_validation, on_secret_access: on_secret_access).build
    end

    private_class_method :new

    # @api private
    def initialize(schema, skip_validation:, on_secret_access:)
      @schema = schema
      @skip_validation = skip_validation
      @on_secret_access = on_secret_access
    end

    # @api private
    # @return [Hash] frozen configuration hash
    def build
      errors = []
      result = {}

      @schema.each do |key, descriptor|
        descriptor = normalize_descriptor(descriptor)
        raw = ENV[key]

        # Apply default if not present
        if raw.nil? || raw.empty?
          if descriptor[:default] != nil # rubocop:disable Style/NonNilCheck
            result[key] = descriptor[:default]
            next
          elsif descriptor[:required]
            errors << "Required config key '#{key}' is missing. Set it as an environment variable."
            next
          else
            next
          end
        end

        # Coerce type
        begin
          value = coerce_value(raw, descriptor[:type], key)
        rescue Error => e
          errors << e.message
          next
        end

        # Validate enum
        if descriptor[:enum] && !descriptor[:enum].include?(value)
          errors << "Config key '#{key}': value #{value.inspect} is not in allowed values: #{descriptor[:enum].inspect}"
          next
        end

        # Validate min/max
        if value.is_a?(Numeric)
          if descriptor[:min] && value < descriptor[:min]
            errors << "Config key '#{key}': value #{value} is less than minimum #{descriptor[:min]}"
          end
          if descriptor[:max] && value > descriptor[:max]
            errors << "Config key '#{key}': value #{value} is greater than maximum #{descriptor[:max]}"
          end
        end

        result[key] = value
      end

      unless @skip_validation || errors.empty?
        raise Error, "TypedConfig validation failed:\n  - #{errors.join("\n  - ")}"
      end

      # Wrap with sensitive-access tracking if needed
      if @on_secret_access
        sensitive_keys = @schema.select { |_, d| d[:sensitive] }.keys.to_set
        build_sensitive_proxy(result, sensitive_keys)
      else
        result.freeze
      end
    end

    private

    # Normalize a FieldDescriptor hash with defaults.
    #
    # @param desc [Hash] raw descriptor
    # @return [Hash] normalized descriptor
    def normalize_descriptor(desc)
      {
        type: desc[:type] || "string",
        required: desc.fetch(:required, false),
        default: desc.key?(:default) ? desc[:default] : nil,
        enum: desc[:enum],
        min: desc[:min],
        max: desc[:max],
        sensitive: desc.fetch(:sensitive, false),
        doc: desc[:doc]
      }
    end

    # Coerce a string value to the expected type.
    #
    # @param raw [String] raw string value from ENV
    # @param type [String] expected type name
    # @param key [String] config key (for error messages)
    # @return [Object] coerced value
    # @raise [Dotlyte::Error] if coercion fails
    def coerce_value(raw, type, key)
      case type
      when "string"
        raw
      when "integer"
        unless raw.match?(/\A-?\d+\z/)
          raise Error, "Config key '#{key}': cannot convert #{raw.inspect} to integer"
        end
        Integer(raw)
      when "float"
        unless raw.match?(/\A-?\d+(\.\d+)?\z/)
          raise Error, "Config key '#{key}': cannot convert #{raw.inspect} to float"
        end
        Float(raw)
      when "boolean"
        lower = raw.downcase
        return true if BOOLEAN_TRUE.include?(lower)
        return false if BOOLEAN_FALSE.include?(lower)

        raise Error, "Config key '#{key}': cannot convert #{raw.inspect} to boolean"
      when "array"
        raw.split(",").map(&:strip)
      else
        raise Error, "Config key '#{key}': unknown type '#{type}'"
      end
    end

    # Build a proxy Hash that calls on_secret_access for sensitive keys.
    #
    # @param data [Hash] the config data
    # @param sensitive_keys [Set<String>] keys marked as sensitive
    # @return [Object] frozen proxy object
    def build_sensitive_proxy(data, sensitive_keys)
      callback = @on_secret_access
      frozen_data = data.freeze

      proxy = Object.new

      # Define [] accessor
      proxy.define_singleton_method(:[]) do |key|
        callback.call(key) if sensitive_keys.include?(key)
        frozen_data[key]
      end

      # Define key? method
      proxy.define_singleton_method(:key?) do |key|
        frozen_data.key?(key)
      end

      # Define keys method
      proxy.define_singleton_method(:keys) do
        frozen_data.keys
      end

      # Define to_h
      proxy.define_singleton_method(:to_h) do
        frozen_data.dup
      end

      # Define fetch
      proxy.define_singleton_method(:fetch) do |key, *args|
        callback.call(key) if sensitive_keys.include?(key)
        frozen_data.fetch(key, *args)
      end

      proxy.freeze
    end
  end
end
