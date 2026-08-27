import {index, pgTable} from "drizzle-orm/pg-core";
import {consumers} from './consumers.js';

export const endpoints = pgTable("endpoints", (t) => ({
    id: t.serial().primaryKey(),
    label: t.text().notNull(),
    url: t.text().notNull(),
    consumerId: t.integer("consumer_id").references(() => consumers.id),
    signing_key: t.text().notNull(),
    created_at: t.timestamp("created_at").notNull().defaultNow(),
}), (table) => [
    index("consumer_id_fk_idx").on(table.consumerId)
])