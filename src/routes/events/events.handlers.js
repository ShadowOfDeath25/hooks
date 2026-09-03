import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { consumers } from '../../db/schema/consumers.js';
import { NotFoundError } from '../../errors/NotFoundError.js';
import { InvalidRequestError } from '../../errors/InvalidRequestError.js';


// initial validation is done by fastify schema validation
export async function validatePayload(payload) {
    const { consumerID, eventData } = payload;
    const { timestamp, type, data } = eventData;
    
    // Validate timestamp
    if (timestamp > Math.floor(Date.now() / 1000)) {
        throw new InvalidRequestError('Timestamp cannot be in the future');
    }

    // Validate eventData size (max 1MB)
    const eventDataSize = Buffer.byteLength(JSON.stringify(eventData), 'utf8');
    if (eventDataSize > 1024 * 1024) {
        throw new InvalidRequestError('Event data size exceeds 1MB limit');
    }
    
    // Validate that consumerID exists in DB
    const consumer = await db.select().from(consumers).where(eq(consumers.id, consumerID)).limit(1);


    if (consumer.length === 0) {
        throw new NotFoundError(`Consumer with ID ${consumerID} does not exist`);
    }
}