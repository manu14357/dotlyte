# frozen_string_literal: true

require "optparse"
require "json"

module Dotlyte
  # Command-line interface for DOTLYTE.
  #
  # Provides commands for checking config, diffing environments,
  # generating type stubs, encrypting values, diagnosing issues, and
  # initializing new projects.
  #
  # @example
  #   Dotlyte::CLI.new.run(%w[check --env production])
  class CLI
    COMMANDS = %w[check diff generate_types encrypt doctor init].freeze

    # Run the CLI with the given arguments.
    #
    # @param args [Array<String>] command-line arguments (default: ARGV)
    # @return [void]
    def run(args = ARGV)
      command, options = parse_global(args)

      case command
      when "check"          then cmd_check(options)
      when "diff"           then cmd_diff(options)
      when "generate_types" then cmd_generate_types(options)
      when "encrypt"        then cmd_encrypt(options)
      when "doctor"         then cmd_doctor(options)
      when "init"           then cmd_init(options)
      when nil
        puts global_help
      else
        $stderr.puts "Unknown command: #{command}"
        $stderr.puts "Available commands: #{COMMANDS.join(', ')}"
        exit 1
      end
    end

    private

    # Parse global options and extract the command name.
    #
    # @param args [Array<String>]
    # @return [Array(String, Hash)]
    def parse_global(args)
      options = {}
      parser = OptionParser.new do |opts|
        opts.banner = "Usage: dotlyte <command> [options]"
        opts.separator ""
        opts.separator "Commands: #{COMMANDS.join(', ')}"
        opts.separator ""

        opts.on("-h", "--help", "Show help") do
          puts opts
          exit 0
        end

        opts.on("-v", "--version", "Show version") do
          puts "dotlyte #{Dotlyte::VERSION}"
          exit 0
        end
      end

      # Stop at first non-option (the command)
      remaining = parser.order(args)
      command = remaining.shift
      options[:remaining] = remaining

      [command, options]
    end

    # Check command — validates the current configuration.
    #
    # @param options [Hash]
    # @return [void]
    def cmd_check(options)
      opts = { env: nil, files: nil }
      OptionParser.new do |o|
        o.banner = "Usage: dotlyte check [options]"
        o.on("--env ENV", "Environment name") { |v| opts[:env] = v }
        o.on("--files FILES", "Comma-separated file list") { |v| opts[:files] = v.split(",").map(&:strip) }
      end.parse!(options[:remaining])

      load_opts = {}
      load_opts[:env] = opts[:env] if opts[:env]
      load_opts[:files] = opts[:files] if opts[:files]

      begin
        config = Dotlyte.load(**load_opts)
        puts "Configuration loaded successfully."
        puts "Keys: #{config.keys.join(', ')}"
      rescue Dotlyte::Error => e
        $stderr.puts "Configuration error: #{e.message}"
        exit 1
      end
    end

    # Diff command — compare two environment configurations.
    #
    # @param options [Hash]
    # @return [void]
    def cmd_diff(options)
      opts = { env1: nil, env2: nil }
      OptionParser.new do |o|
        o.banner = "Usage: dotlyte diff --env1 ENV1 --env2 ENV2"
        o.on("--env1 ENV", "First environment") { |v| opts[:env1] = v }
        o.on("--env2 ENV", "Second environment") { |v| opts[:env2] = v }
      end.parse!(options[:remaining])

      unless opts[:env1] && opts[:env2]
        $stderr.puts "Both --env1 and --env2 are required."
        exit 1
      end

      begin
        config1 = Dotlyte.load(env: opts[:env1])
        config2 = Dotlyte.load(env: opts[:env2])
        h1 = config1.to_flat_hash
        h2 = config2.to_flat_hash

        all_keys = (h1.keys + h2.keys).uniq.sort

        all_keys.each do |key|
          v1 = h1[key]
          v2 = h2[key]
          if v1.nil?
            puts "+ #{key} = #{v2.inspect}  (only in #{opts[:env2]})"
          elsif v2.nil?
            puts "- #{key} = #{v1.inspect}  (only in #{opts[:env1]})"
          elsif v1 != v2
            puts "~ #{key}: #{v1.inspect} -> #{v2.inspect}"
          end
        end
      rescue Dotlyte::Error => e
        $stderr.puts "Error: #{e.message}"
        exit 1
      end
    end

    # Generate types stub.
    #
    # @param options [Hash]
    # @return [void]
    def cmd_generate_types(options)
      opts = { output: nil }
      OptionParser.new do |o|
        o.banner = "Usage: dotlyte generate_types [options]"
        o.on("--output FILE", "Output file path") { |v| opts[:output] = v }
      end.parse!(options[:remaining])

      begin
        config = Dotlyte.load
        flat = config.to_flat_hash

        lines = ["# Auto-generated DOTLYTE type stubs", "# Generated at #{Time.now.iso8601}", ""]
        flat.each do |key, value|
          type_name = case value
                      when Integer then "Integer"
                      when Float then "Float"
                      when TrueClass, FalseClass then "Boolean"
                      when Array then "Array"
                      when Hash then "Hash"
                      when NilClass then "NilClass"
                      else "String"
                      end
          lines << "# @type #{key} [#{type_name}] = #{value.inspect}"
        end

        output = lines.join("\n") + "\n"

        if opts[:output]
          File.write(opts[:output], output)
          puts "Type stubs written to #{opts[:output]}"
        else
          puts output
        end
      rescue Dotlyte::Error => e
        $stderr.puts "Error: #{e.message}"
        exit 1
      end
    end

    # Encrypt a value.
    #
    # @param options [Hash]
    # @return [void]
    def cmd_encrypt(options)
      opts = { value: nil, key: nil }
      OptionParser.new do |o|
        o.banner = "Usage: dotlyte encrypt --value VALUE [--key KEY]"
        o.on("--value VALUE", "Value to encrypt") { |v| opts[:value] = v }
        o.on("--key KEY", "Encryption key (hex)") { |v| opts[:key] = v }
      end.parse!(options[:remaining])

      unless opts[:value]
        $stderr.puts "Usage: dotlyte encrypt --value VALUE [--key KEY]"
        exit 1
      end

      key = opts[:key] || Encryption.resolve_encryption_key || Encryption.generate_key
      encrypted = Encryption.encrypt_value(opts[:value], key)
      puts "Key: #{key}" unless opts[:key]
      puts "Encrypted: #{encrypted}"
    end

    # Doctor command — diagnose configuration issues.
    #
    # @param options [Hash]
    # @return [void]
    def cmd_doctor(options)
      OptionParser.new do |o|
        o.banner = "Usage: dotlyte doctor"
      end.parse!(options[:remaining])

      puts "DOTLYTE Doctor"
      puts "=" * 40

      # Check Ruby version
      puts "Ruby version: #{RUBY_VERSION} #{RUBY_VERSION >= "3.0.0" ? '✓' : '✗ (need >= 3.0)'}"

      # Check for config files
      config_files = %w[.env config.yaml config.yml config.json]
      config_files.each do |f|
        status = File.exist?(f) ? "found" : "not found"
        puts "#{f}: #{status}"
      end

      # Check encryption key
      enc_key = Encryption.resolve_encryption_key
      puts "Encryption key: #{enc_key ? 'configured' : 'not configured'}"

      # Try loading config
      begin
        config = Dotlyte.load
        puts "Config load: success (#{config.keys.size} keys)"
      rescue Dotlyte::Error => e
        puts "Config load: FAILED — #{e.message}"
      end
    end

    # Init command — create a starter .env file.
    #
    # @param options [Hash]
    # @return [void]
    def cmd_init(options)
      opts = { force: false }
      OptionParser.new do |o|
        o.banner = "Usage: dotlyte init [options]"
        o.on("--force", "Overwrite existing files") { opts[:force] = true }
      end.parse!(options[:remaining])

      env_file = ".env"
      if File.exist?(env_file) && !opts[:force]
        $stderr.puts "#{env_file} already exists. Use --force to overwrite."
        exit 1
      end

      content = <<~ENV
        # DOTLYTE Configuration
        # Generated by dotlyte init

        # Application
        APP_NAME=my-app
        APP_ENV=development
        PORT=3000
        DEBUG=true

        # Database
        # DB_HOST=localhost
        # DB_PORT=5432
        # DB_NAME=mydb
      ENV

      File.write(env_file, content)
      puts "Created #{env_file}"
    end

    # Global help text.
    #
    # @return [String]
    def global_help
      <<~HELP
        dotlyte #{Dotlyte::VERSION} — The universal configuration library

        Usage: dotlyte <command> [options]

        Commands:
          check           Validate current configuration
          diff            Compare two environment configurations
          generate_types  Generate type stubs from current config
          encrypt         Encrypt a value
          doctor          Diagnose configuration issues
          init            Create a starter .env file

        Run 'dotlyte <command> --help' for command-specific options.
      HELP
    end
  end
end
