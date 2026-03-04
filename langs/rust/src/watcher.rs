//! Polling-based file watcher for DOTLYTE v2.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime};

use serde_json::Value;

/// A change event emitted when watched files change.
#[derive(Debug, Clone)]
pub struct ChangeEvent {
    /// The file path that changed.
    pub path: PathBuf,
    /// Keys that were added, changed, or removed.
    pub changed_keys: Vec<String>,
}

/// Callback type for config changes.
pub type ChangeCallback = Box<dyn Fn(&ChangeEvent) + Send + Sync>;

/// Callback for specific key changes.
pub type KeyChangeCallback = Box<dyn Fn(&str, &Value, &Value) + Send + Sync>;

/// Callback for errors during watching.
pub type ErrorCallback = Box<dyn Fn(&str) + Send + Sync>;

/// A polling-based file watcher.
pub struct ConfigWatcher {
    files: Vec<PathBuf>,
    interval: Duration,
    running: Arc<Mutex<bool>>,
    on_change: Arc<Mutex<Option<ChangeCallback>>>,
    key_watchers: Arc<Mutex<HashMap<String, KeyChangeCallback>>>,
    on_error: Arc<Mutex<Option<ErrorCallback>>>,
    last_mtimes: Arc<Mutex<HashMap<PathBuf, SystemTime>>>,
}

impl ConfigWatcher {
    /// Create a new watcher for the given files.
    pub fn new(files: Vec<PathBuf>, debounce_ms: u64) -> Self {
        let mut mtimes = HashMap::new();
        for f in &files {
            if let Ok(meta) = fs::metadata(f) {
                if let Ok(mtime) = meta.modified() {
                    mtimes.insert(f.clone(), mtime);
                }
            }
        }

        Self {
            files,
            interval: Duration::from_millis(debounce_ms.max(100)),
            running: Arc::new(Mutex::new(false)),
            on_change: Arc::new(Mutex::new(None)),
            key_watchers: Arc::new(Mutex::new(HashMap::new())),
            on_error: Arc::new(Mutex::new(None)),
            last_mtimes: Arc::new(Mutex::new(mtimes)),
        }
    }

    /// Register the general change callback.
    pub fn set_on_change(&self, cb: ChangeCallback) {
        *self.on_change.lock().unwrap() = Some(cb);
    }

    /// Watch a specific key.
    pub fn watch_key(&self, key: String, cb: KeyChangeCallback) {
        self.key_watchers.lock().unwrap().insert(key, cb);
    }

    /// Register the error callback.
    pub fn set_on_error(&self, cb: ErrorCallback) {
        *self.on_error.lock().unwrap() = Some(cb);
    }

    /// Start the watcher in a background thread.
    ///
    /// `reload_fn` is called when a file change is detected and should return the
    /// new config data.
    pub fn start<F>(&self, reload_fn: F)
    where
        F: Fn() -> Option<serde_json::Map<String, Value>> + Send + Sync + 'static,
    {
        let mut running = self.running.lock().unwrap();
        if *running {
            return;
        }
        *running = true;
        drop(running);

        let files = self.files.clone();
        let interval = self.interval;
        let running = Arc::clone(&self.running);
        let on_change = Arc::clone(&self.on_change);
        let key_watchers = Arc::clone(&self.key_watchers);
        let on_error = Arc::clone(&self.on_error);
        let last_mtimes = Arc::clone(&self.last_mtimes);

        thread::spawn(move || {
            let mut prev_data: Option<serde_json::Map<String, Value>> = None;

            loop {
                thread::sleep(interval);
                if !*running.lock().unwrap() {
                    break;
                }

                // Check for mtime changes
                let mut changed_file = None;
                {
                    let mut mtimes = last_mtimes.lock().unwrap();
                    for f in &files {
                        if let Ok(meta) = fs::metadata(f) {
                            if let Ok(mtime) = meta.modified() {
                                let prev = mtimes.get(f).copied();
                                if prev.is_none() || prev.unwrap() != mtime {
                                    mtimes.insert(f.clone(), mtime);
                                    changed_file = Some(f.clone());
                                    break;
                                }
                            }
                        }
                    }
                }

                if let Some(path) = changed_file {
                    // Reload
                    let new_data = reload_fn();
                    if let Some(ref data) = new_data {
                        let changed_keys = match prev_data {
                            Some(ref old) => diff_maps(old, data),
                            None => flatten_map_keys(data, ""),
                        };

                        // Fire general callback
                        if let Some(ref cb) = *on_change.lock().unwrap() {
                            let event = ChangeEvent {
                                path: path.clone(),
                                changed_keys: changed_keys.clone(),
                            };
                            cb(&event);
                        }

                        // Fire specific key watchers
                        if let Some(ref old) = prev_data {
                            let watchers = key_watchers.lock().unwrap();
                            for key in &changed_keys {
                                if let Some(cb) = watchers.get(key) {
                                    let old_val = get_nested_value(old, key)
                                        .cloned()
                                        .unwrap_or(Value::Null);
                                    let new_val = get_nested_value(data, key)
                                        .cloned()
                                        .unwrap_or(Value::Null);
                                    cb(key, &old_val, &new_val);
                                }
                            }
                        }

                        prev_data = Some(data.clone());
                    } else {
                        // Reload failed
                        if let Some(ref cb) = *on_error.lock().unwrap() {
                            cb(&format!(
                                "failed to reload config after change in {}",
                                path.display()
                            ));
                        }
                    }
                }
            }
        });
    }

    /// Stop the watcher.
    pub fn close(&self) {
        *self.running.lock().unwrap() = false;
    }
}

fn diff_maps(
    old: &serde_json::Map<String, Value>,
    new: &serde_json::Map<String, Value>,
) -> Vec<String> {
    let old_flat = flatten_map(old, "");
    let new_flat = flatten_map(new, "");
    let mut changed = Vec::new();

    for (k, v) in &new_flat {
        match old_flat.get(k) {
            Some(ov) if ov != v => changed.push(k.clone()),
            None => changed.push(k.clone()),
            _ => {}
        }
    }

    for k in old_flat.keys() {
        if !new_flat.contains_key(k) {
            changed.push(k.clone());
        }
    }

    changed
}

fn flatten_map(
    data: &serde_json::Map<String, Value>,
    prefix: &str,
) -> HashMap<String, Value> {
    let mut result = HashMap::new();
    for (k, v) in data {
        let full = if prefix.is_empty() {
            k.clone()
        } else {
            format!("{prefix}.{k}")
        };
        if let Value::Object(ref map) = v {
            result.extend(flatten_map(map, &full));
        } else {
            result.insert(full, v.clone());
        }
    }
    result
}

fn flatten_map_keys(data: &serde_json::Map<String, Value>, prefix: &str) -> Vec<String> {
    let mut keys = Vec::new();
    for (k, v) in data {
        let full = if prefix.is_empty() {
            k.clone()
        } else {
            format!("{prefix}.{k}")
        };
        if let Value::Object(ref map) = v {
            keys.extend(flatten_map_keys(map, &full));
        } else {
            keys.push(full);
        }
    }
    keys
}

fn get_nested_value<'a>(
    data: &'a serde_json::Map<String, Value>,
    key: &str,
) -> Option<&'a Value> {
    let parts: Vec<&str> = key.split('.').collect();
    if parts.is_empty() {
        return None;
    }
    let mut current: &Value = data.get(parts[0])?;
    for part in &parts[1..] {
        match current {
            Value::Object(map) => {
                current = map.get(*part)?;
            }
            _ => return None,
        }
    }
    Some(current)
}
