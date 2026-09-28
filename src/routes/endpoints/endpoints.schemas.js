import { errorResponses } from '../../docs/openapi.js';
export const createEndpointSchema = {
    // Fastify uses AJV for built-in, high-performance input validation.
    params: {
        type: 'object',
        additionalProperties: false,
        required: ['consumerId'],
        properties: {
            consumerId: { type: 'integer', minimum: 1 }
        }
    },
    body: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'url'],
        properties: {
            label: { type: 'string', minLength: 1, maxLength: 255 },
            // Use a strict Regex pattern to guarantee it starts with http:// or https://
            url: {
                type: 'string',
                pattern: '^https?:\\/\\/(www\\.)?[-a-zA-Z0-9@:%._+~#=]{1,255}(\\.[a-zA-Z0-9()]{1,6})?([-a-zA-Z0-9()@:%_+.~#?&/=]*)$',
                maxLength: 255
            }
        },
        examples: [
            {
                label: 'Payment webhook',
                url: 'https://example.com/webhook'
            }
        ]
    },
    // The response schema acts as a strict whitelist, preventing accidental data leaks
    // and making JSON serialization significantly faster.
    response: {
        201: {
            type: 'object',
            additionalProperties: false,
            properties: {
                id: { type: 'integer' },
                label: { type: 'string' },
                url: { type: 'string' },
                consumerId: { type: 'integer', minimum: 1 },
                isActive: { type: 'boolean' },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time', nullable: true },
                deletedAt: { type: 'string', format: 'date-time', nullable: true },
                secret: { type: 'string' }
            },
            examples: [
                {
                    id: 1,
                    label: 'Payment webhook',
                    url: 'https://example.com/webhook',
                    consumerId: 1,
                    isActive: true,
                    createdAt: '2026-09-15T03:00:00.000Z',
                    updatedAt: null,
                    deletedAt: null,
                    secret: 'example-signing-secret'
                }
            ]
        },

        400: errorResponses[400],
        401: errorResponses[401],
        409: errorResponses[409],
        500: errorResponses[500]
    }
};

export const listEndpointsSchema = {
    params: {
        type: 'object',
        additionalProperties: false,
        required: ['consumerId'],
        properties: {
            consumerId: { type: 'integer', minimum: 1 }
        }
    },
    querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'integer', minimum: 0, default: 0 },
            includeInactive: { type: 'boolean', default: false },
            includeDeleted: { type: 'boolean', default: false }
        }
    },
    // Response schema strictly whitelists safe fields (excludes signingKey)
    response: {
        200: {
            type: 'object',
            additionalProperties: false,
            properties: {
                data: {
                    type: 'array',
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            id: { type: 'integer' },
                            label: { type: 'string' },
                            url: { type: 'string' },
                            consumerId: { type: 'integer', minimum: 1 },
                            isActive: { type: 'boolean' },
                            createdAt: { type: 'string', format: 'date-time' },
                            updatedAt: { type: 'string', format: 'date-time', nullable: true },
                            deletedAt: { type: 'string', format: 'date-time', nullable: true }
                        }
                    }
                },
                total: { type: 'integer', minimum: 0 }
            },
            examples: [
                {
                    data: [
                        {
                            id: 1,
                            label: 'Payment webhook',
                            url: 'https://example.com/webhook',
                            consumerId: 1,
                            isActive: true,
                            createdAt: '2026-09-15T03:00:00.000Z',
                            updatedAt: null,
                            deletedAt: null
                        }
                    ],
                    total: 1
                }
            ]
        },

        400: errorResponses[400],
        401: errorResponses[401],
        500: errorResponses[500]
    }
};

