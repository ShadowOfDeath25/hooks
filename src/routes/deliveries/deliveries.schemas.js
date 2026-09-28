import { errorResponses } from '../../docs/openapi.js';
const deliveryProperties = {
	id: { type: 'integer' },
	status: { type: 'string', enum: ['pending', 'enqueued', 'failed', 'success'] },
	eventId: { type: 'integer', nullable: true },
	endpointId: { type: 'integer', nullable: true },
	createdAt: { type: 'string', format: 'date-time' }
};

export const listDeliveriesSchema = {
	querystring: {
		type: 'object',
		additionalProperties: false,
		required: ['startDate', 'endDate'],
		properties: {
			endpointID: { type: 'integer', minimum: 1 },
			consumerID: { type: 'integer', minimum: 1 },
			status: { type: 'string', enum: ['pending', 'enqueued', 'failed', 'success'] },
			startDate: { type: 'integer', minimum: 0, description: 'Unix timestamp in seconds' },
			endDate: { type: 'integer', minimum: 0, description: 'Unix timestamp in seconds' },
			cursor: { type: 'integer', minimum: 1 },
			limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
			ascending: { type: 'boolean', default: true }
		}
	},
	response: {
    200: {
        type: 'object',
        additionalProperties: false,
        required: ['deliveries', 'nextCursor'],
        properties: {
            deliveries: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: deliveryProperties
                }
            },
            nextCursor: {
                type: 'integer',
                nullable: true
            }
        },

        examples: [
            {
                deliveries: [
                    {
                        id: 10,
                        status: 'success',
                        eventId: 7,
                        endpointId: 1,
                        createdAt: '2026-09-15T03:00:01.000Z'
                    }
                ],
                nextCursor: null
            }
        ]
    },

    400: errorResponses[400],
    401: errorResponses[401],
    500: errorResponses[500]
}
};
export const getDeliveryDetailsSchema = {
    response: {
        200: {
            type: 'object',
            properties: {
                success: {
                    type: 'boolean'
                },

                delivery: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        status: { type: 'string' },
                        eventId: {
                            type: 'integer',
                            nullable: true
                        },
                        endpointId: {
                            type: 'integer',
                            nullable: true
                        },
                        createdAt: {
                            type: 'string',
                            format: 'date-time'
                        }
                    }
                },

                attempts: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'integer' },
                            deliveryId: { type: 'integer' },
                            duration: { type: 'integer' },
                            statusCode: {
                                type: 'integer',
                                nullable: true
                            },
                            retrialNumber: { type: 'integer' },
                            createdAt: {
                                type: 'string',
                                format: 'date-time'
                            }
                        }
                    }
                }
            },

            examples: [
                {
                    success: true,
                    delivery: {
                        id: 10,
                        status: 'success',
                        eventId: 7,
                        endpointId: 1,
                        createdAt: '2026-09-15T03:00:01.000Z'
                    },
                    attempts: [
                        {
                            id: 1,
                            deliveryId: 10,
                            duration: 120,
                            statusCode: 200,
                            retrialNumber: 1,
                            createdAt: '2026-09-15T03:00:02.000Z'
                        }
                    ]
                }
            ]
        },

        401: errorResponses[401],
        404: errorResponses[404],
        500: errorResponses[500]
    }
};