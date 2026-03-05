//! Integration tests for the workspace/monorepo system.

use std::fs;

use dotlyte::workspace::{find_monorepo_root, get_shared_env};

#[test]
fn test_find_monorepo_root_from_nonexistent_dir() {
    // Should fail gracefully for a directory that doesn't exist
    let result = find_monorepo_root(Some("/tmp/dotlyte_nonexistent_test_dir_xyz"));
    assert!(result.is_err());
}

#[test]
fn test_find_monorepo_root_detects_pnpm() {
    let dir = tempfile::tempdir().unwrap();
    let ws_file = dir.path().join("pnpm-workspace.yaml");
    fs::write(
        &ws_file,
        "packages:\n  - 'packages/core'\n  - 'packages/cli'\n",
    )
    .unwrap();

    let result = find_monorepo_root(Some(dir.path().to_str().unwrap()));
    assert!(result.is_ok());
    let info = result.unwrap();
    assert_eq!(info.monorepo_type, "pnpm");
}

#[test]
fn test_find_monorepo_root_detects_turbo() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("turbo.json"), "{}").unwrap();
    fs::write(dir.path().join("package.json"), r#"{"workspaces":["apps/*"]}"#).unwrap();

    let result = find_monorepo_root(Some(dir.path().to_str().unwrap()));
    assert!(result.is_ok());
    let info = result.unwrap();
    assert_eq!(info.monorepo_type, "turbo");
}

#[test]
fn test_find_monorepo_root_detects_go_work() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(
        dir.path().join("go.work"),
        "go 1.21\n\nuse (\n\t./cmd\n\t./pkg\n)\n",
    )
    .unwrap();

    let result = find_monorepo_root(Some(dir.path().to_str().unwrap()));
    assert!(result.is_ok());
    let info = result.unwrap();
    assert_eq!(info.monorepo_type, "go");
}

#[test]
fn test_find_monorepo_root_detects_npm_workspaces() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(
        dir.path().join("package.json"),
        r#"{"workspaces": ["packages/*"]}"#,
    )
    .unwrap();

    let result = find_monorepo_root(Some(dir.path().to_str().unwrap()));
    assert!(result.is_ok());
    let info = result.unwrap();
    assert_eq!(info.monorepo_type, "npm");
}

#[test]
fn test_find_monorepo_root_detects_yarn() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(
        dir.path().join("package.json"),
        r#"{"workspaces": ["packages/*"]}"#,
    )
    .unwrap();
    fs::write(dir.path().join("yarn.lock"), "").unwrap();

    let result = find_monorepo_root(Some(dir.path().to_str().unwrap()));
    assert!(result.is_ok());
    let info = result.unwrap();
    assert_eq!(info.monorepo_type, "yarn");
}

#[test]
fn test_get_shared_env_no_file() {
    let dir = tempfile::tempdir().unwrap();
    let result = get_shared_env(dir.path().to_str().unwrap(), None).unwrap();
    assert!(result.is_empty());
}

#[test]
fn test_get_shared_env_basic() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join(".env"), "PORT=3000\nHOST=localhost\n").unwrap();

    let result = get_shared_env(dir.path().to_str().unwrap(), None).unwrap();
    assert!(!result.is_empty());
    assert!(result.contains_key("PORT"));
    assert!(result.contains_key("HOST"));
}

#[test]
fn test_get_shared_env_with_prefix() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(
        dir.path().join(".env"),
        "APP_DB_HOST=localhost\nAPP_DB_PORT=5432\nOTHER=value\n",
    )
    .unwrap();

    let result = get_shared_env(dir.path().to_str().unwrap(), Some("APP")).unwrap();
    // Should contain stripped keys converted to dot notation
    assert!(result.contains_key("db.host"));
    assert!(result.contains_key("db.port"));
    // Should NOT contain non-matching keys
    assert!(!result.contains_key("OTHER"));
    assert!(!result.contains_key("other"));
}
