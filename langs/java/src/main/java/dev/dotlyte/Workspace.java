package dev.dotlyte;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/**
 * Monorepo / multi-package workspace support for DOTLYTE.
 *
 * <p>Detects monorepo tooling (pnpm, Turborepo, Nx, Lerna, npm/yarn
 * workspaces) and loads per-package configuration with optional shared
 * environment files.
 *
 * <pre>{@code
 * Workspace.WorkspaceOptions opts = new Workspace.WorkspaceOptions()
 *         .root(".")
 *         .packages(List.of("packages/api", "packages/web"));
 *
 * Map<String, Map<String, Object>> configs = Workspace.loadWorkspace(opts);
 * }</pre>
 */
public final class Workspace {

    private Workspace() {}

    // ── WorkspaceOptions ───────────────────────────────────────

    /**
     * Options for {@link #loadWorkspace}.
     */
    public static class WorkspaceOptions {

        private String root;
        private List<String> packages;
        private String sharedEnvFile;
        private String prefix;
        private String env;

        /** Create default options. */
        public WorkspaceOptions() {}

        /** Set the monorepo root directory. */
        public WorkspaceOptions root(final String root) { this.root = root; return this; }

        /** Explicit list of package directories (relative to root). */
        public WorkspaceOptions packages(final List<String> packages) {
            this.packages = packages;
            return this;
        }

        /** Path to a shared env file loaded by all packages. */
        public WorkspaceOptions sharedEnvFile(final String sharedEnvFile) {
            this.sharedEnvFile = sharedEnvFile;
            return this;
        }

        /** Environment variable prefix to strip. */
        public WorkspaceOptions prefix(final String prefix) { this.prefix = prefix; return this; }

        /** Environment name (e.g. {@code "production"}). */
        public WorkspaceOptions env(final String env) { this.env = env; return this; }

        /** @return the root directory */
        public String getRoot() { return root; }

        /** @return the package list */
        public List<String> getPackages() { return packages; }

        /** @return the shared env file path */
        public String getSharedEnvFile() { return sharedEnvFile; }

        /** @return the prefix */
        public String getPrefix() { return prefix; }

        /** @return the environment name */
        public String getEnv() { return env; }
    }

    // ── MonorepoInfo ───────────────────────────────────────────

    /**
     * Information about a detected monorepo.
     */
    public static class MonorepoInfo {

        private final String root;
        private final String type;
        private final List<String> packages;

        /**
         * Create a new monorepo descriptor.
         *
         * @param root     absolute path to the monorepo root
         * @param type     tooling type (e.g. {@code "pnpm"}, {@code "nx"})
         * @param packages detected package directories
         */
        public MonorepoInfo(final String root, final String type,
                            final List<String> packages) {
            this.root = root;
            this.type = type;
            this.packages = Collections.unmodifiableList(new ArrayList<>(packages));
        }

        /** @return absolute path to the root */
        public String getRoot() { return root; }

        /** @return the monorepo tooling type */
        public String getType() { return type; }

        /** @return detected package directories */
        public List<String> getPackages() { return packages; }

        @Override
        public String toString() {
            return "MonorepoInfo{root='" + root + "', type='" + type
                    + "', packages=" + packages + '}';
        }
    }

    // ── Public API ─────────────────────────────────────────────

    /**
     * Load configuration for every package in a workspace.
     *
     * <p>For each package directory, this method loads configuration via
     * {@link Dotlyte#load} with the package directory as the working directory,
     * merging any shared env file first.
     *
     * @param options workspace options
     * @return a map from package name → merged config values
     * @throws DotlyteException if the root cannot be resolved or loading fails
     */
    public static Map<String, Map<String, Object>> loadWorkspace(
            final WorkspaceOptions options) throws DotlyteException {

        final String root = options.getRoot() != null
                ? options.getRoot() : ".";
        final Path rootPath = Path.of(root).toAbsolutePath().normalize();

        if (!Files.isDirectory(rootPath)) {
            throw new DotlyteException("Workspace root does not exist: " + rootPath);
        }

        // Resolve shared env
        final Map<String, Object> sharedEnv;
        if (options.getSharedEnvFile() != null) {
            sharedEnv = getSharedEnv(rootPath.toString(), options.getPrefix());
        } else {
            sharedEnv = Collections.emptyMap();
        }

        // Determine packages
        final List<String> packages;
        if (options.getPackages() != null && !options.getPackages().isEmpty()) {
            packages = options.getPackages();
        } else {
            final MonorepoInfo info = findMonorepoRoot(rootPath.toString());
            packages = info.getPackages();
        }

        final Map<String, Map<String, Object>> result = new LinkedHashMap<>();

        for (final String pkg : packages) {
            final Path pkgPath = rootPath.resolve(pkg).normalize();
            if (!Files.isDirectory(pkgPath)) {
                continue;
            }

            final String pkgName = pkgPath.getFileName().toString();

            final LoadOptions.Builder builder = LoadOptions.builder()
                    .cwd(pkgPath.toString());

            if (options.getPrefix() != null) {
                builder.prefix(options.getPrefix());
            }
            if (options.getEnv() != null) {
                builder.env(options.getEnv());
            }
            if (!sharedEnv.isEmpty()) {
                builder.defaults(sharedEnv);
            }

            try {
                final Config config = Dotlyte.load(builder.build());
                result.put(pkgName, config.toMap());
            } catch (final Exception e) {
                // If loading fails we still include the package with shared env only
                result.put(pkgName, new LinkedHashMap<>(sharedEnv));
            }
        }

        return Collections.unmodifiableMap(result);
    }

