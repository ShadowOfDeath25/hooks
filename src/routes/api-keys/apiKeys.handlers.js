import { generateApiKey } from '../../services/apiKeyService.js'
import { apiKeys } from '../../db/schema/apiKeys.js'
import { eq } from 'drizzle-orm'

/**
 * GET /api-keys
 * Returns all API keys (id and label only — no raw keys or hashes).
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} _reply
 */
export async function listApiKeysHandler(request, _reply) {
    return request.server.db
        .select({ id: apiKeys.id, label: apiKeys.label })
        .from(apiKeys)
}

/**
 * POST /api-keys
 * Creates a new API key.
 * Returns the raw key (shown only once) along with a security reminder.
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 */
export async function createApiKeyHandler(request, reply) {
    const { label } = request.body
    const { fullKey } = await generateApiKey(label)
    reply.code(201)
    return {
        key: fullKey,
        message: 'Store this key securely — it will not be shown again.'
    }
}

/**
 * DELETE /api-keys/:id
 * Deletes an API key by its numeric id.
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 */
export async function deleteApiKeyHandler(request, reply) {
    const { id } = request.params

    const result = await request.server.db
        .delete(apiKeys)
        .where(eq(apiKeys.id, id))
        .returning({ id: apiKeys.id })

    if (result.length === 0) {
        return reply.code(404).send({ error: `API key with id ${id} not found.` })
    }

    return reply.code(204).send()
}
