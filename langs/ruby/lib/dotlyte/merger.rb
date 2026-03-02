# frozen_string_literal: true

module Dotlyte
  # Deep merge utility.
  module Merger
    # Deep merge two hashes. Values in override take precedence.
    def self.deep_merge(base, override)
      result = base.dup

      override.each do |key, value|
        result[key] = if result.key?(key) && result[key].is_a?(Hash) && value.is_a?(Hash)
                        deep_merge(result[key], value)
                      else
                        value
                      end
      end

      result
    end
  end
end
