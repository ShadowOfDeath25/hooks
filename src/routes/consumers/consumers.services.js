import { and, asc, eq, inArray } from 'drizzle-orm';
import { activeConsumers, consumers } from '../../db/schema/consumers.js';
import { NotFoundError } from '../../errors/NotFoundError.js';

const consumerFields = {
	id: consumers.id,
	name: consumers.name,
	createdAt: consumers.createdAt,
	deletedAt: consumers.deletedAt
};

const activeConsumerFields = {
	id: activeConsumers.id,
	name: activeConsumers.name,
	createdAt: activeConsumers.createdAt,
	deletedAt: activeConsumers.deletedAt
};

/**
 * Lists consumers that have not been soft-deleted.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} db - Database client.
 * @returns {Promise<Array<object>>} Active consumers ordered by creation date.
 */
export async function listConsumersService(db) {
	return db.select(activeConsumerFields)
		.from(activeConsumers)
		.orderBy(asc(activeConsumers.createdAt));
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
		.where(and(
			eq(consumers.id, id),
			inArray(
				consumers.id,
				db.select({ id: activeConsumers.id }).from(activeConsumers)
			)
		))
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
	const [consumer] = await db.update(consumers)
		.set({ deletedAt: new Date() })
		.where(and(
			eq(consumers.id, id),
			inArray(
				consumers.id,
				db.select({ id: activeConsumers.id }).from(activeConsumers)
			)
		))
		.returning(consumerFields);

	if (!consumer) {
		throw new NotFoundError('Consumer not found');
	}

	return consumer;
}
