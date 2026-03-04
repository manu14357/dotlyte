# frozen_string_literal: true

require "dotlyte"

RSpec.describe Dotlyte::Validator do
  let(:schema) do
    {
      "port" => Dotlyte::SchemaRule.new(type: "number", required: true, min: 1, max: 65_535),
      "host" => Dotlyte::SchemaRule.new(type: "string", required: true),
      "debug" => Dotlyte::SchemaRule.new(type: "boolean", default_value: false),
      "email" => Dotlyte::SchemaRule.new(type: "string", format: "email"),
      "env" => Dotlyte::SchemaRule.new(type: "string", enum_values: %w[dev staging prod]),
      "secret" => Dotlyte::SchemaRule.new(type: "string", sensitive: true)
    }
  end

  describe ".validate" do
    it "returns no violations for valid data" do
      data = { "port" => 8080, "host" => "localhost", "email" => "a@b.com", "env" => "dev" }
      violations = described_class.validate(data, schema)
      expect(violations).to be_empty
    end

    it "detects missing required keys" do
      data = { "debug" => true }
      violations = described_class.validate(data, schema)
      required = violations.select { |v| v.rule == "required" }
      expect(required.length).to be >= 2
    end

    it "detects type mismatches" do
      data = { "port" => "not_a_number", "host" => "ok" }
      violations = described_class.validate(data, schema)
      type_v = violations.find { |v| v.rule == "type" && v.key == "port" }
      expect(type_v).not_to be_nil
    end

    it "validates email format" do
      data = { "port" => 80, "host" => "ok", "email" => "not-an-email" }
      violations = described_class.validate(data, schema)
      fmt = violations.find { |v| v.rule == "format" }
      expect(fmt).not_to be_nil
    end

    it "validates enum values" do
      data = { "port" => 80, "host" => "ok", "env" => "invalid" }
      violations = described_class.validate(data, schema)
      enum_v = violations.find { |v| v.rule == "enum" }
      expect(enum_v).not_to be_nil
    end

    it "validates min/max" do
      data = { "port" => 0, "host" => "ok" }
      violations = described_class.validate(data, schema)
      min_v = violations.find { |v| v.rule == "min" }
      expect(min_v).not_to be_nil
    end

    it "validates max" do
      data = { "port" => 99_999, "host" => "ok" }
      violations = described_class.validate(data, schema)
      max_v = violations.find { |v| v.rule == "max" }
      expect(max_v).not_to be_nil
    end

    it "validates pattern" do
      s = { "code" => Dotlyte::SchemaRule.new(type: "string", pattern: "\\A[A-Z]{3}\\z") }
      violations = described_class.validate({ "code" => "ab" }, s)
      expect(violations.length).to eq(1)
      expect(violations.first.rule).to eq("pattern")
    end

    it "strict mode rejects unknown keys" do
      data = { "port" => 80, "host" => "ok", "unknown" => "foo" }
      violations = described_class.validate(data, schema, strict: true)
      strict_v = violations.find { |v| v.rule == "strict" }
      expect(strict_v).not_to be_nil
    end
  end

  describe ".apply_defaults" do
    it "fills in defaults for missing keys" do
      data = { "port" => 80, "host" => "ok" }
      described_class.apply_defaults(data, schema)
      expect(data["debug"]).to be false
    end

    it "does not override existing values" do
      data = { "debug" => true }
      described_class.apply_defaults(data, schema)
      expect(data["debug"]).to be true
    end
  end

  describe ".sensitive_keys" do
    it "returns keys marked sensitive" do
      keys = described_class.sensitive_keys(schema)
      expect(keys).to include("secret")
      expect(keys).not_to include("port")
    end
  end

  describe ".assert_valid!" do
    it "raises ValidationError on failure" do
      data = {}
      expect { described_class.assert_valid!(data, schema) }.to raise_error(Dotlyte::ValidationError)
    end
  end
end
