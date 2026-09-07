import { endpoints } from '../../db/schema/endpoints.js';
import { deliveries } from '../../db/schema/deliveries.js';
import { attempts } from '../../db/schema/attempts.js';
import { generateWebhookSecret, encryptSecret } from '../../utils/crypto.js';
import { eq, and, sql, isNull, desc } from 'drizzle-orm';
import { NotFoundError } from '../../errors/NotFoundError.js';
import { ConflictError } from '../../errors/ConflictError.js';

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
        consecutiveFailures: endpoints.consecutiveFailures,
        createdAt: endpoints.createdAt,
        updatedAt: endpoints.updatedAt,
        deletedAt: endpoints.deletedAt
    });

    return { newEndpoint, plainTextSecret };
}

export async function getConsumerEndpointsService(db, consumerId, limit, offset, includeInactive = false, includeDeleted = false) {
    // Construct the where clause dynamically based on provided filters
    let filters = [];
    if (consumerId !== undefined) {
        filters.push(eq(endpoints.consumerId, consumerId));
    }
    if (!includeInactive) {
        filters.push(eq(endpoints.isActive, true));
    }
    if (!includeDeleted) {
        filters.push(isNull(endpoints.deletedAt));
    }
    const filterCondition = filters.length > 0 ? and(...filters) : undefined;

    // Execute both the data query and the count query in parallel for max performance
    const [consumerEndpoints, [{ total }]] = await Promise.all([
        db.select({
            id: endpoints.id,
            label: endpoints.label,
            url: endpoints.url,
            consumerId: endpoints.consumerId,
            isActive: endpoints.isActive,
            consecutiveFailures: endpoints.consecutiveFailures,
            createdAt: endpoints.createdAt,
            updatedAt: endpoints.updatedAt,
            deletedAt: endpoints.deletedAt
        })
        .from(endpoints)
        .where(filterCondition)
        .orderBy(endpoints.createdAt)
        .limit(limit)
        .offset(offset),
        
        db.select({ total: sql`count(*)`.mapWith(Number) })
          .from(endpoints)
          .where(filterCondition)
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
    if (updateData.isActive !== undefined) {
        safeUpdateData.isActive = updateData.isActive;
        if (updateData.isActive === true) {
            safeUpdateData.consecutiveFailures = 0;
        }
    }
    
    // Always update the timestamp when modifying the record
    safeUpdateData.updatedAt = new Date();

    const [updatedEndpoint] = await db.update(endpoints)
        .set(safeUpdateData)
        .where(
            and(
                eq(endpoints.id, id),
                eq(endpoints.consumerId, consumerId), // Ensure they actually own this endpoint!
                isNull(endpoints.deletedAt)
            )
        )
        .returning({
            id: endpoints.id,
            label: endpoints.label,
            url: endpoints.url,
            consumerId: endpoints.consumerId,
            isActive: endpoints.isActive,
            consecutiveFailures: endpoints.consecutiveFailures,
            createdAt: endpoints.createdAt,
            updatedAt: endpoints.updatedAt,
            deletedAt: endpoints.deletedAt
        });

    if (!updatedEndpoint) {
        throw new NotFoundError('Endpoint not found or you do not have permission to modify it.');
    }

    return updatedEndpoint;
}

export async function deleteEndpointService(db, id, consumerId) {
    // Perform a soft-delete by setting deletedAt and isActive to false
    const [deletedEndpoint] = await db.update(endpoints)
        .set({ 
            isActive: false, 
            deletedAt: new Date(),
            updatedAt: new Date() 
        })
        .where(
            and(
                eq(endpoints.id, id),
                eq(endpoints.consumerId, consumerId), // Ensure they own this endpoint!
                isNull(endpoints.deletedAt)
            )
        )
        .returning({
            id: endpoints.id,
            label: endpoints.label,
            url: endpoints.url,
            consumerId: endpoints.consumerId,
            isActive: endpoints.isActive,
            consecutiveFailures: endpoints.consecutiveFailures,
            createdAt: endpoints.createdAt,
            updatedAt: endpoints.updatedAt,
            deletedAt: endpoints.deletedAt
        });

    if (!deletedEndpoint) {
        throw new NotFoundError('Endpoint not found or you do not have permission to delete it.');
    }

    return deletedEndpoint;
}

export async function resetEndpointFailuresService(db, endpointId) {
    return db.update(endpoints)
        .set({ consecutiveFailures: 0 })
        .where(eq(endpoints.id, endpointId));
}

export async function incrementEndpointFailuresService(db, endpointId) {
    const [updated] = await db.update(endpoints)
        .set({ consecutiveFailures: sql`${endpoints.consecutiveFailures} + 1` })
        .where(eq(endpoints.id, endpointId))
        .returning({ consecutiveFailures: endpoints.consecutiveFailures });
    
    return updated?.consecutiveFailures ?? 0;
}

export async function verifyAndAutoDisableEndpointService(db, endpointId, threshold = Number(process.env.WEBHOOK_MAX_FAILURES) || 5) {
    // The Slow Path: Source of truth verification
    // 1. Fetch recent deliveries for this endpoint
    const recentDeliveries = await db.select({
        status: deliveries.status
    })
    .from(deliveries)
    .where(eq(deliveries.endpointId, endpointId))
    .orderBy(desc(deliveries.createdAt))
    .limit(threshold + 5); // Fetch a bit more just in case

    // 2. Calculate true consecutive failures
    let trueCount = 0;
    for (const delivery of recentDeliveries) {
        if (delivery.status === 'success') {
            break; // The consecutive failure chain is broken
        }
        if (delivery.status === 'failed') {
            trueCount++;
        }
    }

    // 3. Self-heal the counter in the DB
    const updateData = { consecutiveFailures: trueCount };
    
    // 4. Auto-disable if threshold is met or exceeded
    if (trueCount >= threshold) {
        updateData.isActive = false;
    }

    const [updated] = await db.update(endpoints)
        .set(updateData)
        .where(eq(endpoints.id, endpointId))
        .returning({ isActive: endpoints.isActive, consecutiveFailures: endpoints.consecutiveFailures });

    return updated;
}

export async function restoreEndpointService(db, id, consumerId) {
    // 1. Fetch the deleted endpoint to get its URL
    const [targetEndpoint] = await db.select({ url: endpoints.url, deletedAt: endpoints.deletedAt })
        .from(endpoints)
        .where(
            and(
                eq(endpoints.id, id),
                eq(endpoints.consumerId, consumerId)
            )
        );

    if (!targetEndpoint) {
        throw new NotFoundError('Endpoint not found or you do not have permission to restore it.');
    }

    if (!targetEndpoint.deletedAt) {
        // It's already active, no need to restore
        throw new ConflictError('Endpoint is already active and not deleted.');
    }

    // 2. Check for URL Collision (Does another ACTIVE endpoint have this URL?)
    const [existingActive] = await db.select({ id: endpoints.id })
        .from(endpoints)
        .where(
            and(
                eq(endpoints.url, targetEndpoint.url),
                isNull(endpoints.deletedAt)
            )
        );

    if (existingActive) {
        throw new ConflictError('Cannot restore this endpoint because another active endpoint is currently using its URL.');
    }

    // 3. Perform the Restore
    const [restoredEndpoint] = await db.update(endpoints)
        .set({ 
            isActive: true, 
            consecutiveFailures: 0,
            deletedAt: null,
            updatedAt: new Date() 
        })
        .where(eq(endpoints.id, id))
        .returning({
            id: endpoints.id,
            label: endpoints.label,
            url: endpoints.url,
            consumerId: endpoints.consumerId,
            isActive: endpoints.isActive,
            consecutiveFailures: endpoints.consecutiveFailures,
            createdAt: endpoints.createdAt,
            updatedAt: endpoints.updatedAt,
            deletedAt: endpoints.deletedAt
        });

    return restoredEndpoint;
}
