# frozen_string_literal: true

module Dotlyte
  # Base error class for all DOTLYTE errors.
  class Error < StandardError
    # @return [String, nil] the config key that caused the error
    attr_reader :key

    def initialize(message, key: nil)
      super(message)
      @key = key
    end
  end

  # Raised when require() encounters a missing key.
  class MissingKeyError < Error; end

  # Raised when a config file has invalid syntax.
  class ParseError < Error; end
end
