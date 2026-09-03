import {index, check, pgTable, bytea} from "drizzle-orm/pg-core";
import {consumers} from './consumers.js';
import {sql} from 'drizzle-orm'

const URL_REGEX = String.raw`^https?://(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,255}\.[a-zA-Z0-9()]{1,6}([-a-zA-Z0-9()@:%_+.~#?&/=]*)$`;

export const endpoints = pgTable("endpoints", (t) => ({
    id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
    label: t.varchar({length: 255}).notNull(),
    url: t.varchar({length: 255}).notNull().unique(),
    isActive: t.boolean("is_active").notNull().default(true),
    consumerId: t.integer("consumer_id").references(() => consumers.id),
    signingKey: bytea("signing_key").notNull(),
    createdAt: t.timestamp("created_at").notNull().defaultNow(),
    updatedAt: t.timestamp("updated_at"),
}), (table) => [
    index("endpoints_consumer_id_fk_idx").on(table.consumerId),
    check(
        'endpoints_url_format_check',
        sql`${table.url}
        ~
        ${URL_REGEX}`
    )
])