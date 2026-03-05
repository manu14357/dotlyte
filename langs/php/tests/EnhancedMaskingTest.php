<?php

declare(strict_types=1);

namespace Dotlyte\Tests;

use Dotlyte\AuditProxy;
use Dotlyte\Masking;
use PHPUnit\Framework\TestCase;

final class EnhancedMaskingTest extends TestCase
{
    public function testCompilePatternsWildcard(): void
    {
        $patterns = Masking::compilePatterns(['db.*']);

        $this->assertCount(1, $patterns);
        $this->assertSame(1, preg_match($patterns[0], 'db.password'));
        $this->assertSame(1, preg_match($patterns[0], 'db.host'));
        $this->assertSame(0, preg_match($patterns[0], 'app.db.host'));
    }

    public function testCompilePatternsDoubleWildcard(): void
    {
        $patterns = Masking::compilePatterns(['**password**']);

        $this->assertCount(1, $patterns);
        $this->assertSame(1, preg_match($patterns[0], 'db.password'));
        $this->assertSame(1, preg_match($patterns[0], 'password'));
        $this->assertSame(1, preg_match($patterns[0], 'my.deep.password.field'));
    }

    public function testCompilePatternsMultiple(): void
    {
        $patterns = Masking::compilePatterns(['*.secret', '*.token']);

        $this->assertCount(2, $patterns);
        $this->assertSame(1, preg_match($patterns[0], 'app.secret'));
        $this->assertSame(1, preg_match($patterns[1], 'auth.token'));
        $this->assertSame(0, preg_match($patterns[0], 'app.host'));
    }

    public function testBuildSensitiveSetWithPatterns(): void
    {
        $keys = ['db.password', 'db.host', 'app.secret', 'app.name', 'auth.token'];

        $sensitive = Masking::buildSensitiveSetWithPatterns(
            $keys,
            patterns: ['app.*'],
            schemaSensitive: ['auth.token'],
        );

        // Auto-detected by built-in patterns
        $this->assertContains('db.password', $sensitive);
        $this->assertContains('app.secret', $sensitive);
        $this->assertContains('auth.token', $sensitive);

        // Matched by user glob pattern "app.*"
        $this->assertContains('app.name', $sensitive);

        // Not sensitive
        $this->assertNotContains('db.host', $sensitive);
    }

    public function testBuildSensitiveSetWithPatternsNoPatterns(): void
    {
        $keys = ['password', 'host', 'port'];

        $sensitive = Masking::buildSensitiveSetWithPatterns($keys);

        $this->assertContains('password', $sensitive);
        $this->assertNotContains('host', $sensitive);
        $this->assertNotContains('port', $sensitive);
    }

    public function testCreateAuditProxyReturnsArrayAccess(): void
    {
        $data = ['host' => 'localhost', 'password' => 's3cret'];
        $log = [];

        $proxy = Masking::createAuditProxy(
            $data,
            ['password'],
            function (string $key, mixed $value, bool $isSensitive) use (&$log) {
                $log[] = ['key' => $key, 'sensitive' => $isSensitive];
            },
        );

        $this->assertInstanceOf(AuditProxy::class, $proxy);
        $this->assertInstanceOf(\ArrayAccess::class, $proxy);
    }

    public function testAuditProxyTriggersCallback(): void
    {
        $data = ['host' => 'localhost', 'password' => 's3cret'];
        $log = [];

        $proxy = Masking::createAuditProxy(
            $data,
            ['password'],
            function (string $key, mixed $value, bool $isSensitive) use (&$log) {
                $log[] = ['key' => $key, 'sensitive' => $isSensitive];
            },
        );

        // Access non-sensitive key
        $this->assertSame('localhost', $proxy['host']);
        $this->assertCount(1, $log);
        $this->assertFalse($log[0]['sensitive']);

        // Access sensitive key
        $this->assertSame('s3cret', $proxy['password']);
        $this->assertCount(2, $log);
        $this->assertTrue($log[1]['sensitive']);
    }

    public function testAuditProxyOffsetExists(): void
    {
        $proxy = Masking::createAuditProxy(['a' => 1], [], fn() => null);

        $this->assertTrue(isset($proxy['a']));
        $this->assertFalse(isset($proxy['b']));
    }

    public function testAuditProxyIsImmutable(): void
    {
        $proxy = Masking::createAuditProxy(['a' => 1], [], fn() => null);

        // Write should be silently ignored
        $proxy['a'] = 999;
        $log = [];
        $proxy2 = Masking::createAuditProxy(
            ['a' => 1],
            [],
            function (string $key, mixed $value, bool $isSensitive) use (&$log) {
                $log[] = $value;
            },
        );
        $this->assertSame(1, $proxy2['a']);
    }
}
