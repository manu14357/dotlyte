/**
 * File watcher for DOTLYTE hot-reload support.
 *
 * Watches config files for changes and triggers atomic reload
 * with validation before swap.
 */

import { watch, type FSWatcher } from "node:fs";
import { resolve } from "node:path";

/** Callback fired when config values change. */
export interface ChangeEvent {
  key: string;
  oldValue: unknown;
  newValue: unknown;
}

export type ChangeCallback = (changes: ChangeEvent[]) => void;
export type KeyChangeCallback = (event: ChangeEvent) => void;
export type ErrorCallback = (error: Error) => void;

/**
 * ConfigWatcher manages file system watchers and dispatches change events.
 */
export class ConfigWatcher {
  private watchers: FSWatcher[] = [];
  private onChangeCallbacks: ChangeCallback[] = [];
  private onKeyChangeCallbacks = new Map<string, KeyChangeCallback[]>();
  private onErrorCallbacks: ErrorCallback[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(
    private readonly files: string[],
    private readonly debounceMs: number = 100,
  ) {}

  /**
   * Start watching all files.
   */
  start(reloadFn: () => Record<string, unknown>): void {
    if (this.closed) return;

    let currentData: Record<string, unknown> = {};

    for (const file of this.files) {
      try {
        const fullPath = resolve(file);
        const w = watch(fullPath, () => {
          if (this.closed) return;

          // Debounce rapid changes
          if (this.debounceTimer) clearTimeout(this.debounceTimer);
          this.debounceTimer = setTimeout(() => {
            try {
              const newData = reloadFn();
              const changes = diffObjects(currentData, newData);

              if (changes.length > 0) {
                currentData = newData;

                // Fire global change callbacks
                for (const cb of this.onChangeCallbacks) {
                  try {
                    cb(changes);
                  } catch {
                    /* swallow callback errors */
                  }
                }

                // Fire per-key callbacks
                for (const change of changes) {
                  const keyCbs = this.onKeyChangeCallbacks.get(change.key);
                  if (keyCbs) {
                    for (const cb of keyCbs) {
                      try {
                        cb(change);
                      } catch {
                        /* swallow */
                      }
                    }
                  }
                }
              }
            } catch (err) {
              // Reload or validation failed — keep old config, emit error
              for (const cb of this.onErrorCallbacks) {
                try {
                  cb(err instanceof Error ? err : new Error(String(err)));
                } catch {
                  /* swallow */
                }
              }
            }
          }, this.debounceMs);
        });

        this.watchers.push(w);
      } catch {
        // File doesn't exist or can't be watched — skip silently
      }
    }
  }

  /** Register a callback for any config change. */
  onChange(callback: ChangeCallback): void {
    this.onChangeCallbacks.push(callback);
  }

  /** Register a callback for a specific key change. */
  onKeyChange(key: string, callback: KeyChangeCallback): void {
    const existing = this.onKeyChangeCallbacks.get(key) ?? [];
    existing.push(callback);
    this.onKeyChangeCallbacks.set(key, existing);
  }

  /** Register a callback for reload errors. */
  onError(callback: ErrorCallback): void {
    this.onErrorCallbacks.push(callback);
  }

  /** Stop watching all files and clean up. */
  close(): void {
    this.closed = true;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    for (const w of this.watchers) {
      try {
        w.close();
      } catch {
        /* ignore */
      }
    }
    this.watchers = [];
    this.onChangeCallbacks = [];
    this.onKeyChangeCallbacks.clear();
    this.onErrorCallbacks = [];
  }
}

/**
 * Diff two flat objects and produce change events.
 */
function diffObjects(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  prefix = "",
): ChangeEvent[] {
  const changes: ChangeEvent[] = [];
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const oldVal = oldObj[key];
    const newVal = newObj[key];

    if (
      oldVal !== null &&
      typeof oldVal === "object" &&
      !Array.isArray(oldVal) &&
      newVal !== null &&
      typeof newVal === "object" &&
      !Array.isArray(newVal)
    ) {
      changes.push(
        ...diffObjects(
          oldVal as Record<string, unknown>,
          newVal as Record<string, unknown>,
          fullKey,
        ),
      );
    } else if (!deepEqual(oldVal, newVal)) {
      changes.push({ key: fullKey, oldValue: oldVal, newValue: newVal });
    }
  }

  return changes;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
    return [...keys].every((k) => deepEqual(aObj[k], bObj[k]));
  }
  return false;
}
