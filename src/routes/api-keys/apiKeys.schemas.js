/**
 * Schema for POST /apiKeys — request body.
 */
import { errorResponses } from '../../docs/openapi.js';

export const createApiKeySchema = {
    body: {
        type: 'object',
        required: ['label'],
        properties: {
            label: { type: 'string' }
        },
        examples: [
            {
                label: 'Demo key'
            }
        ]
    },

    response: {
        201: {
            type: 'object',
            properties: {
                key: { type: 'string' },
                message: { type: 'string' }
            },
            examples: [
                {
                    key: 'your-generated-api-key',
                    message: 'Store this key securely — it will not be shown again.'
                }
            ]
        },

        400: errorResponses[400],
        401: errorResponses[401],
        422: errorResponses[422],
        500: errorResponses[500]
    }
};


/**
 * Schema for DELETE /apiKeys/:id — route params.
 */
export const deleteApiKeySchema = {
    params: {
        type: 'object',
        required: ['id'],
        properties: {
            id: { type: 'integer' }
        }
    },

    response: {
        204: {
            description: 'API key deleted successfully'
        },

        400: errorResponses[400],
        401: errorResponses[401],
        404: errorResponses[404],
        500: errorResponses[500]
    }
};


export const listApiKeysSchema = {
    response: {
        200: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    label: { type: 'string' }
                }
            },
            examples: [
                [
                    {
                        id: 1,
                        label: 'Demo key'
                    }
                ]
            ]
        },

        401: errorResponses[401],
        500: errorResponses[500]
    }
};