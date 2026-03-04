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
  class MissingKeyError < Error
    # @return [Array<String>] the source files that were checked
    attr_reader :sources_checked

    def initialize(message, key: nil, sources_checked: [])
      super(message, key: key)
      @sources_checked = sources_checked
    end
  end

  # Raised when a config file has invalid syntax.
  class ParseError < Error; end

  # Raised when a config file cannot be read or found.
  class FileError < Error
    # @return [String, nil] the file path
    attr_reader :file_path

    def initialize(message, file_path: nil, key: nil)
      super(message, key: key)
      @file_path = file_path
    end
  end

  # Raised when schema validation fails.
  class ValidationError < Error
    # @return [Array<SchemaViolation>] the violations found
    attr_reader :violations

    def initialize(message, violations: [], key: nil)
      super(message, key: key)
      @violations = violations
    end
  end

  # Raised when variable interpolation fails (e.g., circular reference).
  class InterpolationError < Error; end

  # Raised when decryption of an encrypted value fails.
  class DecryptionError < Error; end
end
