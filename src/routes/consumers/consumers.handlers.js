import {
	createConsumerService,
	deleteConsumerService,
	listConsumersService,
	updateConsumerService
} from './consumers.services.js';

/**
 * Sends the list of active consumers.
 *
 * @param {import('fastify').FastifyRequest} request - Incoming request with database access.
 * @param {import('fastify').FastifyReply} reply - Fastify response object.
 * @returns {Promise<import('fastify').FastifyReply>} The HTTP response.
 */
export async function listConsumersHandler(request, reply) {
	const consumerList = await listConsumersService(request.server.db);
	return reply.code(200).send(consumerList);
}

/**
 * Creates a consumer from the validated request body.
 *
 * @param {import('fastify').FastifyRequest} request - Incoming request with the consumer name.
 * @param {import('fastify').FastifyReply} reply - Fastify response object.
 * @returns {Promise<import('fastify').FastifyReply>} The HTTP response.
 */
export async function createConsumerHandler(request, reply) {
	const consumer = await createConsumerService(request.server.db, request.body.name);
	return reply.code(201).send(consumer);
}

/**
 * Updates an active consumer's name.
 *
 * @param {import('fastify').FastifyRequest} request - Incoming request with the consumer ID and name.
 * @param {import('fastify').FastifyReply} reply - Fastify response object.
 * @returns {Promise<import('fastify').FastifyReply>} The HTTP response.
 */
export async function updateConsumerHandler(request, reply) {
	const consumer = await updateConsumerService(
		request.server.db,
		request.params.id,
		request.body.name
	);
	return reply.code(200).send(consumer);
}

/**
 * Soft-deletes an active consumer.
 *
 * @param {import('fastify').FastifyRequest} request - Incoming request with the consumer ID.
 * @param {import('fastify').FastifyReply} reply - Fastify response object.
 * @returns {Promise<import('fastify').FastifyReply>} The HTTP response.
 */
export async function deleteConsumerHandler(request, reply) {
	const consumer = await deleteConsumerService(request.server.db, request.params.id);
	return reply.code(200).send(consumer);
}
