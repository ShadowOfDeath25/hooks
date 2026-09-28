import { errorResponses } from '../../docs/openapi.js';

const consumerProperties = {
    id: { type: 'integer' },
    name: { type: 'string', minLength: 1, maxLength: 255 },
    createdAt: { type: 'string', format: 'date-time' },
    deletedAt: { type: 'string', format: 'date-time', nullable: true }
};

const consumerResponse = {
    type: 'object',
    additionalProperties: false,
    properties: consumerProperties,
    examples: [
        {
            id: 1,
            name: 'Demo consumer',
            createdAt: '2026-09-15T03:00:00.000Z',
            deletedAt: null
        }
    ]
};


export const createConsumerSchema = {
    body: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 }
        },
        examples: [
            {
                name: 'Demo consumer'
            }
        ]
    },

    response: {
        201: consumerResponse,
        400: errorResponses[400],
        401: errorResponses[401],
        500: errorResponses[500]
    }
};


export const listConsumersSchema = {
    response: {
        200: {
            type: 'array',
            items: consumerResponse,
            examples: [
                [
                    {
                        id: 1,
                        name: 'Demo consumer',
                        createdAt: '2026-09-15T03:00:00.000Z',
                        deletedAt: null
                    }
                ]
            ]
        },

        401: errorResponses[401],
        500: errorResponses[500]
    }
};


export const updateConsumerSchema = {
    params: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: {
            id: { type: 'integer', minimum: 1 }
        }
    },

    body: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 }
        },
        examples: [
            {
                name: 'Updated consumer'
            }
        ]
    },

    response: {
        200: consumerResponse,
        400: errorResponses[400],
        401: errorResponses[401],
        404: errorResponses[404],
        500: errorResponses[500]
    }
};


export const deleteConsumerSchema = {
    params: updateConsumerSchema.params,

    response: {
        200: consumerResponse,
        400: errorResponses[400],
        401: errorResponses[401],
        404: errorResponses[404],
        500: errorResponses[500]
    }
};