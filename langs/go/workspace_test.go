package dotlyte

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFindMonorepoRootPnpm(t *testing.T) {
	tmpDir := t.TempDir()

	// Create pnpm-workspace.yaml
	wsContent := []byte("packages:\n  - 'packages/*'\n")
	if err := os.WriteFile(filepath.Join(tmpDir, "pnpm-workspace.yaml"), wsContent, 0644); err != nil {
		t.Fatal(err)
	}

	// Create a nested directory
	nested := filepath.Join(tmpDir, "packages", "app")
	if err := os.MkdirAll(nested, 0755); err != nil {
		t.Fatal(err)
	}

	info, err := FindMonorepoRoot(nested)
	if err != nil {
		t.Fatalf("FindMonorepoRoot() error: %v", err)
	}
	if info.Root != tmpDir {
		t.Errorf("Root = %q, want %q", info.Root, tmpDir)
	}
	if info.Type != "pnpm" {
		t.Errorf("Type = %q, want 'pnpm'", info.Type)
	}
}

func TestFindMonorepoRootGoWork(t *testing.T) {
	tmpDir := t.TempDir()

	goWork := []byte("go 1.21\n\nuse (\n\t./svc-a\n\t./svc-b\n)\n")
	if err := os.WriteFile(filepath.Join(tmpDir, "go.work"), goWork, 0644); err != nil {
		t.Fatal(err)
	}

	nested := filepath.Join(tmpDir, "svc-a")
	if err := os.MkdirAll(nested, 0755); err != nil {
		t.Fatal(err)
	}

	info, err := FindMonorepoRoot(nested)
	if err != nil {
		t.Fatalf("FindMonorepoRoot() error: %v", err)
	}
	if info.Root != tmpDir {
		t.Errorf("Root = %q, want %q", info.Root, tmpDir)
	}
	if info.Type != "go" {
		t.Errorf("Type = %q, want 'go'", info.Type)
	}
}

func TestFindMonorepoRootNotFound(t *testing.T) {
	tmpDir := t.TempDir()

	_, err := FindMonorepoRoot(tmpDir)
	if err == nil {
		t.Error("expected error when no monorepo marker found")
	}
}

func TestGetSharedEnvBasic(t *testing.T) {
	tmpDir := t.TempDir()

	envContent := []byte("APP_DB_HOST=localhost\nAPP_DB_PORT=5432\nOTHER_KEY=ignored\n")
	if err := os.WriteFile(filepath.Join(tmpDir, ".env"), envContent, 0644); err != nil {
		t.Fatal(err)
	}

	cfg, err := GetSharedEnv(tmpDir, "APP_")
	if err != nil {
		t.Fatalf("GetSharedEnv() error: %v", err)
	}

	val, ok := cfg["db.host"]
	if !ok {
		t.Fatal("expected key 'db.host'")
	}
	if val != "localhost" {
		t.Errorf("db.host = %v, want 'localhost'", val)
	}

	val, ok = cfg["db.port"]
	if !ok {
		t.Fatal("expected key 'db.port'")
	}
	// coerced to int64 by the parser
	if val != int64(5432) {
		t.Errorf("db.port = %v (type %T), want 5432", val, val)
	}
}

func TestGetSharedEnvNoPrefix(t *testing.T) {
	tmpDir := t.TempDir()

	envContent := []byte("HOST=localhost\nPORT=3000\n")
	if err := os.WriteFile(filepath.Join(tmpDir, ".env"), envContent, 0644); err != nil {
		t.Fatal(err)
	}

	cfg, err := GetSharedEnv(tmpDir, "")
	if err != nil {
		t.Fatalf("GetSharedEnv() error: %v", err)
	}

	if cfg["host"] != "localhost" {
		t.Errorf("host = %v, want 'localhost'", cfg["host"])
	}
}

func TestGetSharedEnvMissingFile(t *testing.T) {
	tmpDir := t.TempDir()

	cfg, err := GetSharedEnv(tmpDir, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(cfg) != 0 {
		t.Errorf("expected empty map, got %d entries", len(cfg))
	}
}

func TestLoadWorkspaceBasic(t *testing.T) {
	tmpDir := t.TempDir()

	// Create pnpm-workspace.yaml
	wsContent := []byte("packages:\n  - 'packages/*'\n")
	if err := os.WriteFile(filepath.Join(tmpDir, "pnpm-workspace.yaml"), wsContent, 0644); err != nil {
		t.Fatal(err)
	}

	// Create .env in root
	envContent := []byte("APP_DB_HOST=localhost\nAPP_PORT=8080\n")
	if err := os.WriteFile(filepath.Join(tmpDir, ".env"), envContent, 0644); err != nil {
		t.Fatal(err)
	}

	// Create package directory
	pkgDir := filepath.Join(tmpDir, "packages", "api")
	if err := os.MkdirAll(pkgDir, 0755); err != nil {
		t.Fatal(err)
	}

	cfg, err := LoadWorkspace(WorkspaceOptions{
		Root:     tmpDir,
		Packages: []string{"packages/api"},
	})
	if err != nil {
		t.Fatalf("LoadWorkspace() error: %v", err)
	}

	if cfg == nil {
		t.Fatal("LoadWorkspace() returned nil config")
	}
}

func TestDetectMonorepoAtPnpm(t *testing.T) {
	tmpDir := t.TempDir()

	wsContent := []byte("packages:\n  - 'apps/*'\n  - 'libs/*'\n")
	if err := os.WriteFile(filepath.Join(tmpDir, "pnpm-workspace.yaml"), wsContent, 0644); err != nil {
		t.Fatal(err)
	}

	info := detectMonorepoAt(tmpDir)
	if info == nil {
		t.Fatal("detectMonorepoAt() returned nil")
	}
	if info.Type != "pnpm" {
		t.Errorf("Type = %q, want 'pnpm'", info.Type)
	}
	if len(info.Packages) != 2 {
		t.Errorf("Packages length = %d, want 2", len(info.Packages))
	}
}

func TestDetectMonorepoAtNone(t *testing.T) {
	tmpDir := t.TempDir()

	info := detectMonorepoAt(tmpDir)
	if info != nil {
		t.Error("expected nil from detectMonorepoAt() in empty dir")
	}
}
