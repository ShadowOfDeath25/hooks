import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { deliveryQueue, QUEUE_NAME } from '../../queue/queue.js';
import { events } from '../../db/schema/events.js';
import { endpoints } from '../../db/schema/endpoints.js';
import { deliveries } from '../../db/schema/deliveries.js';
import { NotFoundError } from '../../errors/NotFoundError.js';
import { DBError } from '../../errors/DBError.js';
import { QueueError } from '../../errors/QueueError.js';
import { validatePayload } from './events.services.js';
import { DeliveryStatus } from '../../utils/enums.js';

export async function createEvent(request, reply) {
    const payload = request.body;
    const { consumerID, eventData } = payload;

    console.log('[Events] Create request:', {
        requestId: request.id,
        consumerId: consumerID,
        type: eventData.type,
        payloadSize: Buffer.byteLength(JSON.stringify(eventData), 'utf8')
    });

    await validatePayload(payload);

    const {eventId, consumerEndpoints} = await db.transaction(async (tx) => {
        const [createdEvent] = await tx.insert(events).values({
            type: eventData.type,
            payload: eventData,
            consumerId: consumerID
        }).returning();

        if (!createdEvent) {
            throw new DBError(`Failed to create event for consumer ${consumerID}`);
        }

        console.log('[Events] Event persisted:', {
            requestId: request.id,
            eventId: createdEvent.id,
            consumerId: consumerID,
            type: eventData.type
        });

        const consumerEndpoints = await tx.select()
            .from(endpoints)
            .where(
                and(
                    eq(endpoints.consumerId, consumerID), 
                    eq(endpoints.isActive, true),
                    isNull(endpoints.deletedAt)
                )
            );

        if (consumerEndpoints.length === 0) {
            throw new NotFoundError(`No endpoints found for consumer ID ${consumerID}`);
        }

        const deliveryRecords = await tx.insert(deliveries).values(
            consumerEndpoints.map((endpoint) => ({
                eventId: createdEvent.id,
                endpointId: endpoint.id
            }))
        ).returning();

        if (deliveryRecords.length !== consumerEndpoints.length) {
            throw new DBError(`Failed to create delivery records for event ${createdEvent.id}`);
        }

        console.log('[Events] Delivery records persisted:', {
            requestId: request.id,
            eventId: createdEvent.id,
            count: deliveryRecords.length,
            deliveryIds: deliveryRecords.map((delivery) => delivery.id)
        });

        return {
            eventId: createdEvent.id,
            consumerEndpoints
        };
    });

    const MAX_ATTEMPTS = Number(process.env.RETRY_MAX_ATTEMPTS) || 5;

    const jobs = await deliveryQueue.addBulk( 
        consumerEndpoints.map((endpoint) => ({
            name: QUEUE_NAME,
            data:{
                eventId,
                endpointId: endpoint.id,
                payload: eventData,
            },
            opts: {
                attempts: MAX_ATTEMPTS,
                backoff: { type: 'webhookExponential' }
            }
        }))
    );

    if (jobs.length !== consumerEndpoints.length) {
        await db.transaction(async (tx) => {
            await tx.delete(deliveries).where(eq(deliveries.eventId, eventId));
            await tx.delete(events).where(eq(events.id, eventId));
        });
        throw new QueueError(`Failed to enqueue jobs for event ${eventId}`);
    }

    return reply.code(201).send({
        success: true,
        message: 'Event received',
        event_id: eventId
    });
}

export async function getEventDetails(request, reply) {
    const { eventId } = request.params;

    const event = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    const eventDeliveries = await db.select().from(deliveries).where(eq(deliveries.eventId, parseInt(eventId)));
    const summary = { 
        total: eventDeliveries.length,
        pending: eventDeliveries.filter(delivery => delivery.status === DeliveryStatus.PENDING).length,
        success: eventDeliveries.filter(delivery => delivery.status === DeliveryStatus.SUCCESS).length,
        failed: eventDeliveries.filter(delivery => delivery.status === DeliveryStatus.FAILED).length
     }; 

    console.log('[Events] Fetched event details:', {
        eventId,
        event: event,
        deliveries: eventDeliveries,
        summary: summary
    });

    if (event.length === 0) {
        throw new NotFoundError(`Event with ID ${eventId} does not exist`);
    }

    return reply.code(200).send({
        success: true,
        event: event[0],
        deliveries: eventDeliveries,
        summary: summary
    });
}
