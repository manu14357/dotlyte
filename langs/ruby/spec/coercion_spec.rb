# frozen_string_literal: true

require "dotlyte/coercion"

RSpec.describe Dotlyte::Coercion do
  describe ".coerce" do
    it "coerces null values" do
      expect(described_class.coerce("null")).to be_nil
      expect(described_class.coerce("none")).to be_nil
      expect(described_class.coerce("nil")).to be_nil
      expect(described_class.coerce("")).to be_nil
    end

    it "coerces boolean true" do
      %w[true TRUE yes 1 on].each do |val|
        expect(described_class.coerce(val)).to be true
      end
    end

    it "coerces boolean false" do
      %w[false no 0 off].each do |val|
        expect(described_class.coerce(val)).to be false
      end
    end

    it "coerces integers" do
      expect(described_class.coerce("8080")).to eq(8080)
      expect(described_class.coerce("-42")).to eq(-42)
    end

    it "coerces floats" do
      expect(described_class.coerce("3.14")).to eq(3.14)
    end

    it "coerces lists" do
      expect(described_class.coerce("a,b,c")).to eq(%w[a b c])
    end

    it "passes through non-strings" do
      expect(described_class.coerce(42)).to eq(42)
      expect(described_class.coerce(true)).to be true
    end

    it "keeps plain strings" do
      expect(described_class.coerce("hello")).to eq("hello")
    end
  end
end
