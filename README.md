<p align="center">
  <!-- Replace with actual logo when available -->
  <img src="docs/logo-placeholder.svg" alt="DOTLYTE" width="200">
</p>

<h1 align="center">DOTLYTE</h1>
<p align="center"><em>Your config. Conducted.</em></p>
<p align="center">
  Like electrolytes conduct electricity through a solution,<br>
  DOTLYTE conducts your environment config seamlessly through every project, every language, every stack.
</p>

<p align="center">
  <a href="https://github.com/dotlyte-io/dotlyte/actions/workflows/ci-python.yml"><img src="https://img.shields.io/github/actions/workflow/status/dotlyte-io/dotlyte/ci-python.yml?label=Python&logo=python&logoColor=white" alt="Python CI"></a>
  <a href="https://github.com/dotlyte-io/dotlyte/actions/workflows/ci-javascript.yml"><img src="https://img.shields.io/github/actions/workflow/status/dotlyte-io/dotlyte/ci-javascript.yml?label=JavaScript&logo=javascript&logoColor=white" alt="JS CI"></a>
  <a href="https://github.com/dotlyte-io/dotlyte/actions/workflows/ci-go.yml"><img src="https://img.shields.io/github/actions/workflow/status/dotlyte-io/dotlyte/ci-go.yml?label=Go&logo=go&logoColor=white" alt="Go CI"></a>
  <a href="https://github.com/dotlyte-io/dotlyte/actions/workflows/ci-rust.yml"><img src="https://img.shields.io/github/actions/workflow/status/dotlyte-io/dotlyte/ci-rust.yml?label=Rust&logo=rust&logoColor=white" alt="Rust CI"></a>
  <a href="https://github.com/dotlyte-io/dotlyte/actions/workflows/ci-java.yml"><img src="https://img.shields.io/github/actions/workflow/status/dotlyte-io/dotlyte/ci-java.yml?label=Java&logo=openjdk&logoColor=white" alt="Java CI"></a>
  <a href="https://github.com/dotlyte-io/dotlyte/actions/workflows/ci-ruby.yml"><img src="https://img.shields.io/github/actions/workflow/status/dotlyte-io/dotlyte/ci-ruby.yml?label=Ruby&logo=ruby&logoColor=white" alt="Ruby CI"></a>
  <a href="https://github.com/dotlyte-io/dotlyte/actions/workflows/ci-php.yml"><img src="https://img.shields.io/github/actions/workflow/status/dotlyte-io/dotlyte/ci-php.yml?label=PHP&logo=php&logoColor=white" alt="PHP CI"></a>
  <a href="https://github.com/dotlyte-io/dotlyte/actions/workflows/ci-dotnet.yml"><img src="https://img.shields.io/github/actions/workflow/status/dotlyte-io/dotlyte/ci-dotnet.yml?label=.NET&logo=dotnet&logoColor=white" alt=".NET CI"></a>
  <br>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT"></a>
  <a href="https://github.com/dotlyte-io/dotlyte/stargazers"><img src="https://img.shields.io/github/stars/dotlyte-io/dotlyte?style=social" alt="GitHub Stars"></a>
</p>

---

## What is DOTLYTE?

**DOTLYTE** is a cross-language, open-source configuration loading library with one mission:

> **Any project. Any language. Any source. One consistent API.**

One import. One function call. Everything loaded, merged, typed, and accessible with dot-notation. The same experience whether you're writing Python, JavaScript, Go, Rust, Java, Ruby, PHP, or C#.

```
dotlyte.load()
```

That's it. Your entire config — loaded, layered, typed, ready.

---

## The Problem

Every developer writes the same boilerplate in every project:

```python
# Before — 20+ lines of boilerplate
import os
from dotenv import load_dotenv
import yaml

load_dotenv()
with open('config.yaml') as f:
    yaml_config = yaml.safe_load(f)
PORT = int(os.getenv('PORT', yaml_config.get('port', 3000)))
DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'
```

```python
# After — 2 lines with DOTLYTE
from dotlyte import load
config = load()

config.port    # automatically int
config.debug   # automatically bool
```

---

## Quick Start

