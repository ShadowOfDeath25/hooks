import { createEndpointSchema, listEndpointsSchema, updateEndpointSchema, deleteEndpointSchema, putEndpointSchema } from './endpoints.schemas.js';
import { createEndpointHandler, listEndpointsHandler, updateEndpointHandler, deleteEndpointHandler } from './endpoints.handlers.js';

export default async function endpointRoutes(fastify, options) {
    fastify.post('/', { schema: createEndpointSchema }, createEndpointHandler);
    fastify.get('/', { schema: listEndpointsSchema }, listEndpointsHandler);
    fastify.patch('/:id', { schema: updateEndpointSchema }, updateEndpointHandler);
    fastify.put('/:id', { schema: putEndpointSchema }, updateEndpointHandler); // PUT aliases to PATCH handler
    fastify.delete('/:id', { schema: deleteEndpointSchema }, deleteEndpointHandler);
}
