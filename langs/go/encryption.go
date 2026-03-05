package dotlyte

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/crypto/scrypt"
)

const (
	encPrefix = "ENC[aes-256-gcm,"
	encSuffix = "]"
)

// GenerateKey generates a new random 256-bit encryption key as a hex string.
func GenerateKey() (string, error) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return "", fmt.Errorf("dotlyte: failed to generate key: %w", err)
	}
	return fmt.Sprintf("%x", key), nil
}

// EncryptValue encrypts a plaintext string using AES-256-GCM.
// Returns SOPS-style format: ENC[aes-256-gcm,iv:...,data:...,tag:...]
func EncryptValue(plaintext, keyStr string) (string, error) {
	key, err := deriveKey(keyStr)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", &DecryptionError{
			DotlyteError: DotlyteError{
				Message: fmt.Sprintf("failed to create cipher: %v", err),
				Code:    "ENCRYPTION_FAILED",
			},
		}
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", &DecryptionError{
			DotlyteError: DotlyteError{
				Message: fmt.Sprintf("failed to create GCM: %v", err),
				Code:    "ENCRYPTION_FAILED",
			},
		}
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", &DecryptionError{
			DotlyteError: DotlyteError{
				Message: fmt.Sprintf("failed to generate nonce: %v", err),
				Code:    "ENCRYPTION_FAILED",
			},
		}
	}

	ciphertext := gcm.Seal(nil, nonce, []byte(plaintext), nil)

	// Split ciphertext and tag (last 16 bytes)
	tag := ciphertext[len(ciphertext)-gcm.Overhead():]
	data := ciphertext[:len(ciphertext)-gcm.Overhead()]

	return fmt.Sprintf("%siv:%s,data:%s,tag:%s%s",
		encPrefix,
		base64.StdEncoding.EncodeToString(nonce),
		base64.StdEncoding.EncodeToString(data),
		base64.StdEncoding.EncodeToString(tag),
		encSuffix,
	), nil
}

// DecryptValue decrypts a SOPS-style encrypted value.
func DecryptValue(encrypted, keyStr string) (string, error) {
	if !IsEncrypted(encrypted) {
		return encrypted, nil
	}

	key, err := deriveKey(keyStr)
	if err != nil {
		return "", err
	}

	// Parse the ENC[...] format
	inner := encrypted[len(encPrefix) : len(encrypted)-len(encSuffix)]
	parts := make(map[string]string)
	for _, segment := range strings.Split(inner, ",") {
		kv := strings.SplitN(segment, ":", 2)
		if len(kv) == 2 {
			parts[kv[0]] = kv[1]
		}
	}

	ivB64, ok := parts["iv"]
	if !ok {
		return "", &DecryptionError{DotlyteError: DotlyteError{Message: "missing iv", Code: "DECRYPTION_FAILED"}}
	}
	dataB64, ok := parts["data"]
	if !ok {
		return "", &DecryptionError{DotlyteError: DotlyteError{Message: "missing data", Code: "DECRYPTION_FAILED"}}
	}
	tagB64, ok := parts["tag"]
	if !ok {
		return "", &DecryptionError{DotlyteError: DotlyteError{Message: "missing tag", Code: "DECRYPTION_FAILED"}}
	}

	nonce, err := base64.StdEncoding.DecodeString(ivB64)
	if err != nil {
		return "", &DecryptionError{DotlyteError: DotlyteError{Message: "invalid iv encoding", Code: "DECRYPTION_FAILED"}}
	}
	data, err := base64.StdEncoding.DecodeString(dataB64)
	if err != nil {
		return "", &DecryptionError{DotlyteError: DotlyteError{Message: "invalid data encoding", Code: "DECRYPTION_FAILED"}}
	}
	tag, err := base64.StdEncoding.DecodeString(tagB64)
	if err != nil {
		return "", &DecryptionError{DotlyteError: DotlyteError{Message: "invalid tag encoding", Code: "DECRYPTION_FAILED"}}
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", &DecryptionError{DotlyteError: DotlyteError{Message: fmt.Sprintf("cipher error: %v", err), Code: "DECRYPTION_FAILED"}}
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", &DecryptionError{DotlyteError: DotlyteError{Message: fmt.Sprintf("GCM error: %v", err), Code: "DECRYPTION_FAILED"}}
	}

	// Append tag to data (Go's GCM expects data+tag)
	ciphertext := append(data, tag...)
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", &DecryptionError{DotlyteError: DotlyteError{
			Message: "decryption failed — wrong key or corrupted data",
			Code:    "DECRYPTION_FAILED",
		}}
	}

	return string(plaintext), nil
}

// IsEncrypted checks if a value uses the SOPS-style ENC[...] format.
func IsEncrypted(value string) bool {
	return strings.HasPrefix(value, encPrefix) && strings.HasSuffix(value, encSuffix)
}

