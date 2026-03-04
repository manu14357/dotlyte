<?php

declare(strict_types=1);

namespace Dotlyte;

/**
 * AES-256-GCM encryption/decryption for DOTLYTE v2 (SOPS-style).
 *
 * Format: ENC[aes-256-gcm,iv:<base64>,data:<base64>,tag:<base64>]
 */
final class Encryption
{
    private const PREFIX = 'ENC[';
    private const CIPHER = 'aes-256-gcm';
    private const IV_BYTES = 12;
    private const KEY_BYTES = 32;
    private const TAG_BYTES = 16;

    /**
     * Check whether a value is an encrypted SOPS-style string.
     */
    public static function isEncrypted(mixed $value): bool
    {
        return is_string($value)
            && str_starts_with($value, self::PREFIX)
            && str_ends_with($value, ']');
    }

    /**
     * Generate a random 32-byte key as hex string.
     */
    public static function generateKey(): string
    {
        return bin2hex(random_bytes(self::KEY_BYTES));
    }

    /**
     * Encrypt a plaintext string with a hex-encoded 256-bit key.
     *
     * @throws DotlyteException
     */
    public static function encryptValue(string $plaintext, string $keyHex): string
    {
        $keyBytes = hex2bin($keyHex);
        if ($keyBytes === false || strlen($keyBytes) !== self::KEY_BYTES) {
            throw new DotlyteException('Key must be 32 bytes');
        }

        $iv = random_bytes(self::IV_BYTES);
        $tag = '';
        $ciphertext = openssl_encrypt(
            $plaintext,
            self::CIPHER,
            $keyBytes,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            '',
            self::TAG_BYTES
        );

        if ($ciphertext === false) {
            throw new DotlyteException('Encryption failed: ' . openssl_error_string());
        }

        $ivB64 = base64_encode($iv);
        $dataB64 = base64_encode($ciphertext);
        $tagB64 = base64_encode($tag);

        return "ENC[aes-256-gcm,iv:{$ivB64},data:{$dataB64},tag:{$tagB64}]";
    }

    /**
     * Decrypt a SOPS-style encrypted value.
     *
     * @throws DotlyteException
     */
    public static function decryptValue(string $encrypted, string $keyHex): string
    {
        $keyBytes = hex2bin($keyHex);
        if ($keyBytes === false || strlen($keyBytes) !== self::KEY_BYTES) {
            throw new DotlyteException('Key must be 32 bytes');
        }

        $inner = $encrypted;
        if (str_starts_with($inner, 'ENC[') && str_ends_with($inner, ']')) {
            $inner = substr($inner, 4, -1);
        }

        $parts = [];
        foreach (explode(',', $inner) as $part) {
            $part = trim($part);
            if (str_starts_with($part, 'iv:')) {
                $parts['iv'] = substr($part, 3);
            } elseif (str_starts_with($part, 'data:')) {
                $parts['data'] = substr($part, 5);
            } elseif (str_starts_with($part, 'tag:')) {
                $parts['tag'] = substr($part, 4);
            }
        }

        $iv = base64_decode($parts['iv'] ?? '', true);
        $data = base64_decode($parts['data'] ?? '', true);
        $tag = base64_decode($parts['tag'] ?? '', true);

        if ($iv === false || $data === false || $tag === false) {
            throw new DotlyteException('Decryption failed: invalid base64 encoding');
        }

        $plaintext = openssl_decrypt(
            $data,
            self::CIPHER,
            $keyBytes,
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );

        if ($plaintext === false) {
            throw new DecryptionException('Decryption failed: ' . (openssl_error_string() ?: 'invalid key or corrupted data'));
        }

        return $plaintext;
    }

    /**
     * Decrypt all ENC[...] values in an array (recursive).
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function decryptArray(array $data, string $keyHex): array
    {
        $result = [];
        foreach ($data as $k => $v) {
            if (is_array($v)) {
                $result[$k] = self::decryptArray($v, $keyHex);
            } elseif (self::isEncrypted($v)) {
                $result[$k] = self::decryptValue($v, $keyHex);
            } else {
                $result[$k] = $v;
            }
        }
        return $result;
    }

    /**
     * Resolve encryption key from environment / key file.
     */
    public static function resolveEncryptionKey(?string $envName = null): ?string
    {
        if ($envName !== null && $envName !== '') {
            $val = getenv('DOTLYTE_KEY_' . strtoupper($envName));
            if ($val !== false && $val !== '') {
                return $val;
            }
        }

        $val = getenv('DOTLYTE_KEY');
        if ($val !== false && $val !== '') {
            return $val;
        }

        $keyFile = '.dotlyte-keys';
        if (file_exists($keyFile)) {
            $lines = file($keyFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if ($lines !== false && !empty($lines)) {
                $line = trim($lines[0]);
                return $line !== '' ? $line : null;
            }
        }

        return null;
    }
}
