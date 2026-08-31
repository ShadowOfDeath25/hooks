import {index, check, pgTable} from "drizzle-orm/pg-core";
import {consumers} from './consumers.js';
import {sql} from 'drizzle-orm'

const URL_REGEX = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)$/g;

export const endpoints = pgTable("endpoints", (t) => ({
    id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
    label: t.varchar({length: 255}).notNull(),
    url: t.varchar({length: 255}).notNull(),
    isActive: t.boolean("isActive").notNull().default(true),
    consumerId: t.integer("consumer_id").references(() => consumers.id),
    signingKey: t.bytea().notNull(),
    createdAt: t.timestamp("created_at").notNull().defaultNow(),
}), (table) => [
    index("endpoints_consumer_id_fk_idx").on(table.consumerId),
    check(
        'endpoints_url_format_check',
        sql`${table.url}
        ~
        ${URL_REGEX.source}`
    )
])