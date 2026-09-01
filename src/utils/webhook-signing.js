import crypto from 'node:crypto';

const KEY_VERSION_LENGTH = 1;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const MINIMUM_ENCRYPTED_SECRET_LENGTH =
    KEY_VERSION_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1;

function getEncryptionKey(version) {
    if (version !== 1) {
        throw new Error(`Encryption key version ${version} is not configured`);
    }

    const keyHex = process.env.ENCRYPTION_KEY_V1;

    if (!keyHex || !/^[a-fA-F0-9]{64}$/.test(keyHex)) {
        throw new Error('ENCRYPTION_KEY_V1 must be a 64-character hexadecimal value');
    }

    const keyBuffer = Buffer.from(keyHex, 'hex');

    try {
        return crypto.createSecretKey(keyBuffer);
    } finally {
        keyBuffer.fill(0);
    }
}

export function decryptSigningKey(encryptedSecret) {
    if (
        !Buffer.isBuffer(encryptedSecret) ||
        encryptedSecret.length < MINIMUM_ENCRYPTED_SECRET_LENGTH
    ) {
        throw new Error('The endpoint signing key is missing or invalid');
    }

    const version = encryptedSecret.readUInt8(0);
    const ivStart = KEY_VERSION_LENGTH;
    const authTagStart = ivStart + IV_LENGTH;
    const ciphertextStart = authTagStart + AUTH_TAG_LENGTH;

    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        getEncryptionKey(version),
        encryptedSecret.subarray(ivStart, authTagStart)
    );

    decipher.setAuthTag(
        encryptedSecret.subarray(authTagStart, ciphertextStart)
    );

    try {
        return Buffer.concat([
            decipher.update(encryptedSecret.subarray(ciphertextStart)),
            decipher.final()
        ]).toString('utf8');
    } catch {
        throw new Error('The endpoint signing key could not be decrypted');
    }
}

export function createWebhookSignature(secret, eventId, timestamp, body) {
    const signedContent = `${eventId}.${timestamp}.${body}`;
    const digest = crypto
        .createHmac('sha256', secret)
        .update(signedContent)
        .digest('base64');

    return `v1,${digest}`;
}
