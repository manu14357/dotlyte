# frozen_string_literal: true

require "set"

module Dotlyte
  # Polling-based file watcher for DOTLYTE v2.
  class ConfigWatcher
    # Information about a detected change.
    ChangeEvent = Struct.new(:path, :changed_keys, keyword_init: true)

    # @param files [Array<String>] files to watch
    # @param debounce_ms [Integer] polling interval in milliseconds
    def initialize(files:, debounce_ms: 300)
      @files = files
      @interval = [debounce_ms, 100].max / 1000.0
      @last_modified = {}
      @on_change = nil
      @key_watchers = {}
      @on_error = nil
      @previous_data = nil
      @running = false
      @thread = nil

      @files.each do |f|
        @last_modified[f] = File.mtime(f).to_f if File.exist?(f)
      end
    end

    # Register general change callback.
    def on_change(&block)
      @on_change = block
    end

    # Watch a specific key for changes.
    def watch_key(key, &block)
      @key_watchers[key] = block
    end

    # Register error callback.
    def on_error(&block)
      @on_error = block
    end

    # Start watching with a reload proc.
    #
    # @param reload_fn [Proc] called to reload config, must return Hash
    def start(reload_fn)
      return if @running

      @running = true
      @thread = Thread.new do
        while @running
          poll(reload_fn)
          sleep @interval
        end
      end
      @thread.abort_on_exception = false
    end

    # Stop watching.
    def stop
      @running = false
      @thread&.join(2)
      @thread = nil
    end

    private

    def poll(reload_fn)
      changed_file = nil

      @files.each do |f|
        next unless File.exist?(f)

        mtime = File.mtime(f).to_f
        prev = @last_modified[f]
        if prev.nil? || prev != mtime
          @last_modified[f] = mtime
          changed_file = f
          break
        end
      end

      return unless changed_file

      new_data = reload_fn.call
      return unless new_data

      changed_keys = if @previous_data
                       diff_maps(@previous_data, new_data)
                     else
                       flatten_keys(new_data)
                     end

      @on_change&.call(ChangeEvent.new(path: changed_file, changed_keys: changed_keys))

      if @previous_data
        changed_keys.each do |key|
          watcher = @key_watchers[key]
          next unless watcher

          old_val = Validator.get_nested(@previous_data, key)
          new_val = Validator.get_nested(new_data, key)
          watcher.call(old_val, new_val)
        end
      end

      @previous_data = new_data
    rescue StandardError => e
      @on_error&.call(e)
    end

    def diff_maps(old_map, new_map)
      old_flat = flatten_map(old_map)
      new_flat = flatten_map(new_map)
      changed = Set.new

      new_flat.each do |k, v|
        changed.add(k) if old_flat[k] != v
      end
      old_flat.each_key do |k|
        changed.add(k) unless new_flat.key?(k)
      end

      changed.to_a
    end

    def flatten_map(data, prefix = "", out = {})
      data.each do |key, value|
        full_key = prefix.empty? ? key.to_s : "#{prefix}.#{key}"
        if value.is_a?(Hash)
          flatten_map(value, full_key, out)
        else
          out[full_key] = value
        end
      end
      out
    end

    def flatten_keys(data, prefix = "", out = [])
      data.each do |key, value|
        full_key = prefix.empty? ? key.to_s : "#{prefix}.#{key}"
        if value.is_a?(Hash)
          flatten_keys(value, full_key, out)
        else
          out << full_key
        end
      end
      out
    end
  end
end
