import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { DelayedError } from 'bullmq';
import {
    createDeliveryProcessor
} from '../src/routes/deliveries/deliveries.services.js';
import {
    encryptSecret
} from '../src/utils/crypto.js';

const ENCRYPTION_KEY = crypto.randomBytes(32);
const SIGNING_SECRET = '_hs_delivery_test_secret';


function createProcessor({ responseStatus, requestError, rateLimiter } = {}) {
    const attempts = [];
    const requests = [];

    const times = [
        1_700_000_000_000,
        1_700_000_000_000,
        1_700_000_000_125,

        1_700_000_001_000,
        1_700_000_001_000,
        1_700_000_001_125,

        1_700_000_002_000,
        1_700_000_002_000,
        1_700_000_002_125
    ];
    const processor = createDeliveryProcessor({
        findContext: async () => ({
            deliveryId: 42,
            endpointUrl: 'https://receiver.example/webhook',
            signingKey: encryptSecret(SIGNING_SECRET)
        }),
        saveAttempt: async (attempt) => {
            attempts.push(attempt);
            return attempts.length;
        },
        sendRequest: async (...request) => {
            requests.push(request);

            if (requestError) {
                throw requestError;
            }

            return { status: responseStatus };
        },
        rateLimiter,
        now: () => times.shift() ?? 1_700_000_000_125
    });

    return { processor, attempts, requests };
}

test.before(() => {
    process.env.ENCRYPTION_KEY_V1 = ENCRYPTION_KEY.toString('hex');
    process.env.WEBHOOK_TIMEOUT_MS = '5000';
});

test('sends the signed payload and records a successful attempt', async () => {
    const { processor, attempts, requests } = createProcessor({
        responseStatus: 204
    });
    const payload = { orderId: 17, paid: true };

    const result = await processor({
        data: { eventId: 7, payload, endpointId: 9 }
    });

    assert.equal(requests.length, 1);

    const [url, request] = requests[0];
    assert.equal(url, 'https://receiver.example/webhook');
    assert.equal(request.method, 'POST');
    assert.equal(request.body, JSON.stringify(payload));
    assert.equal(request.headers['event-id'], '7');
    assert.equal(request.headers['webhook-timestamp'], '1700000000');

    const expectedDigest = crypto
        .createHmac('sha256', SIGNING_SECRET)
        .update(`7.1700000000.${JSON.stringify(payload)}`)
        .digest('base64');

    assert.equal(
        request.headers['webhook-signature'],
        `v1,${expectedDigest}`
    );
    assert.deepEqual(attempts, [{
        deliveryId: 42,
        duration: 125,
        statusCode: 204,
        deliveryStatus: 'success'
    }]);
    assert.deepEqual(result, {
        deliveryId: 42,
        status: 'success',
        statusCode: 204,
        duration: 125,
        retrialNumber: 1
    });
});
test('keeps the same Event-Id on the first and third delivery attempts', async () => {
    const { processor, requests } = createProcessor({
        responseStatus: 500
    });

    const job = {
        data: {
            eventId: 7,
            payload: { test: true },
            endpointId: 9
        }
    };

    // Invoke the same delivery processor three times to verify that the
    // Event-Id stays stable. Retry scheduling itself belongs to SCRUM-18.
    for (let attempt = 0; attempt < 3; attempt += 1) {
        await assert.rejects(
            processor(job),
            /HTTP 500/
        );
    }

    assert.equal(requests.length, 3);

    const firstHeaders = requests[0][1].headers;
    const thirdHeaders = requests[2][1].headers;

    assert.equal(firstHeaders['event-id'], '7');
    assert.equal(thirdHeaders['event-id'], '7');

    assert.equal(
        firstHeaders['event-id'],
        thirdHeaders['event-id']
    );

    assert.equal(
        firstHeaders['webhook-timestamp'],
        '1700000000'
    );

    assert.equal(
        thirdHeaders['webhook-timestamp'],
        '1700000002'
    );
});
test('records a non-2xx response as failed', async () => {
    const { processor, attempts } = createProcessor({ responseStatus: 500 });

    await assert.rejects(
        processor({
            data: { eventId: 7, payload: { test: true }, endpointId: 9 }
        }),
        /HTTP 500/
    );

    assert.deepEqual(attempts, [{
        deliveryId: 42,
        duration: 125,
        statusCode: 500,
        deliveryStatus: 'failed'
    }]);
});

test('records a timeout or network error with status code zero', async () => {
    const { processor, attempts } = createProcessor({
        requestError: new Error('request timed out')
    });

    await assert.rejects(
        processor({
            data: { eventId: 7, payload: { test: true }, endpointId: 9 }
        }),
        /(failed before receiving an HTTP response|request timed out)/
    );

    assert.deepEqual(attempts, [{
        deliveryId: 42,
        duration: 125,
        statusCode: 0,
        deliveryStatus: 'failed'
    }]);
});

test('rejects malformed queue data before querying the database', async () => {
    let queried = false;
    const processor = createDeliveryProcessor({
        findContext: async () => {
            queried = true;
        },
        saveAttempt: async () => {}
    });

    await assert.rejects(
        processor({ data: { eventId: 7, payload: {} } }),
        /valid endpointId/
    );
    assert.equal(queried, false);
});

test('rate-limited job is moved to delayed and throws DelayedError without recording an attempt', async () => {
    let delayedTimestamp = null;
    let delayedToken = null;

    const mockJob = {
        data: { eventId: 7, payload: { test: true }, endpointId: 9 },
        moveToDelayed: async (ts, tok) => {
            delayedTimestamp = ts;
            delayedToken = tok;
        }
    };

    const { processor, attempts, requests } = createProcessor({
        rateLimiter: {
            allow: async () => false,
            delayMs: 1500
        }
    });

    await assert.rejects(
        processor(mockJob, 'test-token'),
        (err) => err instanceof DelayedError || err.name === 'DelayedError'
    );

    assert.equal(requests.length, 0, 'No HTTP request should be sent');
    assert.equal(attempts.length, 0, 'No attempt should be recorded in DB');
    assert.equal(delayedToken, 'test-token');
    assert.equal(delayedTimestamp, 1_700_000_000_000 + 1500);
});

test('rate limiter allows attempt and proceeds with HTTP request', async () => {
    let checkedEndpoint = null;
    const { processor, attempts, requests } = createProcessor({
        responseStatus: 200,
        rateLimiter: {
            allow: async (endpointId) => {
                checkedEndpoint = endpointId;
                return true;
            }
        }
    });

    const result = await processor({
        data: { eventId: 7, payload: { orderId: 99 }, endpointId: 9 }
    });

    assert.equal(checkedEndpoint, 9);
    assert.equal(requests.length, 1);
    assert.equal(result.status, 'success');
});

