import crypto from 'node:crypto';
import 'dotenv/config'
import {db} from '../db/index.js'
import {apiKeys} from "../db/schema/apiKeys.js";
import {count, eq} from "drizzle-orm";
import {ApiKeyLimitError} from "../errors/ApiLimitKeyError.js";



/**
 * Generates a new API key and its corresponding hash.
 * @param label A string to be used as a label for the API key in the database
 * @returns {{ fullKey: string, keyHash: string }} An object containing the full API key and its hash.
 */
export const generateApiKey = async (label) => {
    const {API_KEY_PREFIX, MAX_API_KEYS} = process.env;
    const [{value: existingCount}] = await db
        .select({value: count()})
        .from(apiKeys)


    if (existingCount >= parseInt(MAX_API_KEYS)) {
        throw new ApiKeyLimitError(parseInt(MAX_API_KEYS));
    }
    const base = crypto.randomBytes(32).toString("base64url");
    let fullKey;

    if (API_KEY_PREFIX) {
        fullKey = `${API_KEY_PREFIX}_${base}`;
    } else {
        fullKey = base
    }

    const keyHash = hashApiKey(fullKey);

    try {
        await db.insert(apiKeys).values({hash: keyHash, label});
    } catch (e) {
        console.error(e);
    }

    return {
        fullKey,
        keyHash
    };
};


/**
 * Hashes API keys
 * @param key The API key to be hashed
 * @returns {string} The hash of the API key
 */
export const hashApiKey = (key) => {
    return crypto.createHash("sha256").update(key).digest("base64url");
}


/**
 * Validates an incoming API key by hashing it and checking it against the database.
 * @param {string} key - The raw API key from the request header.
 * @returns {Promise<boolean>} True if the key exists in the database, false otherwise.
 */
export const validateApiKey = async (key) => {
    if (!key) return false;

    const keyHash = hashApiKey(key);

    const result = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.hash, keyHash))
        .limit(1);

    return result.length > 0;
};
