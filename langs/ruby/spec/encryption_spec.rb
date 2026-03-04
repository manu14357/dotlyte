# frozen_string_literal: true

require "dotlyte"

RSpec.describe Dotlyte::Encryption do
  let(:key) { described_class.generate_key }

  describe ".generate_key" do
    it "generates a 64-char hex key" do
      expect(key.length).to eq(64)
      expect(key).to match(/\A[0-9a-f]{64}\z/)
    end
  end

  describe ".encrypt_value / .decrypt_value" do
    it "round-trips a value" do
      enc = described_class.encrypt_value("my-secret", key)
      expect(enc).to start_with("ENC[")
      expect(enc).to end_with("]")
      dec = described_class.decrypt_value(enc, key)
      expect(dec).to eq("my-secret")
    end

    it "produces different ciphertext each time" do
      a = described_class.encrypt_value("same", key)
      b = described_class.encrypt_value("same", key)
      expect(a).not_to eq(b)
    end

    it "fails with wrong key" do
      enc = described_class.encrypt_value("secret", key)
      other_key = described_class.generate_key
      expect { described_class.decrypt_value(enc, other_key) }.to raise_error(Dotlyte::Error)
    end
  end

  describe ".encrypted?" do
    it "detects SOPS format" do
      enc = described_class.encrypt_value("test", key)
      expect(described_class.encrypted?(enc)).to be true
      expect(described_class.encrypted?("plain")).to be false
    end
  end

  describe ".decrypt_hash" do
    it "decrypts all encrypted values in a hash" do
      enc = described_class.encrypt_value("value", key)
      data = { "key" => enc, "plain" => "hello" }
      described_class.decrypt_hash(data, key)
      expect(data["key"]).to eq("value")
      expect(data["plain"]).to eq("hello")
    end
  end
end
