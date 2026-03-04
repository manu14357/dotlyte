<?php

declare(strict_types=1);

namespace Dotlyte\Tests;

use Dotlyte\Masking;
use Dotlyte\SchemaRule;
use Dotlyte\Validator;
use PHPUnit\Framework\TestCase;

final class MaskingTest extends TestCase
{
    public function testAutoDetectSensitive(): void
    {
        $data = [
            'db_password' => 's3cret',
            'api_key' => 'abc123',
            'host' => 'localhost',
            'auth_token' => 'tok',
        ];
        $keys = Masking::buildSensitiveSet($data);
        $this->assertContains('db_password', $keys);
        $this->assertContains('api_key', $keys);
        $this->assertContains('auth_token', $keys);
        $this->assertNotContains('host', $keys);
    }

    public function testSchemaKeys(): void
    {
        $data = ['host' => 'localhost', 'secret' => 'abc'];
        $schema = [
            'secret' => new SchemaRule(type: 'string', sensitive: true),
        ];
        $schemaKeys = Validator::sensitiveKeys($schema);
        $keys = Masking::buildSensitiveSet($data, $schemaKeys);
        $this->assertContains('secret', $keys);
    }

    public function testRedact(): void
    {
        $data = ['host' => 'localhost', 'password' => 's3cret'];
        $result = Masking::redact($data, ['password']);
        $this->assertSame('localhost', $result['host']);
        $this->assertSame(Masking::REDACTED, $result['password']);
    }

    public function testNestedRedact(): void
    {
        $data = [
            'database' => ['host' => 'db', 'password' => 'secret'],
        ];
        $result = Masking::redact($data, ['database.password']);
        $this->assertSame('db', $result['database']['host']);
        $this->assertSame(Masking::REDACTED, $result['database']['password']);
    }

    public function testFormatRedacted(): void
    {
        $this->assertSame('ab***', Masking::formatRedacted('abcde'));
        $this->assertSame('**', Masking::formatRedacted('ab'));
        $this->assertSame(Masking::REDACTED, Masking::formatRedacted(null));
    }

    public function testRedactPreservesStructure(): void
    {
        $data = [
            'port' => 8080,
            'debug' => true,
            'api_key' => 'test-key-123',
        ];
        $result = Masking::redact($data, ['api_key']);
        $this->assertSame(8080, $result['port']);
        $this->assertTrue($result['debug']);
        $this->assertSame(Masking::REDACTED, $result['api_key']);
    }
}
