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
        consumerID: { type:'integer', minimum: 1 },
        eventData: eventPayloadSchema
    }
};

export const enqueuedEventSchema = {
    type: 'object',
    required: ['event_id', 'payload', 'endpoint_id'],
    properties: {
        event_id: { type: 'number', minimum: 1 },
        payload: eventPayloadSchema,
        endpoint_id: { type: 'number', minimum: 1 }
    }
}