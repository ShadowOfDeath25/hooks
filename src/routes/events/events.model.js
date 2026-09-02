const eventPayloadSchema = {
    type: 'object',
    required: ['timestamp', 'type', 'data'],
    properties: {
        timestamp: { type: 'string', format: 'date-time' },
        type: { type: 'string' },
        data: { type: 'object' }
    }
};

export const eventBodySchema = {
    type: 'object',
    required: ['consumerID', 'eventData'],
    properties: {
        consumerID: { type:'number' },
        eventData: eventPayloadSchema
    }
};

export const eventinQueueSchema = {
    type: 'object',
    required: ['event_id', 'payload', 'endpoint_id'],
    properties: {
        event_id: { type: 'number', required: true },
        payload: eventPayloadSchema,
        endpoint_id: { type: 'number', required: true }
    }
}