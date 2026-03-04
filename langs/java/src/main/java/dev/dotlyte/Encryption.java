package dev.dotlyte;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;

/**
 * AES-256-GCM encryption/decryption for DOTLYTE v2 (SOPS-style).
 * <p>
 * Format: {@code ENC[aes-256-gcm,iv:<base64>,data:<base64>,tag:<base64>]}
 */
public final class Encryption {

    private static final String PREFIX = "ENC[";
    private static final int GCM_TAG_BITS = 128;
    private static final int IV_BYTES = 12;
    private static final int KEY_BYTES = 32;

    private Encryption() {}

    /** Check whether a string is an encrypted SOPS-style value. */
    public static boolean isEncrypted(String value) {
        return value != null && value.startsWith(PREFIX) && value.endsWith("]");
    }

    /** Generate a random 32-byte key as hex. */
    public static String generateKey() {
        byte[] key = new byte[KEY_BYTES];
        new SecureRandom().nextBytes(key);
        return bytesToHex(key);
    }

    /** Encrypt a plaintext string with a hex-encoded 256-bit key. */
    public static String encryptValue(String plaintext, String keyHex) {
        try {
            byte[] keyBytes = hexToBytes(keyHex);
            if (keyBytes.length != KEY_BYTES) {
                throw new DotlyteException("Key must be 32 bytes, got " + keyBytes.length);
            }

            byte[] iv = new byte[IV_BYTES];
            new SecureRandom().nextBytes(iv);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE,
                    new SecretKeySpec(keyBytes, "AES"),
                    new GCMParameterSpec(GCM_TAG_BITS, iv));

            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

            // ciphertext = encrypted data + 16-byte tag
            int dataLen = ciphertext.length - 16;
            byte[] data = new byte[dataLen];
            byte[] tag = new byte[16];
            System.arraycopy(ciphertext, 0, data, 0, dataLen);
            System.arraycopy(ciphertext, dataLen, tag, 0, 16);

            Base64.Encoder enc = Base64.getEncoder();
            return String.format("ENC[aes-256-gcm,iv:%s,data:%s,tag:%s]",
                    enc.encodeToString(iv),
                    enc.encodeToString(data),
                    enc.encodeToString(tag));
        } catch (DotlyteException e) {
            throw e;
        } catch (Exception e) {
            throw new DotlyteException("Encryption failed: " + e.getMessage(), e);
        }
    }

    /** Decrypt a SOPS-style encrypted value. */
    public static String decryptValue(String encrypted, String keyHex) {
        try {
            byte[] keyBytes = hexToBytes(keyHex);
            if (keyBytes.length != KEY_BYTES) {
                throw new DotlyteException("Key must be 32 bytes, got " + keyBytes.length);
            }

            String inner = encrypted;
            if (inner.startsWith("ENC[") && inner.endsWith("]")) {
                inner = inner.substring(4, inner.length() - 1);
            }

            String ivB64 = null, dataB64 = null, tagB64 = null;
            for (String part : inner.split(",")) {
                part = part.trim();
                if (part.startsWith("iv:")) ivB64 = part.substring(3);
                else if (part.startsWith("data:")) dataB64 = part.substring(5);
                else if (part.startsWith("tag:")) tagB64 = part.substring(4);
            }

            Base64.Decoder dec = Base64.getDecoder();
            byte[] iv = dec.decode(ivB64);
            byte[] data = dec.decode(dataB64);
            byte[] tag = dec.decode(tagB64);

            // Combine data + tag for GCM decryption
            byte[] combined = new byte[data.length + tag.length];
            System.arraycopy(data, 0, combined, 0, data.length);
            System.arraycopy(tag, 0, combined, data.length, tag.length);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE,
                    new SecretKeySpec(keyBytes, "AES"),
                    new GCMParameterSpec(GCM_TAG_BITS, iv));

            byte[] plaintext = cipher.doFinal(combined);
            return new String(plaintext, StandardCharsets.UTF_8);
        } catch (DotlyteException e) {
            throw e;
        } catch (Exception e) {
            throw new DotlyteException("Decryption failed: " + e.getMessage(), e);
        }
    }

    /** Decrypt all ENC[...] values in a map. */
    public static void decryptMap(Map<String, String> data, String keyHex) {
        for (Map.Entry<String, String> entry : data.entrySet()) {
            if (isEncrypted(entry.getValue())) {
                entry.setValue(decryptValue(entry.getValue(), keyHex));
            }
        }
    }

    /** Check if any value in the map is encrypted. */
    public static boolean hasEncryptedValues(Map<String, String> data) {
        return data.values().stream().anyMatch(Encryption::isEncrypted);
    }

    /**
     * Resolve encryption key from environment / key file.
     * <ol>
     * <li>DOTLYTE_KEY_{ENV}</li>
     * <li>DOTLYTE_KEY</li>
     * <li>.dotlyte-keys file</li>
     * </ol>
     */
    public static String resolveEncryptionKey(String envName) {
        if (envName != null && !envName.isEmpty()) {
            String envVar = System.getenv("DOTLYTE_KEY_" + envName.toUpperCase());
            if (envVar != null && !envVar.isEmpty()) return envVar;
        }
        String key = System.getenv("DOTLYTE_KEY");
        if (key != null && !key.isEmpty()) return key;

        try {
            Path keyFile = Path.of(".dotlyte-keys");
            if (Files.exists(keyFile)) {
                String content = Files.readString(keyFile).trim();
                String line = content.lines().findFirst().orElse("").trim();
                if (!line.isEmpty()) return line;
            }
        } catch (IOException ignored) {}

        return null;
    }

    // ── Hex util ────────────────────────────────────────────────

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    private static byte[] hexToBytes(String hex) {
        int len = hex.length();
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = (byte) ((Character.digit(hex.charAt(i), 16) << 4)
                    + Character.digit(hex.charAt(i + 1), 16));
        }
        return data;
    }
}
