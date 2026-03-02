# frozen_string_literal: true

require "dotlyte/version"
require "dotlyte/errors"
require "dotlyte/config"
require "dotlyte/coercion"
require "dotlyte/merger"
require "dotlyte/loader"

# DOTLYTE — The universal configuration library.
#
# @example
#   config = Dotlyte.load
#   config.port           # automatically Integer
#   config.debug          # automatically Boolean
#   config.database.host  # dot-notation access
module Dotlyte
  # Load configuration from all available sources.
  #
  # @param files [Array<String>, nil] Explicit files to load.
  # @param prefix [String, nil] Environment variable prefix to strip.
  # @param defaults [Hash, nil] Default values (lowest priority).
  # @param sources [Array<String>, nil] Custom source order.
  # @param env [String, nil] Environment name.
  # @return [Config] Merged configuration object.
  def self.load(files: nil, prefix: nil, defaults: nil, sources: nil, env: nil)
    Loader.new(
      files: files,
      prefix: prefix,
      defaults: defaults || {},
      sources: sources,
      env: env
    ).load
  end
end
