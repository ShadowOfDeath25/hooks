import Fastify from 'fastify';
import './worker.js'; // Start the worker
import { dummyQueue } from './worker.js';

import dbConnector from './plugins/db.js'


import endpointRoutes from './routes/endpoints/index.js'


const fastify = Fastify({
    logger: true
});

// Global Error Handler: Prevents unhandled crypto/system errors from leaking sensitive stack traces to clients.
fastify.setErrorHandler((error, request, reply) => {
    // Fastify's AJV schema validation throws 400 errors. We want to let those pass through normally.
    if (error.statusCode >= 400 && error.statusCode < 500) {
        return reply.send(error);
    }
    
    // For 500 errors (like crypto failing), log the real error but send a safe, generic message.
    request.log.error(error);
    reply.code(500).send({ error: 'Internal Server Error' });
});

fastify.register(dbConnector)

// Register our new endpoint routes under the /endpoints prefix
fastify.register(endpointRoutes, { prefix: '/endpoints' })
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
