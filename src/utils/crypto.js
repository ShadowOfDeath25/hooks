import crypto from 'crypto';
import 'dotenv/config';

// The version of the key we will use for all NEW encryptions.
const ACTIVE_KEY_VERSION = 1;

// Cache the keys so we don't re-read the .env file and re-allocate memory on every request.
let _cachedKeys = null;

const getEncryptionKeys = () => {
    if (_cachedKeys) return _cachedKeys;

    _cachedKeys = new Map();
    
    // In the future, if you add ENCRYPTION_KEY_V2, you just add it to this map!
    const keyV1Hex = process.env.ENCRYPTION_KEY_V1;
    
    if (!keyV1Hex) {
        throw new Error('CRITICAL: ENCRYPTION_KEY_V1 is missing in .env');
    }

    // Convert the 64-character hex string from .env into a 32-byte binary buffer.
    // This ensures true 256-bit entropy (unlike a human-typed password).
    const keyBuffer = Buffer.from(keyV1Hex, 'hex');
    
    if (keyBuffer.length !== 32) {
        throw new Error('CRITICAL: ENCRYPTION_KEY_V1 must be a 64-character hex string (32 bytes).');
    }

    // Convert to a SecretKeyObject. This stores the raw key material in OpenSSL's 
    // secure memory vault, keeping it hidden from the V8 JavaScript garbage collector/heap.
    _cachedKeys.set(1, crypto.createSecretKey(keyBuffer));
    
    // Zero out the temporary buffer from JS memory for extra safety
    keyBuffer.fill(0);

    return _cachedKeys;
};

/**
 * Generates a secure, random webhook secret for a new endpoint.
 * We use 32 bytes of randomness (the industry standard for HMAC-SHA256),
 * which becomes 64 characters when converted to hex.
 */
export const generateWebhookSecret = () => {
    const randomHex = crypto.randomBytes(32).toString('hex');
    return `_hs_${randomHex}`;
};

/**
 * Encrypts a plain-text webhook secret using modern AES-256-GCM.
 * Packs the data as: [Version (1) | IV (12) | AuthTag (16) | Ciphertext]
 * 
 * @param {string} plainTextSecret - The unencrypted `_hs_...` string
 * @returns {Buffer} - The packed binary data for the database
 */
export const encryptSecret = (plainTextSecret) => {
    const keys = getEncryptionKeys();
    const activeKey = keys.get(ACTIVE_KEY_VERSION);
    
    // 1-byte buffer to store the version number (e.g., the number 1)
    const versionBuffer = Buffer.alloc(1);
    versionBuffer.writeUInt8(ACTIVE_KEY_VERSION, 0);

    const iv = crypto.randomBytes(12);
    
    const cipher = crypto.createCipheriv('aes-256-gcm', activeKey, iv);
    
    const ciphertext = Buffer.concat([
        cipher.update(plainTextSecret, 'utf8'),
        cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag(); 
    
    return Buffer.concat([versionBuffer, iv, authTag, ciphertext]);
};

/**
 * Decrypts the binary `bytea` data from the database back into plain text.
 * 
 * @param {Buffer} encryptedBuffer - The raw binary data from Postgres
 * @returns {string} - The original `_hs_...` string
 */
export const decryptSecret = (encryptedBuffer) => {
    // Input Validation: Ensure we aren't trying to decrypt a corrupted or empty buffer
    if (!Buffer.isBuffer(encryptedBuffer) || encryptedBuffer.length < 30) {
        throw new Error('Invalid encrypted buffer: data is corrupted or too short.');
    }

    const keys = getEncryptionKeys();
    
    // Slice out the exact components
    const version = encryptedBuffer.readUInt8(0); // The very first byte is the version
    const iv = encryptedBuffer.subarray(1, 13);
    const authTag = encryptedBuffer.subarray(13, 29);
    const ciphertext = encryptedBuffer.subarray(29);
    
    const keyToUse = keys.get(version);
    if (!keyToUse) {
        throw new Error(`CRITICAL: Cannot decrypt. Key version ${version} is missing from the server.`);
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', keyToUse, iv);
    decipher.setAuthTag(authTag);
    
    try {
        const decrypted = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final()
        ]);
        return decrypted.toString('utf8');
    } catch (err) {
        throw new Error(
            `CRITICAL: Decryption failed for key version ${version}. Data may be corrupted or the wrong key is configured.`
        );
    }
};
