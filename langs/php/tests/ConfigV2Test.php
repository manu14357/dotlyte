<?php

declare(strict_types=1);

namespace Dotlyte\Tests;

use Dotlyte\Config;
use Dotlyte\DotlyteException;
use Dotlyte\Masking;
use Dotlyte\MissingKeyException;
use Dotlyte\SchemaRule;
use Dotlyte\ValidationException;
use PHPUnit\Framework\TestCase;

final class ConfigV2Test extends TestCase
{
    public function testScope(): void
    {
        $config = new Config([
            'database' => ['host' => 'localhost', 'port' => 5432],
        ]);
        $db = $config->scope('database');
        $this->assertSame('localhost', $db->get('host'));
        $this->assertSame(5432, $db->get('port'));
    }

    public function testScopeThrowsOnMissing(): void
    {
        $config = new Config([]);
        $this->expectException(DotlyteException::class);
        $config->scope('missing');
    }

    public function testKeys(): void
    {
        $config = new Config(['a' => 1, 'b' => 2, 'c' => 3]);
        $this->assertSame(['a', 'b', 'c'], $config->keys());
    }

    public function testToFlatKeys(): void
    {
        $config = new Config([
            'a' => 1,
            'b' => ['c' => 2, 'd' => 3],
        ]);
        $flat = $config->toFlatKeys();
        $this->assertContains('a', $flat);
        $this->assertContains('b.c', $flat);
        $this->assertContains('b.d', $flat);
    }

    public function testToFlatArray(): void
    {
        $config = new Config([
            'a' => 1,
            'b' => ['c' => 2],
        ]);
        $flat = $config->toFlatArray();
        $this->assertSame(1, $flat['a']);
        $this->assertSame(2, $flat['b.c']);
    }

    public function testRequireKeys(): void
    {
        $config = new Config(['host' => 'localhost', 'port' => 8080]);
        [$host, $port] = $config->requireKeys('host', 'port');
        $this->assertSame('localhost', $host);
        $this->assertSame(8080, $port);
    }

    public function testRequireKeysThrows(): void
    {
        $config = new Config(['host' => 'localhost']);
        $this->expectException(MissingKeyException::class);
        $config->requireKeys('host', 'missing');
    }

    public function testToArrayRedacted(): void
    {
        $config = new Config(
            ['host' => 'localhost', 'password' => 's3cret'],
            sensitiveKeys: ['password'],
        );
        $result = $config->toArrayRedacted();
        $this->assertSame('localhost', $result['host']);
        $this->assertSame(Masking::REDACTED, $result['password']);
    }

    public function testToJson(): void
    {
        $config = new Config(['port' => 8080]);
        $json = $config->toJson();
        $decoded = json_decode($json, true);
        $this->assertSame(8080, $decoded['port']);
    }

    public function testWriteTo(): void
    {
        $tmpFile = sys_get_temp_dir() . '/dotlyte_test_' . uniqid() . '.json';
        try {
            $config = new Config(['port' => 8080, 'host' => 'localhost']);
            $config->writeTo($tmpFile);

            $this->assertFileExists($tmpFile);
            $content = json_decode(file_get_contents($tmpFile), true);
            $this->assertSame(8080, $content['port']);
        } finally {
            if (file_exists($tmpFile)) {
                unlink($tmpFile);
            }
        }
    }

    public function testValidate(): void
    {
        $schema = [
            'port' => new SchemaRule(type: 'integer', required: true),
        ];
        $config = new Config(['port' => 8080], schema: $schema);
        $this->assertCount(0, $config->validate());
    }

    public function testAssertValidThrows(): void
    {
        $schema = [
            'port' => new SchemaRule(type: 'integer', required: true),
        ];
        $config = new Config([], schema: $schema);
        $this->expectException(ValidationException::class);
        $config->assertValid();
    }

    public function testScopePreservesSensitiveKeys(): void
    {
        $config = new Config(
            ['database' => ['host' => 'localhost', 'password' => 's3cret']],
            sensitiveKeys: ['database.password'],
        );
        $db = $config->scope('database');
        $redacted = $db->toArrayRedacted();
        $this->assertSame(Masking::REDACTED, $redacted['password']);
    }

    public function testMagicPropertyNested(): void
    {
        $config = new Config([
            'database' => ['host' => 'localhost', 'port' => 5432],
        ]);
        $this->assertSame('localhost', $config->database->host);
        $this->assertSame(5432, $config->database->port);
    }
}
