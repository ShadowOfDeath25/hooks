/**
 * Worker Crash Recovery Test
 *
 * Scenario:
 *   1. A job is added to the queue.
 *   2. Worker A picks it up but "crashes" — simulated by force-closing the
 *      worker (worker.close(true)) while it still holds the job lock, so the
 *      job is never acknowledged.
 *   3. BullMQ's stalled-job checker notices the lock has expired and moves the
 *      job back to the waiting state.
 *   4. Worker B picks up the job and completes it successfully.
 *
 * Stall detection is made fast by using a very short lockDuration (500 ms) and
 * stalledInterval (200 ms), so the whole scenario runs in well under 10 s.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isDocker = process.env.REDIS_URL ? true : false; // basic fallback
const defaultRedisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_URL = process.env.TEST_REDIS_URL || defaultRedisUrl;
const QUEUE_NAME = `crash-recovery-test-${Date.now()}`;

/** Create a fresh Redis connection. */
function makeRedis() {
    const conn = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    conn.setMaxListeners(20);
    return conn;
}

/**
 * Create a Worker with very short lock/stall settings so detection is fast.
 *
 * @param {string}   name      – Human-readable label used in logs.
 * @param {Function} processor – BullMQ job processor function.
 * @param {object}   [extra]   – Additional Worker option overrides.
 */
function makeWorker(name, processor, extra = {}) {
    const conn = makeRedis();
    const worker = new Worker(QUEUE_NAME, processor, {
        connection: conn,
        lockDuration: 500,      // lock expires after 500 ms
        stalledInterval: 200,   // check for stalled jobs every 200 ms
        maxStalledCount: 1,     // allow 1 stall before marking the job failed
        ...extra,
    });
    worker.on('error', (err) =>
        console.error(`[${name}] error:`, err.message)
    );
    return { worker, conn };
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test('crashed worker: job is recovered and completed by a second worker', async (t) => {
    // ── Shared state ─────────────────────────────────────────────────────────
    const processedBy     = [];      // records which worker finished the job
    let   workerAPickedUp = false;

    // A promise that resolves the moment Worker A has the job in its processor.
    let signalWorkerAPickedUp;
    const workerAPickedUpPromise = new Promise(
        (res) => { signalWorkerAPickedUp = res; }
    );

    // ── Queue ────────────────────────────────────────────────────────────────
    const queueConn = makeRedis();

    const queue = new Queue(QUEUE_NAME, {
        connection: queueConn,
        defaultJobOptions: {
            attempts: 2,
            removeOnComplete: true,
            removeOnFail: true,
        },
    });

    // ── Worker A: crashes as soon as it picks up the job ─────────────────────
    // The processor signals pick-up, then hangs indefinitely.  We force-close
    // the worker from outside, simulating an abrupt crash.
    const { worker: workerA, conn: connA } = makeWorker(
        'WorkerA',
        async (_job) => {
            workerAPickedUp = true;
            signalWorkerAPickedUp();
            await new Promise(() => {}); // never resolves — hangs until force-closed
        }
    );

    // ── Worker B: the recovery worker ────────────────────────────────────────
    const { worker: workerB, conn: connB } = makeWorker(
        'WorkerB',
        async (_job) => {
            // Only count recoveries that happen after A has claimed the job,
            // so we do not race with A being too slow to start.
            if (workerAPickedUp) {
                processedBy.push('WorkerB');
            }
            return { recovered: true };
        }
    );

    // ── Cleanup (registered early so it always runs) ─────────────────────────
    t.after(async () => {
        await workerA.close(true).catch(() => {});
        await workerB.close(true).catch(() => {});
        await queue.obliterate({ force: true }).catch(() => {});
        await queue.close();
        for (const c of [queueConn, connA, connB]) {
            await c.quit().catch(() => {});
        }
    });

    // ── Step 1: wait for both workers to be ready, then add the job ──────────
    await Promise.all([
        workerA.waitUntilReady(),
        workerB.waitUntilReady(),
    ]);

    const job = await queue.add('delivery', {
        eventId:    1,
        endpointId: 42,
        payload:    { test: true },
    });

    // ── Step 2: wait for Worker A to pick up the job ─────────────────────────
    await Promise.race([
        workerAPickedUpPromise,
        delay(5_000).then(() => {
            throw new Error('Timed out waiting for Worker A to pick up the job');
        }),
    ]);

    assert.ok(workerAPickedUp, 'Worker A should have started processing the job');

    // ── Step 3: simulate the crash by force-closing Worker A ─────────────────
    // force=true disconnects immediately without waiting for jobs to finish,
    // leaving the job lock to expire naturally.
    await workerA.close(true);

    // ── Step 4: wait for Worker B to complete the recovered job ──────────────
    // With lockDuration=500 ms and stalledInterval=200 ms stall detection should
    // happen within ~700 ms.  We allow 8 s as a generous upper bound.
    const jobCompleted = new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('Timed out waiting for Worker B to complete the recovered job')),
            8_000
        );

        workerB.on('completed', (completedJob) => {
            if (completedJob.id === job.id) {
                clearTimeout(timer);
                resolve();
            }
        });

        workerB.on('failed', (failedJob, err) => {
            if (failedJob?.id === job.id) {
                clearTimeout(timer);
                reject(new Error(`Job failed instead of being recovered: ${err.message}`));
            }
        });
    });

    await jobCompleted;

    // ── Assertions ────────────────────────────────────────────────────────────
    assert.ok(
        processedBy.includes('WorkerB'),
        'Worker B should have processed the recovered job'
    );
    assert.equal(
        processedBy.length,
        1,
        'The job should have been completed exactly once by the recovery worker'
    );
});
