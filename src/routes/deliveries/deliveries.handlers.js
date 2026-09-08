import { and, asc, desc, eq, gt, gte, lt, lte, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { deliveries } from '../../db/schema/deliveries.js';
import { attempts } from '../../db/schema/attempts.js';
import { endpoints } from '../../db/schema/endpoints.js';

/**
 * Retrieves a delivery and its recorded delivery attempts.
 *
 * @param {import('fastify').FastifyRequest} request - Incoming request with a delivery ID parameter.
 * @param {import('fastify').FastifyReply} reply - Fastify response object.
 * @returns {Promise<import('fastify').FastifyReply>} The HTTP response.
 */
export async function getDeliveryDetails(request, reply) {
    const { deliveryId } = request.params;
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.id, parseInt(deliveryId))).limit(1);
    const deliveryAttempts = await db.select().from(attempts).where(eq(attempts.deliveryId, parseInt(deliveryId))); 

    if (!delivery) {
        return reply.code(404).send({
            success: false,
            message: `Delivery with ID ${deliveryId} not found`
        });
    }

    return reply.code(200).send({
        success: true,
        delivery: delivery,
        attempts: deliveryAttempts
    });
}


/**
 * Lists deliveries within a Unix timestamp range using keyset pagination.
 * Supports filtering by endpoint, consumer, and delivery status, with ascending order by default.
 *
 * @param {import('fastify').FastifyRequest} request - Incoming request with validated list filters and pagination options.
 * @param {import('fastify').FastifyReply} reply - Fastify response object.
 * @returns {Promise<import('fastify').FastifyReply>} A page of deliveries and the next cursor, if available.
 */
export async function listDeliveries(request, reply) {
    const {
        endpointID,
        consumerID,
        status,
        startDate,
        endDate,
        cursor,
        limit = 50,
        ascending = true
    } = request.query;
    const conditions = [
        gte(deliveries.createdAt, new Date(startDate * 1000)),
        lte(deliveries.createdAt, new Date(endDate * 1000))
    ];

    if (endpointID) {
        conditions.push(eq(deliveries.endpointId, endpointID));
    }

    if (consumerID) {
        conditions.push(eq(endpoints.consumerId, consumerID));
    }

    if (status) {
        conditions.push(eq(deliveries.status, status));
    }

    if (cursor) {
        const [cursorDelivery] = await request.server.db
            .select({ id: deliveries.id, createdAt: deliveries.createdAt })
            .from(deliveries)
            .where(eq(deliveries.id, cursor))
            .limit(1);

        if (cursorDelivery) {
            const comparison = ascending ? gt : lt;
            conditions.push(or(
                comparison(deliveries.createdAt, cursorDelivery.createdAt),
                and(eq(deliveries.createdAt, cursorDelivery.createdAt), comparison(deliveries.id, cursorDelivery.id))
            ));
        }
    }

    const deliveryList = await request.server.db
        .select({
            id: deliveries.id,
            status: deliveries.status,
            eventId: deliveries.eventId,
            endpointId: deliveries.endpointId,
            createdAt: deliveries.createdAt
        })
        .from(deliveries)
        .leftJoin(endpoints, eq(deliveries.endpointId, endpoints.id))
        .where(and(...conditions))
        .orderBy(ascending ? asc(deliveries.createdAt) : desc(deliveries.createdAt), ascending ? asc(deliveries.id) : desc(deliveries.id))
        .limit(limit);

    return reply.code(200).send({
        deliveries: deliveryList,
        nextCursor: deliveryList.length === limit ? deliveryList.at(-1).id : null
    });
}