package dotlyte

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// WorkspaceOptions configures monorepo workspace loading behavior.
type WorkspaceOptions struct {
	// Root is the monorepo root directory. Auto-detected if empty.
	Root string

	// Packages is a list of sub-package paths relative to the monorepo root.
	Packages []string

	// SharedEnvFile is the path to the shared .env file (default: root .env).
	SharedEnvFile string

	// Prefix strips environment variable prefixes.
	Prefix string

	// Env is the environment name (e.g., "production").
	Env string
}

// MonorepoInfo describes a detected monorepo workspace.
type MonorepoInfo struct {
	// Root is the absolute path to the monorepo root.
	Root string

	// Type is the monorepo tool type: "pnpm", "npm", "yarn", "nx", "turbo", "lerna", "go", "unknown".
	Type string

	// Packages is the list of detected workspace package paths.
	Packages []string
}

// LoadWorkspace loads configuration for all packages in a monorepo workspace.
// Returns a map of package name → config data. The root shared .env is loaded
// first (lowest priority), then each package's .env files override.
func LoadWorkspace(opts WorkspaceOptions) (map[string]map[string]interface{}, error) {
	root := opts.Root
	if root == "" {
		cwd, err := os.Getwd()
		if err != nil {
			return nil, fmt.Errorf("dotlyte: failed to get working directory: %w", err)
		}
		detected, err := FindMonorepoRoot(cwd)
		if err != nil {
			return nil, err
		}
		root = detected.Root
	}

	// Load shared env
	sharedData, err := GetSharedEnv(root, opts.Prefix)
	if err != nil {
		return nil, err
	}

	packages := opts.Packages
	if len(packages) == 0 {
		// Try to detect packages
		info := detectMonorepoAt(root)
		if info != nil {
			packages = info.Packages
		}
	}

	result := make(map[string]map[string]interface{}, len(packages))

	for _, pkg := range packages {
		pkgDir := filepath.Join(root, pkg)

		// Start with shared data
		pkgData := make(map[string]interface{})
		for k, v := range sharedData {
			pkgData[k] = v
		}

		// Load package-specific env files
		envFiles := resolveEnvFiles(pkgDir, opts.Env)
		for _, envFile := range envFiles {
			if _, err := os.Stat(envFile); os.IsNotExist(err) {
				continue
			}
			data, err := parseDotenvFileV2(envFile, true)
			if err != nil {
				return nil, fmt.Errorf("dotlyte: error loading %s: %w", envFile, err)
			}
			pkgData = DeepMerge(pkgData, data)
		}

		result[pkg] = pkgData
	}

	return result, nil
}

