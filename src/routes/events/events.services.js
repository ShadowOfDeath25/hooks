import { eq ,and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { dummyQueue } from '../../worker.js';
import { events } from '../../db/schema/events.js';
import { endpoints } from '../../db/schema/endpoints.js';
import { validatePayload } from './events.handlers.js';
import { deliveries } from '../../db/schema/deliveries.js';
import { NotFoundError } from '../../errors/NotFoundError.js';
import { DBError } from '../../errors/DBError.js';
import { QueueError } from '../../errors/QueueError.js';

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

    let eventId;
    let consumerEndpoints;

    ({ eventId, consumerEndpoints } = await db.transaction(async (tx) => {
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
            .where(and(eq(endpoints.consumerId, consumerID), eq(endpoints.isActive, true)));

        if (consumerEndpoints.length === 0) {
            throw new NotFoundError(`No endpoints found for consumer ID ${consumerID}`);
        }

        console.log('[Events] Active endpoints found:', {
            requestId: request.id,
            eventId: createdEvent.id,
            consumerId: consumerID,
            count: consumerEndpoints.length,
            endpointIds: consumerEndpoints.map((endpoint) => endpoint.id)
        });

        let deliveryRecords = await tx.insert(deliveries).values(
            consumerEndpoints.map((endpoint) => ({
                eventId: createdEvent.id,
                endpointId: endpoint.id,
                status: 'pending'
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
    }));

    for (const endpoint of consumerEndpoints) {
        const jobData = {
            event_id: eventId,
            payload: eventData,
            endpoint_id: endpoint.id
        };
        const job = await dummyQueue.add('dummyQueue', jobData);

        if (!job) {
            throw new QueueError(`Failed to enqueue job for event ${eventId} and endpoint ${endpoint.id}`);
        }

        console.log('[Events] Delivery job enqueued:', {
            jobId: job.id,
            queue: dummyQueue.name,
            eventId,
            endpointId: endpoint.id,
            data: jobData
        });
    }

    console.log('[Events] Event processing complete:', {
        requestId: request.id,
        eventId,
        endpointCount: consumerEndpoints.length
    });

    return reply.code(201).send({
        success: true,
        message: 'Event received',
        event_id: eventId
    });
}