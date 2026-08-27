import {pgTable} from "drizzle-orm/pg-core";

export const api_keys = pgTable("api_keys", (t) => ({
    id: t.serial().primaryKey(),
    label: t.text().notNull(),
    hash: t.text().notNull(),
    createdAt: t.timestamp("created_at").notNull().defaultNow(),
}))