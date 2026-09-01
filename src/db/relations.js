import {defineRelations} from "drizzle-orm";
import {consumers} from "./schema/consumers.js";
import {endpoints} from "./schema/endpoints.js";
import {events} from "./schema/events.js";
import {deliveries} from "./schema/deliveries.js";
import {attempts} from "./schema/attempts.js";
import {apiKeys} from "./schema/apiKeys.js";

const schema = {consumers, endpoints, events, deliveries, attempts, api_keys: apiKeys};

export const relations = defineRelations(schema, (r) => ({
    consumers: {
        endpoints: r.many.endpoints(),
        events: r.many.events(),
    },
    endpoints: {
        consumer: r.one.consumers({
            from: r.endpoints.consumerId,
            to: r.consumers.id,
        }),
        deliveries: r.many.deliveries({
            from: r.endpoints.id,
            to:r.deliveries.endpointId
        })
    },
    events: {
        consumer: r.one.consumers({
            from: r.events.consumerId,
            to: r.consumers.id,
        }),
        deliveries: r.many.deliveries(),
    },
    deliveries: {
        event: r.one.events({
            from: r.deliveries.eventId,
            to: r.events.id,
        }),
        attempts: r.many.attempts(),
        endpoints: r.one.endpoints({
            from: r.deliveries.endpointId,
            to: r.endpoints.id
        })
    },
    attempts: {
        delivery: r.one.deliveries({
            from: r.attempts.deliveryId,
            to: r.deliveries.id,
        }),
    },
}));
