"""DOTLYTE — The universal configuration library.

One import. One function call. Everything loaded, merged, typed, and accessible
with dot-notation.

Usage:
    from dotlyte import load

    config = load()
    config.port           # automatically int
    config.debug          # automatically bool
    config.database.host  # dot-notation access
"""

from dotlyte.config import Config
from dotlyte.errors import DotlyteError
from dotlyte.loader import load

__all__ = ["Config", "DotlyteError", "load"]
__version__ = "0.1.0"
