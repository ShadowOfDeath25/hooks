import { createEvent, getEventDetails } from './events.handlers.js';
import { createEventSchema, getEventDetailsSchema } from './events.schemas.js';

export default async function eventRoutes(fastify) {
    fastify.post('/', {
        preHandler: [fastify.authenticate],
        schema: createEventSchema
    }, createEvent);

    fastify.get('/:eventId', {
        preHandler: [fastify.authenticate],
        schema: getEventDetailsSchema
    }, getEventDetails);
}

