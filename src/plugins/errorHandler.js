import fp from 'fastify-plugin'

/**
 * Global error handler plugin.
 * Maps domain errors (any Error with a `statusCode` property) to proper HTTP
 * responses. Falls back to Fastify's default behaviour for everything else.
 *
 * Covered errors (all carry `statusCode`):
 *   - UnauthorizedError  → 401
 *   - ApiKeyLimitError   → 422
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
async function errorHandler(fastify) {
    fastify.setErrorHandler(function (err, request, reply) {
        if (err.statusCode) {
            return reply.code(err.statusCode).send({ error: err.message })
        }

        // Let Fastify handle validation errors and anything else as-is
        reply.send(err)
    })
}

export default fp(errorHandler)
