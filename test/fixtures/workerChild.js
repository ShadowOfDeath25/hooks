import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_NAME, getRedisUrl } from '../../src/queue.js';

const redisUrl = getRedisUrl();
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
        if (process.send) {
            process.send({ type: 'job_started', jobId: job.id });
        }

        if (job.data?.endpointUrl) {
            try {
                await fetch(job.data.endpointUrl, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(job.data.payload || {})
                });
            } catch (err) {
                // Ignore errors if killed mid-flight
            }
        } else {
            // Keep job active until killed
            await new Promise((resolve) => setTimeout(resolve, 60000));
        }

        return { success: true };
    },
    {
        connection,
        lockDuration: Number(process.env.WORKER_LOCK_DURATION_MS) || 1000,
        stalledInterval: Number(process.env.WORKER_STALLED_INTERVAL_MS) || 500,
        maxStalledCount: Number.MAX_SAFE_INTEGER
    }
);

worker.on('ready', () => {
    if (process.send) {
        process.send({ type: 'worker_ready' });
    }
});
