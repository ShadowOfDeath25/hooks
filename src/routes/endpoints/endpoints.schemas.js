const URL_REGEX = String.raw`^https?:\/\/(?:localhost|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)|\[[0-9a-fA-F:]+\]|(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63})(?::(?:6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3}))?(?:[\/?#][^\s]*)?$`;
const LABEL_REGEX = String.raw`^\S(.*?\S)?$`;

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
            label: { type: 'string', minLength: 1, maxLength: 255, pattern: LABEL_REGEX },
            url: { 
                type: 'string', 
                pattern: URL_REGEX,
                maxLength: 255 
            }
        }
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
            }
        }
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
            }
        }
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
            label: { type: 'string', minLength: 1, maxLength: 255, pattern: LABEL_REGEX },
            url: { 
                type: 'string', 
                pattern: URL_REGEX,
                maxLength: 255 
            },
            isActive: { type: 'boolean' }
        }
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
            }
        }
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
            }
        }
    }
};

export const putEndpointSchema = {
    ...updateEndpointSchema,
    body: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'url', 'isActive'],
        properties: updateEndpointSchema.body.properties
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
            }
        }
    }
};
