export const createEndpointSchema = {
    // Fastify uses AJV for built-in, high-performance input validation.
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
                secret: { type: 'string' }
            }
        }
    }
};

export const listEndpointsSchema = {
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
};
