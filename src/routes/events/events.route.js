import { createEvent } from './events.controller.js';
import { eventBodySchema } from './events.model.js';

export default async function eventRoutes(fastify) {
    fastify.post('/events', {
        schema: {
            body: eventBodySchema
        }
    }, createEvent);
}

