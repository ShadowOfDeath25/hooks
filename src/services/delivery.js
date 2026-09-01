import {
    createWebhookSignature,
    decryptSigningKey
} from '../utils/webhook-signing.js';

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

        const { eventId, payload, endpointId } = job.data;
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
