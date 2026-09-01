import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';
import {
    findDeliveryContext,
    recordDeliveryAttempt
} from './repositories/deliveries.js';
import { createDeliveryProcessor } from './services/delivery.js';
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

const QUEUE_NAME = 'dummyQueue';

export const dummyQueue = new Queue(QUEUE_NAME, { connection });

const processDelivery = createDeliveryProcessor({
    findContext: findDeliveryContext,
    saveAttempt: recordDeliveryAttempt
});

const worker = new Worker(
    QUEUE_NAME,
    processDelivery,
    { connection }
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