    /**
     * Detect the monorepo root and tooling type by walking up from {@code cwd}.
     *
     * <p>Checks for (in order): pnpm-workspace.yaml, turbo.json, nx.json,
     * lerna.json, package.json with {@code workspaces}.
     *
     * @param cwd the starting directory
     * @return monorepo information
     * @throws DotlyteException if no monorepo root can be detected
     */
    public static MonorepoInfo findMonorepoRoot(final String cwd) throws DotlyteException {
        Path current = Path.of(cwd).toAbsolutePath().normalize();

        while (current != null) {
            // pnpm
            if (Files.exists(current.resolve("pnpm-workspace.yaml"))) {
                return new MonorepoInfo(
                        current.toString(), "pnpm",
                        detectPackageDirs(current));
            }
            // turbo
            if (Files.exists(current.resolve("turbo.json"))) {
                return new MonorepoInfo(
                        current.toString(), "turbo",
                        detectPackageDirs(current));
            }
            // nx
            if (Files.exists(current.resolve("nx.json"))) {
                return new MonorepoInfo(
                        current.toString(), "nx",
                        detectPackageDirs(current));
            }
            // lerna
            if (Files.exists(current.resolve("lerna.json"))) {
                return new MonorepoInfo(
                        current.toString(), "lerna",
                        detectPackageDirs(current));
            }
            // npm / yarn workspaces (package.json with "workspaces")
            final Path packageJson = current.resolve("package.json");
            if (Files.exists(packageJson)) {
                try {
                    final String content = Files.readString(packageJson, StandardCharsets.UTF_8);
                    if (content.contains("\"workspaces\"")) {
                        return new MonorepoInfo(
                                current.toString(), "npm",
                                detectPackageDirs(current));
                    }
                } catch (final IOException ignored) {
                    // Continue searching
                }
            }

            current = current.getParent();
        }

        throw new DotlyteException(
                "No monorepo root found. Looked for pnpm-workspace.yaml, turbo.json, "
                        + "nx.json, lerna.json, or package.json with workspaces field.");
    }

    /**
     * Load the shared environment from the workspace root.
     *
     * @param root   the monorepo root directory
     * @param prefix optional env-var prefix to strip (may be {@code null})
     * @return merged shared configuration
     * @throws DotlyteException on load failure
     */
    public static Map<String, Object> getSharedEnv(
            final String root, final String prefix) throws DotlyteException {

        final LoadOptions.Builder builder = LoadOptions.builder()
                .cwd(root);

        if (prefix != null) {
            builder.prefix(prefix);
        }

        try {
            final Config config = Dotlyte.load(builder.build());
            return config.toMap();
        } catch (final Exception e) {
            return Collections.emptyMap();
        }
    }

    // ── Helpers ────────────────────────────────────────────────

    /**
     * Detect package directories inside common locations ({@code packages/},
     * {@code apps/}, {@code libs/}, {@code modules/}).
     */
    private static List<String> detectPackageDirs(final Path root) {
        final List<String> result = new ArrayList<>();
        final String[] candidates = {"packages", "apps", "libs", "modules"};

        for (final String candidate : candidates) {
            final Path dir = root.resolve(candidate);
            if (Files.isDirectory(dir)) {
                try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir)) {
                    for (final Path child : stream) {
                        if (Files.isDirectory(child)) {
                            result.add(candidate + "/" + child.getFileName());
                        }
                    }
                } catch (final IOException ignored) {
                    // Skip inaccessible directory
                }
            }
        }

        return result;
    }
}
