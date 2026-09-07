import {pgTable} from "drizzle-orm/pg-core";

export const consumers = pgTable("consumers", (t) => ({
    id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
    name: t.varchar({length:255}).notNull(),
    deletedAt: t.timestamp("deleted_at"),
    createdAt: t.timestamp("created_at").notNull().defaultNow(),
}))