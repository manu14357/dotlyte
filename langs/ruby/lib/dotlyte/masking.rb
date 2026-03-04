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
