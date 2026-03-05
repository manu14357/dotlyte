<?php

declare(strict_types=1);

namespace Dotlyte\Tests;

use Dotlyte\Encryption;
use Dotlyte\DotlyteException;
use PHPUnit\Framework\TestCase;

final class EnhancedEncryptionTest extends TestCase
{
    public function testRotateKeys(): void
    {
        $oldKey = Encryption::generateKey();
        $newKey = Encryption::generateKey();

        $data = [
            'host' => 'localhost',
            'password' => Encryption::encryptValue('s3cret', $oldKey),
            'nested' => [
                'token' => Encryption::encryptValue('tok123', $oldKey),
            ],
        ];

        $rotated = Encryption::rotateKeys($data, $oldKey, $newKey);

        // Plain values unchanged
        $this->assertSame('localhost', $rotated['host']);

        // Encrypted values are still encrypted but with new key
        $this->assertTrue(Encryption::isEncrypted($rotated['password']));
        $this->assertTrue(Encryption::isEncrypted($rotated['nested']['token']));

        // Can decrypt with new key
        $this->assertSame('s3cret', Encryption::decryptValue($rotated['password'], $newKey));
        $this->assertSame('tok123', Encryption::decryptValue($rotated['nested']['token'], $newKey));
    }

    public function testResolveKeyWithFallbackFindsCorrectKey(): void
    {
        $key1 = Encryption::generateKey();
        $key2 = Encryption::generateKey();
        $key3 = Encryption::generateKey();

        $encrypted = Encryption::encryptValue('hello', $key2);

        $found = Encryption::resolveKeyWithFallback([$key1, $key2, $key3], $encrypted);
        $this->assertSame($key2, $found);
    }

    public function testResolveKeyWithFallbackReturnsNullOnMiss(): void
    {
        $key1 = Encryption::generateKey();
        $key2 = Encryption::generateKey();
        $encrypted = Encryption::encryptValue('hello', Encryption::generateKey());

        $found = Encryption::resolveKeyWithFallback([$key1, $key2], $encrypted);
        $this->assertNull($found);
    }

    public function testEncryptVaultAll(): void
    {
        $key = Encryption::generateKey();
        $data = [
            'host' => 'localhost',
            'port' => 5432,
            'password' => 'secret',
        ];

        $vault = Encryption::encryptVault($data, $key);

        // Strings should be encrypted
        $this->assertTrue(Encryption::isEncrypted($vault['host']));
        $this->assertTrue(Encryption::isEncrypted($vault['password']));

        // Non-string values pass through
        $this->assertSame(5432, $vault['port']);

        // Round-trip via decryptVault
        $decrypted = Encryption::decryptVault($vault, $key);
        $this->assertSame('localhost', $decrypted['host']);
        $this->assertSame('secret', $decrypted['password']);
        $this->assertSame(5432, $decrypted['port']);
    }

    public function testEncryptVaultSelectiveKeys(): void
    {
        $key = Encryption::generateKey();
        $data = [
            'host' => 'localhost',
            'password' => 'secret',
            'db' => ['token' => 'tok123'],
        ];

        $vault = Encryption::encryptVault($data, $key, ['password', 'db.token']);

        // Only specified keys are encrypted
        $this->assertSame('localhost', $vault['host']);
        $this->assertTrue(Encryption::isEncrypted($vault['password']));
        $this->assertTrue(Encryption::isEncrypted($vault['db']['token']));

        // Decrypt and verify
        $decrypted = Encryption::decryptVault($vault, $key);
        $this->assertSame('secret', $decrypted['password']);
        $this->assertSame('tok123', $decrypted['db']['token']);
    }

    public function testDecryptVaultAlias(): void
    {
        $key = Encryption::generateKey();
        $data = ['secret' => Encryption::encryptValue('abc', $key)];

        $result = Encryption::decryptVault($data, $key);
        $this->assertSame('abc', $result['secret']);
    }

    public function testRotateKeysPreservesNonEncrypted(): void
    {
        $oldKey = Encryption::generateKey();
        $newKey = Encryption::generateKey();

        $data = [
            'plain' => 'hello',
            'number' => 42,
            'flag' => true,
        ];

        $rotated = Encryption::rotateKeys($data, $oldKey, $newKey);

        $this->assertSame('hello', $rotated['plain']);
        $this->assertSame(42, $rotated['number']);
        $this->assertTrue($rotated['flag']);
    }
}
