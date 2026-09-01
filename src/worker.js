import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';
dotenv.config();

if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is missing in environment variables');
}

// 1. Create a bulletproof Redis connection
const connection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
});

connection.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
});

const QUEUE_NAME = 'dummyQueue';

// 2. Export the queue for the server to add jobs
export const dummyQueue = new Queue(QUEUE_NAME, { connection });

// 3. Create the Worker
const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
        console.log(`[Worker] Received job ${job.id} with data:`, job.data);
        
        // Simulate work
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        console.log(`[Worker] Finished processing job ${job.id}`);
        
        // Return success object
        return { status: 'success', message: 'Job processed successfully!' };
    },
    { connection }
);

// 4. Bulletproof Event Listeners
worker.on('completed', (job, returnvalue) => {
    console.log(`[Worker] Job ${job.id} completed! Result:`, returnvalue);
});

worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job.id} failed with error:`, err.message);
});

// CRITICAL: Catch internal worker errors (e.g., Redis connection drops) so the app doesn't crash
worker.on('error', (err) => {
    console.error('[Worker] Internal error:', err.message);
});

// 5. Graceful Shutdown: Ensure jobs finish processing before shutting down
const shutdown = async () => {
    console.log('[Worker] Shutting down gracefully...');
    await worker.close();
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default worker;
