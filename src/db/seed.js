import 'dotenv/config';
import { db } from './index.js';
import { consumers } from './schema/consumers.js';
import { endpoints } from './schema/endpoints.js';
import { events } from './schema/events.js';
import { deliveries } from './schema/deliveries.js';
import { attempts } from './schema/attempts.js';
import { apiKeys } from './schema/apiKeys.js';
import crypto from 'crypto';

async function clear() {
    // Delete in reverse-dependency order to respect FK constraints
    await db.delete(attempts);
    await db.delete(deliveries);
    await db.delete(events);
    await db.delete(endpoints);
    await db.delete(consumers);
    await db.delete(apiKeys);
    console.log('Cleared existing data');
}

async function seed() {
    await clear();

    // --- api_keys (standalone) ---
    const insertedApiKeys = await db.insert(apiKeys).values([
        { label: 'local-dev-key', hash: crypto.createHash('sha256').update('dev-secret-1').digest('hex') },
        { label: 'ci-test-key', hash: crypto.createHash('sha256').update('dev-secret-2').digest('hex') },
    ]).returning();
    console.log(`Inserted ${insertedApiKeys.length} api_keys`);

    // --- consumers ---
    const insertedConsumers = await db.insert(consumers).values([
        { name: 'Acme Corp' },
        { name: 'Globex Inc' },
        { name: 'Initech' },
    ]).returning();
    console.log(`Inserted ${insertedConsumers.length} consumers`);
    const [acme, globex, initech] = insertedConsumers;

    // --- endpoints (2 per consumer) ---
    // signingKey is bytea + notNull, so every row needs a real Buffer value.
    const insertedEndpoints = await db.insert(endpoints).values([
        { label: 'Acme primary', url: 'https://acme.example.com/webhooks/primary', consumerId: acme.id, signingKey: crypto.randomBytes(32) },
        { label: 'Acme backup', url: 'https://acme.example.com/webhooks/backup', consumerId: acme.id, isActive: false, signingKey: crypto.randomBytes(32) },
        { label: 'Globex main', url: 'https://hooks.globex.example.com/inbound', consumerId: globex.id, signingKey: crypto.randomBytes(32) },
        { label: 'Initech main', url: 'https://api.initech.example.com/hooks/receive', consumerId: initech.id, signingKey: crypto.randomBytes(32) },
    ]).returning();
    console.log(`Inserted ${insertedEndpoints.length} endpoints`);
    const [acmePrimary, acmeBackup, globexMain, initechMain] = insertedEndpoints;

    // --- events ---
    const insertedEvents = await db.insert(events).values([
        {
            type: 'job.test',
            payload: { timestamp: new Date().toISOString(), type: 'job.test', data: { message: 'hello!' } },
            consumerId: acme.id,
        },
        {
            type: 'order.created',
            payload: { timestamp: new Date().toISOString(), type: 'order.created', data: { orderId: 1001, total: 49.99 } },
            consumerId: acme.id,
        },
        {
            type: 'user.signup',
            payload: { timestamp: new Date().toISOString(), type: 'user.signup', data: { userId: 42, email: 'jane@globex.example.com' } },
            consumerId: globex.id,
        },
        {
            type: 'invoice.paid',
            payload: { timestamp: new Date().toISOString(), type: 'invoice.paid', data: { invoiceId: 'INV-001', amount: 250 } },
            consumerId: initech.id,
        },
    ]).returning();
    console.log(`Inserted ${insertedEvents.length} events`);
    const [testEvent, orderEvent, signupEvent, invoiceEvent] = insertedEvents;

    // --- deliveries ---
    const insertedDeliveries = await db.insert(deliveries).values([
        { eventId: testEvent.id, endpointId: acmePrimary.id, status: 'success' },
        { eventId: testEvent.id, endpointId: acmeBackup.id, status: 'failed' },
        { eventId: orderEvent.id, endpointId: acmePrimary.id, status: 'pending' },
        { eventId: signupEvent.id, endpointId: globexMain.id, status: 'success' },
        { eventId: invoiceEvent.id, endpointId: initechMain.id, status: 'failed' },
    ]).returning();
    console.log(`Inserted ${insertedDeliveries.length} deliveries`);

    // --- attempts (for the failed/success deliveries) ---
    const failedDelivery = insertedDeliveries.find(d => d.status === 'failed' && d.endpointId === acmeBackup.id);
    const successDelivery = insertedDeliveries.find(d => d.status === 'success' && d.endpointId === acmePrimary.id);
    const invoiceFailedDelivery = insertedDeliveries.find(d => d.endpointId === initechMain.id);

    const insertedAttempts = await db.insert(attempts).values([
        { deliveryId: successDelivery.id, duration: 120, statusCode: 200, retrialNumber: 1 },
        { deliveryId: failedDelivery.id, duration: 5000, statusCode: 0, retrialNumber: 1 },
        { deliveryId: failedDelivery.id, duration: 4800, statusCode: 503, retrialNumber: 2 },
        { deliveryId: invoiceFailedDelivery.id, duration: 3000, statusCode: 500, retrialNumber: 1 },
    ]).returning();
    console.log(`Inserted ${insertedAttempts.length} attempts`);

    console.log('Seeding complete.');
}

seed()
    .catch((err) => {
        console.error('Seeding failed:', err.cause ?? err);
        process.exitCode = 1;
    })
    .finally(() => process.exit());