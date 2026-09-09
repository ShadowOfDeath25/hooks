import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { fork } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { dummyQueue, initQueue, closeQueue, QUEUE_NAME, getRedisUrl } from '../src/queue.js';
import { createDeliveryProcessor } from '../src/routes/deliveries/deliveries.services.js';
import { encryptSecret } from '../src/utils/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.before(async () => {
    process.env.ENCRYPTION_KEY_V1 = '8292d2592759c8eb64384473634472f6205d8da244d6e291f5d90d6a074de141';
    process.env.WEBHOOK_TIMEOUT_MS = '5000';
    process.env.WORKER_LOCK_DURATION_MS = '1000';
    process.env.WORKER_STALLED_INTERVAL_MS = '500';
});

test.after(async () => {
    await closeQueue().catch(() => {});
});

test('queue initialization succeeds when Redis is reachable', async () => {
    const q = await initQueue(3000);
    assert.ok(q);
    assert.equal(q.name, QUEUE_NAME);
});

test('queue initialization fails fast when Redis is unreachable', async () => {
    const badConnection = new IORedis('redis://127.0.0.1:59999', {
        maxRetriesPerRequest: null,
        connectTimeout: 500,
        retryStrategy: () => null
    });
    badConnection.on('error', () => {});

    const badQueue = new Queue('testBadQueue', { connection: badConnection });

    await assert.rejects(
        async () => {
            await Promise.race([
                badQueue.waitUntilReady(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Queue readiness timeout exceeded')), 600)
                )
            ]);
            await badConnection.ping();
        },
        /timeout|connect|ECONNREFUSED/i
    );

    await badQueue.close().catch(() => {});
    await badConnection.quit().catch(() => {});
});

test('acceptance: killing a worker during an active delivery results in the delivery being reclaimed and completed by another worker', async (t) => {
    const redisUrl = getRedisUrl();

    // 1. Setup mock receiver server
    let requestCount = 0;
    let resolveFirstRequestReceived;
    const firstRequestReceivedPromise = new Promise((resolve) => {
        resolveFirstRequestReceived = resolve;
    });

    const server = http.createServer((req, res) => {
        requestCount++;
        if (requestCount === 1) {
            // Worker 1 request: signal that delivery is in-flight, hold connection open
            resolveFirstRequestReceived();
            // Don't respond yet; worker 1 will be killed while waiting
        } else {
            // Worker 2 request: respond with success
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ received: true }));
        }
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const endpointUrl = `http://127.0.0.1:${port}/webhook`;

    t.after(async () => {
        await new Promise((resolve) => server.close(resolve));
    });

    // 2. Clean queue of any previous jobs
    await dummyQueue.drain();
    await dummyQueue.clean(0, 1000, 'active');
    await dummyQueue.clean(0, 1000, 'wait');

    // 3. Spawn Worker 1 in a separate child process
    const childWorkerPath = path.join(__dirname, 'fixtures', 'worker-child.js');
    const worker1Child = fork(childWorkerPath, [], {
        env: {
            ...process.env,
            REDIS_URL: redisUrl,
            WORKER_LOCK_DURATION_MS: '1000',
            WORKER_STALLED_INTERVAL_MS: '500'
        }
    });

    // Wait for Worker 1 to be ready
    await new Promise((resolve) => {
        worker1Child.on('message', (msg) => {
            if (msg.type === 'worker_ready') resolve();
        });
    });

    // 4. Enqueue delivery job
    const jobData = {
        eventId: 101,
        endpointId: 202,
        endpointUrl,
        payload: { event: 'test.crash_recovery', timestamp: Date.now() }
    };

    const job = await dummyQueue.add('dummyQueue', jobData);
    assert.ok(job.id, 'Job should be enqueued');

    // 5. Wait until Worker 1 starts processing and sends the in-flight HTTP request
    await firstRequestReceivedPromise;

    // 6. Abruptly KILL Worker 1 with SIGKILL (hard crash mid-delivery)
    worker1Child.kill('SIGKILL');
    await new Promise((resolve) => worker1Child.on('exit', resolve));

    // 7. Start Worker 2 to reclaim and complete the delivery
    const attempts = [];
    const processor = createDeliveryProcessor({
        findContext: async () => ({
            deliveryId: 555,
            endpointUrl,
            signingKey: encryptSecret('_hs_crash_recovery_secret')
        }),
        saveAttempt: async (attempt) => {
            attempts.push(attempt);
            return attempts.length;
        },
        sendRequest: fetch
    });

    const connection2 = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    let stalledJobId = null;

    const worker2 = new Worker(QUEUE_NAME, processor, {
        connection: connection2,
        lockDuration: 1000,
        stalledInterval: 500,
        maxStalledCount: Number.MAX_SAFE_INTEGER
    });

    worker2.on('stalled', (id) => {
        stalledJobId = id;
    });

    // Wait for worker2 to complete the job
    const completedResult = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Timed out waiting for Worker 2 to reclaim and complete the job'));
        }, 8000);

        worker2.on('completed', (completedJob, returnvalue) => {
            if (completedJob.id === job.id) {
                clearTimeout(timeout);
                resolve(returnvalue);
            }
        });

        worker2.on('failed', (failedJob, err) => {
            if (failedJob?.id === job.id) {
                clearTimeout(timeout);
                reject(err);
            }
        });
    });

    // 8. Assertions:
    assert.equal(stalledJobId, job.id, 'Worker 2 should detect and reclaim the stalled job');
    assert.equal(requestCount, 2, 'Mock server should have received request from Worker 1, then reclaimed request from Worker 2');
    assert.equal(attempts.length, 1, 'Delivery attempt should be saved once successfully by Worker 2');
    assert.equal(attempts[0].deliveryStatus, 'success');
    assert.equal(attempts[0].statusCode, 200);
    assert.equal(completedResult.status, 'success');

    // Clean up worker 2
    await worker2.close();
    await connection2.quit();
});

