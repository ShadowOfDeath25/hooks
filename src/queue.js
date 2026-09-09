import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';
import fs from 'node:fs';

dotenv.config();

export function getRedisUrl() {
    let url = process.env.REDIS_URL;
    if (!url) {
        throw new Error('REDIS_URL is missing in environment variables');
    }
    if (!fs.existsSync('/.dockerenv')) {
        url = url.replace('://redis:', '://127.0.0.1:').replace('@redis:', '@127.0.0.1:');
    }
    return url;
}

export const QUEUE_NAME = 'dummyQueue';

export const queueConnection = new IORedis(getRedisUrl(), {
    maxRetriesPerRequest: null,
});

queueConnection.on('error', (err) => {
    console.error('[Redis-Queue] Connection error:', err.message);
});

export const dummyQueue = new Queue(QUEUE_NAME, {
    connection: queueConnection
});

export async function initQueue(timeoutMs = 5000) {
    try {
        await Promise.race([
            dummyQueue.waitUntilReady(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Queue readiness check timed out')), timeoutMs)
            )
        ]);
        await queueConnection.ping();
        console.log(`[Queue] Initialized and connected to queue "${QUEUE_NAME}".`);
        return dummyQueue;
    } catch (err) {
        console.error(`[Queue] Failed to initialize queue "${QUEUE_NAME}":`, err.message);
        throw err;
    }
}

export async function closeQueue() {
    await dummyQueue.close();
    await queueConnection.quit();
}
