import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';
import {
    createDeliveryProcessor,
    findDeliveryContext,
    recordDeliveryAttempt
} from './routes/deliveries/deliveries.services.js';
import { createWebhookRateLimiter } from './utils/rateLimiter.js';
import { db } from './db/index.js';
import {
    verifyAndAutoDisableEndpointService
} from './routes/endpoints/endpoints.services.js';

dotenv.config();

if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is missing in environment variables');
}

const connection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
});

connection.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
});

const RETRY_BASE_DELAY = Number(process.env.RETRY_BASE_DELAY) || 1000;
const RETRY_MULTIPLIER = Number(process.env.RETRY_MULTIPLIER) || 2;
const RETRY_MAX_DELAY = Number(process.env.RETRY_MAX_DELAY) || 3600000; // Default to 1 hour

const customBackoffStrategy = (attemptsMade, type, err, job) => {
    if (type === 'webhookExponential') {
        const baseDelay = RETRY_BASE_DELAY * Math.pow(RETRY_MULTIPLIER, attemptsMade - 1);
        const cappedDelay = Math.min(baseDelay, RETRY_MAX_DELAY);
        return Math.floor(cappedDelay * (0.5 + Math.random() * 0.5)); // ±50% jitter
    }
    return 1000;
};

const QUEUE_NAME = 'dummyQueue';

export const dummyQueue = new Queue(QUEUE_NAME, { connection });

export const rateLimiter = createWebhookRateLimiter({ connection });

const processDelivery = createDeliveryProcessor({
    findContext: findDeliveryContext,
    saveAttempt: recordDeliveryAttempt,
    rateLimiter,
    verifyAndDisable: (endpointId) => verifyAndAutoDisableEndpointService(db, endpointId, Number(process.env.WEBHOOK_MAX_FAILURES) || 5)
});

const worker = new Worker(
    QUEUE_NAME,
    processDelivery,
    { 
        connection,
        settings: {
            backoffStrategy: customBackoffStrategy
        }
    }
);

worker.on('completed', (job, returnvalue) => {
    console.log(`[Worker] Job ${job.id} completed! Result:`, returnvalue);
});

worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job.id} failed with error:`, err.message);
});

worker.on('error', (err) => {
    console.error('[Worker] Internal error:', err.message);
});

const shutdown = async () => {
    console.log('[Worker] Shutting down gracefully...');
    await worker.close();
    await rateLimiter.disconnect();
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default worker;
