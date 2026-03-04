# frozen_string_literal: true

Gem::Specification.new do |spec|
  spec.name          = "dotlyte"
  spec.version       = "0.1.1"
  spec.authors       = ["DOTLYTE Contributors"]
  spec.email         = ["hello@dotlyte.dev"]

  spec.summary       = "The universal .env and configuration library with encryption, validation, and more."
  spec.description   = "One API to load .env, YAML, JSON, TOML, environment variables, " \
                        "and defaults with automatic type coercion, layered priority, " \
                        "AES-256-GCM encryption, schema validation, variable interpolation, " \
                        "sensitive value masking, and file watching."
  spec.homepage      = "https://dotlyte.dev"
  spec.license       = "MIT"
  spec.required_ruby_version = ">= 3.0.0"

  spec.metadata["homepage_uri"] = spec.homepage
  spec.metadata["source_code_uri"] = "https://github.com/dotlyte-io/dotlyte/tree/main/langs/ruby"
  spec.metadata["changelog_uri"] = "https://github.com/dotlyte-io/dotlyte/blob/main/langs/ruby/CHANGELOG.md"

  spec.files = Dir["lib/**/*.rb", "README.md", "LICENSE"]
  spec.require_paths = ["lib"]

  spec.add_dependency "base64"
end
