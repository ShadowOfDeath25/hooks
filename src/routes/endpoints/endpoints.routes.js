import { createEndpointSchema, listEndpointsSchema, updateEndpointSchema, deleteEndpointSchema, putEndpointSchema, restoreEndpointSchema } from './endpoints.schemas.js';
import { createEndpointHandler, listEndpointsHandler, updateEndpointHandler, deleteEndpointHandler, restoreEndpointHandler } from './endpoints.handlers.js';

export default async function endpointRoutes(fastify, options) {
    fastify.post('/', { preHandler: [fastify.authenticate], schema: createEndpointSchema }, createEndpointHandler);
    fastify.get('/', { preHandler: [fastify.authenticate], schema: listEndpointsSchema }, listEndpointsHandler);
    fastify.patch('/:id', { preHandler: [fastify.authenticate], schema: updateEndpointSchema }, updateEndpointHandler);
    fastify.put('/:id', { preHandler: [fastify.authenticate], schema: putEndpointSchema }, updateEndpointHandler); // PUT aliases to PATCH handler
    fastify.delete('/:id', { preHandler: [fastify.authenticate], schema: deleteEndpointSchema }, deleteEndpointHandler);
    fastify.post('/:id/restore', { preHandler: [fastify.authenticate], schema: restoreEndpointSchema }, restoreEndpointHandler);
}
export const autoPrefix = '/consumers/:consumerId/endpoints';
