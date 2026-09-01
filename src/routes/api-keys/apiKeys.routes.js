import { createApiKeySchema, deleteApiKeySchema } from './apiKeys.schemas.js'
import { listApiKeysHandler, createApiKeyHandler, deleteApiKeyHandler } from './apiKeys.handlers.js'

/**
 * Authenticated CRUD routes for API keys.
 * Mounted at /api-keys by @fastify/autoload.
 *
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} _opts - Plugin options (unused).
 */
export default async function (fastify, _opts) {
    fastify.get('/', { preHandler: [fastify.authenticate] }, listApiKeysHandler)

    fastify.post('/', { preHandler: [fastify.authenticate], schema: createApiKeySchema }, createApiKeyHandler)

    fastify.delete('/:id', { preHandler: [fastify.authenticate], schema: deleteApiKeySchema }, deleteApiKeyHandler)
}
