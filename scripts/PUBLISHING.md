# DOTLYTE — Publishing Guide

How to publish all DOTLYTE packages to their respective registries.

## Registry Overview

| Language | Registry | Package Name | Install Command |
|---|---|---|---|
| JavaScript | [npm](https://www.npmjs.com/package/dotlyte) | `dotlyte` | `npm install dotlyte` |
| Python | [PyPI](https://pypi.org/project/dotlyte/) | `dotlyte` | `pip install dotlyte` |
| Ruby | [RubyGems](https://rubygems.org/gems/dotlyte) | `dotlyte` | `gem install dotlyte` |
| Rust | [crates.io](https://crates.io/crates/dotlyte) | `dotlyte` | `cargo add dotlyte` |
| .NET | [NuGet](https://www.nuget.org/packages/Dotlyte) | `Dotlyte` | `dotnet add package Dotlyte` |
| Java | Maven Central | `dev.dotlyte:dotlyte` | Gradle/Maven dependency |
| Go | Go modules | `github.com/dotlyte-io/dotlyte/langs/go` | `go get ...` |
| PHP | [Packagist](https://packagist.org/packages/dotlyte/dotlyte) | `dotlyte/dotlyte` | `composer require dotlyte/dotlyte` |

## Prerequisites

Before publishing, authenticate with each registry:

### 1. npm (JavaScript)

```bash
npm login
```

### 2. PyPI (Python)

Create an API token at https://pypi.org/manage/account/token/ and configure `~/.pypirc`:

```ini
[pypi]
username = __token__
password = pypi-YOUR_TOKEN_HERE
```

Or set environment variables:
```bash
export TWINE_USERNAME=__token__
export TWINE_PASSWORD=pypi-YOUR_TOKEN_HERE
```

### 3. RubyGems (Ruby)

```bash
gem signin
```

Or set credentials at `~/.gem/credentials`.

### 4. crates.io (Rust)

Get a token at https://crates.io/settings/tokens, then:

```bash
cargo login YOUR_TOKEN
```

Or set the environment variable:
```bash
export CARGO_REGISTRY_TOKEN=YOUR_TOKEN
```

> **Note:** Your crates.io email must be verified before publishing.

### 5. NuGet (.NET)

Get an API key at https://www.nuget.org/account/apikeys (scope: Push, glob pattern: `*`), then:

```bash
export NUGET_API_KEY=YOUR_KEY
```

### 6. Maven Central (Java)

Configure Sonatype/Maven Central credentials in `~/.gradle/gradle.properties`:

```properties
mavenCentralUsername=YOUR_USERNAME
mavenCentralPassword=YOUR_PASSWORD
signing.keyId=YOUR_KEY_ID
signing.password=YOUR_PASSWORD
signing.secretKeyRingFile=/path/to/secring.gpg
```

### 7. Go (tag-based)

No registry auth needed — just git push access to the repository.

### 8. PHP (Packagist)

Packagist auto-syncs from GitHub. Set up the webhook:
1. Go to https://packagist.org
2. Submit the repo URL: `https://github.com/manu14357/dotlyte`
3. Add the GitHub webhook (Packagist provides the URL)

## Publishing Individual Packages

### npm

```bash
cd langs/javascript
pnpm install && pnpm build
npm publish --access public
```

### PyPI

```bash
cd langs/python
pip install build twine
python -m build
twine upload dist/*
```

### RubyGems

```bash
cd langs/ruby
gem build dotlyte.gemspec
gem push dotlyte-0.1.1.gem
```

### crates.io

```bash
cd langs/rust
cargo publish
```

### NuGet

```bash
cd langs/dotnet
dotnet pack -c Release
dotnet nuget push src/Dotlyte/bin/Release/Dotlyte.0.1.1.nupkg \
  --source https://api.nuget.org/v3/index.json \
  --api-key "$NUGET_API_KEY"
```

### Maven

```bash
cd langs/java
./gradlew build publish
```

### Go

```bash
git tag langs/go/v0.1.1
git push origin langs/go/v0.1.1
```

## Bumping Versions

When releasing a new version, update the version in each package manifest:

| Language | File | Field |
|---|---|---|
| JavaScript | `langs/javascript/package.json` | `"version"` |
| Python | `langs/python/pyproject.toml` | `version` |
| Ruby | `langs/ruby/dotlyte.gemspec` | `spec.version` |
| Rust | `langs/rust/Cargo.toml` | `version` |
| .NET | `langs/dotnet/src/Dotlyte/Dotlyte.csproj` | `<Version>` |
| Java | `langs/java/build.gradle.kts` | `version` |
| Go | Git tag | `langs/go/vX.Y.Z` |
| PHP | `langs/php/composer.json` | `"version"` |

Then update `scripts/publish-all.sh` → `VERSION="X.Y.Z"` and re-run.

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `cannot publish over previously published versions` | Already published | Bump version or skip |
| `403 Forbidden` / `Invalid authentication` | Bad/expired token | Regenerate token |
| `verified email address is required` (crates.io) | Email not verified | Verify at https://crates.io/settings/profile |
| `Repushing of gem versions is not allowed` | Already published | Bump version or skip |
| `Tag already exists` (Go) | Already tagged | Skip or force-push tag |
