import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';
dotenv.config();

if (!process.env.REDIS_URL) {
    throw new Error(`REDIS_URL is missing in environment variables`);
}

export const producerConnection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: parseInt(process.env.PRODUCER_MAX_RETRIES_PER_REQUEST) || 3,
    connectTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT) || 10000,
    commandTimeout: parseInt(process.env.COMMAND_TIMEOUT) || 5000,
});

export const workerConnection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
});

producerConnection.on('error', (err) => {
    console.error('[Redis] Producer connection error:', err.message);
});

workerConnection.on('error', (err) => {
    console.error('[Redis] Worker connection error:', err.message);
});

export const QUEUE_NAME = 'deliveryQueue';

export const deliveryQueue = new Queue(QUEUE_NAME, { connection: producerConnection });