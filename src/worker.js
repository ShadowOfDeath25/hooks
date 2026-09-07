import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';
import {
    createDeliveryProcessor,
    findDeliveryContext,
    recordDeliveryAttempt
} from './routes/deliveries/deliveries.services.js';
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
const RETRY_MAX_DELAY = Number(process.env.RETRY_MAX_DELAY) || 60000;

const customBackoffStrategy = (attemptsMade, type, err, job) => {
    if (type === 'webhookExponential') {
        const delay = RETRY_BASE_DELAY * Math.pow(RETRY_MULTIPLIER, attemptsMade - 1);
        return Math.min(delay, RETRY_MAX_DELAY);
    }
    return 1000;
};

const QUEUE_NAME = 'dummyQueue';

export const dummyQueue = new Queue(QUEUE_NAME, { 
    connection,
    settings: {
        backoffStrategy: customBackoffStrategy
    }
});

import { db } from './db/index.js';
import {
    resetEndpointFailuresService,
    incrementEndpointFailuresService,
    verifyAndAutoDisableEndpointService
} from './routes/endpoints/endpoints.services.js';

const processDelivery = createDeliveryProcessor({
    findContext: findDeliveryContext,
    saveAttempt: recordDeliveryAttempt,
    resetFailures: (endpointId) => resetEndpointFailuresService(db, endpointId),
    incrementFailures: (endpointId) => incrementEndpointFailuresService(db, endpointId),
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
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default worker;
