import Fastify from 'fastify';
import './worker.js'; // Start the worker
import { dummyQueue } from './worker.js';

import dbConnector from './plugins/db.js';
import eventRoutes from './routes/events/events.route.js';

const fastify = Fastify({
    logger: true
});

fastify.register(dbConnector);
fastify.register(eventRoutes);

fastify.get('/', async function (request, reply) {
    reply.send({status: "Ok"})
})

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

// Start the server
fastify.listen({ port: 3000, host: '0.0.0.0' }, function (err, address) {
    if (err) {
        fastify.log.error(err);
        process.exit(1);
    }
});
