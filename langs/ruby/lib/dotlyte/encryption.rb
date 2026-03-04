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
  end
end
