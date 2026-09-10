import { createEvent } from './events.handlers.js';
import { eventBodySchema } from './events.schemas.js';

export default async function eventRoutes(fastify) {
    fastify.post('/', {
        preHandler: [fastify.authenticate],
        schema: {
            body: eventBodySchema
        }
    }, createEvent);
}