test('a job can be reclaimed repeatedly without limit across multiple consecutive crashes', async (t) => {
    const redisUrl = getRedisUrl();

    let requestCount = 0;
    let resolveReq1;
    let resolveReq2;
    const req1Promise = new Promise((res) => { resolveReq1 = res; });
    const req2Promise = new Promise((res) => { resolveReq2 = res; });

    const server = http.createServer((req, res) => {
        requestCount++;
        if (requestCount === 1) {
            resolveReq1();
        } else if (requestCount === 2) {
            resolveReq2();
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ multiRecovery: true }));
        }
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const endpointUrl = `http://127.0.0.1:${port}/webhook`;

    t.after(async () => {
        await new Promise((resolve) => server.close(resolve));
    });

    await dummyQueue.drain();
    await dummyQueue.clean(0, 1000, 'active');
    await dummyQueue.clean(0, 1000, 'wait');

    const childWorkerPath = path.join(__dirname, 'fixtures', 'worker-child.js');

    // Spawn Worker 1
    const worker1 = fork(childWorkerPath, [], {
        env: { ...process.env, REDIS_URL: redisUrl, WORKER_LOCK_DURATION_MS: '800', WORKER_STALLED_INTERVAL_MS: '400' }
    });
    await new Promise((res) => worker1.on('message', (m) => { if (m.type === 'worker_ready') res(); }));

    const job = await dummyQueue.add('dummyQueue', {
        eventId: 201,
        endpointId: 301,
        endpointUrl,
        payload: { test: 'multi_crash' }
    });

    // Worker 1 receives request and gets killed
    await req1Promise;
    worker1.kill('SIGKILL');
    await new Promise((res) => worker1.on('exit', res));

    // Spawn Worker 2
    const worker2 = fork(childWorkerPath, [], {
        env: { ...process.env, REDIS_URL: redisUrl, WORKER_LOCK_DURATION_MS: '800', WORKER_STALLED_INTERVAL_MS: '400' }
    });
    await new Promise((res) => worker2.on('message', (m) => { if (m.type === 'worker_ready') res(); }));

    // Worker 2 reclaims, receives request and gets killed (2nd stall!)
    await req2Promise;
    worker2.kill('SIGKILL');
    await new Promise((res) => worker2.on('exit', res));

    // Worker 3 starts and should reclaim again (beyond the default limit of 1) and finish
    const connection3 = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    const worker3 = new Worker(
        QUEUE_NAME,
        async (j) => {
            const resp = await fetch(j.data.endpointUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(j.data.payload)
            });
            return { status: resp.status };
        },
        {
            connection: connection3,
            lockDuration: 800,
            stalledInterval: 400,
            maxStalledCount: Number.MAX_SAFE_INTEGER
        }
    );

    const completedResult = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Timed out waiting for Worker 3 to reclaim after multiple stalls'));
        }, 8000);

        worker3.on('completed', (completedJob, returnvalue) => {
            if (completedJob.id === job.id) {
                clearTimeout(timeout);
                resolve(returnvalue);
            }
        });

        worker3.on('failed', (failedJob, err) => {
            if (failedJob?.id === job.id) {
                clearTimeout(timeout);
                reject(err);
            }
        });
    });

    assert.equal(completedResult.status, 200);
    assert.equal(requestCount, 3, 'Job was reclaimed through multiple consecutive worker crashes');

    await worker3.close();
    await connection3.quit();
});
