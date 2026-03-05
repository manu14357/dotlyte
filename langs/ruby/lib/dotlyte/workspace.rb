# frozen_string_literal: true

require "json"

module Dotlyte
  # Workspace support for monorepo environments.
  #
  # Detects monorepo roots (pnpm, turbo, nx, lerna, npm/yarn workspaces),
  # loads shared environment files, and merges per-package configs.
  #
  # @example
  #   info = Dotlyte::Workspace.find_monorepo_root
  #   configs = Dotlyte::Workspace.load_workspace(
  #     root: info.root,
  #     packages: %w[packages/api packages/web],
  #     shared_env_file: ".env"
  #   )
  module Workspace
    # Information about a detected monorepo.
    MonorepoInfo = Struct.new(:root, :type, :packages, keyword_init: true)

    # Marker files and their monorepo type.
    MARKERS = {
      "pnpm-workspace.yaml" => :pnpm,
      "turbo.json"          => :turbo,
      "nx.json"             => :nx,
      "lerna.json"          => :lerna
    }.freeze

    # Detect the monorepo root by walking up from the given directory.
    #
    # @param cwd [String] starting directory (default: Dir.pwd)
    # @return [MonorepoInfo, nil] info about the monorepo or nil if not found
    def self.find_monorepo_root(cwd: Dir.pwd)
      dir = File.expand_path(cwd)

      loop do
        # Check explicit monorepo markers
        MARKERS.each do |marker, type|
          marker_path = File.join(dir, marker)
          if File.exist?(marker_path)
            packages = detect_packages(dir, type, marker_path)
            return MonorepoInfo.new(root: dir, type: type, packages: packages)
          end
        end

        # Check package.json for workspaces field (npm/yarn)
        pkg_json = File.join(dir, "package.json")
        if File.exist?(pkg_json)
          begin
            pkg = JSON.parse(File.read(pkg_json))
            if pkg.key?("workspaces")
              packages = resolve_workspace_globs(dir, pkg["workspaces"])
              return MonorepoInfo.new(root: dir, type: :npm, packages: packages)
            end
          rescue JSON::ParserError
            # ignore malformed package.json
          end
        end

        parent = File.dirname(dir)
        break if parent == dir # filesystem root

        dir = parent
      end

      nil
    end

    # Load workspace configuration for a monorepo.
    #
    # @param root [String, nil] monorepo root directory (auto-detected if nil)
    # @param packages [Array<String>, nil] package directories to load
    # @param shared_env_file [String, nil] shared .env file name relative to root
    # @param prefix [String, nil] environment variable prefix to strip
    # @param env [String, nil] environment name
    # @return [Hash{String => Dotlyte::Config}] package name => Config mapping
    def self.load_workspace(root: nil, packages: nil, shared_env_file: nil, prefix: nil, env: nil)
      info = root ? MonorepoInfo.new(root: root, type: :unknown, packages: packages || []) : find_monorepo_root
      raise Error, "Could not detect monorepo root. Specify root: explicitly." unless info

      actual_root = info.root
      package_dirs = packages || info.packages || []
      shared = get_shared_env(actual_root, prefix: prefix)

      results = {}

      package_dirs.each do |pkg_dir|
        full_path = File.expand_path(pkg_dir, actual_root)
        next unless File.directory?(full_path)

        pkg_name = File.basename(pkg_dir)

        config = Dotlyte.load(
          cwd: full_path,
          defaults: shared,
          prefix: prefix,
          env: env
        )

        results[pkg_name] = config
      end

      results
    end

    # Load shared environment variables from the monorepo root.
    #
    # @param root [String] monorepo root directory
    # @param prefix [String, nil] env var prefix to strip
    # @return [Hash] shared environment data
    def self.get_shared_env(root, prefix: nil)
      env_file = File.join(root, ".env")
      return {} unless File.exist?(env_file)

      data = {}
      File.readlines(env_file, chomp: true).each do |line|
        line = line.strip
        next if line.empty? || line.start_with?("#")

        key, _, value = line.partition("=")
        key = key.strip
        value = value.strip

        # Strip quotes
        if (value.start_with?('"') && value.end_with?('"')) ||
           (value.start_with?("'") && value.end_with?("'"))
          value = value[1..-2]
        end

        # Strip prefix if provided
        if prefix && key.start_with?(prefix)
          key = key[prefix.length..]
          key = key.delete_prefix("_") # remove leading underscore after prefix
        end

        data[key.downcase] = Coercion.coerce(value)
      end

      data
    end

    class << self
      private

      # Detect packages in a monorepo based on type.
      #
      # @param root [String] monorepo root
      # @param type [Symbol] monorepo type
      # @param marker_path [String] path to the marker file
      # @return [Array<String>]
      def detect_packages(root, type, marker_path)
        case type
        when :pnpm
          parse_pnpm_workspace(marker_path, root)
        when :lerna
          parse_lerna_config(marker_path, root)
        when :turbo, :nx
          # Turbo/NX typically use package.json workspaces
          pkg_json = File.join(root, "package.json")
          if File.exist?(pkg_json)
            begin
              pkg = JSON.parse(File.read(pkg_json))
              return resolve_workspace_globs(root, pkg["workspaces"]) if pkg.key?("workspaces")
            rescue JSON::ParserError
              # ignore
            end
          end
          []
        else
          []
        end
      end

      # Parse pnpm-workspace.yaml for package globs.
      #
      # @param path [String] path to pnpm-workspace.yaml
      # @param root [String] monorepo root
      # @return [Array<String>]
      def parse_pnpm_workspace(path, root)
        # Simple YAML parsing without requiring the yaml gem for this
        globs = []
        in_packages = false

        File.readlines(path, chomp: true).each do |line|
          if line.match?(/\Apackages\s*:/)
            in_packages = true
            next
          elsif line.match?(/\A\S/)
            in_packages = false
            next
          end

          if in_packages && (m = line.match(/\A\s*-\s*['"]?(.+?)['"]?\s*\z/))
            globs << m[1]
          end
        end

        resolve_workspace_globs(root, globs)
      end

      # Parse lerna.json for package directories.
      #
      # @param path [String] path to lerna.json
      # @param root [String] monorepo root
      # @return [Array<String>]
      def parse_lerna_config(path, root)
        config = JSON.parse(File.read(path))
        globs = config["packages"] || ["packages/*"]
        resolve_workspace_globs(root, globs)
      rescue JSON::ParserError
        []
      end

      # Resolve workspace glob patterns to actual directories.
      #
      # @param root [String] monorepo root
      # @param patterns [Array<String>, Hash, nil] glob patterns or workspaces config
      # @return [Array<String>]
      def resolve_workspace_globs(root, patterns)
        patterns = patterns["packages"] if patterns.is_a?(Hash) && patterns.key?("packages")
        return [] unless patterns.is_a?(Array)

        dirs = []
        patterns.each do |pattern|
          full_pattern = File.join(root, pattern)
          Dir.glob(full_pattern).each do |match|
            dirs << match if File.directory?(match)
          end
        end

        dirs.sort
      end
    end
  end
end
