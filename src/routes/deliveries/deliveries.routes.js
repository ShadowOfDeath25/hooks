import { getDeliveryDetails, listDeliveries } from './deliveries.handlers.js';
import { listDeliveriesSchema } from './deliveries.schemas.js';

export default async function deliveryRoutes(fastify) {
    fastify.get('/:deliveryId', {
        preHandler: [fastify.authenticate]
    }, getDeliveryDetails);

    fastify.get('/', {
        preHandler: [fastify.authenticate],
		schema: listDeliveriesSchema
    }, listDeliveries);
}