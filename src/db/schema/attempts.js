import {pgTable, index} from "drizzle-orm/pg-core";
import {deliveries} from "./deliveries.js";

export const attempts = pgTable("attempts", (t) => ({
    id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
    deliveryId: t.integer("delivery_id").references(() => deliveries.id).notNull(),
    duration: t.integer().notNull(),
    statusCode: t.integer("status_code").default(0),
    retrialNumber: t.integer("retrial_number").notNull(),
    createdAt: t.timestamp("created_at").notNull().defaultNow(),
}), (table) => [
    index("attempts_delivery_id_fk_idx").on(table.deliveryId),
])