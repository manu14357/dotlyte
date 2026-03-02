# frozen_string_literal: true

require "json"

module Dotlyte
  # Main loader orchestrator.
  class Loader
    def initialize(files: nil, prefix: nil, defaults: {}, sources: nil, env: nil)
      @files = files
      @prefix = prefix
      @defaults = defaults
      @sources = sources
      @env = env
    end

    def load
      layers = []

      if @sources
        @sources.each do |source|
          data = load_source(source)
          layers << data if data && !data.empty?
        end
      else
        append_if(layers, @defaults)
        append_if(layers, load_yaml_files)
        append_if(layers, load_json_files)
        append_if(layers, load_dotenv_files)
        append_if(layers, load_env_vars)
      end

      merged = {}
      layers.each { |layer| merged = Merger.deep_merge(merged, layer) }

      Config.new(merged)
    end

    private

    def append_if(layers, data)
      layers << data if data && !data.empty?
    end

    def load_source(name)
      case name
      when "defaults" then @defaults
      when "yaml" then load_yaml_files
      when "json" then load_json_files
      when "dotenv" then load_dotenv_files
      when "env" then load_env_vars
      else {}
      end
    end

    def load_dotenv_files
      candidates = [".env"]
      candidates << ".env.#{@env}" if @env
      candidates << ".env.local"

      merged = {}
      candidates.each do |filename|
        next unless File.exist?(filename)

        data = parse_dotenv(filename)
        merged = Merger.deep_merge(merged, data)
      end
      merged
    end

    def parse_dotenv(filepath)
      result = {}
      File.readlines(filepath, chomp: true).each_with_index do |line, idx|
        line = line.strip
        next if line.empty? || line.start_with?("#")

        line = line.sub(/\Aexport\s+/, "")

        unless line.include?("=")
          raise ParseError.new(
            "Invalid syntax in #{filepath}:#{idx + 1}: expected KEY=VALUE, got: #{line.inspect}"
          )
        end

        key, _, value = line.partition("=")
        key = key.strip
        value = value.strip

        # Remove surrounding quotes
        if value.length >= 2 && value[0] == value[-1] && %w[" '].include?(value[0])
          value = value[1..-2]
        end

        result[key.downcase] = Coercion.coerce(value)
      end
      result
    end

    def load_yaml_files
      candidates = %w[config.yaml config.yml]
      candidates += ["config.#{@env}.yaml", "config.#{@env}.yml"] if @env

      merged = {}
      candidates.each do |filename|
        next unless File.exist?(filename)

        begin
          require "yaml"
          data = YAML.safe_load(File.read(filename), permitted_classes: [Date, Time])
          merged = Merger.deep_merge(merged, data) if data.is_a?(Hash)
        rescue StandardError
          # YAML not available or invalid — skip
        end
      end
      merged
    end

    def load_json_files
      candidates = ["config.json"]
      candidates << "config.#{@env}.json" if @env

      merged = {}
      candidates.each do |filename|
        next unless File.exist?(filename)

        data = JSON.parse(File.read(filename))
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
        else
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
  end
end
