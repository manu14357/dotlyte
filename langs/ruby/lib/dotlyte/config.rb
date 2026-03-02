# frozen_string_literal: true

module Dotlyte
  # Configuration object with dot-notation access via method_missing.
  class Config
    # @param data [Hash] the configuration data
    def initialize(data)
      @data = data
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

    # Required access — raises DotlyteError if missing.
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

    # Check if a key exists.
    def has?(key)
      !get(key).nil?
    end

    # Convert to a plain Hash.
    def to_h
      @data.dup
    end

    # Support dot-notation via method_missing.
    def method_missing(name, *args)
      key = name.to_s
      if @data.key?(key)
        val = @data[key]
        val.is_a?(Hash) ? Config.new(val) : val
      else
        super
      end
    end

    def respond_to_missing?(name, include_private = false)
      @data.key?(name.to_s) || super
    end

    def inspect
      "Config(#{@data})"
    end

    alias_method :to_s, :inspect
  end
end
