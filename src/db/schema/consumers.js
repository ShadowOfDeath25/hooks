import {pgTable} from "drizzle-orm/pg-core";

export const consumers = pgTable("consumers", (t) => ({
    id: t.serial().primaryKey(),
    name: t.text().notNull(),
    createdAt: t.timestamp("created_at").notNull().defaultNow(),
}))