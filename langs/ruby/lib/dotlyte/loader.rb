# frozen_string_literal: true

require "json"
require "set"

module Dotlyte
  # Abstract source interface. Implement #load to return a Hash.
  module Source
    def load
      raise NotImplementedError, "#{self.class}#load must return a Hash"
    end
  end

  # Main loader orchestrator (v2).
  class Loader
    # System env vars that are never imported automatically.
    SYSTEM_ENV_BLOCKLIST = Set.new(%w[
      PATH HOME USER SHELL TERM LANG LC_ALL LOGNAME HOSTNAME
      PWD OLDPWD SHLVL TMPDIR EDITOR VISUAL PAGER DISPLAY
      SSH_AUTH_SOCK SSH_AGENT_PID GPG_AGENT_INFO
      COLORTERM TERM_PROGRAM TERM_PROGRAM_VERSION
      XPC_FLAGS XPC_SERVICE_NAME COMMAND_MODE
      LS_COLORS LSCOLORS CLICOLOR GREP_OPTIONS
      COMP_WORDBREAKS HISTSIZE HISTFILESIZE HISTCONTROL
    ]).freeze

    SYSTEM_PREFIXES = %w[
      npm_ VSCODE_ ELECTRON_ CHROME_ GITHUB_ CI_ GITLAB_
      JENKINS_ TRAVIS_ CIRCLECI_ HOMEBREW_ JAVA_HOME GOPATH
      NVM_ RVM_ RBENV_ PYENV_ CONDA_ VIRTUAL_ENV CARGO_HOME
    ].freeze

    DEFAULT_ROOT_MARKERS = %w[
      .git .hg package.json Gemfile go.mod Cargo.toml build.gradle
      pom.xml pyproject.toml .dotlyte
    ].freeze

    def initialize(**options)
      @files = options[:files]
      @prefix = options[:prefix]
      @defaults = options[:defaults] || {}
      @sources = options[:sources]
      @env = options[:env]
      @schema = options[:schema]
      @strict = options.fetch(:strict, false)
      @interpolate_vars = options.fetch(:interpolate_vars, true)
      @overrides = options[:overrides] || {}
      @debug = options.fetch(:debug, false)
      @find_up = options.fetch(:find_up, false)
      @root_markers = options[:root_markers] || DEFAULT_ROOT_MARKERS
      @cwd = options[:cwd] || Dir.pwd
      @allow_all_env_vars = options.fetch(:allow_all_env_vars, false)
      @watch = options.fetch(:watch, false)
      @debounce_ms = options[:debounce_ms] || 300
      @custom_sources = options[:custom_sources] || []
    end

    def load
      base_dir = @find_up ? find_base_dir : @cwd
      layers = []

      if @files && !@files.empty?
        # Explicit file mode
        @files.each do |f|
          full = File.expand_path(f, base_dir)
          unless File.exist?(full)
            raise FileError.new(
              "Config file not found: #{full}",
              file_path: full
            )
          end
          data = parse_file_by_extension(full)
          layers << data if data && !data.empty?
        end
      elsif @sources
        @sources.each do |source|
          data = load_source(source, base_dir)
          layers << data if data && !data.empty?
        end
      else
        append_if(layers, @defaults)
        append_if(layers, load_yaml_files(base_dir))
        append_if(layers, load_json_files(base_dir))
        append_if(layers, load_dotenv_files(base_dir))
        append_if(layers, load_env_vars)
      end

      # Custom sources
      @custom_sources.each do |src|
        data = src.respond_to?(:load) ? src.load : nil
        layers << data if data.is_a?(Hash) && !data.empty?
      end

      # Overrides (highest priority)
      append_if(layers, @overrides)

      merged = {}
      layers.each { |layer| merged = Merger.deep_merge(merged, layer) }

      # Interpolation
      if @interpolate_vars
        merged = Interpolation.interpolate_deep(merged)
      end

      # Schema defaults
      if @schema
        Validator.apply_defaults(merged, @schema)
      end

      # Decryption
      enc_key = Encryption.resolve_encryption_key(@env)
      decrypt_recursive!(merged, enc_key) if enc_key

      # Schema validation
      if @schema
        Validator.assert_valid!(merged, @schema, strict: @strict) if @strict
      end

      # Sensitive keys
      sensitive = Set.new
      sensitive.merge(Validator.sensitive_keys(@schema)) if @schema
      sensitive.merge(Masking.build_sensitive_set(merged))

      config = Config.new(merged, schema: @schema, sensitive_keys: sensitive)

      # Watch
      if @watch
        watched_files = collect_watched_files(base_dir)
        unless watched_files.empty?
          watcher = ConfigWatcher.new(files: watched_files, debounce_ms: @debounce_ms)
          reload_fn = -> { self.class.new(**reload_options).load_raw }
          watcher.start(reload_fn)
        end
      end

      config
    end

    # Load raw data (no Config wrapping) for watcher reloads.
    def load_raw
      base_dir = @find_up ? find_base_dir : @cwd
      layers = []

      if @files && !@files.empty?
        @files.each do |f|
          full = File.expand_path(f, base_dir)
          next unless File.exist?(full)

          data = parse_file_by_extension(full)
          layers << data if data && !data.empty?
        end
      else
        append_if(layers, @defaults)
        append_if(layers, load_yaml_files(base_dir))
        append_if(layers, load_json_files(base_dir))
        append_if(layers, load_dotenv_files(base_dir))
        append_if(layers, load_env_vars)
      end

      merged = {}
      layers.each { |layer| merged = Merger.deep_merge(merged, layer) }
      merged
    end

    private

    def append_if(layers, data)
      layers << data if data && !data.empty?
    end

    def find_base_dir
      dir = File.expand_path(@cwd)
      loop do
        return dir if @root_markers.any? { |m| File.exist?(File.join(dir, m)) }

        parent = File.dirname(dir)
        return @cwd if parent == dir # reached filesystem root

        dir = parent
      end
    end

    def load_source(name, base_dir)
      case name
      when "defaults" then @defaults
      when "yaml" then load_yaml_files(base_dir)
      when "json" then load_json_files(base_dir)
      when "dotenv" then load_dotenv_files(base_dir)
      when "env" then load_env_vars
      else {}
      end
    end

    def load_dotenv_files(base_dir)
      candidates = [".env"]
      candidates << ".env.#{@env}" if @env
      candidates << ".env.local"

      merged = {}
      candidates.each do |filename|
        full = File.join(base_dir, filename)
        next unless File.exist?(full)

        data = parse_dotenv(full)
        merged = Merger.deep_merge(merged, data)
      end
      merged
    end

    def parse_dotenv(filepath)
      result = {}
      content = File.read(filepath)
      lines = content.split("\n")
      i = 0

      while i < lines.length
        line = lines[i].strip
        i += 1

        next if line.empty? || line.start_with?("#")

        line = line.sub(/\Aexport\s+/, "")

        unless line.include?("=")
          raise ParseError.new(
            "Invalid syntax in #{filepath}:#{i}: expected KEY=VALUE, got: #{line.inspect}"
          )
        end

        key, _, value = line.partition("=")
        key = key.strip
        value = value.strip

        # Inline comment removal (only for unquoted values)
        if value.length >= 2 && %w[" ' `].include?(value[0])
          quote = value[0]
          if quote == "'" || quote == "`"
            # Single-quoted or backtick: find closing quote
            end_idx = value.index(quote, 1)
            value = end_idx ? value[1...end_idx] : value[1..]
          else
            # Double-quoted: check for multiline
            stripped = value[1..]
            if stripped.include?('"')
              end_idx = stripped.index('"')
              value = stripped[0...end_idx]
              # Process escape sequences
              value = process_escapes(value)
            else
              # Multiline value
              buf = +stripped
              while i < lines.length
                buf << "\n"
                buf << lines[i]
                i += 1
                if buf.include?('"')
                  end_idx = buf.rindex('"')
                  value = process_escapes(buf[0...end_idx])
                  break
                end
              end
            end
          end
        else
          # Unquoted — strip inline comment
          comment_idx = value.index(" #")
          value = value[0...comment_idx].rstrip if comment_idx
        end

        result[key.downcase] = Coercion.coerce(value)
      end
      result
    end

    def process_escapes(s)
      s.gsub("\\n", "\n")
       .gsub("\\t", "\t")
       .gsub("\\r", "\r")
       .gsub('\\"', '"')
       .gsub("\\\\", "\\")
    end

    def load_yaml_files(base_dir)
      candidates = %w[config.yaml config.yml]
      candidates += ["config.#{@env}.yaml", "config.#{@env}.yml"] if @env

      merged = {}
      candidates.each do |filename|
        full = File.join(base_dir, filename)
        next unless File.exist?(full)

        begin
          require "yaml"
          data = YAML.safe_load(File.read(full), permitted_classes: [Date, Time])
          merged = Merger.deep_merge(merged, data) if data.is_a?(Hash)
        rescue StandardError
          # YAML not available or invalid — skip
        end
      end
      merged
    end

    def load_json_files(base_dir)
      candidates = ["config.json"]
      candidates << "config.#{@env}.json" if @env

      merged = {}
      candidates.each do |filename|
        full = File.join(base_dir, filename)
        next unless File.exist?(full)

        data = JSON.parse(File.read(full))
        merged = Merger.deep_merge(merged, data) if data.is_a?(Hash)
      end
      merged
    end

    def load_env_vars
      result = {}
      pfx = @prefix ? "#{@prefix.upcase}_" : nil

      ENV.each do |key, value|
        if pfx
          next unless key.start_with?(pfx)

          clean_key = key[pfx.length..].downcase
          set_nested(result, clean_key, Coercion.coerce(value))
        elsif @allow_all_env_vars
          result[key.downcase] = Coercion.coerce(value)
        else
          # Filter out system env vars
          next if SYSTEM_ENV_BLOCKLIST.include?(key)
          next if SYSTEM_PREFIXES.any? { |p| key.start_with?(p) }

          result[key.downcase] = Coercion.coerce(value)
        end
      end
      result
    end

    def set_nested(data, key, value)
      parts = key.split("_")
      current = data

      parts[0..-2].each do |part|
        current[part] ||= {}
        current = current[part]
      end

      current[parts.last] = value
    end

    def parse_file_by_extension(full_path)
      ext = File.extname(full_path).downcase
      case ext
      when ".env"
        parse_dotenv(full_path)
      when ".yaml", ".yml"
        require "yaml"
        data = YAML.safe_load(File.read(full_path), permitted_classes: [Date, Time])
        data.is_a?(Hash) ? data : {}
      when ".json"
        data = JSON.parse(File.read(full_path))
        data.is_a?(Hash) ? data : {}
      when ".toml"
        load_toml(full_path)
      else
        # Try dotenv for unknown extensions
        parse_dotenv(full_path)
      end
    end

    def load_toml(full_path)
      begin
        require "toml-rb"
        TomlRB.parse(File.read(full_path))
      rescue LoadError
        # toml-rb not available, skip
        {}
      end
    end

    def decrypt_recursive!(data, key_hex)
      data.each do |k, v|
        if v.is_a?(Hash)
          decrypt_recursive!(v, key_hex)
        elsif Encryption.encrypted?(v)
          data[k] = Coercion.coerce(Encryption.decrypt_value(v, key_hex))
        end
      end
    end

    def collect_watched_files(base_dir)
      files = []
      candidates = %w[.env config.yaml config.yml config.json]
      candidates << ".env.#{@env}" if @env
      candidates << ".env.local"
      candidates += ["config.#{@env}.yaml", "config.#{@env}.yml", "config.#{@env}.json"] if @env

      candidates.each do |f|
        full = File.join(base_dir, f)
        files << full if File.exist?(full)
      end

      if @files
        @files.each do |f|
          full = File.expand_path(f, base_dir)
          files << full if File.exist?(full)
        end
      end

      files.uniq
    end

    def reload_options
      {
        files: @files, prefix: @prefix, defaults: @defaults,
        sources: @sources, env: @env, schema: @schema, strict: @strict,
        interpolate_vars: @interpolate_vars, overrides: @overrides,
        find_up: @find_up, root_markers: @root_markers, cwd: @cwd,
        allow_all_env_vars: @allow_all_env_vars, watch: false
      }
    end
  end
end
