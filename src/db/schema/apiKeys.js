import {pgTable} from "drizzle-orm/pg-core";

export const apiKeys = pgTable("api_keys", (t) => ({
    id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
    label: t.varchar({length: 255}).notNull(),
    hash: t.char({length: 64}).notNull(),
    createdAt: t.timestamp("created_at").notNull().defaultNow(),
}))