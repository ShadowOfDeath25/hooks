import { Worker } from 'bullmq';
import * as dotenv from 'dotenv';
import { QUEUE_NAME, workerConnection } from './queue/queue.js';
import {
    createDeliveryProcessor,
    findDeliveryContext,
    recordDeliveryAttempt
} from './routes/deliveries/deliveries.services.js';
dotenv.config();

console.log('[Worker] Starting up...');
console.log('[Worker] Using connection:', workerConnection);
console.log('[Worker] Starting with queue:', QUEUE_NAME);

const processDelivery = createDeliveryProcessor({
    findContext: findDeliveryContext,
    saveAttempt: recordDeliveryAttempt
});

const worker = new Worker(
    QUEUE_NAME,
    processDelivery,
    { 
        connection: workerConnection,  
        concurrency: parseInt(process.env.WORKER_CONCURRENCY) || 1
    }
);

console.log('[Worker] Worker initialized and ready to process jobs.');
console.log('[Worker] worker with concurrency:', worker.concurrency);
console.log('[Worker] Worker setup complete.');

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
