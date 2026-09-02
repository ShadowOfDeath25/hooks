import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { consumers } from '../../db/schema/consumers.js';


// initial validation is done by fastify schema validation
export async function validatePayload(payload) {
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