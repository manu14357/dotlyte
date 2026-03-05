# frozen_string_literal: true

require "openssl"
require "base64"
require "securerandom"

module Dotlyte
  # AES-256-GCM encryption/decryption for DOTLYTE v2 (SOPS-style).
  #
  # Format: ENC[aes-256-gcm,iv:<base64>,data:<base64>,tag:<base64>]
  module Encryption
    PREFIX = "ENC["
    GCM_TAG_BYTES = 16
    IV_BYTES = 12
    KEY_BYTES = 32

    # Check whether a string is an encrypted SOPS-style value.
    def self.encrypted?(value)
      value.is_a?(String) && value.start_with?(PREFIX) && value.end_with?("]")
    end

    # Generate a random 32-byte key as hex.
    def self.generate_key
      SecureRandom.hex(KEY_BYTES)
    end

    # Encrypt a plaintext string with a hex-encoded 256-bit key.
    #
    # @param plaintext [String]
    # @param key_hex [String] 64-char hex string
    # @return [String] SOPS-style encrypted value
    def self.encrypt_value(plaintext, key_hex)
      key_bytes = [key_hex].pack("H*")
      raise Error, "Key must be 32 bytes, got #{key_bytes.bytesize}" unless key_bytes.bytesize == KEY_BYTES

      cipher = OpenSSL::Cipher.new("aes-256-gcm")
      cipher.encrypt
      cipher.key = key_bytes
      iv = cipher.random_iv
      cipher.auth_data = ""

      ciphertext = cipher.update(plaintext) + cipher.final
      tag = cipher.auth_tag(GCM_TAG_BYTES)

      iv_b64 = Base64.strict_encode64(iv)
      data_b64 = Base64.strict_encode64(ciphertext)
      tag_b64 = Base64.strict_encode64(tag)

      "ENC[aes-256-gcm,iv:#{iv_b64},data:#{data_b64},tag:#{tag_b64}]"
    rescue OpenSSL::Cipher::CipherError => e
      raise Error, "Encryption failed: #{e.message}"
    end

    # Decrypt a SOPS-style encrypted value.
    #
    # @param encrypted [String]
    # @param key_hex [String] 64-char hex string
    # @return [String] plaintext
    def self.decrypt_value(encrypted, key_hex)
      key_bytes = [key_hex].pack("H*")
      raise Error, "Key must be 32 bytes, got #{key_bytes.bytesize}" unless key_bytes.bytesize == KEY_BYTES

      inner = encrypted
      inner = inner[4..-2] if inner.start_with?("ENC[") && inner.end_with?("]")

      parts = {}
      inner.split(",").each do |part|
        part = part.strip
        if part.start_with?("iv:")
          parts[:iv] = part[3..]
        elsif part.start_with?("data:")
          parts[:data] = part[5..]
        elsif part.start_with?("tag:")
          parts[:tag] = part[4..]
        end
      end

      iv = Base64.strict_decode64(parts[:iv])
      data = Base64.strict_decode64(parts[:data])
      tag = Base64.strict_decode64(parts[:tag])

      cipher = OpenSSL::Cipher.new("aes-256-gcm")
      cipher.decrypt
      cipher.key = key_bytes
      cipher.iv = iv
      cipher.auth_tag = tag
      cipher.auth_data = ""

      cipher.update(data) + cipher.final
    rescue OpenSSL::Cipher::CipherError => e
      raise DecryptionError, "Decryption failed: #{e.message}"
    end

    # Decrypt all ENC[...] values in a hash.
    def self.decrypt_hash(data, key_hex)
      data.each do |k, v|
        data[k] = decrypt_value(v, key_hex) if encrypted?(v)
      end
    end

    # Resolve encryption key from environment / key file.
    def self.resolve_encryption_key(env_name = nil)
      if env_name && !env_name.empty?
        val = ENV["DOTLYTE_KEY_#{env_name.upcase}"]
        return val if val && !val.empty?
      end

      val = ENV["DOTLYTE_KEY"]
      return val if val && !val.empty?

      key_file = ".dotlyte-keys"
      if File.exist?(key_file)
        line = File.readlines(key_file, chomp: true).first&.strip
        return line if line && !line.empty?
      end

      nil
    end

    # Re-encrypt all encrypted values in a hash with a new key.
    #
    # @param data [Hash] hash potentially containing ENC[...] values
    # @param old_key [String] current encryption key (hex)
    # @param new_key [String] new encryption key (hex)
    # @return [Hash] hash with values re-encrypted under new_key
    # @raise [Dotlyte::Error] if decryption with old_key fails
    def self.rotate_keys(data, old_key:, new_key:)
      data.each_with_object({}) do |(k, v), result|
        result[k] = if v.is_a?(Hash)
                      rotate_keys(v, old_key: old_key, new_key: new_key)
                    elsif encrypted?(v)
                      plaintext = decrypt_value(v, old_key)
                      encrypt_value(plaintext, new_key)
                    else
                      v
                    end
      end
    end

    # Try each key in order to decrypt a value. Returns the first working key or nil.
    #
    # @param keys [Array<String>] candidate encryption keys (hex)
    # @param encrypted_value [String] the encrypted value to test
    # @return [String, nil] the working key, or nil if none decrypt successfully
    def self.resolve_key_with_fallback(keys, encrypted_value)
      keys.each do |candidate|
        begin
          decrypt_value(encrypted_value, candidate)
          return candidate
        rescue DecryptionError, Error
          next
        end
      end
      nil
    end

    # Encrypt selected values in a hash (vault-style).
    #
    # @param data [Hash] plaintext hash
    # @param key [String] encryption key (hex)
    # @param sensitive_keys [Array<String>, Set<String>, nil] keys to encrypt (nil = all)
    # @return [Hash] hash with encrypted values
    def self.encrypt_vault(data, key:, sensitive_keys: nil)
      targets = sensitive_keys ? Set.new(sensitive_keys) : nil

      data.each_with_object({}) do |(k, v), result|
        result[k] = if v.is_a?(Hash)
                      encrypt_vault(v, key: key, sensitive_keys: sensitive_keys)
                    elsif v.is_a?(String) && !encrypted?(v) && (targets.nil? || targets.include?(k))
                      encrypt_value(v, key)
                    else
                      v
                    end
      end
    end

    # Decrypt all encrypted values in a hash (vault-style).
    #
    # @param data [Hash] hash with ENC[...] values
    # @param key [String] encryption key (hex)
    # @return [Hash] hash with all values decrypted
    def self.decrypt_vault(data, key:)
      data.each_with_object({}) do |(k, v), result|
        result[k] = if v.is_a?(Hash)
                      decrypt_vault(v, key: key)
                    elsif encrypted?(v)
                      decrypt_value(v, key)
                    else
                      v
                    end
      end
    end
  end
end
