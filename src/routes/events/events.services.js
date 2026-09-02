import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { dummyQueue } from '../../worker.js';
import { events } from '../../db/schema/events.js';
import { endpoints } from '../../db/schema/endpoints.js';
import { validatePayload } from './events.handlers.js';
import { deliveries } from '../../db/schema/deliveries.js';

export async function createEvent(request, reply) {
    const payload = request.body;
    const { consumerID, eventData } = payload;

    try {
        await validatePayload(payload);
    } catch (error) {
        return reply.code(400).send({
            success: false,
            message: error?.cause?.message ?? error?.message,
            stack: error.stack
        });
    }

    try {
        // Insert event into database
        const [createdEvent] = await db.insert(events).values({
            type: eventData.type,
            payload: eventData,
            consumerId: consumerID
        }).returning();
        
        const eventId = createdEvent.id;
        const consumerEndpoints = await db.select().from(endpoints).where(eq(endpoints.consumerId, consumerID));

        if (consumerEndpoints.length === 0) {
            return reply.code(404).send({
                success: false,
                message: `No endpoints found for consumer ID ${consumerID}`
            });
        }
        
        // Create deliveries and enqueue jobs for each endpoint
        for (const endpoint of consumerEndpoints) {

            await db.insert(deliveries).values({
                eventId: eventId,
                endpointId: endpoint.id,
                status: 'pending'
            });

            await dummyQueue.add('dummyQueue', {
                event_id: eventId.toString(),
                payload: eventData,
                endpoint_id: endpoint.id.toString()
            });
        }

        return reply.code(201).send({
            success: true,
            message: 'Event received',
            event_id: eventId
        });
    } catch (error) {
        return reply.code(500).send({
            success: false,
            message: 'Failed to process event',
            error: error?.message,
            stack: error.stack
        });
    }
}