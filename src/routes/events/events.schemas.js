import { errorResponses } from '../../docs/openapi.js';
const eventPayloadSchema = {
    type: 'object',
    required: ['timestamp', 'type', 'data'],
    properties: {
        timestamp: { type: 'integer', minimum: 0 },
        type: { type: 'string' },
        data: { type: 'object' }
    }
};

export const eventBodySchema = {
    type: 'object',
    required: ['consumerID', 'eventData'],
    properties: {
        consumerID: { type: 'integer', minimum: 1 },
        eventData: eventPayloadSchema
    },
    examples: [
        {
            consumerID: 1,
            eventData: {
                timestamp: 1760000000,
                type: 'payment.succeeded',
                data: {
                    paymentId: 'pay_123'
                }
            }
        }
    ]
};

export const enqueuedEventSchema = {
    type: 'object',
    required: ['eventId', 'payload', 'endpointId'],
    properties: {
        eventId: { type: 'number', minimum: 1 },
        payload: eventPayloadSchema,
        endpointId: { type: 'number', minimum: 1 }
    }
};
export const createEventSchema = {
    body: eventBodySchema,

    response: {
        201: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                event_id: { type: 'integer' }
            },
            examples: [
                {
                    success: true,
                    message: 'Event received',
                    event_id: 7
                }
            ]
        },

        400: errorResponses[400],
        401: errorResponses[401],
        404: errorResponses[404],
        500: errorResponses[500]
    }
};
export const getEventDetailsSchema = {
    response: {
        200: {
            type: 'object',
            additionalProperties: false,
            properties: {
                success: {
                    type: 'boolean'
                },

                event: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        type: { type: 'string' },
                        payload: { type: 'object' },
                        consumerId: {
                            type: 'integer',
                            nullable: true
                        },
                        createdAt: {
                            type: 'string',
                            format: 'date-time'
                        }
                    }
                },

                deliveries: {
                    type: 'array',
                    items: {
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
                    }
                },

                summary: {
                    type: 'object',
                    properties: {
                        total: { type: 'integer' },
                        pending: { type: 'integer' },
                        success: { type: 'integer' },
                        failed: { type: 'integer' }
                    }
                }
            },

            examples: [
                {
                    success: true,
                    event: {
                        id: 7,
                        type: 'payment.succeeded',
                        payload: {
                            timestamp: 1760000000,
                            type: 'payment.succeeded',
                            data: {
                                paymentId: 'pay_123'
                            }
                        },
                        consumerId: 1,
                        createdAt: '2026-09-15T03:00:00.000Z'
                    },
                    deliveries: [
                        {
                            id: 10,
                            status: 'success',
                            eventId: 7,
                            endpointId: 1,
                            createdAt: '2026-09-15T03:00:01.000Z'
                        }
                    ],
                    summary: {
                        total: 1,
                        pending: 0,
                        success: 1,
                        failed: 0
                    }
                }
            ]
        },

        401: errorResponses[401],
        404: errorResponses[404],
        500: errorResponses[500]
    }
};