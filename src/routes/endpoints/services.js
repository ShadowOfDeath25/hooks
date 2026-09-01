import { endpoints } from '../../db/schema/endpoints.js';
import { generateWebhookSecret, encryptSecret } from '../../utils/crypto.js';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';

export async function createEndpointService(label, url, consumerId) {
    // 1. Generate the plain text secret for the user
    const plainTextSecret = generateWebhookSecret();
    
    // 2. Encrypt the secret so we can safely store it in the database
    const encryptedBuffer = encryptSecret(plainTextSecret);
    
    // 3. Insert the record using Drizzle ORM
    // We use `.returning()` so we don't have to query the DB a second time to get the created row.
    const [newEndpoint] = await db.insert(endpoints).values({
        label,
        url,
        consumerId,
        signingKey: encryptedBuffer, // Store the bytea buffer, NOT the text!
        isActive: true
    }).returning({
        id: endpoints.id,
        label: endpoints.label,
        url: endpoints.url,
        consumerId: endpoints.consumerId,
        isActive: endpoints.isActive,
        createdAt: endpoints.createdAt
    });

    return { newEndpoint, plainTextSecret };
}

export async function getConsumerEndpointsService(consumerId, limit, offset) {
    // Using Drizzle's selection syntax to only pull the exact columns we need.
    const consumerEndpoints = await db.select({
        id: endpoints.id,
        label: endpoints.label,
        url: endpoints.url,
        consumerId: endpoints.consumerId,
        isActive: endpoints.isActive,
        createdAt: endpoints.createdAt
    })
    .from(endpoints)
    .where(eq(endpoints.consumerId, consumerId))
    .orderBy(endpoints.createdAt)
    .limit(limit)
    .offset(offset);

    return consumerEndpoints;
}
