import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { dummyQueue } from '../worker.js';
import { events } from '../db/schema/events.js';
import { consumers } from '../db/schema/consumers.js';
import { endpoints } from '../db/schema/endpoints.js';
import { deliveries } from '../db/schema/deliveries.js';


// initial validation is done by fastify schema validation
async function validatePayload(payload) {
    const { consumerID, eventData } = payload;
    
    // Validate eventData size (max 1MB)
    const eventDataSize = Buffer.byteLength(JSON.stringify(eventData), 'utf8');
    if (eventDataSize > 1024 * 1024) {
        throw new Error('Event data size exceeds 1MB limit');
    }
    
    // Validate that consumerID exists in DB
    const consumer = await db.select().from(consumers).where(eq(consumers.id, parseInt(consumerID))).limit(1);

    if (!consumer) {
        throw new Error(`Consumer with ID ${consumerID} does not exist`);
    }
}

export async function createEvent(request, reply) {
    const payload = request.body;
    const { consumerID, eventData } = payload;
    const parsedConsumerID = parseInt(consumerID); 

    try {
        await validatePayload(payload);
    } catch (error) {
        return reply.code(400).send({
            success: false,
            message: error.cause.message ?? error.message,
            stack: error.stack
        });
    }

}
