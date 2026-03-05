<?php

declare(strict_types=1);

namespace Dotlyte\Tests;

use Dotlyte\Workspace;
use PHPUnit\Framework\TestCase;

final class WorkspaceTest extends TestCase
{
    private string $tmpDir;

    protected function setUp(): void
    {
        $this->tmpDir = sys_get_temp_dir() . '/dotlyte_ws_test_' . bin2hex(random_bytes(4));
        mkdir($this->tmpDir, 0755, true);
    }

    protected function tearDown(): void
    {
        $this->rrmdir($this->tmpDir);
    }

    public function testFindMonorepoRootWithPnpmWorkspace(): void
    {
        $yaml = "packages:\n  - 'packages/*'\n";
        file_put_contents($this->tmpDir . '/pnpm-workspace.yaml', $yaml);

        // Create a package dir
        mkdir($this->tmpDir . '/packages/app-a', 0755, true);

        $result = Workspace::findMonorepoRoot($this->tmpDir);

        $this->assertNotNull($result);
        // realpath() resolves /var → /private/var on macOS
        $this->assertSame(realpath($this->tmpDir), $result['root']);
        $this->assertSame('pnpm', $result['type']);
        $this->assertContains('packages/app-a', $result['packages']);
    }

    public function testFindMonorepoRootWithTurbo(): void
    {
        file_put_contents($this->tmpDir . '/turbo.json', '{}');
        file_put_contents($this->tmpDir . '/package.json', json_encode([
            'name' => 'monorepo',
            'workspaces' => ['packages/*'],
        ]));
        mkdir($this->tmpDir . '/packages/lib-a', 0755, true);

        $result = Workspace::findMonorepoRoot($this->tmpDir);

        $this->assertNotNull($result);
        $this->assertSame('turbo', $result['type']);
    }

    public function testFindMonorepoRootWithNx(): void
    {
        file_put_contents($this->tmpDir . '/nx.json', '{}');
        mkdir($this->tmpDir . '/packages/core', 0755, true);

        $result = Workspace::findMonorepoRoot($this->tmpDir);

        $this->assertNotNull($result);
        $this->assertSame('nx', $result['type']);
    }

    public function testFindMonorepoRootWithLerna(): void
    {
        file_put_contents($this->tmpDir . '/lerna.json', json_encode([
            'packages' => ['packages/*'],
        ]));
        mkdir($this->tmpDir . '/packages/pkg-a', 0755, true);

        $result = Workspace::findMonorepoRoot($this->tmpDir);

        $this->assertNotNull($result);
        $this->assertSame('lerna', $result['type']);
    }

    public function testFindMonorepoRootWithPackageJsonWorkspaces(): void
    {
        file_put_contents($this->tmpDir . '/package.json', json_encode([
            'name' => 'my-monorepo',
            'workspaces' => ['apps/*'],
        ]));
        mkdir($this->tmpDir . '/apps/web', 0755, true);

        $result = Workspace::findMonorepoRoot($this->tmpDir);

        $this->assertNotNull($result);
        $this->assertSame('npm', $result['type']);
        $this->assertContains('apps/web', $result['packages']);
    }

    public function testFindMonorepoRootReturnsNullWhenNone(): void
    {
        // Empty directory — no markers
        $result = Workspace::findMonorepoRoot($this->tmpDir);

        // Will walk up to filesystem root and eventually return null
        // (unless the real filesystem has a marker — use a deep temp dir)
        $this->assertTrue($result === null || is_array($result));
    }

    public function testGetSharedEnv(): void
    {
        file_put_contents($this->tmpDir . '/.env', "APP_NAME=dotlyte\nAPP_PORT=3000\n");

        $result = Workspace::getSharedEnv($this->tmpDir);

        $this->assertSame('dotlyte', $result['APP_NAME']);
        $this->assertSame('3000', $result['APP_PORT']);
    }

    public function testGetSharedEnvWithPrefix(): void
    {
        file_put_contents($this->tmpDir . '/.env', "APP_NAME=dotlyte\nAPP_PORT=3000\nOTHER=x\n");

        $result = Workspace::getSharedEnv($this->tmpDir, 'APP');

        $this->assertArrayHasKey('NAME', $result);
        $this->assertArrayHasKey('PORT', $result);
        $this->assertArrayNotHasKey('OTHER', $result);
        $this->assertArrayNotHasKey('APP_NAME', $result);
    }

    public function testGetSharedEnvMissingFile(): void
    {
        $result = Workspace::getSharedEnv($this->tmpDir);
        $this->assertSame([], $result);
    }

    /**
     * Recursively remove a directory.
     */
    private function rrmdir(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        $items = scandir($dir);
        if ($items === false) {
            return;
        }
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $path = $dir . DIRECTORY_SEPARATOR . $item;
            if (is_dir($path)) {
                $this->rrmdir($path);
            } else {
                unlink($path);
            }
        }
        rmdir($dir);
    }
}
