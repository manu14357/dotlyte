# frozen_string_literal: true

require "dotlyte"

RSpec.describe Dotlyte do
  describe ".load" do
    it "returns a Config" do
      config = described_class.load(defaults: { "port" => 3000 })
      expect(config).to be_a(Dotlyte::Config)
    end

    it "uses defaults" do
      config = described_class.load(defaults: { "port" => 3000, "debug" => false })
      expect(config.get("port")).to eq(3000)
      expect(config.get("debug")).to be false
    end
  end

  describe Dotlyte::Config do
    let(:config) do
      described_class.new({
        "port" => 8080,
        "database" => { "host" => "localhost", "port" => 5432 }
      })
    end

    it "supports dot-notation" do
      expect(config.port).to eq(8080)
      expect(config.database.host).to eq("localhost")
    end

    it "supports get with default" do
      expect(config.get("missing", "fallback")).to eq("fallback")
    end

    it "supports nested get" do
      expect(config.get("database.host")).to eq("localhost")
    end

    it "supports require" do
      expect(config.require("port")).to eq(8080)
    end

    it "raises on require missing" do
      empty = described_class.new({})
      expect { empty.require("MISSING") }.to raise_error(Dotlyte::MissingKeyError)
    end

    it "supports has?" do
      expect(config.has?("port")).to be true
      expect(config.has?("missing")).to be false
    end

    it "supports to_h" do
      expect(config.to_h).to be_a(Hash)
    end
  end
end
