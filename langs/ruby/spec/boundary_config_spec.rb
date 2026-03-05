# frozen_string_literal: true

require "dotlyte"

RSpec.describe Dotlyte::BoundaryConfig do
  let(:data) do
    {
      "DB_PASSWORD" => "secret",
      "API_SECRET"  => "key-123",
      "APP_NAME"    => "my-app",
      "THEME"       => "dark",
      "LOG_LEVEL"   => "info"
    }
  end

  let(:boundary) do
    described_class.new(
      data,
      server_keys: %w[DB_PASSWORD API_SECRET],
      client_keys: %w[APP_NAME THEME],
      shared_keys: %w[LOG_LEVEL]
    )
  end

  describe "#[]" do
    it "accesses any key from the data" do
      expect(boundary["DB_PASSWORD"]).to eq("secret")
      expect(boundary["APP_NAME"]).to eq("my-app")
      expect(boundary["LOG_LEVEL"]).to eq("info")
    end

    it "returns nil for unknown keys" do
      expect(boundary["UNKNOWN"]).to be_nil
    end
  end

  describe "#get" do
    it "returns value for existing key" do
      expect(boundary.get("DB_PASSWORD")).to eq("secret")
    end

    it "returns default for missing key" do
      expect(boundary.get("UNKNOWN", "fallback")).to eq("fallback")
    end
  end

  describe "#[]=" do
    it "raises FrozenError" do
      expect { boundary["DB_PASSWORD"] = "new" }.to raise_error(FrozenError)
    end
  end

  describe "#server_only" do
    it "returns only server + shared keys" do
      result = boundary.server_only
      expect(result.keys).to contain_exactly("DB_PASSWORD", "API_SECRET", "LOG_LEVEL")
      expect(result["DB_PASSWORD"]).to eq("secret")
      expect(result["LOG_LEVEL"]).to eq("info")
    end

    it "excludes client-only keys" do
      result = boundary.server_only
      expect(result).not_to have_key("APP_NAME")
      expect(result).not_to have_key("THEME")
    end
  end

  describe "#client_only" do
    it "returns only client + shared keys" do
      result = boundary.client_only
      expect(result.keys).to contain_exactly("APP_NAME", "THEME", "LOG_LEVEL")
      expect(result["APP_NAME"]).to eq("my-app")
    end

    it "excludes server-only keys" do
      result = boundary.client_only
      expect(result).not_to have_key("DB_PASSWORD")
      expect(result).not_to have_key("API_SECRET")
    end
  end

  describe ".server_context?" do
    it "returns true in Ruby" do
      expect(described_class.server_context?).to be true
    end
  end

  describe ".client_context?" do
    it "returns false in Ruby" do
      expect(described_class.client_context?).to be false
    end
  end

  describe "#keys" do
    it "returns all boundary-defined keys" do
      expect(boundary.keys).to contain_exactly(
        "DB_PASSWORD", "API_SECRET", "APP_NAME", "THEME", "LOG_LEVEL"
      )
    end
  end

  describe "#to_h" do
    it "returns the full data hash" do
      expect(boundary.to_h).to eq(data)
    end
  end

  describe "immutability" do
    it "is frozen" do
      expect(boundary).to be_frozen
    end
  end

  context "with on_secret_access callback" do
    it "calls the callback when accessing server keys" do
      accessed = []
      b = described_class.new(
        data,
        server_keys: %w[DB_PASSWORD],
        client_keys: %w[APP_NAME],
        on_secret_access: ->(key) { accessed << key }
      )
      b["DB_PASSWORD"]
      b["APP_NAME"]
      expect(accessed).to eq(["DB_PASSWORD"])
    end
  end
end
