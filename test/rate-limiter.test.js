import assert from 'node:assert/strict';
import test from 'node:test';
import IORedis from 'ioredis';
import {
    createWebhookRateLimiter,
    getWebhookRateLimitConfig
} from '../src/lib/rateLimiter.js';
import { createDeliveryProcessor } from '../src/routes/deliveries/deliveries.services.js';
import { encryptSecret } from '../src/utils/crypto.js';

import fs from 'node:fs';

const isDocker = fs.existsSync('/.dockerenv');
const defaultRedisUrl = isDocker
    ? (process.env.REDIS_URL || 'redis://redis:6379')
    : 'redis://localhost:6379';
const REDIS_URL = process.env.TEST_REDIS_URL || defaultRedisUrl;
const SIGNING_SECRET = '_hs_ratelimit_test_secret';

test.before(() => {
    process.env.REDIS_URL = REDIS_URL;
    process.env.ENCRYPTION_KEY_V1 = '8292d2592759c8eb64384473634472f6205d8da244d6e291f5d90d6a074de141';
    process.env.WEBHOOK_TIMEOUT_MS = '5000';
    process.env.WEBHOOK_RATE_LIMIT = '10';
    process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS = '1000';
});

test('configuration: reads from environment variables and validates input', () => {
    process.env.WEBHOOK_RATE_LIMIT = '5';
    process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS = '2500';

    const config = getWebhookRateLimitConfig();
    assert.deepEqual(config, { limit: 5, windowMs: 2500 });

    // Invalid limit
    process.env.WEBHOOK_RATE_LIMIT = '0';
    assert.throws(() => getWebhookRateLimitConfig(), /WEBHOOK_RATE_LIMIT must be a positive integer/);

    process.env.WEBHOOK_RATE_LIMIT = 'not-a-number';
    assert.throws(() => getWebhookRateLimitConfig(), /WEBHOOK_RATE_LIMIT must be a positive integer/);

    // Invalid window
    process.env.WEBHOOK_RATE_LIMIT = '5';
    process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS = '-100';
    assert.throws(() => getWebhookRateLimitConfig(), /WEBHOOK_RATE_LIMIT_WINDOW_MS must be a positive integer/);

    // Reset back
    process.env.WEBHOOK_RATE_LIMIT = '10';
    process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS = '1000';
});

test('rate limiter: allows requests below limit and rejects requests exceeding limit', async () => {
    const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    const limiter = createWebhookRateLimiter({
        connection: redis,
        limit: 3,
        windowMs: 5000,
        groupId: `test:limit:${Date.now()}`
    });

    const endpointId = 1001;

    try {
        const first = await limiter.allow(endpointId);
        const second = await limiter.allow(endpointId);
        const third = await limiter.allow(endpointId);
        const fourth = await limiter.allow(endpointId);
        const fifth = await limiter.allow(endpointId);

        assert.equal(first, true);
        assert.equal(second, true);
        assert.equal(third, true);
        assert.equal(fourth, false);
        assert.equal(fifth, false);
    } finally {
        await limiter.disconnect(false, { closeConnection: true });
    }
});

test('rate limiter: each endpoint has an independent rate limit', async () => {
    const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    const limiter = createWebhookRateLimiter({
        connection: redis,
        limit: 2,
        windowMs: 5000,
        groupId: `test:independent:${Date.now()}`
    });

    const endpointA = 'endpoint-A';
    const endpointB = 'endpoint-B';

    try {
        // Exhaust endpoint A
        assert.equal(await limiter.allow(endpointA), true);
        assert.equal(await limiter.allow(endpointA), true);
        assert.equal(await limiter.allow(endpointA), false);

        // Endpoint B must still have full quota
        assert.equal(await limiter.allow(endpointB), true);
        assert.equal(await limiter.allow(endpointB), true);
        assert.equal(await limiter.allow(endpointB), false);
    } finally {
        await limiter.disconnect(false, { closeConnection: true });
    }
});

