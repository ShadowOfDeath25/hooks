import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { createDeliveryProcessor } from '../src/services/delivery.js';

const ENCRYPTION_KEY = crypto.randomBytes(32);
const SIGNING_SECRET = '_hs_delivery_test_secret';

function encryptSigningKey(secret) {
    const version = Buffer.from([1]);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    const ciphertext = Buffer.concat([
        cipher.update(secret, 'utf8'),
        cipher.final()
    ]);

    return Buffer.concat([version, iv, cipher.getAuthTag(), ciphertext]);
}

function createProcessor({ responseStatus, requestError } = {}) {
    const attempts = [];
    const requests = [];
    const times = [
        1_700_000_000_000,
        1_700_000_000_000,
        1_700_000_000_125
    ];

    const processor = createDeliveryProcessor({
        findContext: async () => ({
            deliveryId: 42,
            endpointUrl: 'https://receiver.example/webhook',
            signingKey: encryptSigningKey(SIGNING_SECRET)
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
        now: () => times.shift()
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

test('records a non-2xx response as failed', async () => {
    const { processor, attempts } = createProcessor({ responseStatus: 500 });

    await assert.rejects(
        processor({
            data: { eventId: 7, payload: { test: true }, endpointId: 9 }
        }),
        /received HTTP 500/
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
        /failed before receiving an HTTP response/
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