| Language | Install | Usage |
|---|---|---|
| **Python** | `pip install dotlyte` | `from dotlyte import load; config = load()` |
| **JavaScript** | `npm install dotlyte` | `import { load } from 'dotlyte'; const config = await load()` |
| **Go** | `go get github.com/dotlyte-io/dotlyte/langs/go` | `cfg, _ := dotlyte.Load()` |
| **Rust** | `cargo add dotlyte` | `let cfg = dotlyte::load()?;` |
| **Java** | `io.dotlyte:dotlyte` (Maven/Gradle) | `var config = Dotlyte.load();` |
| **Ruby** | `gem install dotlyte` | `config = Dotlyte.load` |
| **PHP** | `composer require dotlyte/dotlyte` | `$config = Dotlyte::load();` |
| **.NET** | `dotnet add package Dotlyte` | `var config = Config.Load();` |

---

## How It Works

DOTLYTE uses **layered priority** — higher layers always win:

```
┌─────────────────┬───────────────────────┐
│  LAYER 1 (HIGH) │  Environment Vars     │  PORT=8080
├─────────────────┼───────────────────────┤
│  LAYER 2        │  .env file            │  PORT=3000
├─────────────────┼───────────────────────┤
│  LAYER 3        │  config.yaml / .json  │  port: 3000
├─────────────────┼───────────────────────┤
│  LAYER 4        │  config.toml / .ini   │  port = 3000
├─────────────────┼───────────────────────┤
│  LAYER 5 (LOW)  │  Hardcoded Defaults   │  port = 3000
└─────────────────┴───────────────────────┘
```

### Type Coercion — The Hidden Superpower

| Raw Value | DOTLYTE Output | Type |
|---|---|---|
| `"true"` | `True` / `true` | bool |
| `"8080"` | `8080` | int |
| `"3.14"` | `3.14` | float |
| `"a,b,c"` | `["a", "b", "c"]` | list / array |
| `"null"` / `""` | `None` / `null` | null |

No more `int(os.getenv('PORT'))`. Never again.

---

## Packages

| Language | Package | Version | Docs |
|---|---|---|---|
| Python | [`dotlyte`](https://pypi.org/project/dotlyte/) | ![PyPI](https://img.shields.io/pypi/v/dotlyte) | [Python Docs](langs/python/README.md) |
| JavaScript/TS | [`dotlyte`](https://www.npmjs.com/package/dotlyte) | ![npm](https://img.shields.io/npm/v/dotlyte) | [JS/TS Docs](langs/javascript/README.md) |
| Go | [`dotlyte`](https://pkg.go.dev/github.com/dotlyte-io/dotlyte/langs/go) | ![Go Reference](https://img.shields.io/badge/go-reference-blue) | [Go Docs](langs/go/README.md) |
| Rust | [`dotlyte`](https://crates.io/crates/dotlyte) | ![Crates.io](https://img.shields.io/crates/v/dotlyte) | [Rust Docs](langs/rust/README.md) |
| Java | `io.dotlyte:dotlyte` | ![Maven](https://img.shields.io/maven-central/v/io.dotlyte/dotlyte) | [Java Docs](langs/java/README.md) |
| Ruby | [`dotlyte`](https://rubygems.org/gems/dotlyte) | ![Gem](https://img.shields.io/gem/v/dotlyte) | [Ruby Docs](langs/ruby/README.md) |
| PHP | [`dotlyte/dotlyte`](https://packagist.org/packages/dotlyte/dotlyte) | ![Packagist](https://img.shields.io/packagist/v/dotlyte/dotlyte) | [PHP Docs](langs/php/README.md) |
| .NET | [`Dotlyte`](https://www.nuget.org/packages/Dotlyte) | ![NuGet](https://img.shields.io/nuget/v/Dotlyte) | [.NET Docs](langs/dotnet/README.md) |

---

## Repository Structure

```
dotlyte/
├── spec/              ← THE SOURCE OF TRUTH — all implementations follow this
│   ├── api.md         ← Universal API specification
│   ├── type-coercion.md
│   ├── priority.md
│   └── fixtures/      ← Shared test cases all languages must pass
├── langs/
│   ├── python/        ← pip install dotlyte
│   ├── javascript/    ← npm install dotlyte
│   ├── go/            ← go get ...
│   ├── rust/          ← cargo add dotlyte
│   ├── java/          ← Maven / Gradle
│   ├── ruby/          ← gem install dotlyte
│   ├── php/           ← composer require dotlyte/dotlyte
│   └── dotnet/        ← dotnet add package Dotlyte
└── .github/           ← CI/CD, templates, Copilot instructions
```

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

**Want to add a new language?** Read the [spec](spec/README.md), implement the API, pass the shared test fixtures, and submit a PR.

---

## License

[MIT](LICENSE) — DOTLYTE is free and open source.

---

<p align="center"><em>DOTLYTE — Your config. Conducted.</em></p>
