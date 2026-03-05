# frozen_string_literal: true

module Dotlyte
  # Sensitive value masking for DOTLYTE v2.
  module Masking
    REDACTED = "[REDACTED]"

    SENSITIVE_PATTERNS = [
      /password/i, /secret/i, /token/i, /api[_-]?key/i,
      /private[_-]?key/i, /access[_-]?key/i, /auth/i,
      /credential/i, /connection[_-]?string/i, /dsn/i,
      /encryption[_-]?key/i, /signing[_-]?key/i, /certificate/i
    ].freeze

    # Build the set of sensitive keys (auto-detected + schema).
    #
    # @param data [Hash] the config data
    # @param schema_keys [Array<String>] keys marked sensitive in schema
    # @return [Set<String>]
    def self.build_sensitive_set(data, schema_keys = [])
      set = Set.new(schema_keys)
      flat_keys = flatten_keys(data)

      flat_keys.each do |key|
        SENSITIVE_PATTERNS.each do |pat|
          if pat.match?(key)
            set.add(key)
            break
          end
        end
      end

      set
    end

    # Redact sensitive values in a deep hash.
    #
    # @param data [Hash]
    # @param sensitive_keys [Set<String>]
    # @return [Hash] copy with redacted values
    def self.redact(data, sensitive_keys, prefix = "")
      data.each_with_object({}) do |(key, value), result|
        full_key = prefix.empty? ? key.to_s : "#{prefix}.#{key}"

        result[key] = if sensitive_keys.include?(full_key)
                        REDACTED
                      elsif value.is_a?(Hash)
                        redact(value, sensitive_keys, full_key)
                      else
                        value
                      end
      end
    end

    # Partially show a value: first 2 chars visible, rest masked.
    def self.format_redacted(value)
      return REDACTED if value.nil?
      return "*" * value.length if value.length <= 4

      value[0..1] + "*" * (value.length - 2)
    end

    # Compile glob patterns into an array of Regexp objects.
    #
    # Supports `*` (any chars except dot) and `**` (any chars including dot).
    #
    # @param patterns [Array<String>] glob-style patterns (e.g., "db.*", "**secret**")
    # @return [Array<Regexp>] compiled regular expressions
    def self.compile_patterns(patterns)
      patterns.map do |pat|
        # Escape everything except our glob wildcards
        re = pat.gsub(".", "\\.") # escape dots first
        re = re.gsub("**", "\x00DOUBLESTAR\x00")
        re = re.gsub("*", "[^.]*")
        re = re.gsub("\x00DOUBLESTAR\x00", ".*")
        Regexp.new("\\A#{re}\\z", Regexp::IGNORECASE)
      end
    end

    # Build a sensitive key set using glob patterns and schema-declared sensitive keys.
    #
    # @param keys [Array<String>] all flat keys to check
    # @param patterns [Array<String>] glob patterns for sensitive key matching
    # @param schema_sensitive [Set<String>] keys explicitly marked sensitive in schema
    # @return [Set<String>] combined set of sensitive keys
    def self.build_sensitive_set_with_patterns(keys, patterns:, schema_sensitive: Set.new)
      compiled = compile_patterns(patterns)
      set = Set.new(schema_sensitive)

      keys.each do |key|
        compiled.each do |re|
          if re.match?(key)
            set.add(key)
            break
          end
        end
      end

      set
    end

    # Create an audit proxy that wraps a Hash and invokes a callback on sensitive key access.
    #
    # @param data [Hash] the configuration data
    # @param sensitive_keys [Set<String>] keys that trigger the callback
    # @param on_access [Proc] callback receiving the accessed key name
    # @return [Object] a frozen proxy object with [] and get methods
    def self.create_audit_proxy(data, sensitive_keys:, on_access:)
      frozen_data = data.freeze
      sens = sensitive_keys.is_a?(Set) ? sensitive_keys : Set.new(sensitive_keys)
      cb = on_access

      proxy = Object.new

      proxy.define_singleton_method(:[]) do |key|
        cb.call(key) if sens.include?(key)
        frozen_data[key]
      end

      proxy.define_singleton_method(:get) do |key, default_val = nil|
        cb.call(key) if sens.include?(key)
        val = frozen_data[key]
        val.nil? ? default_val : val
      end

      proxy.define_singleton_method(:keys) do
        frozen_data.keys
      end

      proxy.define_singleton_method(:to_h) do
        frozen_data.dup
      end

      proxy.freeze
    end

    class << self
      private

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
