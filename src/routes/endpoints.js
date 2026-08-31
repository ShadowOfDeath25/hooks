import { endpoints } from '../db/schema/endpoints.js';
import { generateWebhookSecret, encryptSecret } from '../utils/crypto.js';
import { eq } from 'drizzle-orm';

export default async function endpointRoutes(fastify, options) {
    
    /**
     * POST /endpoints
     * Registers a new webhook endpoint.
     */
    fastify.post('/', {
        // Fastify uses AJV for built-in, high-performance input validation.
        schema: {
            body: {
                type: 'object',
                additionalProperties: false,
                required: ['label', 'url', 'consumerId'],
                properties: {
                    label: { type: 'string', minLength: 1, maxLength: 255 },
                    // Use a strict Regex pattern to guarantee it starts with http:// or https://
                    url: { 
                        type: 'string', 
                        pattern: '^https?:\\/\\/(www\\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\\.[a-zA-Z0-9()]{1,6}\\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)$',
                        maxLength: 255 
                    },
                    consumerId: { type: 'integer' }
                }
            },
            // The response schema acts as a strict whitelist, preventing accidental data leaks
            // and making JSON serialization significantly faster.
            response: {
                201: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        label: { type: 'string' },
                        url: { type: 'string' },
                        consumerId: { type: 'integer' },
                        isActive: { type: 'boolean' },
                        createdAt: { type: 'string', format: 'date-time' },
                        secret: { type: 'string' } // The plain text secret, returned only once
                    }
                }
            }
        }
    }, async (request, reply) => {
        const { label, url, consumerId } = request.body;

        // 1. Generate the plain text secret for the user
        const plainTextSecret = generateWebhookSecret();
        
        // 2. Encrypt the secret so we can safely store it in the database
        const encryptedBuffer = encryptSecret(plainTextSecret);
        
        try {
            // 3. Insert the record using Drizzle ORM
            // We use `.returning()` so we don't have to query the DB a second time to get the created row.
            const [newEndpoint] = await fastify.db.insert(endpoints).values({
                label,
                url,
                consumerId,
                signingKey: encryptedBuffer, // Store the bytea buffer, NOT the text!
                isActive: true
            }).returning({
                id: endpoints.id,
                label: endpoints.label,
                url: endpoints.url,
                consumerId: endpoints.consumerId,
                isActive: endpoints.isActive,
                createdAt: endpoints.createdAt
            });

            // 4. Return the record PLUS the plain text secret exactly once.
            // Notice we do not return the `signingKey` buffer to the user.
            return reply.code(201).send({
                ...newEndpoint,
                secret: plainTextSecret
            });
            
        } catch (error) {
            fastify.log.error(error);
            
            // Handle specific database errors (like Foreign Key constraints failing)
            if (error.code === '23503') { // Postgres foreign_key_violation code
                return reply.code(400).send({ error: 'Invalid consumerId. Consumer does not exist.' });
            }
            
            return reply.code(500).send({ error: 'Internal Server Error while creating endpoint.' });
        }
    }); // <--- RESTORED CLOSING BRACE FOR POST ROUTE

    /**
     * GET /endpoints
     * Lists all webhook endpoints for a specific consumer.
     */
    fastify.get('/', {
        schema: {
            querystring: {
                type: 'object',
                additionalProperties: false,
                required: ['consumerId'],
                properties: {
                    consumerId: { type: 'integer' },
                    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
                    offset: { type: 'integer', minimum: 0, default: 0 }
                }
            },
            // Response schema strictly whitelists safe fields (excludes signingKey)
            response: {
                200: {
                    type: 'array',
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            id: { type: 'integer' },
                            label: { type: 'string' },
                            url: { type: 'string' },
                            consumerId: { type: 'integer' },
                            isActive: { type: 'boolean' },
                            createdAt: { type: 'string', format: 'date-time' }
                        }
                    }
                }
            }
        }
    }, async (request, reply) => {
        const { consumerId, limit, offset } = request.query;

        try {
            // Using Drizzle's selection syntax to only pull the exact columns we need.
            const consumerEndpoints = await fastify.db.select({
                id: endpoints.id,
                label: endpoints.label,
                url: endpoints.url,
                consumerId: endpoints.consumerId,
                isActive: endpoints.isActive,
                createdAt: endpoints.createdAt
            })
            .from(endpoints)
            .where(eq(endpoints.consumerId, consumerId))
            .orderBy(endpoints.createdAt)
            .limit(limit)
            .offset(offset);

            return reply.code(200).send(consumerEndpoints);
            
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error while fetching endpoints.' });
        }
    });

}
