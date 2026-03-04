package dev.dotlyte;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for v2 AES-256-GCM encryption.
 */
class EncryptionTest {

    @Test
    void generateKeyLength() {
        String key = Encryption.generateKey();
        assertNotNull(key);
        assertEquals(64, key.length()); // 32 bytes = 64 hex chars
    }

    @Test
    void encryptDecryptRoundTrip() {
        String key = Encryption.generateKey();
        String plaintext = "super-secret-password";

        String encrypted = Encryption.encryptValue(plaintext, key);
        assertTrue(Encryption.isEncrypted(encrypted));
        assertTrue(encrypted.startsWith("ENC[aes-256-gcm,"));

        String decrypted = Encryption.decryptValue(encrypted, key);
        assertEquals(plaintext, decrypted);
    }

    @Test
    void isEncryptedCheck() {
        assertTrue(Encryption.isEncrypted("ENC[aes-256-gcm,iv:abc,data:def,tag:ghi]"));
        assertFalse(Encryption.isEncrypted("plain-text"));
        assertFalse(Encryption.isEncrypted(null));
        assertFalse(Encryption.isEncrypted("ENC[incomplete"));
    }

    @Test
    void wrongKeyFails() {
        String key1 = Encryption.generateKey();
        String key2 = Encryption.generateKey();

        String encrypted = Encryption.encryptValue("secret", key1);
        assertThrows(DotlyteException.class, () ->
                Encryption.decryptValue(encrypted, key2));
    }

    @Test
    void emptyStringEncryption() {
        String key = Encryption.generateKey();
        String encrypted = Encryption.encryptValue("", key);
        String decrypted = Encryption.decryptValue(encrypted, key);
        assertEquals("", decrypted);
    }

    @Test
    void unicodeEncryption() {
        String key = Encryption.generateKey();
        String plaintext = "日本語テスト 🔐";
        String encrypted = Encryption.encryptValue(plaintext, key);
        String decrypted = Encryption.decryptValue(encrypted, key);
        assertEquals(plaintext, decrypted);
    }
}
