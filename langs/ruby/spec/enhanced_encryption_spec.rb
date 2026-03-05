# frozen_string_literal: true

require "dotlyte"

RSpec.describe Dotlyte::Encryption do
  let(:key) { described_class.generate_key }
  let(:new_key) { described_class.generate_key }

  describe ".rotate_keys" do
    it "re-encrypts all values with the new key" do
      enc_a = described_class.encrypt_value("alpha", key)
      enc_b = described_class.encrypt_value("beta", key)
      data = { "a" => enc_a, "b" => enc_b, "plain" => "hello" }

      rotated = described_class.rotate_keys(data, old_key: key, new_key: new_key)

      # Old key should no longer work
      expect { described_class.decrypt_value(rotated["a"], key) }.to raise_error(Dotlyte::Error)

      # New key should work
      expect(described_class.decrypt_value(rotated["a"], new_key)).to eq("alpha")
      expect(described_class.decrypt_value(rotated["b"], new_key)).to eq("beta")

      # Plain text values are preserved
      expect(rotated["plain"]).to eq("hello")
    end

    it "handles nested hashes" do
      enc = described_class.encrypt_value("secret", key)
      data = { "outer" => { "inner" => enc } }

      rotated = described_class.rotate_keys(data, old_key: key, new_key: new_key)
      expect(described_class.decrypt_value(rotated["outer"]["inner"], new_key)).to eq("secret")
    end

    it "raises on wrong old key" do
      enc = described_class.encrypt_value("value", key)
      wrong_key = described_class.generate_key
      expect {
        described_class.rotate_keys({ "k" => enc }, old_key: wrong_key, new_key: new_key)
      }.to raise_error(Dotlyte::Error)
    end
  end

  describe ".resolve_key_with_fallback" do
    it "returns the first key that successfully decrypts" do
      enc = described_class.encrypt_value("test", key)
      bad_key = described_class.generate_key

      result = described_class.resolve_key_with_fallback([bad_key, key], enc)
      expect(result).to eq(key)
    end

    it "returns nil when no key works" do
      enc = described_class.encrypt_value("test", key)
      bad1 = described_class.generate_key
      bad2 = described_class.generate_key

      result = described_class.resolve_key_with_fallback([bad1, bad2], enc)
      expect(result).to be_nil
    end

    it "returns the first matching key (priority order)" do
      enc = described_class.encrypt_value("test", key)
      result = described_class.resolve_key_with_fallback([key, new_key], enc)
      expect(result).to eq(key)
    end
  end

  describe ".encrypt_vault" do
    it "encrypts all string values when no sensitive_keys given" do
      data = { "a" => "alpha", "b" => "beta", "num" => 42 }
      vault = described_class.encrypt_vault(data, key: key)

      expect(described_class.encrypted?(vault["a"])).to be true
      expect(described_class.encrypted?(vault["b"])).to be true
      expect(vault["num"]).to eq(42) # non-string left alone
    end

    it "encrypts only specified sensitive_keys" do
      data = { "secret" => "hidden", "public" => "visible" }
      vault = described_class.encrypt_vault(data, key: key, sensitive_keys: ["secret"])

      expect(described_class.encrypted?(vault["secret"])).to be true
      expect(vault["public"]).to eq("visible")
    end

    it "skips already-encrypted values" do
      enc = described_class.encrypt_value("test", key)
      data = { "already" => enc }
      vault = described_class.encrypt_vault(data, key: key)

      # Should not double-encrypt
      expect(described_class.decrypt_value(vault["already"], key)).to eq("test")
    end

    it "handles nested hashes" do
      data = { "db" => { "password" => "secret" } }
      vault = described_class.encrypt_vault(data, key: key)

      expect(described_class.encrypted?(vault["db"]["password"])).to be true
      expect(described_class.decrypt_value(vault["db"]["password"], key)).to eq("secret")
    end
  end

  describe ".decrypt_vault" do
    it "decrypts all encrypted values in a hash" do
      enc_a = described_class.encrypt_value("alpha", key)
      enc_b = described_class.encrypt_value("beta", key)
      data = { "a" => enc_a, "b" => enc_b, "plain" => "hello" }

      result = described_class.decrypt_vault(data, key: key)
      expect(result["a"]).to eq("alpha")
      expect(result["b"]).to eq("beta")
      expect(result["plain"]).to eq("hello")
    end

    it "handles nested hashes" do
      enc = described_class.encrypt_value("nested-secret", key)
      data = { "level1" => { "level2" => enc } }

      result = described_class.decrypt_vault(data, key: key)
      expect(result["level1"]["level2"]).to eq("nested-secret")
    end

    it "round-trips with encrypt_vault" do
      original = { "db_pass" => "secret123", "host" => "localhost" }
      vault = described_class.encrypt_vault(original, key: key)
      decrypted = described_class.decrypt_vault(vault, key: key)

      expect(decrypted["db_pass"]).to eq("secret123")
      expect(decrypted["host"]).to eq("localhost")
    end
  end
end
