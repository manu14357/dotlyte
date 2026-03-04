# frozen_string_literal: true

module Dotlyte
  # Variable interpolation engine for DOTLYTE v2.
  #
  # Supports ${VAR}, ${VAR:-default}, ${VAR:?error}, and $$ escape.
  module Interpolation
    # Interpolate ${VAR} references in a flat string hash.
    #
    # @param data [Hash<String, String>] key-value pairs
    # @param context [Hash<String, String>] additional context
    # @return [Hash<String, String>] resolved values
    def self.interpolate(data, context = {})
      resolved = {}
      resolving = Set.new

      data.each_key { |key| resolve(key, data, context, resolved, resolving) }
      resolved
    end

    # Interpolate a deep hash (nested values).
    #
    # @param data [Hash] deep hash
    # @param context [Hash] additional context
    # @return [Hash] resolved deep hash
    def self.interpolate_deep(data, context = {})
      flat = flatten_to_strings(data)
      ctx_flat = flatten_to_strings(context)
      resolved = interpolate(flat, ctx_flat)

      result = deep_copy(data)
      resolved.each do |key, value|
        set_nested(result, key, Coercion.coerce(value))
      end
      result
    end

    class << self
      private

      def resolve(key, data, context, resolved, resolving)
        return resolved[key] if resolved.key?(key)

        if resolving.include?(key)
          raise InterpolationError.new(
            "Circular reference detected for variable: #{key}", key: key
          )
        end

        raw = data[key]
        if raw.nil?
          return context[key] if context.key?(key)

          env = ENV[key.upcase]
          return env || ""
        end

        resolving.add(key)
        val = resolve_string(raw.to_s, data, context, resolved, resolving)
        resolving.delete(key)
        resolved[key] = val
        val
      end

      def resolve_string(s, data, context, resolved, resolving)
        s = s.gsub("$$", "\x00DOLLAR\x00")
        result = +""
        i = 0

        while i < s.length
          if i + 1 < s.length && s[i] == "$" && s[i + 1] == "{"
            i += 2
            depth = 1
            inner = +""
            while i < s.length && depth.positive?
              ch = s[i]
              if ch == "{"
                depth += 1
              elsif ch == "}"
                depth -= 1
                if depth.zero?
                  i += 1
                  break
                end
              end
              inner << ch
              i += 1
            end
            result << resolve_reference(inner, data, context, resolved, resolving)
          else
            result << s[i]
            i += 1
          end
        end

        result.gsub("\x00DOLLAR\x00", "$")
      end

      def resolve_reference(inner, data, context, resolved, resolving)
        err_idx = inner.index(":?")
        def_idx = inner.index(":-")

        if err_idx
          var_name = inner[0...err_idx].strip
          error_msg = inner[(err_idx + 2)..]
        elsif def_idx
          var_name = inner[0...def_idx].strip
          fallback = inner[(def_idx + 2)..]
        else
          var_name = inner.strip
        end

        lower = var_name.downcase

        # Same-file
        if data.key?(lower)
          val = resolve(lower, data, context, resolved, resolving)
          return val unless val.empty?
        end

        # Context
        if context.key?(lower)
          val = context[lower]
          return val if val && !val.empty?
        end

        # Env
        env = ENV[var_name] || ENV[var_name.upcase]
        return env if env && !env.empty?

        # Not found
        if error_msg
          raise Error.new("Required variable '#{var_name}': #{error_msg}", key: var_name)
        end

        fallback || ""
      end

      def flatten_to_strings(hash, prefix = "", out = {})
        hash.each do |key, value|
          full_key = prefix.empty? ? key.to_s : "#{prefix}.#{key}"
          if value.is_a?(Hash)
            flatten_to_strings(value, full_key, out)
          elsif !value.nil?
            out[full_key] = value.to_s
          end
        end
        out
      end

      def deep_copy(hash)
        hash.each_with_object({}) do |(k, v), result|
          result[k] = v.is_a?(Hash) ? deep_copy(v) : v
        end
      end

      def set_nested(hash, key, value)
        parts = key.split(".")
        current = hash
        parts[0..-2].each do |part|
          current[part] ||= {}
          current[part] = {} unless current[part].is_a?(Hash)
          current = current[part]
        end
        current[parts.last] = value
      end
    end
  end
end