test('rate limiter: limit is shared across multiple worker instances in distributed cluster', async () => {
    const redis1 = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    const redis2 = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

    const groupId = `test:cluster:${Date.now()}`;
    const worker1Limiter = createWebhookRateLimiter({
        connection: redis1,
        limit: 4,
        windowMs: 5000,
        groupId
    });

    const worker2Limiter = createWebhookRateLimiter({
        connection: redis2,
        limit: 4,
        windowMs: 5000,
        groupId
    });

    const endpointId = 'shared-endpoint';

    try {
        // 2 calls from worker 1
        const w1_1 = await worker1Limiter.allow(endpointId);
        const w1_2 = await worker1Limiter.allow(endpointId);

        // 2 calls from worker 2
        const w2_1 = await worker2Limiter.allow(endpointId);
        const w2_2 = await worker2Limiter.allow(endpointId);

        // Total 4 allowed so far. Next calls on either worker must be rejected
        const w1_3 = await worker1Limiter.allow(endpointId);
        const w2_3 = await worker2Limiter.allow(endpointId);

        assert.equal(w1_1, true);
        assert.equal(w1_2, true);
        assert.equal(w2_1, true);
        assert.equal(w2_2, true);
        assert.equal(w1_3, false);
        assert.equal(w2_3, false);
    } finally {
        await worker1Limiter.disconnect(false, { closeConnection: true });
        await worker2Limiter.disconnect(false, { closeConnection: true });
    }
});

test('rate limiter: concurrent requests cannot bypass the limit due to race conditions', async () => {
    const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    const limiter = createWebhookRateLimiter({
        connection: redis,
        limit: 5,
        windowMs: 5000,
        groupId: `test:race:${Date.now()}`
    });

    const endpointId = 'race-endpoint';

    try {
        // 15 concurrent calls
        const promises = Array.from({ length: 15 }, () => limiter.allow(endpointId));
        const results = await Promise.all(promises);

        const allowedCount = results.filter((r) => r === true).length;
        const rejectedCount = results.filter((r) => r === false).length;

        assert.equal(allowedCount, 5, 'Exactly 5 requests must be allowed');
        assert.equal(rejectedCount, 10, 'Exactly 10 requests must be rejected');
    } finally {
        await limiter.disconnect(false, { closeConnection: true });
    }
});

test('rate limiter: resolves immediately without waiting and keeps queue empty', async () => {
    const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    const limiter = createWebhookRateLimiter({
        connection: redis,
        limit: 1,
        windowMs: 5000,
        groupId: `test:timing:${Date.now()}`
    });

    const endpointId = 'timing-endpoint';

    try {
        const start1 = Date.now();
        const first = await limiter.allow(endpointId);
        const duration1 = Date.now() - start1;

        const start2 = Date.now();
        const second = await limiter.allow(endpointId);
        const duration2 = Date.now() - start2;

        assert.equal(first, true);
        assert.equal(second, false);

        // Immediate resolution: both calls should resolve within ~100ms
        assert.ok(duration1 < 200, `First call took ${duration1}ms`);
        assert.ok(duration2 < 200, `Second call took ${duration2}ms`);

        // Assert that Bottleneck queue is empty and no jobs are pending
        const underlyingLimiter = limiter.group.key(String(endpointId));
        assert.equal(underlyingLimiter.queued(), 0, 'No jobs should remain in queue');
        assert.equal(underlyingLimiter.empty(), true, 'Queue should be empty');
    } finally {
        await limiter.disconnect(false, { closeConnection: true });
    }
});

test('rate limiter: fails closed and logs error on Redis/infrastructure error', async () => {
    const loggedErrors = [];
    const mockLogger = {
        error: (...args) => loggedErrors.push(args.join(' '))
    };

    const limiter = createWebhookRateLimiter({
        limit: 2,
        windowMs: 1000,
        datastore: 'local',
        logger: mockLogger
    });

    const endpointId = 'error-endpoint';

    // Force an internal error in schedule to simulate Redis infrastructure failure
    const originalKey = limiter.group.key.bind(limiter.group);
    limiter.group.key = (id) => {
        const lim = originalKey(id);
        lim.schedule = async () => {
            throw new Error('Connection to Redis lost');
        };
        return lim;
    };

    const allowed = await limiter.allow(endpointId);

    // Must fail closed (return false)
    assert.equal(allowed, false);

    // Must log the error
    assert.equal(loggedErrors.length, 1);
    assert.match(loggedErrors[0], /Connection to Redis lost/);
    assert.match(loggedErrors[0], /failing closed/);
});

