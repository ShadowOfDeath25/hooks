import crypto from 'node:crypto';
import 'dotenv/config'
import {db} from '../db/index.js'
import {apiKeys} from "../db/schema/apiKeys.js";
import {count} from "drizzle-orm";
import {ApiKeyLimitError} from "../errors/ApiLimitKeyError.js";


/**
 * Generates a new API key and its corresponding hash.
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

    const keyHash = crypto.createHash("sha256").update(fullKey).digest("base64url")

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