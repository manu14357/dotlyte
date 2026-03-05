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

    // ── v0.1.2 additions ─────────────────────────────────────────

    /**
     * Re-encrypt all encrypted values in $data from $oldKey to $newKey.
     *
     * Non-encrypted values pass through unchanged.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     *
     * @throws DotlyteException
     */
    public static function rotateKeys(array $data, string $oldKey, string $newKey): array
    {
        $result = [];
        foreach ($data as $k => $v) {
            if (is_array($v)) {
                $result[$k] = self::rotateKeys($v, $oldKey, $newKey);
            } elseif (self::isEncrypted($v)) {
                $plain = self::decryptValue($v, $oldKey);
                $result[$k] = self::encryptValue($plain, $newKey);
            } else {
                $result[$k] = $v;
            }
        }
        return $result;
    }

    /**
     * Try multiple keys to decrypt a single value; return the first that works.
     *
     * @param list<string> $keys  Hex-encoded keys to try in order
     * @return string|null  The key that decrypted the value, or null
     */
    public static function resolveKeyWithFallback(array $keys, string $encryptedValue): ?string
    {
        foreach ($keys as $key) {
            try {
                self::decryptValue($encryptedValue, $key);
                return $key;
            } catch (\Throwable) {
                // Try the next key
            }
        }
        return null;
    }

    /**
     * Encrypt an entire associative array ("vault").
     *
     * If $sensitiveKeys is provided, only those keys are encrypted;
     * otherwise every leaf value is encrypted.
     *
     * @param array<string, mixed> $data
     * @param list<string>|null    $sensitiveKeys  Dot-notation keys to encrypt (null = all)
     * @return array<string, mixed>
     *
     * @throws DotlyteException
     */
    public static function encryptVault(array $data, string $key, ?array $sensitiveKeys = null): array
    {
        if ($sensitiveKeys === null) {
            return self::encryptArrayAll($data, $key);
        }

        $result = $data;
        foreach ($sensitiveKeys as $sk) {
            $val = self::getNested($result, $sk);
            if ($val !== null && is_string($val) && !self::isEncrypted($val)) {
                self::setNested($result, $sk, self::encryptValue($val, $key));
            }
        }
        return $result;
    }

    /**
     * Decrypt an entire vault (alias of decryptArray with a friendlier name).
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     *
     * @throws DotlyteException
     */
    public static function decryptVault(array $data, string $key): array
    {
        return self::decryptArray($data, $key);
    }

    // ── private helpers ──────────────────────────────────────────

    /**
     * Encrypt every leaf string in an array recursively.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private static function encryptArrayAll(array $data, string $keyHex): array
    {
        $result = [];
        foreach ($data as $k => $v) {
            if (is_array($v)) {
                $result[$k] = self::encryptArrayAll($v, $keyHex);
            } elseif (is_string($v)) {
                $result[$k] = self::encryptValue($v, $keyHex);
            } else {
                $result[$k] = $v;
            }
        }
        return $result;
    }

    /**
     * Get a nested value via dot-notation.
     *
     * @param array<string, mixed> $data
     */
    private static function getNested(array $data, string $key): mixed
    {
        $parts = explode('.', $key);
        $current = $data;
        foreach ($parts as $part) {
            if (!is_array($current) || !array_key_exists($part, $current)) {
                return null;
            }
            $current = $current[$part];
        }
        return $current;
    }

    /**
     * Set a nested value via dot-notation.
     *
     * @param array<string, mixed> $data
     */
    private static function setNested(array &$data, string $key, mixed $value): void
    {
        $parts = explode('.', $key);
        $current = &$data;
        for ($i = 0, $len = count($parts) - 1; $i < $len; $i++) {
            if (!isset($current[$parts[$i]]) || !is_array($current[$parts[$i]])) {
                $current[$parts[$i]] = [];
            }
            $current = &$current[$parts[$i]];
        }
        $current[$parts[count($parts) - 1]] = $value;
    }
}
