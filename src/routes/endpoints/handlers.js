import { createEndpointService, getConsumerEndpointsService } from './services.js';

export async function createEndpointHandler(request, reply) {
    const { label, url, consumerId } = request.body;

    try {
        const { newEndpoint, plainTextSecret } = await createEndpointService(label, url, consumerId);

        // 4. Return the record PLUS the plain text secret exactly once.
        // Notice we do not return the `signingKey` buffer to the user.
        return reply.code(201).send({
            ...newEndpoint,
            secret: plainTextSecret
        });
        
    } catch (error) {
        request.log.error(error);
        
        // Handle specific database errors (like Foreign Key constraints failing)
        if (error.code === '23503') { // Postgres foreign_key_violation code
            return reply.code(400).send({ error: 'Invalid consumerId. Consumer does not exist.' });
        }
        
        return reply.code(500).send({ error: 'Internal Server Error while creating endpoint.' });
    }
}

export async function listEndpointsHandler(request, reply) {
    const { consumerId, limit, offset } = request.query;

    try {
        const consumerEndpoints = await getConsumerEndpointsService(consumerId, limit, offset);
        return reply.code(200).send(consumerEndpoints);
        
    } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ error: 'Internal Server Error while fetching endpoints.' });
    }
}
