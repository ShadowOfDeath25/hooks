import { and, eq, max } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { attempts } from '../../db/schema/attempts.js';
import { deliveries } from '../../db/schema/deliveries.js';
import { endpoints } from '../../db/schema/endpoints.js';
import {
    createWebhookSignature,
    decryptSigningKey
} from '../../utils/webhook-signing.js';

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

function getWebhookTimeoutMs() {
    const timeoutMs = Number(process.env.WEBHOOK_TIMEOUT_MS);

    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
        throw new Error('WEBHOOK_TIMEOUT_MS must be a positive integer');
    }

    return timeoutMs;
}

function validateJobData(data) {
    if (!Number.isInteger(data?.eventId) || data.eventId <= 0) {
        throw new Error('The delivery job must contain a valid eventId');
    }

    if (!Number.isInteger(data.endpointId) || data.endpointId <= 0) {
        throw new Error('The delivery job must contain a valid endpointId');
    }

    if (data.payload === undefined) {
        throw new Error('The delivery job must contain a payload');
    }
}

function serializePayload(payload) {
    const body = JSON.stringify(payload);

    if (body === undefined) {
        throw new Error('The delivery payload is not JSON serializable');
    }

    return body;
}

export function createDeliveryProcessor({
    findContext,
    saveAttempt,
    sendRequest = fetch,
    now = Date.now
} = {}) {
    if (typeof findContext !== 'function' || typeof saveAttempt !== 'function') {
        throw new Error('Delivery persistence functions are required');
    }

    return async function processDelivery(job) {
        validateJobData(job.data);

        const {eventId: eventId,payload,endpointId: endpointId} = job.data;
        const context = await findContext(eventId, endpointId);

        if (!context) {
            throw new Error(
                `No delivery exists for event ${eventId} and endpoint ${endpointId}`
            );
        }

        const startedAt = now();
        let statusCode = 0;
        let requestError;

        try {
            const body = serializePayload(payload);
            const timestamp = Math.floor(now() / 1000).toString();
            const secret = decryptSigningKey(context.signingKey);
            const signature = createWebhookSignature(
                secret,
                eventId,
                timestamp,
                body
            );

            const response = await sendRequest(context.endpointUrl, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'event-id': eventId.toString(),
                    'webhook-timestamp': timestamp,
                    'webhook-signature': signature
                },
                body,
                signal: AbortSignal.timeout(getWebhookTimeoutMs())
            });

            statusCode = response.status;
        } catch (error) {
            requestError = error;
        }

        const duration = Math.max(0, now() - startedAt);
        const deliveryStatus =
            statusCode >= 200 && statusCode < 300 ? 'success' : 'failed';

        const retrialNumber = await saveAttempt({
            deliveryId: context.deliveryId,
            duration,
            statusCode,
            deliveryStatus
        });

        if (requestError) {
            throw new Error(
                `Delivery ${context.deliveryId} failed before receiving an HTTP response`,
                { cause: requestError }
            );
        }

        if (deliveryStatus === 'failed') {
            throw new Error(
                `Delivery ${context.deliveryId} received HTTP ${statusCode}`
            );
        }

        return {
            deliveryId: context.deliveryId,
            status: deliveryStatus,
            statusCode,
            duration,
            retrialNumber
        };
    };
}
