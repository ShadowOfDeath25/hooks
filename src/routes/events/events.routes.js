import { createEvent } from './events.services.js';
import { eventBodySchema } from './events.schemas.js';

export default async function eventRoutes(fastify) {
    fastify.post('/', {
        schema: {
            body: eventBodySchema
        }
    }, createEvent);
}

