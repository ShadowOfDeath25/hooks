import Fastify from 'fastify'
import Autoload from '@fastify/autoload'
import * as path from "node:path";
import {fileURLToPath} from "node:url";
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'

const fastify = Fastify({
    logger: true
})
const __dirname = path.dirname(fileURLToPath(import.meta.url));
await fastify.register(fastifySwagger, {
    mode: 'dynamic',
    openapi: {
        info: {
            title: 'Hooks API',
            version: '1.0.0'
        },
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-api-key'
                }
            }
        },
        security: [
            {
                ApiKeyAuth: []
            }
        ]
    }
})

await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs'
})
fastify.register(Autoload, {
    dir: path.join(__dirname, 'plugins')
})

fastify.register(Autoload, {
    dir: path.join(__dirname, 'routes'),
    matchFilter: /.*\.routes\.js$/
});

fastify.get('/', {
    schema: {
        security: [],
        response: {
            200: {
                type: 'object',
                properties: {
                    status: {
                        type: 'string'
                    }
                },
                examples: [
                    {
                        status: 'Ok'
                    }
                ]
            }
        }
    }
}, async function (request, reply) {
    reply.send({status: "Ok"})
})

// Start the server
fastify.listen({ port: 3000, host: '0.0.0.0' }, function (err, address) {
    if (err) {
        fastify.log.error(err);
        process.exit(1);
    }
});
