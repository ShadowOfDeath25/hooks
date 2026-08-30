import {pgTable, index, check} from "drizzle-orm/pg-core";
import {consumers} from './consumers.js'
import {sql} from "drizzle-orm";

export const events = pgTable("events", (t) => ({
    id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
    type: t.varchar({length: 255}).notNull(),
    payload: t.jsonb().notNull(),
    consumerId: t.integer("consumer_id").references(() => consumers.id),
    createdAt: t.timestamp("created_at").notNull().defaultNow(),
}), (table) => [
    index("events_consumer_id_fk_idx").on(table.consumerId),
    check('events_payload_size_check', sql`pg_column_size(${table.payload})<= 1048576`)
])