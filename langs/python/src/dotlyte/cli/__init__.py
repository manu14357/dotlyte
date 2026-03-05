"""DOTLYTE CLI — ``python -m dotlyte`` / ``dotlyte``.

Commands::

    dotlyte check           Validate .env files against schema
    dotlyte diff <f1> <f2>  Compare two env files
    dotlyte generate-types  Generate Python TypedDict from .env
    dotlyte encrypt <file>  Encrypt sensitive values in .env
    dotlyte doctor          Check for common env issues
    dotlyte init            Create starter .env and config files
"""

from __future__ import annotations

import argparse
import sys
from typing import Sequence

_VERSION = "0.1.2"


def main(argv: Sequence[str] | None = None) -> None:
    """CLI entry point for DOTLYTE.

    Args:
        argv: Command-line arguments. Defaults to ``sys.argv[1:]``.

    """
    parser = argparse.ArgumentParser(
        prog="dotlyte",
        description="DOTLYTE — The universal configuration CLI",
    )
    parser.add_argument(
        "--version",
        "-v",
        action="version",
        version=f"dotlyte {_VERSION}",
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # ── check ──
    check_parser = subparsers.add_parser(
        "check",
        help="Validate .env files against schema",
    )
    check_parser.add_argument("--schema", help="Path to JSON schema file")
    check_parser.add_argument("--env", help="Path to .env file to validate")
    check_parser.add_argument(
        "--strict",
        action="store_true",
        help="Reject unknown keys not in schema",
    )

    # ── diff ──
    diff_parser = subparsers.add_parser("diff", help="Compare two env files")
    diff_parser.add_argument("file1", help="First .env file")
    diff_parser.add_argument("file2", help="Second .env file")

    # ── generate-types ──
    gen_parser = subparsers.add_parser(
        "generate-types",
        help="Generate Python TypedDict from .env",
    )
    gen_parser.add_argument(
        "--input",
        "-i",
        help="Input .env file (default: .env.example)",
    )
    gen_parser.add_argument(
        "--output",
        "-o",
        help="Output .py file (default: src/env_types.py)",
    )

    # ── encrypt ──
    enc_parser = subparsers.add_parser(
        "encrypt",
        help="Encrypt sensitive values in .env",
    )
    enc_parser.add_argument("file", help=".env file to encrypt")
    enc_parser.add_argument(
        "--keys",
        help="Comma-separated list of keys to encrypt (default: auto-detect sensitive)",
    )
    enc_parser.add_argument(
        "--output",
        help="Output file path (default: <file>.encrypted)",
    )

    # ── doctor ──
    subparsers.add_parser("doctor", help="Check for common env issues")

    # ── init ──
    init_parser = subparsers.add_parser(
        "init",
        help="Create starter .env and config files",
    )
    init_parser.add_argument(
        "--framework",
        choices=["django", "flask", "fastapi", "generic"],
        help="Framework preset",
    )

    args = parser.parse_args(argv)

    if args.command is None:
        parser.print_help()
        sys.exit(0)

    # Lazy-import commands to keep startup fast
    if args.command == "check":
        from dotlyte.cli.check import run_check

        run_check(
            schema_path=args.schema,
            env_file=args.env,
            strict=args.strict,
        )
    elif args.command == "diff":
        from dotlyte.cli.diff import run_diff

        run_diff(args.file1, args.file2)
    elif args.command == "generate-types":
        from dotlyte.cli.generate_types import run_generate_types

        run_generate_types(input_file=args.input, output_file=args.output)
    elif args.command == "encrypt":
        from dotlyte.cli.encrypt import run_encrypt

        run_encrypt(
            file=args.file,
            keys=args.keys,
            output=args.output,
        )
    elif args.command == "doctor":
        from dotlyte.cli.doctor import run_doctor

        run_doctor()
    elif args.command == "init":
        from dotlyte.cli.init import run_init

        run_init(framework=args.framework)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
