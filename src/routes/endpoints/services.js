import { endpoints } from '../../db/schema/endpoints.js';
import { generateWebhookSecret, encryptSecret } from '../../utils/crypto.js';
import { eq, and, sql } from 'drizzle-orm';
import { NotFoundError } from '../../errors/classes.js';

export async function createEndpointService(db, label, url, consumerId) {

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
        createdAt: endpoints.createdAt,
        updatedAt: endpoints.updatedAt
    });

    return { newEndpoint, plainTextSecret };
}

export async function getConsumerEndpointsService(db, consumerId, limit, offset) {
    // Execute both the data query and the count query in parallel for max performance
    const [consumerEndpoints, [{ total }]] = await Promise.all([
        db.select({
            id: endpoints.id,
            label: endpoints.label,
            url: endpoints.url,
            consumerId: endpoints.consumerId,
            isActive: endpoints.isActive,
            createdAt: endpoints.createdAt,
            updatedAt: endpoints.updatedAt
        })
        .from(endpoints)
        .where(eq(endpoints.consumerId, consumerId))
        .orderBy(endpoints.createdAt)
        .limit(limit)
        .offset(offset),
        
        db.select({ total: sql`count(*)`.mapWith(Number) })
          .from(endpoints)
          .where(eq(endpoints.consumerId, consumerId))
    ]);

    return { data: consumerEndpoints, total };
}

export async function updateEndpointService(db, id, consumerId, updateData) {
    // Explicitly whitelist fields to prevent Mass Assignment vulnerabilities.
    // Even though AJV schemas strip unknown fields, this guarantees that malicious
    // keys (like `consumerId` or `signingKey`) can never be injected into the DB update.
    const safeUpdateData = {};
    if (updateData.label !== undefined) safeUpdateData.label = updateData.label;
    if (updateData.url !== undefined) safeUpdateData.url = updateData.url;
    if (updateData.isActive !== undefined) safeUpdateData.isActive = updateData.isActive;
    
    // Always update the timestamp when modifying the record
    safeUpdateData.updatedAt = new Date();

    const [updatedEndpoint] = await db.update(endpoints)
        .set(safeUpdateData)
        .where(
            and(
                eq(endpoints.id, id),
                eq(endpoints.consumerId, consumerId) // Ensure they actually own this endpoint!
            )
        )
        .returning({
            id: endpoints.id,
            label: endpoints.label,
            url: endpoints.url,
            consumerId: endpoints.consumerId,
            isActive: endpoints.isActive,
            createdAt: endpoints.createdAt,
            updatedAt: endpoints.updatedAt
        });

    if (!updatedEndpoint) {
        throw new NotFoundError('Endpoint not found or you do not have permission to modify it.');
    }

    return updatedEndpoint;
}
