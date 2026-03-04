package dev.dotlyte;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

/**
 * Polling-based file watcher for DOTLYTE v2.
 */
public class ConfigWatcher implements AutoCloseable {

    /** Information about a detected change. */
    public static class ChangeEvent {
        private final Path path;
        private final List<String> changedKeys;

        public ChangeEvent(Path path, List<String> changedKeys) {
            this.path = path;
            this.changedKeys = changedKeys;
        }

        public Path getPath() { return path; }
        public List<String> getChangedKeys() { return changedKeys; }
    }

    private final List<Path> files;
    private final long intervalMs;
    private final ScheduledExecutorService executor;
    private final Map<Path, Long> lastModified = new ConcurrentHashMap<>();
    private volatile Map<String, Object> previousData;

    private volatile Consumer<ChangeEvent> onChange;
    private final Map<String, BiConsumer<Object, Object>> keyWatchers = new ConcurrentHashMap<>();
    private volatile Consumer<Exception> onError;

    private Supplier<Map<String, Object>> reloadFn;
    private volatile boolean running;

    @FunctionalInterface
    public interface Supplier<T> {
        T get() throws Exception;
    }

    public ConfigWatcher(List<Path> files, long debounceMs) {
        this.files = new ArrayList<>(files);
        this.intervalMs = Math.max(debounceMs, 100);
        this.executor = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "dotlyte-watcher");
            t.setDaemon(true);
            return t;
        });

        for (Path f : files) {
            try {
                long mtime = Files.getLastModifiedTime(f).toMillis();
                lastModified.put(f, mtime);
            } catch (IOException ignored) {}
        }
    }

    /** Register general change callback. */
    public void setOnChange(Consumer<ChangeEvent> callback) {
        this.onChange = callback;
    }

    /** Watch a specific key for changes. */
    public void watchKey(String key, BiConsumer<Object, Object> callback) {
        keyWatchers.put(key, callback);
    }

    /** Register error callback. */
    public void setOnError(Consumer<Exception> callback) {
        this.onError = callback;
    }

    /** Start watching with a reload function. */
    public void start(Supplier<Map<String, Object>> reloadFn) {
        if (running) return;
        this.reloadFn = reloadFn;
        this.running = true;

        executor.scheduleWithFixedDelay(this::poll, intervalMs, intervalMs, TimeUnit.MILLISECONDS);
    }

    private void poll() {
        if (!running) return;
        try {
            Path changedFile = null;
            for (Path f : files) {
                try {
                    long currentMtime = Files.getLastModifiedTime(f).toMillis();
                    Long prev = lastModified.get(f);
                    if (prev == null || prev != currentMtime) {
                        lastModified.put(f, currentMtime);
                        changedFile = f;
                        break;
                    }
                } catch (IOException ignored) {}
            }

            if (changedFile == null) return;

            Map<String, Object> newData = reloadFn.get();
            if (newData == null) return;

            List<String> changedKeys = previousData != null
                    ? diffMaps(previousData, newData) : flattenKeys(newData, "");

            // Fire general callback
            Consumer<ChangeEvent> cb = onChange;
            if (cb != null) {
                cb.accept(new ChangeEvent(changedFile, changedKeys));
            }

            // Fire key watchers
            if (previousData != null) {
                for (String key : changedKeys) {
                    BiConsumer<Object, Object> kw = keyWatchers.get(key);
                    if (kw != null) {
                        Object oldVal = Validator.getNestedValue(previousData, key);
                        Object newVal = Validator.getNestedValue(newData, key);
                        kw.accept(oldVal, newVal);
                    }
                }
            }

            previousData = newData;
        } catch (Exception e) {
            Consumer<Exception> errorCb = onError;
            if (errorCb != null) {
                errorCb.accept(e);
            }
        }
    }

    @Override
    public void close() {
        running = false;
        executor.shutdownNow();
    }

    // ── Helpers ────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private static List<String> diffMaps(Map<String, Object> oldMap, Map<String, Object> newMap) {
        Map<String, Object> oldFlat = flattenMap(oldMap, "");
        Map<String, Object> newFlat = flattenMap(newMap, "");
        Set<String> changed = new LinkedHashSet<>();

        for (Map.Entry<String, Object> e : newFlat.entrySet()) {
            Object ov = oldFlat.get(e.getKey());
            if (ov == null || !Objects.equals(ov, e.getValue())) {
                changed.add(e.getKey());
            }
        }
        for (String k : oldFlat.keySet()) {
            if (!newFlat.containsKey(k)) changed.add(k);
        }

        return new ArrayList<>(changed);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> flattenMap(Map<String, Object> data, String prefix) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : data.entrySet()) {
            String fullKey = prefix.isEmpty() ? e.getKey() : prefix + "." + e.getKey();
            if (e.getValue() instanceof Map) {
                result.putAll(flattenMap((Map<String, Object>) e.getValue(), fullKey));
            } else {
                result.put(fullKey, e.getValue());
            }
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private static List<String> flattenKeys(Map<String, Object> data, String prefix) {
        List<String> keys = new ArrayList<>();
        for (Map.Entry<String, Object> e : data.entrySet()) {
            String fullKey = prefix.isEmpty() ? e.getKey() : prefix + "." + e.getKey();
            if (e.getValue() instanceof Map) {
                keys.addAll(flattenKeys((Map<String, Object>) e.getValue(), fullKey));
            } else {
                keys.add(fullKey);
            }
        }
        return keys;
    }
}