// DecryptMap decrypts all encrypted values in a map recursively.
func DecryptMap(data map[string]any, keyStr string) (map[string]any, error) {
	result := make(map[string]any, len(data))
	for k, v := range data {
		switch val := v.(type) {
		case string:
			if IsEncrypted(val) {
				decrypted, err := DecryptValue(val, keyStr)
				if err != nil {
					return nil, err
				}
				result[k] = decrypted
			} else {
				result[k] = val
			}
		case map[string]any:
			decrypted, err := DecryptMap(val, keyStr)
			if err != nil {
				return nil, err
			}
			result[k] = decrypted
		default:
			result[k] = val
		}
	}
	return result, nil
}

// ResolveEncryptionKey finds the encryption key from env vars or key files.
// Priority: DOTLYTE_KEY_{ENV} → DOTLYTE_KEY → .dotlyte-keys file.
func ResolveEncryptionKey(env string) string {
	if env != "" {
		if key := os.Getenv("DOTLYTE_KEY_" + strings.ToUpper(env)); key != "" {
			return key
		}
	}
	if key := os.Getenv("DOTLYTE_KEY"); key != "" {
		return key
	}

	// Try .dotlyte-keys file
	for _, name := range []string{".dotlyte-keys", ".dotlyte-key"} {
		if content, err := os.ReadFile(name); err == nil {
			return strings.TrimSpace(string(content))
		}
		// Try home directory
		if home, err := os.UserHomeDir(); err == nil {
			if content, err := os.ReadFile(filepath.Join(home, name)); err == nil {
				return strings.TrimSpace(string(content))
			}
		}
	}

	return ""
}

func deriveKey(keyStr string) ([]byte, error) {
	if keyStr == "" {
		return nil, &DecryptionError{
			DotlyteError: DotlyteError{
				Message: "no encryption key provided. Set DOTLYTE_KEY environment variable or create a .dotlyte-keys file",
				Code:    "NO_ENCRYPTION_KEY",
			},
		}
	}

	// If key is exactly 32 bytes hex (64 chars), use directly
	if len(keyStr) == 64 {
		key := make([]byte, 32)
		for i := 0; i < 32; i++ {
			_, err := fmt.Sscanf(keyStr[i*2:i*2+2], "%02x", &key[i])
			if err == nil {
				continue
			}
			break
		}
		// Verify all 32 bytes were parsed
		nonZero := false
		for _, b := range key {
			if b != 0 {
				nonZero = true
				break
			}
		}
		if nonZero {
			return key, nil
		}
	}

	// Derive key using scrypt
	salt := sha256.Sum256([]byte("dotlyte-v2"))
	derived, err := scrypt.Key([]byte(keyStr), salt[:], 32768, 8, 1, 32)
	if err != nil {
		return nil, &DecryptionError{
			DotlyteError: DotlyteError{
				Message: fmt.Sprintf("key derivation failed: %v", err),
				Code:    "KEY_DERIVATION_FAILED",
			},
		}
	}
	return derived, nil
}

// RotateKeys re-encrypts all values in a map from an old key to a new key.
// Both oldKey and newKey are raw key bytes (32 bytes for AES-256).
// Returns a new map with all values re-encrypted under the new key.
func RotateKeys(data map[string]string, oldKey, newKey []byte) (map[string]string, error) {
	result := make(map[string]string, len(data))
	for k, v := range data {
		if !IsEncrypted(v) {
			result[k] = v
			continue
		}
		// Decrypt with old key
		plaintext, err := decryptValueRaw(v, oldKey)
		if err != nil {
			return nil, &DecryptionError{
				DotlyteError: DotlyteError{
					Message: fmt.Sprintf("failed to rotate key for '%s': incorrect old key or corrupted data", k),
					Code:    "KEY_ROTATION_FAILED",
				},
			}
		}
		// Re-encrypt with new key
		encrypted, err := encryptValueRaw(plaintext, newKey)
		if err != nil {
			return nil, err
		}
		result[k] = encrypted
	}
	return result, nil
}

// ResolveKeyWithFallback tries multiple encryption keys against an encrypted
// value and returns the first key that successfully decrypts it.
// Useful during key rotation periods when both old and new keys may be in use.
func ResolveKeyWithFallback(keys [][]byte, encryptedValue string) ([]byte, error) {
	if !IsEncrypted(encryptedValue) {
		return nil, &DecryptionError{
			DotlyteError: DotlyteError{
				Message: "value is not encrypted",
				Code:    "NOT_ENCRYPTED",
			},
		}
	}
	for _, key := range keys {
		_, err := decryptValueRaw(encryptedValue, key)
		if err == nil {
			return key, nil
		}
	}
	return nil, &DecryptionError{
		DotlyteError: DotlyteError{
			Message: "none of the provided keys could decrypt the value",
			Code:    "DECRYPTION_FAILED",
		},
	}
}

