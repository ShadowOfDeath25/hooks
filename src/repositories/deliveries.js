import { and, eq, max } from 'drizzle-orm';
import { db } from '../db/index.js';
import { attempts } from '../db/schema/attempts.js';
import { deliveries } from '../db/schema/deliveries.js';
import { endpoints } from '../db/schema/endpoints.js';

export async function findDeliveryContext(eventId, endpointId) {
    const [context] = await db
        .select({
            deliveryId: deliveries.id,
            endpointUrl: endpoints.url,
            signingKey: endpoints.signingKey
        })
        .from(deliveries)
        .innerJoin(endpoints, eq(deliveries.endpointId, endpoints.id))
        .where(
            and(
                eq(deliveries.eventId, eventId),
                eq(deliveries.endpointId, endpointId)
            )
        )
        .limit(1);

    return context;
}

export async function recordDeliveryAttempt({
    deliveryId,
    duration,
    statusCode,
    deliveryStatus
}) {
    return db.transaction(async (transaction) => {
        const [previousAttempt] = await transaction
            .select({ retrialNumber: max(attempts.retrialNumber) })
            .from(attempts)
            .where(eq(attempts.deliveryId, deliveryId));

        const retrialNumber = (previousAttempt.retrialNumber ?? 0) + 1;

        await transaction.insert(attempts).values({
            deliveryId,
            duration,
            statusCode,
            retrialNumber
        });

        await transaction
            .update(deliveries)
            .set({ status: deliveryStatus })
            .where(eq(deliveries.id, deliveryId));

        return retrialNumber;
    });
}
