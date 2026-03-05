# frozen_string_literal: true

require "set"

module Dotlyte
  # Boundary-aware configuration that separates server, client, and shared keys.
  #
  # Provides immutable access to configuration data with boundary enforcement,
  # ensuring client code cannot accidentally access server-only secrets.
  #
  # @example
  #   boundary = Dotlyte::BoundaryConfig.new(
  #     data,
  #     server_keys: %w[DB_PASSWORD API_SECRET],
  #     client_keys: %w[APP_NAME THEME],
  #     shared_keys: %w[LOG_LEVEL]
  #   )
  #   boundary.server_only  #=> { "DB_PASSWORD" => "...", "API_SECRET" => "..." }
  #   boundary.client_only  #=> { "APP_NAME" => "...", "THEME" => "..." }
  class BoundaryConfig
    # @param data [Hash] the full configuration data
    # @param server_keys [Array<String>] keys accessible only in server context
    # @param client_keys [Array<String>] keys accessible only in client context
    # @param shared_keys [Array<String>] keys accessible in both contexts
    # @param on_secret_access [Proc, nil] callback when a server-only key is accessed
    def initialize(data, server_keys:, client_keys:, shared_keys: [], on_secret_access: nil)
      @data = data.freeze
      @server_keys = Set.new(server_keys)
      @client_keys = Set.new(client_keys)
      @shared_keys = Set.new(shared_keys)
      @on_secret_access = on_secret_access
      freeze
    end

    # Access a configuration value by key.
    #
    # @param key [String] the configuration key
    # @return [Object, nil] the value or nil if not found
    def [](key)
      @on_secret_access&.call(key) if @server_keys.include?(key)
      @data[key]
    end

    # Access a configuration value by key (alias for []).
    #
    # @param key [String] the configuration key
    # @param default [Object, nil] fallback value
    # @return [Object] the value or default
    def get(key, default = nil)
      val = self[key]
      val.nil? ? default : val
    end

    # Prevent mutation — raises FrozenError.
    #
    # @param _key [String]
    # @param _value [Object]
    # @raise [FrozenError]
    def []=(key, _value)
      raise FrozenError, "can't modify frozen #{self.class}: attempted to set '#{key}'"
    end

    # Return a Hash containing only server-context keys (server + shared).
    #
    # @return [Hash] server-only configuration
    def server_only
      filter_keys(@server_keys | @shared_keys)
    end

    # Return a Hash containing only client-context keys (client + shared).
    #
    # @return [Hash] client-only configuration
    def client_only
      filter_keys(@client_keys | @shared_keys)
    end

    # Whether we are in a server context. Always true in Ruby.
    #
    # @return [Boolean]
    def self.server_context?
      true
    end

    # Whether we are in a client context. Always false in Ruby.
    #
    # @return [Boolean]
    def self.client_context?
      false
    end

    # All known keys across all boundaries.
    #
    # @return [Array<String>]
    def keys
      (@server_keys | @client_keys | @shared_keys).to_a
    end

    # Convert to a plain Hash (all data).
    #
    # @return [Hash]
    def to_h
      @data.dup
    end

    def inspect
      "#<#{self.class} server_keys=#{@server_keys.size} client_keys=#{@client_keys.size} shared_keys=#{@shared_keys.size}>"
    end

    private

    # Filter the data hash to only include the given keys.
    #
    # @param allowed [Set<String>] allowed keys
    # @return [Hash]
    def filter_keys(allowed)
      @data.each_with_object({}) do |(k, v), result|
        result[k] = v if allowed.include?(k)
      end
    end
  end
end
