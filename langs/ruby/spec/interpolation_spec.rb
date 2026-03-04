# frozen_string_literal: true

require "dotlyte"

RSpec.describe Dotlyte::Interpolation do
  describe ".interpolate" do
    it "resolves simple references" do
      data = { "host" => "localhost", "url" => "http://${host}:3000" }
      result = described_class.interpolate(data)
      expect(result["url"]).to eq("http://localhost:3000")
    end

    it "resolves default values with :-" do
      data = { "port" => "${missing:-8080}" }
      result = described_class.interpolate(data)
      expect(result["port"]).to eq("8080")
    end

    it "resolves references with :? error" do
      data = { "key" => "${mandatory:?must be set}" }
      expect { described_class.interpolate(data) }.to raise_error(Dotlyte::Error)
    end

    it "escapes $$ to literal $" do
      data = { "price" => "$$100" }
      result = described_class.interpolate(data)
      expect(result["price"]).to eq("$100")
    end

    it "detects circular references" do
      data = { "a" => "${b}", "b" => "${a}" }
      expect { described_class.interpolate(data) }.to raise_error(Dotlyte::InterpolationError)
    end

    it "chains references" do
      data = { "a" => "hello", "b" => "${a} world", "c" => "${b}!" }
      result = described_class.interpolate(data)
      expect(result["c"]).to eq("hello world!")
    end
  end

  describe ".interpolate_deep" do
    it "resolves nested hashes" do
      data = { "db" => { "host" => "localhost" }, "url" => "${db.host}:5432" }
      result = described_class.interpolate_deep(data)
      expect(result["url"]).to eq("localhost:5432")
    end
  end
end
