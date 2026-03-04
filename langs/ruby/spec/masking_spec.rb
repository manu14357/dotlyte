# frozen_string_literal: true

require "dotlyte"

RSpec.describe Dotlyte::Masking do
  describe ".build_sensitive_set" do
    it "auto-detects sensitive keys" do
      data = { "db_password" => "secret", "host" => "localhost", "api_key" => "abc" }
      set = described_class.build_sensitive_set(data)
      expect(set).to include("db_password")
      expect(set).to include("api_key")
      expect(set).not_to include("host")
    end

    it "includes schema-provided keys" do
      data = { "custom" => "val" }
      set = described_class.build_sensitive_set(data, ["custom"])
      expect(set).to include("custom")
    end
  end

  describe ".redact" do
    it "redacts sensitive values" do
      data = { "password" => "secret123", "host" => "localhost" }
      result = described_class.redact(data, Set.new(["password"]))
      expect(result["password"]).to eq("[REDACTED]")
      expect(result["host"]).to eq("localhost")
    end

    it "redacts nested values" do
      data = { "db" => { "password" => "secret" } }
      result = described_class.redact(data, Set.new(["db.password"]))
      expect(result["db"]["password"]).to eq("[REDACTED]")
    end
  end

  describe ".format_redacted" do
    it "partially masks long values" do
      expect(described_class.format_redacted("mysecretvalue")).to start_with("my")
      expect(described_class.format_redacted("mysecretvalue")).to include("*")
    end

    it "fully masks short values" do
      expect(described_class.format_redacted("ab")).to eq("**")
    end

    it "handles nil" do
      expect(described_class.format_redacted(nil)).to eq("[REDACTED]")
    end
  end
end
