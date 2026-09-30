import 'dotenv/config';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Automated example publisher.
 *
 * Publishes an event to the Hooks API on a fixed interval so the whole
 * pipeline (API -> queue -> worker -> signed HTTP delivery -> example
 * receiver) can be demonstrated without any manual requests.
 */

const API_URL = (process.env.HOOKS_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const API_KEY = process.env.HOOKS_API_KEY ?? 'dev-secret-1';
const CONSUMER_NAME = process.env.EXAMPLE_CONSUMER_NAME ?? 'Mock server';
const EVENT_TYPE = process.env.EXAMPLE_EVENT_TYPE ?? 'example.ping';
const INTERVAL_MS = Number(process.env.EXAMPLE_PUBLISH_INTERVAL_MS ?? 5000);
const EVENT_COUNT = Number(process.env.EXAMPLE_EVENT_COUNT ?? 0); // 0 = publish forever
const SUMMARY_DELAY_MS = Number(process.env.EXAMPLE_SUMMARY_DELAY_MS ?? 1500);
const STARTUP_TIMEOUT_MS = Number(process.env.EXAMPLE_STARTUP_TIMEOUT_MS ?? 60000);
const MAX_INTERVAL_MS = Number(process.env.EXAMPLE_MAX_PUBLISH_INTERVAL_MS ?? 60000);

let isRunning = true;

/**
 * Sends a JSON request to the Hooks API with the example API key attached.
 *
 * @param {string} endpointPath - Path starting with `/`, e.g. `/events`.
 * @param {object} [options] - Fetch options.
 * @param {string} [options.method] - HTTP method, defaults to GET.
 * @param {object} [options.body] - Body serialised as JSON.
 * @returns {Promise<{status: number, body: unknown}>} Status code and parsed body.
 */
export async function apiRequest(endpointPath, { method = 'GET', body } = {}) {
    const response = await fetch(`${API_URL}${endpointPath}`, {
        method,
        headers: {
            'content-type': 'application/json',
            'x-api-key': API_KEY
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });

    const text = await response.text();

    let parsed;

    try {
        parsed = text ? JSON.parse(text) : null;
    } catch {
        parsed = text;
    }

    return { status: response.status, body: parsed };
}

/**
 * Builds the request body for POST /events.
 *
 * @param {number} consumerId - Consumer that owns the receiving endpoints.
 * @param {number} sequence - Counter used to make each payload identifiable.
 * @returns {object} Body accepted by the events route schema.
 */
export function buildEventBody(consumerId, sequence) {
    return {
        consumerID: consumerId,
        eventData: {
            // The API rejects timestamps in the future, so use whole seconds.
            timestamp: Math.floor(Date.now() / 1000),
            type: EVENT_TYPE,
            data: {
                sequence,
                message: `Automated example event #${sequence}`,
                publishedAt: new Date().toISOString()
            }
        }
    };
}

/**
 * Blocks until the API answers on `/`, so the publisher survives being
 * started before the API container is ready.
 *
 * @param {number} [timeoutMs] - How long to keep retrying.
 * @throws {Error} If the API never becomes reachable in time.
 */
export async function waitForApi(timeoutMs = STARTUP_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${API_URL}/`);

            if (response.ok) {
                console.log(`[Publisher] API is reachable at ${API_URL}`);
                return;
            }
        } catch {
            // API not up yet, keep polling.
        }

        await delay(1000);
    }

    throw new Error(`API at ${API_URL} did not become reachable within ${timeoutMs}ms`);
}

/**
 * Finds the consumer the example publishes to, creating it when missing.
 *
 * @returns {Promise<number>} The consumer ID.
 * @throws {Error} If the API key is rejected or the consumer cannot be created.
 */
export async function resolveConsumerId() {
    const listed = await apiRequest('/consumers');

    if (listed.status === 401) {
        throw new Error(
            'The API rejected HOOKS_API_KEY (401). Seed the database with `npm run db:seed` ' +
            'or create a key with `npm run api:generate-key -- example` and export HOOKS_API_KEY.'
        );
    }

    if (listed.status !== 200 || !Array.isArray(listed.body)) {
        throw new Error(`Could not list consumers (HTTP ${listed.status}): ${JSON.stringify(listed.body)}`);
    }

    const existing = listed.body.find((consumer) => consumer.name === CONSUMER_NAME);

    if (existing) {
        console.log(`[Publisher] Using consumer "${CONSUMER_NAME}" (id ${existing.id})`);
        return existing.id;
    }

    const created = await apiRequest('/consumers', {
        method: 'POST',
        body: { name: CONSUMER_NAME }
    });

    if (created.status !== 201) {
        throw new Error(`Could not create consumer "${CONSUMER_NAME}" (HTTP ${created.status}): ${JSON.stringify(created.body)}`);
    }

    console.log(`[Publisher] Created consumer "${CONSUMER_NAME}" (id ${created.body.id})`);

    return created.body.id;
}

/**
 * Publishes a single event.
 *
 * @param {number} consumerId - Consumer to publish for.
 * @param {number} sequence - Counter used in the payload.
 * @returns {Promise<number|null>} The created event ID, or null when the publish failed.
 */
export async function publishEvent(consumerId, sequence) {
    const { status, body } = await apiRequest('/events', {
        method: 'POST',
        body: buildEventBody(consumerId, sequence)
    });

    if (status !== 201) {
        console.error(`[Publisher] Publish #${sequence} failed (HTTP ${status}):`, body);
        return null;
    }

    console.log(`[Publisher] Published event #${sequence} -> event_id ${body.event_id}`);

    return body.event_id;
}

/**
 * Logs how the deliveries for an event ended up, so the example shows the
 * full round trip instead of only the publish call.
 *
 * @param {number} eventId - Event to inspect.
 */
export async function logDeliverySummary(eventId) {
    const { status, body } = await apiRequest(`/events/${eventId}`);

    if (status !== 200) {
        console.error(`[Publisher] Could not read event ${eventId} (HTTP ${status}):`, body);
        return;
    }

    const { total, pending, success, failed } = body.summary;

    console.log(
        `[Publisher] Event ${eventId} deliveries -> total: ${total}, success: ${success}, pending: ${pending}, failed: ${failed}`
    );
}

/**
 * Runs the publish loop until the configured number of events is reached,
 * or until the process receives a shutdown signal.
 */
export async function main() {
    console.log('[Publisher] Starting automated publisher with settings:', {
        apiUrl: API_URL,
        consumerName: CONSUMER_NAME,
        eventType: EVENT_TYPE,
        intervalMs: INTERVAL_MS,
        eventCount: EVENT_COUNT === 0 ? 'unlimited' : EVENT_COUNT
    });

    await waitForApi();

    const consumerId = await resolveConsumerId();

    let sequence = 0;

    while (isRunning && (EVENT_COUNT === 0 || sequence < EVENT_COUNT)) {
        sequence += 1;

        try {
            const eventId = await publishEvent(consumerId, sequence);

            if (eventId !== null) {
                await delay(SUMMARY_DELAY_MS);
                await logDeliverySummary(eventId);
            }
        } catch (error) {
            // A publish failure must not kill the loop; the API or worker may
            // simply be restarting.
            console.error(`[Publisher] Publish #${sequence} threw:`, error.message);
        }

        const isLast = EVENT_COUNT !== 0 && sequence >= EVENT_COUNT;

        if (!isLast && isRunning) {
            const exponentialInterval = Math.min(
                 INTERVAL_MS * (2 ** (sequence - 1)),
                 MAX_INTERVAL_MS
         );

          await delay(Math.max(exponentialInterval - SUMMARY_DELAY_MS, 0));
        }
    }

    console.log(`[Publisher] Finished after ${sequence} event(s).`);
}

/**
 * Stops the publish loop on the next iteration.
 */
function shutdown() {
    console.log('[Publisher] Shutting down...');
    isRunning = false;
}

const isExecutedDirectly =
    process.argv[1] !== undefined &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isExecutedDirectly) {
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    main().catch((error) => {
        console.error('[Publisher] Fatal error:', error.message);
        process.exit(1);
    });
}