// FindMonorepoRoot walks up directories from cwd looking for monorepo
// configuration files (pnpm-workspace.yaml, turbo.json, nx.json, lerna.json,
// go.work, or package.json with workspaces).
func FindMonorepoRoot(cwd string) (*MonorepoInfo, error) {
	dir, err := filepath.Abs(cwd)
	if err != nil {
		return nil, fmt.Errorf("dotlyte: cannot resolve path: %w", err)
	}

	for {
		info := detectMonorepoAt(dir)
		if info != nil {
			return info, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	return nil, &DotlyteError{
		Message: fmt.Sprintf("no monorepo root found from '%s'. Looked for: pnpm-workspace.yaml, turbo.json, nx.json, lerna.json, go.work, package.json with workspaces", cwd),
		Code:    "WORKSPACE_NOT_FOUND",
	}
}

// GetSharedEnv reads the root-level .env file and returns its key-value pairs.
// If a prefix is specified, only keys with that prefix are returned (with the prefix stripped).
func GetSharedEnv(root, prefix string) (map[string]interface{}, error) {
	envPath := filepath.Join(root, ".env")
	if _, err := os.Stat(envPath); os.IsNotExist(err) {
		return make(map[string]interface{}), nil
	}

	data, err := parseDotenvFileV2(envPath, true)
	if err != nil {
		return nil, fmt.Errorf("dotlyte: error loading shared env from %s: %w", envPath, err)
	}

	if prefix == "" {
		return data, nil
	}

	// Filter and strip prefix
	result := make(map[string]interface{})
	upperPrefix := strings.ToUpper(prefix)
	for k, v := range data {
		upperKey := strings.ToUpper(k)
		if strings.HasPrefix(upperKey, upperPrefix) {
			stripped := k[len(upperPrefix):]
			// Convert UPPER_SNAKE to dot.notation  
			dotKey := strings.ToLower(strings.ReplaceAll(stripped, "_", "."))
			result[dotKey] = v
		}
	}
	return result, nil
}

// detectMonorepoAt checks if a directory is a monorepo root.
func detectMonorepoAt(dir string) *MonorepoInfo {
	// pnpm workspaces
	if fileExists(filepath.Join(dir, "pnpm-workspace.yaml")) {
		return &MonorepoInfo{
			Root:     dir,
			Type:     "pnpm",
			Packages: extractPnpmWorkspaces(filepath.Join(dir, "pnpm-workspace.yaml")),
		}
	}

	// Turbo
	if fileExists(filepath.Join(dir, "turbo.json")) {
		return &MonorepoInfo{
			Root:     dir,
			Type:     "turbo",
			Packages: extractPackageJSONWorkspaces(dir),
		}
	}

	// Nx
	if fileExists(filepath.Join(dir, "nx.json")) {
		return &MonorepoInfo{
			Root:     dir,
			Type:     "nx",
			Packages: extractPackageJSONWorkspaces(dir),
		}
	}

	// Lerna
	if fileExists(filepath.Join(dir, "lerna.json")) {
		return &MonorepoInfo{
			Root:     dir,
			Type:     "lerna",
			Packages: extractLernaPackages(filepath.Join(dir, "lerna.json")),
		}
	}

	// Go workspace
	if fileExists(filepath.Join(dir, "go.work")) {
		return &MonorepoInfo{
			Root:     dir,
			Type:     "go",
			Packages: extractGoWorkspaces(filepath.Join(dir, "go.work")),
		}
	}

	// npm/yarn workspaces (package.json)
	pkgPath := filepath.Join(dir, "package.json")
	if fileExists(pkgPath) {
		content, err := os.ReadFile(pkgPath)
		if err == nil {
			var pkg map[string]interface{}
			if err := json.Unmarshal(content, &pkg); err == nil {
				if _, ok := pkg["workspaces"]; ok {
					wsType := "npm"
					if fileExists(filepath.Join(dir, "yarn.lock")) {
						wsType = "yarn"
					}
					return &MonorepoInfo{
						Root:     dir,
						Type:     wsType,
						Packages: extractPackageJSONWorkspaces(dir),
					}
				}
			}
		}
	}

	return nil
}

// resolveEnvFiles returns candidate .env file paths in a directory.
func resolveEnvFiles(dir, env string) []string {
	files := []string{
		filepath.Join(dir, ".env"),
		filepath.Join(dir, ".env.local"),
	}
	if env != "" {
		files = append(files,
			filepath.Join(dir, fmt.Sprintf(".env.%s", env)),
			filepath.Join(dir, fmt.Sprintf(".env.%s.local", env)),
		)
	}
	return files
}

// fileExists checks if a file exists and is not a directory.
func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// extractPnpmWorkspaces reads package paths from pnpm-workspace.yaml.
func extractPnpmWorkspaces(path string) []string {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	// Simple YAML parsing for packages list
	var packages []string
	inPackages := false
	for _, line := range strings.Split(string(content), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "packages:" {
			inPackages = true
			continue
		}
		if inPackages {
			if strings.HasPrefix(trimmed, "- ") {
				pkg := strings.TrimPrefix(trimmed, "- ")
				pkg = strings.Trim(pkg, "'\"")
				// Expand glob patterns simply
				packages = append(packages, expandGlobDir(filepath.Dir(path), pkg)...)
			} else if trimmed != "" && !strings.HasPrefix(trimmed, "#") {
				break
			}
		}
	}
	return packages
}

// extractPackageJSONWorkspaces reads workspace paths from package.json.
func extractPackageJSONWorkspaces(dir string) []string {
	content, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return nil
	}
	var pkg map[string]interface{}
	if err := json.Unmarshal(content, &pkg); err != nil {
		return nil
	}
	ws, ok := pkg["workspaces"]
	if !ok {
		return nil
	}

	var patterns []string
	switch v := ws.(type) {
	case []interface{}:
		for _, p := range v {
			if s, ok := p.(string); ok {
				patterns = append(patterns, s)
			}
		}
	case map[string]interface{}:
		// yarn workspaces format: { packages: [...] }
		if pkgs, ok := v["packages"]; ok {
			if arr, ok := pkgs.([]interface{}); ok {
				for _, p := range arr {
					if s, ok := p.(string); ok {
						patterns = append(patterns, s)
					}
				}
			}
		}
	}

	var packages []string
	for _, pattern := range patterns {
		packages = append(packages, expandGlobDir(dir, pattern)...)
	}
	return packages
}

// extractLernaPackages reads package paths from lerna.json.
func extractLernaPackages(path string) []string {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var lerna map[string]interface{}
	if err := json.Unmarshal(content, &lerna); err != nil {
		return nil
	}
	pkgs, ok := lerna["packages"]
	if !ok {
		return nil
	}
	arr, ok := pkgs.([]interface{})
	if !ok {
		return nil
	}
	var packages []string
	dir := filepath.Dir(path)
	for _, p := range arr {
		if s, ok := p.(string); ok {
			packages = append(packages, expandGlobDir(dir, s)...)
		}
	}
	return packages
}

// extractGoWorkspaces reads workspace paths from go.work.
func extractGoWorkspaces(path string) []string {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var packages []string
	for _, line := range strings.Split(string(content), "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "use ") || strings.HasPrefix(trimmed, "./") {
			pkg := strings.TrimPrefix(trimmed, "use ")
			pkg = strings.TrimSpace(pkg)
			if pkg != "" && pkg != "(" && pkg != ")" {
				packages = append(packages, pkg)
			}
		}
	}
	return packages
}

// expandGlobDir expands a simple glob pattern within a directory.
// For patterns like "packages/*" or "apps/*", lists matching subdirectories.
func expandGlobDir(baseDir, pattern string) []string {
	// Remove trailing /* or /**
	cleaned := strings.TrimSuffix(pattern, "/**")
	cleaned = strings.TrimSuffix(cleaned, "/*")

	if !strings.Contains(cleaned, "*") {
		// Not a glob, use as-is
		return []string{cleaned}
	}

	// Try filesystem glob
	matches, err := filepath.Glob(filepath.Join(baseDir, pattern))
	if err != nil || len(matches) == 0 {
		return nil
	}

	var results []string
	for _, m := range matches {
		rel, err := filepath.Rel(baseDir, m)
		if err == nil {
			info, err := os.Stat(m)
			if err == nil && info.IsDir() {
				results = append(results, rel)
			}
		}
	}
	return results
}