// EncryptVault encrypts a data map into a vault format. Only keys listed in
// sensitiveKeys are encrypted; all others are stored as plaintext strings.
// Returns a flat map of key → encrypted/plaintext string values.
func EncryptVault(data map[string]interface{}, key []byte, sensitiveKeys map[string]bool) (map[string]string, error) {
	result := make(map[string]string, len(data))
	for k, v := range data {
		strVal := fmt.Sprintf("%v", v)
		if sensitiveKeys[k] {
			encrypted, err := encryptValueRaw(strVal, key)
			if err != nil {
				return nil, fmt.Errorf("dotlyte: failed to encrypt vault key '%s': %w", k, err)
			}
			result[k] = encrypted
		} else {
			result[k] = strVal
		}
	}
	return result, nil
}

// DecryptVault decrypts a vault map, decrypting all ENC[...] values.
// Non-encrypted values pass through unchanged.
func DecryptVault(data map[string]string, key []byte) (map[string]interface{}, error) {
	result := make(map[string]interface{}, len(data))
	for k, v := range data {
		if IsEncrypted(v) {
			decrypted, err := decryptValueRaw(v, key)
			if err != nil {
				return nil, &DecryptionError{
					DotlyteError: DotlyteError{
						Message: fmt.Sprintf("failed to decrypt vault key '%s': wrong key or corrupted data", k),
						Code:    "DECRYPTION_FAILED",
					},
				}
			}
			result[k] = Coerce(decrypted)
		} else {
			result[k] = v
		}
	}
	return result, nil
}

// encryptValueRaw encrypts plaintext using a raw 32-byte AES key.
func encryptValueRaw(plaintext string, key []byte) (string, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", &DecryptionError{
			DotlyteError: DotlyteError{
				Message: fmt.Sprintf("failed to create cipher: %v", err),
				Code:    "ENCRYPTION_FAILED",
			},
		}
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", &DecryptionError{
			DotlyteError: DotlyteError{
				Message: fmt.Sprintf("failed to create GCM: %v", err),
				Code:    "ENCRYPTION_FAILED",
			},
		}
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", &DecryptionError{
			DotlyteError: DotlyteError{
				Message: fmt.Sprintf("failed to generate nonce: %v", err),
				Code:    "ENCRYPTION_FAILED",
			},
		}
	}
	ciphertext := gcm.Seal(nil, nonce, []byte(plaintext), nil)
	tag := ciphertext[len(ciphertext)-gcm.Overhead():]
	data := ciphertext[:len(ciphertext)-gcm.Overhead()]

	return fmt.Sprintf("%siv:%s,data:%s,tag:%s%s",
		encPrefix,
		base64.StdEncoding.EncodeToString(nonce),
		base64.StdEncoding.EncodeToString(data),
		base64.StdEncoding.EncodeToString(tag),
		encSuffix,
	), nil
}

// decryptValueRaw decrypts using a raw 32-byte AES key.
func decryptValueRaw(encrypted string, key []byte) (string, error) {
	if !IsEncrypted(encrypted) {
		return encrypted, nil
	}

	inner := encrypted[len(encPrefix) : len(encrypted)-len(encSuffix)]
	parts := make(map[string]string)
	for _, segment := range strings.Split(inner, ",") {
		kv := strings.SplitN(segment, ":", 2)
		if len(kv) == 2 {
			parts[kv[0]] = kv[1]
		}
	}

	ivB64, ok := parts["iv"]
	if !ok {
		return "", &DecryptionError{DotlyteError: DotlyteError{Message: "missing iv", Code: "DECRYPTION_FAILED"}}
	}
	dataB64, ok := parts["data"]
	if !ok {
		return "", &DecryptionError{DotlyteError: DotlyteError{Message: "missing data", Code: "DECRYPTION_FAILED"}}
	}
	tagB64, ok := parts["tag"]
	if !ok {
		return "", &DecryptionError{DotlyteError: DotlyteError{Message: "missing tag", Code: "DECRYPTION_FAILED"}}
	}

	nonce, err := base64.StdEncoding.DecodeString(ivB64)
	if err != nil {
		return "", &DecryptionError{DotlyteError: DotlyteError{Message: "invalid iv encoding", Code: "DECRYPTION_FAILED"}}
	}
	dataBytes, err := base64.StdEncoding.DecodeString(dataB64)
	if err != nil {
		return "", &DecryptionError{DotlyteError: DotlyteError{Message: "invalid data encoding", Code: "DECRYPTION_FAILED"}}
	}
	tag, err := base64.StdEncoding.DecodeString(tagB64)
	if err != nil {
		return "", &DecryptionError{DotlyteError: DotlyteError{Message: "invalid tag encoding", Code: "DECRYPTION_FAILED"}}
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", &DecryptionError{DotlyteError: DotlyteError{Message: fmt.Sprintf("cipher error: %v", err), Code: "DECRYPTION_FAILED"}}
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", &DecryptionError{DotlyteError: DotlyteError{Message: fmt.Sprintf("GCM error: %v", err), Code: "DECRYPTION_FAILED"}}
	}

	ciphertext := append(dataBytes, tag...)
	pt, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", &DecryptionError{DotlyteError: DotlyteError{
			Message: "decryption failed — wrong key or corrupted data",
			Code:    "DECRYPTION_FAILED",
		}}
	}
	return string(pt), nil
}
