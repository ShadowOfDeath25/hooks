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
				deliveries: { type: 'array', items: { type: 'object', properties: deliveryProperties } },
				nextCursor: { type: 'integer', nullable: true }
			}
		}
	}
};
