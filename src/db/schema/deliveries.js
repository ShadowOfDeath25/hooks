import {index, pgTable} from "drizzle-orm/pg-core";
import {events} from './events.js';

export const deliveries = pgTable("deliveries", (t) => ({
    id: t.serial().primaryKey(),
    status: t.text().notNull(),
    eventId: t.integer("event_id").references(() => events.id),
    createdAt: t.timestamp("created_at").notNull().defaultNow(),
}), (table) => [
    index("event_id_fk_idx").on(table.eventId)
])