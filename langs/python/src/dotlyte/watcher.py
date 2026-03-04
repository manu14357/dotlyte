"""File watcher for hot-reload support in DOTLYTE.

Watches configuration files for changes and triggers atomic reloads
with change diff events.
"""

from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Any, Callable

ChangeEvent = dict[str, Any]  # {"key": str, "old_value": Any, "new_value": Any}
ChangeCallback = Callable[[list[ChangeEvent]], None]
KeyChangeCallback = Callable[[ChangeEvent], None]
ErrorCallback = Callable[[Exception], None]


class ConfigWatcher:
    """Watch config files for changes, reload atomically, emit diffs.

    Args:
        files: List of file paths to watch.
        debounce_ms: Debounce time in milliseconds.

    """

    def __init__(self, files: list[str], debounce_ms: int = 100) -> None:
        self._files = [Path(f) for f in files]
        self._debounce_s = debounce_ms / 1000.0
        self._on_change: list[ChangeCallback] = []
        self._on_key_change: dict[str, list[KeyChangeCallback]] = {}
        self._on_error: list[ErrorCallback] = []
        self._running = False
        self._thread: threading.Thread | None = None
        self._reload_fn: Callable[[], dict[str, Any]] | None = None
        self._last_data: dict[str, Any] = {}
        self._last_mtimes: dict[str, float] = {}

    def start(
        self,
        reload_fn: Callable[[], dict[str, Any]],
        initial_data: dict[str, Any] | None = None,
    ) -> None:
        """Start watching files.

        Args:
            reload_fn: Function that reloads config and returns new data dict.
            initial_data: Current config data for diffing.

        """
        self._reload_fn = reload_fn
        self._last_data = initial_data or {}
        self._last_mtimes = self._get_mtimes()
        self._running = True
        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()

    def on_change(self, callback: ChangeCallback) -> None:
        """Register a callback for any config change."""
        self._on_change.append(callback)

    def on_key_change(self, key: str, callback: KeyChangeCallback) -> None:
        """Register a callback for when a specific key changes."""
        if key not in self._on_key_change:
            self._on_key_change[key] = []
        self._on_key_change[key].append(callback)

    def on_error(self, callback: ErrorCallback) -> None:
        """Register a callback for reload errors."""
        self._on_error.append(callback)

    def close(self) -> None:
        """Stop watching."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=2.0)
            self._thread = None

    def _poll_loop(self) -> None:
        """Poll files for mtime changes with debounce."""
        while self._running:
            time.sleep(self._debounce_s or 0.1)
            try:
                current_mtimes = self._get_mtimes()
                if current_mtimes != self._last_mtimes:
                    self._last_mtimes = current_mtimes
                    # Debounce: wait a bit more for batch writes
                    time.sleep(self._debounce_s)
                    self._handle_change()
            except Exception as e:
                for cb in self._on_error:
                    try:
                        cb(e)
                    except Exception:
                        pass

    def _handle_change(self) -> None:
        """Reload config and emit change events."""
        if not self._reload_fn:
            return

        try:
            new_data = self._reload_fn()
        except Exception as e:
            for cb in self._on_error:
                try:
                    cb(e)
                except Exception:
                    pass
            return  # Keep old config on error (atomic reload)

        events = diff_objects(self._last_data, new_data)
        self._last_data = new_data

        if events:
            for cb in self._on_change:
                try:
                    cb(events)
                except Exception:
                    pass

            for event in events:
                key = event["key"]
                if key in self._on_key_change:
                    for cb in self._on_key_change[key]:
                        try:
                            cb(event)
                        except Exception:
                            pass

    def _get_mtimes(self) -> dict[str, float]:
        """Get modification times for all watched files."""
        result: dict[str, float] = {}
        for f in self._files:
            try:
                result[str(f)] = f.stat().st_mtime
            except OSError:
                result[str(f)] = 0.0
        return result


def diff_objects(
    old: dict[str, Any],
    new: dict[str, Any],
    prefix: str = "",
) -> list[ChangeEvent]:
    """Compute the diff between two config data dicts.

    Args:
        old: Previous config data.
        new: New config data.
        prefix: Key prefix for nested diffs.

    Returns:
        List of change events.

    """
    events: list[ChangeEvent] = []
    all_keys = set(old.keys()) | set(new.keys())

    for key in all_keys:
        full_key = f"{prefix}.{key}" if prefix else key
        old_val = old.get(key)
        new_val = new.get(key)

        if isinstance(old_val, dict) and isinstance(new_val, dict):
            events.extend(diff_objects(old_val, new_val, full_key))
        elif old_val != new_val:
            events.append({
                "key": full_key,
                "old_value": old_val,
                "new_value": new_val,
            })

    return events
