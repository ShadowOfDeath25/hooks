import {index, pgTable} from "drizzle-orm/pg-core";
import {events} from './events.js';
import {endpoints} from "./endpoints.js";

export const deliveries = pgTable("deliveries", (t) => ({
    id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
    status: t.varchar({
        length: 20,
        enum: ["pending", "failed", "success"]
    }),
    eventId: t.integer("event_id").references(() => events.id),
    endpointId: t.integer("endpoint_id").references(() => endpoints.id),
    createdAt: t.timestamp("created_at").notNull().defaultNow(),
}), (table) => [
    index("deliveries_event_id_fk_idx").on(table.eventId),

])