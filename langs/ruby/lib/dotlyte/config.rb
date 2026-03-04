# frozen_string_literal: true

require "json"
require "set"

module Dotlyte
  # Immutable configuration object with dot-notation access via method_missing.
  class Config
    # @param data [Hash] the configuration data
    # @param schema [Hash<String, SchemaRule>, nil] optional schema for validation
    # @param sensitive_keys [Set<String>] keys to redact in output
    def initialize(data, schema: nil, sensitive_keys: Set.new)
      @data = data.freeze
      @schema = schema
      @sensitive_keys = sensitive_keys
    end

    # Safe access with dot-notation and optional default.
    #
    # @param key [String] dot-notation key (e.g., "database.host")
    # @param default_value [Object] fallback if key is missing
    # @return [Object] the config value or default
    def get(key, default_value = nil)
      parts = key.to_s.split(".")
      val = @data

      parts.each do |part|
        if val.is_a?(Hash)
          val = val.key?(part) ? val[part] : val[part.to_sym]
          return default_value if val.nil?
        else
          return default_value
        end
      end

      val
    end

    # Required access — raises MissingKeyError if missing.
    #
    # @param key [String] the config key
    # @return [Object] the config value
    # @raise [MissingKeyError] if the key is missing
    def require(key)
      val = get(key)
      if val.nil?
        raise MissingKeyError.new(
          "Required config key '#{key}' is missing. " \
          "Set it in your .env file or as an environment variable.",
          key: key
        )
      end
      val
    end

    # Require multiple keys at once.
    #
    # @param keys [Array<String>] the config keys
    # @return [Array<Object>] the values
    # @raise [MissingKeyError] if any key is missing
    def require_keys(*keys)
      keys.flatten.map { |k| self.require(k) }
    end

    # Check if a key exists.
    def has?(key)
      !get(key).nil?
    end

    # Get a scoped sub-config (returns a new Config for a nested hash).
    #
    # @param prefix [String] dot-notation prefix
    # @return [Config] scoped config
    def scope(prefix)
      sub = get(prefix)
      raise Error.new("No config section found for '#{prefix}'", key: prefix) unless sub.is_a?(Hash)

      scoped_sensitive = Set.new
      @sensitive_keys.each do |sk|
        scoped_sensitive.add(sk.delete_prefix("#{prefix}.")) if sk.start_with?("#{prefix}.")
      end

      Config.new(sub, schema: nil, sensitive_keys: scoped_sensitive)
    end

    # All top-level keys.
    def keys
      @data.keys
    end

    # All keys flattened via dot-notation.
    def to_flat_keys
      flat_keys(@data)
    end

    # Flatten the config to a single-level hash.
    def to_flat_hash
      flatten(@data)
    end

    # Convert to a plain Hash (deep copy).
    def to_h
      deep_dup(@data)
    end

    # Return a redacted hash with sensitive values masked.
    def to_h_redacted
      Masking.redact(deep_dup(@data), @sensitive_keys)
    end

    # Serialize to JSON.
    def to_json(*_args)
      JSON.generate(to_h)
    end

    # Write config to a file (JSON or YAML).
    def write_to(path)
      ext = File.extname(path).downcase
      content = case ext
                when ".json"
                  JSON.pretty_generate(to_h)
                when ".yaml", ".yml"
                  require "yaml"
                  YAML.dump(to_h)
                else
                  raise Error, "Unsupported output format: #{ext}"
                end
      File.write(path, content)
    end

    # Validate against schema. Returns array of violations.
    def validate(schema = nil)
      s = schema || @schema
      return [] unless s

      Validator.validate(deep_dup(@data), s)
    end

    # Validate and raise on failure.
    def assert_valid!(schema = nil)
      s = schema || @schema
      return unless s

      Validator.assert_valid!(deep_dup(@data), s)
    end

    # Support dot-notation via method_missing.
    def method_missing(name, *args)
      key = name.to_s
      if @data.key?(key)
        val = @data[key]
        val.is_a?(Hash) ? Config.new(val, sensitive_keys: scoped_sensitive_keys(key)) : val
      else
        super
      end
    end

    def respond_to_missing?(name, include_private = false)
      @data.key?(name.to_s) || super
    end

    def inspect
      "Config(#{to_h_redacted})"
    end

    alias_method :to_s, :inspect

    private

    def deep_dup(hash)
      hash.each_with_object({}) do |(k, v), out|
        out[k] = v.is_a?(Hash) ? deep_dup(v) : v
      end
    end

    def flat_keys(hash, prefix = "", out = [])
      hash.each do |key, value|
        full = prefix.empty? ? key.to_s : "#{prefix}.#{key}"
        if value.is_a?(Hash)
          flat_keys(value, full, out)
        else
          out << full
        end
      end
      out
    end

    def flatten(hash, prefix = "", out = {})
      hash.each do |key, value|
        full = prefix.empty? ? key.to_s : "#{prefix}.#{key}"
        if value.is_a?(Hash)
          flatten(value, full, out)
        else
          out[full] = value
        end
      end
      out
    end

    def scoped_sensitive_keys(key)
      scoped = Set.new
      prefix = "#{key}."
      @sensitive_keys.each do |sk|
        scoped.add(sk.delete_prefix(prefix)) if sk.start_with?(prefix)
      end
      scoped
    end
  end
end
