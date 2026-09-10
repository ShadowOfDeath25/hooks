import { and, asc, eq, isNull } from 'drizzle-orm';
import { consumers } from '../../db/schema/consumers.js';
import { endpoints } from '../../db/schema/endpoints.js';
import { NotFoundError } from '../../errors/NotFoundError.js';

const consumerFields = {
	id: consumers.id,
	name: consumers.name,
	createdAt: consumers.createdAt,
	deletedAt: consumers.deletedAt
};

/**
 * Lists consumers that have not been soft-deleted.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} db - Database client.
 * @returns {Promise<Array<object>>} Active consumers ordered by creation date.
 */
export async function listConsumersService(db) {
	return db.select(consumerFields)
		.from(consumers)
		.where(isNull(consumers.deletedAt))
		.orderBy(asc(consumers.createdAt));
}

/**
 * Creates a consumer.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} db - Database client.
 * @param {string} name - Consumer name.
 * @returns {Promise<object>} The created consumer.
 */
export async function createConsumerService(db, name) {
	const [consumer] = await db.insert(consumers)
		.values({ name })
		.returning(consumerFields);

	return consumer;
}

/**
 * Updates an active consumer's name.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} db - Database client.
 * @param {number} id - Consumer ID.
 * @param {string} name - Replacement consumer name.
 * @returns {Promise<object>} The updated consumer.
 * @throws {NotFoundError} If no active consumer has the supplied ID.
 */
export async function updateConsumerService(db, id, name) {
	const [consumer] = await db.update(consumers)
		.set({ name })
		.where(and(eq(consumers.id, id), isNull(consumers.deletedAt)))
		.returning(consumerFields);

	if (!consumer) {
		throw new NotFoundError('Consumer not found');
	}

	return consumer;
}

/**
 * Soft-deletes an active consumer.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} db - Database client.
 * @param {number} id - Consumer ID.
 * @returns {Promise<object>} The soft-deleted consumer.
 * @throws {NotFoundError} If no active consumer has the supplied ID.
 */
export async function deleteConsumerService(db, id) {
	return db.transaction(async (transaction) => {
		const deletedAt = new Date();
		const [consumer] = await transaction.update(consumers)
			.set({ deletedAt, updatedAt: deletedAt })
			.where(and(eq(consumers.id, id), isNull(consumers.deletedAt)))
			.returning(consumerFields);

		if (!consumer) {
			throw new NotFoundError('Consumer not found');
		}

		await transaction.update(endpoints)
			.set({ deletedAt, updatedAt: deletedAt })
			.where(and(eq(endpoints.consumerId, id), isNull(endpoints.deletedAt)));

		return consumer;
	});
}
