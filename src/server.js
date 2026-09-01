import Fastify from 'fastify'

import dbConnector from './plugins/db.js'


import endpointRoutes from './routes/endpoints/index.js'


const fastify = Fastify({
    logger: true
})

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
fastify.listen({port: 3000, host: '0.0.0.0'}, function (err, address) {
    if (err) {
        fastify.log.error(err)
        process.exit(1)
    }
})