export const updateEndpointSchema = {
    // Validate the URL parameter (Fastify safely casts the string to an integer)
    params: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'consumerId'],
        properties: {
            id: { type: 'integer', minimum: 1 },
            consumerId: { type: 'integer', minimum: 1 }
        }
    },
    // Require at least one field to be present for a valid update
    body: {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        properties: {
            label: { type: 'string', minLength: 1, maxLength: 255 },
            url: {
                type: 'string',
                pattern: '^https?:\\/\\/(www\\.)?[-a-zA-Z0-9@:%._+~#=]{1,255}(\\.[a-zA-Z0-9()]{1,6})?([-a-zA-Z0-9()@:%_+.~#?&/=]*)$',
                maxLength: 255
            },
            isActive: { type: 'boolean' }
        },
        examples: [
            {
                label: 'Updated payment webhook',
                url: 'https://example.com/new-webhook',
                isActive: true
            }
        ]
    },
    // Strict response whitelist to prevent data leaks (like signingKey)
    response: {
        200: {
            type: 'object',
            additionalProperties: false,
            properties: {
                id: { type: 'integer' },
                label: { type: 'string' },
                url: { type: 'string' },
                consumerId: { type: 'integer' },
                isActive: { type: 'boolean' },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time', nullable: true },
                deletedAt: { type: 'string', format: 'date-time', nullable: true }
            },
            examples: [
                {
                    id: 1,
                    label: 'Updated payment webhook',
                    url: 'https://example.com/new-webhook',
                    consumerId: 1,
                    isActive: true,
                    createdAt: '2026-09-15T03:00:00.000Z',
                    updatedAt: '2026-09-15T04:00:00.000Z',
                    deletedAt: null
                }
            ]
        },

        400: errorResponses[400],
        401: errorResponses[401],
        404: errorResponses[404],
        409: errorResponses[409],
        500: errorResponses[500]
    }
};

export const deleteEndpointSchema = {
    // Validate the URL parameter
    params: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'consumerId'],
        properties: {
            id: { type: 'integer', minimum: 1 },
            consumerId: { type: 'integer', minimum: 1 }
        }
    },
    // Return the soft-deleted object to confirm the new isActive state
    response: {
        200: {
            type: 'object',
            additionalProperties: false,
            properties: {
                id: { type: 'integer' },
                label: { type: 'string' },
                url: { type: 'string' },
                consumerId: { type: 'integer' },
                isActive: { type: 'boolean' },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time', nullable: true },
                deletedAt: { type: 'string', format: 'date-time', nullable: true }
            },
            examples: [
                {
                    id: 1,
                    label: 'Payment webhook',
                    url: 'https://example.com/webhook',
                    consumerId: 1,
                    isActive: false,
                    createdAt: '2026-09-15T03:00:00.000Z',
                    updatedAt: '2026-09-15T04:00:00.000Z',
                    deletedAt: '2026-09-15T04:00:00.000Z'
                }
            ]
        },

        400: errorResponses[400],
        401: errorResponses[401],
        404: errorResponses[404],
        500: errorResponses[500]
    }
};

export const putEndpointSchema = {
    ...updateEndpointSchema,
    body: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'url', 'isActive'],
        properties: updateEndpointSchema.body.properties,
        examples: [
            {
                label: 'Payment webhook',
                url: 'https://example.com/webhook',
                isActive: true
            }
        ]
    }
};

export const restoreEndpointSchema = {
    params: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'consumerId'],
        properties: {
            id: { type: 'integer', minimum: 1 },
            consumerId: { type: 'integer', minimum: 1 }
        }
    },
    response: {
        200: {
            type: 'object',
            additionalProperties: false,
            properties: {
                id: { type: 'integer' },
                label: { type: 'string' },
                url: { type: 'string' },
                consumerId: { type: 'integer' },
                isActive: { type: 'boolean' },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time', nullable: true },
                deletedAt: { type: 'string', format: 'date-time', nullable: true }
            },
            examples: [
                {
                    id: 1,
                    label: 'Payment webhook',
                    url: 'https://example.com/webhook',
                    consumerId: 1,
                    isActive: true,
                    createdAt: '2026-09-15T03:00:00.000Z',
                    updatedAt: '2026-09-15T05:00:00.000Z',
                    deletedAt: null
                }
            ]
        },

        400: errorResponses[400],
        401: errorResponses[401],
        404: errorResponses[404],
        409: errorResponses[409],
        500: errorResponses[500]
    }
};
