# frozen_string_literal: true

require "dotlyte"
require "json"

RSpec.describe "Dotlyte v2 Config" do
  describe Dotlyte::Config do
    let(:data) do
      {
        "port" => 8080,
        "debug" => true,
        "database" => {
          "host" => "localhost",
          "port" => 5432,
          "password" => "secret123"
        },
        "app" => { "name" => "myapp" }
      }
    end
    let(:sensitive) { Set.new(["database.password"]) }
    let(:config) { described_class.new(data, sensitive_keys: sensitive) }

    it "scope returns a sub-config" do
      db = config.scope("database")
      expect(db.get("host")).to eq("localhost")
      expect(db.get("port")).to eq(5432)
    end

    it "keys returns top-level keys" do
      expect(config.keys).to contain_exactly("port", "debug", "database", "app")
    end

    it "to_flat_keys returns all leaf keys" do
      flat = config.to_flat_keys
      expect(flat).to include("port", "database.host", "database.port", "database.password")
    end

    it "to_flat_hash returns flat map" do
      flat = config.to_flat_hash
      expect(flat["database.host"]).to eq("localhost")
      expect(flat["port"]).to eq(8080)
    end

    it "require_keys returns values" do
      port, debug = config.require_keys("port", "debug")
      expect(port).to eq(8080)
      expect(debug).to be true
    end

    it "require_keys raises for missing" do
      expect { config.require_keys("port", "missing") }.to raise_error(Dotlyte::MissingKeyError)
    end

    it "to_h_redacted masks sensitive values" do
      redacted = config.to_h_redacted
      expect(redacted["database"]["password"]).to eq("[REDACTED]")
      expect(redacted["port"]).to eq(8080)
    end

    it "inspect uses redacted output" do
      str = config.inspect
      expect(str).to include("REDACTED")
      expect(str).not_to include("secret123")
    end

    it "to_json outputs valid JSON" do
      parsed = JSON.parse(config.to_json)
      expect(parsed["port"]).to eq(8080)
    end

    it "validate returns violations for invalid schema" do
      schema = { "port" => Dotlyte::SchemaRule.new(type: "string") }
      violations = config.validate(schema)
      expect(violations.length).to eq(1)
    end

    it "write_to creates a JSON file" do
      path = "/tmp/dotlyte_test_#{Process.pid}.json"
      config.write_to(path)
      parsed = JSON.parse(File.read(path))
      expect(parsed["port"]).to eq(8080)
    ensure
      File.delete(path) if File.exist?(path)
    end
  end

  describe "Dotlyte.load with defaults and schema" do
    it "applies schema defaults" do
      schema = {
        "timeout" => Dotlyte::SchemaRule.new(type: "number", default_value: 30)
      }
      config = Dotlyte.load(defaults: { "host" => "localhost" }, schema: schema)
      expect(config.get("timeout")).to eq(30)
      expect(config.get("host")).to eq("localhost")
    end
  end
end
