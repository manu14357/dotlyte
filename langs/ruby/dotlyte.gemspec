# frozen_string_literal: true

Gem::Specification.new do |spec|
  spec.name          = "dotlyte"
  spec.version       = "0.1.0"
  spec.authors       = ["DOTLYTE Contributors"]
  spec.email         = ["hello@dotlyte.dev"]

  spec.summary       = "The universal .env and configuration library."
  spec.description   = "One API to load .env, YAML, JSON, TOML, environment variables, " \
                        "and defaults with automatic type coercion and layered priority."
  spec.homepage      = "https://dotlyte.dev"
  spec.license       = "MIT"
  spec.required_ruby_version = ">= 3.0.0"

  spec.metadata["homepage_uri"] = spec.homepage
  spec.metadata["source_code_uri"] = "https://github.com/dotlyte-io/dotlyte/tree/main/langs/ruby"
  spec.metadata["changelog_uri"] = "https://github.com/dotlyte-io/dotlyte/blob/main/langs/ruby/CHANGELOG.md"

  spec.files = Dir["lib/**/*.rb", "README.md", "LICENSE"]
  spec.require_paths = ["lib"]
end
