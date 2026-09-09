import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';
import {
    createDeliveryProcessor,
    findDeliveryContext,
    recordDeliveryAttempt
} from './routes/deliveries/deliveries.services.js';
import { dummyQueue, QUEUE_NAME, initQueue, getRedisUrl } from './queue.js';

dotenv.config();

export { dummyQueue, QUEUE_NAME };

export const workerConnection = new IORedis(getRedisUrl(), {
    maxRetriesPerRequest: null,
});

workerConnection.on('error', (err) => {
    console.error('[Redis-Worker] Connection error:', err.message);
});

export function getWorkerOptions(overrides = {}) {
    return {
        connection: workerConnection,
        lockDuration: Number(process.env.WORKER_LOCK_DURATION_MS) || 30000,
        stalledInterval: Number(process.env.WORKER_STALLED_INTERVAL_MS) || 30000,
        maxStalledCount: Number.MAX_SAFE_INTEGER,
        ...overrides
    };
}

export function createWorkerInstance(processor, options = {}) {
    const workerOptions = getWorkerOptions(options);
    const workerInstance = new Worker(QUEUE_NAME, processor, workerOptions);

    workerInstance.on('completed', (job, returnValue) => {
        console.log(`[Worker] Job ${job.id} completed! Result:`, returnValue);
    });

    workerInstance.on('failed', (job, err) => {
        console.error(`[Worker] Job ${job?.id} failed with error:`, err.message);
    });

    workerInstance.on('error', (err) => {
        console.error('[Worker] Internal error:', err.message);
    });

    workerInstance.on('stalled', (jobId) => {
        console.warn(`[Worker] Job ${jobId} stalled and has been reclaimed by worker!`);
    });

    return workerInstance;
}

const processDelivery = createDeliveryProcessor({
    findContext: findDeliveryContext,
    saveAttempt: recordDeliveryAttempt
});

export const worker = createWorkerInstance(processDelivery, { autorun: false });

export async function initWorker(timeoutMs = 5000) {
    if (!worker.isRunning()) {
        worker.run();
    }
    try {
        await Promise.race([
            worker.waitUntilReady(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Worker readiness check timed out')), timeoutMs)
            )
        ]);
        console.log(`[Worker] Worker initialized and ready for queue "${QUEUE_NAME}".`);
        return worker;
    } catch (err) {
        console.error('[Worker] Failed to initialize worker:', err.message);
        throw err;
    }
}

export const shutdown = async () => {
    console.log('[Worker] Shutting down gracefully...');
    try {
        await worker.close();
        await workerConnection.quit();
    } catch (err) {
        console.error('[Worker] Error during shutdown:', err.message);
    }
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (process.argv[1] && process.argv[1].endsWith('worker.js')) {
    (async () => {
        try {
            await initQueue();
            await initWorker();
        } catch (err) {
            console.error('[Worker] Fatal error on startup:', err.message);
            process.exit(1);
        }
    })();
}

export default worker;
