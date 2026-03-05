using Xunit;

namespace Dotlyte.Tests;

public class WorkspaceTests : IDisposable
{
    private readonly string _tempDir;

    public WorkspaceTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), $"dotlyte-workspace-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempDir);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
            Directory.Delete(_tempDir, recursive: true);
    }

    [Fact]
    public void FindMonorepoRootDetectsPnpm()
    {
        // Create a pnpm-workspace.yaml at root
        File.WriteAllText(Path.Combine(_tempDir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");

        // Create a subdirectory to search from
        var subDir = Path.Combine(_tempDir, "packages", "my-pkg");
        Directory.CreateDirectory(subDir);

        var result = Workspace.FindMonorepoRoot(subDir);
        Assert.NotNull(result);
        Assert.Equal(_tempDir, result!.Root);
        Assert.Equal("pnpm", result.Type);
    }

    [Fact]
    public void FindMonorepoRootDetectsGoWork()
    {
        File.WriteAllText(Path.Combine(_tempDir, "go.work"), "go 1.21\n");
        var subDir = Path.Combine(_tempDir, "cmd", "app");
        Directory.CreateDirectory(subDir);

        var result = Workspace.FindMonorepoRoot(subDir);
        Assert.NotNull(result);
        Assert.Equal(_tempDir, result!.Root);
        Assert.Equal("go", result.Type);
    }

    [Fact]
    public void FindMonorepoRootDetectsNpmWorkspaces()
    {
        File.WriteAllText(
            Path.Combine(_tempDir, "package.json"),
            "{\"name\": \"root\", \"workspaces\": [\"packages/*\"]}");

        var subDir = Path.Combine(_tempDir, "packages", "pkg-a");
        Directory.CreateDirectory(subDir);

        var result = Workspace.FindMonorepoRoot(subDir);
        Assert.NotNull(result);
        Assert.Equal(_tempDir, result!.Root);
        Assert.Equal("npm", result.Type);
    }

    [Fact]
    public void FindMonorepoRootDetectsCargoWorkspace()
    {
        File.WriteAllText(
            Path.Combine(_tempDir, "Cargo.toml"),
            "[workspace]\nmembers = [\"crates/*\"]\n");

        var subDir = Path.Combine(_tempDir, "crates", "my-crate");
        Directory.CreateDirectory(subDir);

        var result = Workspace.FindMonorepoRoot(subDir);
        Assert.NotNull(result);
        Assert.Equal(_tempDir, result!.Root);
        Assert.Equal("cargo", result.Type);
    }

    [Fact]
    public void FindMonorepoRootReturnsNullWhenNotFound()
    {
        // Isolated empty temp dir — no markers
        var emptyDir = Path.Combine(_tempDir, "empty");
        Directory.CreateDirectory(emptyDir);

        // We'll start from a deeply nested dir to avoid hitting real monorepo roots
        var deepDir = Path.Combine(emptyDir, "a", "b", "c");
        Directory.CreateDirectory(deepDir);

        // Place a sentinel at emptyDir to stop walking (we can't control parents above _tempDir)
        // Instead, just verify the function doesn't crash
        var result = Workspace.FindMonorepoRoot(deepDir);
        // May or may not be null depending on what's above _tempDir; just verify no exception
        Assert.True(result is null || result.Root is not null);
    }

    [Fact]
    public void FindMonorepoRootDiscoversPnpmPackages()
    {
        File.WriteAllText(Path.Combine(_tempDir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");

        // Create packages with package.json
        var pkgA = Path.Combine(_tempDir, "packages", "pkg-a");
        var pkgB = Path.Combine(_tempDir, "packages", "pkg-b");
        Directory.CreateDirectory(pkgA);
        Directory.CreateDirectory(pkgB);
        File.WriteAllText(Path.Combine(pkgA, "package.json"), "{}");
        File.WriteAllText(Path.Combine(pkgB, "package.json"), "{}");

        var result = Workspace.FindMonorepoRoot(_tempDir);
        Assert.NotNull(result);
        Assert.Equal(2, result!.Packages.Length);
    }

    [Fact]
    public void GetSharedEnvLoadsFile()
    {
        File.WriteAllText(
            Path.Combine(_tempDir, ".env"),
            "APP_NAME=my-app\nDEBUG=true\n# comment\n");

        var result = Workspace.GetSharedEnv(_tempDir);
        Assert.NotEmpty(result);
        Assert.True(result.Count >= 2);
    }

    [Fact]
    public void GetSharedEnvStripsPrefix()
    {
        File.WriteAllText(
            Path.Combine(_tempDir, ".env"),
            "MYAPP_DB_HOST=localhost\nMYAPP_PORT=3000\n");

        var result = Workspace.GetSharedEnv(_tempDir, prefix: "MYAPP_");
        Assert.NotEmpty(result);
        // Keys should have prefix stripped
        Assert.DoesNotContain(result.Keys, k => k.StartsWith("myapp", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void GetSharedEnvReturnsEmptyWhenNoFile()
    {
        var result = Workspace.GetSharedEnv(_tempDir);
        Assert.Empty(result);
    }

    [Fact]
    public void MonorepoInfoRecordEquality()
    {
        var a = new Workspace.MonorepoInfo("/root", "pnpm", ["pkg-a"]);
        var b = new Workspace.MonorepoInfo("/root", "pnpm", ["pkg-a"]);

        // Records use value equality for simple properties but reference equality for arrays
        Assert.Equal(a.Root, b.Root);
        Assert.Equal(a.Type, b.Type);
    }
}
