import Fastify from 'fastify';
import Autoload from '@fastify/autoload';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dummyQueue, initQueue } from './queue.js';
import { initWorker } from './worker.js';

const fastify = Fastify({
    logger: true
});
const __dirname = path.dirname(fileURLToPath(import.meta.url));

fastify.register(Autoload, {
    dir: path.join(__dirname, 'plugins')
});

fastify.register(Autoload, {
    dir: path.join(__dirname, 'routes'),
    matchFilter: /.*\.routes\.js$/
});

fastify.get('/', async function (request, reply) {
    reply.send({ status: 'Ok' });
});

// Endpoint to test the queue with error handling
fastify.post('/test-job', async function (request, reply) {
    try {
        // Add a dummy job to the queue
        const job = await dummyQueue.add('testJob', {
            message: 'Hello from Fastify API!',
            timestamp: Date.now()
        });
        
        reply.send({ success: true, jobId: job.id, message: 'Job added to queue!' });
    } catch (error) {
        fastify.log.error('Failed to add job to queue:', error);
        reply.status(500).send({ success: false, error: 'Internal Server Error while adding job' });
    }
});

// Initialize queue, worker and start the server
async function start() {
    try {
        await initQueue();
        await initWorker();
        const address = await fastify.listen({ port: 3000, host: '0.0.0.0' });
        fastify.log.info(`Server listening at ${address}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}

start();
