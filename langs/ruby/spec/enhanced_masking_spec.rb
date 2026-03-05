# frozen_string_literal: true

require "dotlyte"

RSpec.describe Dotlyte::Masking do
  describe ".compile_patterns" do
    it "compiles glob patterns to Regexp array" do
      patterns = described_class.compile_patterns(["db.*", "**secret**"])
      expect(patterns).to all(be_a(Regexp))
      expect(patterns.size).to eq(2)
    end

    it "matches single-level wildcard" do
      patterns = described_class.compile_patterns(["db.*"])
      re = patterns.first
      expect(re).to match("db.password")
      expect(re).to match("db.host")
      expect(re).not_to match("db.nested.deep")
      expect(re).not_to match("cache.host")
    end

    it "matches double-star wildcard across levels" do
      patterns = described_class.compile_patterns(["**secret**"])
      re = patterns.first
      expect(re).to match("secret")
      expect(re).to match("my_secret_key")
      expect(re).to match("db.secret.value")
    end

    it "is case-insensitive" do
      patterns = described_class.compile_patterns(["db.*"])
      re = patterns.first
      expect(re).to match("DB.PASSWORD")
      expect(re).to match("db.Host")
    end

    it "returns empty array for empty input" do
      expect(described_class.compile_patterns([])).to eq([])
    end
  end

  describe ".build_sensitive_set_with_patterns" do
    it "detects keys matching glob patterns" do
      keys = %w[db.password db.host cache.key api.token]
      result = described_class.build_sensitive_set_with_patterns(
        keys,
        patterns: ["db.*", "**token**"]
      )
      expect(result).to include("db.password")
      expect(result).to include("db.host")
      expect(result).to include("api.token")
      expect(result).not_to include("cache.key")
    end

    it "includes schema-declared sensitive keys" do
      keys = %w[port host secret]
      result = described_class.build_sensitive_set_with_patterns(
        keys,
        patterns: [],
        schema_sensitive: Set.new(["secret"])
      )
      expect(result).to include("secret")
      expect(result).not_to include("port")
    end

    it "merges pattern matches with schema sensitive keys" do
      keys = %w[db.password api.key host]
      result = described_class.build_sensitive_set_with_patterns(
        keys,
        patterns: ["db.*"],
        schema_sensitive: Set.new(["api.key"])
      )
      expect(result).to include("db.password")
      expect(result).to include("api.key")
      expect(result).not_to include("host")
    end

    it "handles empty keys list" do
      result = described_class.build_sensitive_set_with_patterns(
        [],
        patterns: ["db.*"]
      )
      expect(result).to be_empty
    end
  end

  describe ".create_audit_proxy" do
    let(:data) { { "password" => "secret", "host" => "localhost" } }
    let(:sensitive) { Set.new(["password"]) }

    it "returns values via [] accessor" do
      accessed = []
      proxy = described_class.create_audit_proxy(
        data,
        sensitive_keys: sensitive,
        on_access: ->(key) { accessed << key }
      )
      expect(proxy["host"]).to eq("localhost")
      expect(proxy["password"]).to eq("secret")
    end

    it "calls on_access for sensitive keys" do
      accessed = []
      proxy = described_class.create_audit_proxy(
        data,
        sensitive_keys: sensitive,
        on_access: ->(key) { accessed << key }
      )
      proxy["password"]
      proxy["host"]
      expect(accessed).to eq(["password"])
    end

    it "supports get with default" do
      accessed = []
      proxy = described_class.create_audit_proxy(
        data,
        sensitive_keys: sensitive,
        on_access: ->(key) { accessed << key }
      )
      expect(proxy.get("missing", "default")).to eq("default")
      expect(proxy.get("host")).to eq("localhost")
    end

    it "supports keys method" do
      proxy = described_class.create_audit_proxy(
        data,
        sensitive_keys: sensitive,
        on_access: ->(_) {}
      )
      expect(proxy.keys).to contain_exactly("password", "host")
    end

    it "supports to_h method" do
      proxy = described_class.create_audit_proxy(
        data,
        sensitive_keys: sensitive,
        on_access: ->(_) {}
      )
      expect(proxy.to_h).to eq(data)
    end

    it "is frozen" do
      proxy = described_class.create_audit_proxy(
        data,
        sensitive_keys: sensitive,
        on_access: ->(_) {}
      )
      expect(proxy).to be_frozen
    end

    it "tracks multiple accesses" do
      accessed = []
      proxy = described_class.create_audit_proxy(
        data,
        sensitive_keys: sensitive,
        on_access: ->(key) { accessed << key }
      )
      3.times { proxy["password"] }
      expect(accessed).to eq(%w[password password password])
    end
  end
end
