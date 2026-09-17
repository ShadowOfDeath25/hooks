import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const STUB_PORT = 4300;
const STUB_URL = `http://127.0.0.1:${STUB_PORT}`;
const API_KEY = 'publisher-test-key';

let stub;
let received;

/**
 * Starts a stand-in for the Hooks API so the publisher can be tested
 * without Postgres, Redis or the worker.
 */
async function startStubApi({ consumers = [{ id: 7, name: 'Mock server' }] } = {}) {
    received = {
        authenticatedRequests: [],
        createdConsumers: [],
        publishedEvents: [],
        summaryRequests: []
    };

    const stubConsumers = [...consumers];
    let nextEventId = 100;

    const app = Fastify({ logger: false });

    app.addHook('onRequest', async (request) => {
        if (request.url !== '/') {
            received.authenticatedRequests.push({
                url: request.url,
                apiKey: request.headers['x-api-key']
            });
        }
    });

    app.get('/', async () => ({ status: 'Ok' }));

    app.get('/consumers', async () => stubConsumers);

    app.post('/consumers', async (request, reply) => {
        const consumer = { id: 42, name: request.body.name };
        stubConsumers.push(consumer);
        received.createdConsumers.push(consumer);
        return reply.code(201).send(consumer);
    });

    app.post('/events', async (request, reply) => {
        const eventId = nextEventId++;
        received.publishedEvents.push({ body: request.body, eventId, at: Date.now() });
        return reply.code(201).send({ success: true, message: 'Event received', event_id: eventId });
    });

    app.get('/events/:eventId', async (request) => {
        received.summaryRequests.push(Number(request.params.eventId));
        return {
            success: true,
            event: { id: Number(request.params.eventId) },
            deliveries: [],
            summary: { total: 1, pending: 0, success: 1, failed: 0 }
        };
    });

    await app.listen({ port: STUB_PORT, host: '127.0.0.1' });

    return app;
}

/**
 * Runs examples/publisher.js to completion and returns its output.
 */
function runPublisher(env = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['examples/publisher.js'], {
            env: {
                ...process.env,
                HOOKS_API_URL: STUB_URL,
                HOOKS_API_KEY: API_KEY,
                EXAMPLE_CONSUMER_NAME: 'Mock server',
                EXAMPLE_EVENT_TYPE: 'example.ping',
                EXAMPLE_EVENT_COUNT: '2',
                EXAMPLE_PUBLISH_INTERVAL_MS: '400',
                EXAMPLE_SUMMARY_DELAY_MS: '50',
                EXAMPLE_STARTUP_TIMEOUT_MS: '10000',
                ...env
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

        child.on('error', reject);
        child.on('close', (code) => resolve({ code, stdout, stderr }));
    });
}

/**
 * Runs a subtest body against a fresh stub API and always shuts it down.
 */
async function withStub(options, run) {
    stub = await startStubApi(options);

    try {
        await run();
    } finally {
        await stub.close();
        stub = undefined;
    }
}

test.afterEach(async () => {
    if (stub) {
        await stub.close();
        stub = undefined;
    }
});

test('Example publisher', async (t) => {
    await t.test('publishes the configured number of events and stops', async () => {
        await withStub({}, async () => {
            const result = await runPublisher();

            assert.equal(result.code, 0, `publisher exited with ${result.code}: ${result.stderr}`);
            assert.equal(received.publishedEvents.length, 2);
            assert.match(result.stdout, /Finished after 2 event\(s\)/);
        });
    });

    await t.test('sends the API key and a schema-valid event body', async () => {
        await withStub({}, async () => {
            await runPublisher();

            assert.ok(received.authenticatedRequests.length > 0);
            assert.ok(received.authenticatedRequests.every((entry) => entry.apiKey === API_KEY));

            const [first] = received.publishedEvents;

            assert.equal(first.body.consumerID, 7);
            assert.equal(first.body.eventData.type, 'example.ping');
            assert.ok(Number.isInteger(first.body.eventData.timestamp));
            assert.ok(first.body.eventData.timestamp <= Math.floor(Date.now() / 1000));
            assert.equal(typeof first.body.eventData.data, 'object');
            assert.equal(first.body.eventData.data.sequence, 1);
        });
    });

    await t.test('waits between publishes instead of flooding the API', async () => {
        await withStub({}, async () => {
            await runPublisher({
                EXAMPLE_PUBLISH_INTERVAL_MS: '700',
                EXAMPLE_SUMMARY_DELAY_MS: '50'
            });

            const [first, second] = received.publishedEvents;
            const gap = second.at - first.at;

            assert.ok(gap >= 600, `expected roughly 700ms between publishes, got ${gap}ms`);
        });
    });

    await t.test('reads back the delivery summary for each event', async () => {
        await withStub({}, async () => {
            await runPublisher();

            assert.deepEqual(received.summaryRequests, [100, 101]);
        });
    });

    await t.test('creates the consumer when it does not exist yet', async () => {
        await withStub({ consumers: [] }, async () => {
            const result = await runPublisher();

            assert.equal(received.createdConsumers.length, 1);
            assert.equal(received.createdConsumers[0].name, 'Mock server');
            assert.equal(received.publishedEvents[0].body.consumerID, 42);
            assert.equal(result.code, 0);
        });
    });

    await t.test('fails loudly when the API key is rejected', async () => {
        const app = Fastify({ logger: false });
        app.get('/', async () => ({ status: 'Ok' }));
        app.get('/consumers', async (_request, reply) => reply.code(401).send({ error: 'Unauthorized' }));
        await app.listen({ port: STUB_PORT, host: '127.0.0.1' });
        stub = app;

        try {
            const result = await runPublisher();

            assert.equal(result.code, 1);
            assert.match(result.stderr, /401/);
        } finally {
            await app.close();
            stub = undefined;
        }
    });

    await t.test('retries until the API becomes reachable', async () => {
        const publisherRun = runPublisher({ EXAMPLE_EVENT_COUNT: '1' });

        await delay(1200);
        stub = await startStubApi();

        try {
            const result = await publisherRun;

            assert.equal(result.code, 0);
            assert.equal(received.publishedEvents.length, 1);
        } finally {
            await stub.close();
            stub = undefined;
        }
    });
});
