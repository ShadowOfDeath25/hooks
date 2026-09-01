import { createEndpointSchema, listEndpointsSchema, updateEndpointSchema, deleteEndpointSchema } from './schemas.js';
import { createEndpointHandler, listEndpointsHandler, updateEndpointHandler, deleteEndpointHandler } from './handlers.js';

export default async function endpointRoutes(fastify, options) {
    fastify.post('/', { schema: createEndpointSchema }, createEndpointHandler);
    fastify.get('/', { schema: listEndpointsSchema }, listEndpointsHandler);
    fastify.patch('/:id', { schema: updateEndpointSchema }, updateEndpointHandler);
    fastify.delete('/:id', { schema: deleteEndpointSchema }, deleteEndpointHandler);
}
