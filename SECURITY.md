# Security Policy

## Supported Versions

| Language | Package | Version | Supported |
|---|---|---|---|
| Python | `dotlyte` | 0.x | :white_check_mark: |
| JavaScript/TS | `dotlyte` | 0.x | :white_check_mark: |
| Go | `dotlyte` | 0.x | :white_check_mark: |
| Rust | `dotlyte` | 0.x | :white_check_mark: |
| Java | `io.dotlyte:dotlyte` | 0.x | :white_check_mark: |
| Ruby | `dotlyte` | 0.x | :white_check_mark: |
| PHP | `dotlyte/dotlyte` | 0.x | :white_check_mark: |
| .NET | `Dotlyte` | 0.x | :white_check_mark: |

## Reporting a Vulnerability

**Do NOT open a public issue for security vulnerabilities.**

Please report security vulnerabilities by emailing:

**security@dotlyte.dev**

### What to include

- Description of the vulnerability
- Steps to reproduce
- Which language implementation(s) are affected
- Potential impact
- Suggested fix (if any)

### Response Timeline

| Action | Timeline |
|---|---|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix & disclosure | Within 30 days (or sooner) |

### Process

1. You report the vulnerability privately via email
2. We acknowledge receipt within 48 hours
3. We investigate and determine the impact
4. We develop and test a fix
5. We release the fix and publish a security advisory
6. We credit you in the advisory (unless you prefer anonymity)

### Scope

This security policy covers:

- All language implementations in `langs/`
- The spec and shared test fixtures in `spec/`
- CI/CD workflows in `.github/workflows/`
- Any published packages on registries (PyPI, npm, crates.io, etc.)

### Out of Scope

- Third-party dependencies (report those to the respective maintainers)
- The documentation website
- Social engineering attacks

## Security Best Practices for Users

- **Never commit `.env` files** containing real secrets to version control
- Use DOTLYTE's future **secrets masking** feature (v2.0) to prevent accidental logging
- Rotate secrets regularly
- Use environment-specific config files (`.env.production`, `.env.staging`)
