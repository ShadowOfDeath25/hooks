import { createEvent, getEventDetails } from './events.handlers.js';
import { eventBodySchema } from './events.schemas.js';

export default async function eventRoutes(fastify) {
    fastify.post('/', {
        preHandler: [fastify.authenticate],
        schema: {
            body: eventBodySchema
        }
    }, createEvent);

    fastify.get('/:eventId', {
        preHandler: [fastify.authenticate],
        schema: {
            params: {
                type: 'object',
                properties: {
                    eventId: { type: 'integer' }
                },
                required: ['eventId']
            }
        }
    }, getEventDetails);
}

