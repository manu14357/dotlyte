# Changelog

All notable changes to the DOTLYTE project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

See per-language changelogs for detailed changes:

- [Python](langs/python/CHANGELOG.md)
- [JavaScript/TypeScript](langs/javascript/CHANGELOG.md)
- [Go](langs/go/CHANGELOG.md)
- [Rust](langs/rust/CHANGELOG.md)
- [Java](langs/java/CHANGELOG.md)
- [Ruby](langs/ruby/CHANGELOG.md)
- [PHP](langs/php/CHANGELOG.md)
- [.NET/C#](langs/dotnet/CHANGELOG.md)

---

## [0.1.1] — 2025-07-13

### All Languages

- Version bump to `0.1.1` across all 8 implementations
- Bug fixes: Ruby encryption/interpolation error types, PHP autoloading, Java exception types
- Integration tests added for all 8 languages (489 total consumer tests passing)

### python
- v0.1.1 release

### javascript
- v0.1.1 release

### go
- v0.1.1 release

### rust
- Re-exported `coerce_str` from public API
- v0.1.1 release

### java
- Fixed `Validator.assertValid()` to throw `ValidationException` instead of base `DotlyteException`
- Fixed `Encryption.decryptValue()` to throw `DecryptionException` instead of base `DotlyteException`
- v0.1.1 release

### ruby
- Fixed encryption to use proper OpenSSL::Cipher for AES-256-GCM
- Fixed interpolation to raise `InterpolationError` for `${VAR:?msg}` syntax
- Fixed decryption to raise `DecryptionError` on failure
- v0.1.1 release

### php
- Fixed PSR-4 autoloading for exception subclasses via `files` autoload directive
- v0.1.1 release

### dotnet
- v0.1.1 release

---

## [Unreleased]

### spec

- Initial specification: API, type coercion rules, priority layering

### python

- Initial project scaffold

### javascript

- Initial project scaffold

### go

- Initial project scaffold

### rust

- Initial project scaffold

### java

- Initial project scaffold

### ruby

- Initial project scaffold

### php

- Initial project scaffold

### dotnet

- Initial project scaffold
