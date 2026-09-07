const consumerProperties = {
	id: { type: 'integer' },
	name: { type: 'string', minLength: 1, maxLength: 255 },
	createdAt: { type: 'string', format: 'date-time' },
	deletedAt: { type: 'string', format: 'date-time', nullable: true }
};

const consumerResponse = {
	type: 'object',
	additionalProperties: false,
	properties: consumerProperties
};

export const createConsumerSchema = {
	body: {
		type: 'object',
		additionalProperties: false,
		required: ['name'],
		properties: {
			name: { type: 'string', minLength: 1, maxLength: 255 }
		}
	},
	response: {
		201: consumerResponse
	}
};

export const listConsumersSchema = {
	response: {
		200: {
			type: 'array',
			items: consumerResponse
		}
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
		}
	},
	response: {
		200: consumerResponse
	}
};

export const deleteConsumerSchema = {
	params: updateConsumerSchema.params,
	response: {
		200: consumerResponse
	}
};
