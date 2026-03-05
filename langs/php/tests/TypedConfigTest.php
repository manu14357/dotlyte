<?php

declare(strict_types=1);

namespace Dotlyte\Tests;

use Dotlyte\DotlyteException;
use Dotlyte\TypedConfig;
use PHPUnit\Framework\TestCase;

final class TypedConfigTest extends TestCase
{
    protected function setUp(): void
    {
        // Clear relevant env vars before each test
        foreach (['APP_PORT', 'APP_DEBUG', 'APP_HOST', 'APP_RATE', 'APP_TAGS', 'APP_MODE', 'APP_SECRET'] as $key) {
            putenv($key);
            unset($_ENV[$key]);
        }
    }

    protected function tearDown(): void
    {
        $this->setUp(); // reuse cleanup
    }

    public function testStringType(): void
    {
        putenv('APP_HOST=localhost');

        $result = TypedConfig::create([
            'APP_HOST' => ['type' => 'string'],
        ]);

        $this->assertSame('localhost', $result['APP_HOST']);
    }

    public function testIntegerType(): void
    {
        putenv('APP_PORT=8080');

        $result = TypedConfig::create([
            'APP_PORT' => ['type' => 'integer'],
        ]);

        $this->assertSame(8080, $result['APP_PORT']);
    }

    public function testFloatType(): void
    {
        putenv('APP_RATE=3.14');

        $result = TypedConfig::create([
            'APP_RATE' => ['type' => 'float'],
        ]);

        $this->assertSame(3.14, $result['APP_RATE']);
    }

    public function testBooleanTrueValues(): void
    {
        foreach (['true', 'yes', '1', 'on'] as $val) {
            putenv("APP_DEBUG={$val}");

            $result = TypedConfig::create([
                'APP_DEBUG' => ['type' => 'boolean'],
            ]);

            $this->assertTrue($result['APP_DEBUG'], "Expected true for '{$val}'");
        }
    }

    public function testBooleanFalseValues(): void
    {
        foreach (['false', 'no', '0', 'off'] as $val) {
            putenv("APP_DEBUG={$val}");

            $result = TypedConfig::create([
                'APP_DEBUG' => ['type' => 'boolean'],
            ]);

            $this->assertFalse($result['APP_DEBUG'], "Expected false for '{$val}'");
        }
    }

    public function testArrayType(): void
    {
        putenv('APP_TAGS=a,b,c');

        $result = TypedConfig::create([
            'APP_TAGS' => ['type' => 'array'],
        ]);

        $this->assertSame(['a', 'b', 'c'], $result['APP_TAGS']);
    }

    public function testDefaultValue(): void
    {
        $result = TypedConfig::create([
            'APP_HOST' => ['type' => 'string', 'default' => '127.0.0.1'],
        ]);

        $this->assertSame('127.0.0.1', $result['APP_HOST']);
    }

    public function testRequiredMissing(): void
    {
        $this->expectException(DotlyteException::class);
        $this->expectExceptionMessageMatches('/Required.*APP_HOST/');

        TypedConfig::create([
            'APP_HOST' => ['type' => 'string', 'required' => true],
        ]);
    }

    public function testSkipValidation(): void
    {
        // Required but missing — should NOT throw when skipValidation=true
        $result = TypedConfig::create(
            ['APP_HOST' => ['type' => 'string', 'required' => true]],
            skipValidation: true,
        );

        $this->assertNull($result['APP_HOST']);
    }

    public function testEnumValid(): void
    {
        putenv('APP_MODE=production');

        $result = TypedConfig::create([
            'APP_MODE' => ['type' => 'string', 'enum' => ['development', 'production', 'test']],
        ]);

        $this->assertSame('production', $result['APP_MODE']);
    }

    public function testEnumInvalid(): void
    {
        putenv('APP_MODE=staging');

        $this->expectException(DotlyteException::class);
        $this->expectExceptionMessageMatches('/not in allowed/');

        TypedConfig::create([
            'APP_MODE' => ['type' => 'string', 'enum' => ['development', 'production']],
        ]);
    }

    public function testMinMax(): void
    {
        putenv('APP_PORT=80');

        $result = TypedConfig::create([
            'APP_PORT' => ['type' => 'integer', 'min' => 1, 'max' => 65535],
        ]);

        $this->assertSame(80, $result['APP_PORT']);
    }

    public function testMinViolation(): void
    {
        putenv('APP_PORT=0');

        $this->expectException(DotlyteException::class);
        $this->expectExceptionMessageMatches('/less than minimum/');

        TypedConfig::create([
            'APP_PORT' => ['type' => 'integer', 'min' => 1],
        ]);
    }

    public function testMaxViolation(): void
    {
        putenv('APP_PORT=99999');

        $this->expectException(DotlyteException::class);
        $this->expectExceptionMessageMatches('/greater than maximum/');

        TypedConfig::create([
            'APP_PORT' => ['type' => 'integer', 'max' => 65535],
        ]);
    }

    public function testSensitiveCallback(): void
    {
        putenv('APP_SECRET=mysecret');

        $accessed = [];
        $result = TypedConfig::create(
            ['APP_SECRET' => ['type' => 'string', 'sensitive' => true]],
            onSecretAccess: function (string $key, mixed $value) use (&$accessed) {
                $accessed[] = $key;
            },
        );

        $this->assertSame('mysecret', $result['APP_SECRET']);
        $this->assertContains('APP_SECRET', $accessed);
    }

    public function testReadsFromSuperglobal(): void
    {
        $_ENV['APP_HOST'] = 'from-env';

        $result = TypedConfig::create([
            'APP_HOST' => ['type' => 'string'],
        ]);

        $this->assertSame('from-env', $result['APP_HOST']);
    }

    public function testMissingOptionalIsNull(): void
    {
        $result = TypedConfig::create([
            'APP_HOST' => ['type' => 'string'],
        ]);

        $this->assertNull($result['APP_HOST']);
    }
}
