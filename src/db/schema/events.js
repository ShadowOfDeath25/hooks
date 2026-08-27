import {pgTable, index} from "drizzle-orm/pg-core";
import {consumers} from './consumers.js'

export const events = pgTable("events", (t) => ({
    id: t.serial().primaryKey(),
    type: t.text().notNull(),
    payload: t.jsonb().notNull(),
    consumerId: t.integer("consumer_id").references(() => consumers.id),
    createdAt: t.timestamp("created_at").notNull().defaultNow(),
}), (table) => [
    index("consumer_id_fk_idx").on(table.consumerId)
])