test('delivery processor integration: rate-limited attempt is rejected with 429 and no HTTP request sent', async () => {
    const requests = [];
    const attempts = [];

    const mockRateLimiter = {
        allow: async (endpointId) => false // Deny rate limit
    };

    const processor = createDeliveryProcessor({
        findContext: async () => ({
            deliveryId: 101,
            endpointUrl: 'https://example.com/webhook',
            signingKey: encryptSecret(SIGNING_SECRET)
        }),
        saveAttempt: async (attempt) => {
            attempts.push(attempt);
            return attempts.length;
        },
        sendRequest: async (...args) => {
            requests.push(args);
            return { status: 200 };
        },
        rateLimiter: mockRateLimiter
    });

    await assert.rejects(
        processor({
            data: { eventId: 1, payload: { hello: 'world' }, endpointId: 88 }
        }),
        /rate limit exceeded for endpoint 88/
    );

    // HTTP request was NOT made
    assert.equal(requests.length, 0);

    // Attempt was persisted as failed with status code 429
    assert.deepEqual(attempts, [{
        deliveryId: 101,
        duration: attempts[0].duration,
        statusCode: 429,
        deliveryStatus: 'failed'
    }]);
});

test('delivery processor integration: every attempt consumes rate limit regardless of HTTP outcome', async () => {
    const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    const rateLimiter = createWebhookRateLimiter({
        connection: redis,
        limit: 2,
        windowMs: 5000,
        groupId: `test:consume:${Date.now()}`
    });

    const requests = [];
    const attempts = [];
    const endpointId = 999;

    let shouldHttpFail = true;

    const processor = createDeliveryProcessor({
        findContext: async () => ({
            deliveryId: 202,
            endpointUrl: 'https://example.com/webhook',
            signingKey: encryptSecret(SIGNING_SECRET)
        }),
        saveAttempt: async (attempt) => {
            attempts.push(attempt);
            return attempts.length;
        },
        sendRequest: async (...args) => {
            requests.push(args);
            if (shouldHttpFail) {
                return { status: 500 };
            }
            return { status: 200 };
        },
        rateLimiter
    });

    try {
        // Attempt 1: HTTP 500 (failed) -> consumes 1 token
        await assert.rejects(
            processor({
                data: { eventId: 1, payload: { a: 1 }, endpointId }
            }),
            /received HTTP 500/
        );
        assert.equal(requests.length, 1);

        // Attempt 2: HTTP 200 (success) -> consumes 2nd token
        shouldHttpFail = false;
        const result = await processor({
            data: { eventId: 2, payload: { a: 2 }, endpointId }
        });
        assert.equal(requests.length, 2);
        assert.equal(result.statusCode, 200);

        // Attempt 3: Rate limit exceeded (limit was 2) -> denied, no HTTP request made!
        await assert.rejects(
            processor({
                data: { eventId: 3, payload: { a: 3 }, endpointId }
            }),
            /rate limit exceeded/
        );
        assert.equal(requests.length, 2, 'No 3rd HTTP request should be sent');
        assert.equal(attempts[2].statusCode, 429);
        assert.equal(attempts[2].deliveryStatus, 'failed');
    } finally {
        await rateLimiter.disconnect(false, { closeConnection: true });
    }
});

test('delivery processor integration: fails closed on rate limiter error and does not send HTTP request', async () => {
    const requests = [];
    const attempts = [];
    const loggedErrors = [];

    const mockRateLimiter = createWebhookRateLimiter({
        limit: 1,
        windowMs: 1000,
        datastore: 'local',
        logger: { error: (msg) => loggedErrors.push(msg) }
    });

    // Cause an error
    mockRateLimiter.group.key = () => {
        throw new Error('Redis connection timed out');
    };

    const processor = createDeliveryProcessor({
        findContext: async () => ({
            deliveryId: 303,
            endpointUrl: 'https://example.com/webhook',
            signingKey: encryptSecret(SIGNING_SECRET)
        }),
        saveAttempt: async (attempt) => {
            attempts.push(attempt);
            return attempts.length;
        },
        sendRequest: async (...args) => {
            requests.push(args);
            return { status: 200 };
        },
        rateLimiter: mockRateLimiter
    });

    await assert.rejects(
        processor({
            data: { eventId: 1, payload: { test: true }, endpointId: 50 }
        }),
        /rate limit exceeded for endpoint 50/
    );

    // Request was denied (fail closed): no HTTP request made!
    assert.equal(requests.length, 0);
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].statusCode, 429);
    assert.equal(attempts[0].deliveryStatus, 'failed');

    // Error was logged
    assert.equal(loggedErrors.length, 1);
    assert.match(loggedErrors[0], /Redis connection timed out/);
    assert.match(loggedErrors[0], /failing closed/);
});
