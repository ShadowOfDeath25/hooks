import fp from 'fastify-plugin'
import {validateApiKey} from '../routes/api-keys/apiKeys.service.js'
import {UnauthorizedError} from '../errors/UnauthorizedError.js'


/**
 * Fastify plugin that decorates the instance with an `authenticate` preHandler.
 * Automatically loaded by @fastify/autoload from the plugins directory.
 * Wrapped with fastify-plugin to share the decorator across the whole app scope.
 */
async function authenticate(fastify) {
    /**
     * Prehandler that protects routes requiring a valid API key.
     * Reads the raw key from the `x-api-key` request header, then delegates
     * validation to the apiKeyService. Throws an UnauthorizedError (HTTP 401)
     * if the header is missing or the key is not found in the database.
     *
     * @param {import('fastify').FastifyRequest} request
     * @throws {UnauthorizedError}
     */
    fastify.decorate('authenticate', async function (request) {
        const key = request.headers['x-api-key']
        const isValid = await validateApiKey(key)
        if (!isValid) throw new UnauthorizedError()
    })
}

export default fp(authenticate)
