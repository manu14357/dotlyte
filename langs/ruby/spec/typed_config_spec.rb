# frozen_string_literal: true

require "dotlyte"

RSpec.describe Dotlyte::TypedConfig do
  around do |example|
    # Save and restore ENV
    saved = ENV.to_h
    example.run
  ensure
    ENV.replace(saved)
  end

  describe ".create" do
    it "reads and coerces integer from ENV" do
      ENV["PORT"] = "8080"
      config = described_class.create(
        { "PORT" => { type: "integer", required: true } }
      )
      expect(config["PORT"]).to eq(8080)
    end

    it "reads and coerces boolean from ENV" do
      ENV["DEBUG"] = "true"
      config = described_class.create(
        { "DEBUG" => { type: "boolean", default: false } }
      )
      expect(config["DEBUG"]).to be true
    end

    it "coerces boolean yes/on/1 variants" do
      %w[yes on 1 YES ON].each do |val|
        ENV["FLAG"] = val
        config = described_class.create({ "FLAG" => { type: "boolean" } })
        expect(config["FLAG"]).to be(true), "Expected '#{val}' to be true"
      end
    end

    it "coerces boolean false variants" do
      %w[false no 0 off NO OFF].each do |val|
        ENV["FLAG"] = val
        config = described_class.create({ "FLAG" => { type: "boolean" } })
        expect(config["FLAG"]).to be(false), "Expected '#{val}' to be false"
      end
    end

    it "reads float from ENV" do
      ENV["RATE"] = "3.14"
      config = described_class.create({ "RATE" => { type: "float" } })
      expect(config["RATE"]).to eq(3.14)
    end

    it "reads array from ENV" do
      ENV["TAGS"] = "a,b,c"
      config = described_class.create({ "TAGS" => { type: "array" } })
      expect(config["TAGS"]).to eq(%w[a b c])
    end

    it "uses default when ENV is not set" do
      ENV.delete("MISSING_KEY")
      config = described_class.create(
        { "MISSING_KEY" => { type: "string", default: "fallback" } }
      )
      expect(config["MISSING_KEY"]).to eq("fallback")
    end

    it "raises on missing required key" do
      ENV.delete("REQUIRED_KEY")
      expect {
        described_class.create({ "REQUIRED_KEY" => { type: "string", required: true } })
      }.to raise_error(Dotlyte::Error, /Required config key 'REQUIRED_KEY'/)
    end

    it "validates enum values" do
      ENV["LOG_LEVEL"] = "verbose"
      expect {
        described_class.create(
          { "LOG_LEVEL" => { type: "string", enum: %w[debug info warn error] } }
        )
      }.to raise_error(Dotlyte::Error, /not in allowed values/)
    end

    it "accepts valid enum value" do
      ENV["LOG_LEVEL"] = "info"
      config = described_class.create(
        { "LOG_LEVEL" => { type: "string", enum: %w[debug info warn error] } }
      )
      expect(config["LOG_LEVEL"]).to eq("info")
    end

    it "validates min constraint" do
      ENV["PORT"] = "0"
      expect {
        described_class.create({ "PORT" => { type: "integer", min: 1 } })
      }.to raise_error(Dotlyte::Error, /less than minimum/)
    end

    it "validates max constraint" do
      ENV["PORT"] = "99999"
      expect {
        described_class.create({ "PORT" => { type: "integer", max: 65535 } })
      }.to raise_error(Dotlyte::Error, /greater than maximum/)
    end

    it "raises on invalid integer" do
      ENV["PORT"] = "not_a_number"
      expect {
        described_class.create({ "PORT" => { type: "integer" } })
      }.to raise_error(Dotlyte::Error, /cannot convert/)
    end

    it "raises on invalid boolean" do
      ENV["FLAG"] = "maybe"
      expect {
        described_class.create({ "FLAG" => { type: "boolean" } })
      }.to raise_error(Dotlyte::Error, /cannot convert/)
    end

    it "skips validation when skip_validation is true" do
      ENV.delete("REQUIRED_KEY")
      config = described_class.create(
        { "REQUIRED_KEY" => { type: "string", required: true } },
        skip_validation: true
      )
      expect(config).not_to have_key("REQUIRED_KEY")
    end

    it "returns a frozen result" do
      ENV["PORT"] = "8080"
      config = described_class.create({ "PORT" => { type: "integer" } })
      expect(config).to be_frozen
    end

    context "with on_secret_access callback" do
      it "calls the callback when accessing a sensitive key" do
        ENV["API_KEY"] = "secret-123"
        accessed = []
        config = described_class.create(
          { "API_KEY" => { type: "string", sensitive: true } },
          on_secret_access: ->(key) { accessed << key }
        )
        config["API_KEY"]
        expect(accessed).to eq(["API_KEY"])
      end

      it "does not call the callback for non-sensitive keys" do
        ENV["PORT"] = "8080"
        accessed = []
        config = described_class.create(
          { "PORT" => { type: "integer", sensitive: false } },
          on_secret_access: ->(key) { accessed << key }
        )
        config["PORT"]
        expect(accessed).to be_empty
      end
    end
  end
end
