import { createEvent } from './events.handlers.js';
import { eventBodySchema } from './events.schemas.js';

export default async function eventRoutes(fastify) {
    fastify.post('events/', {
        schema: {
            body: eventBodySchema
        }
    }, createEvent);
}

