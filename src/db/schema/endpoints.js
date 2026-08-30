import {index,check, pgTable} from "drizzle-orm/pg-core";
import {consumers} from './consumers.js';
import {sql} from 'drizzle-orm'



export const endpoints = pgTable("endpoints", (t) => ({
    id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
    label: t.varchar({length: 255}).notNull(),
    url: t.varchar({length: 255}).notNull(),
    consumerId: t.integer("consumer_id").references(() => consumers.id),
    signingKey: t.varchar("signing_key", {length: 68}).notNull(),
    createdAt: t.timestamp("created_at").notNull().defaultNow(),
}), (table) => [
    index("endpoints_consumer_id_fk_idx").on(table.consumerId),
    check(
        'endpoints_signing_key_format_check',
        sql`${table.signingKey} ~* '^_hs_'`
    )
])