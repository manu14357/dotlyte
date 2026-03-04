package dotlyte

import (
	"os"
	"sync"
	"time"
)

// ChangeEvent describes a change in a single config key.
type ChangeEvent struct {
	Key      string
	OldValue any
	NewValue any
}

// ChangeCallback is called when config files change on disk.
type ChangeCallback func(events []ChangeEvent)

// KeyChangeCallback is called when a specific key changes.
type KeyChangeCallback func(key string, oldVal, newVal any)

// ErrorCallback is called when a watch/reload error occurs.
type ErrorCallback func(err error)

// ConfigWatcher polls config files for changes and triggers reload.
type ConfigWatcher struct {
	files        []string
	debounceMs   int
	reloadFn     func() (map[string]any, error)
	onChange     []ChangeCallback
	onKeyChange  map[string][]KeyChangeCallback
	onError      []ErrorCallback

	lastModTimes map[string]time.Time
	lastData     map[string]any
	mu           sync.Mutex
	stopCh       chan struct{}
	running      bool
}

// NewConfigWatcher creates a watcher for the given files.
func NewConfigWatcher(files []string, debounceMs int) *ConfigWatcher {
	if debounceMs <= 0 {
		debounceMs = 100
	}
	return &ConfigWatcher{
		files:        files,
		debounceMs:   debounceMs,
		onKeyChange:  make(map[string][]KeyChangeCallback),
		lastModTimes: make(map[string]time.Time),
		stopCh:       make(chan struct{}),
	}
}

// Start begins polling for file changes, calling reloadFn to get new data.
func (w *ConfigWatcher) Start(reloadFn func() (map[string]any, error)) {
	w.mu.Lock()
	if w.running {
		w.mu.Unlock()
		return
	}
	w.running = true
	w.reloadFn = reloadFn

	// Snapshot initial mod times
	for _, f := range w.files {
		if info, err := os.Stat(f); err == nil {
			w.lastModTimes[f] = info.ModTime()
		}
	}
	w.mu.Unlock()

	go w.pollLoop()
}

// OnChange registers a callback for any config change.
func (w *ConfigWatcher) OnChange(cb ChangeCallback) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.onChange = append(w.onChange, cb)
}

// OnKeyChange registers a callback for changes to a specific key.
func (w *ConfigWatcher) OnKeyChange(key string, cb KeyChangeCallback) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.onKeyChange[key] = append(w.onKeyChange[key], cb)
}

// OnError registers a callback for reload errors.
func (w *ConfigWatcher) OnError(cb ErrorCallback) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.onError = append(w.onError, cb)
}

// Close stops the watcher.
func (w *ConfigWatcher) Close() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.running {
		close(w.stopCh)
		w.running = false
	}
}

func (w *ConfigWatcher) pollLoop() {
	ticker := time.NewTicker(time.Duration(w.debounceMs) * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-w.stopCh:
			return
		case <-ticker.C:
			if w.hasChanges() {
				w.reload()
			}
		}
	}
}

func (w *ConfigWatcher) hasChanges() bool {
	w.mu.Lock()
	defer w.mu.Unlock()

	for _, f := range w.files {
		info, err := os.Stat(f)
		if err != nil {
			continue
		}
		if last, ok := w.lastModTimes[f]; !ok || !info.ModTime().Equal(last) {
			return true
		}
	}
	return false
}

func (w *ConfigWatcher) reload() {
	w.mu.Lock()
	reloadFn := w.reloadFn
	w.mu.Unlock()

	if reloadFn == nil {
		return
	}

	newData, err := reloadFn()
	if err != nil {
		w.mu.Lock()
		for _, cb := range w.onError {
			cb(err)
		}
		w.mu.Unlock()
		return
	}

	w.mu.Lock()
	// Update mod times
	for _, f := range w.files {
		if info, err := os.Stat(f); err == nil {
			w.lastModTimes[f] = info.ModTime()
		}
	}

	oldData := w.lastData
	w.lastData = newData

	// Compute diff
	events := diffMaps(oldData, newData, "")

	if len(events) > 0 {
		for _, cb := range w.onChange {
			cb(events)
		}
		for _, evt := range events {
			if cbs, ok := w.onKeyChange[evt.Key]; ok {
				for _, cb := range cbs {
					cb(evt.Key, evt.OldValue, evt.NewValue)
				}
			}
		}
	}
	w.mu.Unlock()
}

func diffMaps(oldData, newData map[string]any, prefix string) []ChangeEvent {
	var events []ChangeEvent

	if oldData == nil {
		oldData = make(map[string]any)
	}

	// Check new/changed keys
	for k, newVal := range newData {
		fullKey := k
		if prefix != "" {
			fullKey = prefix + "." + k
		}

		oldVal, existed := oldData[k]
		if !existed {
			events = append(events, ChangeEvent{Key: fullKey, OldValue: nil, NewValue: newVal})
			continue
		}

		oldMap, oldIsMap := oldVal.(map[string]any)
		newMap, newIsMap := newVal.(map[string]any)
		if oldIsMap && newIsMap {
			events = append(events, diffMaps(oldMap, newMap, fullKey)...)
		} else if oldVal != newVal {
			events = append(events, ChangeEvent{Key: fullKey, OldValue: oldVal, NewValue: newVal})
		}
	}

	// Check removed keys
	for k, oldVal := range oldData {
		fullKey := k
		if prefix != "" {
			fullKey = prefix + "." + k
		}
		if _, exists := newData[fullKey]; !exists {
			events = append(events, ChangeEvent{Key: fullKey, OldValue: oldVal, NewValue: nil})
		}
	}

	return events
}
