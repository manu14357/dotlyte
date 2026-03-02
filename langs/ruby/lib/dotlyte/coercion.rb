# frozen_string_literal: true

module Dotlyte
  # Type coercion engine.
  module Coercion
    NULL_VALUES = %w[null none nil].freeze
    TRUE_VALUES = %w[true yes 1 on].freeze
    FALSE_VALUES = %w[false no 0 off].freeze

    # Auto-convert a string value to the correct Ruby type.
    #
    # @param value [Object] the value to coerce
    # @return [Object] the coerced value
    def self.coerce(value)
      return value unless value.is_a?(String)

      stripped = value.strip
      lower = stripped.downcase

      # Null
      return nil if stripped.empty? || NULL_VALUES.include?(lower)

      # Boolean
      return true if TRUE_VALUES.include?(lower)
      return false if FALSE_VALUES.include?(lower)

      # Integer
      return Integer(stripped) if stripped.match?(/\A-?\d+\z/)

      # Float
      if stripped.include?(".") && stripped.match?(/\A-?\d+\.\d+\z/)
        return Float(stripped)
      end

      # List (comma-separated)
      if stripped.include?(",")
        return stripped.split(",").map { |item| coerce(item.strip) }
      end

      # String
      stripped
    end

    # Recursively coerce all string values in a hash.
    def self.coerce_hash(data)
      data.each_with_object({}) do |(key, value), result|
        result[key] = case value
                      when Hash then coerce_hash(value)
                      when String then coerce(value)
                      else value
                      end
      end
    end
  end
end
