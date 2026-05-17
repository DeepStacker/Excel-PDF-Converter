import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shareTokensTable = pgTable("share_tokens", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("share_tokens_job_id_idx").on(table.jobId),
  index("share_tokens_expires_at_idx").on(table.expiresAt),
]);

export const insertShareTokenSchema = createInsertSchema(shareTokensTable).omit({
  id: true,
  createdAt: true,
});

export type InsertShareToken = z.infer<typeof insertShareTokenSchema>;
export type ShareToken = typeof shareTokensTable.$inferSelect;
