import { createEndpointSchema, listEndpointsSchema } from './schemas.js';
import { createEndpointHandler, listEndpointsHandler } from './handlers.js';

export default async function endpointRoutes(fastify, options) {
    fastify.post('/', { schema: createEndpointSchema }, createEndpointHandler);
    fastify.get('/', { schema: listEndpointsSchema }, listEndpointsHandler);
}
