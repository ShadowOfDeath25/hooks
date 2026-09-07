import {
	createConsumerSchema,
	deleteConsumerSchema,
	listConsumersSchema,
	updateConsumerSchema
} from './consumers.schemas.js';
import {
	createConsumerHandler,
	deleteConsumerHandler,
	listConsumersHandler,
	updateConsumerHandler
} from './consumers.handlers.js';

async function consumerRoutes(fastify) {
	const authenticated = { preHandler: [fastify.authenticate] };

	fastify.get('/', { ...authenticated, schema: listConsumersSchema }, listConsumersHandler);
	fastify.post('/', { ...authenticated, schema: createConsumerSchema }, createConsumerHandler);
	fastify.patch('/:id', { ...authenticated, schema: updateConsumerSchema }, updateConsumerHandler);
	fastify.delete('/:id', { ...authenticated, schema: deleteConsumerSchema }, deleteConsumerHandler);
}

export const autoPrefix = '/consumer';
export default consumerRoutes;
