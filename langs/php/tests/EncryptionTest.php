<?php

declare(strict_types=1);

namespace Dotlyte\Tests;

use Dotlyte\DecryptionException;
use Dotlyte\Encryption;
use PHPUnit\Framework\TestCase;

final class EncryptionTest extends TestCase
{
    public function testGenerateKey(): void
    {
        $key = Encryption::generateKey();
        $this->assertSame(64, strlen($key)); // 32 bytes = 64 hex chars
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $key);
    }

    public function testRoundTrip(): void
    {
        $key = Encryption::generateKey();
        $plaintext = 'super_secret_password';
        $encrypted = Encryption::encryptValue($plaintext, $key);

        $this->assertTrue(Encryption::isEncrypted($encrypted));
        $this->assertStringStartsWith('ENC[', $encrypted);

        $decrypted = Encryption::decryptValue($encrypted, $key);
        $this->assertSame($plaintext, $decrypted);
    }

    public function testDifferentCiphertext(): void
    {
        $key = Encryption::generateKey();
        $plaintext = 'hello';
        $e1 = Encryption::encryptValue($plaintext, $key);
        $e2 = Encryption::encryptValue($plaintext, $key);
        // Different IVs → different ciphertexts
        $this->assertNotSame($e1, $e2);
        // But both decrypt to the same value
        $this->assertSame($plaintext, Encryption::decryptValue($e1, $key));
        $this->assertSame($plaintext, Encryption::decryptValue($e2, $key));
    }

    public function testWrongKeyFails(): void
    {
        $key1 = Encryption::generateKey();
        $key2 = Encryption::generateKey();
        $encrypted = Encryption::encryptValue('secret', $key1);

        $this->expectException(DecryptionException::class);
        Encryption::decryptValue($encrypted, $key2);
    }

    public function testIsEncrypted(): void
    {
        $this->assertTrue(Encryption::isEncrypted('ENC[aes-256-gcm,iv:abc,data:xyz,tag:123]'));
        $this->assertFalse(Encryption::isEncrypted('plain text'));
        $this->assertFalse(Encryption::isEncrypted(42));
        $this->assertFalse(Encryption::isEncrypted(null));
    }

    public function testDecryptArray(): void
    {
        $key = Encryption::generateKey();
        $data = [
            'host' => 'localhost',
            'password' => Encryption::encryptValue('s3cret', $key),
            'nested' => [
                'token' => Encryption::encryptValue('tok123', $key),
            ],
        ];

        $result = Encryption::decryptArray($data, $key);
        $this->assertSame('localhost', $result['host']);
        $this->assertSame('s3cret', $result['password']);
        $this->assertSame('tok123', $result['nested']['token']);
    }
}
