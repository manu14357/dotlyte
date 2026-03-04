<?php

declare(strict_types=1);

namespace Dotlyte\Tests;

use Dotlyte\SchemaRule;
use Dotlyte\SchemaViolation;
use Dotlyte\ValidationException;
use Dotlyte\Validator;
use PHPUnit\Framework\TestCase;

final class ValidatorTest extends TestCase
{
    public function testValidData(): void
    {
        $schema = [
            'port' => new SchemaRule(type: 'integer', required: true),
            'host' => new SchemaRule(type: 'string', required: true),
        ];
        $data = ['port' => 8080, 'host' => 'localhost'];
        $violations = Validator::validate($data, $schema);
        $this->assertCount(0, $violations);
    }

    public function testMissingRequired(): void
    {
        $schema = [
            'port' => new SchemaRule(type: 'integer', required: true),
        ];
        $data = [];
        $violations = Validator::validate($data, $schema);
        $this->assertCount(1, $violations);
        $this->assertSame('port', $violations[0]->key);
        $this->assertStringContainsString('required', strtolower($violations[0]->message));
    }

    public function testTypeMismatch(): void
    {
        $schema = [
            'port' => new SchemaRule(type: 'integer'),
        ];
        $data = ['port' => 'not_a_number'];
        $violations = Validator::validate($data, $schema);
        $this->assertCount(1, $violations);
    }

    public function testEnumValidation(): void
    {
        $schema = [
            'env' => new SchemaRule(type: 'string', enumValues: ['dev', 'staging', 'prod']),
        ];
        $data = ['env' => 'dev'];
        $this->assertCount(0, Validator::validate($data, $schema));

        $data = ['env' => 'invalid'];
        $this->assertCount(1, Validator::validate($data, $schema));
    }

    public function testMinMax(): void
    {
        $schema = [
            'port' => new SchemaRule(type: 'integer', min: 1, max: 65535),
        ];
        $data = ['port' => 0];
        $this->assertCount(1, Validator::validate($data, $schema));

        $data = ['port' => 8080];
        $this->assertCount(0, Validator::validate($data, $schema));

        $data = ['port' => 99999];
        $this->assertCount(1, Validator::validate($data, $schema));
    }

    public function testPattern(): void
    {
        $schema = [
            'name' => new SchemaRule(type: 'string', pattern: '/^[a-z]+$/'),
        ];
        $data = ['name' => 'hello'];
        $this->assertCount(0, Validator::validate($data, $schema));

        $data = ['name' => 'Hello123'];
        $this->assertCount(1, Validator::validate($data, $schema));
    }

    public function testFormatEmail(): void
    {
        $schema = [
            'email' => new SchemaRule(type: 'string', format: 'email'),
        ];
        $data = ['email' => 'test@example.com'];
        $this->assertCount(0, Validator::validate($data, $schema));

        $data = ['email' => 'not-an-email'];
        $this->assertCount(1, Validator::validate($data, $schema));
    }

    public function testFormatUuid(): void
    {
        $schema = [
            'id' => new SchemaRule(type: 'string', format: 'uuid'),
        ];
        $data = ['id' => '550e8400-e29b-41d4-a716-446655440000'];
        $this->assertCount(0, Validator::validate($data, $schema));

        $data = ['id' => 'not-a-uuid'];
        $this->assertCount(1, Validator::validate($data, $schema));
    }

    public function testApplyDefaults(): void
    {
        $schema = [
            'port' => new SchemaRule(type: 'integer', defaultValue: 3000),
            'host' => new SchemaRule(type: 'string', defaultValue: 'localhost'),
        ];
        $data = ['port' => 8080];
        Validator::applyDefaults($data, $schema);
        $this->assertSame(8080, $data['port']);
        $this->assertSame('localhost', $data['host']);
    }

    public function testSensitiveKeys(): void
    {
        $schema = [
            'password' => new SchemaRule(type: 'string', sensitive: true),
            'host' => new SchemaRule(type: 'string'),
            'api_key' => new SchemaRule(type: 'string', sensitive: true),
        ];
        $sensitive = Validator::sensitiveKeys($schema);
        $this->assertContains('password', $sensitive);
        $this->assertContains('api_key', $sensitive);
        $this->assertNotContains('host', $sensitive);
    }

    public function testAssertValidThrows(): void
    {
        $schema = [
            'port' => new SchemaRule(type: 'integer', required: true),
        ];
        $this->expectException(ValidationException::class);
        Validator::assertValid([], $schema);
    }

    public function testStrictMode(): void
    {
        $schema = [
            'port' => new SchemaRule(type: 'integer'),
        ];
        $data = ['port' => 8080, 'extra' => 'not-in-schema'];

        // Non-strict: no error for extra keys
        $this->assertCount(0, Validator::validate($data, $schema));

        // Strict: error for extra keys
        $this->assertCount(1, Validator::validate($data, $schema, strict: true));
    }

    public function testNestedKeyValidation(): void
    {
        $schema = [
            'database.host' => new SchemaRule(type: 'string', required: true),
            'database.port' => new SchemaRule(type: 'integer', required: true),
        ];
        $data = ['database' => ['host' => 'localhost', 'port' => 5432]];
        $this->assertCount(0, Validator::validate($data, $schema));
    }
}
