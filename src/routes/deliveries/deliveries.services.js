import { and, eq, max } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { attempts } from '../../db/schema/attempts.js';
import { deliveries } from '../../db/schema/deliveries.js';
import { endpoints } from '../../db/schema/endpoints.js';
import { decryptSecret as decryptSecretKey, createWebhookSignature } from '../../utils/crypto.js';
import { DeliveryClassification } from '../../utils/enums.js';
import { UnrecoverableError } from 'bullmq';

/**
 * Classifies an HTTP response into a DeliveryClassification
 */
function classifyDeliveryError(statusCode, requestError) {
    // 1. Connection Errors & Timeouts (DNS failure, ECONNREFUSED, socket hang up)
    if (requestError || !statusCode) return DeliveryClassification.RETRIABLE; 
    
    switch (true) {
        // 2. Success
        case statusCode >= 200 && statusCode < 300:
            return DeliveryClassification.SUCCESS;
            
        // 3. Explicit Design Decisions & Client Timeouts
        // 429: Respect rate limits. 408: Client timeouts.
        // 5xx: Temporary infrastructure blips.
        case statusCode === 429:
        case statusCode === 408:
        case statusCode >= 500 && statusCode < 600:
            return DeliveryClassification.RETRIABLE;
            
        // 4. Permanent failures (410 Gone, and all other 4xx errors)
        case statusCode === 410:
        default:
            return DeliveryClassification.TERMINAL;
    }
}

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
    now = Date.now,
    verifyAndDisable
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
            const secret = decryptSecretKey(context.signingKey);
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
        // 1. Classify the result
        const classification = classifyDeliveryError(statusCode, requestError);

        // 2. Determine Database Status
        const maxAttempts = job.opts?.attempts || 1;
        const attemptsLeft = maxAttempts - ((job.attemptsMade || 0) + 1);
        
        let deliveryStatus = null;
        if (classification === DeliveryClassification.SUCCESS) {
            deliveryStatus = 'success';
        } else if (classification === DeliveryClassification.RETRIABLE && attemptsLeft > 0) {
            deliveryStatus = null; // Stays pending
        } else {
            deliveryStatus = 'failed'; // Exhausted OR Terminal
        }

        // 3. Save to Database
        const retrialNumber = await saveAttempt({
            deliveryId: context.deliveryId,
            duration,
            statusCode,
            deliveryStatus
        });

        // 4. Update Endpoint Health (Only on Terminal Failure)
        if (deliveryStatus === 'failed') {
            await verifyAndDisable(endpointId);
        }

        // 5. Trigger BullMQ Routing
        if (classification === DeliveryClassification.RETRIABLE && attemptsLeft > 0) {
            const errorMsg = requestError 
                ? `Delivery ${context.deliveryId} retrying (Network error: ${requestError.message})`
                : `Delivery ${context.deliveryId} retrying. HTTP ${statusCode}`;
            throw new Error(errorMsg);
        } else if (classification === DeliveryClassification.TERMINAL) {
            const errorMsg = requestError
                ? `Delivery ${context.deliveryId} terminal failure (Network error: ${requestError.message})`
                : `Delivery ${context.deliveryId} terminal failure. HTTP ${statusCode}`;
            throw new UnrecoverableError(errorMsg);
        } else if (classification === DeliveryClassification.RETRIABLE && attemptsLeft <= 0) {
            const errorMsg = requestError
                ? `Delivery ${context.deliveryId} retries exhausted after ${(job.attemptsMade || 0) + 1} attempts (Network error: ${requestError.message})`
                : `Delivery ${context.deliveryId} retries exhausted after ${(job.attemptsMade || 0) + 1} attempts. HTTP ${statusCode}`;
            throw new UnrecoverableError(errorMsg);
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
