import {index, uniqueIndex, check, pgTable, bytea} from "drizzle-orm/pg-core";
import {consumers} from './consumers.js';
import {sql} from 'drizzle-orm'

const URL_REGEX = String.raw`^https?:\/\/(?:localhost|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)|\[[0-9a-fA-F:]+\]|(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63})(?::(?:6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3}))?(?:[\/?#][^\s]*)?$`;

export const endpoints = pgTable("endpoints", (t) => ({
    id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
    label: t.varchar({length: 255}).notNull(),
    url: t.varchar({length: 255}).notNull().unique(),
    isActive: t.boolean("is_active").notNull().default(true),
    deletedAt: t.timestamp("deleted_at"),
    consumerId: t.integer("consumer_id").references(() => consumers.id),
    signingKey: bytea("signing_key").notNull(),

    createdAt: t.timestamp("created_at").notNull().defaultNow(),
    updatedAt: t.timestamp("updated_at"),
    deletedAt: t.timestamp("deleted_at"),
}), (table) => [
    index("endpoints_consumer_id_fk_idx").on(table.consumerId),
    check(
        'endpoints_url_format_check',
        sql`${table.url}
        ~
        ${URL_REGEX}`
    )
])