import {pgTable, index} from "drizzle-orm/pg-core";
import {deliveries} from "./deliveries.js";

export const attempts = pgTable("attempts", (t) => ({
    id: t.serial().primaryKey(),
    deliveryId: t.integer("delivery_id").references(() => deliveries.id),
    duration: t.integer(),
    statusCode: t.integer("status_code"),
    retrialNumber: t.integer("retrial_number").notNull(),
    createdAt: t.timestamp("created_at").notNull().defaultNow(),
}), (table) => [
    index("delivery_id_fk_idx").on(table.deliveryId)
])