# frozen_string_literal: true

require "set"
require "dotlyte/version"
require "dotlyte/errors"
require "dotlyte/coercion"
require "dotlyte/merger"
require "dotlyte/interpolation"
require "dotlyte/validator"
require "dotlyte/encryption"
require "dotlyte/masking"
require "dotlyte/config"
require "dotlyte/loader"
require "dotlyte/watcher"
require "dotlyte/typed_config"
require "dotlyte/boundary_config"
require "dotlyte/workspace"

# DOTLYTE — The universal configuration library (v2).
#
# @example
#   config = Dotlyte.load
#   config.port           # automatically Integer
#   config.debug          # automatically Boolean
#   config.database.host  # dot-notation access
#
# @example Advanced
#   config = Dotlyte.load(
#     env: "production",
#     schema: { "port" => Dotlyte::SchemaRule.new(type: "number", required: true) },
#     strict: true,
#     find_up: true
#   )
module Dotlyte
  # Load configuration from all available sources.
  #
  # @param files [Array<String>, nil] Explicit files to load.
  # @param prefix [String, nil] Environment variable prefix to strip.
  # @param defaults [Hash, nil] Default values (lowest priority).
  # @param sources [Array<String>, nil] Custom source order.
  # @param env [String, nil] Environment name.
  # @param schema [Hash<String, SchemaRule>, nil] Validation schema.
  # @param strict [Boolean] Reject unknown keys.
  # @param interpolate_vars [Boolean] Enable ${VAR} interpolation (default: true).
  # @param overrides [Hash, nil] Override values (highest priority).
  # @param debug [Boolean] Enable debug output.
  # @param find_up [Boolean] Walk up directories to find config files.
  # @param root_markers [Array<String>] Markers for root directory detection.
  # @param cwd [String, nil] Working directory override.
  # @param allow_all_env_vars [Boolean] Import all env vars without filtering.
  # @param watch [Boolean] Watch files for changes.
  # @param debounce_ms [Integer] Polling interval for watcher.
  # @param custom_sources [Array<#load>] Custom source objects.
  # @return [Config] Merged configuration object.
  def self.load(**options)
    Loader.new(**{
      defaults: options[:defaults] || {}
    }.merge(options)).load
  end
end
