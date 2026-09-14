import {pgTable, pgView} from "drizzle-orm/pg-core";
import {isNull} from "drizzle-orm";

export const consumers = pgTable("consumers", (t) => ({
    id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
    name: t.varchar({length:255}).notNull(),
    deletedAt: t.timestamp("deleted_at"),
    createdAt: t.timestamp("created_at").notNull().defaultNow(),
}))

export const activeConsumers = pgView("active_consumers").as((queryBuilder) =>
    queryBuilder
        .select()
        .from(consumers)
        .where(isNull(consumers.deletedAt))
);